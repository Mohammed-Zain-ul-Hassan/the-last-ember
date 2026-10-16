// Level geometry as plain data. One level can host several hours. Space is 3D: x/z ground plane, y up.
//   solids     boxes and cylinders: you collide with them, stand on them, and they cast the light's shadows
//              (the spawn pockets)
//   area       the walkable ground: a disc (the hearth grounds) or a band (the road east, x is "forward")
//   shrines    ember shrines (hearth grounds only)
//   checkpoints  braziers the torch lights; you rise again at the last one lit (x along the road)
//   end        road levels: the hour ends when the knight reaches it (and the boss, if any, has fallen)
// The road levels still carry their side-view walls/platforms and are extruded into solids (phase 2 re-authors them).
// Every wall a player must cross on the ground is <= 1.6 m (the jump clears 2.4 m); taller pieces are reached by steps.
import { box, cyl, type Area, type Solid } from '../sim/geom';
import type { Wall } from './chapters';

export interface Platform {
  x0: number;
  x1: number;
  y: number;
  kind?: 'stone' | 'timber' | 'balcony' | 'rampart';
}

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
  end?: number;
  bossAt?: number; // the boss rises when the knight passes this x
  walls: Wall[];
  platforms: Platform[];
  shrines: { x: number; y: number; z: number }[];
  checkpoints: number[];
  regions: Region[];
}

const w = (x: number, width: number, h: number): Wall => ({ x, w: width, h });
const D = Math.PI / 180;
const polar = (deg: number, r: number): [number, number] => [Math.cos(deg * D) * r, Math.sin(deg * D) * r];

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

/** Side-view walls and platforms, extruded across the road. */
function extrude(walls: Wall[], platforms: Platform[]): Solid[] {
  return [
    ...walls.map((v) => box(v.x, 0, v.w, 1.6, v.h, 0, 0, 'masonry')),
    ...platforms.map((p) => box((p.x0 + p.x1) / 2, 0, p.x1 - p.x0, 1.8, 0.36, 0, p.y - 0.36, 'walk')),
  ];
}

/** A road level: x is forward, the walkable band is the old lane widened. */
function road(l: Omit<Level, 'area' | 'solids' | 'startZ' | 'startYaw'>): Level {
  return { ...l, area: { kind: 'band', x0: l.bounds[0], x1: l.bounds[1], z0: -2.8, z1: 2.8 }, solids: extrude(l.walls, l.platforms), startZ: 0, startYaw: 0 };
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
    walls: [],
    platforms: [],
    shrines: [{ x: -21, y: 2.7, z: -2.5 }, { x: 21, y: 2.8, z: 2.5 }, ...GROUND_SHRINES],
    checkpoints: [],
    regions: [{ x0: -46, x1: 46, kind: 'grounds' }],
  },

  lowerCity: road({
    id: 'lowerCity',
    name: 'The Lower City',
    bounds: [-12, 112],
    start: -6,
    end: 106,
    walls: [
      w(6, 1.3, 1.2), w(14, 1.1, 1.5), w(22, 1.6, 1.0), w(31, 1.2, 1.4), w(39, 1.4, 1.6), w(47, 1.2, 1.1),
      w(55, 1.6, 1.5), w(63, 1.1, 1.2), w(71, 1.4, 1.4), w(80, 1.2, 1.0), w(88, 1.6, 1.5), w(97, 1.2, 1.3),
    ],
    platforms: [
      { x0: 10, x1: 20, y: 2.9, kind: 'timber' }, // a roof with no house under it
      { x0: 35, x1: 45, y: 3.1, kind: 'timber' },
      { x0: 51, x1: 60, y: 2.8, kind: 'timber' }, // the market's broken awning frame
      { x0: 76, x1: 86, y: 3.0, kind: 'timber' },
      { x0: 92, x1: 100, y: 2.8, kind: 'stone' },
    ],
    shrines: [],
    checkpoints: [34, 68],
    regions: [
      { x0: -12, x1: 48, kind: 'street', name: "Weavers' Row", sub: 'where the lamps went out first' },
      { x0: 48, x1: 66, kind: 'market', name: 'The Ash Market', sub: 'nothing has been sold here in a hundred years' },
      { x0: 66, x1: 112, kind: 'street', name: 'The Gate Road', sub: 'the cathedral waits beyond' },
    ],
  }),

  cathedral: road({
    id: 'cathedral',
    name: 'The Cathedral of the Hearth',
    bounds: [-12, 104],
    start: -6,
    end: 99,
    bossAt: 74,
    walls: [
      // pews: low, many, every one throws a pocket of shadow
      w(6, 1.6, 0.9), w(11, 1.6, 0.9), w(16, 1.6, 0.9), w(21, 1.6, 0.9), w(26, 1.6, 0.9),
      w(36, 1.6, 0.9), w(41, 1.6, 0.9), w(46, 1.6, 0.9), w(51, 1.6, 0.9), w(56, 1.6, 0.9),
      // stair steps up to the balconies
      w(30, 1.2, 1.2), w(31.2, 1.2, 2.3), w(61, 1.2, 1.2), w(62.2, 1.2, 2.3),
      // the altar step before the apse
      w(68, 2.0, 0.7),
    ],
    platforms: [
      { x0: 31.8, x1: 40, y: 3.4, kind: 'balcony' },
      { x0: 62.8, x1: 71, y: 3.4, kind: 'balcony' },
    ],
    shrines: [],
    checkpoints: [33, 64],
    regions: [
      { x0: -12, x1: 66, kind: 'nave', name: 'The Nave', sub: 'they prayed here for the fire to last' },
      { x0: 66, x1: 104, kind: 'apse', name: 'The Apse of the First Flame', sub: 'where the hearth was kindled' },
    ],
  }),

  cityWall: road({
    id: 'cityWall',
    name: 'The City Wall',
    bounds: [-12, 96],
    start: -6,
    end: 88,
    walls: [
      // merlons along the wall walk
      w(8, 0.9, 0.8), w(16, 0.9, 0.8), w(24, 0.9, 0.8), w(32, 0.9, 0.8), w(40, 0.9, 0.8), w(48, 0.9, 0.8), w(56, 0.9, 0.8),
      // stairs up the gatehouse
      w(66, 1.4, 1.2), w(67.4, 1.4, 2.4), w(68.8, 1.4, 3.5),
    ],
    platforms: [{ x0: 69.5, x1: 95, y: 3.5, kind: 'rampart' }],
    shrines: [],
    checkpoints: [36],
    regions: [
      { x0: -12, x1: 64, kind: 'rampart', name: 'The Wall Walk', sub: 'the city sleeps below' },
      { x0: 64, x1: 96, kind: 'gatehouse', name: 'The Dawn Gate', sub: 'climb, the sky is turning' },
    ],
  }),
};
