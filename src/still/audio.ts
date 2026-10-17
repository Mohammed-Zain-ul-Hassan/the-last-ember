// The Still City's sound, all synthesised (WebAudio; nothing to load). Quiet by design: a low ambience that cuts
// to silence when the Wrong Shadow is close (the doc's tell), the true-angle hum, footsteps (and its footsteps, half
// a beat late), the Rumble of the water growing district by district, braziers that crackle when near (real ones
// warm, false ones a hollow cold hum), and the mechanisms. No constant fire sound on the flame in his hand.

let ctx: AudioContext | null = null;
let master: GainNode;
let bus: GainNode;
let reverb: ConvolverNode;
let noiseBuf: AudioBuffer;
let brownBuf: AudioBuffer;
let musicGain: GainNode;
let rumbleGain: GainNode;
let humGain: GainNode;
let humOsc: OscillatorNode;
let humOsc2: OscillatorNode;
let humLfo: GainNode;
let humLfoOsc: OscillatorNode;
let breathGain: GainNode;
let brazierGain: GainNode;
let coldGain: GainNode;
let windGain: GainNode;
let rainGain: GainNode;
let muted = false;
let recordTap: AudioNode | null = null;

/** The game's mixed sound as a stream (for the recording). */
export function audioStream(): MediaStream | null {
  if (!ctx || !recordTap) return null;
  const dest = ctx.createMediaStreamDestination();
  recordTap.connect(dest);
  return dest.stream;
}

export function audioOn(): boolean {
  return !!ctx && ctx.state === 'running';
}

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  const c = ctx;
  master = c.createGain();
  master.gain.value = muted ? 0 : 0.9;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(c.destination);
  recordTap = comp;
  bus = c.createGain();
  bus.connect(master);
  // a stone city's air: a long, dark tail
  reverb = c.createConvolver();
  const len = c.sampleRate * 4;
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  reverb.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.42;
  reverb.connect(wet).connect(master);
  const send = c.createGain();
  send.gain.value = 0.35;
  bus.connect(send).connect(reverb);
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  brownBuf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const bd = brownBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bd.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    bd[i] = last * 3.5;
  }
  beds();
}

const loopNoise = (buf: AudioBuffer): AudioBufferSourceNode => {
  const s = ctx!.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(0, Math.random() * 2);
  return s;
};

/** The continuous layers: ambience, the Rumble, the hum, a breath, a brazier's crackle, a false brazier's cold. */
function beds(): void {
  const c = ctx!;
  // ambience: two low detuned voices under a slow filter, a fifth above that comes and goes
  musicGain = c.createGain();
  musicGain.gain.value = 0;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.Q.value = 0.4;
  musicGain.connect(lp).connect(bus);
  for (const [f, type, g] of [[55, 'sawtooth', 0.05], [55.4, 'sawtooth', 0.05], [82.4, 'triangle', 0.04], [110.2, 'sine', 0.03]] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.value = g;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.07;
    const lg = c.createGain();
    lg.gain.value = g * 0.7;
    lfo.connect(lg).connect(og.gain);
    o.connect(og).connect(musicGain);
    o.start();
    lfo.start();
  }
  // the Rumble: water, far below and far off
  rumbleGain = c.createGain();
  rumbleGain.gain.value = 0;
  const rl = c.createBiquadFilter();
  rl.type = 'lowpass';
  rl.frequency.value = 140;
  loopNoise(brownBuf).connect(rl).connect(rumbleGain).connect(bus);
  // the hum of a true angle: a fifth, swelling as the silhouettes meet, pulsing when near a Last Word
  humGain = c.createGain();
  humGain.gain.value = 0;
  humOsc = c.createOscillator();
  humOsc.type = 'sine';
  humOsc.frequency.value = 196;
  humOsc2 = c.createOscillator();
  humOsc2.type = 'sine';
  humOsc2.frequency.value = 294;
  const h2 = c.createGain();
  h2.gain.value = 0.5;
  humLfo = c.createGain();
  humLfo.gain.value = 0;
  humLfoOsc = c.createOscillator();
  humLfoOsc.frequency.value = 2;
  humLfoOsc.connect(humLfo).connect(humGain.gain);
  humOsc.connect(humGain);
  humOsc2.connect(h2).connect(humGain);
  humGain.connect(bus);
  humOsc.start();
  humOsc2.start();
  humLfoOsc.start();
  // a low breath behind him
  breathGain = c.createGain();
  breathGain.gain.value = 0;
  const bf = c.createBiquadFilter();
  bf.type = 'bandpass';
  bf.frequency.value = 520;
  bf.Q.value = 0.9;
  const blfo = c.createOscillator();
  blfo.frequency.value = 0.32;
  const blg = c.createGain();
  blg.gain.value = 0.5;
  const bgate = c.createGain();
  bgate.gain.value = 0.5;
  blfo.connect(blg).connect(bgate.gain);
  loopNoise(noiseBuf).connect(bf).connect(bgate).connect(breathGain).connect(master);
  blfo.start();
  // a real brazier near: a soft crackle (sparse clicks through a band)
  brazierGain = c.createGain();
  brazierGain.gain.value = 0;
  const cf = c.createBiquadFilter();
  cf.type = 'highpass';
  cf.frequency.value = 1800;
  const crackle = c.createBufferSource();
  const cb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
  const cd = cb.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * (0.5 + Math.random()) : (Math.random() * 2 - 1) * 0.015;
  crackle.buffer = cb;
  crackle.loop = true;
  crackle.connect(cf).connect(brazierGain).connect(bus);
  crackle.start();
  // a false brazier near: a hollow hum, cold
  coldGain = c.createGain();
  coldGain.gain.value = 0;
  for (const f of [233, 236.5, 466]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(coldGain);
    o.start();
  }
  coldGain.connect(bus);
  // rain on stone: a soft hiss, a little lower under it
  rainGain = c.createGain();
  rainGain.gain.value = 0;
  const rf = c.createBiquadFilter();
  rf.type = 'highpass';
  rf.frequency.value = 900;
  const rl2 = c.createBiquadFilter();
  rl2.type = 'lowpass';
  rl2.frequency.value = 7000;
  loopNoise(noiseBuf).connect(rf).connect(rl2).connect(rainGain).connect(bus);
  // wind (gusts)
  windGain = c.createGain();
  windGain.gain.value = 0;
  const wf = c.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 700;
  wf.Q.value = 0.6;
  loopNoise(noiseBuf).connect(wf).connect(windGain).connect(bus);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.08);
}

const set = (g: GainNode | undefined, v: number, tc = 0.25) => {
  if (!ctx || !g) return;
  if (Math.abs(g.gain.value - v) < 0.0005 && v === 0) return;
  g.gain.setTargetAtTime(v, ctx.currentTime, tc);
};

export interface Beds {
  music: number; // 0..1 (0 = the silence that says it is close)
  rumble: number;
  hum: number; // 0..1 how near a true angle
  pulse: number; // Hz of the hum's pulse (Last Words: faster as he turns to it), 0 = steady
  breath: number;
  brazier: number;
  cold: number;
  wind: number;
  rain: number;
}

let lastMusic = -1;
export function setBeds(b: Beds): void {
  if (!ctx) return;
  // the silence must be sudden: the music cuts, it does not fade
  const m = b.music * 0.9;
  if (Math.abs(m - lastMusic) > 0.01) {
    musicGain.gain.setTargetAtTime(m, ctx.currentTime, m < lastMusic && m < 0.1 ? 0.03 : 1.2);
    lastMusic = m;
  }
  set(rumbleGain, b.rumble * 0.55, 1.5);
  const h = Math.max(0, b.hum);
  set(humGain, h * h * 0.06, 0.15);
  humOsc.frequency.setTargetAtTime(196 + h * 18, ctx.currentTime, 0.2);
  humOsc2.frequency.setTargetAtTime(294 + h * 27, ctx.currentTime, 0.2);
  humLfo.gain.setTargetAtTime(b.pulse > 0 ? h * h * 0.05 : 0, ctx.currentTime, 0.2);
  if (b.pulse > 0) humLfoOsc.frequency.setTargetAtTime(b.pulse, ctx.currentTime, 0.2);
  set(breathGain, b.breath * 0.12, 0.4);
  set(brazierGain, b.brazier * 0.5, 0.3);
  set(coldGain, b.cold * 0.025, 0.4);
  set(windGain, b.wind * 0.35, 0.15);
  set(rainGain, b.rain * 0.022, 1.2); // a soft, steady rain
}

// ------------------------------------------------------------------ one-shots
function env(g: GainNode, t: number, a: number, peak: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005, dest?: AudioNode): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + dur);
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  src.connect(f).connect(g).connect(dest ?? bus);
  src.start(t, Math.random());
  src.stop(t + attack + dur + 0.1);
}
function tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005, dest?: AudioNode): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + attack + dur);
  const g = c.createGain();
  env(g, t, attack, peak, dur);
  o.connect(g).connect(dest ?? bus);
  o.start(t);
  o.stop(t + attack + dur + 0.1);
}

export type Cue =
  | 'step' | 'stepLate' | 'wake' | 'found' | 'replayEnd' | 'stepIn' | 'stepOut' | 'lever' | 'portcullis' | 'gate' | 'barFail'
  | 'brazier' | 'falseBrazier' | 'relight' | 'flameLow' | 'flameOut' | 'gust' | 'gustWarn' | 'rewind' | 'fall' | 'death'
  | 'caught' | 'wrongSeen' | 'noAsh' | 'riddle' | 'ui' | 'plate' | 'bridgeOn' | 'bridgeOff' | 'collapse' | 'drip';

export function cue(name: Cue, vol = 1): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'step':
      noise(t, 0.09, 'lowpass', 900, 200, 0.7, 0.14 * vol, 0.003);
      tone(t, 'sine', 90, 50, 0.08, 0.08 * vol);
      break;
    case 'stepLate':
      // the same step, half a beat late, a little lower, from somewhere behind
      noise(t, 0.12, 'lowpass', 700, 150, 0.7, 0.12 * vol, 0.004, reverb);
      tone(t, 'sine', 70, 40, 0.1, 0.07 * vol, 0.004, reverb);
      break;
    case 'found':
      for (const [f, d] of [[392, 0], [588, 0.12], [784, 0.24]] as const) tone(t + d, 'sine', f, f, 1.6, 0.05 * vol, 0.02);
      break;
    case 'wake':
      // a struck bell, far off, and a breath in
      for (const [f, a] of [[220, 0.12], [440, 0.06], [553, 0.04], [880, 0.025]] as const) tone(t, 'sine', f, f * 0.995, 3.2, a * vol, 0.004);
      noise(t, 1.2, 'bandpass', 300, 1400, 1.2, 0.06 * vol, 0.5);
      break;
    case 'replayEnd':
      noise(t, 1.4, 'bandpass', 1400, 260, 1.4, 0.06 * vol, 0.05);
      break;
    case 'stepIn':
      noise(t, 0.9, 'bandpass', 200, 2400, 1.0, 0.14 * vol, 0.3);
      tone(t, 'sine', 330, 660, 0.9, 0.05 * vol, 0.3);
      break;
    case 'stepOut':
      noise(t, 0.9, 'bandpass', 2400, 200, 1.0, 0.12 * vol, 0.05);
      break;
    case 'lever':
      noise(t, 0.12, 'lowpass', 1600, 300, 1, 0.3 * vol);
      tone(t, 'square', 120, 60, 0.15, 0.06 * vol);
      tone(t + 0.18, 'sine', 70, 40, 0.3, 0.2 * vol);
      break;
    case 'portcullis':
      // chains and iron dragging up through stone
      for (let i = 0; i < 26; i++) noise(t + i * 0.13 + Math.random() * 0.04, 0.09, 'bandpass', 2200 + Math.random() * 900, 900, 3, 0.07 * vol);
      noise(t, 3.4, 'lowpass', 300, 120, 0.8, 0.12 * vol, 0.2);
      break;
    case 'gate':
      tone(t, 'sawtooth', 62, 48, 2.2, 0.06 * vol, 0.3);
      noise(t, 2.4, 'bandpass', 380, 180, 4, 0.1 * vol, 0.4);
      tone(t + 2.5, 'sine', 55, 30, 0.8, 0.3 * vol);
      break;
    case 'barFail':
      tone(t, 'sine', 80, 70, 0.4, 0.15 * vol);
      noise(t, 0.3, 'lowpass', 500, 200, 1, 0.12 * vol);
      break;
    case 'brazier':
      noise(t, 0.8, 'lowpass', 300, 2600, 0.8, 0.3 * vol, 0.05);
      tone(t, 'sine', 110, 220, 0.6, 0.05 * vol, 0.05);
      break;
    case 'falseBrazier':
      for (const f of [180, 183, 360]) tone(t, 'sine', f, f * 0.8, 2.4, 0.07 * vol, 0.2);
      noise(t, 1.6, 'highpass', 4000, 1200, 1, 0.05 * vol, 0.3);
      break;
    case 'relight':
      noise(t, 1.0, 'lowpass', 400, 2400, 0.8, 0.16 * vol, 0.2);
      break;
    case 'flameLow':
      noise(t, 0.5, 'highpass', 3000, 1200, 1, 0.08 * vol);
      break;
    case 'flameOut':
      noise(t, 0.7, 'highpass', 5000, 900, 1, 0.14 * vol);
      tone(t, 'sine', 300, 80, 0.6, 0.05 * vol);
      break;
    case 'gustWarn':
      noise(t, 1.2, 'bandpass', 250, 700, 0.8, 0.08 * vol, 0.9);
      break;
    case 'gust':
      noise(t, 1.1, 'bandpass', 900, 300, 0.7, 0.3 * vol, 0.05);
      break;
    case 'rewind':
      noise(t, 0.9, 'bandpass', 3000, 200, 1.2, 0.16 * vol, 0.02);
      tone(t, 'sine', 880, 110, 0.9, 0.05 * vol);
      break;
    case 'fall':
      noise(t, 1.2, 'bandpass', 800, 120, 0.8, 0.12 * vol, 0.1);
      break;
    case 'death':
      tone(t, 'sine', 60, 30, 2.5, 0.35 * vol, 0.02);
      noise(t, 2.5, 'lowpass', 400, 60, 0.7, 0.2 * vol, 0.05);
      break;
    case 'caught':
      for (const f of [523, 554, 587]) tone(t, 'sine', f, f * 0.5, 1.4, 0.06 * vol, 0.004);
      noise(t, 0.8, 'highpass', 6000, 2000, 1, 0.1 * vol);
      break;
    case 'wrongSeen':
      tone(t, 'sine', 146, 138, 3.0, 0.07 * vol, 0.6);
      tone(t, 'sine', 155.5, 147, 3.0, 0.06 * vol, 0.6);
      break;
    case 'noAsh':
      tone(t, 'triangle', 220, 196, 0.25, 0.05 * vol);
      break;
    case 'riddle':
      noise(t, 0.5, 'bandpass', 1200, 600, 2, 0.05 * vol, 0.02);
      break;
    case 'ui':
      tone(t, 'sine', 660, 660, 0.08, 0.04 * vol);
      break;
    case 'plate':
      for (const [f, d] of [[262, 0], [392, 0.1], [523, 0.2]] as const) tone(t + d, 'sine', f, f, 2.2, 0.06 * vol, 0.01);
      break;
    case 'bridgeOn':
      tone(t, 'sine', 160, 240, 0.5, 0.06 * vol, 0.05);
      break;
    case 'bridgeOff':
      tone(t, 'sine', 240, 120, 0.3, 0.06 * vol);
      break;
    case 'collapse':
      noise(t, 2.2, 'lowpass', 600, 80, 0.7, 0.4 * vol, 0.02);
      tone(t, 'sine', 45, 30, 2, 0.3 * vol);
      break;
    case 'drip':
      tone(t, 'sine', 1400 + Math.random() * 600, 500, 0.12, 0.03 * vol, 0.002, reverb);
      break;
  }
}
