// Level geometry as plain data. One level can host several hours. Space is 3D: x/z ground plane, y up.
//   solids     boxes and cylinders: you collide with them, stand on them, and they cast the light's shadows
//              (the spawn pockets). Their `tag` tells the renderer how to dress them.
//   area       the walkable ground: a disc (the hearth grounds) or a band (the road east, x is "forward")
//   shrines    ember shrines (hearth grounds only)
//   checkpoints  braziers the torch lights; you rise again at the last one lit (x along the road)
//   end        road levels: the hour ends when the knight reaches it (and the boss, if any, has fallen)
// Every obstacle on the road's centre line is <= 1.6 m (the jump clears 2.4 m); taller pieces are reached by steps.
import { box, cyl, type Area, type Solid } from '../sim/geom';
import { Rng } from '../sim/rng';

export type RegionKind = 'grounds' | 'street' | 'market' | 'nave' | 'apse' | 'rampart' | 'gatehouse';

export interface Region {
  x0: number;
  x1: number;
  kind: RegionKind;
  name?: string; // shown with a reveal shot the first time he enters it
  sub?: string;
}

export interface Level {
  id: string;
  name: string;
  bounds: [number, number]; // x extent
  area: Area;
  solids: Solid[];
  start: number;
  startZ: number;
  startYaw: number; // radians; forward is (cos yaw, sin yaw) on x/z
  hearthX?: number;
  hearthZ?: number;
  shelter?: { rect: [number, number, number, number]; y: number }; // a dry patch under a roof: x0, z0, x1, z1
  end?: number;
  bossAt?: number; // the boss rises when the knight passes this x
  shrines: { x: number; y: number; z: number }[];
  checkpoints: number[];
  regions: Region[];
}

const D = Math.PI / 180;
const polar = (deg: number, r: number): [number, number] => [Math.cos(deg * D) * r, Math.sin(deg * D) * r];

/** The hut over the hearth: roof footprint w x d, eaves at `eave`, ridge at `ridge`. */
export const HUT = { w: 5.8, d: 5.0, eave: 3.7, ridge: 5.9 };
const HUT_POSTS: [number, number][] = [[-2.55, -2.15], [2.55, -2.15], [-2.55, 2.15], [2.55, 2.15]];

/** A wall lying along the ring at angle deg (its long side follows the circle). */
function ringWall(deg: number, r: number, len: number, h: number, thick: number, tag = 'masonry'): Solid {
  const [x, z] = polar(deg, r);
  return box(x, z, len, thick, h, -deg * D - Math.PI / 2, 0, tag);
}

/**
 * The hearth grounds: a round ruined plaza, 29 m across the radius, the hearth at its heart. Rings outward:
 * the great broken arch, low broken walls (short shadows), a ring of columns (some taller than the flame, whose
 * shadows never end), kneeling statues, two raised walks with ember shrines, and the broken outer wall.
 */
function groundsSolids(): Solid[] {
  const out: Solid[] = [];
  const hearth = box(0, 0, 2.4, 2.0, 1.15, 0, 0, 'hearth');
  hearth.noShadow = true;
  out.push(hearth);
  // the hearth's hut: four posts and a pitched roof keep the rain off the last fire
  for (const [x, z] of HUT_POSTS) out.push(cyl(x, z, 0.2, HUT.eave, 0, 'hut'));
  out.push(box(0, 0, HUT.w, HUT.d, 0.6, 0, HUT.eave, 'roof'));
  // the great arch behind the hearth: two piers, the right one broken lower
  out.push(box(-3.6, -3.2, 1.15, 1.15, 6.4, 0, 0, 'pier'), box(3.6, -3.2, 1.15, 1.15, 4.5, 0, 0, 'pier'));
  // inner ring: low broken walls
  const inner: [number, number, number][] = [[15, 3.2, 1.3], [62, 2.6, 1.1], [118, 3.0, 1.5], [163, 2.8, 1.2], [208, 3.4, 1.4], [334, 2.7, 1.0]];
  for (const [a, len, h] of inner) out.push(ringWall(a, 8, len, h, 0.8));
  // the colonnade ring: tall columns alternate with broken stumps
  for (let i = 0; i < 12; i++) {
    const a = 15 + i * 30 + ((i * 37) % 9) - 4;
    const [x, z] = polar(a, 13 + ((i * 53) % 5) * 0.3);
    const tall = i % 2 === 0;
    out.push(cyl(x, z, 0.45, tall ? 5.4 + ((i * 29) % 11) * 0.1 : 1.4 + ((i * 17) % 10) * 0.1, 0, 'column'));
  }
  // stone knights of his fallen order
  for (const a of [40, 140, 222, 318]) {
    const [x, z] = polar(a, 18.5);
    out.push(cyl(x, z, 0.85, 2.9, 0, 'statue'));
  }
  // two raised walks (the broken colonnade walk west, the old balcony east), each with a step up and piers below
  for (const [sx, top] of [[-1, 2.7], [1, 2.8]] as const) {
    out.push(box(sx * 21, 0, 2.6, 10, 0.36, 0, top - 0.36, 'walk'));
    out.push(cyl(sx * 21, -4.3, 0.35, top - 0.36, 0, 'pier'), cyl(sx * 21, 4.3, 0.35, top - 0.36, 0, 'pier'));
    out.push(box(sx * 18.95, sx * -3, 1.4, 1.4, 1.3, 0, 0, 'step'));
  }
  // the broken outer wall, with gaps
  for (let i = 0; i < 14; i++) {
    const a = i * (360 / 14) + 6;
    out.push(ringWall(a, 27.5, 5.2 + ((i * 31) % 15) * 0.1, 2.2 + ((i * 43) % 20) * 0.1, 1.2));
  }
  return out;
}

// ------------------------------------------------------------------ the road east

/** A row of houses along one side of the road, broken by alleys. side -1 is -z, 1 is +z; `front` is the street's half-width. */
function houses(out: Solid[], rng: Rng, x0: number, x1: number, side: -1 | 1, front: number, hMin = 5, hMax = 8.5): void {
  for (let x = x0; x < x1 - 3; ) {
    const w = Math.min(rng.range(5, 8.5), x1 - x);
    const d = rng.range(3.8, 5);
    out.push(box(x + w / 2, side * (front + d / 2), w, d, rng.range(hMin, hMax), 0, 0, 'house'));
    x += w + rng.range(1.3, 2.6); // an alley: a deep pocket of shadow
  }
}

/** A raised walk: a slab at height `top`, open underneath, with a crate to climb on at its near end. */
function walk(out: Solid[], x0: number, x1: number, z: number, d: number, top: number, tag = 'timber'): void {
  out.push(box((x0 + x1) / 2, z, x1 - x0, d, 0.3, 0, top - 0.3, tag));
  out.push(box(x0 - 0.2, z + Math.sign(z) * -(d / 2 + 0.75), 1.2, 1.2, 1.3, 0, 0, 'crate'));
}

/**
 * The Lower City: Weavers' Row, a ten-metre street between rows of dead houses (their alleys are pockets of dark),
 * opening into the Ash Market square, then the narrower Gate Road to the city gate.
 */
function lowerCitySolids(): Solid[] {
  const out: Solid[] = [];
  const rng = new Rng(101);
  for (const side of [-1, 1] as const) {
    houses(out, rng, -14, 47, side, 5);
    houses(out, rng, 47, 67, side, 10.2, 6, 9); // the market's houses stand back around the square
    houses(out, rng, 67, 114, side, 4.6);
  }
  // low broken walls and barricades in the street: jump them or go round
  const rubble: [number, number, number][] = [[6, 1.3, 1.2], [14, 1.1, 1.5], [22, 1.6, 1.0], [31, 1.2, 1.4], [39, 1.4, 1.6], [71, 1.4, 1.4], [80, 1.2, 1.0], [88, 1.6, 1.5], [97, 1.2, 1.3]];
  rubble.forEach(([x, w, h], i) => out.push(box(x, [-2.4, 2.4, 0][i % 3], w, 2.6, h, 0, 0, 'masonry')));
  // timber walks along the house fronts (roofs with no house under them), climbed from a crate
  walk(out, 10, 20, -3.8, 2.4, 2.9);
  walk(out, 35, 45, 3.8, 2.4, 3.1);
  walk(out, 76, 86, -3.3, 2.2, 3.0);
  walk(out, 92, 100, 3.3, 2.2, 2.8, 'stone');
  // street lamps, long dark
  for (let x = -4, i = 0; x < 104; x += 13, i++) if (x < 47 || x > 67) out.push(cyl(x, i % 2 ? 4.3 : -4.3, 0.12, 3.6, 0, 'lamp'));
  // the Ash Market: stalls around a dry fountain
  for (const [x, z] of [[50.5, -6], [55, -6.4], [60, -5.8], [64, -6.2], [51.5, 6.1], [57, 6.4], [62.5, 5.9]] as const) out.push(box(x, z, 2.6, 1.4, 1.1, 0, 0, 'stall'));
  out.push(cyl(57, 0, 1.9, 0.65, 0, 'fountain'));
  for (const [x, z] of [[18, 2.8], [26, -3.2], [53, 3.2], [74, 2.6], [95, -2.5]] as const) out.push(box(x, z, 1, 1, 1, 0.4, 0, 'crate'));
  // the city gate: two piers across the Gate Road
  for (const side of [-1, 1]) out.push(box(106, side * 3.9, 1.2, 1.2, 6, 0, 0, 'gatepier'));
  return out;
}

/**
 * The Cathedral of the Hearth: a nave between two rows of great pillars, pews either side of the central aisle,
 * galleries in the side aisles reached by stairs, then up the altar step into the apse, where the Hollow Marshal
 * waits before the doors under the rose window.
 */
function cathedralSolids(): Solid[] {
  const out: Solid[] = [];
  const L = 120;
  for (const side of [-1, 1]) out.push(box(47, side * 9.6, L, 1.2, 16, 0, 0, 'navewall'));
  out.push(box(-12.6, 0, 1.2, 20.4, 16, 0, 0, 'navewall'));
  for (let x = -9; x <= 63; x += 6) for (const side of [-1, 1]) out.push(cyl(x, side * 4.6, 0.62, 12, 0, 'pillar'));
  for (let x = 72; x <= 96; x += 6) for (const side of [-1, 1]) out.push(cyl(x, side * 6.4, 0.62, 12.5, 0, 'pillar'));
  // pews: low, many, every one throws a pocket of shadow; the centre aisle stays clear
  for (let x = 4; x <= 58; x += 2.4) {
    if (x > 27 && x < 37) continue; // the crossing
    for (const side of [-1, 1]) out.push(box(x, side * 2.4, 0.55, 3.1, 0.9, 0, 0, 'pew'));
  }
  // galleries over the side aisles, each with a stair
  out.push(box(36, -6.9, 9.2, 3.6, 0.36, 0, 3.04, 'gallery'), box(29.6, -6.9, 1.2, 3.0, 1.2, 0, 0, 'step'), box(30.8, -6.9, 1.2, 3.0, 2.3, 0, 0, 'step'));
  out.push(box(67, 6.9, 8.2, 3.6, 0.36, 0, 3.04, 'gallery'), box(60.6, 6.9, 1.2, 3.0, 1.2, 0, 0, 'step'), box(61.8, 6.9, 1.2, 3.0, 2.3, 0, 0, 'step'));
  // the altar step, the raised apse, the altar
  out.push(box(68, 0, 2, 18, 0.3, 0, 0, 'step'), box(84.5, 0, 31, 18, 0.35, 0, 0, 'dais'));
  out.push(box(91, 0, 1.6, 3.4, 1.0, 0, 0.35, 'altar'));
  // the doors' wall: the gate between its two halves is shut until the Marshal falls
  for (const side of [-1, 1]) out.push(box(100.5, side * 5.6, 1.2, 7.2, 16, 0, 0, 'doorwall'));
  return out;
}

/**
 * The City Wall: the wall walk, narrow, the drop on one side and the sleeping city on the other, broken merlons
 * fallen across it; then the stair up the gatehouse to the rampart where dawn comes.
 */
function cityWallSolids(): Solid[] {
  const out: Solid[] = [];
  for (let x = 8; x <= 56; x += 8) out.push(box(x, x % 16 ? 0.4 : -0.4, 0.9, 2.2, 0.8, 0, 0, 'merlon'));
  out.push(box(66, 0, 1.4, 6, 1.2, 0, 0, 'step'), box(67.4, 0, 1.4, 6, 2.4, 0, 0, 'step'), box(68.8, 0, 1.4, 6, 3.5, 0, 0, 'step'));
  out.push(box(82.25, 0, 25.5, 6, 3.5, 0, 0, 'rampart'));
  return out;
}

const GROUND_SHRINES = ([[55, 17], [128, 15.5], [236, 16], [300, 19.5]] as const).map(([a, r]) => {
  const [x, z] = polar(a, r);
  return { x, y: 0, z };
});

export const LEVELS: Record<string, Level> = {
  grounds: {
    id: 'grounds',
    name: 'The Hearth Grounds',
    bounds: [-29.5, 29.5],
    area: { kind: 'disc', cx: 0, cz: 0, r: 29.5 },
    solids: groundsSolids(),
    start: 0,
    startZ: 4.2,
    startYaw: -Math.PI / 2, // facing the hearth and the arch beyond it
    hearthX: 0,
    hearthZ: 0,
    shelter: { rect: [-HUT.w / 2, -HUT.d / 2, HUT.w / 2, HUT.d / 2], y: HUT.eave },
    shrines: [{ x: -21, y: 2.7, z: -2.5 }, { x: 21, y: 2.8, z: 2.5 }, ...GROUND_SHRINES],
    checkpoints: [],
    regions: [{ x0: -46, x1: 46, kind: 'grounds' }],
  },

  lowerCity: {
    id: 'lowerCity',
    name: 'The Lower City',
    bounds: [-12, 112],
    area: { kind: 'band', x0: -12, x1: 112, z0: -9.5, z1: 9.5 },
    solids: lowerCitySolids(),
    start: -6,
    startZ: 0,
    startYaw: 0,
    end: 106,
    shrines: [],
    checkpoints: [34, 68],
    regions: [
      { x0: -12, x1: 48, kind: 'street', name: "Weavers' Row", sub: 'where the lamps went out first' },
      { x0: 48, x1: 66, kind: 'market', name: 'The Ash Market', sub: 'nothing has been sold here in a hundred years' },
      { x0: 66, x1: 112, kind: 'street', name: 'The Gate Road', sub: 'the cathedral waits beyond' },
    ],
  },

  cathedral: {
    id: 'cathedral',
    name: 'The Cathedral of the Hearth',
    bounds: [-12, 106],
    area: { kind: 'band', x0: -12, x1: 106, z0: -9, z1: 9 },
    solids: cathedralSolids(),
    start: -6,
    startZ: 0,
    startYaw: 0,
    end: 103,
    bossAt: 76,
    shrines: [],
    checkpoints: [33, 64],
    regions: [
      { x0: -12, x1: 66, kind: 'nave', name: 'The Nave', sub: 'they prayed here for the fire to last' },
      { x0: 66, x1: 106, kind: 'apse', name: 'The Apse of the First Flame', sub: 'where the hearth was kindled' },
    ],
  },

  cityWall: {
    id: 'cityWall',
    name: 'The City Wall',
    bounds: [-12, 95],
    area: { kind: 'band', x0: -12, x1: 95, z0: -3, z1: 3 }, // ends where the gatehouse does: no stepping off
    solids: cityWallSolids(),
    start: -6,
    startZ: 0,
    startYaw: 0,
    end: 88,
    shrines: [],
    checkpoints: [36],
    regions: [
      { x0: -12, x1: 64, kind: 'rampart', name: 'The Wall Walk', sub: 'the city sleeps below' },
      { x0: 64, x1: 96, kind: 'gatehouse', name: 'The Dawn Gate', sub: 'climb, the sky is turning' },
    ],
  },
};
