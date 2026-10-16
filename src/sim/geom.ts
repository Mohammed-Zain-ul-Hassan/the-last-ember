// 3D level geometry for the sim: solid boxes (rotated about y) and upright cylinders on the x/z ground plane, with
// y up. Bodies are upright cylinders too. No three.js here; render builds its meshes from the same data.
//
// Rotation follows three.js `rotation.y`: a box's local +x points along (cos ry, -sin ry) in world x/z.

export interface Solid {
  kind: 'box' | 'cyl';
  x: number;
  z: number;
  hw: number; // box: half width along local x; cylinder: radius
  hd: number; // box: half depth along local z; cylinder: radius
  ry: number;
  y0: number; // bottom
  y1: number; // top (you can stand on it)
  noShadow?: boolean; // the hearth itself does not shadow its own light
  tag?: string; // dressing hint for render (masonry, column, pier, walk, step, statue, hearth...)
}

/** Walkable ground: a disc (the hearth grounds) or a long band (the road east). */
export type Area = { kind: 'disc'; cx: number; cz: number; r: number } | { kind: 'band'; x0: number; x1: number; z0: number; z1: number };

export const STEP = 0.42; // a ledge this low is walked up, not jumped

export function box(x: number, z: number, w: number, d: number, h: number, ry = 0, y0 = 0, tag?: string): Solid {
  return { kind: 'box', x, z, hw: w / 2, hd: d / 2, ry, y0, y1: y0 + h, tag };
}

export function cyl(x: number, z: number, r: number, h: number, y0 = 0, tag?: string): Solid {
  return { kind: 'cyl', x, z, hw: r, hd: r, ry: 0, y0, y1: y0 + h, tag };
}

/** World offset (dx, dz) from a box centre into its local frame. */
function toLocal(s: Solid, dx: number, dz: number): [number, number] {
  const c = Math.cos(s.ry);
  const sn = Math.sin(s.ry);
  return [dx * c - dz * sn, dx * sn + dz * c];
}

function toWorld(s: Solid, lx: number, lz: number): [number, number] {
  const c = Math.cos(s.ry);
  const sn = Math.sin(s.ry);
  return [lx * c + lz * sn, -lx * sn + lz * c];
}

/** Bounding radius of a solid's footprint. */
export function footR(s: Solid): number {
  return s.kind === 'cyl' ? s.hw : Math.hypot(s.hw, s.hd);
}

/** Does a circle of radius r at (x, z) overlap the solid's footprint? */
export function overlaps(s: Solid, x: number, z: number, r: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.kind === 'cyl') return dx * dx + dz * dz < (s.hw + r) * (s.hw + r);
  const [lx, lz] = toLocal(s, dx, dz);
  const cx = Math.max(-s.hw, Math.min(s.hw, lx));
  const cz = Math.max(-s.hd, Math.min(s.hd, lz));
  return (lx - cx) * (lx - cx) + (lz - cz) * (lz - cz) < r * r;
}

/** Push a circle out of a solid's footprint. Returns the corrected position, or null if they do not touch. */
export function pushOut(s: Solid, x: number, z: number, r: number): [number, number] | null {
  const dx = x - s.x;
  const dz = z - s.z;
  if (s.kind === 'cyl') {
    const d = Math.hypot(dx, dz);
    const min = s.hw + r;
    if (d >= min) return null;
    const nx = d > 1e-6 ? dx / d : 1;
    const nz = d > 1e-6 ? dz / d : 0;
    return [s.x + nx * min, s.z + nz * min];
  }
  const [lx, lz] = toLocal(s, dx, dz);
  const cx = Math.max(-s.hw, Math.min(s.hw, lx));
  const cz = Math.max(-s.hd, Math.min(s.hd, lz));
  let ox = lx - cx;
  let oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  let nlx: number;
  let nlz: number;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    nlx = cx + (ox / d) * r;
    nlz = cz + (oz / d) * r;
  } else {
    // centre inside the box: leave by the nearest face
    const px = s.hw - Math.abs(lx);
    const pz = s.hd - Math.abs(lz);
    if (px < pz) {
      nlx = Math.sign(lx || 1) * (s.hw + r);
      nlz = lz;
    } else {
      nlx = lx;
      nlz = Math.sign(lz || 1) * (s.hd + r);
    }
  }
  ox = nlx;
  oz = nlz;
  const [wx, wz] = toWorld(s, ox, oz);
  return [s.x + wx, s.z + wz];
}

/**
 * Where a segment A->B first enters a solid, as a fraction 0..1 of its length (Infinity if it misses).
 * Used for cast shadows (ground point -> flame) and for keeping the camera out of walls.
 */
export function segmentHit(s: Solid, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  let t0 = 0;
  let t1 = 1;
  // vertical slab
  const dy = by - ay;
  if (Math.abs(dy) < 1e-9) {
    if (ay < s.y0 || ay > s.y1) return Infinity;
  } else {
    let ta = (s.y0 - ay) / dy;
    let tb = (s.y1 - ay) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  if (s.kind === 'cyl') {
    const fx = ax - s.x;
    const fz = az - s.z;
    const dx = bx - ax;
    const dz = bz - az;
    const a = dx * dx + dz * dz;
    const c = fx * fx + fz * fz - s.hw * s.hw;
    if (a < 1e-12) return c <= 0 ? t0 : Infinity;
    const b = 2 * (fx * dx + fz * dz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    t0 = Math.max(t0, (-b - sq) / (2 * a));
    t1 = Math.min(t1, (-b + sq) / (2 * a));
    return t0 <= t1 ? t0 : Infinity;
  }
  const [lax, laz] = toLocal(s, ax - s.x, az - s.z);
  const [lbx, lbz] = toLocal(s, bx - s.x, bz - s.z);
  const slab = (p: number, q: number, h: number): boolean => {
    const d = q - p;
    if (Math.abs(d) < 1e-9) return p >= -h && p <= h;
    let ta = (-h - p) / d;
    let tb = (h - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!slab(lax, lbx, s.hw) || !slab(laz, lbz, s.hd)) return Infinity;
  return t0;
}

/** First hit of a segment against any solid (fraction 0..1, or Infinity). */
export function firstHit(solids: readonly Solid[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, skipNoShadow = false): number {
  let best = Infinity;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const half = Math.hypot(bx - ax, bz - az) / 2;
  for (const s of solids) {
    if (skipNoShadow && s.noShadow) continue;
    // broad phase: footprint circle against the segment's bounding circle
    const r = footR(s) + half;
    if ((s.x - mx) * (s.x - mx) + (s.z - mz) * (s.z - mz) > r * r) continue;
    const t = segmentHit(s, ax, ay, az, bx, by, bz);
    if (t < best) best = t;
  }
  return best;
}

/** Keep a point inside the walkable area (r = body radius). */
export function clampToArea(a: Area, x: number, z: number, r: number): [number, number] {
  if (a.kind === 'band') return [Math.max(a.x0 + r, Math.min(a.x1 - r, x)), Math.max(a.z0 + r, Math.min(a.z1 - r, z))];
  const dx = x - a.cx;
  const dz = z - a.cz;
  const d = Math.hypot(dx, dz);
  const max = a.r - r;
  if (d <= max) return [x, z];
  return [a.cx + (dx / d) * max, a.cz + (dz / d) * max];
}

export function inArea(a: Area, x: number, z: number, r = 0): boolean {
  if (a.kind === 'band') return x >= a.x0 + r && x <= a.x1 - r && z >= a.z0 + r && z <= a.z1 - r;
  return Math.hypot(x - a.cx, z - a.cz) <= a.r - r;
}

/** Shortest signed difference between two angles (b - a), in -PI..PI. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
