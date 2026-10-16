// Chapter data shared by sim (numbers) and render/UI (text, sky). No imports: keep it plain data.

export interface Wall {
  x: number;
  w: number;
  h: number;
}

export interface SkyKey {
  top: string;
  horizon: string;
  glow: string; // sun/moon halo colour
  glowY: number; // -1..1, where the glow sits on the sky
  fog: string;
  stars: number; // 0..1
}

export interface Chapter {
  id: string;
  clock: string; // "7 PM"
  roman: string; // "VII"
  title: string;
  line: string;
  duration: number; // seconds of play for the hour
  phase: 'hearth' | 'torch';
  lightHeight: number; // flame height in metres; lower = longer shadows
  lightRadius: number;
  spawnEvery: [number, number]; // seconds between spawns at start and end of the hour
  maxShades: number;
  shadeHp: number;
  shadeSpeed: number;
  sky: SkyKey;
}

export const WALLS: Wall[] = [
  { x: -11.5, w: 1.1, h: 1.5 },
  { x: -6.5, w: 1.4, h: 1.2 },
  { x: 5.5, w: 1.2, h: 1.0 },
  { x: 10.8, w: 1.6, h: 1.3 },
];

export const CHAPTERS: Chapter[] = [
  {
    id: '7pm',
    clock: '7 PM',
    roman: 'VII',
    title: 'Sunset',
    line: 'The last sun sinks. Only the hearth remains, and you swore to keep it.',
    duration: 55,
    phase: 'hearth',
    lightHeight: 2.7,
    lightRadius: 13,
    spawnEvery: [3.4, 2.3],
    maxShades: 4,
    shadeHp: 3,
    shadeSpeed: 1.8,
    sky: { top: '#2a1b3d', horizon: '#e0794a', glow: '#ffb070', glowY: -0.55, fog: '#3a2236', stars: 0.1 },
  },
  {
    id: '9pm',
    clock: '9 PM',
    roman: 'IX',
    title: 'The First Shades',
    line: 'They rise from every shadow the fire throws. They were your people once.',
    duration: 65,
    phase: 'hearth',
    lightHeight: 2.2,
    lightRadius: 11.5,
    spawnEvery: [2.6, 1.6],
    maxShades: 6,
    shadeHp: 3,
    shadeSpeed: 2.0,
    sky: { top: '#0f0d22', horizon: '#3b2a52', glow: '#9fb4ff', glowY: 0.45, fog: '#1b1730', stars: 0.6 },
  },
  {
    id: '11pm',
    clock: '11 PM',
    roman: 'XI',
    title: 'The Hearth Falters',
    line: 'The flame sinks lower. Every shadow grows long.',
    duration: 75,
    phase: 'hearth',
    lightHeight: 1.75,
    lightRadius: 10,
    spawnEvery: [2.0, 1.15],
    maxShades: 8,
    shadeHp: 4,
    shadeSpeed: 2.2,
    sky: { top: '#07060f', horizon: '#1a1530', glow: '#c8d2ff', glowY: 0.75, fog: '#110f1e', stars: 1 },
  },
];
