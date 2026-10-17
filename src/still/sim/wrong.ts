// The Wrong Shadow's legs: where it can walk. It moves only while unseen and unlit, so it never needs to look like
// it walks well; it needs to arrive. Nodes are places in shadow (behind pillars, in doorways); two nodes are joined
// when nothing stands between them. Paths are all-pairs shortest (a district has a few dozen nodes at most).

import { firstHit, type Solid } from '../../sim/geom';

export interface WalkGraph {
  nodes: [number, number][];
  dist: number[][]; // shortest path lengths (Infinity when unreachable)
  next: number[][]; // first hop from i toward j
}

const CHEST = 1.0;
export const clear = (solids: readonly Solid[], ax: number, az: number, bx: number, bz: number): boolean => firstHit(solids, ax, CHEST, az, bx, CHEST, bz) >= 1;

export function buildGraph(nodes: [number, number][], solids: readonly Solid[]): WalkGraph {
  const n = nodes.length;
  const dist: number[][] = [];
  const next: number[][] = [];
  for (let i = 0; i < n; i++) {
    dist.push(new Array(n).fill(Infinity));
    next.push(new Array(n).fill(-1));
    dist[i][i] = 0;
    next[i][i] = i;
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const [ax, az] = nodes[i];
      const [bx, bz] = nodes[j];
      const d = Math.hypot(bx - ax, bz - az);
      if (d < 16 && clear(solids, ax, az, bx, bz)) {
        dist[i][j] = dist[j][i] = d;
        next[i][j] = j;
        next[j][i] = i;
      }
    }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const d = dist[i][k] + dist[k][j];
        if (d < dist[i][j]) {
          dist[i][j] = d;
          next[i][j] = next[i][k];
        }
      }
  return { nodes, dist, next };
}

/**
 * Where to walk next from (wx, wz) to reach (px, pz): straight at it when nothing is in the way, else toward the
 * first node of the shortest route through the graph. Null when there is no way.
 */
export function steer(g: WalkGraph, solids: readonly Solid[], wx: number, wz: number, px: number, pz: number): [number, number] | null {
  if (clear(solids, wx, wz, px, pz)) return [px, pz];
  const from: number[] = [];
  const to: number[] = [];
  g.nodes.forEach(([x, z], i) => {
    if (Math.hypot(x - wx, z - wz) < 16 && clear(solids, wx, wz, x, z)) from.push(i);
    if (Math.hypot(x - px, z - pz) < 16 && clear(solids, px, pz, x, z)) to.push(i);
  });
  let best = Infinity;
  let pick = -1;
  for (const a of from)
    for (const b of to) {
      const [ax, az] = g.nodes[a];
      const [bx, bz] = g.nodes[b];
      const d = Math.hypot(ax - wx, az - wz) + g.dist[a][b] + Math.hypot(px - bx, pz - bz);
      if (d < best) {
        best = d;
        pick = Math.hypot(ax - wx, az - wz) < 0.35 && a !== b ? g.next[a][b] : a;
      }
    }
  return pick < 0 ? null : g.nodes[pick];
}
