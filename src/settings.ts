// Player settings and per-level bests, kept in localStorage (it can be missing or throw: then nothing persists).

export interface Settings {
  volume: number; // 0..1
  shake: number; // 1 full, 0.5 reduced, 0 off
}
export interface Best {
  grade: string; // S A B C
  wounds: number;
  time: number;
}

const KEY = 'last-ember.v1';
interface Saved {
  settings: Settings;
  best: Record<string, Best>;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      return { settings: { volume: 1, shake: 1, ...s.settings }, best: s.best ?? {} };
    }
  } catch {
    // private window or blocked storage: play without saving
  }
  return { settings: { volume: 1, shake: 1 }, best: {} };
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
