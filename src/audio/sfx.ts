// Procedural WebAudio: every sound is synthesised, no files needed. Starts on first input.
let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;
let muted = false;
let fireGain: GainNode | null = null;
let drumGain: GainNode | null = null;
let reverb: ConvolverNode;
let melodyGain: GainNode | null = null;
let musicMood: 'night' | 'dawn' | 'silent' = 'night';

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);
  // a large stone hall: generated impulse response, shared by music and a send from sfx
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 3.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.38;
  reverb.connect(wet).connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.25;
  sfxBus.connect(send).connect(reverb);
  const mSend = ctx.createGain();
  mSend.gain.value = 0.7;
  musicBus.connect(mSend).connect(reverb);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startBeds();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}
export function isMuted(): boolean {
  return muted;
}

const vary = (v: number, amt = 0.08) => v * (1 + (Math.random() * 2 - 1) * amt);

function env(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005): void {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = vary(1, 0.2);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, attack, peak, dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random());
  src.stop(t + dur + attack + 0.05);
}

function tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005, dest?: AudioNode): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, attack, peak, dur);
  o.connect(g).connect(dest ?? sfxBus);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

export type SfxName =
  | 'swing' | 'swingHeavy' | 'hit' | 'hitHeavy' | 'kill' | 'burn' | 'dash' | 'jump' | 'land' | 'hurt' | 'hearthHurt'
  | 'spawn' | 'bell' | 'lose' | 'ui' | 'fireburst' | 'ignite' | 'bigSpawn' | 'dawn' | 'gutter' | 'dissolve'
  | 'bolt' | 'cut' | 'cry' | 'pounce' | 'airJump' | 'chargeFull';

export function sfx(name: SfxName, combo = 0): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.002;
  switch (name) {
    case 'swing':
      noise(t, 0.16, 'bandpass', vary(900 + combo * 250), vary(3200 + combo * 400), 1.4, 0.35, 0.03);
      break;
    case 'swingHeavy':
      noise(t, 0.3, 'bandpass', vary(400), vary(2400), 1.2, 0.5, 0.08);
      tone(t, 'sine', 120, 60, 0.3, 0.2, 0.06);
      break;
    case 'hit':
      tone(t, 'triangle', vary(190), 70, 0.12, 0.6);
      noise(t, 0.09, 'highpass', 2400, 900, 0.7, 0.35);
      break;
    case 'hitHeavy':
      tone(t, 'sine', vary(120), 38, 0.35, 0.9);
      noise(t, 0.22, 'lowpass', 3000, 200, 0.7, 0.6);
      break;
    case 'kill':
      tone(t, 'sine', vary(90), 30, 0.6, 0.7);
      noise(t, 0.7, 'bandpass', 1800, 300, 0.9, 0.35, 0.02); // dispersal hiss
      tone(t + 0.05, 'sine', vary(880, 0.15), vary(1320, 0.1), 0.9, 0.05, 0.1); // memory chime
      break;
    case 'burn':
      noise(t, 0.6, 'bandpass', 2600, 500, 1, 0.3, 0.05);
      tone(t, 'sine', vary(700), vary(1050), 0.7, 0.04, 0.1);
      break;
    case 'dash':
      noise(t, 0.22, 'bandpass', 600, 2600, 2, 0.4, 0.02);
      break;
    case 'jump':
      noise(t, 0.12, 'bandpass', 500, 1400, 1.5, 0.12, 0.02);
      break;
    case 'land':
      tone(t, 'sine', 110, 50, 0.12, 0.35);
      noise(t, 0.08, 'lowpass', 900, 200, 0.7, 0.2);
      break;
    case 'hurt':
      tone(t, 'sawtooth', 160, 55, 0.35, 0.35);
      noise(t, 0.25, 'lowpass', 1500, 150, 1, 0.4);
      break;
    case 'hearthHurt':
      noise(t, 0.35, 'bandpass', 1400, 400, 3, 0.35, 0.01);
      tone(t, 'triangle', 300, 120, 0.25, 0.15);
      break;
    case 'spawn':
      noise(t, 1.0, 'lowpass', 120, 500, 4, 0.18, 0.4);
      break;
    case 'bell':
      for (const [mul, a] of [[1, 0.4], [2.01, 0.18], [2.76, 0.12], [5.4, 0.05]] as const) tone(t, 'sine', 98 * mul, 98 * mul * 0.998, 5.5, a, 0.004, musicBus);
      break;
    case 'lose':
      tone(t, 'sine', 140, 40, 2.5, 0.6, 0.05, musicBus);
      noise(t, 2.5, 'lowpass', 800, 60, 1, 0.3, 0.1);
      break;
    case 'ui':
      tone(t, 'sine', 660, 640, 0.15, 0.12);
      break;
    case 'fireburst':
      noise(t, 0.7, 'lowpass', 400, 4200, 0.8, 0.8, 0.04); // roar opening up
      noise(t + 0.05, 0.9, 'bandpass', 1600, 500, 1, 0.4, 0.02);
      tone(t, 'sine', 90, 45, 0.5, 0.5);
      break;
    case 'ignite':
      noise(t, 1.4, 'lowpass', 300, 5000, 0.7, 0.7, 0.25);
      tone(t, 'sine', 147, 147, 2.5, 0.25, 0.3, musicBus);
      tone(t, 'sine', 220, 220, 2.5, 0.18, 0.4, musicBus);
      break;
    case 'gutter':
      noise(t, 2.2, 'lowpass', 2400, 120, 0.9, 0.5, 0.05);
      break;
    case 'bigSpawn':
      tone(t, 'sawtooth', 48, 32, 2.4, 0.5, 0.6);
      noise(t, 2.4, 'lowpass', 90, 600, 6, 0.5, 0.8);
      break;
    case 'dawn':
      // a slow major chord swelling out of the dark: D major, wide voicing
      for (const [f, a] of [[73.4, 0.3], [146.8, 0.22], [220, 0.18], [293.7, 0.15], [370, 0.12], [440, 0.1]] as const) tone(t, 'sine', f, f * 1.001, 7, a, 2.5, musicBus);
      break;
    case 'bolt':
      tone(t, 'sine', vary(220), 90, 0.5, 0.25, 0.04); // a hollow, swallowing hum
      noise(t, 0.4, 'bandpass', 600, 200, 4, 0.2, 0.05);
      break;
    case 'cut':
      tone(t, 'triangle', vary(1300), 700, 0.18, 0.3);
      noise(t, 0.12, 'highpass', 5000, 2500, 0.8, 0.35);
      break;
    case 'pounce':
      noise(t, 0.2, 'bandpass', 900, 300, 1.5, 0.35, 0.01);
      tone(t, 'sawtooth', vary(160), 90, 0.15, 0.12);
      break;
    case 'cry':
      // the Marshal's cry: a falling roar under a choir of wrong notes
      tone(t, 'sawtooth', 110, 55, 2.2, 0.5, 0.15);
      tone(t, 'sawtooth', 116, 58, 2.2, 0.35, 0.15);
      noise(t, 2.0, 'lowpass', 1800, 200, 2, 0.5, 0.2);
      for (const f of [311, 330, 349]) tone(t, 'sine', f, f * 0.94, 2.5, 0.06, 0.3, musicBus);
      break;
    case 'airJump':
      // a soft whoomph of shadow underfoot
      noise(t, 0.22, 'bandpass', vary(500), vary(1600), 1.2, 0.3, 0.01);
      tone(t, 'sine', vary(140), 260, 0.18, 0.18);
      break;
    case 'chargeFull':
      // the blade is ready: a bright ring over a low swell
      tone(t, 'triangle', vary(880), 880, 0.6, 0.18, 0.01);
      tone(t, 'sine', 1320, 1320, 0.5, 0.1, 0.01);
      tone(t, 'sawtooth', 70, 90, 0.4, 0.12, 0.05);
      break;
    case 'dissolve':
      for (let i = 0; i < 6; i++) tone(t + i * 0.35, 'sine', 587 * Math.pow(1.122, i), 587 * Math.pow(1.122, i), 2.5, 0.06, 0.05, musicBus);
      break;
  }
}

/** Continuous beds: fire crackle (follows hearth strength) and a drone with drums that rise with danger. */
function startBeds(): void {
  if (!ctx) return;
  // fire: filtered noise + random pops
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = 700;
  fireGain = ctx.createGain();
  fireGain.gain.value = 0;
  src.connect(bp).connect(fireGain).connect(sfxBus);
  src.start();
  const pop = () => {
    if (!ctx) return;
    const level = fireGain ? fireGain.gain.value : 0;
    if (level > 0.01) noise(ctx.currentTime, 0.03, 'highpass', 3000, 2000, 1, level * 2.2, 0.001);
    setTimeout(pop, 40 + Math.random() * 220);
  };
  pop();

  // drone: two detuned saws through a slow lowpass + fifth
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  lp.Q.value = 2;
  const dg = ctx.createGain();
  dg.gain.value = 0.11;
  lp.connect(dg).connect(musicBus);
  for (const f of [55, 55.4, 82.4, 110.3]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    o.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 160;
  lfo.connect(lg).connect(lp.frequency);
  lfo.start();

  // melody: sparse plucked notes in D minor, like a lute played in an empty hall
  melodyGain = ctx.createGain();
  melodyGain.gain.value = 0.8;
  melodyGain.connect(musicBus);
  const minor = [146.8, 174.6, 196, 220, 261.6, 293.7, 349.2];
  const major = [146.8, 185, 220, 246.9, 293.7, 370, 440];
  let mi = 3;
  const pluck = () => {
    if (!ctx || !melodyGain) return;
    if (musicMood !== 'silent') {
      const scale = musicMood === 'dawn' ? major : minor;
      mi = Math.max(0, Math.min(scale.length - 1, mi + Math.round((Math.random() - 0.5) * 3)));
      const f = scale[mi];
      const t = ctx.currentTime + 0.02;
      tone(t, 'triangle', f, f * 0.999, 2.2, 0.09, 0.004, melodyGain);
      tone(t, 'sine', f * 2, f * 2, 1.2, 0.03, 0.004, melodyGain);
      if (Math.random() < 0.3) tone(t + 0.36, 'triangle', scale[Math.max(0, mi - 2)], scale[Math.max(0, mi - 2)], 2.0, 0.06, 0.004, melodyGain);
    }
    setTimeout(pluck, 1400 + Math.random() * 2600);
  };
  setTimeout(pluck, 1500);

  // drums: a slow war-drum pattern whose level follows danger
  drumGain = ctx.createGain();
  drumGain.gain.value = 0;
  drumGain.connect(musicBus);
  const bpm = 84;
  const beat = 60 / bpm;
  let next = ctx.currentTime + 0.1;
  let step = 0;
  const pattern = [1, 0, 0.5, 0, 1, 0.35, 0.6, 0];
  const tick = () => {
    if (!ctx || !drumGain) return;
    while (next < ctx.currentTime + 0.2) {
      const v = pattern[step % pattern.length];
      if (v > 0) tone(next, 'sine', 70 * (v > 0.9 ? 1 : 1.3), 38, 0.4, 0.8 * v, 0.004, drumGain);
      next += beat / 2;
      step++;
    }
    setTimeout(tick, 50);
  };
  tick();
}

export function setMood(m: 'night' | 'dawn' | 'silent'): void {
  musicMood = m;
}

/** level 0..1 for each bed; smoothed. */
export function setBeds(fire: number, danger: number): void {
  if (!ctx) return;
  fireGain?.gain.setTargetAtTime(0.05 + 0.13 * fire, ctx.currentTime, 0.3);
  drumGain?.gain.setTargetAtTime(Math.min(1, danger) * 0.9, ctx.currentTime, 0.8);
}
