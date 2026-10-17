import BEATS from './beats.json';
import { LINES, type Line } from '../../data/stillCity';
import { bus, type GameEvent } from './bus';

// The narrative engine: beats.json says which lines an event plays (once, in turn, after a delay, at a priority);
// lines.json holds the words. Editing either changes the game without touching code.

interface Beat {
  on: string;
  if?: Record<string, unknown>;
  say?: string[];
  variants?: string[];
  after?: { count: number; say: string };
  once?: boolean;
  delay?: number;
  cooldown?: number;
  priority?: number;
}

export type Speak = (line: Line, priority: number) => void;

export class Narrative {
  private beats: Beat[] = (BEATS as { beats: Beat[] }).beats;
  private fired = new Set<number>();
  private count = new Map<number, number>();
  private last = new Map<number, number>();
  private pending: { at: number; line: Line; priority: number }[] = [];
  private t = 0;
  private speak: Speak;

  constructor(speak: Speak) {
    this.speak = speak;
    for (const b of this.beats) {
      for (const id of [...(b.say ?? []), ...(b.variants ?? []), ...(b.after ? [b.after.say] : [])])
        if (!LINES[id]) console.warn(`[narrative] beats.json names a line that lines.json does not have: ${id}`);
    }
    bus.onAny((e) => this.handle(e));
  }

  private matches(b: Beat, e: GameEvent): boolean {
    if (b.on !== e.type) return false;
    for (const [k, v] of Object.entries(b.if ?? {})) if (e[k] !== v) return false;
    return true;
  }

  private handle(e: GameEvent): void {
    this.beats.forEach((b, i) => {
      if (!this.matches(b, e)) return;
      if ((b.once ?? true) && this.fired.has(i)) return;
      if (b.cooldown && this.t - (this.last.get(i) ?? -1e9) < b.cooldown) return;
      this.fired.add(i);
      this.last.set(i, this.t);
      const n = (this.count.get(i) ?? 0) + 1;
      this.count.set(i, n);
      let ids = b.say ?? [];
      if (b.variants) ids = b.after && n >= b.after.count ? [b.after.say] : [b.variants[(n - 1) % b.variants.length]];
      let at = this.t + (b.delay ?? 0);
      for (const id of ids) {
        const line = LINES[id];
        if (!line) continue;
        this.pending.push({ at, line, priority: b.priority ?? 2 });
        at += 0.05;
      }
    });
  }

  /** Lines that ask for one directly (a Last Word heard, an inscription read). */
  say(id: string, priority = 2, delay = 0): void {
    const line = LINES[id];
    if (line) this.pending.push({ at: this.t + delay, line, priority });
  }

  update(dt: number): void {
    this.t += dt;
    this.pending.sort((a, b) => a.at - b.at);
    while (this.pending.length && this.pending[0].at <= this.t) {
      const p = this.pending.shift()!;
      this.speak(p.line, p.priority);
    }
  }
}
