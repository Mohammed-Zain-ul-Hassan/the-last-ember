// Pure 3D game simulation: the ground is the x/z plane, y is up, feet at y = 0 on open ground.
// No three.js here: render reads this state, the demo bot drives it, vitest tests it.
// Facing is an angle (yaw): forward is (cos yaw, sin yaw) on x/z. The renderer turns models with rotation.y = -yaw.
import { CFG, type MoveSpec } from '../config';
import { CHAPTERS, type Chapter } from '../data/chapters';
import { LEVELS, type Level } from '../data/levels';
import { angleDiff, clampToArea, footR, inArea, overlaps, pushOut, STEP, type Solid } from './geom';
import { inShadow, lightAt, type LightSrc } from './light';
import { Rng } from './rng';

export interface Input {
  mx: number; // desired move on the ground, world space; length 0..1
  mz: number;
  aim?: number; // camera yaw: "forward" when he is not moving (and the centre of the soft-aim cone)
  jumpHeld: boolean;
  jump: boolean; // pressed this step
  heavyHeld?: boolean; // held: charge a heavy strike
  attack: boolean;
  heavy: boolean;
  dash: boolean;
}

export const NO_INPUT: Input = { mx: 0, mz: 0, jumpHeld: false, jump: false, attack: false, heavy: false, dash: false };

export type KnightState = 'idle' | 'run' | 'air' | 'attack' | 'heavy' | 'dash' | 'hurt' | 'dead' | 'charge';
/** What the current attack is. Light/air/lunge/dashStrike run in state 'attack'; heavy/plunge in state 'heavy'. */
export type Move = 'light' | 'heavy' | 'air' | 'plunge' | 'dashStrike' | 'lunge' | 'charged';

export interface Knight {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
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
  lives: number; // shards left; health refills when one breaks
  airJumps: number; // jumps left in the air
  chargeT: number; // time spent charging
  chargeLevel: number; // 0..1, for the released strike
  bufferedAttack: boolean;
  bufferedAimYaw: number; // where a buffered combo step will swing
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
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  speed: number;
  yaw: number;
  state: ShadeState;
  stateT: number;
  cd: number;
  target: 'hearth' | 'knight';
  light: number; // light level it stands in, for render smoke
  deadT: number;
  big: boolean;
  kind: ShadeKind;
  enraged: boolean;
}

export type ShadeKind = 'shade' | 'crawler' | 'lantern';

export interface Bolt {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/** A ground shockwave from the enraged Marshal: a ring racing outward. Jump it. */
export interface Wave {
  x: number;
  z: number;
  r: number;
  life: number;
  hit: boolean;
}

type P = { x: number; y: number; z: number };
export type GameEvent =
  | ({ type: 'swing'; dx: number; dz: number; combo: number; heavy: boolean; move: Move } & P)
  | ({ type: 'hit'; dmg: number; heavy: boolean; dx: number; dz: number; id: number; move: Move } & P)
  | ({ type: 'slam'; r: number; fire: boolean } & P)
  | ({ type: 'move'; name: string; count: number } & P)
  | ({ type: 'kill'; burned: boolean; big: boolean; id: number } & P)
  | { type: 'spawn'; x: number; z: number }
  | ({ type: 'jump' | 'land' | 'dash'; double?: boolean } & P)
  | ({ type: 'chargeFull' } & P)
  | ({ type: 'knightHurt'; hp: number; dmg: number } & P)
  | ({ type: 'lifeLost'; lives: number } & P)
  | { type: 'hearthHurt'; hp: number }
  | { type: 'shadeWindup'; x: number; z: number; id: number }
  | ({ type: 'fireburst'; dx: number; dz: number } & P)
  | { type: 'bigSpawn'; x: number; z: number }
  | ({ type: 'shrine' } & P)
  | ({ type: 'ember' } & P)
  | { type: 'feed'; x: number; z: number; hp: number }
  | { type: 'checkpoint'; x: number; index: number }
  | { type: 'gate'; x: number; open: boolean }
  | ({ type: 'bolt' } & P)
  | ({ type: 'boltCut' } & P)
  | ({ type: 'boltHit' } & P)
  | { type: 'pounce'; x: number; z: number; id: number }
  | ({ type: 'marshalCry' } & P)
  | { type: 'wave'; x: number; z: number }
  | { type: 'cleared' }
  | { type: 'lost'; reason: 'hearth' | 'knight' };

export type Status = 'playing' | 'cleared' | 'lost';

export interface Shrine {
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface WorldOpts {
  startX?: number; // rise again at a checkpoint
  startY?: number; // e.g. standing on the gatehouse at dawn
  startZ?: number;
  checkpointsLit?: number;
}

const fwdX = (yaw: number) => Math.cos(yaw);
const fwdZ = (yaw: number) => Math.sin(yaw);

export class World {
  chapterIndex: number;
  chapter: Chapter;
  level: Level;
  solids: readonly Solid[];
  minX: number;
  maxX: number;
  hearthX: number;
  hearthZ: number;
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
  bolts: Bolt[] = [];
  waves: Wave[] = [];
  torchDim = 0; // seconds the torch stays dimmed after a lantern-eater's bolt
  hearthHp: number = CFG.hearth.maxHp;
  light: LightSrc;
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
    this.solids = this.level.solids;
    [this.minX, this.maxX] = this.level.bounds;
    this.hearthX = this.level.hearthX ?? 0;
    this.hearthZ = this.level.hearthZ ?? 0;
    this.shrines = this.level.shrines.map((p) => ({ ...p, active: false }));
    this.checkpointsLit = opts.checkpointsLit ?? 0;
    this.bossDone = this.level.bossAt === undefined;
    this.knight = {
      x: opts.startX ?? this.level.start, y: opts.startY ?? 0, z: opts.startZ ?? this.level.startZ, vx: 0, vy: 0, vz: 0, yaw: this.level.startYaw,
      onGround: true, hp: CFG.knight.maxHp, lives: CFG.knight.lives,
      state: 'idle', stateT: 0, combo: 0, move: 'light', swingId: 0, sinceDash: 9, airHits: 0, slamT: -1, ember: false, airJumps: CFG.knight.airJumps, chargeT: 0, chargeLevel: 0, bufferedAttack: false, bufferedAimYaw: this.level.startYaw,
      coyote: 0, jumpBuffer: 0, dashCd: 0, airDash: true, iframes: 0, hitThisSwing: new Set(),
    };
    this.light = { x: this.hearthX, y: this.chapter.lightHeight, z: this.hearthZ, radius: this.chapter.lightRadius };
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
      this.light.x = k.x + fwdX(k.yaw) * 0.3;
      this.light.z = k.z + fwdZ(k.yaw) * 0.3;
      this.light.y = this.chapter.lightHeight + k.y;
      this.light.radius = this.chapter.lightRadius * (this.torchDim > 0 ? CFG.lantern.dimMul : 1);
      return;
    }
    const hpFrac = this.hearthHp / CFG.hearth.maxHp;
    // A wounded hearth burns lower and smaller: shadows lengthen.
    this.light.x = this.hearthX;
    this.light.z = this.hearthZ;
    this.light.y = this.chapter.lightHeight * (0.75 + 0.25 * hpFrac);
    this.light.radius = this.chapter.lightRadius * (0.6 + 0.4 * hpFrac);
  }

  lightAt(x: number, z: number): number {
    return lightAt(x, z, this.light, this.solids);
  }

  /** In a shadow cast by a ruin (not merely beyond the light's reach)? */
  inShadow(x: number, z: number): boolean {
    return inShadow(x, z, this.light, this.solids);
  }

  /** Height of whatever solid top is under (x, z), for bodies no higher than maxY + STEP. */
  floorAt(x: number, z: number, r: number, maxY = Infinity): number {
    let floor = 0;
    for (const s of this.solids) if (s.y1 <= maxY + STEP && s.y1 > floor && overlaps(s, x, z, r)) floor = s.y1;
    return floor;
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
    this.torchDim = Math.max(0, this.torchDim - dt);
    this.updateLight();
    this.stepKnight(input, dt);
    this.stepJourney();
    this.stepSpawner(dt);
    for (const s of this.shades) this.stepShade(s, dt);
    this.separateShades();
    this.stepBolts(dt);
    this.stepWaves(dt);
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

  /** Turn toward an angle at most rate * dt. */
  private turnToward(yaw: number, rate: number, dt: number): void {
    const k = this.knight;
    const d = angleDiff(k.yaw, yaw);
    k.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  /**
   * Soft aim: the swing goes where he runs (or where the camera looks), turned toward the nearest shade inside a
   * cone around that direction, so blows land without pixel-perfect facing.
   */
  aimYaw(inp: Input): number {
    const k = this.knight;
    const mx = inp.mx || 0;
    const mz = inp.mz || 0;
    const moving = Math.hypot(mx, mz) > 0.2;
    const base = moving ? Math.atan2(mz, mx) : (inp.aim ?? k.yaw);
    let best = Infinity;
    let yaw = base;
    for (const s of this.shades) {
      if (s.state === 'dead' || s.state === 'rise') continue;
      const dx = s.x - k.x;
      const dz = s.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d > CFG.knight.aimRange || Math.abs(s.y - k.y) > 2.5) continue;
      const a = Math.atan2(dz, dx);
      const off = Math.abs(angleDiff(base, a));
      if (off > CFG.knight.aimCone) continue;
      const score = d + off * 2;
      if (score < best) {
        best = score;
        yaw = a;
      }
    }
    return yaw;
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
      k.vz *= 0.9;
      this.integrateKnight(dt, true);
      return;
    }

    let mx = inp.mx || 0;
    let mz = inp.mz || 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const moving = ml > 0.15;
    const moveYaw = Math.atan2(mz, mx);
    // a jump cancels the tail of a swing or a dash, so it never feels swallowed
    if (k.jumpBuffer > 0 && (k.state === 'attack' || k.state === 'heavy') && k.move !== 'plunge') {
      const sp = this.spec();
      if (k.stateT >= sp.windup + sp.active) this.setKState(k.onGround ? 'idle' : 'air');
    }
    if (k.jumpBuffer > 0 && k.state === 'dash' && k.stateT > 0.06) {
      k.sinceDash = 0;
      this.setKState(k.onGround ? 'run' : 'air');
    }
    // charging: a heavy that is still held past holdToCharge (inside its wind-up, before it lands) becomes a charge.
    // A tap still cleaves at once; a hold plants his feet until the key is let go.
    if (inp.heavyHeld && k.state === 'heavy' && k.move === 'heavy' && k.onGround && k.stateT >= CFG.charge.holdToCharge && k.stateT < CFG.heavy.windup) {
      const held = k.stateT;
      this.setKState('charge');
      k.chargeT = held;
    }
    if (k.state === 'charge') {
      k.chargeT += dt;
      if (k.chargeT - dt < CFG.charge.full && k.chargeT >= CFG.charge.full) this.events.push({ type: 'chargeFull', x: k.x, y: k.y + 1.4, z: k.z });
      if (moving) this.turnToward(moveYaw, K.turnRate * 0.5, dt); // he can turn, but his feet stay planted
      else if (inp.aim !== undefined) this.turnToward(inp.aim, K.turnRate * 0.5, dt);
      k.vx = 0;
      k.vz = 0;
      if (!inp.heavyHeld) {
        k.chargeLevel = Math.min(1, k.chargeT / CFG.charge.full);
        this.startMove('charged', 0, k.yaw);
      } else if (inp.dash || !k.onGround) this.setKState(k.onGround ? 'idle' : 'air');
      else {
        this.integrateKnight(dt, true);
        return;
      }
    }
    const busy = k.state === 'attack' || k.state === 'heavy' || k.state === 'dash' || k.state === 'hurt' || k.state === 'charge';

    // --- dash (can cancel an attack's recovery)
    if (inp.dash && k.dashCd <= 0 && (k.onGround || k.airDash) && k.state !== 'hurt' && k.state !== 'dash') {
      if (moving) k.yaw = moveYaw;
      this.setKState('dash');
      k.vx = fwdX(k.yaw) * K.dashSpeed;
      k.vz = fwdZ(k.yaw) * K.dashSpeed;
      k.vy = 0;
      k.dashCd = K.dashCd;
      k.iframes = Math.max(k.iframes, K.dashTime + 0.05);
      if (!k.onGround) k.airDash = false;
      this.events.push({ type: 'dash', x: k.x, y: k.y, z: k.z });
    }

    // --- attacks: the same two buttons become different moves depending on what he is doing
    k.sinceDash += dt;
    if ((inp.attack || inp.heavy) && (k.state === 'attack' || k.state === 'heavy')) k.bufferedAttack = true;
    const canAttack = !busy || (k.state === 'dash' && inp.attack);
    // an aerial can be cancelled into a plunge once its blow has landed
    const airSp = CFG.air;
    if (inp.heavy && k.state === 'attack' && k.move === 'air' && k.stateT >= airSp.windup + airSp.active && !k.onGround && k.y - this.floorAt(k.x, k.z, K.r * 0.5, k.y) > 0.8) {
      this.startMove('plunge', 0, k.yaw);
      inp = { ...inp, heavy: false };
    }
    const aim = (inp.attack || inp.heavy) && canAttack ? this.aimYaw(inp) : k.yaw;
    const speed = Math.hypot(k.vx, k.vz);
    if (canAttack && inp.attack && (k.state === 'dash' || k.sinceDash < CFG.dashStrikeWindow)) this.startMove('dashStrike', 0, k.state === 'dash' ? k.yaw : aim);
    else if (canAttack && inp.attack) {
      if (!k.onGround) {
        if (k.airHits < CFG.airChain) this.startMove('air', 0, aim);
      } else if (moving && speed > K.speed * 0.8) this.startMove('lunge', 0, aim);
      else this.startMove('light', 0, aim);
    } else if (!busy && inp.heavy) this.startMove(!k.onGround && k.y - this.floorAt(k.x, k.z, K.r * 0.5, k.y) > 0.8 ? 'plunge' : 'heavy', 0, aim);
    k.bufferedAimYaw = this.aimYaw(inp);

    if (k.state === 'attack' || k.state === 'heavy') this.stepSwing(dt);
    else if (k.state === 'dash') {
      k.vy = 0;
      if (k.stateT >= K.dashTime) {
        k.sinceDash = 0;
        k.vx = fwdX(k.yaw) * K.speed;
        k.vz = fwdZ(k.yaw) * K.speed;
        this.setKState(k.onGround ? 'run' : 'air');
      }
    } else if (k.state === 'hurt') {
      k.vx *= 0.9;
      k.vz *= 0.9;
      if (k.stateT >= K.hurtTime) this.setKState(k.onGround ? 'idle' : 'air');
    } else {
      // --- free movement: steer the ground velocity toward where the stick (WASD) points
      const vmax = K.speed * (k.ember ? 0.82 : 1);
      const tvx = moving ? mx * vmax : 0;
      const tvz = moving ? mz * vmax : 0;
      const rate = (moving ? (k.onGround ? K.accel : K.airAccel) : k.onGround ? K.friction : 0) * dt;
      const dvx = tvx - k.vx;
      const dvz = tvz - k.vz;
      const dl = Math.hypot(dvx, dvz);
      if (dl <= rate) {
        k.vx = tvx;
        k.vz = tvz;
      } else if (dl > 0) {
        k.vx += (dvx / dl) * rate;
        k.vz += (dvz / dl) * rate;
      }
      if (moving) this.turnToward(moveYaw, K.turnRate, dt);
      if (k.jumpBuffer > 0 && k.coyote > 0) {
        k.vy = K.jumpV;
        k.onGround = false;
        k.coyote = 0;
        k.jumpBuffer = 0;
        this.events.push({ type: 'jump', x: k.x, y: k.y, z: k.z });
      } else if (k.jumpBuffer > 0 && !k.onGround && k.coyote <= 0 && k.airJumps > 0) {
        // double jump: a second leap out of the air on a burst of shadow
        k.vy = K.airJumpV;
        k.airJumps--;
        k.jumpBuffer = 0;
        this.events.push({ type: 'jump', x: k.x, y: k.y, z: k.z, double: true });
      }
      if (!inp.jumpHeld && k.vy > 0) k.vy *= 1 - (1 - K.jumpCut) * Math.min(1, dt * 20);
      const next: KnightState = !k.onGround ? 'air' : Math.hypot(k.vx, k.vz) > 0.3 ? 'run' : 'idle';
      if (next !== k.state) this.setKState(next);
    }

    // dash strikes glide flat; air strikes hang for a moment
    const glide = k.state === 'dash' || (k.move === 'dashStrike' && k.state === 'attack' && k.stateT < CFG.dashStrike.windup + CFG.dashStrike.active);
    this.integrateKnight(dt, !glide);
    if (k.onGround) k.airHits = 0;
  }

  /** The boss gate: the far doors stay shut until the Hollow Marshal falls. */
  private get gateX(): number {
    return !this.bossDone && this.level.bossAt !== undefined ? (this.level.end as number) - 3 : Infinity;
  }

  private integrateKnight(dt: number, gravity: boolean): void {
    const k = this.knight;
    const K = CFG.knight;
    const r = K.r;
    if (gravity) k.vy += CFG.gravity * dt;
    const wasGround = k.onGround;

    // ground plane, then resolve against every solid that reaches his body (low ledges are stepped onto)
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
        if (s.y1 <= k.y + STEP || s.y0 >= k.y + K.h - 0.05) continue;
        const p = pushOut(s, k.x, k.z, r);
        if (!p) continue;
        k.x = p[0];
        k.z = p[1];
      }
    }
    [k.x, k.z] = clampToArea(this.level.area, k.x, k.z, r);
    k.x = Math.min(this.gateX - r, k.x);

    // height: ground, solid tops, and the underside of anything overhead
    const prevY = k.y;
    k.y += k.vy * dt;
    const floor = this.floorAt(k.x, k.z, r * 0.6, prevY);
    for (const s of this.solids) {
      if (s.y0 > prevY + 0.1 && k.y + K.h > s.y0 && prevY + K.h <= s.y0 + 0.05 && overlaps(s, k.x, k.z, r * 0.6)) {
        k.y = s.y0 - K.h;
        k.vy = Math.min(0, k.vy);
      }
    }
    if (k.y <= floor) {
      k.y = floor;
      if (k.vy < 0) k.vy = 0;
      k.onGround = true;
      k.airDash = true;
      k.airJumps = CFG.knight.airJumps;
    } else k.onGround = false;
    if (!wasGround && k.onGround && k.state !== 'dead') this.events.push({ type: 'land', x: k.x, y: k.y, z: k.z });
  }

  private spec(): MoveSpec {
    const k = this.knight;
    if (k.move === 'charged') return { ...CFG.charged, dmg: Math.round(CFG.charge.minDmg + (CFG.charge.maxDmg - CFG.charge.minDmg) * k.chargeLevel) };
    return k.move === 'light' ? CFG.combo[k.combo] : CFG[k.move];
  }

  private startMove(move: Move, combo: number, yaw: number): void {
    const k = this.knight;
    const heavy = move === 'heavy' || move === 'plunge';
    this.setKState(heavy ? 'heavy' : 'attack');
    k.yaw = yaw;
    k.move = move;
    k.combo = combo;
    k.swingId++;
    k.bufferedAttack = false;
    k.hitThisSwing.clear();
    k.slamT = -1;
    if (move === 'air') k.airHits++;
    if (move === 'dashStrike') k.sinceDash = 9;
    this.events.push({ type: 'swing', x: k.x, y: k.y, z: k.z, dx: fwdX(yaw), dz: fwdZ(yaw), combo, heavy, move });
  }

  /** Torch phase: the heavy strike throws a wave of fire. */
  private fireBurst(): void {
    const k = this.knight;
    const fx = fwdX(k.yaw);
    const fz = fwdZ(k.yaw);
    this.events.push({ type: 'fireburst', x: k.x + fx * 1.2, y: k.y + 1.2, z: k.z + fz * 1.2, dx: fx, dz: fz });
    for (const s of this.shades) {
      if (s.state === 'dead') continue;
      const ox = s.x - k.x;
      const oz = s.z - k.z;
      const f = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (f < -0.5 || f > 4.2 || side > 1.2 + f * 0.35 || Math.abs(s.y - k.y) > 2) continue;
      s.hp -= 2;
      s.vx = fx * (s.big ? 3 : 9);
      s.vz = fz * (s.big ? 3 : 9);
      this.events.push({ type: 'hit', x: s.x, y: s.y + 1, z: s.z, dmg: 2, heavy: true, dx: fx, dz: fz, id: s.id, move: 'heavy' });
      if (s.hp <= 0) this.killShade(s, true);
      else {
        s.state = 'stagger';
        s.stateT = 0;
      }
    }
  }

  private static readonly MOVE_NAMES: Partial<Record<Move, string>> = {
    heavy: 'Cleave', plunge: 'Shadow Plunge', dashStrike: 'Piercing Step', lunge: 'Lunge', air: 'Aerial', charged: 'Shadow Rend',
  };

  private stepSwing(dt: number): void {
    const k = this.knight;
    const sp = this.spec();
    const t = k.stateT;
    const fx = fwdX(k.yaw);
    const fz = fwdZ(k.yaw);
    if (k.move === 'plunge') return this.stepPlunge(dt, sp);
    if (k.onGround && k.move !== 'dashStrike') {
      const damp = Math.max(0, 1 - 12 * dt);
      k.vx *= damp;
      k.vz *= damp;
    }
    // first active frame: commit forward
    if (t - dt < sp.windup && t >= sp.windup) {
      k.vx = fx * sp.lunge;
      k.vz = fz * sp.lunge;
      if (k.move === 'heavy' && this.torch) this.fireBurst();
    }
    if (k.move === 'air') {
      k.vy = Math.max(k.vy, t < sp.windup + sp.active ? -1.5 : -6); // hang in the air while striking
      if (k.onGround && t > sp.windup) return this.setKState('idle');
    }
    if (k.move === 'dashStrike' && t >= sp.windup && t < sp.windup + sp.active) {
      k.vx = fx * sp.lunge;
      k.vz = fz * sp.lunge;
      k.vy = 0;
      k.iframes = Math.max(k.iframes, 0.05);
    }
    if (t >= sp.windup && t < sp.windup + sp.active) this.applyHits(sp, false);
    // multi-hit callout once the active frames end
    if (t - dt < sp.windup + sp.active && t >= sp.windup + sp.active) this.calloutMove();
    const done = t >= sp.windup + sp.active + sp.recover;
    const early = t >= sp.windup + sp.active + sp.recover * 0.45;
    if (k.bufferedAttack && early) {
      if (k.move === 'light' && k.combo < CFG.combo.length - 1) return this.startMove('light', k.combo + 1, k.bufferedAimYaw);
      if (k.move === 'air' && !k.onGround && k.airHits < CFG.airChain) return this.startMove('air', 0, k.bufferedAimYaw);
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
        k.vz *= 0.85;
      } else {
        k.vy = -28;
        k.vx = fwdX(k.yaw) * 3;
        k.vz = fwdZ(k.yaw) * 3;
        k.iframes = Math.max(k.iframes, 0.08);
      }
      if (k.onGround && k.stateT > sp.windup * 0.5) {
        k.slamT = 0;
        k.vx = 0;
        k.vz = 0;
        this.applyHits(sp, true);
        this.events.push({ type: 'slam', x: k.x, y: k.y, z: k.z, r: sp.reach, fire: this.torch });
        this.hitstop = Math.max(this.hitstop, CFG.hitstop.heavy);
        this.calloutMove(true);
      }
      return;
    }
    k.slamT += dt;
    k.vx *= 0.8;
    k.vz *= 0.8;
    if (k.slamT >= sp.recover) this.setKState('idle');
  }

  private calloutMove(always = false): void {
    const k = this.knight;
    const name = World.MOVE_NAMES[k.move];
    const n = k.hitThisSwing.size;
    if (!name || n === 0) return;
    if (k.move === 'air' && k.airHits < CFG.airChain) return; // name a full aerial chain only
    if (k.move === 'heavy' && n < 2 && !always) return; // a cleave is worth naming when it hits a crowd
    if (k.move === 'charged' && k.chargeLevel < 0.95) return; // only a full charge earns the name
    this.events.push({ type: 'move', name, x: k.x, y: k.y + 2.6, z: k.z, count: n });
  }

  /**
   * Is a point inside this swing? The blade sweeps a box in front of him: `reach` ahead, `back` behind, and a
   * half-width that is wide for area moves. A ring (the plunge) is just a radius.
   */
  private inSwing(sp: MoveSpec, ring: boolean, px: number, pz: number, pad: number): boolean {
    const k = this.knight;
    const ox = px - k.x;
    const oz = pz - k.z;
    if (ring) return Math.hypot(ox, oz) <= sp.reach + pad;
    const fx = fwdX(k.yaw);
    const fz = fwdZ(k.yaw);
    const f = ox * fx + oz * fz;
    const side = Math.abs(ox * fz - oz * fx);
    const half = sp.multi ? Math.max(1.7, sp.back + 0.5) : 1.15;
    return f >= -sp.back - pad && f <= sp.reach + pad && side <= half + pad;
  }

  private applyHits(sp: MoveSpec, ring: boolean): void {
    const k = this.knight;
    const heavy = k.state === 'heavy';
    // any blade cuts shadow bolts out of the air
    for (const b of this.bolts) {
      if (b.life <= 0 || b.y < k.y - 0.2 || b.y > k.y + 2.8 || !this.inSwing(sp, ring, b.x, b.z, 0.4)) continue;
      b.life = 0;
      this.events.push({ type: 'boltCut', x: b.x, y: b.y, z: b.z });
      this.hitstop = Math.max(this.hitstop, 2);
    }
    // single-target moves only ever connect with one shade per swing
    if (!sp.multi && k.hitThisSwing.size > 0) return;
    const pad = CFG.shade.r;
    const inRange = this.shades.filter(
      (s) => s.state !== 'dead' && !k.hitThisSwing.has(s.id) && this.inSwing(sp, ring, s.x, s.z, pad) && !(k.y > s.y + this.shadeH(s) || k.y + CFG.knight.h < s.y),
    );
    if (!inRange.length) return;
    const dist = (s: Shade) => Math.hypot(s.x - k.x, s.z - k.z);
    const targets = sp.multi ? inRange : [inRange.reduce((a, b) => (dist(a) <= dist(b) ? a : b))];
    for (const s of targets) {
      k.hitThisSwing.add(s.id);
      s.hp -= sp.dmg;
      const d = dist(s) || 1;
      const ax = (s.x - k.x) / d;
      const az = (s.z - k.z) / d;
      const kb = sp.knock * (s.big ? 0.25 : 1);
      s.vx = ax * kb;
      s.vz = az * kb;
      s.yaw = Math.atan2(-az, -ax);
      this.events.push({ type: 'hit', x: s.x, y: s.y + 1, z: s.z, dmg: sp.dmg, heavy, dx: ax, dz: az, id: s.id, move: k.move });
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

  private hurtKnight(fromX: number, fromZ: number, dmg: number = CFG.shade.knightDmg): void {
    const k = this.knight;
    if (k.iframes > 0 || k.state === 'dead') return;
    const dealt = Math.min(dmg, Math.max(0, k.hp));
    k.hp -= dmg;
    k.iframes = CFG.knight.iframes;
    const d = Math.hypot(k.x - fromX, k.z - fromZ) || 1;
    k.vx = ((k.x - fromX) / d) * CFG.knight.hurtKnock;
    k.vz = ((k.z - fromZ) / d) * CFG.knight.hurtKnock;
    k.vy = 5;
    k.onGround = false;
    this.events.push({ type: 'knightHurt', x: k.x, y: k.y, z: k.z, hp: Math.max(0, k.hp), dmg: dealt });
    if (k.hp <= 0 && k.lives > 1) {
      // a shard breaks: he rises again at full health, and the burst throws the shades back
      k.lives--;
      k.hp = CFG.knight.maxHp;
      k.iframes = CFG.knight.lifeIframes;
      this.events.push({ type: 'lifeLost', x: k.x, y: k.y, z: k.z, lives: k.lives });
      for (const s of this.shades) {
        const sd = Math.hypot(s.x - k.x, s.z - k.z);
        if (s.state === 'dead' || s.big || sd > 4.5) continue;
        s.vx = ((s.x - k.x) / (sd || 1)) * 12;
        s.vz = ((s.z - k.z) / (sd || 1)) * 12;
        s.state = 'stagger';
        s.stateT = 0;
      }
      this.setKState('hurt');
      return;
    }
    if (k.hp <= 0) k.lives = 0;
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
      const s = this.spawnShade(Math.min(this.maxX - 3, this.knight.x + 11), 0, true);
      this.events.push({ type: 'bigSpawn', x: s.x, z: s.z });
      this.events.push({ type: 'gate', x: (this.level.end as number) - 3, open: false });
    }
    if (this.spawnT > 0 || alive >= this.chapter.maxShades) return;
    const [a, b] = this.chapter.spawnEvery;
    this.spawnT = a + (b - a) * this.progress;
    const [x, z] = this.pickSpawn();
    const kind = this.pickKind();
    this.spawnShade(x, z, false, kind);
    if (kind === 'crawler') {
      // they come in pairs
      const [x2, z2] = clampToArea(this.level.area, x + this.rng.range(-1.3, 1.3), z + this.rng.range(-1.3, 1.3), 0.6);
      this.spawnShade(x2, z2, false, 'crawler');
    }
  }

  private pickKind(): ShadeKind {
    const m = this.chapter.mix;
    let r = this.rng.next() * (m.shade + m.crawler + m.lantern);
    if ((r -= m.lantern) < 0) return 'lantern';
    if ((r -= m.crawler) < 0) return 'crawler';
    return 'shade';
  }

  /** Body height for hit tests. */
  shadeH(s: Shade): number {
    return s.big ? CFG.shade.h * 1.65 : s.kind === 'crawler' ? CFG.crawler.h : CFG.shade.h;
  }

  /** A spawn point is good if it is dark, open, inside the level and not on top of him. */
  private goodSpawn(x: number, z: number): boolean {
    const k = this.knight;
    if (!inArea(this.level.area, x, z, 0.8) || Math.hypot(x - k.x, z - k.z) < 3.5) return false;
    if (this.solids.some((s) => s.y0 < 1.5 && overlaps(s, x, z, 0.45))) return false;
    return this.lightAt(x, z) === 0;
  }

  /**
   * Shades can only rise where it is dark: a cast shadow, or beyond the fire's reach. They rise near the knight
   * (biased ahead of him on the road) and, on the grounds, near the hearth too, so it is never safe to leave it.
   */
  pickSpawn(): [number, number] {
    const k = this.knight;
    const nearHearth = !this.torch && this.rng.next() < 0.45;
    const cx = nearHearth ? this.hearthX : k.x + (this.road ? 6 : 0);
    const cz = nearHearth ? this.hearthZ : k.z;
    const L = this.light;
    // 1. a pocket behind a ruin, away from the light
    if (this.rng.next() < 0.7) {
      const near = this.solids.filter((s) => !s.noShadow && s.tag !== 'hut' && s.y0 < 0.5 && Math.hypot(s.x - cx, s.z - cz) < 22);
      for (let i = 0; i < 6 && near.length; i++) {
        const s = near[Math.floor(this.rng.next() * near.length)];
        const dx = s.x - L.x;
        const dz = s.z - L.z;
        const d = Math.hypot(dx, dz) || 1;
        const along = footR(s) + this.rng.range(0.6, 3.2);
        const side = this.rng.range(-0.5, 0.5) * footR(s);
        const x = s.x + (dx / d) * along - (dz / d) * side;
        const z = s.z + (dz / d) * along + (dx / d) * side;
        if (this.goodSpawn(x, z)) return [x, z];
      }
    }
    // 2. beyond the reach of the light, at the edge of what he can see
    for (let i = 0; i < 10; i++) {
      const base = nearHearth ? [this.hearthX, this.hearthZ] : [k.x, k.z];
      const a = this.road ? this.rng.range(-1.1, 1.1) + (this.rng.next() < 0.3 ? Math.PI : 0) : this.rng.range(0, Math.PI * 2);
      const r = (nearHearth ? L.radius : Math.max(4, this.torch ? L.radius : 6)) + this.rng.range(0.5, 6);
      const x = base[0] + Math.cos(a) * r;
      const z = base[1] + Math.sin(a) * r;
      if (this.goodSpawn(x, z)) return [x, z];
    }
    // 3. anywhere dark
    for (let i = 0; i < 30; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(L.radius, L.radius + 12);
      const x = L.x + Math.cos(a) * r;
      const z = L.z + Math.sin(a) * r;
      if (this.goodSpawn(x, z)) return [x, z];
    }
    return clampToArea(this.level.area, k.x + (this.road ? 12 : -12), k.z, 1);
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
          const far = (s: Shrine) => Math.hypot(s.x - k.x, s.z - k.z);
          idle.sort((a, b) => far(b) - far(a));
          const pick = idle[Math.floor(this.rng.next() * Math.min(3, idle.length))];
          pick.active = true;
          this.events.push({ type: 'shrine', x: pick.x, y: pick.y, z: pick.z });
        }
      }
      for (const s of this.shrines) {
        if (s.active && !k.ember && Math.hypot(k.x - s.x, k.z - s.z) < 1.2 && Math.abs(k.y - s.y) < 1.0) {
          s.active = false;
          k.ember = true;
          this.events.push({ type: 'ember', x: s.x, y: s.y, z: s.z });
        }
      }
      if (k.ember && Math.hypot(k.x - this.hearthX, k.z - this.hearthZ) < 2.6 && k.y < 1.6) {
        k.ember = false;
        this.hearthHp = Math.min(CFG.hearth.maxHp, this.hearthHp + CFG.hearth.emberHeal);
        this.events.push({ type: 'feed', x: this.hearthX, z: this.hearthZ, hp: this.hearthHp });
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

  spawnShade(x: number, z: number, big = false, kind: ShadeKind = 'shade'): Shade {
    const c = this.chapter;
    const hp = big ? c.shadeHp * 7 : kind === 'crawler' ? Math.max(1, Math.ceil(c.shadeHp * CFG.crawler.hpMul)) : kind === 'lantern' ? CFG.lantern.hp : c.shadeHp;
    const speed = big ? c.shadeSpeed * 0.6 : kind === 'crawler' ? CFG.crawler.speed : kind === 'lantern' ? CFG.lantern.speed : c.shadeSpeed;
    const s: Shade = {
      id: this.nextId++, x, y: this.floorAt(x, z, 0.3, 0), z, vx: 0, vz: 0, hp, maxHp: hp,
      speed: speed * (big ? 1 : this.rng.range(0.85, 1.15)), yaw: Math.atan2(this.light.z - z, this.light.x - x),
      state: 'rise', stateT: 0, cd: this.rng.range(0, 0.5), target: 'hearth', light: 0, deadT: 0, big, kind, enraged: false,
    };
    this.shades.push(s);
    this.events.push({ type: 'spawn', x, z });
    return s;
  }

  private killShade(s: Shade, burned: boolean): void {
    if (s.state === 'dead') return;
    s.state = 'dead';
    s.stateT = 0;
    s.deadT = 0;
    this.kills++;
    this.events.push({ type: 'kill', x: s.x, y: s.y + 0.9, z: s.z, burned, big: s.big, id: s.id });
  }

  /** Shades keep a little room between each other and around him, so a crowd reads as a crowd. */
  private separateShades(): void {
    const k = this.knight;
    const live = this.shades.filter((s) => s.state !== 'dead');
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = (a.big || b.big ? 1.4 : 0.85) * (a.kind === 'lantern' || b.kind === 'lantern' ? 0.5 : 1);
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-6) continue;
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
      if (a.kind === 'lantern' || k.state === 'dead') continue;
      const dx = a.x - k.x;
      const dz = a.z - k.z;
      const d = Math.hypot(dx, dz);
      const min = CFG.knight.r + (a.big ? 0.9 : CFG.shade.r);
      if (d < min && d > 1e-6 && Math.abs(a.y - k.y) < 1.5) {
        a.x = k.x + (dx / d) * min;
        a.z = k.z + (dz / d) * min;
      }
    }
  }

  private stepShade(s: Shade, dt: number): void {
    if (s.state === 'dead') return;
    const S = CFG.shade;
    const k = this.knight;
    s.stateT += dt;
    s.cd = Math.max(0, s.cd - dt);
    s.light = this.lightAt(s.x, s.z);

    // light burns shades (not while still rising out of the dark)
    if (s.state !== 'rise' && s.light > 0 && s.kind !== 'lantern') {
      s.hp -= S.lightDps * (this.torch ? 1.5 : 1) * (s.big ? 0.3 : 1) * s.light * dt;
      if (s.hp <= 0) return this.killShade(s, true);
    }

    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const damp = Math.max(0, 1 - 6 * dt);
    s.vx *= damp;
    s.vz *= damp;
    [s.x, s.z] = clampToArea(this.level.area, s.x, s.z, 0.5);

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
      this.settleShade(s, dt, false);
      return;
    }

    if (s.kind === 'lantern') return this.stepLantern(s, dt);
    if (s.big) this.marshalPhase(s);
    const kAlive = k.state !== 'dead';
    const toK = Math.hypot(k.x - s.x, k.z - s.z);
    const knightNear = kAlive && toK < S.aggroRange && Math.abs(k.y - s.y) < 3.5;
    s.target = knightNear || (this.torch && kAlive) ? 'knight' : 'hearth';
    const tx = s.target === 'knight' ? k.x : this.hearthX;
    const tz = s.target === 'knight' ? k.z : this.hearthZ;
    const dist = Math.hypot(tx - s.x, tz - s.z);
    this.settleShade(s, dt, s.target === 'knight' && toK < 7);
    const reach = s.big ? 1.9 : 1;
    const crawler = s.kind === 'crawler';
    const range = s.target === 'knight' ? (crawler ? CFG.crawler.pounceRange : S.attackRange * reach + CFG.knight.r) : S.hearthRange + CFG.hearth.radius;
    const windup = crawler ? CFG.crawler.windup : S.windup;
    const strikeTime = crawler ? CFG.crawler.strikeTime : S.strikeTime;
    const dirX = (tx - s.x) / (dist || 1);
    const dirZ = (tz - s.z) / (dist || 1);

    if (s.state === 'walk') {
      s.yaw = Math.atan2(dirZ, dirX);
      if (dist > range) {
        const v = s.speed * (1 - S.lightSlow * s.light) * dt;
        s.x += dirX * v;
        s.z += dirZ * v;
      } else if (s.cd <= 0) {
        s.state = 'windup';
        s.stateT = 0;
        this.events.push({ type: 'shadeWindup', x: s.x, z: s.z, id: s.id });
      }
    } else if (s.state === 'windup') {
      // a wind-up tracks him slowly: dodging sideways late still works
      if (s.target === 'knight') s.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, angleDiff(s.yaw, Math.atan2(dirZ, dirX))));
      if (s.stateT >= windup) {
        s.state = 'strike';
        s.stateT = 0;
        if (crawler && s.target === 'knight') {
          // pounce: the hit lands during the leap, not at its start
          s.vx = Math.cos(s.yaw) * CFG.crawler.pounceSpeed;
          s.vz = Math.sin(s.yaw) * CFG.crawler.pounceSpeed;
          this.events.push({ type: 'pounce', x: s.x, z: s.z, id: s.id });
        } else if (s.target === 'knight') {
          if (s.big && s.enraged) this.marshalWaves(s);
          if (this.strikeLands(s, S.attackRange * reach + CFG.knight.r + 0.35, 1.6 * reach)) this.hurtKnight(s.x, s.z, s.big ? S.bigDmg : S.knightDmg);
        } else if (Math.hypot(this.hearthX - s.x, this.hearthZ - s.z) <= range + 0.3) {
          this.hearthHp = Math.max(0, this.hearthHp - S.hearthDmg);
          this.events.push({ type: 'hearthHurt', hp: this.hearthHp });
        }
      }
    } else if (s.state === 'strike') {
      if (crawler && s.target === 'knight') {
        s.vx = Math.cos(s.yaw) * CFG.crawler.pounceSpeed; // the leap holds its speed
        s.vz = Math.sin(s.yaw) * CFG.crawler.pounceSpeed;
        if (Math.hypot(k.x - s.x, k.z - s.z) < 1.0 && Math.abs(k.y - s.y) < 1.4) this.hurtKnight(s.x, s.z, CFG.crawler.dmg);
      }
      if (s.stateT >= strikeTime) {
        s.state = 'walk';
        s.stateT = 0;
        s.cd = crawler ? CFG.crawler.cd : S.attackCd * (s.enraged ? CFG.marshal.cdMul : 1);
      }
    }
  }

  /** A shade's blow lands if he is in reach and in front of it (a cone, so stepping around it dodges). */
  private strikeLands(s: Shade, range: number, height: number): boolean {
    const k = this.knight;
    const dx = k.x - s.x;
    const dz = k.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d > range || Math.abs(k.y - s.y) > height) return false;
    return d < 0.6 || Math.abs(angleDiff(s.yaw, Math.atan2(dz, dx))) < 1.1;
  }

  /**
   * Shadows drift: they float up over ruins and after him onto ledges, and sink back to the ground. They rise over
   * anything about their own height and pass under raised walks.
   */
  private settleShade(s: Shade, dt: number, followKnight: boolean): void {
    const ground = this.floorAt(s.x, s.z, 0.3, s.y + 1.4);
    const ty = followKnight ? Math.max(this.knight.y, ground) : ground;
    s.y += Math.sign(ty - s.y) * Math.min(Math.abs(ty - s.y), CFG.shade.floatSpeed * dt);
  }

  /** Lantern-eater: hover out of reach, keep its distance, spit bolts that dim the torch. */
  private stepLantern(s: Shade, dt: number): void {
    const L = CFG.lantern;
    const k = this.knight;
    s.target = 'knight';
    const dx = k.x - s.x;
    const dz = k.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    s.yaw = Math.atan2(dz, dx);
    const want = d < L.near ? -1 : d > L.far ? 1 : 0; // back off, close in, or hold
    // and circle him slowly, so it is never simply in front of the blade
    const orbit = Math.sin(this.time * 0.7 + s.id) > 0 ? 0.6 : -0.6;
    s.x += ((dx / d) * want - (dz / d) * orbit) * s.speed * dt;
    s.z += ((dz / d) * want + (dx / d) * orbit) * s.speed * dt;
    const ty = k.y + L.hover + Math.sin(this.time * 2 + s.id) * 0.25;
    s.y += Math.sign(ty - s.y) * Math.min(Math.abs(ty - s.y), CFG.shade.floatSpeed * dt);
    if (s.state === 'walk' && s.cd <= 0 && d < L.far + 3 && k.state !== 'dead') {
      s.state = 'windup';
      s.stateT = 0;
      this.events.push({ type: 'shadeWindup', x: s.x, z: s.z, id: s.id });
    } else if (s.state === 'windup' && s.stateT >= L.windup) {
      const ox = s.x;
      const oy = s.y + 1.2;
      const oz = s.z;
      const tx = k.x - ox;
      const ty2 = k.y + 1.1 - oy;
      const tz = k.z - oz;
      const n = Math.hypot(tx, ty2, tz) || 1;
      this.bolts.push({ id: this.nextId++, x: ox, y: oy, z: oz, vx: (tx / n) * L.boltSpeed, vy: (ty2 / n) * L.boltSpeed, vz: (tz / n) * L.boltSpeed, life: L.boltLife });
      this.events.push({ type: 'bolt', x: ox, y: oy, z: oz });
      s.state = 'walk';
      s.stateT = 0;
      s.cd = L.cd;
    }
  }

  private stepBolts(dt: number): void {
    const k = this.knight;
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.y < 0) b.life = 0;
      if (Math.hypot(b.x - k.x, b.z - k.z) < 0.5 && b.y > k.y && b.y < k.y + CFG.knight.h && k.iframes <= 0 && k.state !== 'dead') {
        b.life = 0;
        this.events.push({ type: 'boltHit', x: b.x, y: b.y, z: b.z });
        this.hurtKnight(b.x, b.z, CFG.lantern.boltDmg);
        if (this.torch) this.torchDim = CFG.lantern.dimTime; // it eats the light
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  /** Below half health the Marshal cries out, calls two crawlers and quickens. */
  private marshalPhase(s: Shade): void {
    if (s.enraged || s.state === 'dead' || s.hp > s.maxHp * CFG.marshal.enrageAt) return;
    s.enraged = true;
    s.speed *= CFG.marshal.speedMul;
    this.events.push({ type: 'marshalCry', x: s.x, y: s.y + 3, z: s.z });
    for (const side of [-1, 1]) {
      const [x, z] = clampToArea(this.level.area, s.x - Math.sin(s.yaw) * side * 3, s.z + Math.cos(s.yaw) * side * 3, 1);
      const c = this.spawnShade(x, z, false, 'crawler');
      c.target = 'knight';
    }
  }

  private marshalWaves(s: Shade): void {
    this.waves.push({ x: s.x, z: s.z, r: 1.2, life: CFG.marshal.waveLife, hit: false });
    this.events.push({ type: 'wave', x: s.x, z: s.z });
  }

  private stepWaves(dt: number): void {
    const k = this.knight;
    for (const w of this.waves) {
      w.life -= dt;
      w.r += CFG.marshal.waveSpeed * dt;
      if (!w.hit && Math.abs(Math.hypot(k.x - w.x, k.z - w.z) - w.r) < 0.6 && k.y < 0.45 && k.state !== 'dead') {
        w.hit = true;
        this.hurtKnight(w.x, w.z, CFG.marshal.waveDmg);
      }
    }
    this.waves = this.waves.filter((w) => w.life > 0);
  }
}
