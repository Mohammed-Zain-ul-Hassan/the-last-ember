// Level geometry as plain data (no imports from sim or render). One level can host several hours.
//   walls      solid, standable, and they cast the light's shadows (the spawn pockets)
//   platforms  one-way ledges (land from above, down + jump drops through)
//   shrines    ember shrines (hearth grounds only)
//   checkpoints  braziers the torch lights; you rise again at the last one lit
//   end        road levels: the hour ends when the knight reaches it (and the boss, if any, has fallen)
// Every wall a player must cross on the ground is <= 1.6 m (the jump clears 2.4 m); taller pieces are reached by steps.
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
}

export interface Level {
  id: string;
  name: string;
  bounds: [number, number];
  start: number;
  hearthX?: number;
  end?: number;
  bossAt?: number; // the boss rises when the knight passes this x
  walls: Wall[];
  platforms: Platform[];
  shrines: { x: number; y: number }[];
  checkpoints: number[];
  regions: Region[];
}

const w = (x: number, width: number, h: number): Wall => ({ x, w: width, h });

export const LEVELS: Record<string, Level> = {
  grounds: {
    id: 'grounds',
    name: 'The Hearth Grounds',
    bounds: [-46, 46],
    start: -2.2,
    hearthX: 0,
    walls: [
      w(-41, 1.4, 1.3), w(-33, 1.2, 1.4), w(-26.5, 1.6, 1.3), w(-19, 1.2, 1.1), w(-11.5, 1.1, 1.5), w(-6.5, 1.4, 1.2),
      w(5.5, 1.2, 1.0), w(10.8, 1.6, 1.3), w(18, 1.3, 1.4), w(25.5, 1.4, 1.2), w(32.5, 1.2, 1.5), w(40, 1.6, 1.3),
    ],
    platforms: [
      { x0: -31, x1: -21, y: 2.7, kind: 'stone' }, // the broken colonnade walk
      { x0: 20, x1: 30, y: 2.8, kind: 'balcony' }, // the old balcony
      { x0: -44, x1: -38, y: 2.6, kind: 'stone' },
      { x0: 37, x1: 44, y: 2.7, kind: 'stone' },
    ],
    shrines: [
      { x: -42, y: 2.6 },
      { x: -24, y: 2.7 },
      { x: -15, y: 0 },
      { x: 14.5, y: 0 },
      { x: 26, y: 2.8 },
      { x: 42, y: 2.7 },
    ],
    checkpoints: [],
    regions: [{ x0: -46, x1: 46, kind: 'grounds' }],
  },

  lowerCity: {
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
      { x0: -12, x1: 48, kind: 'street' },
      { x0: 48, x1: 66, kind: 'market' },
      { x0: 66, x1: 112, kind: 'street' },
    ],
  },

  cathedral: {
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
      { x0: -12, x1: 66, kind: 'nave' },
      { x0: 66, x1: 104, kind: 'apse' },
    ],
  },

  cityWall: {
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
      { x0: -12, x1: 64, kind: 'rampart' },
      { x0: 64, x1: 96, kind: 'gatehouse' },
    ],
  },
};
