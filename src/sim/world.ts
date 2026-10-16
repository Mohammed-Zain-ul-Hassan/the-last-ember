// Pure 2D game simulation on the side-view plane (x right, y up, feet at y=0).
// No three.js here: render reads this state, the demo bot drives it, vitest tests it.
import { CFG } from '../config';
import { CHAPTERS, WALLS, type Chapter, type Wall } from '../data/chapters';
import { lightAt, shadowIntervals, type Interval, type LightSrc } from './light';
import { Rng } from './rng';

export interface Input {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jump: boolean; // pressed this step
  attack: boolean;
  heavy: boolean;
  dash: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, jumpHeld: false, jump: false, attack: false, heavy: false, dash: false };

export type KnightState = 'idle' | 'run' | 'air' | 'attack' | 'heavy' | 'dash' | 'hurt' | 'dead';

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
  swingId: number;
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
  | { type: 'swing'; x: number; y: number; facing: number; combo: number; heavy: boolean }
  | { type: 'hit'; x: number; y: number; dmg: number; heavy: boolean; facing: number }
  | { type: 'kill'; x: number; y: number; burned: boolean; big: boolean }
  | { type: 'spawn'; x: number }
  | { type: 'jump' | 'land' | 'dash'; x: number; y: number }
  | { type: 'knightHurt'; x: number; y: number; hp: number }
  | { type: 'hearthHurt'; hp: number }
  | { type: 'shadeWindup'; x: number; id: number }
  | { type: 'fireburst'; x: number; y: number; facing: number }
  | { type: 'bigSpawn'; x: number }
  | { type: 'cleared' }
  | { type: 'lost'; reason: 'hearth' | 'knight' };

export type Status = 'playing' | 'cleared' | 'lost';

export class World {
  chapterIndex: number;
  chapter: Chapter;
  walls: readonly Wall[] = WALLS;
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
  spawning = true; // false for scripted scenes (dawn choice)
  endless = false; // true: the hour never ends on its own
  events: GameEvent[] = [];
  private nextId = 1;

  constructor(chapterIndex = 0, seed = 1) {
    this.chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex));
    this.chapter = CHAPTERS[this.chapterIndex];
    this.rng = new Rng(seed + this.chapterIndex * 7919);
    this.knight = {
      x: -2.2, y: 0, vx: 0, vy: 0, facing: 1, onGround: true, hp: CFG.knight.maxHp,
      state: 'idle', stateT: 0, combo: 0, swingId: 0, bufferedAttack: false,
      coyote: 0, jumpBuffer: 0, dashCd: 0, airDash: true, iframes: 0, hitThisSwing: new Set(),
    };
    this.light = { x: CFG.hearth.x, y: this.chapter.lightHeight, radius: this.chapter.lightRadius };
    if (this.torch) this.knight.x = -1.5;
    this.updateLight();
  }

  /** Fraction of the hour elapsed, 0..1. */
  get progress(): number {
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
      this.shadows = shadowIntervals(this.light, this.walls, CFG.arena.minX, CFG.arena.maxX);
      return;
    }
    const hpFrac = this.hearthHp / CFG.hearth.maxHp;
    // A wounded hearth burns lower and smaller: shadows lengthen.
    this.light.y = this.chapter.lightHeight * (0.75 + 0.25 * hpFrac);
    this.light.radius = this.chapter.lightRadius * (0.6 + 0.4 * hpFrac);
    this.shadows = shadowIntervals(this.light, this.walls, CFG.arena.minX, CFG.arena.maxX);
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
    this.stepSpawner(dt);
    for (const s of this.shades) this.stepShade(s, dt);
    this.shades = this.shades.filter((s) => s.state !== 'dead' || s.deadT < 1.2);
    for (const s of this.shades) if (s.state === 'dead') s.deadT += dt;

    if (!this.torch && this.hearthHp <= 0) this.lose('hearth');
    else if (this.knight.hp <= 0 && this.knight.state === 'dead' && this.knight.stateT > 1.1) this.lose('knight');
    else if (!this.endless && this.time >= this.chapter.duration) {
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

  private stepKnight(inp: Input, dt: number): void {
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

    // --- attacks
    if ((inp.attack || inp.heavy) && (k.state === 'attack' || k.state === 'heavy')) k.bufferedAttack = true;
    if (!busy && inp.attack) this.startSwing(0, false);
    else if (!busy && inp.heavy) this.startSwing(0, true);

    if (k.state === 'attack' || k.state === 'heavy') this.stepSwing(dt);
    else if (k.state === 'dash') {
      k.vy = 0;
      if (k.stateT >= K.dashTime) {
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
        if (Math.abs(k.vx) > K.speed) k.vx = Math.sign(k.vx) * K.speed;
      } else if (k.onGround) {
        const f = K.friction * dt;
        k.vx = Math.abs(k.vx) <= f ? 0 : k.vx - Math.sign(k.vx) * f;
      }
      if (k.jumpBuffer > 0 && k.coyote > 0) {
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

    this.integrateKnight(dt, k.state !== 'dash');
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
    k.x = Math.max(CFG.arena.minX + hw, Math.min(CFG.arena.maxX - hw, k.x));

    // y: ground and wall tops
    const prevY = k.y;
    k.y += k.vy * dt;
    let floor = 0;
    for (const w of this.walls) {
      const l = w.x - w.w / 2;
      const r = w.x + w.w / 2;
      if (k.x + hw > l && k.x - hw < r && prevY >= w.h - 0.05) floor = Math.max(floor, w.h);
    }
    if (k.y <= floor) {
      k.y = floor;
      if (k.vy < 0) k.vy = 0;
      k.onGround = true;
      k.airDash = true;
    } else k.onGround = false;
    if (!wasGround && k.onGround && k.state !== 'dead') this.events.push({ type: 'land', x: k.x, y: k.y });
  }

  private startSwing(combo: number, heavy: boolean): void {
    const k = this.knight;
    this.setKState(heavy ? 'heavy' : 'attack');
    k.combo = combo;
    k.swingId++;
    k.bufferedAttack = false;
    k.hitThisSwing.clear();
    this.events.push({ type: 'swing', x: k.x, y: k.y, facing: k.facing, combo, heavy });
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
      this.events.push({ type: 'hit', x: s.x, y: s.y + 1, dmg: 2, heavy: true, facing: k.facing });
      if (s.hp <= 0) this.killShade(s, true);
      else {
        s.state = 'stagger';
        s.stateT = 0;
      }
    }
  }

  private stepSwing(dt: number): void {
    const k = this.knight;
    const heavy = k.state === 'heavy';
    const sp = heavy ? CFG.heavy : CFG.combo[k.combo];
    const t = k.stateT;
    if (k.onGround) k.vx *= Math.max(0, 1 - 12 * dt);
    // lunge on the first active frame
    if (t - dt < sp.windup && t >= sp.windup) {
      k.vx = k.facing * sp.lunge;
      if (heavy && this.torch) this.fireBurst();
    }
    if (t >= sp.windup && t < sp.windup + sp.active) this.applySwingHits(sp, heavy);
    if (t >= sp.windup + sp.active + sp.recover) {
      if (k.bufferedAttack && !heavy && k.combo < CFG.combo.length - 1) this.startSwing(k.combo + 1, false);
      else this.setKState(k.onGround ? 'idle' : 'air');
    } else if (t >= sp.windup + sp.active && k.bufferedAttack && !heavy && k.combo < CFG.combo.length - 1) {
      // allow the next step to come out early once the active frames have passed
      if (t >= sp.windup + sp.active + sp.recover * 0.45) this.startSwing(k.combo + 1, false);
    }
  }

  private applySwingHits(sp: { dmg: number; reach: number; knock: number }, heavy: boolean): void {
    const k = this.knight;
    const x0 = k.facing > 0 ? k.x - 0.3 : k.x - sp.reach;
    const x1 = k.facing > 0 ? k.x + sp.reach : k.x + 0.3;
    for (const s of this.shades) {
      if (s.state === 'dead' || k.hitThisSwing.has(s.id)) continue;
      const hw = CFG.shade.w / 2;
      if (s.x + hw < x0 || s.x - hw > x1) continue;
      if (k.y > s.y + CFG.shade.h || k.y + CFG.knight.h < s.y) continue;
      k.hitThisSwing.add(s.id);
      s.hp -= sp.dmg;
      s.vx = k.facing * sp.knock * (s.big ? 0.25 : 1);
      s.facing = (-k.facing) as 1 | -1;
      this.events.push({ type: 'hit', x: s.x, y: s.y + 1, dmg: sp.dmg, heavy, facing: k.facing });
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
    if (!this.spawning || this.time >= this.chapter.duration - 2) return;
    this.spawnT -= dt;
    const alive = this.shades.filter((s) => s.state !== 'dead').length;
    const c = this.chapter;
    if (c.bigAt !== undefined && !this.bigSpawned && this.progress >= c.bigAt) {
      this.bigSpawned = true;
      const side = this.knight.x > 0 ? -1 : 1;
      const s = this.spawnShade(side * (CFG.arena.maxX - 2), true);
      this.events.push({ type: 'bigSpawn', x: s.x });
    }
    if (this.spawnT > 0 || alive >= this.chapter.maxShades) return;
    const [a, b] = this.chapter.spawnEvery;
    this.spawnT = a + (b - a) * this.progress;
    this.spawnShade(this.pickSpawnX());
  }

  /** Shades can only rise where it is dark: a cast shadow, or beyond the fire's reach. */
  pickSpawnX(): number {
    const { minX, maxX } = CFG.arena;
    const kx = this.knight.x;
    const pockets = this.shadows
      .map(([a, b]) => [Math.max(a, minX + 1), Math.min(b, maxX - 1)] as Interval)
      .filter(([a, b]) => b - a > 0.6);
    const tries: number[] = [];
    if (pockets.length && this.rng.next() < 0.65) {
      const [a, b] = pockets[Math.floor(this.rng.next() * pockets.length)];
      tries.push(this.rng.range(a + 0.2, b - 0.2));
    }
    const side = this.rng.next() < 0.5 ? -1 : 1;
    const edge = Math.min(maxX - 1, this.light.x + this.light.radius + 0.5);
    tries.push(side * this.rng.range(Math.min(edge, maxX - 2), maxX - 1));
    for (const x of tries) if (Math.abs(x - kx) > 2.5 && this.lightAt(x) === 0) return x;
    return side * (maxX - 1);
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
    this.events.push({ type: 'kill', x: s.x, y: s.y + 0.9, burned, big: s.big });
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
    s.x = Math.max(CFG.arena.minX + 0.5, Math.min(CFG.arena.maxX - 0.5, s.x));

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
    const knightNear = kAlive && Math.abs(toKnight) < S.aggroRange && Math.abs(k.y - s.y) < 1.6;
    s.target = knightNear || (this.torch && kAlive) ? 'knight' : 'hearth';
    const tx = s.target === 'knight' ? k.x : this.light.x;
    const dist = Math.abs(tx - s.x);
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
        } else if (Math.abs(this.light.x - s.x) <= range + 0.3) {
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
