export interface Shot {
  id: string;
  /** gameplay = raw capture at 1x; scene = in-engine footage that is not gameplay (memories, cutscenes) */
  kind: "gameplay" | "scene" | "title" | "card" | "act" | "end";
  start: number;
  dur: number;
  src?: string;
  in?: number;
  speed?: number;
  /** v2: the take's own sound (screen recordings carry the game's audio), 0..1; absent = muted (v1's silent captures) */
  vol?: number;
  theme?: number;
  subtitle?: string;
  kicker?: string;
  raw?: boolean;
  why: string;
  /** v2: the event the in-point is anchored to (a moments.json entry), and whether its capture exists yet */
  anchor?: string;
  missing?: boolean;
  /** act cards: "ACT I" and its name */
  act?: string;
  name?: string;
}

export interface Overlay {
  kind: "lowerThird" | "tag" | "line" | "corner";
  start: number;
  dur: number;
  theme: number;
  /** a story line set over live gameplay (kind "line") */
  text?: string;
}

export interface Theme {
  name: string;
  how: string;
  card: [string, string];
}

export interface Shotlist {
  fps: number;
  width: number;
  height: number;
  bpm: number;
  bar: number;
  duration: number;
  url: string;
  title: string;
  logline: string;
  themes: Theme[];
  shots: Shot[];
  overlays: Overlay[];
}
