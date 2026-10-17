// One district of the Still City, simulated: him and the flame he carries, the frozen people and their true angles,
// replays and stepping into them, Ash, braziers and wall torches, mechanisms, his own shadow as a bridge, the
// Wrong Shadow, rewind. Pure (no three), fixed step, deterministic for a given input stream, so a rewind is exact.

import { clampToArea, cyl, firstHit, overlaps, pushOut, segmentHit, STEP, type Solid } from '../../sim/geom';
import { placeAt } from '../../sim/pose';
import { bodyShadow, pointInPoly, solidShadow, type Pt } from './shadowcast';
import { FLAME, flameState, flameTarget, litRangeFor, radiusFor } from './flame';
import { buildGraph, steer, type WalkGraph } from './wrong';
import { DIFFICULTY, type StillDifficulty } from '../../config';
import { inRect, type District, type FigureDef, type MechDef, type Pit, type Plate, type Spot } from './types';

export const DT = 1 / 60;
// how the flame he carries sets his pace: held low he goes carefully (a low light, eyes on the ground), held up he
// walks, drawn back (Shift: the flame sheltered behind him) he runs, which is how the chases are played
export const BODY = { r: 0.32, h: 1.8, careful: 2.2, speed: 3.5, run: 5.6, ghostSpeed: 3.8, accel: 12, gravity: -24 };
export const ASH = { start: 5, max: 5, wake: 1, stepIn: 2, rewind: 1 };
const ALIGN = { tol: 12, exit: 4, size: 30, feel: 35 }; // the hold time and a tolerance scale come from the difficulty
const REACH = 1.8; // how close he must be to a brazier, torch or lever to use it
const STEP_HOLD = 0.6; // hold E this long to step into a replay
const REWIND_HOLD = 0.35;
const REWIND_SPAN = 5;
const HISTORY_EVERY = 0.25;
const RELIGHT = 1.2;

export interface StillInput {
  mx: number; // movement on x/z, already turned by the camera (length <= 1)
  mz: number;
  yaw: number; // the camera's heading: the flame swings with it
  pitch: number; // the camera's pitch (positive looks down): looking up lifts the flame
  trim: number; // the wheel: -1..1
  back: boolean; // Shift: the flame drawn back
  act: boolean; // E or a click, pressed this step
  actHeld: boolean;
  rewindHeld: boolean;
  cam: [number, number, number]; // the camera, for what is seen
  frustum: number[]; // its six planes (nx, ny, nz, d) x 6, pointing inward: on screen is n.p + d >= 0 for all
}
export const NO_INPUT: StillInput = { mx: 0, mz: 0, yaw: 0, pitch: 0.4, trim: 0, back: false, act: false, actHeld: false, rewindHeld: false, cam: [0, 5, 10], frustum: [] };

export type FigState = 'frozen' | 'replay' | 'ghost';
export interface FigRt {
  state: FigState;
  t: number; // replay time
  align: number; // 0..1: how near the flame is to its true angle (the hum)
  delta: number; // degrees off
  held: number;
  locked: boolean; // at its true angle (held long enough)
  found: boolean;
  woke: boolean;
}

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  onGround: boolean;
}

export interface Ghost {
  fig: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  t: number;
  done: number; // seconds since its last spot was done (it ends soon after)
  acting: number; // > 0 while performing a spot (the pull)
}

export interface Wrong {
  on: boolean;
  gone: boolean;
  x: number;
  z: number;
  yaw: number;
  seen: boolean;
  lit: boolean;
  moving: boolean;
  seenOnce: boolean;
  unseenT: number;
  cool: number;
  tgt: [number, number] | null;
  think: number;
  moved: boolean; // has it ever moved (the Market's first shift)
  dist: number;
  stride: number; // metres walked (its footsteps, half a beat late)
}

export type Focus =
  | { kind: 'wake'; fig: number; cost: number }
  | { kind: 'stepIn'; fig: number; cost: number }
  | { kind: 'spot'; spot: Spot }
  | { kind: 'brazier'; i: number; lit: boolean }
  | { kind: 'torch'; i: number }
  | { kind: 'lever'; mech: number }
  | { kind: 'riddle'; i: number };

export type CityEvent =
  | { type: 'found'; fig: number }
  | { type: 'wake'; fig: number }
  | { type: 'replayEnd'; fig: number }
  | { type: 'stepIn'; fig: number }
  | { type: 'stepOut'; fig: number }
  | { type: 'spot'; id: string; ok: boolean; msg?: string }
  | { type: 'flag'; id: string }
  | { type: 'brazier'; i: number; first: boolean }
  | { type: 'falseBrazier'; i: number }
  | { type: 'relight' }
  | { type: 'relit' }
  | { type: 'flameLow' }
  | { type: 'flameOut' }
  | { type: 'noAsh'; need: number }
  | { type: 'rewind' }
  | { type: 'fall' }
  | { type: 'dead'; cause: 'fall' | 'caught' }
  | { type: 'respawn' }
  | { type: 'wrongAppear' }
  | { type: 'wrongSeen' }
  | { type: 'wrongLit' }
  | { type: 'wrongShift' }
  | { type: 'wrongGone' }
  | { type: 'wrongStep' }
  | { type: 'caught'; n: number }
  | { type: 'gustWarn'; i: number }
  | { type: 'gust'; i: number; hit: boolean }
  | { type: 'riddle'; i: number }
  | { type: 'frozenTry'; mech: number }
  | { type: 'line'; id: string }
  | { type: 'plate'; id: string }
  | { type: 'bridge'; on: boolean }
  | { type: 'seqStep'; seq: number; n: number }
  | { type: 'seqFail'; seq: number }
  | { type: 'pageSide'; i: number }
  | { type: 'pageRead'; i: number }
  | { type: 'debrisWarn'; x: number; z: number }
  | { type: 'debris'; x: number; z: number; hit: boolean }
  | { type: 'exit' };

export interface CityState {
  t: number;
  body: Body;
  flame: { x: number; y: number; z: number; vigor: number; relight: number; back: boolean };
  ash: number;
  figs: FigRt[];
  flags: Record<string, number>; // flag -> the time it was set
  braziers: boolean[];
  ghost: Ghost | null;
  stepHold: number;
  stepArmed: boolean; // E must be let go after a wake before holding it steps in
  rewindHold: number;
  wrong: Wrong;
  bridge: { poly: Pt[]; on: boolean; tip: Pt | null };
  plates: number[]; // seconds each plate has been satisfied
  gusts: number[]; // time of each zone's next gust
  zones: boolean[];
  focus: Focus | null;
  status: 'play' | 'fall' | 'dead' | 'exit';
  statusT: number;
  deaths: number;
  words: boolean[]; // Last Words heard: kept through rewinds, deaths and districts
  fails: Record<string, number>; // per puzzle: failed attempts (the hints read these)
  progress: Record<string, number>; // per puzzle: when it last moved forward
  caughtRun: number; // times caught without lighting it in between (a hint trigger)
  seq: number[]; // progress through each sequence
  debris: { next: number; warned: boolean; x: number; z: number }[];
  pages: { side: boolean; held: number }[];
}

const vlen = (x: number, y: number, z: number) => Math.hypot(x, y, z);
const DEG = 180 / Math.PI;

export class City {
  readonly d: District;
  s: CityState;
  events: CityEvent[] = [];
  private staticSolids: Solid[];
  private figSolids: Solid[];
  private active: Solid[] = [];
  private activeKey = '';
  private graph: WalkGraph | null = null;
  private history: CityState[] = [];
  private historyT = 0;
  private checkpoint: CityState;

  /** Easy or Hard (src/config.ts DIFFICULTY): read every step, so a change in the pause menu holds at once. */
  diff: StillDifficulty;

  constructor(d: District, words: boolean[], ash = ASH.start, diff: StillDifficulty = DIFFICULTY.easy.still) {
    this.d = d;
    this.diff = diff;
    this.staticSolids = d.solids.slice();
    // every statue is solid where it stands while it is frozen (one living again has left its place)
    this.figSolids = d.figures.map((f) => cyl(f.x, f.z, 0.3 * ((f.h ?? 1.8) / 1.8), f.h ?? 1.8, 0, 'figure'));
    const { x, z, yaw } = d.start;
    this.s = {
      t: 0,
      body: { x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, onGround: true },
      flame: { x, y: 2, z, vigor: 1, relight: 0, back: false },
      ash,
      figs: d.figures.map(() => ({ state: 'frozen', t: 0, align: 0, delta: 180, held: 0, locked: false, found: false, woke: false })),
      flags: {},
      braziers: d.braziers.map(() => false),
      ghost: null,
      stepHold: 0,
      stepArmed: true,
      rewindHold: 0,
      wrong: { on: false, gone: false, x: d.wrong?.spawn[0] ?? 0, z: d.wrong?.spawn[1] ?? 0, yaw: 0, seen: false, lit: false, moving: false, seenOnce: false, unseenT: 0, cool: 0, tgt: null, think: 0, moved: false, dist: 99, stride: 0 },
      bridge: { poly: [], on: false, tip: null },
      plates: d.plates.map(() => 0),
      gusts: d.gusts.map((g) => g.period),
      zones: d.zones.map(() => false),
      focus: null,
      status: 'play',
      statusT: 0,
      deaths: 0,
      words: words.slice(),
      fails: {},
      progress: {},
      caughtRun: 0,
      seq: d.sequences.map(() => 0),
      debris: (d.debris ?? []).map(() => ({ next: 0, warned: false, x: 0, z: 0 })),
      pages: d.pages.map(() => ({ side: false, held: 0 })),
    };
    for (const f of d.figures) if (f.word !== undefined && words[f.word]) this.s.figs[d.figures.indexOf(f)].found = true;
    if (d.wrong) this.graph = buildGraph(d.wrong.nodes, this.staticSolids);
    const [fx, fy, fz] = flameTarget(x, 0, z, yaw, 0.4, 0, false);
    Object.assign(this.s.flame, { x: fx, y: fy, z: fz });
    this.checkpoint = structuredClone(this.s);
  }

  // ------------------------------------------------------------------ queries
  /** Every solid in force now: the stones, the statues, and whatever mechanism is still shut. */
  get solids(): Solid[] {
    const key = this.d.mechs.map((m) => (this.mechOpen(m) ? 1 : 0)).join('') + '|' + this.s.figs.map((f, i) => (f.state === 'frozen' && this.present(i) ? 1 : 0)).join('');
    if (key !== this.activeKey) {
      this.activeKey = key;
      this.active = [...this.staticSolids];
      for (const m of this.d.mechs) if (!this.mechOpen(m)) this.active.push(...m.blocks);
      this.s.figs.forEach((f, i) => {
        if (f.state === 'frozen' && this.present(i)) this.active.push(this.figSolids[i]);
      });
      this.stones = this.active.filter((x) => x.tag !== 'figure');
    }
    return this.active;
  }

  /** The solids minus the statues (what can stand between the flame and a statue). */
  private stones: Solid[] = [];
  private get stonesNow(): Solid[] {
    void this.solids;
    return this.stones;
  }

  /** Is a mechanism open? (a shadow door only while the flame is held high near it) */
  mechOpen(m: MechDef): boolean {
    if (m.highIn) {
      const f = this.s.flame;
      return this.lit && inRect(m.highIn, f.x, f.z) && f.y - Math.max(0, this.s.body.y) >= (m.minY ?? 2.8);
    }
    return this.flag(m.opens);
  }

  /** Is this figure in the world yet (some appear only when a page is read)? */
  present(i: number): boolean {
    const h = this.d.figures[i].hiddenUntil;
    return !h || this.flag(h);
  }

  flag(id: string): boolean {
    return this.s.flags[id] !== undefined;
  }

  setFlag(id: string): void {
    if (this.flag(id)) return;
    this.s.flags[id] = this.s.t;
    this.events.push({ type: 'flag', id });
  }

  pitOpen(p: Pit): boolean {
    if (!p.when) return true;
    const at = this.s.flags[p.when];
    return at !== undefined && this.s.t - at >= (p.at ?? 0);
  }

  pitAt(x: number, z: number): Pit | null {
    for (const p of this.d.pits) if (this.pitOpen(p) && inRect(p, x, z)) return p;
    return null;
  }

  get lit(): boolean {
    return this.s.flame.vigor > 0;
  }

  get radius(): number {
    return radiusFor(this.s.flame.vigor);
  }

  /** Where a figure stands and faces now (its replay may walk it). */
  placeOf(i: number): { x: number; z: number; yaw: number } {
    const f = this.d.figures[i];
    const g = this.s.ghost;
    if (g && g.fig === i) return { x: g.x, z: g.z, yaw: g.yaw };
    const rt = this.s.figs[i];
    const rest = { x: f.x, z: f.z, yaw: f.yaw };
    return rt.state === 'replay' && f.clip ? placeAt(f.clip, rt.t, rest) : rest;
  }

  /** The highest standing surface under (x, z) for a body whose feet are at y. */
  floorAt(x: number, z: number, r: number, y: number): number {
    let floor = -Infinity;
    const pit = this.pitAt(x, z);
    if (!pit || this.supported(x, z)) floor = 0;
    else floor = -pit.depth;
    for (const s of this.solids) if (s.y1 <= y + STEP && s.y1 > floor && overlaps(s, x, z, r)) floor = s.y1;
    return floor;
  }

  /** Is this point over a pit held up by his shadow? */
  supported(x: number, z: number): boolean {
    const b = this.s.bridge;
    return b.on && pointInPoly(b.poly, x, z);
  }

  // ------------------------------------------------------------------ the step
  step(inp: StillInput): void {
    this.events.length = 0;
    const s = this.s;
    const dt = DT;
    if (s.status === 'dead') {
      s.statusT += dt;
      if (s.statusT > 2.4) this.respawn();
      return;
    }
    if (s.status === 'exit') return;
    s.t += dt;

    // rewind: hold R (it works while falling, too: the one way back from a missed bridge)
    if (inp.rewindHeld) {
      s.rewindHold += dt;
      if (s.rewindHold >= REWIND_HOLD && s.rewindHold - dt < REWIND_HOLD) {
        if (this.rewind()) return;
      }
    } else s.rewindHold = 0;

    if (s.ghost) this.stepGhost(inp, dt);
    else this.stepBody(inp, dt);
    this.stepFlame(inp, dt);
    this.stepBridge();
    this.stepFigures(dt);
    if (!s.ghost && s.status === 'play') this.stepFocus(inp);
    this.stepZones();
    this.stepPages(dt);
    this.stepPlates(dt);
    this.stepDerive();
    this.stepGusts(dt);
    this.stepDebris();
    this.stepWrong(inp, dt);
    if (s.status === 'fall') {
      s.statusT += dt;
      if (s.body.y < -3.2 || s.statusT > 1.25) this.die('fall');
    }
    if (s.status === 'play' && !s.ghost && inRect(this.d.exit, s.body.x, s.body.z)) {
      s.status = 'exit';
      this.events.push({ type: 'exit' });
    }
    this.historyT += dt;
    if (this.historyT >= HISTORY_EVERY && s.status === 'play') {
      this.historyT = 0;
      this.history.push(structuredClone(s));
      while (this.history.length > REWIND_SPAN / HISTORY_EVERY + 1) this.history.shift();
    }
  }

  /** Walk a body (him, or a ghost) toward its wish, slide along the stones, fall where there is no floor. */
  private move(b: { x: number; z: number; vx: number; vz: number }, wx: number, wz: number, speed: number, dt: number): void {
    const k = 1 - Math.exp(-BODY.accel * dt);
    b.vx += (wx * speed - b.vx) * k;
    b.vz += (wz * speed - b.vz) * k;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const y = 'y' in b ? (b as Body).y : 0;
    for (let pass = 0; pass < 2; pass++)
      for (const s of this.solids) {
        if (s.y1 <= y + STEP || s.y0 >= y + BODY.h - 0.05) continue;
        const p = pushOut(s, b.x, b.z, BODY.r);
        if (!p) continue;
        const nx = p[0] - b.x;
        const nz = p[1] - b.z;
        const nl = Math.hypot(nx, nz);
        if (nl > 1e-6) {
          const vn = (b.vx * nx + b.vz * nz) / nl;
          if (vn < 0) {
            b.vx -= (nx / nl) * vn;
            b.vz -= (nz / nl) * vn;
          }
        }
        b.x = p[0];
        b.z = p[1];
      }
    [b.x, b.z] = clampToArea(this.d.area, b.x, b.z, BODY.r);
  }

  private stepBody(inp: StillInput, dt: number): void {
    const s = this.s;
    const b = s.body;
    const falling = s.status === 'fall';
    const held = s.flame.y - Math.max(0, b.y); // how high the flame is in his hand
    const k = Math.max(0, Math.min(1, (held - 1.35) / 0.6));
    const speed = falling ? 0.6 : inp.back ? BODY.run : BODY.careful + (BODY.speed - BODY.careful) * k;
    const ox = b.x;
    const oz = b.z;
    this.move(b, falling ? 0 : inp.mx, falling ? 0 : inp.mz, speed, dt);
    // the maze: a shadow cannot be walked into (one that swept over him, he can walk out of)
    if (this.d.maze) {
      const polys = this.mazeShadows();
      if (this.blockedByShadow(polys, b.x, b.z) && !this.blockedByShadow(polys, ox, oz)) {
        if (!this.blockedByShadow(polys, b.x, oz)) b.z = oz;
        else if (!this.blockedByShadow(polys, ox, b.z)) b.x = ox;
        else {
          b.x = ox;
          b.z = oz;
        }
        b.vx *= 0.5;
        b.vz *= 0.5;
      }
    }
    // he turns to face where he runs; standing, he turns slowly to where the flame is held
    const sp = Math.hypot(b.vx, b.vz);
    const want = sp > 0.6 ? Math.atan2(b.vz, b.vx) : inp.yaw;
    let d = (want - b.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * Math.min(1, dt * (sp > 0.6 ? 12 : 9));
    // height: the floor (or the pit), solid tops, a step down is walked
    const was = b.onGround;
    const prevY = b.y;
    const floor = this.floorAt(b.x, b.z, BODY.r * 0.6, prevY);
    b.vy += BODY.gravity * dt;
    b.y += b.vy * dt;
    if (b.y <= floor || (was && b.vy <= 0 && prevY - floor <= STEP && prevY >= floor)) {
      b.y = floor;
      b.vy = 0;
      b.onGround = true;
    } else b.onGround = false;
    if (!falling && b.y < -0.5) {
      s.status = 'fall';
      s.statusT = 0;
      this.events.push({ type: 'fall' });
    }
  }

  private stepFlame(inp: StillInput, dt: number): void {
    const s = this.s;
    const f = s.flame;
    const b = s.body;
    // in a replay he stands where he was, holding it still; the light stays with him
    if (!s.ghost) {
      f.back = inp.back;
      // it is in his hand: it goes where his arm can take it, round with him as he turns
      const [tx, ty, tz] = flameTarget(b.x, b.y, b.z, b.yaw, inp.pitch, inp.trim, inp.back);
      const k = 1 - Math.exp(-FLAME.ease * dt);
      f.x += (tx - f.x) * k;
      f.y += (ty - f.y) * k;
      f.z += (tz - f.z) * k;
    }
    const before = flameState(f.vigor);
    if (f.relight > 0) {
      f.relight -= dt;
      if (f.relight <= 0) {
        f.relight = 0;
        f.vigor = 1;
        this.events.push({ type: 'relit' });
      }
    } else if (f.vigor > 0) f.vigor = Math.min(1, f.vigor + FLAME.regen * this.diff.regen * dt);
    const after = flameState(f.vigor);
    if (after !== before && after === 'low') this.events.push({ type: 'flameLow' });
    if (after !== before && after === 'out') this.events.push({ type: 'flameOut' });
  }

  /** Dim the flame (a gust, a fall of dust, the Wrong Shadow's touch). */
  hurtFlame(by: number): void {
    const f = this.s.flame;
    if (f.vigor <= 0) return;
    const before = flameState(f.vigor);
    f.vigor = Math.max(0, f.vigor - by);
    const after = flameState(f.vigor);
    if (after !== before) this.events.push({ type: after === 'out' ? 'flameOut' : 'flameLow' });
  }

  /** His own shadow, and whether it holds him up over a gap (its far end must rest on solid ground). */
  private stepBridge(): void {
    const s = this.s;
    const b = s.body;
    const f = s.flame;
    const br = s.bridge;
    const wasOn = br.on;
    if (!this.lit || s.ghost) {
      br.poly = [];
      br.tip = null;
      br.on = false;
    } else {
      br.poly = bodyShadow(f, b.x, b.z, Math.max(0, b.y), BODY.h, BODY.r * 0.75, 0, this.radius);
      let tip: Pt | null = null;
      let far = -1;
      for (const p of br.poly) {
        const d = Math.hypot(p[0] - b.x, p[1] - b.z);
        if (d > far) {
          far = d;
          tip = p;
        }
      }
      br.tip = tip;
      // a gap is spanned when the shadow's far end lies on floor; it only matters while a pit is near
      const nearPit = this.d.pits.some((p) => this.pitOpen(p) && inRect(p, b.x, b.z, far + 1));
      br.on = !!tip && nearPit && far > 1.2 && !this.pitAt(tip[0], tip[1]);
    }
    const over = !!this.pitAt(b.x, b.z);
    if (br.on !== wasOn && over) this.events.push({ type: 'bridge', on: br.on });
    // the first time a shadow really holds him over a gap (however it was formed): that is the beggar's lesson learned
    if (over && br.on && this.supported(b.x, b.z) && !this.flag('bridged')) {
      this.setFlag('bridged');
      this.events.push({ type: 'bridge', on: true });
    }
  }

  private stepFigures(dt: number): void {
    const s = this.s;
    const f = s.flame;
    const R = this.radius;
    this.d.figures.forEach((def, i) => {
      const rt = s.figs[i];
      if (rt.state === 'replay') {
        rt.t += dt;
        rt.align = 1;
        if (rt.t >= (def.clip?.len ?? 0)) {
          rt.state = 'frozen';
          rt.t = 0;
          rt.woke = true;
          rt.locked = false;
          rt.held = 0;
          this.events.push({ type: 'replayEnd', fig: i });
        }
        return;
      }
      if (rt.state === 'ghost' || !this.present(i)) return;
      const h = def.h ?? 1.8;
      const cx = def.x;
      const cy = h * 0.62;
      const cz = def.z;
      const vfx = f.x - cx;
      const vfy = f.y - cy;
      const vfz = f.z - cz;
      const [lx, ly, lz] = def.light;
      const vlx = lx - cx;
      const vly = ly - cy;
      const vlz = lz - cz;
      const df = vlen(vfx, vfy, vfz);
      const dl = vlen(vlx, vly, vlz);
      const cos = (vfx * vlx + vfy * vly + vfz * vlz) / Math.max(1e-6, df * dl);
      const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
      const delta = angle + Math.abs(Math.log(df / dl)) * ALIGN.size;
      // lit: in reach, and nothing between the flame and him (a point just short of his chest, so he is not his own wall)
      const k = Math.max(0, 1 - 0.4 / Math.max(0.4, df));
      const lit = this.lit && df < R && firstHit(this.stonesNow, f.x, f.y, f.z, f.x - vfx * k, f.y - vfy * k, f.z - vfz * k, true) >= 1;
      const tol = (def.tol ?? ALIGN.tol) * this.diff.alignTol;
      rt.delta = lit ? delta : 180;
      rt.align = lit ? Math.max(0, 1 - delta / ALIGN.feel) : 0;
      const inside = lit && delta < (rt.locked ? tol + ALIGN.exit : tol);
      if (inside) rt.held += dt;
      else rt.held = 0;
      const was = rt.locked;
      rt.locked = inside && rt.held >= this.diff.alignHold;
      if (rt.locked && !was) {
        if (def.lockFlag) this.setFlag(def.lockFlag);
        this.advance(def.id, 'lock');
      }
      if (rt.locked && !was && !rt.found) {
        rt.found = true;
        if (def.word !== undefined) s.words[def.word] = true;
        this.events.push({ type: 'found', fig: i });
        this.setFlag('found:' + def.id);
        if (def.puzzle) s.progress[def.puzzle] = s.t;
      }
    });
  }

  /** What E does here and now; and does it, if pressed. */
  private stepFocus(inp: StillInput): void {
    const s = this.s;
    const b = s.body;
    const d = this.d;
    let focus: Focus | null = null;
    // a replay running that he can step into
    const replay = s.figs.findIndex((rt, i) => rt.state === 'replay' && d.figures[i].stepIn);
    if (!inp.actHeld) s.stepArmed = true;
    if (replay >= 0) {
      focus = { kind: 'stepIn', fig: replay, cost: ASH.stepIn };
      if (inp.actHeld && s.stepArmed) {
        s.stepHold += DT;
        if (s.stepHold >= STEP_HOLD) {
          s.stepHold = 0;
          s.stepArmed = false;
          if (s.ash >= ASH.stepIn) this.stepIn(replay);
          else this.events.push({ type: 'noAsh', need: ASH.stepIn });
        }
      } else s.stepHold = 0;
    } else s.stepHold = 0;
    const near = (x: number, z: number, r = REACH) => Math.hypot(x - b.x, z - b.z) < r;
    if (!focus && flameState(s.flame.vigor) !== 'steady' && s.flame.relight <= 0) {
      const i = d.torches.findIndex((t) => near(t.x, t.z));
      if (i >= 0) focus = { kind: 'torch', i };
    }
    if (!focus) {
      const i = d.braziers.findIndex((br) => near(br.x, br.z));
      if (i >= 0) focus = { kind: 'brazier', i, lit: s.braziers[i] };
    }
    if (!focus) {
      let best = -1;
      let bd = Infinity;
      d.figures.forEach((f, i) => {
        const rt = s.figs[i];
        if (!rt.locked || !f.clip || rt.state !== 'frozen') return;
        const dd = Math.hypot(f.x - b.x, f.z - b.z);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      if (best >= 0) focus = { kind: 'wake', fig: best, cost: ASH.wake };
    }
    if (!focus) {
      const i = d.mechs.findIndex((m) => m.kind === 'lever' && !this.flag(m.opens) && near(m.x, m.z, 1.6));
      if (i >= 0) focus = { kind: 'lever', mech: i };
    }
    if (!focus) {
      const i = d.riddles.findIndex((r) => near(r.x, r.z, 3.2));
      if (i >= 0) focus = { kind: 'riddle', i };
    }
    s.focus = focus;
    if (!inp.act || !focus) return;
    switch (focus.kind) {
      case 'torch':
        s.flame.relight = s.flame.vigor > 0 ? 0.25 : RELIGHT;
        s.flame.vigor = Math.max(0, s.flame.vigor);
        this.events.push({ type: 'relight' });
        break;
      case 'brazier':
        this.useBrazier(focus.i);
        break;
      case 'wake':
        if (s.ash < ASH.wake) {
          this.events.push({ type: 'noAsh', need: ASH.wake });
          break;
        }
        s.ash -= ASH.wake;
        s.figs[focus.fig].state = 'replay';
        s.figs[focus.fig].t = 0;
        this.setFlag('woke:' + d.figures[focus.fig].id);
        this.advance(d.figures[focus.fig].id, 'wake');
        s.stepArmed = false;
        this.events.push({ type: 'wake', fig: focus.fig });
        if (d.figures[focus.fig].puzzle) s.progress[d.figures[focus.fig].puzzle!] = s.t;
        break;
      case 'lever':
        this.events.push({ type: 'frozenTry', mech: focus.mech });
        break;
      case 'riddle':
        this.events.push({ type: 'riddle', i: focus.i });
        this.setFlag('read:' + d.riddles[focus.i].id);
        break;
    }
  }

  /** A figure woken (or held at its angle): the next in a sequence moves it on; any other one starts it over. */
  private advance(id: string, on: 'wake' | 'lock'): void {
    const s = this.s;
    this.d.sequences.forEach((q, k) => {
      if (q.on !== on || this.flag(q.flag) || !q.ids.includes(id)) return;
      if (q.ids[s.seq[k]] === id) {
        s.seq[k]++;
        this.events.push({ type: 'seqStep', seq: k, n: s.seq[k] });
        if (q.puzzle) s.progress[q.puzzle] = s.t;
        if (s.seq[k] >= q.ids.length) this.setFlag(q.flag);
      } else {
        s.seq[k] = q.ids[0] === id ? 1 : 0;
        if (q.puzzle) s.fails[q.puzzle] = (s.fails[q.puzzle] ?? 0) + 1;
        this.events.push({ type: 'seqFail', seq: k });
      }
    });
  }

  private stepDerive(): void {
    for (const dv of this.d.derive) if (!this.flag(dv.flag) && dv.all.every((f) => this.flag(f))) this.setFlag(dv.flag);
  }

  /** Pages: the flame directly over one reads the truth (and its Last Word); from the side, the lie. */
  private stepPages(dt: number): void {
    const s = this.s;
    const f = s.flame;
    this.d.pages.forEach((p, i) => {
      const st = s.pages[i];
      if (this.flag(p.id) || !this.lit) return;
      const hd = Math.hypot(f.x - p.x, f.z - p.z);
      const up = f.y - p.y;
      if (hd > 3 || up <= 0) {
        st.held = 0;
        return;
      }
      const elev = Math.atan2(up, hd) * DEG;
      if (elev > 66 && hd < 1.0) {
        st.held += dt;
        if (st.held > 0.5) {
          this.setFlag(p.id);
          s.words[p.word] = true;
          s.progress['pages'] = s.t;
          this.events.push({ type: 'pageRead', i });
        }
      } else {
        st.held = 0;
        if (elev < 48 && hd < 2.2 && !st.side) {
          st.side = true;
          this.events.push({ type: 'pageSide', i });
        }
      }
    });
  }

  /** The shadow maze: where the flame throws a caster's shadow, the floor is a wall. */
  mazeShadows(): Pt[][] {
    const m = this.d.maze;
    if (!m || !this.lit) return [];
    return m.casters.map((c) => solidShadow(this.s.flame, c, 0, this.radius));
  }
  private blockedByShadow(polys: Pt[][], x: number, z: number): boolean {
    const m = this.d.maze;
    if (!m || !inRect(m.rect, x, z)) return false;
    return polys.some((p) => p.length > 2 && pointInPoly(p, x, z));
  }

  private useBrazier(i: number): void {
    const s = this.s;
    const br = this.d.braziers[i];
    if (br.false) {
      if (this.flag('false:' + br.id)) return;
      this.setFlag('false:' + br.id);
      s.ash = Math.max(0, s.ash - 1);
      this.hurtFlame(0.3);
      this.events.push({ type: 'falseBrazier', i });
      return;
    }
    const first = !s.braziers[i];
    s.braziers[i] = true;
    this.setFlag('rest:' + br.id);
    s.ash = Math.max(s.ash, ASH.max);
    s.flame.vigor = 1;
    s.flame.relight = 0;
    this.events.push({ type: 'brazier', i, first });
    this.checkpoint = structuredClone(s);
  }

  private stepIn(fig: number): void {
    const s = this.s;
    const def = this.d.figures[fig];
    s.ash -= ASH.stepIn;
    const start = placeAt(def.clip!, 0, { x: def.x, z: def.z, yaw: def.yaw });
    s.figs[fig].state = 'ghost';
    s.figs[fig].t = 0;
    s.ghost = { fig, x: start.x, z: start.z, vx: 0, vz: 0, yaw: start.yaw, t: 0, done: -1, acting: 0 };
    s.body.vx = s.body.vz = 0;
    this.events.push({ type: 'stepIn', fig });
  }

  private stepGhost(inp: StillInput, dt: number): void {
    const s = this.s;
    const g = s.ghost!;
    const def = this.d.figures[g.fig];
    const len = def.clip?.len ?? 10;
    g.t += dt;
    s.figs[g.fig].t = g.t;
    g.acting = Math.max(0, g.acting - dt);
    if (g.acting <= 0) this.move(g, inp.mx, inp.mz, BODY.ghostSpeed, dt);
    else {
      g.vx = g.vz = 0;
    }
    const sp = Math.hypot(g.vx, g.vz);
    if (sp > 0.5) g.yaw = Math.atan2(g.vz, g.vx);
    s.body.vx = s.body.vz = 0;
    // the spots he acted at: the nearest one in reach is the prompt; E does it
    let spot: Spot | null = null;
    let bd = Infinity;
    for (const sp2 of def.stepIn ?? []) {
      if (this.flag(sp2.id)) continue;
      const dd = Math.hypot(sp2.x - g.x, sp2.z - g.z);
      if (dd < (sp2.r ?? 1.3) && dd < bd) {
        bd = dd;
        spot = sp2;
      }
    }
    s.focus = spot ? { kind: 'spot', spot } : null;
    if (spot && inp.act && g.acting <= 0) {
      const ok = (spot.needs ?? []).every((n) => this.flag(n));
      g.acting = 0.9;
      g.yaw = Math.atan2(spot.z - g.z, spot.x - g.x);
      if (ok) {
        this.setFlag(spot.id);
        g.done = 0;
        if (def.puzzle) s.progress[def.puzzle] = s.t;
      } else if (def.puzzle) s.fails[def.puzzle] = (s.fails[def.puzzle] ?? 0) + 1;
      this.events.push({ type: 'spot', id: spot.id, ok, msg: ok ? undefined : spot.fail });
    }
    if (g.done >= 0) g.done += dt;
    if (g.t >= len || g.done > 1.6) {
      s.figs[g.fig].state = 'frozen';
      s.figs[g.fig].t = 0;
      s.figs[g.fig].woke = true;
      s.figs[g.fig].locked = false;
      s.figs[g.fig].held = 0;
      this.events.push({ type: 'stepOut', fig: g.fig });
      // stepped in and did nothing he did: a failed attempt
      if (g.done < 0 && def.puzzle) s.fails[def.puzzle] = (s.fails[def.puzzle] ?? 0) + 1;
      s.ghost = null;
    }
  }

  private stepZones(): void {
    const s = this.s;
    this.d.zones.forEach((z, i) => {
      if (s.zones[i] || (z.needs && !this.flag(z.needs))) return;
      if (!inRect(z.rect, s.body.x, s.body.z)) return;
      s.zones[i] = true;
      if (z.flag) this.setFlag(z.flag);
      if (z.line) this.events.push({ type: 'line', id: z.line });
    });
  }

  /** How much of a plate lies in shadow (sampled on a grid: shadows of several casters may overlap). */
  plateCover(p: Plate): number {
    const f = this.s.flame;
    if (!this.lit) return 0;
    const y = p.y ?? 0;
    const polys: Pt[][] = [];
    const b = this.s.body;
    for (const c of p.casters) {
      if (c === 'self') polys.push(bodyShadow(f, b.x, b.z, b.y, BODY.h, BODY.r * 0.75, y, this.radius));
      else if ('fig' in c) {
        const i = this.d.figures.findIndex((x) => x.id === c.fig);
        if (i < 0) continue;
        const at = this.placeOf(i);
        const def = this.d.figures[i];
        polys.push(bodyShadow(f, at.x, at.z, 0, (def.h ?? 1.8) * 0.95, 0.24, y, this.radius));
      } else polys.push(solidShadow(f, c, y, this.radius));
    }
    const N = 8;
    let hit = 0;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const x = p.rect.x0 + ((i + 0.5) / N) * (p.rect.x1 - p.rect.x0);
        const z = p.rect.z0 + ((j + 0.5) / N) * (p.rect.z1 - p.rect.z0);
        if (polys.some((q) => q.length > 2 && pointInPoly(q, x, z))) hit++;
      }
    return hit / (N * N);
  }

  private stepPlates(dt: number): void {
    const s = this.s;
    this.d.plates.forEach((p, i) => {
      if (this.flag(p.id) || (p.needs && !this.flag(p.needs))) return;
      if (p.back && !s.flame.back) {
        s.plates[i] = 0;
        return;
      }
      const c = this.plateCover(p);
      if (c >= p.min && c <= p.max) s.plates[i] += dt;
      else s.plates[i] = 0;
      if (s.plates[i] >= (p.hold ?? 0.6)) {
        this.setFlag(p.id);
        this.events.push({ type: 'plate', id: p.id });
      }
    });
  }

  /** Falling stones: one every period somewhere just ahead of him, warned by dust (1.2 s Easy, 0.9 s Medium, 0.7 s Hard) before it lands. */
  private stepDebris(): void {
    const s = this.s;
    (this.d.debris ?? []).forEach((db, i) => {
      const st = s.debris[i];
      if (!this.flag(db.after) || !inRect(db.rect, s.body.x, s.body.z)) return;
      if (st.next === 0) st.next = s.t + db.period;
      if (!st.warned && s.t >= st.next - this.diff.stoneWarn) {
        // ahead of him, scattered (deterministic from the time, so a rewind replays it)
        const r = Math.sin(st.next * 12.9898) * 43758.5453;
        const f = r - Math.floor(r);
        // beside his line, not on it: a stone that lands where a steady runner will be is not a hazard, it is a tax
        const side = f < 0.5 ? -1 : 1;
        const lead = this.diff.stoneWarn;
        st.x = Math.max(db.rect.x0, Math.min(db.rect.x1, s.body.x + s.body.vx * lead + (f - 0.5) * 2));
        st.z = Math.max(db.rect.z0, Math.min(db.rect.z1, s.body.z + s.body.vz * lead + side * (1.2 + f * 0.6)));
        st.warned = true;
        this.events.push({ type: 'debrisWarn', x: st.x, z: st.z });
      }
      if (s.t >= st.next) {
        const hit = Math.hypot(s.body.x - st.x, s.body.z - st.z) < 0.95 * this.diff.stoneReach;
        if (hit) this.hurtFlame(0.3 * this.diff.hazard);
        this.events.push({ type: 'debris', x: st.x, z: st.z, hit });
        st.next = s.t + db.period;
        st.warned = false;
      }
    });
  }

  private stepGusts(dt: number): void {
    const s = this.s;
    this.d.gusts.forEach((g, i) => {
      if (g.after && !this.flag(g.after)) return;
      // the first gust comes a full period after its trigger, with its warning (never the instant it starts)
      const from = g.after ? s.flags[g.after] : 0;
      if (s.gusts[i] < from + 1.4) s.gusts[i] = from + 2.6;
      const next = s.gusts[i];
      const before = next - s.t;
      if (before <= 1.3 && before + dt > 1.3) this.events.push({ type: 'gustWarn', i });
      if (s.t >= next) {
        s.gusts[i] = s.t + g.period;
        const hit = inRect(g.rect, s.body.x, s.body.z) && !s.ghost;
        // drawn back behind his body, the flame is sheltered
        if (hit) this.hurtFlame((s.flame.back ? 0.12 : 0.55) * this.diff.hazard);
        this.events.push({ type: 'gust', i, hit });
      }
    });
  }

  // ------------------------------------------------------------------ the Wrong Shadow
  /** Can the camera see this point (in the frame, nothing in the way)? */
  private seen(inp: StillInput, x: number, y: number, z: number): boolean {
    const f = inp.frustum;
    // anywhere on screen counts (a little past the edge, too: it must never be caught moving at the border)
    for (let i = 0; i + 3 < f.length; i += 4) if (f[i] * x + f[i + 1] * y + f[i + 2] * z + f[i + 3] < -0.6) return false;
    const [cx, cy, cz] = inp.cam;
    return firstHit(this.solids, cx, cy, cz, x, y, z) >= 0.98;
  }

  /** Does the flame light this point (in reach, nothing between, not behind his own body)? */
  private litAt(x: number, y: number, z: number, range: number): boolean {
    const f = this.s.flame;
    if (!this.lit || vlen(x - f.x, y - f.y, z - f.z) > range) return false;
    if (firstHit(this.solids, f.x, f.y, f.z, x, y, z) < 0.98) return false;
    const b = this.s.body;
    return segmentHit(cyl(b.x, b.z, BODY.r * 0.8, BODY.h, b.y), f.x, f.y, f.z, x, y, z) >= 1;
  }

  private stepWrong(inp: StillInput, dt: number): void {
    const def = this.d.wrong;
    const s = this.s;
    const w = s.wrong;
    if (!def || w.gone) return;
    if (def.until && this.flag(def.until)) {
      if (w.on) this.events.push({ type: 'wrongGone' });
      w.on = false;
      w.gone = true;
      return;
    }
    const b = s.body;
    if (!w.on) {
      const wake = def.mode === 'still' ? !!def.appear && inRect(def.appear, b.x, b.z) : !def.after || this.flag(def.after);
      if (!wake) return;
      w.on = true;
      [w.x, w.z] = def.spawn;
      this.events.push({ type: 'wrongAppear' });
    }
    w.dist = Math.hypot(w.x - b.x, w.z - b.z);
    w.yaw = Math.atan2(b.z - w.z, b.x - w.x);
    w.seen = this.seen(inp, w.x, 1.1, w.z) || this.seen(inp, w.x, 1.75, w.z);
    const wasLit = w.lit;
    w.lit = this.litAt(w.x, 1.1, w.z, litRangeFor(s.flame.vigor));
    if (w.lit && !wasLit && w.seenOnce) this.events.push({ type: 'wrongLit' });
    if (w.seen && !w.seenOnce) {
      w.seenOnce = true;
      this.events.push({ type: 'wrongSeen' });
    }
    w.unseenT = w.seen ? 0 : w.unseenT + dt;
    if (def.mode === 'still') {
      // the Gate Ward: it is there once, far off, and gone the moment no one is looking
      if (w.seenOnce && w.unseenT > 1.2) {
        w.on = false;
        w.gone = true;
        this.events.push({ type: 'wrongGone' });
      }
      return;
    }
    if (w.lit || w.seen) s.caughtRun = w.lit ? 0 : s.caughtRun;
    w.cool = Math.max(0, w.cool - dt);
    w.moving = !w.seen && !w.lit && w.cool <= 0 && !s.ghost && s.status === 'play';
    if (!w.moving || !this.graph) return;
    w.think -= dt;
    if (w.think <= 0 || !w.tgt) {
      w.think = 0.12;
      w.tgt = steer(this.graph, this.solids, w.x, w.z, b.x, b.z);
    }
    if (!w.tgt) return;
    const sprint = flameState(s.flame.vigor) !== 'steady';
    const v = (sprint ? def.sprint : def.speed) * this.diff.wrongSpeed;
    const dx = w.tgt[0] - w.x;
    const dz = w.tgt[1] - w.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-3) {
      const stepLen = Math.min(dl, v * dt);
      w.x += (dx / dl) * stepLen;
      w.z += (dz / dl) * stepLen;
      w.stride += stepLen;
      if (w.stride > 1.4) {
        w.stride = 0;
        this.events.push({ type: 'wrongStep' });
      }
      if (!w.moved) {
        w.moved = true;
        this.events.push({ type: 'wrongShift' });
      }
    }
    if (Math.hypot(w.x - b.x, w.z - b.z) < 0.85) this.caught();
  }

  private caught(): void {
    const s = this.s;
    const w = s.wrong;
    s.caughtRun++;
    this.events.push({ type: 'caught', n: s.caughtRun });
    this.hurtFlame(this.diff.wrongTouch);
    // never fatal in the first two districts (nor ever on Easy): it costs Ash and puts him back a few metres
    if (s.ash <= 0 && this.d.index >= 2 && this.diff.caughtFatal) {
      this.die('caught');
      return;
    }
    s.ash = Math.max(0, s.ash - 1);
    const back = this.history[Math.max(0, this.history.length - 1 - Math.round(2.5 / HISTORY_EVERY))];
    if (back) {
      s.body.x = back.body.x;
      s.body.z = back.body.z;
      s.body.y = back.body.y;
      s.body.vx = s.body.vz = 0;
    }
    // and it is somewhere else, waiting
    if (this.graph?.nodes.length) {
      let far = 0;
      let pick = this.graph.nodes[0];
      for (const n of this.graph.nodes) {
        const d = Math.hypot(n[0] - s.body.x, n[1] - s.body.z);
        if (d > far && d < 30) {
          far = d;
          pick = n;
        }
      }
      [w.x, w.z] = pick;
    }
    w.cool = 3;
    w.tgt = null;
  }

  // ------------------------------------------------------------------ time
  /** Back five seconds, for one Ash. Last Words heard stay heard. */
  private rewind(): boolean {
    const s = this.s;
    if (s.ash < ASH.rewind || this.history.length < 2) {
      this.events.push({ type: 'noAsh', need: ASH.rewind });
      return false;
    }
    const target = this.history[0];
    const keep = { words: s.words, deaths: s.deaths, fails: s.fails, ash: s.ash - ASH.rewind, caughtRun: s.caughtRun };
    this.s = structuredClone(target);
    Object.assign(this.s, keep);
    this.s.rewindHold = REWIND_HOLD + 1; // no second rewind until R is let go
    this.s.status = 'play';
    this.history = [structuredClone(this.s)];
    this.historyT = 0;
    this.events.push({ type: 'rewind' });
    return true;
  }

  private die(cause: 'fall' | 'caught'): void {
    const s = this.s;
    if (s.status === 'dead') return;
    s.status = 'dead';
    s.statusT = 0;
    this.events.push({ type: 'dead', cause });
  }

  private respawn(): void {
    const s = this.s;
    const keep = { words: s.words, deaths: s.deaths + 1, fails: s.fails, progress: s.progress };
    this.s = structuredClone(this.checkpoint);
    Object.assign(this.s, keep);
    // the figures he has found stay found
    this.d.figures.forEach((f, i) => {
      if (f.word !== undefined && this.s.words[f.word]) this.s.figs[i].found = true;
    });
    this.history = [];
    this.events.push({ type: 'respawn' });
  }

  /** The figure that is nearest its true angle (for the hum), if any is close to it. */
  nearestAlign(): { fig: number; align: number } | null {
    let best: { fig: number; align: number } | null = null;
    this.s.figs.forEach((rt, i) => {
      if (rt.state !== 'frozen' || rt.align <= 0) return;
      const f = this.d.figures[i];
      if (Math.hypot(f.x - this.s.body.x, f.z - this.s.body.z) > 12) return;
      if (!best || rt.align > best.align) best = { fig: i, align: rt.align };
    });
    return best;
  }
}

export type { FigureDef };
