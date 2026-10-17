/**
 * Procedural sound effects via Web Audio. No audio files are loaded.
 * The AudioContext is created lazily on the first user gesture (autoplay policy).
 */
export class SoundSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private slideLoop: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private analyser: AnalyserNode | null = null;
  private drift: { src: AudioBufferSourceNode; band: BiquadFilterNode; gain: GainNode; level: number } | null = null;
  /** Event counts (playtest metering). */
  readonly stats = { footsteps: 0, lands: 0, slides: 0, throws: 0, impacts: 0, dummyHits: 0, fizzles: 0, refusals: 0, shifts: 0 };
  private chargeHum: { osc: OscillatorNode; noise: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

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

  /**
   * Soft, muffled footfall: a low thump plus a short filtered scuff. `intensity` 0..1 goes
   * from a careful walk to a full sprint; every step is slightly detuned so runs don't loop.
   */
  footstep(intensity: number): void {
    this.stats.footsteps++;
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const k = Math.min(Math.max(intensity, 0), 1);
    const vary = 0.9 + Math.random() * 0.2;

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime((95 + 45 * k) * vary, t);
    thump.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    const tg = this.envelope(ctx, t, 0.004, 0.09 + 0.03 * k, 0.05 + 0.11 * k);
    thump.connect(tg).connect(out);
    thump.start(t);
    thump.stop(t + 0.15);

    const scuff = ctx.createBufferSource();
    scuff.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (700 + 1500 * k) * vary;
    band.Q.value = 0.9;
    const sg = this.envelope(ctx, t, 0.003, 0.04 + 0.04 * k, 0.025 + 0.07 * k);
    scuff.connect(band).connect(sg).connect(out);
    scuff.start(t, Math.random() * 1.2);
    scuff.stop(t + 0.1);
  }

  /** Heavier double thud for touchdown after a fall; `impact` is the fall speed in m/s. */
  land(impact: number): void {
    this.stats.lands++;
    const k = Math.min(Math.max((impact - 3) / 11, 0), 1);
    this.footstep(0.6 + 0.4 * k);
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    const g = this.envelope(ctx, t, 0.006, 0.22, 0.08 + 0.14 * k);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Starts the slide: a scrape transient, then a looping scrape driven by setSlideSpeed(). */
  startSlide(): void {
    this.stats.slides++;
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    this.stopSlide();
    const { ctx, out } = audio;
    const t = ctx.currentTime;

    const burst = ctx.createBufferSource();
    burst.buffer = this.noiseBuffer;
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.setValueAtTime(2600, t);
    bf.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const bg = this.envelope(ctx, t, 0.01, 0.28, 0.24);
    burst.connect(bf).connect(bg).connect(out);
    burst.start(t);
    burst.stop(t + 0.3);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    src.connect(filter).connect(gain).connect(out);
    src.start(t, Math.random() * 1.2);
    this.slideLoop = { src, filter, gain };
  }

  /** Scrape follows the slide speed: duller and quieter as it slows. */
  setSlideSpeed(speed: number): void {
    if (!this.slideLoop || !this.ctx) return;
    const k = Math.min(Math.max((speed - 3) / 8, 0), 1);
    const t = this.ctx.currentTime;
    this.slideLoop.filter.frequency.setTargetAtTime(350 + 1500 * k, t, 0.05);
    this.slideLoop.gain.gain.setTargetAtTime(0.06 + 0.16 * k, t, 0.05);
  }

  stopSlide(): void {
    if (!this.slideLoop || !this.ctx) return;
    const { src, gain } = this.slideLoop;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.06);
    src.stop(t + 0.4);
    this.slideLoop = null;
  }

  /** Low, rising hum while a shadowball gathers in the hand. */
  startCharge(): void {
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    this.stopCharge();
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.15);
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    osc.connect(filter);
    noise.connect(ng).connect(filter);
    filter.connect(gain).connect(out);
    osc.start(t);
    noise.start(t, Math.random());
    this.chargeHum = { osc, noise, filter, gain };
  }

  setCharge(charge: number): void {
    if (!this.chargeHum || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.chargeHum.osc.frequency.setTargetAtTime(55 + 55 * charge, t, 0.05);
    this.chargeHum.filter.frequency.setTargetAtTime(220 + 900 * charge, t, 0.05);
    this.chargeHum.gain.gain.setTargetAtTime(0.06 + 0.07 * charge, t, 0.05);
  }

  stopCharge(): void {
    if (!this.chargeHum || !this.ctx) return;
    const { osc, noise, gain } = this.chargeHum;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.04);
    osc.stop(t + 0.3);
    noise.stop(t + 0.3);
    this.chargeHum = null;
  }

  /** Throw: a dark whoosh, deeper and longer for charged balls. */
  throwBall(charge: number): void {
    this.stats.throws++;
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const len = 0.22 + 0.2 * charge;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(1600 - 700 * charge, t);
    band.frequency.exponentialRampToValueAtTime(260, t + len);
    const g = this.envelope(ctx, t, 0.015, len, 0.16 + 0.1 * charge);
    src.connect(band).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200 - 80 * charge, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + len);
    const og = this.envelope(ctx, t, 0.01, len, 0.08 + 0.08 * charge);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }

  /** Impact: a muffled boom with a noise tail; charged balls hit much harder. */
  impact(charge: number, distance: number): void {
    this.stats.impacts++;
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const near = 1 / (1 + distance * 0.08);
    const len = 0.35 + 0.45 * charge;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110 - 30 * charge, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + len);
    const og = this.envelope(ctx, t, 0.005, len, (0.18 + 0.2 * charge) * near);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.05);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + len);
    const ng = this.envelope(ctx, t, 0.003, len, (0.12 + 0.12 * charge) * near);
    src.connect(lp).connect(ng).connect(out);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }

  /** A padded thock layered on impacts that land on a training dummy. */
  dummyHit(): void {
    this.stats.dummyHits++;
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = this.envelope(ctx, t, 0.002, 0.1, 0.12);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** A spell let go before it was charged: a short hiss. */
  fizzle(): void {
    this.stats.fizzles++;
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = this.envelope(ctx, t, 0.005, 0.18, 0.05);
    src.connect(hp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.22);
  }

  /** Not enough magicka: a dull, low double knock. */
  noMagicka(): void {
    this.stats.refusals++;
    const audio = this.ready();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    for (const dt of [0, 0.09]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(130, t + dt);
      const g = this.envelope(ctx, t + dt, 0.004, 0.08, 0.09);
      osc.connect(g).connect(out);
      osc.start(t + dt);
      osc.stop(t + dt + 0.1);
    }
  }

  /**
   * Form shift. Into shadow: a deep, inhaled whoosh that drops in pitch.
   * Back to the runner: a bright rising chime.
   */
  formShift(toShadow: boolean): void {
    this.stats.shifts++;
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const len = 0.6;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.6;
    band.frequency.setValueAtTime(toShadow ? 1800 : 300, t);
    band.frequency.exponentialRampToValueAtTime(toShadow ? 140 : 2600, t + len);
    const g = this.envelope(ctx, t, 0.08, len, 0.2);
    src.connect(band).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.05);

    const osc = ctx.createOscillator();
    osc.type = toShadow ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(toShadow ? 160 : 440, t);
    osc.frequency.exponentialRampToValueAtTime(toShadow ? 40 : 990, t + len);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = toShadow ? 500 : 4000;
    const og = this.envelope(ctx, t, 0.03, len, toShadow ? 0.14 : 0.07);
    osc.connect(lp).connect(og).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }

  /**
   * The wraith gliding: a soft, breathy cloak rustle that swells with speed.
   * Pass a negative speed to fade it out.
   */
  setDrift(speed: number): void {
    const audio = this.ready();
    if (!audio || !this.noiseBuffer) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    if (speed < 0) {
      if (this.drift) {
        this.drift.gain.gain.setTargetAtTime(0.0001, t, 0.15);
        if (this.drift.level > 0) this.drift.level = 0;
      }
      return;
    }
    if (!this.drift) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.7;
      band.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(band).connect(gain).connect(out);
      src.start(t, Math.random());
      this.drift = { src, band, gain, level: 0 };
    }
    const k = Math.min(Math.max(speed / 4.6, 0), 1);
    // A slow "breath" swell on top of the motion.
    const breath = 0.5 + 0.5 * Math.sin(t * 1.3);
    this.drift.level = 0.006 + 0.05 * k + 0.008 * breath;
    this.drift.gain.gain.setTargetAtTime(this.drift.level, t, 0.12);
    this.drift.band.frequency.setTargetAtTime(380 + 700 * k + 120 * breath, t, 0.12);
  }

  /** Current wraith-drift level (playtest metering). */
  get driftLevel(): number {
    return this.drift?.level ?? 0;
  }

  /** Taps the master bus (playtest metering). */
  meter(): AnalyserNode | null {
    if (!this.ctx || !this.master) return null;
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(this.analyser);
    }
    return this.analyser;
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
