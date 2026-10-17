import type { SoundSynth } from './SoundSynth';

const AMBIENT_URL = '/music/ambient.mp3';
const COMBAT_URL = '/music/combat.mp3';
/** Steady bed level — audible under exploration; SFX/VO still sit in front. */
const BED_GAIN = 0.42;
/** Level while a voice line is playing — present, not muted. */
const DUCK_GAIN = 0.22;
const FADE_IN = 2;
const DUCK_ATTACK = 0.12;
const DUCK_RELEASE = 0.4;
/** Crossfade between ambient and combat beds. */
const INTENSITY_FADE = 1.5;
/** Crossfade window before the end of each buffer play. */
const CROSSFADE = 1.8;

type BedId = 'ambient' | 'combat';

/**
 * Dual looping beds from /music/ambient.mp3 and /music/combat.mp3.
 * Prefetches raw bytes, decodes on the SoundSynth context after unlock, and
 * crossfades overlaps so imperfect Freesound loops don't click. Intensity
 * crossfades ambient↔combat; soft-ducks under voice lines; settings scale the bus.
 */
export class BackgroundMusic {
  private ambientRaw: ArrayBuffer | null = null;
  private combatRaw: ArrayBuffer | null = null;
  private ambientBuffer: AudioBuffer | null = null;
  private combatBuffer: AudioBuffer | null = null;
  /** Settings volume (0..1) on the music bus. */
  private volumeBus: GainNode | null = null;
  /** Duck / fade-in peak (BED_GAIN or DUCK_GAIN). */
  private duckBus: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private combatGain: GainNode | null = null;
  private started = false;
  private starting = false;
  private ducking = false;
  private intensity = 0;
  private musicVolume = 1;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;
  private combatTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sound: SoundSynth) {
    void this.fetchRaw(AMBIENT_URL, 'ambient');
    void this.fetchRaw(COMBAT_URL, 'combat');
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
    if (!audio || !this.duckBus) return;
    const t = audio.ctx.currentTime;
    const target = active ? DUCK_GAIN : BED_GAIN;
    const ramp = active ? DUCK_ATTACK : DUCK_RELEASE;
    this.duckBus.gain.cancelScheduledValues(t);
    this.duckBus.gain.setValueAtTime(this.duckBus.gain.value, t);
    this.duckBus.gain.linearRampToValueAtTime(target, t + ramp);
  }

  /**
   * Crossfade ambient↔combat beds (0 = full ambient, 1 = full combat).
   * Safe to call before or after start().
   */
  setIntensity(n: number): void {
    this.intensity = Math.min(1, Math.max(0, n));
    this.applyIntensity(INTENSITY_FADE);
  }

  /** Scale the music bus for settings (0..1). Independent of duck/intensity. */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    const audio = this.sound.audio;
    if (!audio || !this.volumeBus) return;
    const t = audio.ctx.currentTime;
    this.volumeBus.gain.cancelScheduledValues(t);
    this.volumeBus.gain.setValueAtTime(this.volumeBus.gain.value, t);
    this.volumeBus.gain.linearRampToValueAtTime(Math.max(0.0001, this.musicVolume), t + 0.08);
  }

  private applyIntensity(fadeSec: number): void {
    const audio = this.sound.audio;
    if (!audio || !this.ambientGain || !this.combatGain) return;
    const t = audio.ctx.currentTime;
    const amb = Math.max(0.0001, 1 - this.intensity);
    const com = Math.max(0.0001, this.intensity);
    for (const [node, target] of [
      [this.ambientGain, amb],
      [this.combatGain, com],
    ] as const) {
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(target, t + Math.max(0.01, fadeSec));
    }
  }

  private async fetchRaw(url: string, bed: BedId): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = await res.arrayBuffer();
      if (bed === 'ambient') this.ambientRaw = buf;
      else this.combatRaw = buf;
    } catch (err) {
      console.warn(`[BackgroundMusic] failed to load ${bed} track:`, err);
      if (bed === 'ambient') this.ambientRaw = null;
      else this.combatRaw = null;
    }
  }

  private async begin(): Promise<void> {
    try {
      await this.ensureDecoded();
      const audio = this.sound.audio;
      if (!audio || (!this.ambientBuffer && !this.combatBuffer)) {
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

      this.volumeBus = ctx.createGain();
      this.volumeBus.gain.value = Math.max(0.0001, this.musicVolume);
      this.volumeBus.connect(master);

      this.duckBus = ctx.createGain();
      this.duckBus.gain.value = 0.0001;
      this.duckBus.connect(this.volumeBus);

      this.ambientGain = ctx.createGain();
      this.combatGain = ctx.createGain();
      this.ambientGain.gain.value = Math.max(0.0001, 1 - this.intensity);
      this.combatGain.gain.value = Math.max(0.0001, this.intensity);
      this.ambientGain.connect(this.duckBus);
      this.combatGain.connect(this.duckBus);

      this.started = true;
      this.starting = false;
      if (this.ambientBuffer) this.scheduleLayer('ambient', 0);
      if (this.combatBuffer) this.scheduleLayer('combat', 0);

      const t = ctx.currentTime;
      this.duckBus.gain.setValueAtTime(0.0001, t);
      this.duckBus.gain.linearRampToValueAtTime(
        this.ducking ? DUCK_GAIN : BED_GAIN,
        t + FADE_IN,
      );
    } catch (err) {
      console.warn('[BackgroundMusic] failed to start:', err);
      this.starting = false;
    }
  }

  private async ensureDecoded(): Promise<void> {
    // Wait briefly for unlock + prefetch if start() races either.
    for (
      let i = 0;
      i < 40 && (!this.sound.audio || (!this.ambientRaw && !this.combatRaw));
      i++
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const ctx = this.sound.audio?.ctx;
    if (!ctx) return;

    if (!this.ambientBuffer && this.ambientRaw) {
      const copy = this.ambientRaw.slice(0);
      this.ambientRaw = null;
      this.ambientBuffer = await ctx.decodeAudioData(copy);
    }
    if (!this.combatBuffer && this.combatRaw) {
      const copy = this.combatRaw.slice(0);
      this.combatRaw = null;
      this.combatBuffer = await ctx.decodeAudioData(copy);
    }
  }

  private scheduleLayer(bed: BedId, delay: number): void {
    const audio = this.sound.audio;
    const buf = bed === 'ambient' ? this.ambientBuffer : this.combatBuffer;
    const bedGain = bed === 'ambient' ? this.ambientGain : this.combatGain;
    if (!audio || !buf || !bedGain || !this.started) return;
    const { ctx } = audio;
    const when = ctx.currentTime + Math.max(0, delay);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain).connect(bedGain);

    const fade = Math.min(CROSSFADE, buf.duration * 0.25);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(1, when + fade);
    const end = when + buf.duration;
    gain.gain.setValueAtTime(1, end - fade);
    gain.gain.linearRampToValueAtTime(0.0001, end);

    src.start(when);
    src.stop(end + 0.05);

    const nextIn = Math.max(0, (buf.duration - fade) * 1000);
    if (bed === 'ambient') {
      if (this.ambientTimer) clearTimeout(this.ambientTimer);
      this.ambientTimer = setTimeout(() => {
        this.ambientTimer = null;
        this.scheduleLayer('ambient', 0);
      }, nextIn);
    } else {
      if (this.combatTimer) clearTimeout(this.combatTimer);
      this.combatTimer = setTimeout(() => {
        this.combatTimer = null;
        this.scheduleLayer('combat', 0);
      }, nextIn);
    }
  }
}
