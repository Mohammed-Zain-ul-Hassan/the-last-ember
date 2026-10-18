import { DIFFICULTY } from './config';

// The difficulty setting, shared by both acts: chosen on the title or in the pause menu, kept between sessions under
// its own key (so any act reads the same choice). Easy is the default. Storage can be missing or throw: the game
// plays the same without it.

export type Difficulty = keyof typeof DIFFICULTY;

const KEY = 'lastember.difficulty';
let current: Difficulty = 'easy';
try {
  const v = localStorage.getItem(KEY);
  if (v === 'easy' || v === 'medium' || v === 'hard') current = v;
} catch {
  /* storage unavailable */
}
const listeners: ((d: Difficulty) => void)[] = [];

/** One line for the menus: what the choice means. */
export const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  easy: 'Some leverage: a wide true angle, a slow Wrong Shadow, an ember trail; at the hearth, fewer and softer shades.',
  medium: 'A fair test: the city as designed, the trail on; at the hearth, a little gentler than its keeper made it.',
  hard: 'Strict: a narrow angle, a fast Wrong Shadow, no trail, help only when asked (H); the hearth at its full fury.',
};

export const getDifficulty = (): Difficulty => current;

export function setDifficulty(d: Difficulty): void {
  if (d === current) return;
  current = d;
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* storage unavailable: it holds for this session */
  }
  for (const l of listeners) l(d);
}

/** Called whenever the setting changes (a live act applies it at once). */
export function onDifficulty(fn: (d: Difficulty) => void): void {
  listeners.push(fn);
}
