// District 4: The Library of Whispers. Teaches: angle changes meaning, not just shape.
//
//   x  0..10   the entrance: a brazier
//   x 10..40   the reading hall: seven pages carved in relief on lecterns. From the side the relief reads as a
//              comfortable lie; from directly above, as the truth. Each read from above shows who last read it
//              (a Last Word). All seven tell which way the Wrong Shadow comes from. The door opens when all are read.
//   x 40..62   the shelf maze: low shelves whose shadows are walls; the way through exists only with the flame high
//   x 62..84   the stacks: tall shelves climbed by ladders; the Wrong Shadow, wearing his face, close behind

import { box, cyl, type Solid } from '../../sim/geom';
import type { District, FigureDef, Page, Plane } from '../sim/types';

const wall = (x0: number, x1: number, z: number, thick: number, h: number, tag = 'wall'): Solid => box((x0 + x1) / 2, z, x1 - x0, thick, h, 0, 0, tag);
const wallZ = (x: number, z0: number, z1: number, thick: number, h: number, tag = 'wall'): Solid => box(x, (z0 + z1) / 2, thick, z1 - z0, h, 0, 0, tag);
const plane = (p: [number, number, number], n: [number, number, number]): Plane => ({ p, n });
const NORTH = plane([0, 0, 8], [0, 0, -1]);
const SOUTH = plane([0, 0, -8], [0, 0, 1]);

const P: [number, number][] = [[14, -3.6], [18.5, 3.6], [23, -3.6], [27.5, 3.6], [32, -3.6], [36, 3.6], [37.5, -1.5]];
const TEXT: [string, string][] = [
  ['The fire was a gift from the gods.', 'The fire was lit by a hand like yours.'],
  ['The city sleeps, and will wake rested.', 'The city did not sleep. It was held.'],
  ['Nothing walks the streets at night.', 'One thing walks. It walks behind you.'],
  ['The water will never rise this far.', 'The water was one second from the door.'],
  ['Every shadow here keeps to its owner.', 'One shadow keeps to no one. It keeps to you.'],
  ['Look ahead, and you will be safe.', 'It comes from behind. It always has.'],
  ['The one who lit it is long gone.', 'The one who lit it never left.'],
];
const READERS: { kind: FigureDef['kind']; h?: number }[] = [{ kind: 'man' }, { kind: 'elder' }, { kind: 'man' }, { kind: 'woman' }, { kind: 'elder' }, { kind: 'man' }, { kind: 'child', h: 1.2 }];

export const PAGES: Page[] = P.map(([x, z], i) => ({ id: `page${i + 1}`, x, z, y: 1.05, ry: 0, word: 19 + i, lie: TEXT[i][0], truth: TEXT[i][1] }));

/** Whoever read each page last, frozen beside it: they appear when the page is read from above. */
const readers: FigureDef[] = PAGES.map((p, i) => ({
  id: `reader${i + 1}`, kind: READERS[i].kind, h: READERS[i].h, x: p.x + 1.1, z: p.z + (p.z > 0 ? 0.9 : -0.9), yaw: Math.PI, frozen: { lean: 0.3, head: 0.5, aF: 0.9, eF: 0.8, aB: 0.6, eB: 0.6 }, word: p.word,
  light: [p.x + 0.6, 2.4, p.z], ink: p.z > 0 ? NORTH : SOUTH, hiddenUntil: p.id,
}));

// the maze: rows of low shelves, each row with one gap, the gaps never in line
const shelves: Solid[] = [];
const ROWS: [number, number][] = [[44, 0], [48, 4], [52, -4], [56, 1.5], [60, -1]]; // x, gap centre
for (const [x, gap] of ROWS) {
  let z = -8;
  for (const [a, b] of [[-8, gap - 1.1], [gap + 1.1, 8]]) {
    for (z = a; z < b - 0.2; ) {
      const len = Math.min(3.2, b - z);
      shelves.push(box(x, z + len / 2, 0.6, len - 0.15, 1.15, 0, 0, 'shelf'));
      z += len;
    }
  }
}

// the stacks: two great shelves across the hall, each climbed by a ladder of steps and down the far side
const stacks: Solid[] = [];
const ladder = (x: number, z: number, dir: 1 | -1, top: number): void => {
  for (let k = 0; k < 6; k++) stacks.push(box(x + dir * (k * 0.55 + 0.3), z, 0.55, 1.4, top * ((6 - k) / 6), 0, 0, 'step'));
};
for (const [x, z] of [[70, -6.4], [78, 6.4]] as const) {
  // the shelf wall across the room, with a walk along its top the ladders reach
  stacks.push(box(x, z > 0 ? -1.6 : 1.6, 1.4, 12.8, 3.4, 0, 0, 'tallshelf'));
  stacks.push(box(x, z, 1.4, 3.2, 2.4, 0, 0, 'gallery'));
  ladder(x - 0.7, z, -1, 2.4);
  ladder(x + 0.7, z, 1, 2.4);
}

const solids: Solid[] = [
  wallZ(-0.5, -9, 9, 1, 9),
  wall(0, 86, 8.5, 1, 9, 'bookwall'),
  wall(0, 86, -8.5, 1, 9, 'bookwall'),
  wallZ(10, 2, 9, 1, 9),
  wallZ(10, -9, -2, 1, 9),
  ...PAGES.map((p) => box(p.x, p.z, 0.7, 0.55, p.y - 0.05, 0, 0, 'lectern')),
  wallZ(40, 2, 9, 1.2, 9),
  wallZ(40, -9, -2, 1.2, 9),
  ...shelves,
  wallZ(62, 2.2, 9, 1, 9),
  wallZ(62, -9, -2.2, 1, 9),
  ...stacks,
  cyl(66, 5.5, 0.5, 9, 0, 'pillar'),
  cyl(74, -5.5, 0.5, 9, 0, 'pillar'),
  wallZ(86.5, -9, -2, 1, 9),
  wallZ(86.5, 2, 9, 1, 9),
];

const words: FigureDef[] = [
  ...readers,
];

export const LIBRARY: District = {
  id: 'library',
  index: 3,
  name: 'The Library of Whispers',
  sub: 'the same words read from another angle',
  card: 'They wrote it down so no one would forget.',
  area: { kind: 'band', x0: 0, x1: 89, z0: -8, z1: 8 },
  regions: [],
  solids,
  pits: [],
  start: { x: 6.5, z: 0, yaw: 0 },
  braziers: [
    { id: 'door', x: 6, z: -6.6 },
    { id: 'stacks', x: 64.5, z: 6.4 },
    { id: 'lit', x: 64.5, z: -6.4, false: true }, // the Wrong Shadow lit this one
  ],
  torches: [
    { id: 'l1', x: 5, y: 2.8, z: 7.95, ry: -Math.PI / 2 },
    { id: 'l2', x: 21, y: 3, z: -7.95, ry: Math.PI / 2 },
    { id: 'l3', x: 33, y: 3, z: 7.95, ry: -Math.PI / 2 },
    { id: 'l4', x: 50, y: 3.2, z: -7.95, ry: Math.PI / 2 },
    { id: 'l5', x: 67, y: 3.2, z: -7.95, ry: Math.PI / 2 },
    { id: 'l6', x: 82, y: 3.2, z: 7.95, ry: -Math.PI / 2 },
  ],
  figures: words,
  mechs: [
    { id: 'door', kind: 'gate', x: 40, z: 0, w: 4, h: 5, ry: 0, opens: 'pages', blocks: [box(40, 0, 0.5, 4, 5, 0, 0, 'mech')] },
    // the maze's way out: a door of shadow in the far wall that is only there while the flame is held high
    { id: 'shadow', kind: 'shadowdoor', x: 62, z: 0, w: 4.4, h: 4.2, ry: 0, opens: 'never', highIn: { x0: 58.5, z0: -4, x1: 63, z1: 4 }, minY: 2.5, blocks: [box(62, 0, 0.6, 4.4, 4.2, 0, 0, 'mech')] },
  ],
  riddles: [{ id: 'library', x: 39.35, y: 5.8, z: 0, ry: -Math.PI / 2, puzzle: 'pages' }],
  zones: [
    { rect: { x0: 0, z0: -8, x1: 6, z1: 8 }, line: 'library.enter' },
    { rect: { x0: 63, z0: -8, x1: 66, z1: 8 }, flag: 'chase' },
  ],
  plates: [],
  gusts: [],
  sequences: [],
  derive: [{ flag: 'pages', all: PAGES.map((p) => p.id) }],
  pages: PAGES,
  maze: { rect: { x0: 41, z0: -8, x1: 61.5, z1: 8 }, casters: shelves },
  wrong: {
    mode: 'face',
    spawn: [84, -6],
    nodes: [[64, -7], [64, 7], [67.5, -2], [67.5, 3], [73, 1], [73, -3], [75.5, 3], [81, -1], [81, 3], [84, 6], [84, -6]],
    speed: 2.4,
    sprint: 5,
    after: 'chase',
  },
  exit: { x0: 87, z0: -2, x1: 89, z1: 2 },
  decor: [
    { kind: 'roof', x0: 0, x1: 87, z0: -8.5, z1: 8.5, y: 9 },
    { kind: 'arch', x: 10, z0: -2, z1: 2, y: 4.6, thick: 1.2 },
    { kind: 'arch', x: 62, z0: -2.2, z1: 2.2, y: 4.6, thick: 1.2 },
    { kind: 'rubble', x: 58, z: 6.5, n: 4, r: 1 },
  ],
  lines: { wrongSeen: 'library.face', wrongLit: 'wrong.kinder', caught: 'wrong.face' },
  rumble: 0.65,
  intro: [
    { at: [25, 0, 0], yaw: -1.9, height: 5, dist: 10, lookY: 1, fov: 52, dur: 3.4 },
    { at: [52, 0, 0], yaw: -1.57, height: 7, dist: 9, lookY: 0, fov: 54, dur: 3.2 },
    { at: [75, 0, 0], yaw: -1.3, height: 4, dist: 9, lookY: 2, fov: 50, dur: 3 },
  ],
  drips: [[62, 0], [64.5, 3]],
  sky: 'interior',
};
