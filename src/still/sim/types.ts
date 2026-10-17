// The Still City as data. A district is everything static about a place (its stones, its frozen people, its
// mechanisms); CityState (city.ts) is everything that changes, kept plain so a snapshot is a structuredClone.
// Space: x/z ground plane, y up; a heading `yaw` faces (cos yaw, sin yaw) on x/z.

import type { Area, Solid } from '../../sim/geom';
import type { Clip, Pose } from '../../sim/pose';
import type { Region } from '../../data/levels';

export type FigKind = 'man' | 'woman' | 'child' | 'elder' | 'guard' | 'king' | 'knight' | 'shade';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export const inRect = (r: Rect, x: number, z: number, m = 0): boolean => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/** A hole in the floor (the canal, the gaps a collapse opens). `at`: seconds after `when` that it opens (else always). */
export interface Pit extends Rect {
  depth: number;
  when?: string; // a flag: the pit is solid floor until this is set...
  at?: number; // ...and this many seconds after
}

/** A plane a frozen shadow is painted on: a point on it and its normal (the side it faces). */
export interface Plane {
  p: [number, number, number];
  n: [number, number, number];
}
export const FLOOR: Plane = { p: [0, 0.012, 0], n: [0, 1, 0] };

/** A place the player must act during a step-in (what the figure did: pull the lever, lift the bar). */
export interface Spot {
  id: string; // the flag it sets
  x: number;
  z: number;
  r?: number;
  label: string; // the prompt ("pull the lever")
  needs?: string[]; // flags that must already be set, else it fails (the bar is too heavy for one)
  fail?: string; // what the prompt says when it fails
}

/** A frozen person: a statue with its last moment's shadow painted where the fire threw it. */
export interface FigureDef {
  id: string;
  kind: FigKind;
  h?: number;
  x: number;
  z: number;
  yaw: number;
  frozen: Partial<Pose>; // the pose it froze in
  holds?: 'spear' | 'staff' | 'sword';
  word?: number; // its Last Word (index into LAST_WORDS)
  light: [number, number, number]; // where the fire stood when it froze: its true angle
  tol?: number; // degrees (default 12; Last Words in corners a little more)
  ink: Plane; // where its frozen shadow lies
  clip?: Clip; // its last ten seconds: puzzle figures replay; Last Word figures only speak
  inkGone?: string; // its frozen shadow fades once this flag is set (the gate guards, once the gate is open)
  lockFlag?: string; // set when it is first held at its true angle (the Heart's first plate)
  hiddenUntil?: string; // not there at all until this flag (a Library page reveals its reader)
  stepIn?: Spot[];
  puzzle?: string; // the puzzle it belongs to (hints, fail counts)
  line?: string; // narrator line id when first found (e.g. gate.firstLit)
}

export type MechKind = 'portcullis' | 'gate' | 'shutter' | 'door' | 'lever' | 'bar' | 'shadowdoor' | 'ring';
/** Something that opens when a flag is set; while shut, its solids block the way. */
export interface MechDef {
  id: string;
  kind: MechKind;
  x: number;
  z: number;
  w: number; // span across the way
  h: number;
  ry: number;
  opens: string; // the flag
  blocks: Solid[];
  frozenMsg?: string; // said when you try it in the present ("held in the same second as everything else")
  highIn?: Rect; // a door of shadow: open only while the flame is held inside this area at least `minY` high
  minY?: number;
}

export interface Brazier {
  id: string;
  x: number;
  z: number;
  false?: boolean; // lit by the Wrong Shadow: costs Ash (tell: a cold blue flame)
}
export interface Torch {
  id: string;
  x: number;
  y: number;
  z: number;
  ry: number; // the wall it hangs on faces this way
}

export interface Riddle {
  id: string; // key into RIDDLES (or a plain inscription, with text)
  text?: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  puzzle?: string; // the puzzle it is about
}

/** A trigger area: entering it sets a flag and/or plays a line (once). */
export interface Zone {
  rect: Rect;
  flag?: string;
  line?: string;
  needs?: string;
}

export type WrongMode = 'still' | 'stalk' | 'hunt' | 'face' | 'final';
export interface WrongDef {
  mode: WrongMode;
  spawn: [number, number];
  appear?: Rect; // 'still': it appears when the player enters this
  nodes: [number, number][]; // where it may walk (in shadow, behind things); edges are computed by line of sight
  speed: number; // m/s while unseen and unlit
  sprint: number; // m/s while the flame is low or out
  after?: string; // it starts hunting only once this flag is set
  until?: string; // and is gone once this one is
}

export interface Gust {
  rect: Rect;
  period: number;
  dir: number; // heading the wind blows toward
  after?: string;
}

/** A floor plate that measures a shadow (the scales, the Heart's plates). */
export interface Plate {
  id: string; // the flag it sets when satisfied
  rect: Rect;
  y?: number; // the plate's surface height (default 0)
  casters: (Solid | 'self' | { fig: string })[]; // what throws the shadow it weighs
  min: number; // fraction of the plate in shadow, within [min, max]
  max: number;
  hold?: number; // seconds held there (default 0.6)
  needs?: string;
  back?: boolean; // only counts while the flame is drawn back (the fifth plate: from within)
}

/** Figures that must be woken (or held at their angle) in one order; a wrong one starts it over. */
export interface Sequence {
  ids: string[];
  flag: string;
  on: 'wake' | 'lock';
  puzzle?: string;
}

/** A page carved in relief on a lectern: lit from the side it says a lie; from directly above, the truth. */
export interface Page {
  id: string; // the flag set once it is read from above
  x: number;
  z: number;
  y: number; // the reading surface's height
  ry: number;
  word: number; // the Last Word hidden in it
  lie: string;
  truth: string;
}

/** A floor where shadows are walls: inside `rect`, the casters' shadows cannot be walked into. */
export interface Maze {
  rect: Rect;
  casters: Solid[];
}

/** What a district shows but does not simulate: vaults, arches, banners, rubble. */
export type Decor =
  | { kind: 'vault'; x0: number; x1: number; z0: number; z1: number; y: number } // a barrel vault over a passage
  | { kind: 'arch'; x: number; z0: number; z1: number; y: number; thick: number } // an arch across the way at x
  | { kind: 'banner'; x: number; y: number; z: number; ry: number; len: number }
  | { kind: 'rubble'; x: number; z: number; n: number; r: number }
  | { kind: 'shaft'; x0: number; x1: number; z0: number; z1: number } // a shaft of real light through a broken roof
  | { kind: 'dial'; x: number; z: number; r: number } // a sundial's ring of hours on the floor
  | { kind: 'roof'; x0: number; x1: number; z0: number; z1: number; y: number } // a dark ceiling (render only)
  | { kind: 'plate'; x: number; z: number; s: number; flag: string }; // a stone plate that lights when its flag is set

export interface District {
  id: string;
  index: number; // 0..4
  name: string;
  sub: string;
  card: string; // the line on its card
  area: Area;
  regions: Region[];
  solids: Solid[];
  pits: Pit[];
  start: { x: number; z: number; yaw: number };
  braziers: Brazier[];
  torches: Torch[];
  figures: FigureDef[];
  mechs: MechDef[];
  riddles: Riddle[];
  zones: Zone[];
  plates: Plate[];
  gusts: Gust[];
  sequences: Sequence[];
  derive: { flag: string; all: string[] }[]; // a flag that sets itself once all of these are set
  pages: Page[];
  maze: Maze | null;
  wrong: WrongDef | null;
  exit: Rect;
  decor: Decor[];
  /** Narration tied to this district's moments (line ids). */
  lines: { replayEnd?: string; firstWake?: string; wrongLit?: string; stepIn?: string; wrongSeen?: string; brazier?: string; bridge?: string; caught?: string; flags?: Record<string, string> };
  enterLine?: string;
  rumble: number; // 0..1, the distant water
  sky: 'night' | 'deep' | 'interior';
}
