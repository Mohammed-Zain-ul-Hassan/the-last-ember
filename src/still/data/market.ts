// District 2: The Market of Weights. Teaches: flame height changes a shadow's size; shadows can be bridges.
//
//   x  0..32   the square: three merchants frozen weighing, each with a pan on the flagstones. A pan balances when
//              the merchant's shadow covers it just so (raise the flame and the shadow shortens; lower it and it
//              runs long). All three balanced, the shutter to the canal lifts.
//   x 32..48   the dry canal (x 38..45): the beggar sits at its edge; his replay shows how he crossed: on his own
//              shadow, his lamp held low behind him. The riddle on the coin-stall sign says the same.
//   x 48..56   the far bank: a brazier
//   x 56..86   the stall row: it falls (the action beat). Gaps open ahead; the street falls in behind.
//   x 86..92   the end chamber: a brazier ("Rest. The fire needs it more than you."), the way on

import { box, cyl, type Solid } from '../../sim/geom';
import type { Clip } from '../../sim/pose';
import type { District, FigureDef, Pit, Plane } from '../sim/types';
import { FLOOR } from '../sim/types';

const wall = (x0: number, x1: number, z: number, thick: number, h: number, tag = 'wall'): Solid => box((x0 + x1) / 2, z, x1 - x0, thick, h, 0, 0, tag);
const wallZ = (x: number, z0: number, z1: number, thick: number, h: number, tag = 'wall'): Solid => box(x, (z0 + z1) / 2, thick, z1 - z0, h, 0, 0, tag);
const plane = (p: [number, number, number], n: [number, number, number]): Plane => ({ p, n });
const NORTH = plane([0, 0, 8], [0, 0, -1]);
const SOUTH = plane([0, 0, -8], [0, 0, 1]);

/** Merchants hold their scales out before them. */
const WEIGH = { lean: 0.08, head: 0.2, aF: 1.25, eF: 0.55, aB: 1.15, eB: 0.6 };

// where each merchant stands, their pan, and where the fire was when they froze (their balance, and their true angle)
export const MERCHANTS = [
  { id: 'fish', word: 5, x: 10, z: -4, light: [9.0, 2.9, -4.0] as [number, number, number], pan: { x0: 11.0, x1: 12.2, z0: -4.4, z1: -3.6 } },
  { id: 'scales', word: 9, x: 18, z: 4, light: [17.2, 2.68, 4.0] as [number, number, number], pan: { x0: 19.0, x1: 20.2, z0: 3.6, z1: 4.4 } },
  { id: 'coins', word: 10, x: 25, z: -4, light: [23.8, 2.62, -4.0] as [number, number, number], pan: { x0: 27.0, x1: 28.2, z0: -4.4, z1: -3.6 } },
];

/** The beggar's last ten seconds: up off the step, to the edge, the lamp behind him, and across on his own shadow. */
const beggarClip: Clip = {
  len: 10,
  keys: [
    { t: 0, pose: { y: -0.5, lF: 1.5, kF: -1.2, lB: 1.4, kB: -1.0, lean: 0.25, head: 0.3, aF: 0.5, eF: 1.2 } },
    { t: 1.4, pose: { lean: 0.1, head: 0.1 } },
    { t: 2.8, pose: { lean: 0.05, aB: -1.0, eB: 0.2, head: 0.25 } },
    { t: 3.6, pose: { lean: 0.15, aB: -1.2, eB: 0.15, head: 0.4 } },
    { t: 9, pose: { lean: 0.15, aB: -1.2, eB: 0.15, head: 0.3 } },
    { t: 10, pose: { head: -0.2, aB: -0.2 } },
  ],
  path: [
    [0, 36.6, 2.6, 0],
    [1.4, 36.6, 2.6, 0],
    [2.8, 37.7, 2.6, 0],
    [3.6, 37.9, 2.6, 0],
    [9, 46.4, 2.6, 0],
    [10, 46.6, 2.6, Math.PI],
  ],
  walk: [[1.4, 2.8], [3.6, 9]],
};

const BALANCE = [0.81, 0.84, 0.75];

const figures: FigureDef[] = [
  ...MERCHANTS.map(
    (m): FigureDef => ({
      id: m.id, kind: m.id === 'scales' ? 'elder' : 'man', x: m.x, z: m.z, yaw: m.z < 0 ? Math.PI / 2 : -Math.PI / 2, frozen: WEIGH, word: m.word, tol: 16, puzzle: 'scales',
      light: m.light, ink: m.z < 0 ? SOUTH : NORTH,
    }),
  ),
  {
    id: 'beggar', kind: 'man', x: 36.6, z: 2.6, yaw: 0, frozen: beggarClip.keys[0].pose, word: 6, puzzle: 'canal', line: undefined,
    light: [35.4, 2.3, 1.2], ink: FLOOR, clip: beggarClip,
  },
  { id: 'water', kind: 'woman', x: 36.4, z: -5.6, yaw: Math.PI / 2, frozen: { lean: 0.3, head: 0.45, aF: 0.6, eF: 0.4, aB: 0.5 }, word: 11, tol: 16, light: [35.2, 2.2, -3.4], ink: SOUTH },
  { id: 'baker', kind: 'man', x: 5.5, z: 7.0, yaw: -Math.PI / 2, frozen: { lean: -0.05, aF: 0.9, eF: 1.3, aB: 0.85, eB: 1.3, head: -0.1 }, word: 7, tol: 16, light: [6.4, 1.9, 4.6], ink: NORTH },
  { id: 'child', kind: 'child', h: 1.2, x: 47.5, z: 7.0, yaw: -Math.PI / 2, frozen: { y: -0.5, lF: 1.5, kF: -1.6, lB: 1.4, kB: -1.5, lean: 0.4, aF: 0.9, eF: 0.8, head: 0.5 }, word: 8, tol: 17, light: [47.0, 1.7, 4.8], ink: NORTH },
];

// the collapse: gaps that open as the run begins, and the street falling in behind
const C = 'collapse';
const pits: Pit[] = [
  { x0: 38, x1: 45, z0: -8, z1: 8, depth: 3.2 }, // the dry canal
  { x0: 64, x1: 67, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 0.3 },
  { x0: 73, x1: 76, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 0.3 },
  { x0: 80, x1: 82.6, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 0.3 },
  { x0: 56.5, x1: 63.95, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 5.0 },
  { x0: 67.05, x1: 72.95, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 9.0 },
  { x0: 76.05, x1: 79.95, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 12.5 },
  { x0: 82.65, x1: 85.4, z0: -3.1, z1: 3.1, depth: 6, when: C, at: 15.5 },
];

const solids: Solid[] = [
  // the square's walls and its houses' fronts
  wallZ(-0.5, -9, 9, 1, 7),
  wall(0, 32, 8.5, 1, 7, 'house'),
  wall(0, 32, -8.5, 1, 7, 'house'),
  // the shutter wall between the square and the canal
  wallZ(32, 3, 9, 1, 6),
  wallZ(32, -9, -3, 1, 6),
  // stalls about the square
  box(6, -6.6, 2.4, 1.2, 1.0, 0, 0, 'stall'),
  box(14, 6.6, 2.4, 1.2, 1.0, 0, 0, 'stall'),
  box(21.5, -6.6, 2.4, 1.2, 1.0, 0, 0, 'stall'),
  box(28.5, 6.6, 2.4, 1.2, 1.0, 0, 0, 'stall'),
  box(14.5, -1.5, 1.0, 1.0, 0.9, 0.3, 0, 'crate'),
  box(23, 1.8, 1.1, 0.9, 0.8, -0.2, 0, 'crate'),
  cyl(16, -6.4, 0.9, 0.9, 0, 'well'),
  // the canal's banks and the far bank's walls
  wall(32, 56, 8.5, 1, 6, 'house'),
  wall(32, 56, -8.5, 1, 6, 'house'),
  cyl(35.4, -6.8, 0.8, 0.9, 0, 'well'),
  // the stall row: a narrow street of shopfronts that will fall
  wallZ(56, 3.6, 9, 1, 6),
  wallZ(56, -9, -3.6, 1, 6),
  wall(56, 86, 4.1, 1, 5, 'house'),
  wall(56, 86, -4.1, 1, 5, 'house'),
  // the end chamber
  wallZ(86, 3.6, 9, 1, 6),
  wallZ(86, -9, -3.6, 1, 6),
  wall(86, 93, 8.5, 1, 6),
  wall(86, 93, -8.5, 1, 6),
  wallZ(93, -9, -2.5, 1, 7),
  wallZ(93, 2.5, 9, 1, 7),
];

export const MARKET: District = {
  id: 'market',
  index: 1,
  name: 'The Market of Weights',
  sub: 'a shadow grows as the flame sinks · a shadow can carry you',
  card: 'They were haggling when it happened.',
  area: { kind: 'band', x0: 0, x1: 95, z0: -8, z1: 8 },
  regions: [],
  solids,
  pits,
  start: { x: 6.5, z: 0, yaw: 0 },
  braziers: [
    { id: 'square', x: 3, z: -5.8 },
    { id: 'bank', x: 51, z: -6 },
    { id: 'end', x: 89, z: -6 },
  ],
  torches: [
    { id: 'm1', x: 9, y: 2.8, z: 7.95, ry: -Math.PI / 2 },
    { id: 'm2', x: 21, y: 2.8, z: -7.95, ry: Math.PI / 2 },
    { id: 'm3', x: 30, y: 2.8, z: 7.95, ry: -Math.PI / 2 },
    { id: 'm4', x: 47, y: 2.8, z: -7.95, ry: Math.PI / 2 },
    { id: 'm5', x: 60, y: 2.6, z: 3.55, ry: -Math.PI / 2 },
    { id: 'm6', x: 70, y: 2.6, z: -3.55, ry: Math.PI / 2 },
    { id: 'm7', x: 78, y: 2.6, z: 3.55, ry: -Math.PI / 2 },
    { id: 'm8', x: 88, y: 2.8, z: 7.95, ry: -Math.PI / 2 },
  ],
  figures,
  mechs: [{ id: 'shutter', kind: 'portcullis', x: 32, z: 0, w: 6, h: 4.6, ry: 0, opens: 'weights', blocks: [box(32, 0, 0.5, 6, 4.6, 0, 0, 'mech')] }],
  riddles: [{ id: 'market', x: 34.6, y: 3.0, z: 7.95, ry: Math.PI, puzzle: 'canal' }],
  zones: [
    { rect: { x0: 0, z0: -8, x1: 7, z1: 8 }, line: 'market.enter' },
    { rect: { x0: 57, z0: -3.6, x1: 60, z1: 3.6 }, flag: 'collapse' },
    { rect: { x0: 86.5, z0: -8, x1: 93, z1: 8 }, line: 'market.brazier' },
  ],
  // a pan balances with about four fifths of it in shadow: the flame held where the fire was (measured in the sim:
  // lower it and the pan is drowned in shadow; raise it and too little falls on it)
  plates: MERCHANTS.map((m, i) => ({ id: `scale${i + 1}`, rect: m.pan, casters: [{ fig: m.id }], min: BALANCE[i] - 0.09, max: BALANCE[i] + 0.09, hold: 0.8 })),
  gusts: [],
  sequences: [],
  derive: [{ flag: 'weights', all: ['scale1', 'scale2', 'scale3'] }],
  pages: [],
  maze: null,
  wrong: {
    mode: 'stalk',
    spawn: [29, 7.2],
    nodes: [[29, 7.2], [21, 7.4], [11, 7.4], [3, 7.4], [3, -7.2], [12, -7.4], [20, -7.4], [30, -7.2], [34, 6.5], [34, -6.5], [36, 0.5], [46.5, 6.5], [46.5, -6.5], [52, 6.5], [54, 0]],
    speed: 1.4,
    sprint: 3.2,
    until: 'collapse',
  },
  exit: { x0: 93.5, z0: -2.5, x1: 95, z1: 2.5 },
  decor: [
    { kind: 'banner', x: 8, y: 6.4, z: 7.95, ry: Math.PI, len: 3.4 },
    { kind: 'banner', x: 24, y: 6.4, z: -7.95, ry: 0, len: 3.4 },
    { kind: 'banner', x: 70, y: 4.6, z: 3.55, ry: Math.PI, len: 2.6 },
    { kind: 'rubble', x: 50, z: 6, n: 5, r: 1.2 },
    { kind: 'rubble', x: 30, z: -6.5, n: 4, r: 1 },
  ],
  lines: { bridge: 'market.bridge', flags: { scale1: 'market.balanced', scale2: 'market.balanced', scale3: 'market.balanced', collapse: 'market.collapse' } },
  rumble: 0.3,
  sky: 'night',
};

