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
const INTENSITY_FADE = 0.85;
/** Crossfade window before the end of each buffer play. */
const CROSSFADE = 1.8;
/** Intensity at/above this uses combat exclusively; below uses ambient only. */
const COMBAT_THRESHOLD = 0.5;

type BedId = 'ambient' | 'combat';

/**
 * Dual looping beds from /music/ambient.mp3 and /music/combat.mp3.
 * Only one bed is audible at a time (hard switch with a short crossfade).
 * Intensity ≥ 0.5 → combat; otherwise ambient. Soft-ducks under voice; settings scale the bus.
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
  private ambientSources: AudioBufferSourceNode[] = [];
  private combatSources: AudioBufferSourceNode[] = [];
  private activeBed: BedId = 'ambient';
  private stopQuietTimer: ReturnType<typeof setTimeout> | null = null;
  private ambientFetchDone = false;
  private combatFetchDone = false;

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
   * Switch ambient↔combat (0 = ambient only, 1 = combat only).
   * Mid values snap at 0.5 — beds never sit mixed. No-ops when the
   * exclusive mode is unchanged so WaveDirector can spam this each frame.
   */
  setIntensity(n: number): void {
    this.intensity = Math.min(1, Math.max(0, n));
    const want = this.desiredBed();
    if (this.started && want === this.activeBed) return;
    this.applyExclusive(INTENSITY_FADE);
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

  private desiredBed(): BedId {
    return this.intensity >= COMBAT_THRESHOLD ? 'combat' : 'ambient';
  }

  private applyExclusive(fadeSec: number): void {
    const audio = this.sound.audio;
    if (!audio || !this.ambientGain || !this.combatGain) return;

    const want = this.desiredBed();
    const switching = want !== this.activeBed;
    if (switching) {
      this.activeBed = want;
      this.ensureBedPlaying(want);
    }

    const t = audio.ctx.currentTime;
    const fade = Math.max(0.01, fadeSec);
    const ambTarget = want === 'ambient' ? 1 : 0.0001;
    const comTarget = want === 'combat' ? 1 : 0.0001;
    for (const [node, target] of [
      [this.ambientGain, ambTarget],
      [this.combatGain, comTarget],
    ] as const) {
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(target, t + fade);
    }

    if (this.stopQuietTimer) clearTimeout(this.stopQuietTimer);
    const quiet: BedId = want === 'ambient' ? 'combat' : 'ambient';
    this.stopQuietTimer = setTimeout(() => {
      this.stopQuietTimer = null;
      if (this.activeBed === want) this.stopBed(quiet);
    }, fade * 1000 + 40);
  }

  private ensureBedPlaying(bed: BedId): void {
    const buf = bed === 'ambient' ? this.ambientBuffer : this.combatBuffer;
    const timer = bed === 'ambient' ? this.ambientTimer : this.combatTimer;
    const sources = bed === 'ambient' ? this.ambientSources : this.combatSources;
    if (!buf || !this.started) return;
    if (timer !== null || sources.length > 0) return;
    this.scheduleLayer(bed, 0);
  }

  private stopBed(bed: BedId): void {
    if (bed === 'ambient') {
      if (this.ambientTimer) clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
      for (const src of this.ambientSources) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
      this.ambientSources.length = 0;
    } else {
      if (this.combatTimer) clearTimeout(this.combatTimer);
      this.combatTimer = null;
      for (const src of this.combatSources) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
      this.combatSources.length = 0;
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
    } finally {
      if (bed === 'ambient') this.ambientFetchDone = true;
      else this.combatFetchDone = true;
      // Late decode if start() already raced ahead of this fetch.
      if (this.started) void this.decodeMissing().then(() => this.ensureBedPlaying(this.activeBed));
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
      this.activeBed = this.desiredBed();
      this.ambientGain.gain.value = this.activeBed === 'ambient' ? 1 : 0.0001;
      this.combatGain.gain.value = this.activeBed === 'combat' ? 1 : 0.0001;
      this.ambientGain.connect(this.duckBus);
      this.combatGain.connect(this.duckBus);

      this.started = true;
      this.starting = false;
      this.ensureBedPlaying(this.activeBed);

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
    // Wait for AudioContext + both fetches (or timeout) so one bed can't win the race alone.
    for (let i = 0; i < 80; i++) {
      const audioReady = !!this.sound.audio;
      const fetchesDone = this.ambientFetchDone && this.combatFetchDone;
      const haveAny = !!(this.ambientRaw || this.combatRaw || this.ambientBuffer || this.combatBuffer);
      if (audioReady && (fetchesDone || (haveAny && i > 20))) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await this.decodeMissing();
  }

  private async decodeMissing(): Promise<void> {
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
    // Don't keep scheduling a bed that is no longer active.
    if (bed !== this.activeBed) return;
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

    const bag = bed === 'ambient' ? this.ambientSources : this.combatSources;
    bag.push(src);
    src.onended = () => {
      const i = bag.indexOf(src);
      if (i >= 0) bag.splice(i, 1);
    };

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
