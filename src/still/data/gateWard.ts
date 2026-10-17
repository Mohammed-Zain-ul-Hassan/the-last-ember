// District 1: The Gate Ward (the tutorial). Teaches carrying the flame, the true angle, stepping into a replay.
//
//   x -20..10   the outer ward: the first brazier, the gate boy, the old gatekeeper
//   x  10..34   the vaulted passage: the lever guard, the pillar, the lever behind it; the portcullis at x = 34
//   x  34..58   the gate court: a brazier chamber, the two guards holding the gate, the gate itself at x = 58
//   x  58..64   through the gate: the way into the city
//
// Puzzle A: the lever guard's shadow on the passage wall reaches for a lever hidden behind a pillar. Light him from
// low and to the left (behind him), wake him, step in, and pull it yourself: the portcullis rises.
// Puzzle B: two guards hold the gate. Wake both, in either order; step into the second replay to lift the bar.

import { box, cyl, type Solid } from '../../sim/geom';
import type { Clip } from '../../sim/pose';
import type { District, FigureDef, Plane } from '../sim/types';
import { FLOOR } from '../sim/types';

const wall = (x0: number, x1: number, z: number, thick: number, h: number, tag = 'wall'): Solid => box((x0 + x1) / 2, z, x1 - x0, thick, h, 0, 0, tag);
const wallZ = (x: number, z0: number, z1: number, thick: number, h: number, tag = 'wall'): Solid => box(x, (z0 + z1) / 2, thick, z1 - z0, h, 0, 0, tag);
const plane = (p: [number, number, number], n: [number, number, number]): Plane => ({ p, n });

// the passage's walls (inner faces at z = +-3.6), the courts' (+-6 and +-6.5)
const PASSAGE_N = plane([0, 0, 3.6], [0, 0, -1]);
const WARD_S = plane([0, 0, -6], [0, 0, 1]);
const WARD_N = plane([0, 0, 6], [0, 0, -1]);
const GATE_FACE = plane([57.58, 0, 0], [-1, 0, 0]);

const LEVER = { x: 28.0, z: 3.45 };
const PILLAR = { x: 26.8, z: 2.1 };

/** The lever guard: frozen mid-stride, reaching toward the lever behind the pillar. His last ten seconds. */
const yaw0 = Math.atan2(LEVER.z - 0.6, LEVER.x - 24.6);
const REACH = { lean: 0.28, head: -0.12, aF: 1.4, eF: 0.12, aB: -0.45, eB: 0.3, lF: 0.45, kF: -0.25, lB: -0.4, kB: -0.35 };
const leverClip: Clip = {
  len: 10,
  keys: [
    { t: 0, pose: REACH },
    { t: 0.9, pose: { lean: 0.15, aF: 0.4, aB: -0.2 } },
    { t: 3.9, pose: { lean: 0.1, aF: 0.3 } },
    { t: 4.6, pose: { aF: 2.5, eF: 0.15, lean: 0.02, head: -0.35 } },
    { t: 5.4, pose: { aF: 1.25, eF: 1.0, lean: 0.38, head: 0.1, lF: 0.3, kF: -0.3 } },
    { t: 6.1, pose: { aF: 0.95, eF: 1.1, lean: 0.3 } },
    { t: 7.4, pose: { head: -0.2, aF: 0.2, lean: 0 } },
    { t: 8.4, pose: { aF: 2.7, eF: 0.3, aB: -0.2, head: -0.25 } },
    { t: 10, pose: { aF: 2.6, eF: 0.4, head: -0.3 } },
  ],
  path: [
    [0, 24.6, 0.6, yaw0],
    [0.9, 24.95, 0.72, yaw0],
    [2.4, 27.35, 1.1, 0.35],
    [3.9, 27.75, 2.95, Math.PI / 2],
    [6.6, 27.75, 2.95, Math.PI / 2],
    [7.6, 27.6, 2.8, 0],
    [10, 27.6, 2.8, 0],
  ],
  walk: [[0.8, 3.9]],
  triggers: [{ t: 5.3, id: 'lever' }],
};

/** The gate guards: shoulders to the gate, holding it shut; then, together, the bar. */
const PUSH = { lean: 0.5, head: -0.1, aF: 1.45, eF: 0.35, aB: 1.35, eB: 0.4, lF: -0.35, kF: -0.1, lB: 0.55, kB: -0.55 };
const guardClip = (z: number, side: number): Clip => ({
  len: 10,
  keys: [
    { t: 0, pose: PUSH },
    { t: 1.6, pose: { ...PUSH, lean: 0.56, head: 0.05 } },
    { t: 2.8, pose: { ...PUSH, lean: 0.42, head: -0.2 } },
    { t: 3.8, pose: { lean: 0.05, head: -0.15, aF: 0.3, aB: 0.2 } },
    { t: 5.0, pose: { y: -0.25, lean: 0.45, aF: 1.1, eF: 0.6, aB: 1.0, eB: 0.6, lF: 0.6, kF: -0.8, lB: -0.1, kB: -0.6 } },
    { t: 6.3, pose: { y: 0, lean: 0.05, aF: 2.0, eF: 0.25, aB: 1.9, eB: 0.25, head: -0.3 } },
    { t: 7.6, pose: { aF: 2.2, eF: 0.2, aB: 2.1, eB: 0.2, head: -0.45 } },
    { t: 10, pose: { aF: 0.6, aB: 0.4, lean: -0.1, head: -0.3 } },
  ],
  path: [
    [0, 56.9, z, 0],
    [3.8, 56.85, z, 0],
    [4.6, 56.6, z - side * 0.9, 0],
    [10, 56.6, z - side * 0.9, 0],
  ],
  walk: [[3.8, 4.6]],
  triggers: [{ t: 6.3, id: 'bar' }],
});

const figures: FigureDef[] = [
  {
    id: 'lever', kind: 'guard', x: 24.6, z: 0.6, yaw: yaw0, frozen: REACH, word: 0, puzzle: 'lever', line: 'gate.firstLit',
    // low and to his left, behind him: his shadow is thrown up the passage wall toward the lever
    light: [23.0, 0.95, -1.5],
    ink: PASSAGE_N,
    clip: leverClip,
    stepIn: [{ id: 'lever', x: 27.9, z: 3.0, r: 1.25, label: 'pull the lever' }],
  },
  {
    id: 'second', kind: 'guard', x: 56.9, z: 1.5, yaw: 0, frozen: PUSH, word: 1, puzzle: 'gate',
    light: [51.0, 2.75, 3.6], // high, from the north
    ink: GATE_FACE,
    inkGone: 'bar',
    clip: guardClip(1.5, 1),
    stepIn: [{ id: 'bar', x: 56.6, z: 0, r: 1.6, label: 'lift the bar', needs: ['woke:second', 'woke:watch'], fail: 'Too heavy for one. He was not alone.' }],
  },
  {
    id: 'watch', kind: 'guard', x: 56.9, z: -1.5, yaw: 0, frozen: { ...PUSH, lean: 0.46, aF: 1.6 }, word: 3, puzzle: 'gate',
    light: [51.6, 1.15, -0.4], // low, from the middle of the court
    ink: GATE_FACE,
    inkGone: 'bar',
    clip: guardClip(-1.5, -1),
    stepIn: [{ id: 'bar', x: 56.6, z: 0, r: 1.6, label: 'lift the bar', needs: ['woke:second', 'woke:watch'], fail: 'Too heavy for one. He was not alone.' }],
  },
  // Last Words on the path (the first five sit where anyone walking by with the flame held up will find them)
  {
    id: 'boy', kind: 'child', h: 1.25, x: 2.2, z: -4.6, yaw: Math.PI / 2, frozen: { y: -0.5, lF: 1.5, kF: -1.6, lB: 1.4, kB: -1.5, lean: 0.25, aF: 0.9, eF: 1.4, aB: 0.8, eB: 1.4, head: 0.2 }, word: 2, tol: 15,
    light: [1.2, 1.95, -1.4],
    ink: WARD_S,
  },
  {
    id: 'keeper', kind: 'elder', x: 8.4, z: 4.4, yaw: -Math.PI / 2, frozen: { lean: 0.18, head: 0.15, aF: 0.6, eF: 0.5, aB: -0.1 }, holds: 'staff', word: 4, tol: 15,
    light: [7.2, 2.05, 1.6],
    ink: WARD_N,
  },
];

const solids: Solid[] = [
  // the outer ward
  wallZ(-20.5, -7, 7, 1, 8),
  wall(-20, 10, -6.5, 1, 7),
  wall(-20, 10, 6.5, 1, 7),
  // the passage: its walls, the pillar that hides the lever, buttresses along it
  wallZ(10, -7, -3.6, 1, 8, 'gatepier'),
  wallZ(10, 3.6, 7, 1, 8, 'gatepier'),
  wall(10, 34, -4.1, 1, 5.6),
  wall(10, 34, 4.1, 1, 5.6),
  cyl(PILLAR.x, PILLAR.z, 0.45, 5.6, 0, 'pillar'),
  cyl(17.5, -3.1, 0.38, 5.6, 0, 'pillar'),
  cyl(21.5, 3.1, 0.38, 5.6, 0, 'pillar'),
  cyl(31.5, -3.1, 0.38, 5.6, 0, 'pillar'),
  // the gate court
  wallZ(34, -7.5, -3.6, 1, 8, 'gatepier'),
  wallZ(34, 3.6, 7.5, 1, 8, 'gatepier'),
  wall(34, 58, -7, 1, 8),
  wall(34, 58, 7, 1, 8),
  // the brazier chamber: an alcove of two short walls
  box(36.8, -5.0, 0.6, 2.4, 3.2, 0, 0, 'wall'),
  box(40.6, -5.0, 0.6, 2.4, 3.2, 0, 0, 'wall'),
  // the city wall and the gate's piers
  box(58.5, 5.25, 1, 4.5, 9, 0, 0, 'citywall'),
  box(58.5, -5.25, 1, 4.5, 9, 0, 0, 'citywall'),
  box(58.5, 3.25, 1.6, 0.9, 7.2, 0, 0, 'gatepier'),
  box(58.5, -3.25, 1.6, 0.9, 7.2, 0, 0, 'gatepier'),
  // beyond the gate: the street into the city, closed off further on
  wall(59, 66, 3.6, 1, 6),
  wall(59, 66, -3.6, 1, 6),
  // crates and a cart in the ward, something for the flame to throw shadows from
  box(-6.5, -4.6, 1.1, 1.1, 1.0, 0.3, 0, 'crate'),
  box(-5.4, -4.9, 0.8, 0.8, 0.8, -0.2, 0, 'crate'),
  box(-15, 4.9, 1.3, 1.0, 1.2, 0.2, 0, 'crate'),
  box(4.5, 4.6, 1.2, 1.0, 1.1, 0.1, 0, 'crate'),
  box(45, 5.6, 1.1, 1.1, 1.0, 0.4, 0, 'crate'),
  box(50, -5.8, 1.2, 0.9, 0.9, 0, 0, 'crate'),
];

export const GATE_WARD: District = {
  id: 'gate',
  index: 0,
  name: 'The Gate Ward',
  sub: 'carrying the flame · the true angle · stepping in',
  card: 'The city lets you in. It is not sure why.',
  area: { kind: 'band', x0: -20, x1: 64, z0: -6.5, z1: 6.5 },
  regions: [],
  solids,
  pits: [],
  start: { x: -10, z: 0, yaw: 0 },
  braziers: [
    { id: 'ward', x: -7, z: 4.4 },
    { id: 'court', x: 38.7, z: -5.6 },
  ],
  torches: [
    { id: 't1', x: -12, y: 2.7, z: -5.95, ry: Math.PI / 2 },
    { id: 't0', x: -17, y: 2.7, z: 5.95, ry: -Math.PI / 2 },
    { id: 't2', x: 6, y: 2.7, z: 5.95, ry: -Math.PI / 2 },
    { id: 't3', x: 15, y: 2.6, z: 3.55, ry: -Math.PI / 2 },
    { id: 't4', x: 29, y: 2.6, z: -3.55, ry: Math.PI / 2 },
    { id: 't5', x: 44, y: 2.8, z: 6.45, ry: -Math.PI / 2 },
    { id: 't6', x: 52, y: 2.8, z: -6.45, ry: Math.PI / 2 },
  ],
  figures,
  mechs: [
    { id: 'portcullis', kind: 'portcullis', x: 34, z: 0, w: 7.2, h: 5.2, ry: 0, opens: 'lever', blocks: [box(34, 0, 0.5, 7.2, 5.2, 0, 0, 'mech')] },
    { id: 'lever', kind: 'lever', x: LEVER.x, z: LEVER.z, w: 0.3, h: 1.6, ry: 0, opens: 'lever', blocks: [], frozenMsg: 'The lever will not move. It is held in the same second as everything else.' },
    { id: 'gate', kind: 'gate', x: 57.85, z: 0, w: 5.6, h: 6.2, ry: 0, opens: 'bar', blocks: [box(57.85, 0, 0.5, 5.6, 6.2, 0, 0, 'mech')] },
  ],
  riddles: [{ id: 'gate', x: 33.6, y: 5.9, z: 0, ry: -Math.PI / 2, puzzle: 'lever' }],
  zones: [],
  plates: [],
  gusts: [],
  sequences: [],
  derive: [],
  pages: [],
  maze: null,
  wrong: {
    mode: 'still',
    spawn: [32.2, -2.2],
    appear: { x0: 13, z0: -3.6, x1: 22, z1: 3.6 },
    nodes: [],
    speed: 0,
    sprint: 0,
  },
  exit: { x0: 60, z0: -3.4, x1: 64, z1: 3.4 },
  decor: [
    { kind: 'vault', x0: 10.5, x1: 33.6, z0: -3.6, z1: 3.6, y: 5.6 },
    { kind: 'arch', x: 10, z0: -3.6, z1: 3.6, y: 5.4, thick: 1.2 },
    { kind: 'arch', x: 34, z0: -3.6, z1: 3.6, y: 5.4, thick: 1.2 },
    { kind: 'arch', x: 58.5, z0: -2.8, z1: 2.8, y: 6.6, thick: 1.6 },
    { kind: 'banner', x: -19.9, y: 6.2, z: -2.5, ry: Math.PI / 2, len: 3.6 },
    { kind: 'banner', x: -19.9, y: 6.2, z: 2.5, ry: Math.PI / 2, len: 3.6 },
    { kind: 'banner', x: 46, y: 7.2, z: 6.45, ry: Math.PI, len: 4.2 },
    { kind: 'banner', x: 46, y: 7.2, z: -6.45, ry: 0, len: 4.2 },
    { kind: 'rubble', x: -2, z: -5.2, n: 5, r: 1.2 },
    { kind: 'rubble', x: 7, z: -5.3, n: 4, r: 1 },
    { kind: 'rubble', x: 48, z: 5.8, n: 5, r: 1.3 },
    { kind: 'carving', x: -14, y: 3.4, z: 5.95, ry: Math.PI, scene: 'crowd' },
    { kind: 'carving', x: 44, y: 4.2, z: -6.45, ry: 0, scene: 'market' },
  ],
  lines: { replayEnd: 'gate.replayEnds', stepIn: 'gate.stepIn', wrongSeen: 'gate.wrongSeen', flags: { bar: 'gate.opens' } },
  rumble: 0.1,
  rain: true,
  intro: [
    { at: [-6, 0, 0], yaw: -2.2, height: 6.5, dist: 9, lookY: 1.5, fov: 50, dur: 3.4 },
    { at: [24.6, 0, 0.6], yaw: -1.57, height: 2.2, dist: 6, lookY: 1.7, fov: 46, dur: 3.4 },
    { at: [56, 0, 0], yaw: -1.4, height: 3, dist: 9, lookY: 2.6, fov: 48, dur: 3.2 },
  ],
  sky: 'night',
};

export { FLOOR };
