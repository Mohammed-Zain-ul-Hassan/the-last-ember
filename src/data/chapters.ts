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
  disc?: number; // sun/moon disc radius on the sky (0 = none)
  fogDensity?: number; // default 0.022
  glowAz?: number; // where the glow sits around the horizon, angle on x/z (default: over the arch, north-east of -z)
}

export interface Chapter {
  id: string;
  clock: string; // "7 PM"
  roman: string; // "VII"
  title: string;
  line: string;
  duration: number; // seconds of play for the hour
  phase: 'hearth' | 'torch' | 'dawn';
  level: string; // key into LEVELS
  mix: { shade: number; crawler: number; lantern: number }; // spawn weights
  memory: string; // revealed on the card after the hour is survived
  bigAt?: number; // progress (0..1) at which a great shade rises
  rain: number; // 0..1 how hard it rains this hour (the hearth's hut keeps its fire dry)
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
    rain: 0.3,
    mix: { shade: 1, crawler: 0, lantern: 0 },
    level: 'grounds',
    clock: '7 PM',
    roman: 'VII',
    title: 'Sunset',
    line: 'The sun sets, as it has every night. Keep the hearth.',
    memory: 'Your oath, over the hearthstone: keep it burning. Whatever it costs.',
    duration: 55,
    phase: 'hearth',
    lightHeight: 2.7,
    lightRadius: 13,
    spawnEvery: [3.4, 2.3],
    maxShades: 4,
    shadeHp: 3,
    shadeSpeed: 1.8,
    sky: { top: '#2a1b3d', horizon: '#e0794a', glow: '#ffb070', glowY: -0.55, fog: '#3a2236', stars: 0.1, disc: 0.1 },
  },
  {
    id: '9pm',
    rain: 0.45,
    mix: { shade: 0.75, crawler: 0.25, lantern: 0 },
    level: 'grounds',
    clock: '9 PM',
    roman: 'IX',
    title: 'The First Shades',
    line: 'They rise from the dark, and every hand reaches for the fire.',
    memory: 'Their faces. Every one of them turned toward the fire.',
    duration: 65,
    phase: 'hearth',
    lightHeight: 2.2,
    lightRadius: 11.5,
    spawnEvery: [2.6, 1.6],
    maxShades: 6,
    shadeHp: 3,
    shadeSpeed: 2.0,
    sky: { top: '#0f0d22', horizon: '#3b2a52', glow: '#9fb4ff', glowY: 0.45, fog: '#1b1730', stars: 0.6, disc: 0.045 },
  },
  {
    id: '11pm',
    rain: 0.55,
    mix: { shade: 0.6, crawler: 0.25, lantern: 0.15 },
    level: 'grounds',
    clock: '11 PM',
    roman: 'XI',
    title: 'The Hearth Falters',
    line: 'The flame sinks lower. The shadow in its heart does not.',
    memory: 'One long night, long ago. You closed your eyes. The fire went out.',
    duration: 75,
    phase: 'hearth',
    lightHeight: 1.75,
    lightRadius: 10,
    spawnEvery: [2.0, 1.15],
    maxShades: 8,
    shadeHp: 4,
    shadeSpeed: 2.2,
    sky: { top: '#07060f', horizon: '#1a1530', glow: '#c8d2ff', glowY: 0.75, fog: '#110f1e', stars: 1, disc: 0.04 },
  },
  {
    id: '1am',
    rain: 0.5,
    mix: { shade: 0.5, crawler: 0.3, lantern: 0.2 },
    level: 'lowerCity',
    clock: '1 AM',
    roman: 'I',
    title: 'Carrying the Flame',
    line: 'The hearth is ash. Its fire is in your hand. Its shadow went ahead.',
    memory: 'At the Dawn Gate they stopped running. They turned back. Why?',
    duration: 60,
    phase: 'torch',
    lightHeight: 2.35,
    lightRadius: 8,
    spawnEvery: [2.2, 1.4],
    maxShades: 7,
    shadeHp: 4,
    shadeSpeed: 2.3,
    sky: { top: '#04040b', horizon: '#141327', glow: '#b8c6ff', glowY: 0.85, fog: '#0b0a16', stars: 1, disc: 0.035 },
  },
  {
    id: '3am',
    rain: 0.7,
    mix: { shade: 0.45, crawler: 0.3, lantern: 0.25 },
    level: 'cathedral',
    clock: '3 AM',
    roman: 'III',
    title: 'The Darkest Hour',
    line: 'No moon. No stars. Only the torch, and a shadow that waits ahead.',
    memory: 'Someone stepped into the fire. Every hand reached for him.',
    duration: 70,
    phase: 'torch',
    lightHeight: 2.35,
    lightRadius: 7,
    spawnEvery: [2.0, 1.2],
    maxShades: 8,
    shadeHp: 4,
    shadeSpeed: 2.4,
    sky: { top: '#020205', horizon: '#161022', glow: '#4a2a3a', glowY: 0.2, fog: '#0b0912', stars: 0.25 },
  },
  {
    id: '5am',
    rain: 0.22,
    mix: { shade: 0.4, crawler: 0.35, lantern: 0.25 },
    level: 'cityWall',
    clock: '5 AM',
    roman: 'V',
    title: 'Before Dawn',
    line: 'Dawn is one minute away. It has been for a hundred years.',
    memory: '',
    duration: 50,
    phase: 'dawn',
    lightHeight: 2.35,
    lightRadius: 7.5,
    spawnEvery: [1.6, 1.0],
    maxShades: 9,
    shadeHp: 4,
    shadeSpeed: 2.5,
    sky: { top: '#141a3a', horizon: '#7a5a78', glow: '#ffc9a8', glowY: -0.75, fog: '#2a2236', stars: 0.4, glowAz: 0 },
  },
];

/** Sky for the dawn finale / ending. */
export const DAWN_SKY: SkyKey = { top: '#33507f', horizon: '#f2a070', glow: '#ffe6b8', glowY: -0.08, fog: '#4a3848', stars: 0, disc: 0.075, fogDensity: 0.014, glowAz: 0 };
/** Sky for the midnight cutscene: almost nothing left. */
export const MIDNIGHT_SKY: SkyKey = { top: '#030308', horizon: '#0d0b18', glow: '#6a6f9a', glowY: 0.95, fog: '#08070f', stars: 0.8, disc: 0.04 };
