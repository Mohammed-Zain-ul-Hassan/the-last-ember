import type { BackgroundMusic } from './BackgroundMusic';
import type { SoundSynth } from './SoundSynth';

export type VoiceForm = 'runner' | 'shadow';
export type VoiceEvent = 'swap' | 'recall' | 'throw' | 'dual';

type Manifest = Partial<Record<VoiceForm, Partial<Record<VoiceEvent, string[]>>>>;

/** Seconds between lines of the same form/event. */
const COOLDOWN: Record<VoiceEvent, number> = { swap: 0, recall: 2, throw: 4, dual: 3 };
/** Chance a line plays at all, so frequent events don't bark every time. */
const CHANCE: Record<VoiceEvent, number> = { swap: 1, recall: 1, throw: 0.4, dual: 1 };
/** A dual line this recent drowns out the single-throw bark. */
const DUAL_SUPPRESS = 0.3;

/**
 * Character barks (ElevenLabs clips from public/vo, see scripts/fetch-vo.mjs). Raw files are
 * fetched up front and decoded on the SoundSynth context once it exists. One line at a time;
 * the runner plays dry, the wraith through a dark lowpass with a short reverb tail.
 */
export class VoiceLines {
  /** Lines started (playtest metering). */
  readonly stats = { played: 0, skipped: 0 };

  private raw: Map<string, ArrayBuffer> | null = null;
  private manifest: Manifest = {};
  private decoding = false;
  private readonly clips = new Map<string, AudioBuffer[]>();
  private readonly lastVariant = new Map<string, number>();
  private readonly lastPlayed = new Map<string, number>();
  private lastDual = -Infinity;
  private current: { src: AudioBufferSourceNode; gain: GainNode; event: VoiceEvent } | null = null;
  private buses: Record<VoiceForm, AudioNode> | null = null;
  private music: BackgroundMusic | null = null;

  constructor(private readonly sound: SoundSynth) {
    void this.fetchRaw();
    // The context only exists after the overlay click unlocks audio; decode right after that.
    const kick = (): void => {
      setTimeout(() => {
        this.decode();
        if (!this.decoding) return;
        window.removeEventListener('pointerdown', kick);
        window.removeEventListener('keydown', kick);
      }, 0);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
  }

  /** Soft-duck the ambient bed while a bark is playing. */
  bindMusic(music: BackgroundMusic): void {
    this.music = music;
  }

  play(form: VoiceForm, event: VoiceEvent): void {
    this.decode();
    const audio = this.sound.audio;
    if (!audio || audio.ctx.state !== 'running') return;
    const { ctx } = audio;
    const now = ctx.currentTime;
    const key = `${form}:${event}`;

    if (event === 'dual') this.lastDual = now;
    if (event === 'throw' && now - this.lastDual < DUAL_SUPPRESS) return;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < COOLDOWN[event]) return;
    const variants = this.clips.get(key);
    if (!variants?.length) return;

    if (this.current) {
      if (event === 'swap' && this.current.event === 'throw') this.stopCurrent(ctx, 0.05);
      else {
        this.stats.skipped++;
        return;
      }
    }
    if (Math.random() >= CHANCE[event]) return;

    const last = this.lastVariant.get(key) ?? -1;
    let n = Math.floor(Math.random() * variants.length);
    if (variants.length > 1 && n === last) n = (n + 1 + Math.floor(Math.random() * (variants.length - 1))) % variants.length;
    this.lastVariant.set(key, n);
    this.lastPlayed.set(key, now);

    const src = ctx.createBufferSource();
    src.buffer = variants[n];
    const gain = ctx.createGain();
    src.connect(gain).connect(this.bus(ctx, audio.master)[form]);
    src.start(now);
    const line = { src, gain, event };
    src.onended = () => {
      if (this.current === line) {
        this.current = null;
        this.music?.duck(false);
      }
    };
    this.current = line;
    this.music?.duck(true);
    this.stats.played++;
  }

  private stopCurrent(ctx: AudioContext, fade: number): void {
    if (!this.current) return;
    const { src, gain } = this.current;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + fade);
    src.stop(t + fade + 0.01);
    this.current = null;
    this.music?.duck(false);
  }

  /** Per-form processing chains into the master bus, built once. */
  private bus(ctx: AudioContext, master: GainNode): Record<VoiceForm, AudioNode> {
    if (this.buses) return this.buses;
    const runner = ctx.createGain();
    runner.gain.value = 0.85;
    runner.connect(master);

    const shadow = ctx.createBiquadFilter();
    shadow.type = 'lowpass';
    shadow.frequency.value = 5500;
    shadow.Q.value = 0.6;
    const dry = ctx.createGain();
    dry.gain.value = 0.9;
    shadow.connect(dry).connect(master);
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 0.9, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    shadow.connect(verb).connect(wet).connect(master);

    this.buses = { runner, shadow };
    return this.buses;
  }

  /** Stereo exponentially decaying noise: a short, dark room tail. */
  private impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private async fetchRaw(): Promise<void> {
    try {
      const res = await fetch('/vo/manifest.json');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      this.manifest = (await res.json()) as Manifest;
    } catch (err) {
      console.warn('[VoiceLines] no voice manifest, lines disabled:', err);
      this.raw = new Map();
      return;
    }
    const raw = new Map<string, ArrayBuffer>();
    const urls = Object.values(this.manifest).flatMap((events) => Object.values(events ?? {}).flat());
    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          raw.set(url, await res.arrayBuffer());
        } catch (err) {
          console.warn(`[VoiceLines] failed to load ${url}:`, err);
        }
      }),
    );
    this.raw = raw;
    this.decode();
  }

  private decode(): void {
    const ctx = this.sound.audio?.ctx;
    if (this.decoding || !this.raw || !ctx) return;
    this.decoding = true;
    const raw = this.raw;
    this.raw = null;
    for (const [form, events] of Object.entries(this.manifest)) {
      for (const [event, urls] of Object.entries(events ?? {})) {
        const key = `${form}:${event}`;
        for (const url of urls ?? []) {
          const bytes = raw.get(url);
          if (!bytes) continue;
          ctx.decodeAudioData(bytes).then(
            (buf) => {
              const list = this.clips.get(key) ?? [];
              list.push(buf);
              this.clips.set(key, list);
            },
            (err) => console.warn(`[VoiceLines] failed to decode ${url}:`, err),
          );
        }
      }
    }
  }
}
