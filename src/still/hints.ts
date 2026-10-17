import { HINTS, PUZZLE_WHISPERS, type HintTrigger, type Line } from '../data/stillCity';
import type { City } from './sim/city';
import type { StillHud } from './ui/hud';
import { save } from './save';

// The conditional hints. The flame gives every hint, a whisper and a small cue, and hints climb three tiers only
// while the player is stuck: 1 nudge (a cue only, and a whisper), 2 guide, 3 reveal. A 90-second cooldown separates
// tiers; progress on a puzzle resets its tier; never during a chase. Off / Gentle (tier 1 only) / Guided (all).
//
//   stuck in one place 3 min     nearest unheard shadow glows · flame leans toward the key figure · its true angle marked
//   same puzzle failed 3 times   key shadow pulses            · flame trembles toward the angle  · angle marker for 5 s
//   Ash at 1 or less             a brazier glints             · its direction whispered          · a path of embers to it
//   caught twice in a row        a cold breeze from it        · the flame flares at his back     · its outline glows 3 s
//   a Last Word within 10 m      the hum rises (always on)    · the hum pulses faster (always)   · its shadow shimmers once
//   riddle read twice, no help   the inscription brightens    · a key word whispered             · the plain answer

export interface HintCues {
  glowFigure: (fig: number, seconds: number) => void;
  markAngle: (fig: number, seconds: number) => void;
  leanFlame: (x: number, z: number, seconds: number) => void;
  emberPath: (x: number, z: number, seconds: number) => void;
  outlineWrong: (seconds: number) => void;
  coldBreeze: (seconds: number) => void;
  glintBrazier: (i: number, seconds: number) => void;
}

const COOLDOWN = 90;
const STUCK = 180;

export class Hints {
  private tier: Record<HintTrigger, number> = { stuck: 0, failed: 0, ash: 0, caught: 0, word: 0, riddle: 0 };
  private next: Record<HintTrigger, number> = { stuck: STUCK, failed: 0, ash: 0, caught: 0, word: 0, riddle: 0 };
  private t = 0;
  private lastProgress = 0;
  private fails = 0;
  private riddleReads = 0;
  private askN = 0;
  private hud: StillHud;
  private cues: HintCues;
  private city: () => City;

  constructor(hud: StillHud, city: () => City, cues: HintCues) {
    this.hud = hud;
    this.city = city;
    this.cues = cues;
  }

  reset(): void {
    this.t = 0;
    this.lastProgress = 0;
    this.fails = 0;
    this.riddleReads = 0;
    for (const k of Object.keys(this.tier) as HintTrigger[]) {
      this.tier[k] = 0;
      this.next[k] = k === 'stuck' ? STUCK : 0;
    }
  }

  /** Progress resets the puzzle hints (and the stuck clock). */
  progress(): void {
    this.lastProgress = this.t;
    this.tier.stuck = this.tier.failed = this.tier.riddle = 0;
    this.next.stuck = this.t + STUCK;
    this.fails = 0;
    this.riddleReads = 0;
  }
  failed(): void {
    this.fails++;
  }
  caught(): void {
    /* read from the sim's caughtRun */
  }
  riddleRead(_puzzle?: string): void {
    this.riddleReads++;
  }

  private get maxTier(): number {
    return save.hints === 'off' ? 0 : save.hints === 'gentle' ? 1 : 3;
  }

  /** In a chase nothing is hinted: no whisper should cost a player their run. */
  private get calm(): boolean {
    const c = this.city();
    const w = c.s.wrong;
    return !(w.on && !w.gone && w.dist < 9) && !c.flag('collapse') && c.s.status === 'play' && !c.s.ghost;
  }

  private give(trig: HintTrigger, tier: number): void {
    const c = this.city();
    const d = c.d;
    const line: Line = HINTS[trig][tier - 1];
    this.hud.say(line);
    const key = this.keyFigure();
    switch (trig) {
      case 'stuck':
        if (tier === 1 && key >= 0) this.cues.glowFigure(key, 6);
        if (tier === 2 && key >= 0) this.cues.leanFlame(d.figures[key].x, d.figures[key].z, 5);
        if (tier === 3 && key >= 0) this.cues.markAngle(key, 8);
        break;
      case 'failed':
        if (tier === 1 && key >= 0) this.cues.glowFigure(key, 2);
        if (tier === 2 && key >= 0) this.cues.leanFlame(d.figures[key].light[0], d.figures[key].light[2], 5);
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
        break;
    }
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
    return c.d.figures.findIndex((f, i) => f.word !== undefined && !c.s.words[f.word] && c.present(i) && Math.hypot(f.x - b.x, f.z - b.z) < 10);
  }

  private bump(trig: HintTrigger, condition: boolean): void {
    if (!condition || this.t < this.next[trig] || this.tier[trig] >= this.maxTier) return;
    this.tier[trig]++;
    this.next[trig] = this.t + COOLDOWN;
    this.give(trig, this.tier[trig]);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.maxTier === 0 || !this.calm) return;
    const c = this.city();
    this.bump('failed', this.fails >= 3);
    this.bump('ash', c.s.ash <= 1);
    this.bump('caught', c.s.caughtRun >= 2);
    this.bump('riddle', this.riddleReads >= 2 && this.t - this.lastProgress > 60);
    this.bump('word', this.nearWord() >= 0 && this.t - this.lastProgress > 120);
    this.bump('stuck', this.t - this.lastProgress >= STUCK);
  }

  /** H: ask the flame. It answers with the district's own puzzle whispers, then the next stuck tier. */
  ask(): void {
    if (save.hints === 'off') {
      this.hud.note('Hints are off (Esc to change).');
      return;
    }
    const list = PUZZLE_WHISPERS[this.city().d.id] ?? [];
    if (this.askN < list.length) {
      this.hud.say(list[this.askN++]);
      return;
    }
    if (this.tier.stuck < this.maxTier) {
      this.tier.stuck++;
      this.give('stuck', this.tier.stuck);
    } else this.hud.say(list[this.askN++ % Math.max(1, list.length)]);
  }
}
