// District 5: The Heart. Teaches nothing new; it tests everything.
//
// Five stone plates ring an empty spot that every shadow in the city reaches toward. Each plate wants one lesson:
//   the true angle (a soldier held at his), low and long (a post's shadow stretched across the floor to its plate),
//   the right order (three people held at their angles, oldest first and the child last), from above (a page),
//   and from within (the flame drawn back to the chest, his own shadow on the plate).
// Then the ring around the centre sinks, the Rumble peaks, and the Wrong Shadow comes for the flame.
// The centre is where the flame was first lit; the endings are played there (main.ts).

import { box, cyl, type Solid } from '../../sim/geom';
import type { District, FigureDef, Page, Plane, Plate } from '../sim/types';
import { FLOOR } from '../sim/types';

export const HEART = { x: 30, z: 0 };
const R_PLATE = 7.5;
const at = (deg: number, r: number): [number, number] => [HEART.x + Math.cos((deg * Math.PI) / 180) * r, HEART.z + Math.sin((deg * Math.PI) / 180) * r];
const sq = (x: number, z: number, h: number) => ({ x0: x - h, x1: x + h, z0: z - h, z1: z + h });
const [p1x, p1z] = at(90, R_PLATE);
const [p2x, p2z] = at(162, R_PLATE);
const [p3x, p3z] = at(234, R_PLATE);
const [p4x, p4z] = at(306, R_PLATE);
const [p5x, p5z] = at(18, R_PLATE);
export const PLATE_AT: [number, number][] = [[p1x, p1z], [p2x, p2z], [p3x, p3z], [p4x, p4z], [p5x, p5z]];
const [postX, postZ] = at(162, 12.2);
export const POST = cyl(postX, postZ, 0.28, 1.6, 0, 'post');

const plane = (p: [number, number, number], n: [number, number, number]): Plane => ({ p, n });

export const HEART_PAGE: Page = { id: 'p4', x: p4x + 0.2, z: p4z - 0.9, y: 1.05, ry: 0, word: 34, lie: 'The fire keeps the city safe.', truth: 'The fire keeps the city waiting.' };

const figures: FigureDef[] = [
  // plate one: the true angle
  { id: 'soldier', kind: 'guard', x: p1x + 1.6, z: p1z + 1.1, yaw: Math.PI, frozen: { lean: 0.1, aF: 1.5, eF: 0.2, aB: -0.3, lF: 0.4, kF: -0.3, lB: -0.3, kB: -0.3, head: -0.1 }, holds: 'spear', word: 27, lockFlag: 'p1', puzzle: 'plates', light: [p1x + 3.6, 2.6, p1z - 1.4], ink: FLOOR },
  // plate three: the right order
  { id: 'old', kind: 'elder', x: p3x - 1.6, z: p3z - 1.9, yaw: Math.PI / 4, frozen: { lean: 0.2, head: 0.2, aF: 0.6, eF: 0.5 }, holds: 'staff', word: 28, puzzle: 'plates', light: [p3x - 1.6 - 2.1, 2.45, p3z - 1.9 + 0.4], ink: FLOOR },
  { id: 'dancer', kind: 'woman', x: p3x + 1.9, z: p3z - 1.9, yaw: (3 * Math.PI) / 4, frozen: { lean: -0.1, head: -0.3, aF: 2.6, eF: 0.4, aB: 1.8, eB: 0.6, lF: 0.6, kF: -0.4, lB: -0.4, kB: -0.6 }, word: 29, puzzle: 'plates', light: [p3x + 1.9 + 2.0, 2.55, p3z - 1.9 + 0.3], ink: FLOOR },
  { id: 'twin', kind: 'child', h: 1.2, x: p3x - 1.9, z: p3z + 1.5, yaw: -Math.PI / 4, frozen: { lean: 0.1, head: -0.2, aF: 1.4, eF: 0.1 }, word: 30, puzzle: 'plates', light: [p3x - 1.9 + 0.3, 2.2, p3z + 1.5 + 2.0], ink: FLOOR },
  // the rest of the Heart's people, in its corners
  { id: 'mother', kind: 'woman', x: 17.5, z: -10.2, yaw: Math.PI / 4, frozen: { lean: 0.15, aF: 0.4, eF: 1.2, aB: 1.2, eB: 0.2, head: 0.25 }, word: 26, tol: 17, light: [19.2, 2.6, -8.0], ink: FLOOR },
  { id: 'carpenter', kind: 'man', x: HEART.x + 1.2, z: 16.4, yaw: -Math.PI / 2, frozen: { lean: 0.2, aF: 1.0, eF: 1.2, aB: 0.2, head: 0.3 }, word: 31, tol: 17, light: [HEART.x + 1.0, 2.0, 13.8], ink: plane([0, 0, 17.6], [0, 0, -1]) },
  { id: 'wife', kind: 'woman', x: 44.5, z: 8.0, yaw: Math.PI, frozen: { lean: 0.05, aF: 1.1, eF: 1.0, aB: 1.0, eB: 1.0, head: 0.1 }, word: 32, tol: 17, light: [42.2, 2.6, 6.4], ink: FLOOR },
  { id: 'friend', kind: 'man', x: 41.5, z: -11.0, yaw: (3 * Math.PI) / 4, frozen: { lean: 0.35, aF: 1.5, eF: 0.1, head: -0.3 }, word: 33, tol: 17, light: [39.8, 2.6, -9.0], ink: FLOOR },
];

// the round court's wall, in segments, with the stair the city's last hands built hidden behind its north side
const solids: Solid[] = [];
for (let k = 0; k < 20; k++) {
  const a = (k / 20) * Math.PI * 2;
  const r = 18.8;
  solids.push(box(HEART.x + Math.cos(a) * r, HEART.z + Math.sin(a) * r, 6.2, 1.2, 10, -a + Math.PI / 2, 0, 'wall'));
}
solids.push(cyl(HEART.x, HEART.z, 0.75, 0.95, 0, 'pedestal'));
solids.push(POST);
solids.push(box(HEART_PAGE.x, HEART_PAGE.z, 0.7, 0.55, 1.0, 0, 0, 'lectern'));
for (const [k, r] of [[0, 13], [1, 13], [2, 13], [3, 13], [4, 13]] as const) {
  // five columns between the plates, the oldest stones in the city
  const [x, z] = at(54 + k * 72, r);
  solids.push(cyl(x, z, 0.7, 10, 0, 'pillar'));
}

// the ring around the centre: low stones that sink into the floor once the five plates are lit
const ring: Solid[] = [];
for (let k = 0; k < 12; k++) {
  const a = (k / 12) * Math.PI * 2;
  ring.push(box(HEART.x + Math.cos(a) * 3.2, HEART.z + Math.sin(a) * 3.2, 1.75, 0.5, 1.1, -a + Math.PI / 2, 0, 'mech'));
}

const plates: Plate[] = [
  { id: 'p2', rect: sq(p2x, p2z, 0.5), casters: [POST], min: 0.25, max: 1, hold: 0.7 },
  { id: 'p5', rect: sq(p5x, p5z, 0.6), casters: ['self'], min: 0.3, max: 1, hold: 0.7, back: true },
];

const nodes: [number, number][] = [];
for (let k = 0; k < 10; k++) {
  const a = (k / 10) * Math.PI * 2 + 0.3;
  nodes.push([HEART.x + Math.cos(a) * 15, HEART.z + Math.sin(a) * 15]);
  nodes.push([HEART.x + Math.cos(a + 0.3) * 10.5, HEART.z + Math.sin(a + 0.3) * 10.5]);
}

export const HEART_D: District = {
  id: 'heart',
  index: 4,
  name: 'The Heart',
  sub: 'every lesson, once more',
  card: 'Every shadow in the city is looking at you.',
  area: { kind: 'disc', cx: HEART.x, cz: HEART.z, r: 18 },
  regions: [],
  solids,
  pits: [],
  start: { x: HEART.x, z: -15.5, yaw: Math.PI / 2 },
  braziers: [{ id: 'gate', x: HEART.x + 4.5, z: -14.6 }],
  torches: [
    { id: 'h1', x: HEART.x - 9, y: 3, z: -15.2, ry: (Math.PI * 3) / 10 },
    { id: 'h2', x: HEART.x + 15.4, y: 3, z: 5, ry: Math.PI + 0.3 },
    { id: 'h3', x: HEART.x - 15.4, y: 3, z: 5, ry: -0.3 },
    { id: 'h4', x: HEART.x + 8, y: 3, z: 16, ry: -Math.PI / 2 - 0.4 },
  ],
  figures,
  mechs: [{ id: 'ring', kind: 'ring', x: HEART.x, z: HEART.z, w: 6.4, h: 1.1, ry: 0, opens: 'plates', blocks: ring }],
  riddles: [
    { id: 'heart', x: HEART.x, y: 0.62, z: HEART.z - 0.78, ry: Math.PI, puzzle: 'plates' },
    { id: 'order', text: 'The old first. Then the one who danced. The child last.', x: p3x + 0.2, y: 1.2, z: p3z - 3.2, ry: 0, puzzle: 'plates' },
  ],
  zones: [
    { rect: { x0: HEART.x - 8, z0: -18, x1: HEART.x + 8, z1: -12 }, line: 'heart.enter' },
    { rect: { x0: HEART.x - 9, z0: -9, x1: HEART.x + 9, z1: 9 }, line: 'wrong.knows', needs: 'plates' },
    { rect: { x0: HEART.x - 1.3, z0: HEART.z - 1.3, x1: HEART.x + 1.3, z1: HEART.z + 1.3 }, flag: 'heart', needs: 'plates' },
  ],
  plates,
  gusts: [],
  sequences: [{ ids: ['old', 'dancer', 'twin'], flag: 'p3', on: 'lock', puzzle: 'plates' }],
  derive: [{ flag: 'plates', all: ['p1', 'p2', 'p3', 'p4', 'p5'] }],
  pages: [HEART_PAGE],
  maze: null,
  wrong: { mode: 'final', spawn: [HEART.x, 15], nodes, speed: 3.0, sprint: 5.2, after: 'plates' },
  exit: { x0: 999, z0: 999, x1: 1000, z1: 1000 },
  decor: [
    { kind: 'dial', x: HEART.x, z: HEART.z, r: 9.5 },
    ...PLATE_AT.map(([x, z], i) => ({ kind: 'plate' as const, x, z, s: 1.3, flag: `p${i + 1}` })),
    { kind: 'rubble', x: HEART.x - 12, z: 8, n: 6, r: 1.5 },
    { kind: 'rubble', x: HEART.x + 12, z: -8, n: 6, r: 1.5 },
    { kind: 'carving', x: HEART.x, y: 4.2, z: 17.55, ry: Math.PI, scene: 'door' },
    { kind: 'carving', x: HEART.x - 11.97, y: 4.2, z: 12.92, ry: 2.394, scene: 'wave' },
    { kind: 'carving', x: HEART.x + 11.97, y: 4.2, z: 12.92, ry: -2.394, scene: 'fire' },
  ],
  lines: { flags: { p1: 'heart.plate', p2: 'heart.plate', p3: 'heart.plate', p4: 'heart.plate', p5: 'heart.fifth', plates: 'heart.rumble' } },
  rumble: 1,
  rain: true,
  intro: [
    { at: [HEART.x, 0, HEART.z], yaw: Math.PI, height: 12, dist: 14, lookY: 0, fov: 50, dur: 3.6 },
    { at: [HEART.x, 0, HEART.z], yaw: Math.PI + 1.2, height: 5, dist: 9, lookY: 1, fov: 46, dur: 3.2 },
  ],
  debris: [{ after: 'plates', rect: { x0: HEART.x - 18, z0: -18, x1: HEART.x + 18, z1: 18 }, period: 3.2 }],
  sky: 'night',
};
