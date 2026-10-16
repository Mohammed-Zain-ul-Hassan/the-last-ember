// The Last Ember: procedural audio. Web Audio API only, no assets.
// One AudioContext is created lazily on unlock(); every public method is a safe no-op before that.

export type SfxName =
  | 'swing' | 'hit' | 'shadeDie' | 'shadeSpawn' | 'shadeWindup' | 'knightHurt' | 'knightDie'
  | 'dash' | 'flare' | 'ember' | 'memory' | 'bell' | 'hearthHit' | 'torchLight' | 'hearthDie'
  | 'bossRoar' | 'dawn' | 'dissolve' | 'uiMove' | 'uiSelect' | 'uiBack' | 'card';

export interface SfxOpts { variant?: number; heavy?: boolean; pan?: number; volume?: number }

export type MusicPhase = 'title' | 'dusk' | 'night' | 'torch' | 'boss' | 'dawn' | 'ending' | 'silent';

export interface GameAudio {
  /** Call on the first user gesture (keydown/pointerdown). Creates/resumes the AudioContext. Safe to call many times. */
  unlock(): void;
  readonly unlocked: boolean;
  play(name: SfxName, opts?: SfxOpts): void;
  /** 0..1 continuous fire-crackle bed loudness (follows flame size). */
  setFire(level: number): void;
  /** 0..1 danger: drives the adaptive music tension layer and, above 0.75, a slow heartbeat. Smoothed internally (~1 s). */
  setDanger(level: number): void;
  /** 0..1 amount of shades currently burning in light: a sizzle/hiss bed. */
  setBurn(level: number): void;
  setPhase(phase: MusicPhase): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** master volume 0..1 */
  setVolume(v: number): void;
  /** Duck music briefly (e.g. during hit-stop or memory text) for `seconds`. */
  duck(seconds: number): void;
}

// ---------------------------------------------------------------- constants

const BPM = 64;
const BEAT = 60 / BPM;
const EIGHTH = BEAT / 2;
const BAR = BEAT * 4;
const LOOKAHEAD = 0.2;
const TICK_MS = 50;
const MAX_VOICES = 24;

/** Minimum seconds between repeats of the same sfx. */
const RATE: Partial<Record<SfxName, number>> = {
  hit: 0.03, shadeSpawn: 0.12, ember: 0.05, swing: 0.04, shadeDie: 0.04, shadeWindup: 0.06,
  knightHurt: 0.1, dash: 0.08, hearthHit: 0.08, uiMove: 0.03, card: 0.3, bell: 0.5,
};
/** Sounds that ignore the voice cap. */
const PRIORITY = new Set<SfxName>([
  'bell', 'memory', 'dawn', 'flare', 'hearthDie', 'knightDie', 'knightHurt', 'bossRoar',
  'torchLight', 'dissolve', 'uiSelect', 'uiBack', 'card',
]);

const BELL_RATIOS = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011];
const BELL_AMPS = [0.55, 1, 0.5, 0.4, 0.45, 0.22, 0.18, 0.15];
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // D minor pentatonic steps

interface Chord { n: number[]; r: number } // MIDI pad notes, MIDI bass root
// Dm - Bb - F - C / Dm - Gm - Bb - A   (2 bars each)
const MINOR: Chord[] = [
  { n: [50, 53, 57, 62], r: 38 }, { n: [50, 53, 58, 62], r: 34 },
  { n: [48, 53, 57, 60], r: 41 }, { n: [48, 52, 55, 60], r: 36 },
  { n: [50, 53, 57, 62], r: 38 }, { n: [50, 55, 58, 62], r: 43 },
  { n: [50, 53, 58, 62], r: 34 }, { n: [49, 52, 57, 61], r: 45 },
];
// D - G - Bm - A - D(high): rising, then loops from G
const MAJOR: Chord[] = [
  { n: [50, 54, 57, 62], r: 38 }, { n: [55, 59, 62, 67], r: 43 },
  { n: [54, 59, 62, 66], r: 47 }, { n: [57, 61, 64, 69], r: 45 },
  { n: [62, 66, 69, 74], r: 50 },
];

interface PhaseCfg {
  on: boolean; drone: number; droneHz: number; pad: number; padHz: number; oct: number;
  tension: boolean; floor: number; drums: number; dis: boolean; major: boolean; bell: number;
}
const P = (c: Partial<PhaseCfg>): PhaseCfg => ({
  on: true, drone: 0.8, droneHz: 400, pad: 0.7, padHz: 1100, oct: 0,
  tension: false, floor: 0, drums: 1, dis: false, major: false, bell: 0, ...c,
});
const PHASES: Record<MusicPhase, PhaseCfg> = {
  title: P({ drone: 0.45, pad: 0.5, padHz: 900, bell: 1 }),
  dusk: P({ drone: 0.8, droneHz: 560, pad: 0.85, padHz: 1900 }),
  night: P({ drone: 0.9, pad: 0.7, padHz: 1100, tension: true, floor: 0.12 }),
  torch: P({ drone: 0.4, droneHz: 320, pad: 0.6, padHz: 1700, oct: 12, tension: true, floor: 0.15, drums: 0.85 }),
  boss: P({ drone: 1, pad: 0.75, padHz: 1000, tension: true, floor: 0.5, drums: 1.5, dis: true }),
  dawn: P({ drone: 0.6, droneHz: 520, pad: 1, padHz: 3000, major: true }),
  ending: P({ drone: 0.3, pad: 0.5, padHz: 900, bell: 0.4 }),
  silent: P({ on: false, drone: 0, pad: 0 }),
};

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const vary = (amt: number): number => 1 + (Math.random() * 2 - 1) * amt;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// ---------------------------------------------------------------- silent fallback

function silentAudio(): GameAudio {
  let muted = false;
  return {
    unlock() {}, get unlocked() { return false; }, play() {}, setFire() {}, setDanger() {}, setBurn() {},
    setPhase() {}, setMuted(m: boolean) { muted = !!m; }, get muted() { return muted; }, setVolume() {}, duck() {},
  };
}

// ---------------------------------------------------------------- engine

class Engine implements GameAudio {
  private AC: typeof AudioContext;
  private ready = false; private dead = false; private isMuted = false; private volume = 0.8;
  private fireLvl = 0; private burnLvl = 0; private danger = 0; private dangerS = 0;
  private phase: MusicPhase = 'title';
  private voices = 0;
  private last = new Map<SfxName, number>();

  // scheduler state
  private nextT = 0; private step8 = 0; private lastTick = 0;
  private barInChord = 2; private forceChord = true; private chordIdx = 0; private root = 38;

  // graph (assigned in build(), only touched once `ready`)
  private ctx!: AudioContext;
  private noiseBuf!: AudioBuffer;
  private master!: GainNode; private sfx!: GainNode; private music!: GainNode; private duckG!: GainNode; private verb!: GainNode;
  private drone!: GainNode; private droneLP!: BiquadFilterNode;
  private padIn!: GainNode; private padLP!: BiquadFilterNode; private pad!: GainNode; private tpad!: GainNode; private vib!: GainNode;
  private tension!: GainNode; private heartG!: GainNode; private mbell!: GainNode;
  private fireRoar!: GainNode; private fireHiss!: GainNode; private crackleG!: GainNode; private burnG!: GainNode;
  private distCurve: Float32Array<ArrayBuffer> | null = null;

  constructor(AC: typeof AudioContext) { this.AC = AC; }

  get unlocked(): boolean { return this.ready; }
  get muted(): boolean { return this.isMuted; }

  unlock(): void {
    try {
      if (this.dead) return;
      if (!this.ready) {
        this.ctx = new this.AC({ latencyHint: 'interactive' });
        this.build();
        this.ready = true;
        this.applyVolume();
        this.applyPhase();
        this.setFire(this.fireLvl);
        this.setBurn(this.burnLvl);
        this.nextT = this.ctx.currentTime + 0.1;
        this.lastTick = this.ctx.currentTime;
        window.setInterval(() => this.tick(), TICK_MS);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch {
      this.dead = true;
      this.ready = false;
    }
  }

  play(name: SfxName, opts?: SfxOpts): void {
    try {
      if (!this.ready || this.isMuted) return;
      const now = this.ctx.currentTime;
      const min = RATE[name];
      if (min !== undefined && now - (this.last.get(name) ?? -9) < min) return;
      if (this.voices >= MAX_VOICES && !PRIORITY.has(name)) return;
      this.last.set(name, now);
      const dur = this.sfxFor(name, opts ?? {}, now + 0.005 + Math.random() * 0.006);
      this.voices++;
      window.setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, dur * 1000);
    } catch { /* never throw into the game */ }
  }

  setFire(level: number): void {
    try {
      this.fireLvl = clamp01(level);
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.fireRoar.gain.setTargetAtTime(this.fireLvl * 0.22, t, 0.15);
      this.fireHiss.gain.setTargetAtTime(this.fireLvl * this.fireLvl * 0.05, t, 0.15);
    } catch { /* ignore */ }
  }

  setDanger(level: number): void { this.danger = clamp01(level); }

  setBurn(level: number): void {
    try {
      this.burnLvl = clamp01(level);
      if (this.ready) this.burnG.gain.setTargetAtTime(this.burnLvl * 0.12, this.ctx.currentTime, 0.12);
    } catch { /* ignore */ }
  }

  setPhase(phase: MusicPhase): void {
    try {
      if (!PHASES[phase] || phase === this.phase) return;
      if (PHASES[phase].major !== PHASES[this.phase].major) { this.chordIdx = 0; this.forceChord = true; }
      this.phase = phase;
      if (this.ready) this.applyPhase();
    } catch { /* ignore */ }
  }

  setMuted(muted: boolean): void { this.isMuted = !!muted; this.applyVolume(); }
  setVolume(v: number): void { this.volume = clamp01(v); this.applyVolume(); }

  duck(seconds: number): void {
    try {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const s = Math.min(10, Math.max(0.05, Number.isFinite(seconds) ? seconds : 0.3));
      const p = this.duckG.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.setTargetAtTime(0.35, now, 0.04);
      p.setTargetAtTime(1, now + s, 0.25);
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- graph

  private build(): void {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master = this.gain(0, ctx.destination);
    comp.connect(this.master);
    this.sfx = this.gain(0.9, comp);
    this.duckG = this.gain(1, comp);
    this.music = this.gain(0, this.duckG);

    // cheap "space": two lowpassed feedback delays
    this.verb = this.gain(1);
    const wet = this.gain(0.45, comp);
    for (const [time, fb, lp] of [[0.23, 0.38, 2600], [0.37, 0.3, 1900]] as const) {
      const dl = ctx.createDelay(1);
      dl.delayTime.value = time;
      const f = this.bq('lowpass', lp, 0.5, wet);
      const g = this.gain(fb, dl);
      this.verb.connect(dl); dl.connect(f); f.connect(g);
    }

    // drone: D1/D2 sines + detuned saws, lowpass with slow LFO
    this.drone = this.gain(0, this.music);
    this.droneLP = this.bq('lowpass', 400, 0.7, this.drone);
    const dOsc = (type: OscillatorType, f: number, det: number, amp: number): void => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      o.connect(this.gain(amp, this.droneLP)); o.start();
    };
    dOsc('sine', mtof(26), 0, 0.5); dOsc('sine', mtof(38), 0, 0.35);
    dOsc('sawtooth', mtof(38), -7, 0.1); dOsc('sawtooth', mtof(38), 6, 0.1); dOsc('sawtooth', mtof(50), 3, 0.03);
    this.lfo(0.06, 160, this.droneLP.frequency);

    // choir pad bus: lowpass + two "ah" formant peaks
    this.pad = this.gain(0, this.music);
    const padSend = this.gain(0.45, this.verb); this.pad.connect(padSend);
    const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 1150; f2.gain.value = 3; f2.Q.value = 1.5;
    f2.connect(this.pad);
    const f1 = ctx.createBiquadFilter(); f1.type = 'peaking'; f1.frequency.value = 750; f1.gain.value = 5; f1.Q.value = 1.5;
    f1.connect(f2);
    this.padLP = this.bq('lowpass', 1100, 0.5, f1);
    this.lfo(0.045, 250, this.padLP.frequency);
    this.padIn = this.gain(1, this.padLP);
    this.tpad = this.gain(0, this.padLP);
    this.vib = this.gain(5);
    this.lfo(4.8, 1, this.vib); // vib output = cents of vibrato

    this.tension = this.gain(0, this.music);
    this.heartG = this.gain(1, this.music);
    this.mbell = this.gain(0.8, this.music);
    this.mbell.connect(this.gain(0.5, this.verb));

    // fire bed + burn sizzle (looped noise at different offsets)
    this.fireRoar = this.gain(0, this.sfx);
    this.loopNoise(0.1, this.bq('lowpass', 380, 0.8, this.fireRoar));
    this.fireHiss = this.gain(0, this.sfx);
    this.loopNoise(0.7, this.bq('bandpass', 2800, 0.6, this.fireHiss));
    this.crackleG = this.gain(1, this.sfx);
    this.burnG = this.gain(0, this.sfx);
    const am = this.gain(0.6, this.burnG);
    this.lfo(11, 0.35, am.gain);
    const burnBP = this.bq('bandpass', 5200, 1.2, am);
    this.lfo(0.7, 1500, burnBP.frequency);
    this.loopNoise(1.3, burnBP);
  }

  private gain(v: number, dest?: AudioNode | AudioParam): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest instanceof AudioNode) g.connect(dest); else if (dest) g.connect(dest);
    return g;
  }

  private bq(type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    b.connect(dest);
    return b;
  }

  private lfo(rate: number, depth: number, target: AudioParam | AudioNode, t = 0, len = 0): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = rate;
    o.connect(this.gain(depth, target));
    o.start(t);
    if (len > 0) o.stop(t + len);
  }

  private loopNoise(offset: number, dest: AudioNode): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    s.connect(dest); s.start(0, offset);
  }

  private applyVolume(): void {
    try {
      if (this.ready) this.master.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    } catch { /* ignore */ }
  }

  private applyPhase(): void {
    const c = PHASES[this.phase];
    const now = this.ctx.currentTime;
    const tc = 0.6; // ~2 s crossfade
    this.music.gain.setTargetAtTime(c.on ? 0.5 : 0, now, c.on ? tc : 0.5);
    this.drone.gain.setTargetAtTime(c.drone * 0.35, now, tc);
    this.pad.gain.setTargetAtTime(c.pad * 0.5, now, tc);
    this.droneLP.frequency.setTargetAtTime(c.droneHz, now, tc);
    const pf = this.padLP.frequency;
    pf.cancelScheduledValues(now);
    pf.setValueAtTime(pf.value, now);
    if (this.phase === 'dawn') pf.linearRampToValueAtTime(c.padHz, now + 5);
    else pf.setTargetAtTime(c.padHz, now, tc);
  }

  // ---------------------------------------------------------------- primitives

  /** Gain-enveloped oscillator; returns it so callers can add pitch automation. */
  private tone(type: OscillatorType, f: number, t: number, att: number, peak: number, dec: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain();
    this.env(g.gain, t, att, peak, dec);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + att + dec * 1.2 + 0.05);
    return o;
  }

  /** Gain-enveloped noise from the shared buffer; returns the envelope gain (connect it elsewhere for parallel filters). */
  private nz(t: number, att: number, peak: number, dec: number, dest: AudioNode): GainNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    s.playbackRate.value = vary(0.05);
    const g = this.ctx.createGain();
    this.env(g.gain, t, att, peak, dec);
    s.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.9); s.stop(t + att + dec * 1.2 + 0.05);
    return g;
  }

  private env(p: AudioParam, t: number, att: number, peak: number, dec: number): void {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + Math.max(0.001, att));
    p.setTargetAtTime(0, t + Math.max(0.001, att), Math.max(0.005, dec / 5));
  }

  private thud(t: number, f0: number, f1: number, peak: number, dec: number, dest: AudioNode): void {
    const o = this.tone('sine', f0, t, 0.004, peak, dec, dest);
    o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(0.4, dec * 0.6));
  }

  private crackle(t: number, amp: number, dest: AudioNode, lo = 1500, span = 4000): void {
    this.nz(t, 0.001, amp, 0.01 + Math.random() * 0.03, this.bq('bandpass', lo + Math.random() * span, 1.5, dest));
  }

  private out(pan: number, vol: number, verb = 0): GainNode {
    const v = this.gain(vol);
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      v.connect(p); p.connect(this.sfx);
    } else v.connect(this.sfx);
    if (verb > 0) v.connect(this.gain(verb, this.verb));
    return v;
  }

  /** Choir-ish voice: two detuned saws + triangle with shared vibrato, slow attack/release. */
  private voice(t: number, midi: number, hold: number, att: number, rel: number, level: number, dest: AudioNode): void {
    const f = mtof(midi);
    hold = Math.max(hold, att);
    const v = this.gain(0, dest);
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(level, t + att);
    v.gain.setValueAtTime(level, t + hold);
    v.gain.linearRampToValueAtTime(0, t + hold + rel);
    const end = t + hold + rel + 0.05;
    for (const [type, det, amp] of [['sawtooth', -8, 0.5], ['sawtooth', 7, 0.5], ['triangle', 0, 0.8]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = det + Math.random() * 4 - 2;
      this.vib.connect(o.detune);
      o.onended = () => { try { this.vib.disconnect(o.detune); } catch { /* already gone */ } };
      o.connect(this.gain(amp, v));
      o.start(t); o.stop(end);
    }
  }

  private bell(t: number, base: number, vol: number, dest: AudioNode, len: number): void {
    BELL_RATIOS.forEach((r, i) => {
      const d = (len * 1.1) / (0.55 + r * 0.45);
      this.tone('sine', base * r * vary(0.002), t, 0.004, BELL_AMPS[i] * vol * 0.3, d, dest);
    });
    this.tone('sine', base + 0.9, t, 0.004, vol * 0.12, len, dest); // beating doublets
    this.tone('sine', base * 2 - 1.3, t, 0.004, vol * 0.08, len * 0.7, dest);
    this.nz(t, 0.001, vol * 0.5, 0.06, this.bq('bandpass', base * 6, 2, dest));
  }

  private chime(t: number, f: number, vol: number, dest: AudioNode): void {
    this.tone('sine', f, t, 0.003, 0.5 * vol, 0.9, dest);
    this.tone('sine', f * 2.76, t, 0.002, 0.12 * vol, 0.35, dest);
    this.tone('sine', f * 5.4, t, 0.001, 0.05 * vol, 0.15, dest);
    this.tone('triangle', f * 0.5, t, 0.01, 0.12 * vol, 0.6, dest);
  }

  private distortion(): Float32Array<ArrayBuffer> {
    if (!this.distCurve) this.distCurve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(((i / 1023) * 2 - 1) * 3));
    return this.distCurve;
  }

  // ---------------------------------------------------------------- sfx

  /** Filter whose frequency starts at f0 at time t, then ramps exponentially through (freq, dt) pairs. */
  private sw(type: BiquadFilterType, q: number, dest: AudioNode, t: number, f0: number, ...pts: number[]): BiquadFilterNode {
    const b = this.bq(type, f0, q, dest);
    b.frequency.setValueAtTime(f0, t);
    for (let i = 0; i + 1 < pts.length; i += 2) b.frequency.exponentialRampToValueAtTime(pts[i], t + pts[i + 1]);
    return b;
  }

  private sfxFor(name: SfxName, o: SfxOpts, t: number): number {
    const vol = o.volume ?? 1;
    const pan = o.pan ?? (Math.random() - 0.5) * 0.3;
    const r = vary(0.05);
    switch (name) {
      case 'swing': { // combo step 0/1/2; 2 is heavier and lower
        const v = Math.round(o.variant ?? 0);
        const heavy = v >= 2;
        const out = this.out(pan, (heavy ? 0.6 : 0.5) * vol);
        const dur = (heavy ? 0.3 : 0.2) * vary(0.06);
        const lo = (heavy ? 380 : 700) * r;
        const bp = this.sw('bandpass', heavy ? 1.5 : 2.5, out, t, lo, (heavy ? 2000 : 3600 + v * 500) * r, dur * 0.45, lo * 0.8, dur);
        this.nz(t, dur * 0.4, heavy ? 1 : 0.8, dur * 0.7, bp);
        if (heavy) this.thud(t, 140 * r, 55, 0.35, 0.3, out);
        return dur + 0.1;
      }
      case 'hit': { // crack + body + inharmonic metal ping + thud
        const heavy = !!o.heavy;
        const out = this.out(pan, 0.6 * vol, heavy ? 0.25 : 0.1);
        this.nz(t, 0.002, 0.8, 0.06, this.bq('highpass', 1800 * r, 0.7, out));
        this.nz(t, 0.003, 0.7, heavy ? 0.18 : 0.1, this.bq('bandpass', (heavy ? 500 : 900) * r, 1.2, out));
        const pf = (heavy ? 1700 : 2600) * vary(0.06);
        this.tone('sine', pf, t, 0.002, 0.18, heavy ? 0.35 : 0.22, out);
        this.tone('sine', pf * 1.47, t, 0.002, 0.09, 0.15, out);
        this.tone('sine', pf * 2.09, t, 0.002, 0.05, 0.1, out);
        this.thud(t, (heavy ? 150 : 200) * r, heavy ? 45 : 70, heavy ? 0.8 : 0.45, heavy ? 0.3 : 0.15, out);
        return heavy ? 0.5 : 0.3;
      }
      case 'shadeDie': { // dark hiss collapsing, then an airy rising release
        const out = this.out(pan, 0.55 * vol, 0.35);
        this.nz(t, 0.02, 1, 0.45, this.sw('bandpass', 4, out, t, 900 * r, 180, 0.4));
        this.thud(t, 120 * r, 40, 0.3, 0.3, out);
        const t2 = t + 0.22;
        this.nz(t2, 0.25, 0.35, 0.9, this.sw('bandpass', 0.8, out, t2, 2000 * r, 7000, 1));
        this.tone('sine', 880 * r, t2, 0.3, 0.05, 1, out).frequency.exponentialRampToValueAtTime(1320 * r, t2 + 1.2);
        return 1.5;
      }
      case 'shadeSpawn': { // whisper: noise through moving formants
        const out = this.out(o.pan ?? (Math.random() - 0.5) * 1.4, 0.45 * vol, 0.2);
        const dur = 0.7 * vary(0.08);
        const n = this.nz(t, dur * 0.4, 1, dur * 0.7, this.sw('bandpass', 5, out, t, 600 * r, 350, dur));
        n.connect(this.sw('bandpass', 6, out, t, 1400 * r, 2200 * r, dur));
        n.connect(this.bq('bandpass', 2600 * r, 6, out));
        return dur + 0.2;
      }
      case 'shadeWindup': { // rising hiss telegraph
        const out = this.out(pan, 0.6 * vol, 0.1);
        const dur = 0.4 * vary(0.06);
        this.nz(t, dur * 0.9, 1, 0.08, this.sw('bandpass', 3, out, t, 500 * r, 3000 * r, dur));
        this.tone('sawtooth', 110 * r, t, dur * 0.9, 0.06, 0.08, this.bq('lowpass', 1200, 1, out))
          .frequency.exponentialRampToValueAtTime(220 * r, t + dur);
        return dur + 0.1;
      }
      case 'knightHurt': { // armour thud + clank + grunt
        const out = this.out(pan, 0.7 * vol, 0.12);
        this.thud(t, 120 * r, 45, 0.9, 0.3, out);
        this.nz(t, 0.004, 0.6, 0.2, this.bq('lowpass', 400, 1, out));
        for (const k of [1, 1.34, 1.89]) this.tone('sine', 520 * r * k, t, 0.002, 0.08, 0.25, out);
        this.tone('sawtooth', 95 * r, t + 0.02, 0.02, 0.35, 0.22, this.bq('bandpass', 600, 3, out))
          .frequency.exponentialRampToValueAtTime(70, t + 0.25);
        return 0.5;
      }
      case 'knightDie': {
        const out = this.out(0, 0.75 * vol, 0.4);
        this.thud(t, 90 * r, 30, 1, 0.8, out);
        this.nz(t, 0.004, 0.7, 0.4, this.bq('lowpass', 350, 1, out));
        this.tone('sawtooth', 90 * r, t + 0.02, 0.03, 0.35, 0.5, this.bq('bandpass', 550, 3, out))
          .frequency.exponentialRampToValueAtTime(55, t + 0.5);
        [0.25, 0.45, 0.62].forEach((dt, i) => {
          for (const k of [1, 1.41, 2.13]) this.tone('sine', 480 * vary(0.08) * k, t + dt, 0.002, 0.07 / (i + 1), 0.3, out);
        });
        this.nz(t + 0.5, 0.5, 0.3, 2, this.sw('bandpass', 1.2, out, t + 0.5, 800, 150, 2));
        this.tone('sine', 73.4, t + 0.3, 0.4, 0.3, 2.5, out).frequency.exponentialRampToValueAtTime(36.7, t + 3);
        return 3.2;
      }
      case 'dash': {
        this.nz(t, 0.04, 0.9, 0.22, this.sw('bandpass', 0.9, this.out(pan, 0.75 * vol), t, 2000 * r, 450 * r, 0.22));
        return 0.35;
      }
      case 'flare': { // whoosh + boom + crackle burst
        const out = this.out(0, 0.8 * vol, 0.2);
        this.nz(t, 0.3, 0.9, 1, this.sw('lowpass', 0.8, out, t, 300, 4000 * r, 0.35, 700, 1.2));
        this.thud(t, 75 * r, 32, 1, 1, out);
        for (let i = 0; i < 22; i++) this.crackle(t + 0.05 + Math.pow(Math.random(), 1.6) * 1.1, 0.25 + Math.random() * 0.35, out);
        return 1.4;
      }
      case 'ember': { // streak climbs the pentatonic
        const idx = Math.max(0, Math.min(PENTA.length - 1, Math.round(o.variant ?? 0)));
        this.chime(t, mtof(74 + PENTA[idx]) * vary(0.004), 1, this.out(pan, 0.6 * vol, 0.4));
        return 1;
      }
      case 'memory': { // choir swell + bell
        const out = this.out(0, 0.5 * vol, 0.6);
        const lp = this.sw('lowpass', 0.7, out, t, 500, 2200, 1.6, 900, 3);
        [50, 57, 62, 65, 69].forEach((n, i) => this.voice(t + i * 0.08, n, 1.4, 1.2, 1.6, 0.12, lp));
        this.chime(t + 0.9, mtof(86), 0.8, out);
        return 3.3;
      }
      case 'bell':
        this.bell(t, 146.83 * vary(0.01), 0.55 * vol, this.out(0, 1, 0.5), 6.5);
        return 7;
      case 'hearthHit': { // sputter and choke
        const out = this.out(pan, 0.9 * vol, 0.05);
        const lp = this.sw('lowpass', 2, out, t, 2000 * r, 250, 0.3);
        const n = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) this.nz(t + k * 0.05 * vary(0.4), 0.003, 0.7 * (1 - k * 0.15), 0.05, lp);
        this.thud(t, 90 * r, 50, 0.25, 0.2, out);
        for (let k = 0; k < 4; k++) this.crackle(t + Math.random() * 0.3, 0.2, out);
        return 0.5;
      }
      case 'torchLight': { // whoomph + rising crackle
        const out = this.out(0, 0.7 * vol, 0.15);
        this.nz(t, 0.08, 0.9, 0.7, this.sw('lowpass', 1, out, t, 150, 2500 * r, 0.15, 900, 0.8));
        this.thud(t, 95 * r, 45, 0.6, 0.5, out);
        for (let i = 0; i < 18; i++) this.crackle(t + 0.2 + (i / 18) * 1.2 + Math.random() * 0.05, 0.1 + (i / 18) * 0.3, out);
        this.nz(t + 0.2, 0.8, 0.12, 0.6, this.bq('bandpass', 3000, 0.7, out));
        return 1.6;
      }
      case 'hearthDie': { // descending sigh, rumble fading, last crackles thinning
        const out = this.out(0, 0.75 * vol, 0.35);
        this.nz(t, 0.6, 0.6, 2.6, this.sw('bandpass', 1.2, out, t, 1600, 140, 2.8));
        this.tone('sine', 55, t, 0.2, 0.7, 3, out).frequency.exponentialRampToValueAtTime(30, t + 3);
        this.nz(t, 0.3, 0.5, 3, this.bq('lowpass', 120, 1, out));
        for (let i = 0; i < 10; i++) this.crackle(t + Math.pow(i / 10, 1.5) * 2.5, 0.3 * (1 - i / 10), out);
        return 3.5;
      }
      case 'bossRoar': { // detuned saws through a shaper, tremolo, noise
        const out = this.out(0, 0.8 * vol, 0.3);
        const trem = this.gain(0.65, out);
        this.lfo(7 * vary(0.08), 0.35, trem.gain, t, 2.4);
        const ws = this.ctx.createWaveShaper();
        ws.curve = this.distortion();
        ws.connect(this.sw('lowpass', 3, trem, t, 250, 900 * r, 0.5, 180, 2));
        for (const f of [41.2, 41.2 * 1.013, 55 * 0.995, 82.4 * 0.99]) {
          this.tone('sawtooth', f * r, t, 0.25, 0.3, 1.8, ws).frequency.exponentialRampToValueAtTime(f * r * 0.8, t + 2);
        }
        this.nz(t, 0.2, 0.5, 1.8, this.bq('lowpass', 600, 1, out));
        this.thud(t, 60, 28, 0.8, 1.5, out);
        return 2.4;
      }
      case 'dawn': { // D major choir rising and opening over ~5 s
        const out = this.out(0, 0.45 * vol, 0.6);
        const lp = this.bq('lowpass', 400, 0.7, out);
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.linearRampToValueAtTime(3200, t + 5);
        [50, 57, 62, 66, 69, 74].forEach((n, i) => this.voice(t + i * 0.35, n, 4.5 - i * 0.35, 2.5, 2.5, 0.1, lp));
        this.tone('triangle', mtof(81), t + 2.5, 2, 0.05, 3, out);
        return 7.5;
      }
      case 'dissolve': { // high D-major shimmer + air, fading
        const out = this.out(0, 0.4 * vol, 0.7);
        const notes = [86, 88, 90, 93, 95, 98, 100, 102];
        for (let i = 0; i < 14; i++) {
          const n = notes[Math.floor(Math.random() * notes.length)];
          this.tone('sine', mtof(n) * vary(0.004), t + i * 0.12 * vary(0.3), 0.02, 0.12 * (1 - i / 16), 1.2 + Math.random(), out);
        }
        this.nz(t, 0.4, 0.25, 2.8, this.bq('highpass', 5000, 0.7, out));
        return 3.5;
      }
      case 'uiMove': {
        const out = this.out(0, 1.1 * vol);
        this.tone('sine', 700 * vary(0.02), t, 0.002, 0.15, 0.07, out);
        this.tone('triangle', 1400, t, 0.002, 0.04, 0.04, out);
        return 0.15;
      }
      case 'uiSelect': {
        const out = this.out(0, 0.8 * vol, 0.3);
        this.tone('sine', 587.3, t, 0.003, 0.2, 0.35, out);
        this.tone('sine', 880, t + 0.07, 0.003, 0.2, 0.4, out);
        return 0.5;
      }
      case 'uiBack':
        this.tone('sine', 523, t, 0.003, 0.18, 0.18, this.out(0, 1 * vol)).frequency.exponentialRampToValueAtTime(392, t + 0.12);
        return 0.25;
      case 'card': { // soft low whoosh
        const out = this.out(0, 0.5 * vol, 0.3);
        this.nz(t, 0.45, 0.6, 0.8, this.sw('lowpass', 0.8, out, t, 180, 900, 0.5, 200, 1.1));
        this.tone('sine', 73.4, t, 0.4, 0.25, 0.9, out);
        return 1.3;
      }
      default:
        return 0.1;
    }
  }

  // ---------------------------------------------------------------- music scheduler

  private tick(): void {
    try {
      const now = this.ctx.currentTime;
      const dt = Math.min(0.5, Math.max(0, now - this.lastTick));
      this.lastTick = now;
      this.dangerS += (this.danger - this.dangerS) * (1 - Math.exp(-dt / 1.0));
      if (this.isMuted || this.ctx.state !== 'running') return;

      // fire crackle bed (Poisson-ish), plus burn pops
      let lam = this.fireLvl * 0.55;
      while (lam > 0) {
        if (Math.random() < Math.min(1, lam)) {
          const big = Math.random() < 0.05;
          const amp = (0.05 + Math.random() * 0.18) * (0.4 + 0.6 * this.fireLvl) * (big ? 2.5 : 1);
          this.crackle(now + 0.02 + Math.random() * 0.05, amp, this.crackleG, big ? 600 : 1500, big ? 1200 : 4000);
        }
        lam -= 1;
      }
      if (this.burnLvl > 0.05 && Math.random() < this.burnLvl * 0.4) {
        this.crackle(now + 0.02 + Math.random() * 0.04, 0.1 * this.burnLvl, this.crackleG, 5000, 3000);
      }

      if (this.nextT < now) this.nextT = now + 0.05; // tab was throttled: skip, don't burst
      while (this.nextT < now + LOOKAHEAD) {
        this.step(this.nextT, this.step8);
        this.nextT += EIGHTH;
        this.step8++;
      }
    } catch { /* keep ticking */ }
  }

  private step(t: number, i: number): void {
    const c = PHASES[this.phase];
    const inBar = i % 8;
    if (!c.on) { this.forceChord = true; return; }

    if (inBar === 0) {
      if (this.forceChord || this.barInChord >= 2) this.newChord(t, c);
      this.barInChord++;
    }

    const d = this.dangerS;
    const lvl = c.tension ? Math.max(c.floor, d) : 0;
    if (inBar % 2 === 0) { // fade on the beat, not instantly
      this.tension.gain.setTargetAtTime(lvl * 1.1, t, c.tension ? 0.3 : 0.6);
      this.tpad.gain.setTargetAtTime(c.tension ? clamp01((d - 0.35) * 2) * 0.6 : 0, t, 0.5);
      if (c.tension && d > 0.75) this.heart(t, clamp01((d - 0.75) * 4) * 0.5);
    }
    if (lvl < 0.03) return;
    let hv = 0;
    if (inBar === 0) hv = 1;
    else if (inBar === 4) hv = 0.85;
    else if (d > 0.45 && inBar === 6) hv = 0.5;
    else if (d > 0.7) hv = inBar % 2 === 0 ? 0.6 : Math.random() < 0.8 ? 0.3 : 0;
    if (c.dis && inBar === 3) hv = Math.max(hv, 0.55);
    if (hv > 0) this.drum(t + (Math.random() - 0.5) * 0.006, hv * c.drums * 0.5);
    if (d > 0.25 || c.dis) {
      const up = inBar === 7 && Math.random() < 0.3 ? 12 : 0;
      this.ost(t, this.root + up, inBar % 2 === 0 ? 1 : 0.4);
    }
  }

  private newChord(t: number, c: PhaseCfg): void {
    this.forceChord = false;
    this.barInChord = 0;
    const prog = c.major ? MAJOR : MINOR;
    if (this.chordIdx >= prog.length) this.chordIdx = c.major ? 1 : 0;
    const ch = prog[this.chordIdx++];
    this.root = ch.r;
    const hold = BAR * 2;
    let notes = ch.n.map((n) => n + c.oct);
    if (c.oct > 0) notes = notes.slice(1); // torch: thinner, higher
    if (this.phase === 'title' || this.phase === 'ending') notes = notes.slice(0, 3); // sparse
    notes.forEach((n) => this.voice(t + Math.random() * 0.3, n, hold, 2.5, 3, 0.09, this.padIn));
    if (c.dis) this.voice(t + 0.5, ch.n[0] + 13, hold, 3.5, 3, 0.06, this.padIn); // minor-second rub
    if (c.tension) this.voice(t, ch.n[ch.n.length - 1] + 12, hold, 3, 3, 0.07, this.tpad);
    if (c.bell > 0 && Math.random() < c.bell) {
      const base = Math.random() < 0.5 ? mtof(50) : mtof(45);
      this.bell(t + 0.3 + Math.random() * 1.5, base, 0.3, this.mbell, 5.5);
    }
  }

  private drum(t: number, vol: number): void {
    const r = vary(0.04);
    this.thud(t, 64 * r, 40 * r, vol * 0.9, 0.55, this.tension);
    this.nz(t, 0.002, vol * 0.5, 0.09, this.bq('lowpass', 700 * r, 0.8, this.tension));
  }

  private ost(t: number, midi: number, accent: number): void {
    const f = mtof(midi);
    const lp = this.sw('lowpass', 5, this.tension, t, 380 + accent * 500, 200, 0.3);
    const a = 0.16 * (0.6 + accent * 0.4);
    this.tone('sawtooth', f, t, 0.008, a, 0.38, lp);
    this.tone('sawtooth', f * 1.004, t, 0.008, a, 0.38, lp);
  }

  private heart(t: number, vol: number): void {
    this.thud(t, 58, 38, vol, 0.2, this.heartG);
    this.thud(t + 0.22, 52, 36, vol * 0.6, 0.25, this.heartG);
  }
}

// ---------------------------------------------------------------- factory

export function createAudio(): GameAudio {
  try {
    if (typeof window === 'undefined') return silentAudio();
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return silentAudio();
    return new Engine(AC);
  } catch {
    return silentAudio();
  }
}
