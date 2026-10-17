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
  sens: number; // 0..1 mouse look sensitivity
  invertY: boolean;
}
const DEFAULTS: Settings = { volume: 1, music: 0.8, sfx: 1, shake: 1, flashes: 1, numbers: true, quality: 'auto', sens: 0.45, invertY: false };
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

const QUALITIES: Quality[] = ['auto', 'high', 'medium', 'low'];
const unit = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
/** Whatever was stored (an old version, a hand edit), only sane values get through. */
function clean(s: Partial<Settings> | undefined): Settings {
  const d = DEFAULTS;
  return {
    volume: unit(s?.volume, d.volume),
    music: unit(s?.music, d.music),
    sfx: unit(s?.sfx, d.sfx),
    shake: unit(s?.shake, d.shake),
    flashes: unit(s?.flashes, d.flashes),
    numbers: bool(s?.numbers, d.numbers),
    quality: QUALITIES.includes(s?.quality as Quality) ? (s!.quality as Quality) : d.quality,
    sens: unit(s?.sens, d.sens),
    invertY: bool(s?.invertY, d.invertY),
  };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      const r = Number(s.reached);
      const best = s.best && typeof s.best === 'object' ? s.best : {};
      return { settings: clean(s.settings), best, reached: Number.isInteger(r) && r > 0 ? r : 0 };
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
let saveTimer = 0;
/** Sliders call this on every step: the write is batched to once the hand stops. */
export function saveSettings(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 250);
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
