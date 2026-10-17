// Poses for the jointed figures (the shadow-theatre puppets, and the frozen people of the Still City), and the
// replay clips that drive them. Pure data and maths: no three imports. Joints swing in the figure's profile plane.

export interface Pose {
  y: number; // root drop (kneel, sit)
  lean: number; // body forward (+) / back (-)
  head: number; // nod down (+)
  aF: number; // front shoulder: + raises forward
  eF: number;
  aB: number; // back shoulder
  eB: number;
  lF: number; // front hip: + swings the thigh forward
  kF: number; // front knee: - bends the shin back
  lB: number;
  kB: number;
}
export const STAND: Pose = { y: 0, lean: 0, head: 0, aF: 0.1, eF: 0.2, aB: -0.1, eB: 0.2, lF: 0.05, kF: -0.05, lB: -0.05, kB: -0.05 };
export const KNEEL: Partial<Pose> = { y: -0.42, lF: 1.45, kF: -1.45, lB: 0.05, kB: -1.5, lean: 0.05 };
export const SIT: Partial<Pose> = { y: -0.5, lF: 1.5, kF: -1.2, lB: 1.4, kB: -1.0, lean: 0.1 };

export function run(t: number, speed = 9): Partial<Pose> {
  const s = Math.sin(t * speed);
  return { lean: 0.35, lF: s * 0.9, kF: -0.3 - Math.max(0, -s) * 1.2, lB: -s * 0.9, kB: -0.3 - Math.max(0, s) * 1.2, aF: -s * 0.8, aB: s * 0.8, eF: 0.9, eB: 0.9, y: Math.abs(Math.cos(t * speed)) * 0.05 };
}

const KEYS = Object.keys(STAND) as (keyof Pose)[];

/** One keyframe: a (partial) pose at time t; missing joints hold STAND. */
export interface Key {
  t: number;
  pose: Partial<Pose>;
}
/** Where the figure stands at time t (world x, z, facing yaw). */
export type PathKey = [t: number, x: number, z: number, yaw: number];
/** A moment in the replay that does something in the world (pulls a lever, lifts a bar). */
export interface Trigger {
  t: number;
  id: string;
}
/** A figure's last seconds: it is frozen at the clip's end; a replay plays it from 0. */
export interface Clip {
  len: number;
  keys: Key[];
  path?: PathKey[];
  triggers?: Trigger[];
  walk?: [t0: number, t1: number][]; // spans where the legs walk (a stride on top of the keys)
}

const smooth = (k: number) => k * k * (3 - 2 * k);

/** The pose at time t (keys eased between, a walking stride layered on in walk spans). */
export function poseAt(c: Clip, t: number): Pose {
  const out: Pose = { ...STAND };
  const ks = c.keys;
  if (ks.length) {
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
    const a = ks[i];
    const b = ks[Math.min(ks.length - 1, i + 1)];
    const span = b.t - a.t;
    const k = span > 0 ? smooth(Math.max(0, Math.min(1, (t - a.t) / span))) : 0;
    for (const key of KEYS) {
      const va = a.pose[key] ?? STAND[key];
      const vb = b.pose[key] ?? STAND[key];
      out[key] = va + (vb - va) * k;
    }
  }
  for (const [t0, t1] of c.walk ?? []) {
    if (t < t0 || t > t1) continue;
    const r = run(t, 7);
    const fade = Math.min(1, (t - t0) / 0.3, (t1 - t) / 0.3);
    for (const key of ['lF', 'kF', 'lB', 'kB'] as const) out[key] += ((r[key] ?? 0) - STAND[key]) * fade * 0.7;
  }
  return out;
}

/** Where the figure stands at time t (or `rest` when the clip does not move it). */
export function placeAt(c: Clip, t: number, rest: { x: number; z: number; yaw: number }): { x: number; z: number; yaw: number } {
  const p = c.path;
  if (!p?.length) return rest;
  if (t <= p[0][0]) return { x: p[0][1], z: p[0][2], yaw: p[0][3] };
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i];
    const b = p[i + 1];
    if (t <= b[0]) {
      const k = smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
      let dy = b[3] - a[3];
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      return { x: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, yaw: a[3] + dy * k };
    }
  }
  const last = p[p.length - 1];
  return { x: last[1], z: last[2], yaw: last[3] };
}
