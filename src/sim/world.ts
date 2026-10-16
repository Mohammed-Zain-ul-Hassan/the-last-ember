// Pure 2D game simulation on the side-view plane (x right, y up, feet at y=0).
// No three.js here: render reads this state, the demo bot drives it, vitest tests it.
import { CFG, type MoveSpec } from '../config';
import { CHAPTERS, type Chapter, type Wall } from '../data/chapters';
import { LEVELS, type Level, type Platform } from '../data/levels';
import { lightAt, shadowIntervals, type Interval, type LightSrc } from './light';
import { Rng } from './rng';

export interface Input {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jump: boolean; // pressed this step
  down?: boolean; // held: with jump, drop through a platform
  attack: boolean;
  heavy: boolean;
  dash: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, jumpHeld: false, jump: false, attack: false, heavy: false, dash: false };

export type KnightState = 'idle' | 'run' | 'air' | 'attack' | 'heavy' | 'dash' | 'hurt' | 'dead';
/** What the current attack is. Light/air/lunge/dashStrike run in state 'attack'; heavy/plunge in state 'heavy'. */
export type Move = 'light' | 'heavy' | 'air' | 'plunge' | 'dashStrike' | 'lunge';

export interface Knight {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  hp: number;
  state: KnightState;
  stateT: number;
  combo: number; // 0..2 while attacking
  move: Move;
  swingId: number;
  sinceDash: number;
  airHits: number;
  slamT: number; // plunge: time since landing (-1 = still diving)
  ember: boolean; // carrying an ember to the hearth
  dropT: number; // > 0: falling through platforms
  bufferedAttack: boolean;
  coyote: number;
  jumpBuffer: number;
  dashCd: number;
  airDash: boolean;
  iframes: number;
  hitThisSwing: Set<number>;
}

export type ShadeState = 'rise' | 'walk' | 'windup' | 'strike' | 'stagger' | 'dead';

export interface Shade {
  id: number;
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  speed: number;
  facing: 1 | -1;
  state: ShadeState;
  stateT: number;
  cd: number;
  target: 'hearth' | 'knight';
  light: number; // light level it stands in, for render smoke
  deadT: number;
  big: boolean;
}

export type GameEvent =
  | { type: 'swing'; x: number; y: number; facing: number; combo: number; heavy: boolean; move: Move }
  | { type: 'hit'; x: number; y: number; dmg: number; heavy: boolean; facing: number; id: number; move: Move }
  | { type: 'slam'; x: number; y: number; r: number; fire: boolean }
  | { type: 'move'; name: string; x: number; y: number; count: number }
  | { type: 'kill'; x: number; y: number; burned: boolean; big: boolean; id: number }
  | { type: 'spawn'; x: number }
  | { type: 'jump' | 'land' | 'dash'; x: number; y: number }
  | { type: 'knightHurt'; x: number; y: number; hp: number }
  | { type: 'hearthHurt'; hp: number }
  | { type: 'shadeWindup'; x: number; id: number }
  | { type: 'fireburst'; x: number; y: number; facing: number }
  | { type: 'bigSpawn'; x: number }
  | { type: 'shrine'; x: number; y: number }
  | { type: 'ember'; x: number; y: number }
  | { type: 'feed'; x: number; hp: number }
  | { type: 'checkpoint'; x: number; index: number }
  | { type: 'gate'; x: number; open: boolean }
  | { type: 'cleared' }
  | { type: 'lost'; reason: 'hearth' | 'knight' };

export type Status = 'playing' | 'cleared' | 'lost';

export interface Shrine {
  x: number;
  y: number;
  active: boolean;
}

export interface WorldOpts {
  startX?: number; // rise again at a checkpoint
  startY?: number; // e.g. standing on the gatehouse at dawn
  checkpointsLit?: number;
}

export class World {
  chapterIndex: number;
  chapter: Chapter;
  level: Level;
  walls: readonly Wall[];
  platforms: readonly Platform[];
  minX: number;
  maxX: number;
  hearthX: number;
  shrines: Shrine[];
  checkpointsLit = 0;
  bossDone = false;
  rng: Rng;
  time = 0;
  frame = 0;
  hitstop = 0;
  status: Status = 'playing';
  loseReason: 'hearth' | 'knight' | null = null;
  knight: Knight;
  shades: Shade[] = [];
  hearthHp: number = CFG.hearth.maxHp;
  light: LightSrc;
  shadows: Interval[] = [];
  spawnT = 1.5;
  kills = 0;
  bigSpawned = false;
  private shrinesLit = 0;
  spawning = true; // false for scripted scenes (dawn choice)
  endless = false; // true: the hour never ends on its own
  events: GameEvent[] = [];
  private nextId = 1;

  constructor(chapterIndex = 0, seed = 1, opts: WorldOpts = {}) {
    this.chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex));
    this.chapter = CHAPTERS[this.chapterIndex];
    this.rng = new Rng(seed + this.chapterIndex * 7919);
    this.level = LEVELS[this.chapter.level] ?? LEVELS.grounds;
    this.walls = this.level.walls;
    this.platforms = this.level.platforms;
    [this.minX, this.maxX] = this.level.bounds;
    this.hearthX = this.level.hearthX ?? 0;
    this.shrines = this.level.shrines.map((p) => ({ ...p, active: false }));
    this.checkpointsLit = opts.checkpointsLit ?? 0;
    this.bossDone = this.level.bossAt === undefined;
    this.knight = {
      x: opts.startX ?? this.level.start, y: opts.startY ?? 0, vx: 0, vy: 0, facing: 1, onGround: true, hp: CFG.knight.maxHp,
      state: 'idle', stateT: 0, combo: 0, move: 'light', swingId: 0, sinceDash: 9, airHits: 0, slamT: -1, ember: false, dropT: 0, bufferedAttack: false,
      coyote: 0, jumpBuffer: 0, dashCd: 0, airDash: true, iframes: 0, hitThisSwing: new Set(),
    };
    this.light = { x: this.hearthX, y: this.chapter.lightHeight, radius: this.chapter.lightRadius };
    this.updateLight();
  }

  /** Is this a road level (the hour ends at the far gate, not on the clock)? */
  get road(): boolean {
    return this.level.end !== undefined;
  }

  /** Fraction of the hour done, 0..1: time on the grounds, distance on the road. */
  get progress(): number {
    if (this.road) return Math.max(0, Math.min(1, (this.knight.x - this.level.start) / ((this.level.end as number) - this.level.start)));
    return Math.min(1, this.time / this.chapter.duration);
  }

  get torch(): boolean {
    return this.chapter.phase !== 'hearth';
  }

  updateLight(): void {
    if (this.torch) {
      // the fire is in his hand: the light, and every shadow, moves with him
      const k = this.knight;
      this.light.x = k.x + k.facing * 0.35;
      this.light.y = this.chapter.lightHeight + k.y;
      this.light.radius = this.chapter.lightRadius;
      this.shadows = shadowIntervals(this.light, this.walls, this.minX, this.maxX);
      return;
    }
    const hpFrac = this.hearthHp / CFG.hearth.maxHp;
    // A wounded hearth burns lower and smaller: shadows lengthen.
    this.light.y = this.chapter.lightHeight * (0.75 + 0.25 * hpFrac);
    this.light.radius = this.chapter.lightRadius * (0.6 + 0.4 * hpFrac);
    this.shadows = shadowIntervals(this.light, this.walls, this.minX, this.maxX);
  }

  lightAt(x: number): number {
    return lightAt(x, this.light, this.shadows);
  }

  step(input: Input): void {
    this.events.length = 0;
    if (this.status !== 'playing') return;
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    const dt = CFG.dt;
    this.frame++;
    this.time += dt;
    this.updateLight();
    this.stepKnight(input, dt);
    this.stepJourney();
    this.stepSpawner(dt);
    for (const s of this.shades) this.stepShade(s, dt);
    this.shades = this.shades.filter((s) => s.state !== 'dead' || s.deadT < 1.2);
    for (const s of this.shades) if (s.state === 'dead') s.deadT += dt;

    if (!this.torch && this.hearthHp <= 0) this.lose('hearth');
    else if (this.knight.hp <= 0 && this.knight.state === 'dead' && this.knight.stateT > 1.1) this.lose('knight');
    else if (!this.endless && (this.road ? this.knight.x >= (this.level.end as number) - 0.5 && this.bossDone : this.time >= this.chapter.duration)) {
      // The hour turns: every remaining shade dissolves.
      for (const s of this.shades) if (s.state !== 'dead') this.killShade(s, true);
      this.status = 'cleared';
      this.events.push({ type: 'cleared' });
    }
  }

  private lose(reason: 'hearth' | 'knight'): void {
    this.status = 'lost';
    this.loseReason = reason;
    this.events.push({ type: 'lost', reason });
  }

  // ---------------------------------------------------------------- knight
  private setKState(state: KnightState): void {
    this.knight.state = state;
    this.knight.stateT = 0;
  }

  private stepKnight(input: Input, dt: number): void {
    let inp = input;
    const k = this.knight;
    const K = CFG.knight;
    k.stateT += dt;
    k.dashCd = Math.max(0, k.dashCd - dt);
    k.iframes = Math.max(0, k.iframes - dt);
    k.coyote = k.onGround ? K.coyote : Math.max(0, k.coyote - dt);
    k.jumpBuffer = inp.jump ? K.jumpBuffer : Math.max(0, k.jumpBuffer - dt);

    if (k.state === 'dead') {
      k.vx *= 0.9;
      this.integrateKnight(dt, true);
      return;
    }

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const busy = k.state === 'attack' || k.state === 'heavy' || k.state === 'dash' || k.state === 'hurt';

    // --- dash (can cancel an attack's recovery)
    if (inp.dash && k.dashCd <= 0 && (k.onGround || k.airDash) && k.state !== 'hurt' && k.state !== 'dash') {
      if (dir !== 0) k.facing = dir as 1 | -1;
      this.setKState('dash');
      k.vx = k.facing * K.dashSpeed;
      k.vy = 0;
      k.dashCd = K.dashCd;
      k.iframes = Math.max(k.iframes, K.dashTime + 0.05);
      if (!k.onGround) k.airDash = false;
      this.events.push({ type: 'dash', x: k.x, y: k.y });
    }

    // --- attacks: the same two buttons become different moves depending on what he is doing
    k.sinceDash += dt;
    if ((inp.attack || inp.heavy) && (k.state === 'attack' || k.state === 'heavy')) k.bufferedAttack = true;
    const canAttack = !busy || (k.state === 'dash' && inp.attack);
    // an aerial can be cancelled into a plunge once its blow has landed
    const airSp = CFG.air;
    if (inp.heavy && k.state === 'attack' && k.move === 'air' && k.stateT >= airSp.windup + airSp.active && !k.onGround && k.y > 0.8) {
      this.startMove('plunge');
      inp = { ...inp, heavy: false };
    }
    if (canAttack && inp.attack && (k.state === 'dash' || k.sinceDash < CFG.dashStrikeWindow)) this.startMove('dashStrike');
    else if (canAttack && inp.attack) {
      if (!k.onGround) {
        if (k.airHits < CFG.airChain) this.startMove('air');
      } else if (dir !== 0 && Math.abs(k.vx) > K.speed * 0.8) this.startMove('lunge');
      else this.startMove('light', 0);
    } else if (!busy && inp.heavy) this.startMove(!k.onGround && k.y > 0.8 ? 'plunge' : 'heavy');

    if (k.state === 'attack' || k.state === 'heavy') this.stepSwing(dt);
    else if (k.state === 'dash') {
      k.vy = 0;
      if (k.stateT >= K.dashTime) {
        k.sinceDash = 0;
        k.vx = k.facing * K.speed;
        this.setKState(k.onGround ? 'run' : 'air');
      }
    } else if (k.state === 'hurt') {
      k.vx *= 0.9;
      if (k.stateT >= K.hurtTime) this.setKState(k.onGround ? 'idle' : 'air');
    } else {
      // --- free movement
      const accel = k.onGround ? K.accel : K.airAccel;
      if (dir !== 0) {
        k.facing = dir as 1 | -1;
        k.vx += dir * accel * dt;
        const vmax = K.speed * (k.ember ? 0.82 : 1);
        if (Math.abs(k.vx) > vmax) k.vx = Math.sign(k.vx) * vmax;
      } else if (k.onGround) {
        const f = K.friction * dt;
        k.vx = Math.abs(k.vx) <= f ? 0 : k.vx - Math.sign(k.vx) * f;
      }
      if (inp.down && inp.jump && k.onGround && k.y > 0.1 && this.platforms.some((p) => Math.abs(k.y - p.y) < 0.02 && k.x > p.x0 && k.x < p.x1)) {
        k.dropT = 0.3; // drop through the ledge
        k.onGround = false;
        k.jumpBuffer = 0;
        k.y -= 0.06;
      } else if (k.jumpBuffer > 0 && k.coyote > 0) {
        k.vy = K.jumpV;
        k.onGround = false;
        k.coyote = 0;
        k.jumpBuffer = 0;
        this.events.push({ type: 'jump', x: k.x, y: k.y });
      }
      if (!inp.jumpHeld && k.vy > 0) k.vy *= 1 - (1 - K.jumpCut) * Math.min(1, dt * 20);
      const next: KnightState = !k.onGround ? 'air' : Math.abs(k.vx) > 0.3 ? 'run' : 'idle';
      if (next !== k.state) this.setKState(next);
    }

    // dash strikes glide flat; air strikes hang for a moment
    const glide = k.state === 'dash' || (k.move === 'dashStrike' && k.state === 'attack' && k.stateT < CFG.dashStrike.windup + CFG.dashStrike.active);
    this.integrateKnight(dt, !glide);
    if (k.onGround) k.airHits = 0;
  }

  private integrateKnight(dt: number, gravity: boolean): void {
    const k = this.knight;
    const K = CFG.knight;
    if (gravity) k.vy += CFG.gravity * dt;
    const wasGround = k.onGround;

    // x, then resolve against walls
    k.x += k.vx * dt;
    const hw = K.w / 2;
    for (const w of this.walls) {
      const l = w.x - w.w / 2;
      const r = w.x + w.w / 2;
      if (k.y < w.h - 0.05 && k.x + hw > l && k.x - hw < r) {
        if (k.x < w.x) k.x = l - hw;
        else k.x = r + hw;
        if (k.state !== 'dash') k.vx = 0;
      }
    }
    // the boss gate: the far doors stay shut until the Hollow Marshal falls
    const gate = !this.bossDone && this.level.bossAt !== undefined ? (this.level.end as number) - 3 : this.maxX;
    k.x = Math.max(this.minX + hw, Math.min(Math.min(this.maxX, gate) - hw, k.x));

    // y: ground and wall tops
    const prevY = k.y;
    k.y += k.vy * dt;
    let floor = 0;
    for (const w of this.walls) {
      const l = w.x - w.w / 2;
      const r = w.x + w.w / 2;
      if (k.x + hw > l && k.x - hw < r && prevY >= w.h - 0.05) floor = Math.max(floor, w.h);
    }
    // one-way platforms: land on them from above, unless dropping through
    k.dropT = Math.max(0, k.dropT - dt);
    if (k.dropT <= 0 && k.vy <= 0) {
      for (const p of this.platforms) {
        if (k.x + hw * 0.4 > p.x0 && k.x - hw * 0.4 < p.x1 && prevY >= p.y - 0.05) floor = Math.max(floor, p.y);
      }
    }
    if (k.y <= floor) {
      k.y = floor;
      if (k.vy < 0) k.vy = 0;
      k.onGround = true;
      k.airDash = true;
    } else k.onGround = false;
    if (!wasGround && k.onGround && k.state !== 'dead') this.events.push({ type: 'land', x: k.x, y: k.y });
  }

  private spec(): MoveSpec {
    const k = this.knight;
    return k.move === 'light' ? CFG.combo[k.combo] : CFG[k.move];
  }

  private startMove(move: Move, combo = 0): void {
    const k = this.knight;
    const heavy = move === 'heavy' || move === 'plunge';
    this.setKState(heavy ? 'heavy' : 'attack');
    k.move = move;
    k.combo = combo;
    k.swingId++;
    k.bufferedAttack = false;
    k.hitThisSwing.clear();
    k.slamT = -1;
    if (move === 'air') k.airHits++;
    if (move === 'dashStrike') k.sinceDash = 9;
    this.events.push({ type: 'swing', x: k.x, y: k.y, facing: k.facing, combo, heavy, move });
  }

  /** Torch phase: the heavy strike throws a wave of fire. */
  private fireBurst(): void {
    const k = this.knight;
    this.events.push({ type: 'fireburst', x: k.x + k.facing * 1.2, y: k.y + 1.2, facing: k.facing });
    for (const s of this.shades) {
      if (s.state === 'dead') continue;
      const d = (s.x - k.x) * k.facing;
      if (d < -0.5 || d > 4.2 || Math.abs(s.y - k.y) > 2) continue;
      s.hp -= 2;
      s.vx = k.facing * (s.big ? 3 : 9);
      this.events.push({ type: 'hit', x: s.x, y: s.y + 1, dmg: 2, heavy: true, facing: k.facing, id: s.id, move: 'heavy' });
      if (s.hp <= 0) this.killShade(s, true);
      else {
        s.state = 'stagger';
        s.stateT = 0;
      }
    }
  }

  private static readonly MOVE_NAMES: Partial<Record<Move, string>> = {
    heavy: 'Cleave', plunge: 'Shadow Plunge', dashStrike: 'Piercing Step', lunge: 'Lunge', air: 'Aerial',
  };

  private stepSwing(dt: number): void {
    const k = this.knight;
    const sp = this.spec();
    const t = k.stateT;
    if (k.move === 'plunge') return this.stepPlunge(dt, sp);
    if (k.onGround && k.move !== 'dashStrike') k.vx *= Math.max(0, 1 - 12 * dt);
    // first active frame: commit forward
    if (t - dt < sp.windup && t >= sp.windup) {
      k.vx = k.facing * sp.lunge;
      if (k.move === 'heavy' && this.torch) this.fireBurst();
    }
    if (k.move === 'air') {
      k.vy = Math.max(k.vy, t < sp.windup + sp.active ? -1.5 : -6); // hang in the air while striking
      if (k.onGround && t > sp.windup) return this.setKState('idle');
    }
    if (k.move === 'dashStrike' && t >= sp.windup && t < sp.windup + sp.active) {
      k.vx = k.facing * sp.lunge;
      k.vy = 0;
      k.iframes = Math.max(k.iframes, 0.05);
    }
    if (t >= sp.windup && t < sp.windup + sp.active) this.applyHits(sp, k.x);
    // multi-hit callout once the active frames end
    if (t - dt < sp.windup + sp.active && t >= sp.windup + sp.active) this.calloutMove();
    const done = t >= sp.windup + sp.active + sp.recover;
    const early = t >= sp.windup + sp.active + sp.recover * 0.45;
    if (k.bufferedAttack && early) {
      if (k.move === 'light' && k.combo < CFG.combo.length - 1) return this.startMove('light', k.combo + 1);
      if (k.move === 'air' && !k.onGround && k.airHits < CFG.airChain) return this.startMove('air');
    }
    if (done) this.setKState(k.onGround ? 'idle' : 'air');
  }

  /** Heavy in the air: hang, dive, and slam the ground in a ring. */
  private stepPlunge(dt: number, sp: MoveSpec): void {
    const k = this.knight;
    if (k.slamT < 0) {
      if (k.stateT < sp.windup) {
        k.vy = Math.max(k.vy, 1.5);
        k.vx *= 0.85;
      } else {
        k.vy = -28;
        k.vx = k.facing * 3;
        k.iframes = Math.max(k.iframes, 0.08);
      }
      if (k.onGround && k.stateT > sp.windup * 0.5) {
        k.slamT = 0;
        k.vx = 0;
        this.applyHits(sp, k.x);
        this.events.push({ type: 'slam', x: k.x, y: k.y, r: sp.reach, fire: this.torch });
        this.hitstop = Math.max(this.hitstop, CFG.hitstop.heavy);
        this.calloutMove(true);
      }
      return;
    }
    k.slamT += dt;
    k.vx *= 0.8;
    if (k.slamT >= sp.recover) this.setKState('idle');
  }

  private calloutMove(always = false): void {
    const k = this.knight;
    const name = World.MOVE_NAMES[k.move];
    const n = k.hitThisSwing.size;
    if (!name || n === 0) return;
    if (k.move === 'air' && k.airHits < CFG.airChain) return; // name a full aerial chain only
    if (k.move === 'heavy' && n < 2 && !always) return; // a cleave is worth naming when it hits a crowd
    this.events.push({ type: 'move', name, x: k.x, y: k.y + 2.6, count: n });
  }

  private applyHits(sp: MoveSpec, cx: number): void {
    const k = this.knight;
    const heavy = k.state === 'heavy';
    // single-target moves only ever connect with one shade per swing
    if (!sp.multi && k.hitThisSwing.size > 0) return;
    const x0 = k.facing > 0 ? cx - sp.back : cx - sp.reach;
    const x1 = k.facing > 0 ? cx + sp.reach : cx + sp.back;
    const hw = CFG.shade.w / 2;
    const inRange = this.shades.filter(
      (s) => s.state !== 'dead' && !k.hitThisSwing.has(s.id) && s.x + hw >= x0 && s.x - hw <= x1 && !(k.y > s.y + CFG.shade.h * (s.big ? 1.65 : 1) || k.y + CFG.knight.h < s.y),
    );
    if (!inRange.length) return;
    const targets = sp.multi ? inRange : [inRange.reduce((a, b) => (Math.abs(a.x - k.x) <= Math.abs(b.x - k.x) ? a : b))];
    for (const s of targets) {
      k.hitThisSwing.add(s.id);
      s.hp -= sp.dmg;
      const away = Math.sign(s.x - k.x) || k.facing;
      s.vx = away * sp.knock * (s.big ? 0.25 : 1);
      s.facing = (-away) as 1 | -1;
      this.events.push({ type: 'hit', x: s.x, y: s.y + 1, dmg: sp.dmg, heavy, facing: away, id: s.id, move: k.move });
      if (s.hp <= 0) {
        this.killShade(s, false);
        this.hitstop = Math.max(this.hitstop, heavy ? CFG.hitstop.heavy : CFG.hitstop.kill);
      } else {
        if (!s.big || heavy) {
          s.state = 'stagger';
          s.stateT = 0;
        }
        this.hitstop = Math.max(this.hitstop, heavy ? CFG.hitstop.heavy : CFG.hitstop.light);
      }
    }
  }

  private hurtKnight(fromX: number, dmg: number = CFG.shade.knightDmg): void {
    const k = this.knight;
    if (k.iframes > 0 || k.state === 'dead') return;
    k.hp -= dmg;
    k.iframes = CFG.knight.iframes;
    k.vx = Math.sign(k.x - fromX || 1) * CFG.knight.hurtKnock;
    k.vy = 5;
    k.onGround = false;
    this.events.push({ type: 'knightHurt', x: k.x, y: k.y, hp: k.hp });
    this.setKState(k.hp <= 0 ? 'dead' : 'hurt');
  }

  // ---------------------------------------------------------------- shades
  private stepSpawner(dt: number): void {
    if (!this.spawning || (!this.road && this.time >= this.chapter.duration - 2)) return;
    this.spawnT -= dt;
    const alive = this.shades.filter((s) => s.state !== 'dead').length;
    const bossAt = this.level.bossAt;
    if (bossAt !== undefined && !this.bigSpawned && this.knight.x >= bossAt) {
      // the Hollow Marshal rises in front of the far doors
      this.bigSpawned = true;
      const s = this.spawnShade(Math.min(this.maxX - 3, this.knight.x + 11), true);
      this.events.push({ type: 'bigSpawn', x: s.x });
      this.events.push({ type: 'gate', x: (this.level.end as number) - 3, open: false });
    }
    if (this.spawnT > 0 || alive >= this.chapter.maxShades) return;
    const [a, b] = this.chapter.spawnEvery;
    this.spawnT = a + (b - a) * this.progress;
    this.spawnShade(this.pickSpawnX());
  }

  /**
   * Shades can only rise where it is dark: a cast shadow, or beyond the fire's reach. They rise near the knight
   * (biased ahead of him on the road) and, on the grounds, near the hearth too, so it is never safe to leave it.
   */
  pickSpawnX(): number {
    const kx = this.knight.x;
    const nearHearth = !this.torch && this.rng.next() < 0.45;
    const cx = nearHearth ? this.hearthX : kx + (this.road ? 6 : 0);
    const lo = Math.max(this.minX + 1, cx - 22);
    const hi = Math.min(this.maxX - 1, cx + 22);
    const pockets = this.shadows
      .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as Interval)
      .filter(([a, b]) => b - a > 0.6);
    const tries: number[] = [];
    if (pockets.length && this.rng.next() < 0.65) {
      const [a, b] = pockets[Math.floor(this.rng.next() * pockets.length)];
      tries.push(this.rng.range(a + 0.2, b - 0.2));
    }
    // beyond the reach of the light, at the edge of what he can see
    for (let i = 0; i < 4; i++) {
      const side = this.road ? (this.rng.next() < 0.7 ? 1 : -1) : this.rng.next() < 0.5 ? -1 : 1;
      const base = nearHearth ? this.hearthX : kx;
      const d = (nearHearth ? this.light.radius : Math.max(4, this.torch ? this.light.radius : 6)) + this.rng.range(0.5, 6);
      tries.push(base + side * d);
    }
    for (const x0 of tries) {
      const x = Math.max(this.minX + 1, Math.min(this.maxX - 1, x0));
      if (Math.abs(x - kx) > 3 && this.lightAt(x) === 0) return x;
    }
    return Math.max(this.minX + 1, Math.min(this.maxX - 1, kx + (this.road ? 12 : -12)));
  }

  /** Embers, shrines, checkpoints, the boss gate. */
  private stepJourney(): void {
    const k = this.knight;
    // ember shrines light up during the hearth hours
    if (!this.torch && this.shrines.length) {
      const due = [0.08, 0.38, 0.68].filter((p) => this.progress >= p).length;
      const lit = this.shrinesLit;
      if (due > lit) {
        this.shrinesLit++;
        const idle = this.shrines.filter((s) => !s.active);
        if (idle.length) {
          // prefer the far side from the knight: the ember is a journey
          idle.sort((a, b) => Math.abs(b.x - k.x) - Math.abs(a.x - k.x));
          const pick = idle[Math.floor(this.rng.next() * Math.min(3, idle.length))];
          pick.active = true;
          this.events.push({ type: 'shrine', x: pick.x, y: pick.y });
        }
      }
      for (const s of this.shrines) {
        if (s.active && !k.ember && Math.abs(k.x - s.x) < 1.0 && Math.abs(k.y - s.y) < 1.0) {
          s.active = false;
          k.ember = true;
          this.events.push({ type: 'ember', x: s.x, y: s.y });
        }
      }
      if (k.ember && Math.abs(k.x - this.hearthX) < 2.4 && k.y < 1.6) {
        k.ember = false;
        this.hearthHp = Math.min(CFG.hearth.maxHp, this.hearthHp + CFG.hearth.emberHeal);
        this.events.push({ type: 'feed', x: this.hearthX, hp: this.hearthHp });
      }
    }
    // checkpoint braziers: the torch lights them as he passes
    const cps = this.level.checkpoints;
    while (this.checkpointsLit < cps.length && k.x >= cps[this.checkpointsLit]) {
      this.events.push({ type: 'checkpoint', x: cps[this.checkpointsLit], index: this.checkpointsLit });
      this.checkpointsLit++;
    }
    if (this.bigSpawned && !this.bossDone && !this.shades.some((s) => s.big && s.state !== 'dead')) {
      this.bossDone = true;
      this.events.push({ type: 'gate', x: (this.level.end as number) - 3, open: true });
    }
  }

  /** The x to rise again at after a fall (the last lit brazier, or the start). */
  get respawnX(): number {
    return this.checkpointsLit > 0 ? this.level.checkpoints[this.checkpointsLit - 1] : this.level.start;
  }

  spawnShade(x: number, big = false): Shade {
    const c = this.chapter;
    const hp = big ? c.shadeHp * 7 : c.shadeHp;
    const s: Shade = {
      id: this.nextId++, x, y: 0, vx: 0, hp, maxHp: hp,
      speed: c.shadeSpeed * (big ? 0.6 : this.rng.range(0.85, 1.15)), facing: x > this.light.x ? -1 : 1,
      state: 'rise', stateT: 0, cd: this.rng.range(0, 0.5), target: 'hearth', light: 0, deadT: 0, big,
    };
    this.shades.push(s);
    this.events.push({ type: 'spawn', x });
    return s;
  }

  private killShade(s: Shade, burned: boolean): void {
    if (s.state === 'dead') return;
    s.state = 'dead';
    s.stateT = 0;
    s.deadT = 0;
    this.kills++;
    this.events.push({ type: 'kill', x: s.x, y: s.y + 0.9, burned, big: s.big, id: s.id });
  }

  private stepShade(s: Shade, dt: number): void {
    if (s.state === 'dead') return;
    const S = CFG.shade;
    const k = this.knight;
    s.stateT += dt;
    s.cd = Math.max(0, s.cd - dt);
    s.light = this.lightAt(s.x);

    // light burns shades (not while still rising out of the dark)
    if (s.state !== 'rise' && s.light > 0) {
      s.hp -= S.lightDps * (this.torch ? 1.5 : 1) * (s.big ? 0.3 : 1) * s.light * dt;
      if (s.hp <= 0) return this.killShade(s, true);
    }

    s.x += s.vx * dt;
    s.vx *= Math.max(0, 1 - 6 * dt);
    s.x = Math.max(this.minX + 0.5, Math.min(this.maxX - 0.5, s.x));

    if (s.state === 'rise') {
      if (s.stateT >= S.riseTime) {
        s.state = 'walk';
        s.stateT = 0;
      }
      return;
    }
    if (s.state === 'stagger') {
      if (s.stateT >= S.staggerTime) {
        s.state = 'walk';
        s.stateT = 0;
      }
      return;
    }

    const kAlive = k.state !== 'dead';
    const toKnight = k.x - s.x;
    const knightNear = kAlive && Math.abs(toKnight) < S.aggroRange && Math.abs(k.y - s.y) < 3.5;
    s.target = knightNear || (this.torch && kAlive) ? 'knight' : 'hearth';
    const tx = s.target === 'knight' ? k.x : this.hearthX;
    const dist = Math.abs(tx - s.x);
    // shadows drift: they float up after him onto ledges and rooftops, and sink back to the ground
    const ty = s.target === 'knight' && Math.abs(toKnight) < 7 ? k.y : 0;
    if (s.state === 'walk' || s.state === 'windup') s.y += Math.sign(ty - s.y) * Math.min(Math.abs(ty - s.y), S.floatSpeed * dt);
    const reach = s.big ? 1.9 : 1;
    const range = s.target === 'knight' ? S.attackRange * reach : S.hearthRange + CFG.hearth.radius;

    if (s.state === 'walk') {
      s.facing = tx >= s.x ? 1 : -1;
      if (dist > range) {
        s.x += s.facing * s.speed * (1 - S.lightSlow * s.light) * dt;
      } else if (s.cd <= 0) {
        s.state = 'windup';
        s.stateT = 0;
        this.events.push({ type: 'shadeWindup', x: s.x, id: s.id });
      }
    } else if (s.state === 'windup') {
      if (s.stateT >= S.windup) {
        s.state = 'strike';
        s.stateT = 0;
        if (s.target === 'knight') {
          if (Math.abs(k.x - s.x) < S.attackRange * reach + 0.35 && Math.abs(k.y - s.y) < 1.6 * reach) this.hurtKnight(s.x, s.big ? 2 : 1);
        } else if (Math.abs(this.hearthX - s.x) <= range + 0.3) {
          this.hearthHp = Math.max(0, this.hearthHp - S.hearthDmg);
          this.events.push({ type: 'hearthHurt', hp: this.hearthHp });
        }
      }
    } else if (s.state === 'strike') {
      if (s.stateT >= S.strikeTime) {
        s.state = 'walk';
        s.stateT = 0;
        s.cd = S.attackCd;
      }
    }
  }
}
