// The night, as data. Each chapter spans two hours of the clock.

import type { KindName } from '../config';

export type ChapterMode = 'hearth' | 'torch' | 'dawn';

export interface Chapter {
  id: string;
  hour: number; // 19 = 7 PM … 29 = 5 AM
  label: string; // "7 PM"
  title: string;
  lines: string[];
  mode: ChapterMode;
  duration: number; // seconds of play (boss chapter: until the boss falls)
  fuelDrain: number; // fuel/s that time alone takes from the fire (hearth mode)
  dim: number; // 0..1 how much the night has eaten the fire's reach this hour
  spawn: { start: number; end: number; delay: number }; // shades per second, ramped over the chapter
  kinds: Partial<Record<KindName, number>>; // spawn weights
  boss?: boolean;
  sunset?: boolean;
  // sky / fog key colours (linear-ish hex), lerped by the renderer
  sky: { top: string; horizon: string; fog: string };
  music: 'dusk' | 'night' | 'torch' | 'boss' | 'dawn';
}

export const CHAPTERS: Chapter[] = [
  {
    id: '7pm',
    hour: 19,
    label: '7 PM',
    title: 'Sunset',
    lines: ['The sun is dying, and it will not come back.', 'One hearth still burns. One knight still keeps it.'],
    mode: 'hearth',
    duration: 55,
    fuelDrain: 0.25,
    dim: 0,
    spawn: { start: 0.25, end: 0.7, delay: 9 },
    kinds: { wisp: 3, shade: 2 },
    sunset: true,
    sky: { top: '#2a1838', horizon: '#c0542a', fog: '#3a1e2a' },
    music: 'dusk',
  },
  {
    id: '9pm',
    hour: 21,
    label: '9 PM',
    title: 'The First Shades',
    lines: ['They come the way water finds a crack.', 'They can only walk where the light is not.'],
    mode: 'hearth',
    duration: 70,
    fuelDrain: 0.45,
    dim: 0.15,
    spawn: { start: 0.6, end: 1.25, delay: 2 },
    kinds: { wisp: 3, shade: 4, brute: 0.4 },
    sky: { top: '#0c0a1c', horizon: '#2a1a3c', fog: '#140f22' },
    music: 'night',
  },
  {
    id: '11pm',
    hour: 23,
    label: '11 PM',
    title: 'The Hearth Falters',
    lines: ['The flame is lower now, and every shadow is longer.', 'They remember the way in.'],
    mode: 'hearth',
    duration: 75,
    fuelDrain: 0.55,
    dim: 0.32,
    spawn: { start: 0.9, end: 1.7, delay: 2 },
    kinds: { wisp: 3, shade: 4, brute: 1.2 },
    sky: { top: '#060510', horizon: '#160f24', fog: '#0b0814' },
    music: 'night',
  },
  {
    id: '1am',
    hour: 25,
    label: '1 AM',
    title: 'The Carried Flame',
    lines: ['Now the light goes where he goes.', 'Every step turns the shadows, like the hand of a clock.'],
    mode: 'torch',
    duration: 70,
    fuelDrain: 0,
    dim: 0,
    spawn: { start: 0.7, end: 1.4, delay: 3 },
    kinds: { wisp: 3, shade: 4, brute: 0.8 },
    sky: { top: '#030308', horizon: '#0c0a18', fog: '#07060e' },
    music: 'torch',
  },
  {
    id: '3am',
    hour: 27,
    label: '3 AM',
    title: 'The Darkest Hour',
    lines: ['Something vast walks in the shadows of the stones.', 'It can only be struck in the light.'],
    mode: 'torch',
    duration: 999,
    fuelDrain: 0,
    dim: 0.2,
    spawn: { start: 0.35, end: 0.6, delay: 6 },
    kinds: { wisp: 4, shade: 3 },
    boss: true,
    sky: { top: '#020205', horizon: '#09060f', fog: '#050409' },
    music: 'boss',
  },
  {
    id: '5am',
    hour: 29,
    label: '5 AM',
    title: 'Before Dawn',
    lines: ['The sun is coming back, and it unmakes every shadow.', 'Meet it, or hide from it.'],
    mode: 'dawn',
    duration: 999,
    fuelDrain: 0,
    dim: 0.25,
    spawn: { start: 0.9, end: 0.2, delay: 1.5 },
    kinds: { wisp: 3, shade: 4, brute: 0.5 },
    sky: { top: '#1a1836', horizon: '#e0866a', fog: '#3a2a3a' },
    music: 'dawn',
  },
];

export function chapterIndex(id: string): number {
  const i = CHAPTERS.findIndex((c) => c.id === id || c.label.replace(' ', '').toLowerCase() === id.toLowerCase());
  return i;
}

/** "7:42 PM" from a chapter and its progress 0..1 (each chapter spans two hours). */
export function clockText(ch: Chapter, progress: number): string {
  const mins = Math.floor(Math.min(0.9999, Math.max(0, progress)) * 120);
  const h24 = (ch.hour + Math.floor(mins / 60)) % 24;
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const MEMORIES: string[] = [
  'A small hand in mine. We watched the hearth together. I remember warmth.',
  'My oath, on one knee: while I stand, it burns.',
  'Seven bells in the tower. I rang the last one every night.',
  'Snow on the hearth-stones. I was so tired.',
  'The old king said: keep it, keeper, whatever comes.',
  'I closed my eyes for one hour. Only one.',
  'When I woke, the hearth was ash, and the dark was in the streets.',
  'They called my name from the shadows. I did not answer.',
  'Everyone I failed went into the dark. Everyone I failed comes back to the fire.',
  'I let it die once. Not again.',
];

export const MIDNIGHT_LINES = ['Midnight.', 'The hearth is dying.', 'Take what is left of it.'];

export const ENDINGS = {
  light: {
    title: 'Into the Light',
    lines: [
      'He stepped into the morning and was unmade.',
      'Every memory came home at once.',
      'The ember lived.',
    ],
  },
  shadow: {
    title: 'The Keeper Endures',
    lines: ['He kept to the shadow of the stones.', 'The day passed over him.', 'He endures. Alone.'],
  },
} as const;
