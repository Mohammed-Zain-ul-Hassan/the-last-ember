// District 3: The Temple of Hours. Teaches: the order of replays matters; Ash is scarce.
//
//   x  0..12   the porch: a brazier
//   x 12..40   the hall of hours: four priests froze in a ring at different moments. Wake them in the order of their
//              last gestures (idle, fleeing, praying, looking up): "one hour wasted, one feared, one begged for, one
//              never seen". Four of the five Ash. A wrong one and the hours fall out of order: start again.
//   x 40..62   the sundial court: the roof is broken and a shaft of real light lies across the floor. Throw the
//              gnomon's shadow along it and the false brazier shows itself (it burns a slightly cold blue).
//   x 62..84   the pillar hall: the Wrong Shadow hunts among the pillars while gusts try the flame

import { box, cyl, type Solid } from '../../sim/geom';
import type { Clip, Pose } from '../../sim/pose';
import type { District, FigureDef, Plane } from '../sim/types';
import { FLOOR } from '../sim/types';

const wall = (x0: number, x1: number, z: number, thick: number, h: number, tag = 'wall'): Solid => box((x0 + x1) / 2, z, x1 - x0, thick, h, 0, 0, tag);
const wallZ = (x: number, z0: number, z1: number, thick: number, h: number, tag = 'wall'): Solid => box(x, (z0 + z1) / 2, thick, z1 - z0, h, 0, 0, tag);
const plane = (p: [number, number, number], n: [number, number, number]): Plane => ({ p, n });
const NORTH = plane([0, 0, 9], [0, 0, -1]);

const C = { x: 26, z: 0 }; // the ring of priests
const SIT: Partial<Pose> = { y: -0.5, lF: 1.5, kF: -1.2, lB: 1.4, kB: -1.0, lean: 0.12, aF: 0.4, eF: 0.9, aB: 0.3, eB: 0.9, head: 0.15 };
const FLEE: Partial<Pose> = { lean: 0.42, lF: 0.9, kF: -0.4, lB: -0.7, kB: -1.1, aF: -0.8, eF: 0.9, aB: 0.9, eB: 0.9, head: -0.2 };
const PRAY: Partial<Pose> = { y: -0.42, lF: 1.45, kF: -1.45, lB: 0.05, kB: -1.5, lean: 0.12, aF: 1.6, eF: 1.9, aB: 1.5, eB: 1.9, head: 0.35 };
const UP: Partial<Pose> = { lean: -0.22, head: -0.75, aF: 0.3, eF: 0.2, aB: 0.2 };

/** A short replay: the moment before, the gesture they froze in. */
const clip = (before: Partial<Pose>, after: Partial<Pose>, beat: Partial<Pose>): Clip => ({
  len: 7,
  keys: [
    { t: 0, pose: after },
    { t: 1.2, pose: before },
    { t: 3.2, pose: beat },
    { t: 5.2, pose: after },
    { t: 7, pose: after },
  ],
});

const PRIESTS: FigureDef[] = [
  {
    id: 'idle', kind: 'elder', x: C.x, z: C.z + 4.2, yaw: -Math.PI / 2, frozen: SIT, word: 12, puzzle: 'priests',
    light: [C.x + 0.4, 1.55, C.z + 2.1], ink: FLOOR, clip: clip(SIT, SIT, { ...SIT, head: -0.3, aF: 0.9, eF: 0.3 }),
  },
  {
    id: 'flee', kind: 'elder', x: C.x + 4.2, z: C.z, yaw: 0, frozen: FLEE, word: 13, puzzle: 'priests',
    light: [C.x + 2.1, 2.45, C.z + 0.5], ink: FLOOR, clip: clip({ lean: 0, head: 0.2 }, FLEE, { lean: 0.2, head: -0.4, aF: 1.4, aB: 1.2 }),
  },
  {
    id: 'pray', kind: 'elder', x: C.x, z: C.z - 4.2, yaw: Math.PI / 2, frozen: PRAY, word: 14, puzzle: 'priests',
    light: [C.x - 0.5, 1.3, C.z - 2.0], ink: FLOOR, clip: clip({ ...PRAY, aF: 0.4, aB: 0.3, head: 0 }, PRAY, { ...PRAY, head: -0.4, aF: 2.6, aB: 2.5, eF: 0.3, eB: 0.3 }),
  },
  {
    id: 'up', kind: 'elder', x: C.x - 4.2, z: C.z, yaw: 0, frozen: UP, word: 15, puzzle: 'priests',
    light: [C.x - 2.0, 2.9, C.z - 0.4], ink: FLOOR, clip: clip({ head: 0.2 }, UP, { ...UP, aF: 2.4, eF: 0.2, head: -0.9 }),
  },
];

const figures: FigureDef[] = [
  ...PRIESTS,
  { id: 'ringer', kind: 'man', x: 14.2, z: 7.6, yaw: -Math.PI / 2, frozen: { aF: 2.6, eF: 0.4, aB: 2.4, eB: 0.4, lean: -0.1, head: -0.4 }, word: 16, tol: 16, light: [15.2, 1.6, 5.4], ink: NORTH },
  { id: 'acolyte', kind: 'child', h: 1.45, x: 13.4, z: -2.9, yaw: Math.PI, frozen: { lean: -0.05, head: -0.1, aF: 0.5, eF: 1.0 }, word: 17, tol: 16, light: [15.0, 1.7, -1.6], ink: plane([12.5, 0, 0], [1, 0, 0]) },
  { id: 'high', kind: 'king', x: 45, z: 7.2, yaw: -Math.PI / 2, frozen: { aF: 1.8, eF: 0.2, aB: 1.7, eB: 0.2, lean: -0.05, head: -0.3 }, word: 18, tol: 16, light: [45.6, 2.3, 4.8], ink: NORTH },
];

// the pillar hall: a grid of columns, the Wrong Shadow's nodes in their lee
const pillars: Solid[] = [];
const nodes: [number, number][] = [];
for (let x = 65; x <= 81; x += 4)
  [-6, -2, 2, 6].forEach((z, j) => {
    const px = x + (j % 2 ? 2 : 0);
    pillars.push(cyl(px, z, 0.55, 8, 0, 'pillar'));
    nodes.push([px + 1.1, z + (z > 0 ? 1.0 : -1.0)]);
  });

export const GNOMON = cyl(51, 0, 0.3, 1.7, 0, 'gnomon');

const solids: Solid[] = [
  wallZ(-0.5, -10, 10, 1, 9),
  wall(0, 84, 9.5, 1, 9),
  wall(0, 84, -9.5, 1, 9),
  // the porch's door into the hall
  wallZ(12, 2, 10, 1, 9),
  wallZ(12, -10, -2, 1, 9),
  // the hall's columns (and the vault wall with its door)
  cyl(17, 6, 0.6, 9, 0, 'pillar'),
  cyl(17, -6, 0.6, 9, 0, 'pillar'),
  cyl(35, 6, 0.6, 9, 0, 'pillar'),
  cyl(35, -6, 0.6, 9, 0, 'pillar'),
  wallZ(40, 2, 10, 1.2, 9),
  wallZ(40, -10, -2, 1.2, 9),
  // the court: the gnomon on its dial
  GNOMON,
  box(45, 8.4, 2.4, 1.0, 1.0, 0, 0, 'altar'),
  wallZ(62, 2.5, 10, 1, 9),
  wallZ(62, -10, -2.5, 1, 9),
  ...pillars,
  wallZ(84.5, -10, -2, 1, 9),
  wallZ(84.5, 2, 10, 1, 9),
];

export const TEMPLE: District = {
  id: 'temple',
  index: 2,
  name: 'The Temple of Hours',
  sub: 'the order of things · the price of time',
  card: 'They prayed for more time. They were given exactly this.',
  area: { kind: 'band', x0: 0, x1: 87, z0: -9, z1: 9 },
  regions: [],
  solids,
  pits: [],
  start: { x: 2.5, z: 0, yaw: 0 },
  braziers: [
    { id: 'porch', x: 6, z: -7.4 },
    { id: 'false', x: 59, z: -7.2, false: true },
    { id: 'court', x: 59, z: 7.2 },
  ],
  torches: [
    { id: 'p1', x: 4, y: 2.8, z: 8.95, ry: -Math.PI / 2 },
    { id: 'p2', x: 20, y: 3, z: -8.95, ry: Math.PI / 2 },
    { id: 'p3', x: 32, y: 3, z: 8.95, ry: -Math.PI / 2 },
    { id: 'p4', x: 67, y: 3, z: 8.95, ry: -Math.PI / 2 },
    { id: 'p5', x: 75, y: 3, z: -8.95, ry: Math.PI / 2 },
    { id: 'p6', x: 82, y: 3, z: 8.95, ry: -Math.PI / 2 },
  ],
  figures,
  mechs: [{ id: 'vault', kind: 'gate', x: 40, z: 0, w: 4, h: 5, ry: 0, opens: 'vault', blocks: [box(40, 0, 0.5, 4, 5, 0, 0, 'mech')] }],
  riddles: [{ id: 'temple', x: 39.35, y: 5.8, z: 0, ry: -Math.PI / 2, puzzle: 'priests' }],
  zones: [
    { rect: { x0: 0, z0: -9, x1: 6, z1: 9 }, line: 'temple.enter' },
    { rect: { x0: 56.5, z0: -9, x1: 61.5, z1: -4.5 }, line: 'temple.nearFalse' },
    { rect: { x0: 63, z0: -9, x1: 66, z1: 9 }, flag: 'hunt' },
  ],
  plates: [{ id: 'dial', rect: { x0: 52.3, x1: 56.3, z0: -0.35, z1: 0.35 }, casters: [GNOMON], min: 0.6, max: 1, hold: 0.7 }],
  gusts: [{ rect: { x0: 62, z0: -9, x1: 85, z1: 9 }, period: 6.5, dir: Math.PI / 2, after: 'hunt' }],
  sequences: [{ ids: ['idle', 'flee', 'pray', 'up'], flag: 'vault', on: 'wake', puzzle: 'priests' }],
  derive: [],
  pages: [],
  maze: null,
  wrong: { mode: 'hunt', spawn: [80, -7.5], nodes, speed: 2.0, sprint: 4.6, after: 'hunt' },
  exit: { x0: 85, z0: -2, x1: 87, z1: 2 },
  decor: [
    { kind: 'shaft', x0: 52.3, x1: 56.3, z0: -0.35, z1: 0.35 },
    { kind: 'dial', x: 51, z: 0, r: 6 },
    { kind: 'arch', x: 12, z0: -2, z1: 2, y: 4.6, thick: 1.2 },
    { kind: 'arch', x: 62, z0: -2.5, z1: 2.5, y: 5, thick: 1.2 },
    { kind: 'banner', x: 26, y: 8, z: 8.95, ry: Math.PI, len: 4.4 },
    { kind: 'banner', x: 26, y: 8, z: -8.95, ry: 0, len: 4.4 },
    { kind: 'rubble', x: 48, z: -6, n: 6, r: 1.5 },
    { kind: 'rubble', x: 55, z: 5.5, n: 5, r: 1.2 },
    { kind: 'roof', x0: 0, x1: 40, z0: -9.5, z1: 9.5, y: 9 },
    { kind: 'roof', x0: 62, x1: 85, z0: -9.5, z1: 9.5, y: 9 },
  ],
  lines: { firstWake: 'temple.priest', caught: 'wrong.notYet', flags: { vault: 'temple.vault' } },
  rumble: 0.45,
  sky: 'interior',
};
