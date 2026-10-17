// What the Still City remembers between sessions: the hint setting, the Last Words heard, the furthest district
// reached, sound and look settings. Browser storage can be missing or throw (private windows, previews): every
// read and write is guarded, and the game plays the same without it.

export type HintMode = 'off' | 'gentle' | 'guided';

export interface StillSave {
  hints: HintMode;
  words: boolean[];
  reached: number; // furthest district index entered
  muted: boolean;
  sens: number; // mouse look 0..1
  invertY: boolean;
  endings: string[];
}

const KEY = 'stillcity.v1';
const DEFAULT: StillSave = { hints: 'guided', words: new Array(36).fill(false), reached: 0, muted: false, sens: 0.45, invertY: false, endings: [] };

function load(): StillSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const v = JSON.parse(raw) as Partial<StillSave>;
    const out = { ...structuredClone(DEFAULT), ...v };
    if (!Array.isArray(out.words) || out.words.length !== 36) out.words = new Array(36).fill(false);
    return out;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export const save: StillSave = load();

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: the session still plays */
  }
}

export function resetSave(): void {
  Object.assign(save, structuredClone(DEFAULT));
  persist();
}
