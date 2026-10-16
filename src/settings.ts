// Player settings and per-level bests, kept in localStorage (it can be missing or throw: then nothing persists).

export type Quality = 'auto' | 'high' | 'medium' | 'low';
export interface Settings {
  volume: number; // master, 0..1
  music: number; // 0..1
  sfx: number; // 0..1
  shake: number; // 0..1 screenshake strength
  flashes: number; // 0..1 screen flash strength
  numbers: boolean; // damage numbers over enemies
  quality: Quality;
}
const DEFAULTS: Settings = { volume: 1, music: 0.8, sfx: 1, shake: 1, flashes: 1, numbers: true, quality: 'auto' };
export interface Best {
  grade: string; // S A B C
  wounds: number;
  time: number;
}

const KEY = 'last-ember.v1';
interface Saved {
  settings: Settings;
  best: Record<string, Best>;
  reached: number; // furthest level index reached (levels up to it can be chosen)
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      return { settings: { ...DEFAULTS, ...s.settings }, best: s.best ?? {}, reached: s.reached ?? 0 };
    }
  } catch {
    // private window or blocked storage: play without saving
  }
  return { settings: { ...DEFAULTS }, best: {}, reached: 0 };
}

const saved = load();
function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // ignore
  }
}

export const settings: Settings = saved.settings;
export function saveSettings(): void {
  save();
}

const ORDER = ['S', 'A', 'B', 'C'];
/** Grade a finished level: wounds taken (out of 100 per shard) and, on the hearth grounds, how much fire was left. */
export function gradeFor(wounds: number, hearthPct: number | null): string {
  let g = wounds === 0 ? 0 : wounds <= 60 ? 1 : wounds <= 150 ? 2 : 3;
  if (hearthPct !== null) g = Math.max(g, hearthPct >= 75 ? 0 : hearthPct >= 45 ? 1 : hearthPct >= 20 ? 2 : 3);
  return ORDER[g];
}

export function bestFor(level: string): Best | undefined {
  return saved.best[level];
}

/** Record a result; returns true when it beats the stored best. */
export function recordBest(level: string, r: Best): boolean {
  const old = saved.best[level];
  const better = !old || ORDER.indexOf(r.grade) < ORDER.indexOf(old.grade) || (r.grade === old.grade && r.wounds < old.wounds);
  if (better) {
    saved.best[level] = r;
    save();
  }
  return better;
}

/** Furthest level reached; every level up to it can be chosen from the menu. */
export function reached(): number {
  return saved.reached;
}
export function markReached(i: number): void {
  if (i <= saved.reached) return;
  saved.reached = i;
  save();
}
/** Erase grades and progress (settings stay). */
export function resetProgress(): void {
  saved.best = {};
  saved.reached = 0;
  save();
}
