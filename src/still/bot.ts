// A player made of a script: it walks, stands where a fire once stood, wakes, steps in, reads, bridges, and turns
// on the Wrong Shadow when it is close, by producing the same input a person would (move, view, E, Shift, R).
// It proves each district can be played start to finish (src/still/bot.test.ts) and it plays the recorded run.

import { overlaps } from '../sim/geom';
import { clampToArea } from '../sim/geom';
import { BODY, type City, type StillInput } from './sim/city';
import { FLAME } from './sim/flame';

export type Goal =
  | { go: [number, number]; r?: number; back?: boolean; pitch?: number; trim?: number; slow?: boolean }
  | { aim: string; t?: number } // stand at a figure's true angle until it is held
  | { tap: true; t?: number } // press E once (then wait t)
  | { hold: number } // hold E this long (step in)
  | { ghost: [number, number]; r?: number }
  | { wait: number; yaw?: number; pitch?: number }
  | { until: string; t?: number; yaw?: number; pitch?: number }
  | { look: number; pitch?: number; t?: number }
  | { flame: [number, number, number]; back?: boolean; yaw?: number; flag?: string; t?: number }
  | { read: string } // hold the flame over a page until it is read
  | { rest: true } // rest at the nearest brazier
  | { note: string }; // a label (debug)

export interface BotOut {
  input: Partial<StillInput>;
  yaw: number;
  pitch: number;
  lock: boolean;
  done: boolean;
}

const wrapTo = (a: number, ref: number) => {
  while (a - ref > Math.PI) a -= Math.PI * 2;
  while (a - ref < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Where to stand, and how to look, to hold the flame at world point P. */
export function standFor(P: [number, number, number], yaw: number, back: boolean): { x: number; z: number; pitch: number; trim: number } {
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const [lo, hi] = back ? FLAME.back : FLAME.front;
  const h = P[1];
  const k = Math.max(0, Math.min(1, (h - lo) / (hi - lo)));
  const trim = Math.max(-1, Math.min(1, (h - (lo + (hi - lo) * k)) / FLAME.trim));
  const pitch = FLAME.maxPitch - k * (FLAME.maxPitch - FLAME.minPitch);
  if (back) return { x: P[0] + fx * FLAME.backReach, z: P[2] + fz * FLAME.backReach, pitch, trim };
  return { x: P[0] - fx * FLAME.reach - fz * FLAME.side, z: P[2] - fz * FLAME.reach + fx * FLAME.side, pitch, trim };
}

export class Bot {
  private i = 0;
  private t = 0; // seconds in the current goal
  private yaw: number;
  private pitch = 0.4;
  private trim = 0;
  private lockCool = 0;
  private plan: { x: number; z: number; yaw: number; pitch: number; trim: number; back: boolean } | null = null;
  log: string[] = [];

  private script: Goal[];
  constructor(script: Goal[], yaw = 0) {
    this.script = script;
    this.yaw = yaw;
  }

  get index(): number {
    return this.i;
  }
  get done(): boolean {
    return this.i >= this.script.length;
  }

  /** After a death: go back to the last rest at a brazier (that is where he woke) and play on from there. */
  restart(): void {
    let k = Math.min(this.i, this.script.length - 1);
    while (k > 0 && !('rest' in this.script[k])) k--;
    this.i = k;
    this.t = 0;
    this.plan = null;
  }

  private next(): void {
    this.i++;
    this.t = 0;
    this.plan = null;
  }

  /** The input for one sim step. */
  step(city: City, dt: number): BotOut {
    const s = city.s;
    const out: BotOut = { input: { mx: 0, mz: 0, act: false, actHeld: false, back: false, trim: this.trim, rewindHeld: false }, yaw: this.yaw, pitch: this.pitch, lock: false, done: this.done };
    if (this.done || s.status === 'exit') return { ...out, done: true };
    this.lockCool = Math.max(0, this.lockCool - dt);
    // dead or falling: wait it out (a respawn puts the script back at the last brazier: the caller restarts it)
    if (s.status !== 'play' && s.status !== 'fall') return out;
    const g = this.script[this.i];
    this.t += dt;
    const b = s.body;
    const walkTo = (x: number, z: number, r: number, speed = 1): boolean => {
      const dx = x - b.x;
      const dz = z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < r) return true;
      const k = Math.min(1, d / 0.5) * speed;
      out.input.mx = (dx / d) * k;
      out.input.mz = (dz / d) * k;
      return false;
    };
    // the Wrong Shadow close and moving: turn the light on it (what a player learns to do)
    const w = s.wrong;
    if ('go' in g && w.on && !w.gone && w.moving && w.dist < 7 && this.lockCool <= 0) {
      out.lock = true;
      this.lockCool = 2.5;
    }
    if ('note' in g) {
      this.log.push(g.note);
      this.next();
    } else if ('go' in g) {
      const done = walkTo(g.go[0], g.go[1], g.r ?? 0.45, g.slow ? 0.6 : 1);
      out.input.back = !!g.back;
      if (!done) {
        const want = Math.atan2(g.go[1] - b.z, g.go[0] - b.x);
        // the view turns toward where he walks (the camera a person would hold), unless it is told where to look
        if (!this.lockCool || this.lockCool < 1.5) this.yaw = wrapTo(this.yaw + Math.max(-dt * 3, Math.min(dt * 3, wrapTo(want, this.yaw) - this.yaw)), 0);
      }
      if (g.pitch !== undefined) this.pitch = g.pitch;
      if (g.trim !== undefined) this.trim = g.trim;
      if (done || this.t > 40) {
        if (!done) this.log.push(`go timeout ${g.go}`);
        this.next();
      }
    } else if ('aim' in g) {
      const fi = city.d.figures.findIndex((f) => f.id === g.aim);
      const f = city.d.figures[fi];
      if (!this.plan) {
        // face from the true light toward the figure; turn the other way round if that spot is inside a wall
        const base = Math.atan2(f.z - f.light[2], f.x - f.light[0]);
        for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2]) {
          const st = standFor(f.light, base + off, false);
          const [cx, cz] = clampToArea(city.d.area, st.x, st.z, BODY.r);
          const blocked = Math.hypot(cx - st.x, cz - st.z) > 0.01 || city.solids.some((so) => so.y0 < 1.5 && so.y1 > 0.3 && overlaps(so, st.x, st.z, BODY.r));
          if (!blocked) {
            this.plan = { ...st, yaw: base + off, back: false };
            break;
          }
        }
        if (!this.plan) this.plan = { ...standFor(f.light, base, false), yaw: base, back: false };
      }
      const p = this.plan;
      const there = walkTo(p.x, p.z, 0.06, 0.5);
      this.yaw = wrapTo(this.yaw + Math.max(-dt * 4, Math.min(dt * 4, wrapTo(p.yaw, this.yaw) - this.yaw)), 0);
      if (there || this.t > 3) {
        this.pitch += (p.pitch - this.pitch) * Math.min(1, dt * 6);
        this.trim = p.trim;
      }
      if (s.figs[fi].locked) this.next();
      else if (this.t > (g.t ?? 25)) {
        this.log.push(`aim timeout ${g.aim} delta ${s.figs[fi].delta.toFixed(1)}`);
        this.next();
      }
    } else if ('tap' in g) {
      if (this.t <= dt * 1.5) {
        out.input.act = true;
        out.input.actHeld = true;
      }
      if (this.t > (g.t ?? 0.3)) this.next();
    } else if ('hold' in g) {
      out.input.actHeld = true;
      if (this.t <= dt * 1.5) out.input.act = true;
      if (this.t > g.hold) this.next();
    } else if ('ghost' in g) {
      const gh = s.ghost;
      if (!gh) {
        if (this.t > 1) this.next();
      } else {
        const dx = g.ghost[0] - gh.x;
        const dz = g.ghost[1] - gh.z;
        const d = Math.hypot(dx, dz);
        if (d < (g.r ?? 0.35)) this.next();
        else {
          const k = Math.min(1, d / 0.5);
          out.input.mx = (dx / d) * k;
          out.input.mz = (dz / d) * k;
          this.yaw = wrapTo(this.yaw + Math.max(-dt * 3, Math.min(dt * 3, wrapTo(Math.atan2(dz, dx), this.yaw) - this.yaw)), 0);
        }
        if (this.t > 12) this.next();
      }
    } else if ('wait' in g) {
      if (g.yaw !== undefined) this.yaw = wrapTo(this.yaw + Math.max(-dt * 2, Math.min(dt * 2, wrapTo(g.yaw, this.yaw) - this.yaw)), 0);
      if (g.pitch !== undefined) this.pitch += (g.pitch - this.pitch) * Math.min(1, dt * 3);
      if (this.t > g.wait) this.next();
    } else if ('until' in g) {
      if (g.yaw !== undefined) this.yaw = wrapTo(this.yaw + Math.max(-dt * 2, Math.min(dt * 2, wrapTo(g.yaw, this.yaw) - this.yaw)), 0);
      if (g.pitch !== undefined) this.pitch += (g.pitch - this.pitch) * Math.min(1, dt * 3);
      if (city.flag(g.until)) this.next();
      else if (this.t > (g.t ?? 20)) {
        this.log.push(`until timeout ${g.until}`);
        this.next();
      }
    } else if ('look' in g) {
      this.yaw = wrapTo(this.yaw + Math.max(-dt * 2.5, Math.min(dt * 2.5, wrapTo(g.look, this.yaw) - this.yaw)), 0);
      if (g.pitch !== undefined) this.pitch += (g.pitch - this.pitch) * Math.min(1, dt * 3);
      if (this.t > (g.t ?? 1)) this.next();
    } else if ('flame' in g) {
      if (!this.plan) {
        const yaw = g.yaw ?? Math.atan2(g.flame[2] - b.z, g.flame[0] - b.x);
        this.plan = { ...standFor(g.flame, yaw, !!g.back), yaw, back: !!g.back };
      }
      const p = this.plan;
      out.input.back = p.back;
      const there = walkTo(p.x, p.z, 0.06, 0.5);
      this.yaw = wrapTo(this.yaw + Math.max(-dt * 4, Math.min(dt * 4, wrapTo(p.yaw, this.yaw) - this.yaw)), 0);
      if (there || this.t > 3) {
        this.pitch += (p.pitch - this.pitch) * Math.min(1, dt * 6);
        this.trim = p.trim;
      }
      if ((g.flag && city.flag(g.flag)) || (!g.flag && this.t > (g.t ?? 2))) this.next();
      else if (this.t > (g.t ?? 2) + 20) {
        this.log.push(`flame timeout ${g.flag}`);
        this.next();
      }
    } else if ('read' in g) {
      const pi = city.d.pages.findIndex((p) => p.id === g.read);
      const pg = city.d.pages[pi];
      if (!this.plan) {
        const yaw = Math.atan2(pg.z - b.z, pg.x - b.x);
        this.plan = { ...standFor([pg.x, pg.y + 1.6, pg.z], yaw, false), yaw, back: false };
      }
      const p = this.plan;
      const there = walkTo(p.x, p.z, 0.06, 0.5);
      this.yaw = wrapTo(this.yaw + Math.max(-dt * 4, Math.min(dt * 4, wrapTo(p.yaw, this.yaw) - this.yaw)), 0);
      if (there || this.t > 3) {
        this.pitch += (p.pitch - this.pitch) * Math.min(1, dt * 6);
        this.trim = p.trim;
      }
      if (city.flag(g.read)) this.next();
      else if (this.t > 20) {
        this.log.push(`read timeout ${g.read}`);
        this.next();
      }
    } else if ('rest' in g) {
      const bi = city.d.braziers.reduce((best, br, k) => (Math.hypot(br.x - b.x, br.z - b.z) < Math.hypot(city.d.braziers[best].x - b.x, city.d.braziers[best].z - b.z) ? k : best), 0);
      const br = city.d.braziers[bi];
      const dl = Math.hypot(b.x - br.x, b.z - br.z) || 1;
      const there = walkTo(br.x + ((b.x - br.x) / dl) * 1.1, br.z + ((b.z - br.z) / dl) * 1.1, 0.3);
      if (there) {
        if (this.t > 0.2 && s.focus?.kind === 'brazier') {
          out.input.act = true;
          this.next();
        } else if (this.t > 8) this.next();
      }
    }
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.input.trim = this.trim;
    return out;
  }
}

/**
 * The main path only (?quick=1, for a short recording): drops standing at the true angles of figures that are only a
 * Last Word (no replay, no plate, no order), and the pause after each. The puzzles are all still played.
 */
export function quickScript(script: Goal[], figures: { id: string; clip?: unknown; lockFlag?: string }[], required: string[] = []): Goal[] {
  const optional = new Set(figures.filter((f) => !f.clip && !f.lockFlag && !required.includes(f.id)).map((f) => f.id));
  const out: Goal[] = [];
  for (let i = 0; i < script.length; i++) {
    const g = script[i];
    if ('aim' in g && optional.has(g.aim)) {
      if (script[i + 1] && 'wait' in script[i + 1]) i++;
      continue;
    }
    if ('wait' in g && g.wait > 2) out.push({ ...g, wait: Math.min(g.wait, 2.2) });
    else out.push(g);
  }
  return out;
}
