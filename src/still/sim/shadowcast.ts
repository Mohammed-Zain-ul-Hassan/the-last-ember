// Exact shadows, for gameplay. The renderer draws the flame's shadows with a shadow map; anything the game *uses*
// (a bridge you stand on, a scale's balance, a plate covered, a maze wall) is computed here from the same solids and
// the same flame, as polygons on a plane, and drawn from those polygons. Nothing is read back from the GPU.
// (Research: shipped shadow games project silhouettes analytically and keep rendering separate.)
//
// A point light L throws point P (below it) onto the plane y = h at  P' = L + (P - L) * (h - L.y) / (P.y - L.y).
// The shadow of a convex caster resting on the plane is the convex hull of its projected top and its own footprint.

import type { Solid } from '../../sim/geom';

export type Pt = [number, number]; // x, z on the ground plane
export interface Light3 {
  x: number;
  y: number;
  z: number;
}

/** Where point (px, py, pz) falls on the plane y = h from the light; null if the point is level with or above it. */
export function project(L: Light3, px: number, py: number, pz: number, h: number): Pt | null {
  const dy = py - L.y;
  if (dy > -1e-3) return null; // at or above the flame: its shadow runs off to infinity
  const k = (h - L.y) / dy;
  return [L.x + (px - L.x) * k, L.z + (pz - L.z) * k];
}

/** Convex hull (monotone chain), counter-clockwise on x/z. */
export function hull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Corners (box) or rim points (cylinder) of a solid at height y, on x/z. */
function outline(s: Solid, y: number, rim = 16): [number, number, number][] {
  const out: [number, number, number][] = [];
  if (s.kind === 'cyl') {
    for (let i = 0; i < rim; i++) {
      const a = (i / rim) * Math.PI * 2;
      out.push([s.x + Math.cos(a) * s.hw, y, s.z + Math.sin(a) * s.hw]);
    }
    return out;
  }
  const c = Math.cos(s.ry);
  const sn = Math.sin(s.ry);
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    // the solid's local frame: world = rotate(-ry) of local (see geom.toLocal)
    const lx = u * s.hw;
    const lz = v * s.hd;
    out.push([s.x + lx * c + lz * sn, y, s.z - lx * sn + lz * c]);
  }
  return out;
}

/**
 * The shadow a solid throws on the plane y = h (h at or below its base), clipped to `reach` metres from the
 * flame's foot. Empty when the flame is below the solid's top's reach or the solid is out of range.
 */
export function solidShadow(L: Light3, s: Solid, h: number, reach: number): Pt[] {
  if (s.y0 > L.y) return [];
  const pts: Pt[] = [];
  for (const [x, , z] of outline(s, s.y0)) pts.push([x, z]); // its footprint (where it stands)
  const top = Math.min(s.y1, L.y - 0.02);
  for (const [x, y, z] of outline(s, top)) {
    const p = project(L, x, y, z, h);
    if (p) pts.push(clampReach(L, p, reach));
  }
  return hull(pts);
}

/** A body (a standing figure, or him) as an upright cylinder: its shadow on the plane y = h. */
export function bodyShadow(L: Light3, x: number, z: number, y0: number, height: number, r: number, h: number, reach: number): Pt[] {
  return solidShadow(L, { kind: 'cyl', x, z, hw: r, hd: r, ry: 0, y0, y1: y0 + height }, h, reach);
}

function clampReach(L: Light3, p: Pt, reach: number): Pt {
  const dx = p[0] - L.x;
  const dz = p[1] - L.z;
  const d = Math.hypot(dx, dz);
  if (d <= reach) return p;
  return [L.x + (dx / d) * reach, L.z + (dz / d) * reach];
}

/** Is (x, z) inside the polygon? (even-odd; any winding, convex or not) */
export function pointInPoly(poly: readonly Pt[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed distance from (x, z) to a convex counter-clockwise polygon's edges: > 0 inside (the smallest margin). */
export function insideMargin(poly: readonly Pt[], x: number, z: number): number {
  if (poly.length < 3) return -Infinity;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez) || 1;
    // left of the edge (counter-clockwise interior) is positive
    const d = (ex * (z - az) - ez * (x - ax)) / len;
    m = Math.min(m, d);
  }
  return m;
}

/** Area of a polygon (absolute). */
export function area(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a) / 2;
}

/** How far a pole's shadow tip lies from its foot: d * h / (H - h); Infinity when the flame is no higher than it. */
export function shadowLength(flameDist: number, poleH: number, flameH: number): number {
  return flameH <= poleH ? Infinity : (flameDist * poleH) / (flameH - poleH);
}
