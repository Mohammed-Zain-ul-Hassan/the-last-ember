// Gameplay for one chapter of the night. Pure logic: no three.js, deterministic for a given seed and input stream.

import { CONFIG, type KindName } from '../config';
import { Rng } from './rng';
import { buildLayout, occludersOf, type Occluder, type Prop } from './layout';
import { LightGrid, isLit, litBySun, type LightQuery, type PointLightState, type SunState } from './light';
import { CHAPTERS, MEMORIES, type Chapter } from './chapters';

export interface Input {
  mx: number; // desired move on the ground, length <= 1
  mz: number;
  aimX: number; // world point the knight faces / swings toward
  aimZ: number;
  attack: boolean; // pressed this tick
  dash: boolean;
  flare: boolean;
}

export const NO_INPUT: Input = { mx: 0, mz: 0, aimX: 0, aimZ: 1, attack: false, dash: false, flare: false };

export type GameEvent =
  | { type: 'swing'; step: number; x: number; z: number; angle: number }
  | { type: 'hit'; x: number; z: number; heavy: boolean; kill: boolean; kind: KindName }
  | { type: 'immune'; x: number; z: number }
  | { type: 'shadeDie'; x: number; z: number; kind: KindName; burned: boolean }
  | { type: 'spawn'; x: number; z: number; kind: KindName }
  | { type: 'windup'; x: number; z: number; boss: boolean }
  | { type: 'knightHurt'; x: number; z: number; hp: number }
  | { type: 'knightDie'; x: number; z: number }
  | { type: 'dash'; x: number; z: number; angle: number }
  | { type: 'flare'; x: number; z: number; caught: number }
  | { type: 'ember'; x: number; z: number; streak: number }
  | { type: 'memory'; index: number; text: string }
  | { type: 'hearthHit'; x: number; z: number }
  | { type: 'bossSummon'; x: number; z: number }
  | { type: 'sunrise' }
  | { type: 'chooseLight'; amount: number };

export type KnightState = 'free' | 'attack' | 'dash' | 'hurt' | 'dead' | 'scripted';

export interface Knight {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number; // yaw: atan2(dx, dz)
  hp: number;
  state: KnightState;
  stateT: number;
  step: number; // combo step 0..2 (while attacking)
  phase: 'windup' | 'active' | 'recover';
  hitIds: Set<number>;
  chainT: number; // time left to continue the combo
  bufferT: number; // buffered attack press
  dashCd: number;
  dashX: number;
  dashZ: number;
  invuln: number;
  inShadow: boolean;
  moving: number; // 0..1 smoothed speed fraction (for animation)
}

export type ShadeState = 'rise' | 'move' | 'windup' | 'strike' | 'feed' | 'stagger' | 'dead';

export interface Shade {
  id: number;
  kind: KindName;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  hp: number;
  maxHp: number;
  state: ShadeState;
  stateT: number;
  atkCd: number;
  lit: boolean;
  burn: number; // 0..1 smoothed "how much it's burning" for VFX
  facing: number;
  flash: number;
  deadT: number;
  summonIdx: number;
  seed: number;
}

export interface Ember {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  toKnight: boolean;
  memory: boolean;
  alive: boolean;
  worth: number; // burned shades give back less than ones freed by the sword
}

export type Status = 'play' | 'cleared' | 'lost' | 'ending';
export type LoseReason = 'knight' | 'hearth' | null;
export type EndingKind = 'light' | 'shadow' | null;

const TAU = Math.PI * 2;

function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export class World {
  readonly rng: Rng;
  readonly props: Prop[];
  readonly statics: Occluder[];
  readonly grid: LightGrid;
  chapter: Chapter;
  chIndex: number;
  t = 0;
  status: Status = 'play';
  loseReason: LoseReason = null;
  ending: EndingKind = null;
  knight: Knight;
  shades: Shade[] = [];
  embers: Ember[] = [];
  events: GameEvent[] = [];
  fuel: number = CONFIG.hearth.fuelStart;
  torchEmbers: number = CONFIG.torch.embersStart;
  flareT = 0;
  flareCd = 0;
  fire: PointLightState = { x: 0, z: 0, h: 2, r: 15 };
  sun: SunState = { on: false, dx: -1, dz: 0, elev: 0.1, edge: -Infinity };
  /** set by cutscenes to drive the light directly */
  fireOverride: PointLightState | null = null;
  scripted = false;
  godMode = false;
  freed = 0;
  memoryIdx = 0;
  memoriesThisChapter = 0;
  emberStreak = 0;
  emberStreakT = 0;
  boss: Shade | null = null;
  bossDeadT = -1;
  dawnT = -1;
  chooseT = 0;
  sunriseFired = false;
  stats = { kills: 0, burned: 0, flares: 0, hurt: 0 };
  private nextId = 1;
  private spawnAcc = 0;
  private gridT = 0;
  private flowT = 0;
  private flowGoal = { x: 0, z: 0 };
  private fireOcc: Occluder[] = [];
  private sunOcc: Occluder[] = [];
  private knightOcc: Occluder = { x: 0, z: 0, r: CONFIG.knight.radius, h: CONFIG.knight.height };

  constructor(seed: number, chIndex = 0, carry?: { fuel?: number; torchEmbers?: number; memoryIdx?: number; freed?: number }) {
    this.rng = new Rng(seed);
    this.props = buildLayout();
    this.statics = occludersOf(this.props);
    this.grid = new LightGrid(CONFIG.arena.radius, CONFIG.arena.cell, this.statics);
    this.chIndex = Math.max(0, Math.min(CHAPTERS.length - 1, chIndex));
    this.chapter = CHAPTERS[this.chIndex];
    if (carry?.fuel !== undefined) this.fuel = carry.fuel;
    if (carry?.torchEmbers !== undefined) this.torchEmbers = carry.torchEmbers;
    if (carry?.memoryIdx !== undefined) this.memoryIdx = carry.memoryIdx;
    if (carry?.freed !== undefined) this.freed = carry.freed;
    const startZ = this.chapter.mode === 'hearth' ? 3.2 : 2.2;
    this.knight = {
      x: 0,
      z: startZ,
      vx: 0,
      vz: 0,
      facing: 0,
      hp: CONFIG.knight.hp,
      state: 'free',
      stateT: 0,
      step: 0,
      phase: 'windup',
      hitIds: new Set(),
      chainT: 0,
      bufferT: 0,
      dashCd: 0,
      dashX: 0,
      dashZ: 1,
      invuln: 0,
      inShadow: false,
      moving: 0,
    };
    if (this.chapter.boss) this.spawnBoss();
    this.updateLight(0);
    this.grid.rebuildLight(this.query());
    this.rebuildFlow();
  }

  get mode() {
    return this.chapter.mode;
  }

  /** 0..1 how far through the chapter the clock is. */
  progress(): number {
    const ch = this.chapter;
    if (ch.boss && this.boss) return Math.min(0.97, 0.05 + 0.92 * (1 - this.boss.hp / this.boss.maxHp));
    if (ch.boss) return 1;
    if (ch.mode === 'dawn') {
      if (this.dawnT < 0) return Math.min(0.5, this.t / 40);
      return Math.min(1, 0.5 + (0.5 * this.dawnT) / CONFIG.dawn.sweepTime);
    }
    return Math.min(1, this.t / ch.duration);
  }

  query(): LightQuery {
    return { fire: this.fire, fireOccluders: this.fireOcc, sun: this.sun.on ? this.sun : null, sunOccluders: this.sunOcc };
  }

  isLit(x: number, z: number): boolean {
    return isLit(this.query(), x, z);
  }

  /** Flare envelope 0..1: snaps up, eases down. */
  flareK(): number {
    if (this.flareT <= 0) return 0;
    const d = CONFIG.flare.duration;
    const age = d - this.flareT;
    const up = Math.min(1, age / 0.12);
    const down = Math.min(1, this.flareT / (d * 0.6));
    return up * down;
  }

  private updateLight(dt: number): void {
    const H = CONFIG.hearth;
    const ch = this.chapter;
    const k = this.knight;
    const fk = this.flareK();
    if (this.fireOverride) {
      this.fire = { ...this.fireOverride };
    } else if (ch.mode === 'hearth') {
      const f = Math.max(0, Math.min(1, this.fuel / H.fuelMax));
      let h = (H.heightMin + (H.heightMax - H.heightMin) * f) * (1 - 0.18 * ch.dim);
      let r = (H.radiusMin + (H.radiusMax - H.radiusMin) * f) * (1 - 0.3 * ch.dim);
      h = h + (CONFIG.flare.height - h) * fk;
      r = r * (1 + (CONFIG.flare.radiusMul - 1) * fk);
      this.fire = { x: 0, z: 0, h, r };
    } else {
      const T = CONFIG.torch;
      const ef = Math.max(0, Math.min(1, this.torchEmbers / T.embersMax));
      let r = (T.radiusMin + (T.radius - T.radiusMin) * (0.35 + 0.65 * ef)) * (1 - 0.25 * ch.dim);
      let h = T.height;
      h = h + (CONFIG.flare.height * 0.75 - h) * fk;
      r = r * (1 + (CONFIG.flare.radiusMul - 1) * fk);
      // the torch is held a little ahead of the knight
      this.fire = { x: k.x + Math.sin(k.facing) * 0.35, z: k.z + Math.cos(k.facing) * 0.35, h, r };
    }

    // sun: sunset (7 PM) and dawn (5 AM)
    if (ch.sunset && !this.fireOverride) {
      const e = 0.13 * Math.max(0, 1 - this.t / 30);
      this.sun = { on: e > 0.012, dx: -0.94, dz: -0.34, elev: e, edge: -Infinity };
    } else if (ch.mode === 'dawn' && this.dawnT >= 0) {
      const D = CONFIG.dawn;
      const p = Math.min(1, this.dawnT / D.sweepTime);
      const R = CONFIG.arena.radius + 4;
      // the ridge's shadow tip: everything nearer the ridge than this is still in its shadow
      const tip = -R + 2 * R * p;
      const elev = Math.atan(D.ridgeHeight / (D.ridgeDist - tip));
      this.sun = { on: true, dx: 0.96, dz: -0.28, elev, edge: -Infinity, ridge: tip };
    } else {
      this.sun = { on: false, dx: 1, dz: 0, elev: 0.1, edge: -Infinity };
    }

    this.knightOcc.x = k.x;
    this.knightOcc.z = k.z;
    const knightCasts = ch.mode === 'hearth' && k.state !== 'dead';
    this.fireOcc = knightCasts ? [...this.statics, this.knightOcc] : this.statics;
    this.sunOcc = k.state !== 'dead' ? [...this.statics, this.knightOcc] : this.statics;
    void dt;
  }

  private rebuildFlow(): void {
    const k = this.knight;
    const toHearth = this.chapter.mode === 'hearth';
    this.flowGoal = toHearth ? { x: 0, z: 0 } : { x: k.x, z: k.z };
    this.grid.rebuildFlow(this.flowGoal.x, this.flowGoal.z, toHearth ? CONFIG.hearth.radius + 1.0 : 1.2, CONFIG.shade.litCost);
  }

  step(dt: number, input: Input): void {
    this.events.length = 0;
    if (this.status === 'lost' || this.status === 'ending') {
      this.updateEmbers(dt);
      this.updateDying(dt);
      return;
    }
    this.t += dt;
    const ch = this.chapter;

    // time eats the fire
    if (ch.mode === 'hearth' && !this.scripted && !this.godMode) this.fuel = Math.max(0, this.fuel - ch.fuelDrain * dt);
    if (this.flareT > 0) this.flareT = Math.max(0, this.flareT - dt);
    if (this.flareCd > 0) this.flareCd = Math.max(0, this.flareCd - dt);
    if (this.emberStreakT > 0) this.emberStreakT -= dt;
    else this.emberStreak = 0;

    // dawn
    if (ch.mode === 'dawn' && this.dawnT < 0 && this.t > 22) {
      this.dawnT = 0;
    }
    if (this.dawnT >= 0) {
      this.dawnT += dt;
      if (!this.sunriseFired) {
        this.sunriseFired = true;
        this.events.push({ type: 'sunrise' });
      }
    }

    this.updateLight(dt);
    this.gridT -= dt;
    if (this.gridT <= 0) {
      this.gridT = this.sun.on ? CONFIG.arena.lightGridEvery * 2 : CONFIG.arena.lightGridEvery;
      this.grid.rebuildLight(this.query());
    }
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.2;
      this.rebuildFlow();
    }

    if (!this.scripted) {
      this.updateKnight(dt, input);
      this.updateSpawns(dt);
    }
    this.updateShades(dt);
    this.updateEmbers(dt);
    this.updateDying(dt);
    this.checkEnd(dt);
  }

  // ---------------------------------------------------------------- knight

  private updateKnight(dt: number, input: Input): void {
    const K = CONFIG.knight;
    const k = this.knight;
    if (k.state === 'dead') return;
    k.stateT += dt;
    if (k.dashCd > 0) k.dashCd -= dt;
    if (k.invuln > 0) k.invuln -= dt;
    if (k.chainT > 0) k.chainT -= dt;
    if (k.bufferT > 0) k.bufferT -= dt;
    if (input.attack) k.bufferT = 0.22;
    k.inShadow = !this.isLit(k.x, k.z);

    // facing toward the aim point
    const ax = input.aimX - k.x;
    const az = input.aimZ - k.z;
    const aimLen = Math.hypot(ax, az);
    const aimAngle = aimLen > 0.3 ? Math.atan2(ax, az) : k.facing;

    // flare
    if (input.flare && this.flareCd <= 0) this.tryFlare();

    // dash (cancels attack recovery)
    if (input.dash && k.dashCd <= 0 && (k.state === 'free' || (k.state === 'attack' && k.phase !== 'active'))) {
      let dx = input.mx;
      let dz = input.mz;
      if (Math.hypot(dx, dz) < 0.2) {
        dx = Math.sin(aimAngle);
        dz = Math.cos(aimAngle);
      }
      const l = Math.hypot(dx, dz);
      k.dashX = dx / l;
      k.dashZ = dz / l;
      k.state = 'dash';
      k.stateT = 0;
      k.dashCd = K.dashCooldown;
      k.invuln = Math.max(k.invuln, K.dashTime + 0.08);
      k.facing = Math.atan2(k.dashX, k.dashZ);
      this.events.push({ type: 'dash', x: k.x, z: k.z, angle: k.facing });
    }

    // start / chain attacks
    if (k.bufferT > 0 && (k.state === 'free' || (k.state === 'attack' && k.phase === 'recover' && k.step < 2))) {
      const next = k.state === 'attack' ? k.step + 1 : k.chainT > 0 ? (k.step + 1) % 3 : 0;
      k.state = 'attack';
      k.step = next;
      k.phase = 'windup';
      k.stateT = 0;
      k.hitIds.clear();
      k.bufferT = 0;
      k.facing = aimAngle;
    }

    let wantX = input.mx;
    let wantZ = input.mz;
    const wl = Math.hypot(wantX, wantZ);
    if (wl > 1) {
      wantX /= wl;
      wantZ /= wl;
    }
    let speed = K.speed * (k.inShadow ? K.shadowSpeedMul : 1);

    if (k.state === 'dash') {
      k.vx = k.dashX * K.dashSpeed;
      k.vz = k.dashZ * K.dashSpeed;
      if (k.stateT >= K.dashTime) {
        k.state = 'free';
        k.stateT = 0;
        k.vx *= 0.3;
        k.vz *= 0.3;
      }
    } else if (k.state === 'attack') {
      const c = K.combo[k.step];
      speed *= 0.2;
      if (k.phase === 'windup' && k.stateT >= c.windup) {
        k.phase = 'active';
        k.stateT = 0;
        k.vx += Math.sin(k.facing) * K.lunge * (k.step === 2 ? 1.6 : 1);
        k.vz += Math.cos(k.facing) * K.lunge * (k.step === 2 ? 1.6 : 1);
        this.events.push({ type: 'swing', step: k.step, x: k.x, z: k.z, angle: k.facing });
      }
      if (k.phase === 'active') {
        this.swordHits(c.range, c.arc, c.damage, c.knock, k.step === 2);
        if (k.stateT >= c.active) {
          k.phase = 'recover';
          k.stateT = 0;
        }
      } else if (k.phase === 'recover' && k.stateT >= c.recover) {
        k.state = 'free';
        k.stateT = 0;
        k.chainT = k.step < 2 ? K.chainWindow : 0;
      }
    } else if (k.state === 'hurt') {
      speed *= 0.4;
      if (k.stateT > 0.22) {
        k.state = 'free';
        k.stateT = 0;
      }
    }

    if (k.state === 'free' || k.state === 'attack' || k.state === 'hurt') {
      const tx = wantX * speed;
      const tz = wantZ * speed;
      const a = K.accel * dt;
      const dvx = tx - k.vx;
      const dvz = tz - k.vz;
      const dl = Math.hypot(dvx, dvz);
      if (dl <= a) {
        k.vx = tx;
        k.vz = tz;
      } else {
        k.vx += (dvx / dl) * a;
        k.vz += (dvz / dl) * a;
      }
      if (k.state === 'free') {
        if (aimLen > 0.3 && (input.attack || wl < 0.1 || this.aimFacing)) k.facing = aimAngle;
        else if (wl > 0.1) k.facing = Math.atan2(wantX, wantZ);
      }
    }

    k.x += k.vx * dt;
    k.z += k.vz * dt;
    this.collide(k, K.radius);
    const sp = Math.hypot(k.vx, k.vz) / K.speed;
    k.moving += (Math.min(1, sp) - k.moving) * Math.min(1, dt * 10);
  }

  /** When true the knight always faces the aim point (mouse play); the bot leaves it off. */
  aimFacing = true;

  private swordHits(range: number, arc: number, dmg: number, knock: number, heavy: boolean): void {
    const k = this.knight;
    for (const s of this.shades) {
      if (s.state === 'dead' || s.state === 'rise' || k.hitIds.has(s.id)) continue;
      const dx = s.x - k.x;
      const dz = s.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d > range + s.r) continue;
      const a = Math.atan2(dx, dz);
      if (d > s.r + 0.5 && Math.abs(angDiff(a, k.facing)) > arc / 2) continue;
      k.hitIds.add(s.id);
      if (s.kind === 'boss' && !s.lit) {
        this.events.push({ type: 'immune', x: s.x, z: s.z });
        continue;
      }
      s.hp -= dmg;
      s.flash = 1;
      const kb = s.kind === 'boss' ? knock * 0.15 : s.kind === 'brute' ? knock * 0.45 : knock;
      s.vx += (dx / (d || 1)) * kb;
      s.vz += (dz / (d || 1)) * kb;
      const kill = s.hp <= 0;
      if (s.kind !== 'boss' && !kill) {
        s.state = 'stagger';
        s.stateT = 0;
      }
      this.events.push({ type: 'hit', x: s.x, z: s.z, heavy: heavy || kill, kill, kind: s.kind });
      if (kill) this.killShade(s, false);
    }
  }

  private tryFlare(): void {
    const F = CONFIG.flare;
    const hearth = this.chapter.mode === 'hearth';
    const have = hearth ? this.fuel : this.torchEmbers;
    if (have < F.cost * 0.5) return; // a weak flare is still allowed when low, never a free one
    if (hearth) this.fuel = Math.max(1, this.fuel - F.cost);
    else this.torchEmbers = Math.max(0, this.torchEmbers - F.cost);
    this.flareT = F.duration;
    this.flareCd = F.cooldown;
    this.stats.flares++;
    // the light jumps now: shades caught in the new light take a hit
    this.flareT = F.duration - 0.13; // already at full height for the test
    this.updateLight(0);
    this.flareT = F.duration;
    const q = this.query();
    let caught = 0;
    for (const s of this.shades) {
      if (s.state === 'dead' || s.state === 'rise') continue;
      if (isLit(q, s.x, s.z)) {
        caught++;
        s.hp -= F.waveDamage * (s.kind === 'boss' ? 2 : 1);
        s.flash = 1;
        if (s.hp <= 0) this.killShade(s, true);
      }
    }
    this.gridT = 0;
    const L = this.fire;
    this.events.push({ type: 'flare', x: L.x, z: L.z, caught });
  }

  hurtKnight(dmg: number, fromX: number, fromZ: number): void {
    const k = this.knight;
    if (k.invuln > 0 || k.state === 'dead' || k.state === 'scripted') return;
    if (this.godMode) dmg = 0;
    k.hp -= dmg;
    this.stats.hurt++;
    k.invuln = CONFIG.knight.hurtInvuln;
    const dx = k.x - fromX;
    const dz = k.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    k.vx = (dx / d) * 7;
    k.vz = (dz / d) * 7;
    if (k.hp <= 0) {
      k.hp = 0;
      k.state = 'dead';
      k.stateT = 0;
      this.events.push({ type: 'knightDie', x: k.x, z: k.z });
    } else {
      k.state = 'hurt';
      k.stateT = 0;
      this.events.push({ type: 'knightHurt', x: k.x, z: k.z, hp: k.hp });
    }
  }

  // ---------------------------------------------------------------- shades

  private pickKind(): KindName {
    const w = this.chapter.kinds;
    let tot = 0;
    for (const v of Object.values(w)) tot += v ?? 0;
    let r = this.rng.next() * tot;
    for (const [k, v] of Object.entries(w)) {
      r -= v ?? 0;
      if (r <= 0) return k as KindName;
    }
    return 'shade';
  }

  private updateSpawns(dt: number): void {
    const ch = this.chapter;
    if (this.dawnT >= 0) return;
    if (this.t < ch.spawn.delay) return;
    const p = Math.min(1, (this.t - ch.spawn.delay) / Math.max(1, Math.min(60, ch.duration - ch.spawn.delay)));
    const rate = ch.spawn.start + (ch.spawn.end - ch.spawn.start) * p;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const alive = this.shades.filter((s) => s.state !== 'dead').length;
      if (alive >= CONFIG.shade.maxAlive) break;
      this.spawnOne(this.pickKind());
    }
  }

  spawnOne(kind: KindName, near?: { x: number; z: number; r: number }): Shade | null {
    const R = CONFIG.arena.radius;
    const k = this.knight;
    for (let tries = 0; tries < 40; tries++) {
      let x: number;
      let z: number;
      if (near) {
        const a = this.rng.range(0, TAU);
        const rr = this.rng.range(near.r * 0.4, near.r);
        x = near.x + Math.sin(a) * rr;
        z = near.z + Math.cos(a) * rr;
      } else {
        const a = this.rng.range(0, TAU);
        const minR = this.chapter.mode === 'hearth' ? Math.min(R - 3, this.fire.r * 0.7) : R * 0.45;
        const rr = this.rng.range(minR, R - 0.5);
        x = Math.sin(a) * rr;
        z = Math.cos(a) * rr;
      }
      if (Math.hypot(x, z) > R) continue;
      const idx = this.grid.index(x, z);
      if (idx < 0 || this.grid.blocked[idx]) continue;
      if (this.isLit(x, z)) continue;
      if (Math.hypot(x - k.x, z - k.z) < CONFIG.shade.spawnMinFromKnight) continue;
      return this.addShade(kind, x, z);
    }
    return null;
  }

  addShade(kind: KindName, x: number, z: number): Shade {
    const K = CONFIG.kinds[kind];
    const s: Shade = {
      id: this.nextId++,
      kind,
      x,
      z,
      vx: 0,
      vz: 0,
      r: K.radius,
      hp: K.hp,
      maxHp: K.hp,
      state: 'rise',
      stateT: 0,
      atkCd: 0.5,
      lit: false,
      burn: 0,
      facing: Math.atan2(-x, -z),
      flash: 0,
      deadT: 0,
      summonIdx: 0,
      seed: this.rng.next(),
    };
    this.shades.push(s);
    this.events.push({ type: 'spawn', x, z, kind });
    return s;
  }

  private spawnBoss(): void {
    const a = this.rng.range(0, TAU);
    const R = CONFIG.arena.radius - 3;
    this.boss = this.addShade('boss', Math.sin(a) * R, Math.cos(a) * R);
    this.boss.state = 'rise';
  }

  private updateShades(dt: number): void {
    const S = CONFIG.shade;
    const k = this.knight;
    const q = this.query();
    const flareMul = this.flareT > 0 ? CONFIG.flare.burnMul : 1;
    const hearthMode = this.chapter.mode === 'hearth';
    const alive = this.shades.filter((s) => s.state !== 'dead');

    for (const s of alive) {
      const K = CONFIG.kinds[s.kind];
      s.stateT += dt;
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 5);
      if (s.atkCd > 0) s.atkCd -= dt;

      s.lit = isLit(q, s.x, s.z);
      const sunlit = this.sun.on && litBySun(q, s.x, s.z);
      s.burn += ((s.lit ? 1 : 0) - s.burn) * Math.min(1, dt * 8);

      if (s.state === 'rise') {
        if (s.stateT >= (s.kind === 'boss' ? 2.2 : S.riseTime)) {
          s.state = 'move';
          s.stateT = 0;
        }
        continue;
      }

      // light burns
      if (s.lit) {
        let dps = S.burnDps * K.burn * flareMul;
        if (sunlit) dps += CONFIG.dawn.sunBurnDps;
        s.hp -= dps * dt;
        if (s.hp <= 0) {
          this.killShade(s, true);
          continue;
        }
      } else if (s.hp < s.maxHp) {
        s.hp = Math.min(s.maxHp, s.hp + S.darkRegen * dt);
      }

      // boss summons as it weakens
      if (s.kind === 'boss') {
        const th = CONFIG.boss.summonAt[s.summonIdx];
        if (th !== undefined && s.hp / s.maxHp < th) {
          s.summonIdx++;
          this.events.push({ type: 'bossSummon', x: s.x, z: s.z });
          for (let i = 0; i < CONFIG.boss.summonCount; i++) this.spawnOne(i % 3 === 0 ? 'shade' : 'wisp');
        }
      }

      // targeting
      const dk = Math.hypot(k.x - s.x, k.z - s.z);
      const knightAlive = k.state !== 'dead';
      const reachK = (s.kind === 'boss' ? 2.6 : S.attackRange) + s.r;
      const goKnight = knightAlive && (!hearthMode || dk < 3.6 + s.r);
      const dh = Math.hypot(s.x, s.z);
      const reachH = CONFIG.hearth.radius + s.r + 0.25;

      if (s.state === 'stagger') {
        s.vx *= Math.exp(-dt * 6);
        s.vz *= Math.exp(-dt * 6);
        if (s.stateT > 0.28) {
          s.state = 'move';
          s.stateT = 0;
        }
      } else if (s.state === 'windup') {
        s.vx *= Math.exp(-dt * 10);
        s.vz *= Math.exp(-dt * 10);
        if (s.stateT >= (s.kind === 'boss' ? 0.9 : S.windup)) {
          s.state = 'strike';
          s.stateT = 0;
          if (knightAlive && dk <= reachK + 0.5) this.hurtKnight(s.kind === 'boss' ? 2 : S.damage, s.x, s.z);
        }
      } else if (s.state === 'strike') {
        if (s.stateT > 0.25) {
          s.state = 'move';
          s.stateT = 0;
          s.atkCd = s.kind === 'boss' ? 1.6 : S.attackCooldown;
        }
      } else if (s.state === 'feed') {
        s.vx *= 0.8;
        s.vz *= 0.8;
        if (!this.godMode && !this.scripted) this.fuel = Math.max(0, this.fuel - CONFIG.hearth.feedDrain * dt);
        if (this.rng.next() < dt * 2.5) this.events.push({ type: 'hearthHit', x: s.x, z: s.z });
        if (dh > reachH + 0.6 || (goKnight && dk < reachK)) {
          s.state = 'move';
          s.stateT = 0;
        }
      } else if (s.state === 'move') {
        let dirX = 0;
        let dirZ = 0;
        if (goKnight && (dk < 4 || !hearthMode)) {
          if (dk < reachK && s.atkCd <= 0) {
            s.state = 'windup';
            s.stateT = 0;
            this.events.push({ type: 'windup', x: s.x, z: s.z, boss: s.kind === 'boss' });
          }
          if (dk < 4.5) {
            dirX = (k.x - s.x) / (dk || 1);
            dirZ = (k.z - s.z) / (dk || 1);
          }
        } else if (hearthMode && dh < reachH) {
          s.state = 'feed';
          s.stateT = 0;
        }
        if (dirX === 0 && dirZ === 0) {
          const idx = this.grid.index(s.x, s.z);
          if (idx >= 0 && (this.grid.dirX[idx] !== 0 || this.grid.dirZ[idx] !== 0)) {
            dirX = this.grid.dirX[idx];
            dirZ = this.grid.dirZ[idx];
          } else {
            const gx = this.flowGoal.x - s.x;
            const gz = this.flowGoal.z - s.z;
            const gl = Math.hypot(gx, gz) || 1;
            dirX = gx / gl;
            dirZ = gz / gl;
          }
        }
        // separation
        for (const o of alive) {
          if (o === s || o.state === 'dead') continue;
          const ox = s.x - o.x;
          const oz = s.z - o.z;
          const d2 = ox * ox + oz * oz;
          const min = s.r + o.r + 0.15;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            dirX += (ox / d) * S.separation * (1 - d / min) * 2;
            dirZ += (oz / d) * S.separation * (1 - d / min) * 2;
          }
        }
        const dl = Math.hypot(dirX, dirZ) || 1;
        const sp = K.speed * (s.lit ? S.lightSpeedMul : 1) * (s.kind === 'wisp' ? 1 + 0.15 * Math.sin(this.t * 7 + s.seed * 20) : 1);
        const tx = (dirX / dl) * sp;
        const tz = (dirZ / dl) * sp;
        s.vx += (tx - s.vx) * Math.min(1, dt * 6);
        s.vz += (tz - s.vz) * Math.min(1, dt * 6);
        if (Math.hypot(s.vx, s.vz) > 0.2) {
          const want = Math.atan2(s.vx, s.vz);
          s.facing += angDiff(want, s.facing) * Math.min(1, dt * 8);
        }
      }
      if (s.state === 'windup' || s.state === 'feed') {
        const tx = s.state === 'feed' ? -s.x : k.x - s.x;
        const tz = s.state === 'feed' ? -s.z : k.z - s.z;
        s.facing += angDiff(Math.atan2(tx, tz), s.facing) * Math.min(1, dt * 10);
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      this.collide(s, s.r);
    }
  }

  private collide(e: { x: number; z: number; vx: number; vz: number }, r: number): void {
    for (const o of this.statics) {
      const dx = e.x - o.x;
      const dz = e.z - o.z;
      const min = o.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        e.x = o.x + (dx / d) * min;
        e.z = o.z + (dz / d) * min;
      }
    }
    // the hearth
    const hd = Math.hypot(e.x, e.z);
    const hmin = CONFIG.hearth.radius * 0.8 + r;
    if (hd < hmin) {
      const d = hd || 0.001;
      e.x = (e.x / d) * hmin;
      e.z = (e.z / d) * hmin;
    }
    const R = CONFIG.arena.radius;
    if (hd > R) {
      e.x = (e.x / hd) * R;
      e.z = (e.z / hd) * R;
    }
  }

  killShade(s: Shade, burned: boolean): void {
    if (s.state === 'dead') return;
    s.state = 'dead';
    s.deadT = 0;
    s.hp = 0;
    this.stats.kills++;
    if (burned) this.stats.burned++;
    this.events.push({ type: 'shadeDie', x: s.x, z: s.z, kind: s.kind, burned });
    const n = s.kind === 'boss' ? 8 : s.kind === 'brute' ? 2 : 1;
    this.freed += s.kind === 'wisp' ? 0.5 : 1;
    let memory = false;
    if (this.freed >= (this.memoryIdx + 1) * 6 && this.memoryIdx < MEMORIES.length && this.memoriesThisChapter < 2) {
      memory = true;
    }
    for (let i = 0; i < n; i++) {
      this.embers.push({
        x: s.x,
        y: 0.8,
        z: s.z,
        vx: this.rng.range(-2, 2),
        vy: this.rng.range(4, 6.5),
        vz: this.rng.range(-2, 2),
        t: 0,
        toKnight: this.chapter.mode !== 'hearth',
        memory: memory && i === 0,
        alive: true,
        worth: burned ? 0.35 : 1,
      });
    }
    if (memory) {
      this.memoriesThisChapter++;
      const idx = this.memoryIdx++;
      this.events.push({ type: 'memory', index: idx, text: MEMORIES[idx] });
    }
    if (s === this.boss) this.bossDeadT = 0;
  }

  private updateEmbers(dt: number): void {
    const k = this.knight;
    for (const e of this.embers) {
      if (!e.alive) continue;
      e.t += dt;
      const tx = e.toKnight ? k.x : 0;
      const tz = e.toKnight ? k.z : 0;
      const ty = e.toKnight ? 2.2 : 1.6;
      const dx = tx - e.x;
      const dy = ty - e.y;
      const dz = tz - e.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const pull = Math.min(1, e.t / 0.6) * 46;
      e.vx += (dx / d) * pull * dt;
      e.vy += (dy / d) * pull * dt - (e.t < 0.4 ? 6 * dt : 0);
      e.vz += (dz / d) * pull * dt;
      const drag = Math.exp(-dt * 2.2);
      e.vx *= drag;
      e.vy *= drag;
      e.vz *= drag;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
      if ((d < 0.7 && e.t > 0.3) || e.t > 4) {
        e.alive = false;
        if (e.toKnight) this.torchEmbers = Math.min(CONFIG.torch.embersMax, this.torchEmbers + CONFIG.torch.emberGain * e.worth);
        else this.fuel = Math.min(CONFIG.hearth.fuelMax, this.fuel + CONFIG.hearth.emberFuel * e.worth);
        this.emberStreak++;
        this.emberStreakT = 1.5;
        this.events.push({ type: 'ember', x: e.x, z: e.z, streak: this.emberStreak });
      }
    }
    if (this.embers.length > 64) this.embers = this.embers.filter((e) => e.alive);
  }

  private updateDying(dt: number): void {
    for (const s of this.shades) if (s.state === 'dead') s.deadT += dt;
    if (this.shades.length > 60) this.shades = this.shades.filter((s) => s.state !== 'dead' || s.deadT < 1.2);
    if (this.knight.state === 'dead') this.knight.stateT += dt;
  }

  private checkEnd(dt: number): void {
    const ch = this.chapter;
    const k = this.knight;
    if (k.state === 'dead') {
      this.status = 'lost';
      this.loseReason = 'knight';
      return;
    }
    if (ch.mode === 'hearth' && this.fuel <= 0 && !this.scripted) {
      this.status = 'lost';
      this.loseReason = 'hearth';
      return;
    }
    if (ch.boss) {
      if (this.bossDeadT >= 0) {
        this.bossDeadT += dt;
        if (this.bossDeadT > 2.5) this.status = 'cleared';
      }
      return;
    }
    if (ch.mode === 'dawn') {
      if (this.dawnT < 0) return;
      // the choice: stand in the sun and be unmade, or keep to a shadow until the sun has passed
      const q: LightQuery = { fire: null, fireOccluders: [], sun: this.sun, sunOccluders: this.statics };
      const inSun = litBySun(q, k.x, k.z);
      if (inSun) this.chooseT += dt;
      else this.chooseT = Math.max(0, this.chooseT - dt * 1.5);
      this.events.push({ type: 'chooseLight', amount: this.chooseT / CONFIG.dawn.chooseTime });
      if (this.chooseT >= CONFIG.dawn.chooseTime) {
        this.status = 'ending';
        this.ending = 'light';
        k.state = 'scripted';
      } else if (this.dawnT > CONFIG.dawn.sweepTime + 6) {
        this.status = 'ending';
        this.ending = 'shadow';
        k.state = 'scripted';
      }
      return;
    }
    if (this.t >= ch.duration) this.status = 'cleared';
  }

  /** 0..1 how much trouble the flame is in: drives the music's tension layer. */
  danger(): number {
    const k = this.knight;
    const gx = this.chapter.mode === 'hearth' ? 0 : k.x;
    const gz = this.chapter.mode === 'hearth' ? 0 : k.z;
    let near = 0;
    for (const s of this.shades) {
      if (s.state === 'dead' || s.state === 'rise') continue;
      const d = Math.hypot(s.x - gx, s.z - gz);
      near += Math.max(0, 1 - d / 14) * (s.kind === 'brute' ? 2 : s.kind === 'boss' ? 4 : 1);
    }
    let d = Math.min(1, near / 8);
    if (this.chapter.mode === 'hearth') d = Math.max(d, 1 - this.fuel / 35);
    d = Math.max(d, 1 - k.hp / 3);
    if (this.chapter.boss && this.boss && this.boss.state !== 'dead') d = Math.max(d, 0.6);
    return Math.max(0, Math.min(1, d));
  }

  snapshot() {
    const k = this.knight;
    return {
      chapter: this.chapter.id,
      t: +this.t.toFixed(2),
      status: this.status,
      loseReason: this.loseReason,
      ending: this.ending,
      fuel: +this.fuel.toFixed(1),
      torchEmbers: +this.torchEmbers.toFixed(1),
      knight: { x: +k.x.toFixed(2), z: +k.z.toFixed(2), hp: k.hp, state: k.state, inShadow: k.inShadow },
      fire: { h: +this.fire.h.toFixed(2), r: +this.fire.r.toFixed(2) },
      shades: this.shades.filter((s) => s.state !== 'dead').length,
      boss: this.boss ? +this.boss.hp.toFixed(1) : null,
      freed: this.freed,
      memories: this.memoryIdx,
      stats: { ...this.stats },
    };
  }
}
