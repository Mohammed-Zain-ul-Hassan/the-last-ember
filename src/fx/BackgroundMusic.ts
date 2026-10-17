import type { SoundSynth } from './SoundSynth';

const TRACK_URL = '/music/ambient.mp3';
/** Steady bed level — keep SFX/VO in front. */
const BED_GAIN = 0.15;
/** Level while a voice line is playing. */
const DUCK_GAIN = 0.09;
const FADE_IN = 2;
const DUCK_ATTACK = 0.12;
const DUCK_RELEASE = 0.4;
/** Crossfade window before the end of each buffer play. */
const CROSSFADE = 1.8;

/**
 * Looping dark-ambient bed from /music/ambient.mp3. Prefetches raw bytes, decodes
 * on the SoundSynth context after unlock, and crossfades overlaps so imperfect
 * Freesound loops don't click. Soft-ducks under voice lines.
 */
export class BackgroundMusic {
  private raw: ArrayBuffer | null = null;
  private buffer: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private started = false;
  private starting = false;
  private ducking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sound: SoundSynth) {
    void this.fetchRaw();
  }

  /** Begin looping after AudioContext unlock. Safe to call more than once. */
  start(): void {
    if (this.started || this.starting) return;
    this.starting = true;
    void this.begin();
  }

  /** Soft-duck the bed under a voice line; restore when `active` is false. */
  duck(active: boolean): void {
    this.ducking = active;
    const audio = this.sound.audio;
    if (!audio || !this.bus) return;
    const t = audio.ctx.currentTime;
    const target = active ? DUCK_GAIN : BED_GAIN;
    const ramp = active ? DUCK_ATTACK : DUCK_RELEASE;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(target, t + ramp);
  }

  private async fetchRaw(): Promise<void> {
    try {
      const res = await fetch(TRACK_URL);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      this.raw = await res.arrayBuffer();
    } catch (err) {
      console.warn('[BackgroundMusic] failed to load ambient track:', err);
      this.raw = null;
    }
  }

  private async begin(): Promise<void> {
    try {
      await this.ensureDecoded();
      const audio = this.sound.audio;
      if (!audio || !this.buffer) {
        this.starting = false;
        return;
      }
      const { ctx, master } = audio;
      // unlock() resumes without awaiting; wait here so we don't bail while suspended.
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state !== 'running') {
        this.starting = false;
        return;
      }
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.0001;
      this.bus.connect(master);
      this.started = true;
      this.starting = false;
      this.scheduleLayer(0);
      const t = ctx.currentTime;
      this.bus.gain.setValueAtTime(0.0001, t);
      this.bus.gain.linearRampToValueAtTime(this.ducking ? DUCK_GAIN : BED_GAIN, t + FADE_IN);
    } catch (err) {
      console.warn('[BackgroundMusic] failed to start:', err);
      this.starting = false;
    }
  }

  private async ensureDecoded(): Promise<void> {
    if (this.buffer) return;
    // Wait briefly for unlock + prefetch if start() races either.
    for (let i = 0; i < 40 && (!this.sound.audio || !this.raw); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const ctx = this.sound.audio?.ctx;
    if (!ctx || !this.raw) return;
    const copy = this.raw.slice(0);
    this.raw = null;
    this.buffer = await ctx.decodeAudioData(copy);
  }

  private scheduleLayer(delay: number): void {
    const audio = this.sound.audio;
    if (!audio || !this.buffer || !this.bus || !this.started) return;
    const { ctx } = audio;
    const buf = this.buffer;
    const when = ctx.currentTime + Math.max(0, delay);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain).connect(this.bus);

    const fade = Math.min(CROSSFADE, buf.duration * 0.25);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(1, when + fade);
    const end = when + buf.duration;
    gain.gain.setValueAtTime(1, end - fade);
    gain.gain.linearRampToValueAtTime(0.0001, end);

    src.start(when);
    src.stop(end + 0.05);

    const nextIn = Math.max(0, (buf.duration - fade) * 1000);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scheduleLayer(0);
    }, nextIn);
  }
}
