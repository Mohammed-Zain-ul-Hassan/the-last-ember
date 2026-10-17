// Walkability audit for a level GLB: flood-fills the COL_* boxes from PlayerSpawn using the
// PlayerController rules (square footprint, step-up, standing height) and reports which
// checkpoints are reachable on foot, and which also need runner jumps.
//
//   node scripts/audit-level-connectivity.mjs [public/models/levels/ember_climb.glb]
import fs from 'node:fs';

const FILE = process.argv[2] ?? 'public/models/levels/ember_climb.glb';
const RADIUS = 0.35;
const STEP = 0.4;
const HEIGHT = 1.8;
const CELL = 0.25;
const EPS = 1e-4;
// Runner jump: v0 8.5, g 24, walk speed 6 m/s (no sprint / dash, so the estimate is conservative).
const JUMP_V = 8.5;
const G = 24;
const RUN = 6;
const JUMP_CELL = 0.5;

// ---- GLB → world-space AABBs (Three.js axes) ----
const buf = fs.readFileSync(FILE);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());

function nodeMatrix(n) {
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const t = n.translation ?? [0, 0, 0];
  const r = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  return (p) => [0, 1, 2].map((i) => r[i][0] * p[0] * sx + r[i][1] * p[1] * sy + r[i][2] * p[2] * sz + t[i]);
}

const boxes = [];
const empties = {};
function walk(index, parents) {
  const n = gltf.nodes[index];
  const chain = [nodeMatrix(n), ...parents];
  const world = (p) => chain.reduce((a, f) => f(a), p);
  if (n.mesh !== undefined && n.name?.startsWith('COL_')) {
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (const prim of gltf.meshes[n.mesh].primitives) {
      const a = gltf.accessors[prim.attributes.POSITION];
      for (const cx of [a.min[0], a.max[0]])
        for (const cy of [a.min[1], a.max[1]])
          for (const cz of [a.min[2], a.max[2]]) {
            const w = world([cx, cy, cz]);
            for (let k = 0; k < 3; k++) {
              mn[k] = Math.min(mn[k], w[k]);
              mx[k] = Math.max(mx[k], w[k]);
            }
          }
    }
    boxes.push({ name: n.name, min: mn, max: mx });
  } else if (n.mesh === undefined && n.name) {
    empties[n.name] = world([0, 0, 0]);
  }
  for (const c of n.children ?? []) walk(c, chain);
}
for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, []);

// ---- Spatial buckets ----
const BUCKET = 2;
const buckets = new Map();
const key = (i, j) => `${i},${j}`;
for (const b of boxes) {
  for (let i = Math.floor(b.min[0] / BUCKET); i <= Math.floor(b.max[0] / BUCKET); i++)
    for (let j = Math.floor(b.min[2] / BUCKET); j <= Math.floor(b.max[2] / BUCKET); j++) {
      const k = key(i, j);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(b);
    }
}
function footprintBoxes(x, z) {
  const seen = new Set();
  const out = [];
  for (let i = Math.floor((x - RADIUS) / BUCKET); i <= Math.floor((x + RADIUS) / BUCKET); i++)
    for (let j = Math.floor((z - RADIUS) / BUCKET); j <= Math.floor((z + RADIUS) / BUCKET); j++)
      for (const b of buckets.get(key(i, j)) ?? []) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (x + RADIUS > b.min[0] + EPS && x - RADIUS < b.max[0] - EPS && z + RADIUS > b.min[2] + EPS && z - RADIUS < b.max[2] - EPS)
          out.push(b);
      }
  return out;
}

/** Feet height the controller settles at when arriving at (x, z) with feet at y; null = blocked. */
function settle(x, z, y) {
  const fb = footprintBoxes(x, z);
  for (const b of fb) if (b.max[1] > y + STEP && b.min[1] < y + HEIGHT) return null;
  let support = -Infinity;
  for (const b of fb) if (b.max[1] <= y + STEP && b.max[1] > support) support = b.max[1];
  if (support === -Infinity) return null;
  return support;
}

/** Settle after a small horizontal move; walking off an edge falls to the next surface below. */
function moveTo(x, z, y) {
  const y2 = settle(x, z, y);
  if (y2 !== null) return y2;
  const fb = footprintBoxes(x, z);
  if (fb.some((b) => b.max[1] > y + STEP && b.min[1] < y + HEIGHT)) return null;
  const below = fb.filter((b) => b.max[1] <= y).map((b) => b.max[1]);
  if (!below.length) return null;
  const land = Math.max(...below);
  return settle(x, z, land) === land ? land : null;
}

// ---- Flood fill ----
const q = (v) => Math.round(v / CELL);
const stateKey = (x, z, y) => `${q(x)},${q(z)},${Math.round(y * 20)}`;
const TERRAIN = Math.max(...boxes.filter((b) => b.name === 'COL_Terrain').map((b) => b.max[1]));

function flood(useJumps) {
  const spawn = empties.PlayerSpawn;
  const start = settle(spawn[0], spawn[2], spawn[1] + 0.05);
  const seen = new Map();
  const queue = [[spawn[0], spawn[2], start]];
  seen.set(stateKey(spawn[0], spawn[2], start), queue[0]);
  const dirs = [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]];
  const push = (x, z, y) => {
    if (y <= TERRAIN + 0.05) return; // a fall to the terrain is a softlock, not a route
    const k = stateKey(x, z, y);
    if (seen.has(k)) return;
    const s = [x, z, y];
    seen.set(k, s);
    queue.push(s);
  };
  for (let head = 0; head < queue.length; head++) {
    const [x, z, y] = queue[head];
    for (const [dx, dz] of dirs) {
      // 5 cm sub-moves, like the controller's substeps, so each tread is stepped onto in turn.
      let y2 = y;
      let px = x;
      let pz = z;
      for (let k = 1; k <= 5 && y2 !== null; k++) {
        px = x + (dx * k) / 5;
        pz = z + (dz * k) / 5;
        y2 = moveTo(px, pz, y2);
      }
      if (y2 !== null) push(x + dx, z + dz, y2);
    }
    if (useJumps && Math.abs(x / JUMP_CELL - Math.round(x / JUMP_CELL)) < 1e-6 && Math.abs(z / JUMP_CELL - Math.round(z / JUMP_CELL)) < 1e-6) {
      const maxReach = RUN * ((JUMP_V + JUMP_V) / G);
      const n = Math.ceil(maxReach / JUMP_CELL);
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++) {
          const dist = Math.hypot(i, j) * JUMP_CELL;
          if (dist < 1 || dist > maxReach) continue;
          const nx = x + i * JUMP_CELL;
          const nz = z + j * JUMP_CELL;
          const fb = footprintBoxes(nx, nz);
          for (const b of fb) {
            const dh = b.max[1] - y;
            if (dh > 1.45) continue; // apex is v²/2g ≈ 1.5 m
            const t = (JUMP_V + Math.sqrt(JUMP_V * JUMP_V - 2 * G * dh)) / G;
            if (dist > RUN * t * 0.9) continue;
            if (settle(nx, nz, b.max[1]) === b.max[1]) push(nx, nz, b.max[1]);
          }
        }
    }
  }
  return [...seen.values()];
}

function reached(states, x, y, z) {
  return states.some((s) => Math.abs(s[0] - x) <= 0.6 && Math.abs(s[1] - z) <= 0.6 && Math.abs(s[2] - y) < 0.25);
}

const top = (name) => boxes.find((b) => b.name === name)?.max[1];
const mid = (name) => {
  const b = boxes.find((o) => o.name === name);
  return [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
};
const checkpoints = [
  ['Gate floor', mid('COL_GateFloor')],
  ['Approach', mid('COL_ApproachFloor')],
  ['Court floor', [0, top('COL_CourtFloor'), -22]],
  ['Lean landing', mid('COL_LeanLand')],
  ['West gallery (BalW)', mid('COL_BalW')],
  ['Cloister bridge', mid('COL_CloisterBridge_Deck')],
  ['Narthex', mid('COL_NarthexFloor')],
  ['West street', mid('COL_WestStreet')],
  ['WestToNorth', mid('COL_WestToNorth')],
  ['North court', mid('COL_NorthFloor')],
  ['NorthToPlaza', mid('COL_NorthToPlaza')],
  ['WestToPlaza', mid('COL_WestToPlaza')],
  ['PlazaApproach', mid('COL_PlazaApproach')],
  ['PlayerEntry', [empties.PlayerEntry[0], top('COL_PlazaFloor'), empties.PlayerEntry[2]]],
  ['BossArena (plaza)', [empties.BossArena[0] - 4, top('COL_PlazaFloor'), empties.BossArena[2]]],
  ['East tower landing', mid('COL_EastLand')],
  ['Roof A', mid('COL_RoofA')],
  ['Roof B', mid('COL_RoofB')],
  ['Roof C', mid('COL_RoofC')],
  ['Roof drop landing', mid('COL_RoofDropLand')],
];

const ground = flood(false);
const runner = flood(true);
console.log(`${FILE}: ${boxes.length} colliders, ${ground.length} ground states, ${runner.length} runner states\n`);
console.log('checkpoint'.padEnd(24), 'ground', 'runner');
let ok = true;
for (const [label, [x, y, z]] of checkpoints) {
  const g = reached(ground, x, y, z);
  const r = g || reached(runner, x, y, z);
  console.log(label.padEnd(24), (g ? 'yes' : 'NO').padEnd(6), r ? 'yes' : 'NO');
  if (!r) ok = false;
}
const mustWalk = ['PlayerEntry', 'BossArena (plaza)', 'West street', 'North court', 'Lean landing'];
for (const label of mustWalk) {
  const [, [x, y, z]] = checkpoints.find(([l]) => l === label);
  if (!reached(ground, x, y, z)) ok = false;
}

// ---- Remaining floor-to-floor gaps (0.05–3 m, similar heights) ----
const floors = boxes.filter(
  (b) => !/Terrain|Outer_/.test(b.name) && b.max[0] - b.min[0] >= 0.5 && b.max[2] - b.min[2] >= 0.5 && b.max[1] > TERRAIN + 0.1 && b.max[1] - b.min[1] < 12,
);
const gaps = [];
for (let i = 0; i < floors.length; i++)
  for (let j = i + 1; j < floors.length; j++) {
    const a = floors[i];
    const b = floors[j];
    if (Math.abs(a.max[1] - b.max[1]) > 0.8) continue;
    const gx = Math.max(a.min[0] - b.max[0], b.min[0] - a.max[0]);
    const gz = Math.max(a.min[2] - b.max[2], b.min[2] - a.max[2]);
    const gap = Math.max(gx, gz);
    const overlap = gx > gz ? Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]) : Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
    if (gap > 0.05 && gap <= 3 && overlap >= 0.7) gaps.push([gap, a.name, b.name, a.max[1], b.max[1]]);
  }
gaps.sort((p, r) => p[0] - r[0]);
console.log(`\nfloor gaps 0.05–3 m (${gaps.length}):`);
for (const [gap, a, b, ta, tb] of gaps) console.log(`  ${gap.toFixed(2)} m  ${a} (${ta.toFixed(2)}) ↔ ${b} (${tb.toFixed(2)})`);

console.log(ok ? '\nPASS' : '\nFAIL');
process.exitCode = ok ? 0 : 1;
