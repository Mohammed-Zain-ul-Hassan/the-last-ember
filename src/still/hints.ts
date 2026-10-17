import { HINTS, LINES, PUZZLE_WHISPERS, type HintTrigger, type Line } from '../data/stillCity';
import type { City } from './sim/city';
import { save } from './save';

// The conditional hints (docs/still-city-design.md, "Conditional hint system"): one state machine per puzzle, plus
// the triggers that are not about a puzzle (Ash, being caught, a Last Word near). The flame gives every hint: a
// whisper and a small cue. Tiers climb only while the player is stuck: 1 nudge, 2 guide, 3 reveal; 90 s between
// tiers; progress on a puzzle resets its tiers; never during a chase. Off / Gentle (tier 1 only) / Guided (all).
//
//   trigger                       tier 1 nudge                  tier 2 guide                       tier 3 reveal
//   in one room 3 min, no progress the nearest unlit shadow glows the flame leans to the key shadow   a ghost replay of it
//   same puzzle failed 3 times    the key shadow pulses once    the flame trembles to the angle    angle marker for 5 s
//   Ash at 1 or less              a brazier glints              its direction whispered            a path of embers to it
//   caught twice in a row         a cold breeze from it         the flame flares at his back       its outline glows 3 s
//   a Last Word within 10 m       the hum rises when facing it  the hum pulses faster (always on)  its shadow shimmers
//   riddle read twice, no help    the inscription brightens     a key word whispered               the plain answer

export interface HintCues {
  glowFigure: (fig: number, seconds: number) => void;
  ghostReplay: (fig: number) => void;
  markAngle: (fig: number, seconds: number) => void;
  leanFlame: (x: number, z: number, seconds: number) => void;
  emberPath: (x: number, z: number, seconds: number) => void;
  outlineWrong: (seconds: number) => void;
  coldBreeze: (seconds: number) => void;
  glintBrazier: (i: number, seconds: number) => void;
  brightenRiddle: (seconds: number) => void;
  /** Is the step in front of him a puzzle (a true angle to find), rather than a walk or a rest? */
  onPuzzle: () => boolean;
}

/** One puzzle's hint state. */
interface Puzzle {
  since: number; // when it last moved forward (or began)
  fails: number;
  riddleReads: number;
  tier: Record<'stuck' | 'failed' | 'riddle', number>;
  next: Record<'stuck' | 'failed' | 'riddle', number>;
}

// base timings, scaled by the difficulty (Easy sooner, Hard much later; H always answers at once)
const COOLDOWN_S = 90;
const STUCK_S = 180;

export class Hints {
  private t = 0;
  private puzzles = new Map<string, Puzzle>();
  private globalTier: Record<'ash' | 'caught' | 'word', number> = { ash: 0, caught: 0, word: 0 };
  private globalNext: Record<'ash' | 'caught' | 'word', number> = { ash: 0, caught: 0, word: 0 };
  private askN = 0;
  private speak: (l: Line, priority: number) => void;
  private note: (text: string) => void;
  private cues: HintCues;
  private city: () => City;
  /** The puzzle in front of him (the guide's current objective) and the figure it turns on. */
  private puzzleKey: () => string;

  constructor(speak: (l: Line, priority: number) => void, note: (text: string) => void, city: () => City, puzzleKey: () => string, cues: HintCues) {
    this.speak = speak;
    this.note = note;
    this.city = city;
    this.puzzleKey = puzzleKey;
    this.cues = cues;
  }

  private get delay(): number {
    return this.city().diff.hintDelay;
  }
  private get cooldown(): number {
    return COOLDOWN_S * this.delay;
  }
  private get stuckAfter(): number {
    return STUCK_S * this.delay;
  }

  private get p(): Puzzle {
    const k = this.puzzleKey();
    let p = this.puzzles.get(k);
    if (!p) {
      p = { since: this.t, fails: 0, riddleReads: 0, tier: { stuck: 0, failed: 0, riddle: 0 }, next: { stuck: this.t + this.stuckAfter, failed: 0, riddle: 0 } };
      this.puzzles.set(k, p);
    }
    return p;
  }

  reset(): void {
    this.globalTier = { ash: 0, caught: 0, word: 0 };
    this.globalNext = { ash: 0, caught: 0, word: 0 };
    this.askN = 0;
  }

  /** Progress on the puzzle in front of him resets its tiers. */
  progress(): void {
    const p = this.p;
    p.since = this.t;
    p.fails = 0;
    p.riddleReads = 0;
    p.tier = { stuck: 0, failed: 0, riddle: 0 };
    p.next = { stuck: this.t + this.stuckAfter, failed: 0, riddle: 0 };
  }
  failed(): void {
    this.p.fails++;
  }
  caught(): void {
    /* the sim counts it (caughtRun) */
  }
  riddleRead(_puzzle?: string): void {
    this.p.riddleReads++;
  }

  private get maxTier(): number {
    return save.hints === 'off' ? 0 : save.hints === 'gentle' ? 1 : 3;
  }

  /** In a chase nothing is hinted: no whisper should cost a player their run. */
  private get calm(): boolean {
    const c = this.city();
    const w = c.s.wrong;
    const chase = ['collapse', 'hunt', 'chase', 'plates'].some((f) => c.flag(f));
    return !(w.on && !w.gone && w.dist < 9) && !chase && c.s.status === 'play' && !c.s.ghost;
  }

  /** The figure the current puzzle turns on: the nearest one not yet woken (or not yet found). */
  private keyFigure(): number {
    const c = this.city();
    const b = c.s.body;
    let best = -1;
    let bd = Infinity;
    c.d.figures.forEach((f, i) => {
      const rt = c.s.figs[i];
      if (!c.present(i) || (f.clip ? rt.woke : rt.found)) return;
      const dd = Math.hypot(f.x - b.x, f.z - b.z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }

  private nearWord(): number {
    const c = this.city();
    const b = c.s.body;
    return c.d.figures.findIndex((f, i) => f.word !== undefined && !c.s.words[f.word] && c.present(i) && !f.clip && Math.hypot(f.x - b.x, f.z - b.z) < 10);
  }

  private give(trig: HintTrigger, tier: number): void {
    const c = this.city();
    const d = c.d;
    // the riddle's plain answer is the district's own (the doc's table line answers the Gate and the Heart)
    const own = trig === 'riddle' && tier === 3 ? LINES[`hint.riddle.3.${d.id}`] : undefined;
    this.speak(own ?? HINTS[trig][tier - 1], 1);
    if (trig === 'stuck' && tier === 1 && this.cues.onPuzzle()) {
      const pz = PUZZLE_WHISPERS[d.id];
      if (pz?.length) this.speak(pz[0], 1);
    }
    const key = this.keyFigure();
    const f = key >= 0 ? d.figures[key] : null;
    switch (trig) {
      case 'stuck':
        if (tier === 1 && key >= 0) this.cues.glowFigure(key, 6);
        if (tier === 2 && f) this.cues.leanFlame(f.x, f.z, 5);
        if (tier === 3 && key >= 0) {
          if (f?.clip) this.cues.ghostReplay(key);
          this.cues.markAngle(key, 8);
        }
        break;
      case 'failed':
        if (tier === 1 && key >= 0) this.cues.glowFigure(key, 2);
        if (tier === 2 && f) this.cues.leanFlame(f.light[0], f.light[2], 5);
        if (tier === 3 && key >= 0) this.cues.markAngle(key, 5);
        break;
      case 'ash': {
        const b = c.s.body;
        let bi = -1;
        let bd = Infinity;
        d.braziers.forEach((br, i) => {
          const dd = Math.hypot(br.x - b.x, br.z - b.z);
          if (!br.false && dd < bd) {
            bd = dd;
            bi = i;
          }
        });
        if (bi >= 0 && tier === 1) this.cues.glintBrazier(bi, 4);
        if (bi >= 0 && tier === 2) this.cues.leanFlame(d.braziers[bi].x, d.braziers[bi].z, 5);
        if (bi >= 0 && tier === 3) this.cues.emberPath(d.braziers[bi].x, d.braziers[bi].z, 10);
        break;
      }
      case 'caught':
        if (tier === 1) this.cues.coldBreeze(3);
        if (tier === 2) this.cues.leanFlame(c.s.wrong.x, c.s.wrong.z, 3);
        if (tier === 3) this.cues.outlineWrong(3);
        break;
      case 'word':
        if (tier === 3) {
          const w = this.nearWord();
          if (w >= 0) this.cues.glowFigure(w, 3);
        }
        break;
      case 'riddle':
        if (tier === 1) this.cues.brightenRiddle(6);
        break;
    }
  }

  private bumpPuzzle(trig: 'stuck' | 'failed' | 'riddle', condition: boolean): void {
    const p = this.p;
    if (!condition || this.t < p.next[trig] || p.tier[trig] >= this.maxTier) return;
    p.tier[trig]++;
    p.next[trig] = this.t + this.cooldown;
    this.give(trig, p.tier[trig]);
  }

  private bumpGlobal(trig: 'ash' | 'caught' | 'word', condition: boolean): void {
    if (!condition) {
      // the condition passed: its hints start over next time
      if (this.globalTier[trig] && this.t > this.globalNext[trig]) this.globalTier[trig] = 0;
      return;
    }
    if (this.t < this.globalNext[trig] || this.globalTier[trig] >= this.maxTier) return;
    this.globalTier[trig]++;
    this.globalNext[trig] = this.t + this.cooldown;
    this.give(trig, this.globalTier[trig]);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.maxTier === 0 || !this.calm) return;
    const c = this.city();
    const p = this.p;
    this.bumpPuzzle('failed', p.fails >= (this.delay > 1 ? 5 : 3));
    this.bumpPuzzle('riddle', p.riddleReads >= 2 && this.t - p.since > 60);
    this.bumpPuzzle('stuck', this.t - p.since >= this.stuckAfter);
    this.bumpGlobal('ash', c.s.ash <= 1);
    this.bumpGlobal('caught', c.s.caughtRun >= 2);
    this.bumpGlobal('word', this.nearWord() >= 0 && this.t - p.since > 120);
  }

  /** H: ask the flame. It answers with the district's own puzzle whispers first, then the next tier. */
  ask(): void {
    if (save.hints === 'off') {
      this.note('Hints are off (Esc to change).');
      return;
    }
    const list = PUZZLE_WHISPERS[this.city().d.id] ?? [];
    if (this.askN < list.length) {
      this.speak(list[this.askN++], 1);
      return;
    }
    const p = this.p;
    if (p.tier.stuck < this.maxTier) {
      p.tier.stuck++;
      p.next.stuck = this.t + this.cooldown;
      this.give('stuck', p.tier.stuck);
    } else this.speak(list[this.askN++ % Math.max(1, list.length)], 1);
  }
}
