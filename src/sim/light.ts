// The same light the renderer draws, solved on the CPU: a point light of height h casts
// shadows behind each occluder, and the shadow is finite only while the flame is taller than the occluder.

import type { Occluder } from './layout';

export interface PointLightState {
  x: number;
  z: number;
  h: number; // flame height
  r: number; // reach on the ground
}

export interface SunState {
  on: boolean;
  dx: number; // unit vector on the ground pointing toward the sun
  dz: number;
  elev: number; // elevation (rad)
  edge: number; // only points with (p . dir) > edge are sunlit; -Infinity for all
  ridge?: number; // dawn: points with (p . dir) > ridge are still in the eastern ridge's shadow
}

/** Is point p in the shadow of occluder o, for a point light? */
export function shadowedByPoint(L: PointLightState, px: number, pz: number, o: Occluder): boolean {
  const dx = px - L.x;
  const dz = pz - L.z;
  const D2 = dx * dx + dz * dz;
  if (D2 < 1e-6) return false;
  const ox = o.x - L.x;
  const oz = o.z - L.z;
  const t = (ox * dx + oz * dz) / D2;
  if (t <= 0) return false;
  const cx = dx * t - ox;
  const cz = dz * t - oz;
  const perp2 = cx * cx + cz * cz;
  if (perp2 > o.r * o.r) return false;
  const D = Math.sqrt(D2);
  const along = t * D;
  const half = Math.sqrt(o.r * o.r - perp2);
  if (D <= along + half) return false; // p is in front of (or inside) the occluder
  if (L.h <= o.h) return true; // flame lower than the stone: the shadow never ends
  // ray height above the occluder's centre
  const y = L.h * (1 - along / D);
  return y < o.h;
}

/** Shadow length behind an occluder at horizontal distance d from the light (Infinity if the flame is lower). */
export function shadowLength(lightH: number, occH: number, d: number): number {
  if (lightH <= occH) return Infinity;
  return d / (1 - occH / lightH) - d;
}

export function shadowedBySun(S: SunState, px: number, pz: number, o: Occluder): boolean {
  const ox = o.x - px;
  const oz = o.z - pz;
  const s = ox * S.dx + oz * S.dz;
  if (s <= 0) return false;
  const cx = ox - S.dx * s;
  const cz = oz - S.dz * s;
  if (cx * cx + cz * cz > o.r * o.r) return false;
  return s * Math.tan(S.elev) < o.h;
}

export interface LightQuery {
  fire: PointLightState | null;
  fireOccluders: Occluder[];
  sun: SunState | null;
  sunOccluders: Occluder[];
}

export function litByFire(q: LightQuery, px: number, pz: number): boolean {
  const L = q.fire;
  if (!L) return false;
  const dx = px - L.x;
  const dz = pz - L.z;
  if (dx * dx + dz * dz > L.r * L.r) return false;
  for (const o of q.fireOccluders) if (shadowedByPoint(L, px, pz, o)) return false;
  return true;
}

export function litBySun(q: LightQuery, px: number, pz: number): boolean {
  const S = q.sun;
  if (!S || !S.on) return false;
  const u = px * S.dx + pz * S.dz;
  if (u < S.edge) return false;
  if (S.ridge !== undefined && u > S.ridge) return false;
  for (const o of q.sunOccluders) if (shadowedBySun(S, px, pz, o)) return false;
  return true;
}

export function isLit(q: LightQuery, px: number, pz: number): boolean {
  return litByFire(q, px, pz) || litBySun(q, px, pz);
}

/** Square grid over the arena: which cells are lit, which are walkable, and a flow field toward a goal. */
export class LightGrid {
  readonly n: number;
  readonly half: number;
  readonly cell: number;
  readonly lit: Uint8Array;
  readonly blocked: Uint8Array;
  readonly dist: Float32Array;
  readonly dirX: Float32Array;
  readonly dirZ: Float32Array;
  private heap: Int32Array;
  private heapKey: Float32Array;

  constructor(arenaRadius: number, cell: number, statics: Occluder[]) {
    this.cell = cell;
    this.n = Math.ceil((arenaRadius * 2 + 4) / cell);
    this.half = (this.n * cell) / 2;
    const N = this.n * this.n;
    this.lit = new Uint8Array(N);
    this.blocked = new Uint8Array(N);
    this.dist = new Float32Array(N);
    this.dirX = new Float32Array(N);
    this.dirZ = new Float32Array(N);
    this.heap = new Int32Array(N * 8);
    this.heapKey = new Float32Array(N * 8);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = this.cx(i);
        const z = this.cz(j);
        let b = Math.hypot(x, z) > arenaRadius + 1.5;
        for (const o of statics) {
          if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.25) ** 2) b = true;
        }
        this.blocked[j * this.n + i] = b ? 1 : 0;
      }
    }
  }

  cx(i: number): number {
    return -this.half + (i + 0.5) * this.cell;
  }
  cz(j: number): number {
    return -this.half + (j + 0.5) * this.cell;
  }
  index(x: number, z: number): number {
    const i = Math.floor((x + this.half) / this.cell);
    const j = Math.floor((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  litAt(x: number, z: number): boolean {
    const k = this.index(x, z);
    return k >= 0 && this.lit[k] === 1;
  }

  rebuildLight(q: LightQuery): void {
    const n = this.n;
    for (let j = 0; j < n; j++) {
      const z = this.cz(j);
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (this.blocked[k]) {
          this.lit[k] = 0;
          continue;
        }
        this.lit[k] = isLit(q, this.cx(i), z) ? 1 : 0;
      }
    }
  }

  /** Dijkstra from every cell within goalR of (gx, gz). Lit cells cost litCost, dark cells cost 1. */
  rebuildFlow(gx: number, gz: number, goalR: number, litCost: number): void {
    const n = this.n;
    const N = n * n;
    const dist = this.dist;
    dist.fill(Infinity);
    let size = 0;
    const heap = this.heap;
    const key = this.heapKey;
    const push = (k: number, d: number) => {
      let c = size++;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (key[p] <= d) break;
        heap[c] = heap[p];
        key[c] = key[p];
        c = p;
      }
      heap[c] = k;
      key[c] = d;
    };
    const pop = (): number => {
      const top = heap[0];
      const lastK = heap[--size];
      const lastD = key[size];
      let c = 0;
      for (;;) {
        let m = c * 2 + 1;
        if (m >= size) break;
        if (m + 1 < size && key[m + 1] < key[m]) m++;
        if (key[m] >= lastD) break;
        heap[c] = heap[m];
        key[c] = key[m];
        c = m;
      }
      heap[c] = lastK;
      key[c] = lastD;
      return top;
    };
    const r2 = goalR * goalR;
    for (let k = 0; k < N; k++) {
      const i = k % n;
      const j = (k / n) | 0;
      if ((this.cx(i) - gx) ** 2 + (this.cz(j) - gz) ** 2 <= r2) {
        dist[k] = 0;
        push(k, 0);
      }
    }
    const DI = [1, -1, 0, 0, 1, 1, -1, -1];
    const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (size > 0 && size < heap.length - 8) {
      const d0 = key[0];
      const k = pop();
      if (d0 > dist[k]) continue;
      const i = k % n;
      const j = (k / n) | 0;
      for (let e = 0; e < 8; e++) {
        const ni = i + DI[e];
        const nj = j + DJ[e];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (this.blocked[nk]) continue;
        if (e >= 4 && (this.blocked[j * n + ni] || this.blocked[nj * n + i])) continue; // no corner cutting
        const c = (this.lit[nk] ? litCost : 1) * (e >= 4 ? 1.4142 : 1);
        const nd = d0 + c;
        if (nd < dist[nk]) {
          dist[nk] = nd;
          push(nk, nd);
        }
      }
    }
    // direction: toward the lowest neighbour
    for (let k = 0; k < N; k++) {
      this.dirX[k] = 0;
      this.dirZ[k] = 0;
      if (this.blocked[k] || dist[k] === Infinity || dist[k] === 0) continue;
      const i = k % n;
      const j = (k / n) | 0;
      let best = dist[k];
      let bx = 0;
      let bz = 0;
      for (let e = 0; e < 8; e++) {
        const ni = i + DI[e];
        const nj = j + DJ[e];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (this.blocked[nk]) continue;
        if (e >= 4 && (this.blocked[j * n + ni] || this.blocked[nj * n + i])) continue;
        if (dist[nk] < best) {
          best = dist[nk];
          bx = DI[e];
          bz = DJ[e];
        }
      }
      const l = Math.hypot(bx, bz) || 1;
      this.dirX[k] = bx / l;
      this.dirZ[k] = bz / l;
    }
  }

  /** Fraction of non-blocked cells inside radius r that are lit (for HUD / danger / tests). */
  litFraction(r: number): number {
    let lit = 0;
    let tot = 0;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const k = j * this.n + i;
        if (this.blocked[k]) continue;
        if (this.cx(i) ** 2 + this.cz(j) ** 2 > r * r) continue;
        tot++;
        lit += this.lit[k];
      }
    }
    return tot ? lit / tot : 0;
  }
}
