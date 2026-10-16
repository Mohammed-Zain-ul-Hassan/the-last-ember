export interface Shot {
  id: string;
  /** gameplay = raw capture at 1x; scene = in-engine footage that is not gameplay (memories, cutscenes) */
  kind: "gameplay" | "scene" | "title" | "card" | "end";
  start: number;
  dur: number;
  src?: string;
  in?: number;
  speed?: number;
  theme?: number;
  subtitle?: string;
  kicker?: string;
  raw?: boolean;
  why: string;
}

export interface Overlay {
  kind: "lowerThird" | "tag";
  start: number;
  dur: number;
  theme: number;
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
