/**
 * Procedural sound effects via Web Audio. No audio files are loaded.
 * The AudioContext is created lazily on the first user gesture (autoplay policy).
 */
export class SoundSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Call from a user gesture (click) to create/resume the context. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 1.5);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Ascending sawtooth sweep + bandpassed white-noise whoosh. */
  recallStart(duration = 0.8): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(2400, t + duration);
    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(1200, t);
    oscFilter.frequency.exponentialRampToValueAtTime(6000, t + duration);
    const oscGain = this.envelope(ctx, t, 0.02, duration, 0.18);
    osc.connect(oscFilter).connect(oscGain).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.5;
    band.frequency.setValueAtTime(400, t);
    band.frequency.exponentialRampToValueAtTime(4000, t + duration);
    const noiseGain = this.envelope(ctx, t, 0.08, duration, 0.35);
    noise.connect(band).connect(noiseGain).connect(out);
    noise.start(t);
    noise.stop(t + duration + 0.05);
  }

  /** Digital lock-in chime: 880Hz -> 220Hz exponential drop with a click transient. */
  recallLand(): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.35);
    const g = this.envelope(ctx, t, 0.005, 0.4, 0.4);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.45);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(440, t);
    sub.frequency.exponentialRampToValueAtTime(110, t + 0.3);
    const sg = this.envelope(ctx, t, 0.005, 0.3, 0.25);
    sub.connect(sg).connect(out);
    sub.start(t);
    sub.stop(t + 0.35);

    // Short click transient.
    const click = ctx.createBufferSource();
    click.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const cg = this.envelope(ctx, t, 0.001, 0.03, 0.4);
    click.connect(hp).connect(cg).connect(out);
    click.start(t);
    click.stop(t + 0.05);
  }

  /** High-tech dual chime E5 -> B5. */
  cooldownReady(): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    this.blip(ctx, out, 659.25, t, 0.14, 0.22);
    this.blip(ctx, out, 987.77, t + 0.09, 0.2, 0.22);
  }

  /** Subtle low-to-mid sine puff. */
  jump(): void {
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);
    const g = this.envelope(ctx, t, 0.01, 0.14, 0.12);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.master };
  }

  private blip(ctx: AudioContext, out: AudioNode, freq: number, t: number, len: number, vol: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    const harm = ctx.createOscillator();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(freq * 2, t);
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    const g = this.envelope(ctx, t, 0.004, len, vol);
    osc.connect(g);
    harm.connect(hg).connect(g);
    g.connect(out);
    osc.start(t);
    harm.start(t);
    osc.stop(t + len + 0.05);
    harm.stop(t + len + 0.05);
  }

  /** Attack/decay gain envelope ending near silence at t + length. */
  private envelope(ctx: AudioContext, t: number, attack: number, length: number, peak: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    return g;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
