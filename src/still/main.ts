import '../style.css';
import '../render/mist'; // patches the fog shaders before anything renders
import * as THREE from 'three';
import { Stage, SHADOW_FRAME } from '../render/stage';
import { CameraRig, FOLLOW, type Shot } from '../render/cameraRig';
import { KnightView } from '../render/knightView';
import { Particles } from '../render/particles';
import { Flame } from '../render/flame';
import { glowTexture } from '../render/textures';
import type { Knight } from '../sim/world';
import { ENDINGS, FLAME, HINTS, LAST_WORDS, NARRATOR, PEOPLE_WORDS, PUZZLE_WHISPERS, RIDDLES, WRONG, wordLine, type Line } from '../data/stillCity';
import { City, DT, type CityEvent, type StillInput } from './sim/city';
import { flameState } from './sim/flame';
import { BRAZIER_POOL, DistrictView, TORCH_LIGHTS } from './render/districtView';
import { FigureViews } from './render/figureView';
import { WrongView } from './render/wrongView';
import { StillHud } from './ui/hud';
import { StillMenu } from './ui/menu';
import { persist, save } from './save';
import { clearInput, getTrim, initInput, isHeld, moveVector, onKey, takeLook, takePresses } from './input';
import * as audio from './audio';
import { DISTRICTS } from './data';
import { Bot } from './bot';
import { GATE_SCRIPT } from './scripts/gateWard';
import { MARKET_SCRIPT } from './scripts/market';
import { TEMPLE_SCRIPT } from './scripts/temple';
import { LIBRARY_SCRIPT } from './scripts/library';
import { HEART_SCRIPT } from './scripts/heart';
import { HEART } from './data/heart';
import { Ending } from './ending';
import { Hints } from './hints';

// The Still City. You carry the only fire left in a city that froze mid-breath four thousand years ago. Your flame
// wakes the dead for ten seconds at a time, and something that moves only when unseen follows you.
// (Design: "The Still City: Game Design & Narration", Moeez Abid. Build notes: docs/still-city-build.md.)

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
/** ?bot=1: the game plays itself, start to end (the recorded run). */
const BOT = params.get('bot') === '1';
const SCRIPTS = [GATE_SCRIPT, MARKET_SCRIPT, TEMPLE_SCRIPT, LIBRARY_SCRIPT, HEART_SCRIPT];
let bot: Bot | null = null;

// ------------------------------------------------------------------ lines by id
const LINES = new Map<string, Line>();
const collect = (v: unknown): void => {
  if (!v || typeof v !== 'object') return;
  if ('id' in v && 'voice' in v) {
    LINES.set((v as Line).id, v as Line);
    return;
  }
  for (const x of Object.values(v)) collect(x);
};
for (const src of [NARRATOR, FLAME, WRONG, HINTS, PUZZLE_WHISPERS, ENDINGS]) collect(src);
const line = (id: string): Line | undefined => LINES.get(id);

// ------------------------------------------------------------------ the stage
const stage = new Stage(document.getElementById('app')!);
stage.ambientK = 0.38; // the flame is the light here
stage.setSky({ top: '#05040a', horizon: '#120e1c', glow: '#3a3e66', glowY: 0.9, fog: '#07060c', stars: 0.55, disc: 0.03, fogDensity: 0.03 }, 1);
stage.setTerrain('high');
// closer than the combat camera: this is a game of looking, and of where the flame is held
FOLLOW.dist = 6.4;
FOLLOW.height = 1.9;
FOLLOW.shoulder = 0.6;
FOLLOW.lookAhead = 2.6;
const rig = new CameraRig(stage.camera);
const glow = new Particles(2000, true);
const smoke = new Particles(1600, false);
stage.scene.add(smoke.points, glow.points);
for (const l of [...TORCH_LIGHTS, ...BRAZIER_POOL]) stage.scene.add(l);
const knight = new KnightView();
knight.setTorch(false);
knight.torchLight.shadow.mapSize.set(1024, 1024);
knight.torchLight.shadow.camera.far = 18;
knight.torchLight.distance = 18;
knight.torchLight.decay = 1.35;
stage.world.add(knight.root);
stage.outline.selection.set(knight.outlineTargets);
const wrongView = new WrongView();
stage.world.add(wrongView.root);

// the flame he carries: a small fire over his raised palm, its halo, and (on the knight) the one shadow-casting light
const held = new Flame(0.34, 0.62, 3);
stage.world.add(held.group);
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.2, 0.55, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }));
stage.world.add(halo);
const flameAt = new THREE.Vector3();

const hud = new StillHud();
hud.show(false);
const menu = new StillMenu({
  resume: () => setPaused(false),
  lastBrazier: () => {
    setPaused(false);
    city.s.status = 'dead';
    city.s.statusT = 1.6;
  },
  mute: (m) => audio.setMuted(m),
});
audio.setMuted(save.muted);

// ------------------------------------------------------------------ hints: the flame's whispers, and what it shows
const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.8, 0.9, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
marker.scale.setScalar(0.9);
stage.world.add(marker);
let markerT = 0;
const lean = { x: 0, z: 0, t: 0 };
const embers = { x: 0, z: 0, t: 0 };
let breezeT = 0;
const hints = new Hints(hud, () => city, {
  glowFigure: (i, sec) => figs?.hint(i, sec),
  markAngle: (i, sec) => {
    const f = DISTRICTS[di].figures[i];
    marker.position.set(...f.light);
    markerT = sec;
  },
  leanFlame: (x, z, sec) => Object.assign(lean, { x, z, t: sec }),
  emberPath: (x, z, sec) => Object.assign(embers, { x, z, t: sec }),
  outlineWrong: (sec) => (wrongView.reveal = sec),
  coldBreeze: (sec) => (breezeT = sec),
  glintBrazier: (i, sec) => {
    const br = DISTRICTS[di].braziers[i];
    marker.position.set(br.x, 2.2, br.z);
    markerT = sec;
  },
});

// ------------------------------------------------------------------ the end
let flameOverride: THREE.Vector3 | null = null;
let flameOverrideVigor = 1;
let rumbleK = 1;
let bodyHidden = false;
const ending = new Ending({
  hud,
  rig,
  scene: stage.world,
  centre: new THREE.Vector3(HEART.x, 0, HEART.z),
  body: () => new THREE.Vector3(city.s.body.x, city.s.body.y, city.s.body.z),
  flame: () => flameAt.clone(),
  overrideFlame: (pos, v) => {
    flameOverride = pos ? pos.clone() : null;
    flameOverrideVigor = v;
    if (!pos && v <= 0) flameOverrideVigor = 0;
  },
  placeWrong: (x, z, yaw, pose) => (wrongView.override = { x, z, yaw, pose, target: new THREE.Vector3(x + Math.cos(yaw) * 0.6, 3.6, z + Math.sin(yaw) * 0.6) }),
  moveBody: (x, z, yaw, moving) => {
    const b = city.s.body;
    b.vx = moving ? (x - b.x) * 60 : 0;
    b.vz = moving ? (z - b.z) * 60 : 0;
    b.x = x;
    b.z = z;
    b.yaw = yaw;
    prevBody.set(x, b.y, z);
  },
  hideBody: (h) => (bodyHidden = h),
  wakeAll: (k) => figs?.wakeAll(k),
  setRumble: (k) => (rumbleK = k),
  shake: (k) => rig.shake(k * 0.1),
  veil: (on) => hud.veil(on),
  autoChoose: BOT,
});

function startEnding(): void {
  if (mode !== 'play') return;
  mode = 'ending';
  hud.timer(null);
  hud.prompt(null);
  ending.start();
}

// ------------------------------------------------------------------ the district
let di = Math.max(0, Math.min(DISTRICTS.length - 1, Number(params.get('d') ?? 0) || 0));
let city!: City;
let dview: DistrictView | undefined;
let figs: FigureViews | undefined;
const prevBody = new THREE.Vector3();
const prevFlame = new THREE.Vector3();

const SKIES = {
  night: { top: '#05040a', horizon: '#120e1c', glow: '#3a3e66', glowY: 0.9, fog: '#07060c', stars: 0.55, disc: 0.03, fogDensity: 0.03 },
  deep: { top: '#020205', horizon: '#0a0812', glow: '#2a2440', glowY: 0.9, fog: '#050409', stars: 0.3, disc: 0.0, fogDensity: 0.035 },
  interior: { top: '#020203', horizon: '#060509', glow: '#14121e', glowY: 0.9, fog: '#040306', stars: 0, disc: 0, fogDensity: 0.04 },
};

function load(i: number, ash?: number): void {
  di = i;
  dview?.dispose();
  figs?.group.removeFromParent();
  const d = DISTRICTS[i];
  city = new City(d, save.words, ash);
  stage.setSky(SKIES[d.sky], 1);
  stage.ambientK = d.sky === 'interior' ? 0.42 : 0.62;
  wrongView.mirror = d.wrong?.mode === 'face' || d.wrong?.mode === 'final';
  bot = BOT ? new Bot(SCRIPTS[i], d.start.yaw) : null;
  hints.reset();
  const dv = new DistrictView(d);
  const fv = new FigureViews(d);
  dview = dv;
  figs = fv;
  stage.world.add(dv.group, fv.group);
  rig.yaw = d.start.yaw;
  rig.pitch = 0.4;
  const b = city.s.body;
  prevBody.set(b.x, b.y, b.z);
  prevFlame.set(city.s.flame.x, city.s.flame.y, city.s.flame.z);
  rig.target.set(b.x, b.y, b.z);
  save.reached = Math.max(save.reached, i);
  persist();
  stage.warmup([knight.torchLight.shadow]);
}

// ------------------------------------------------------------------ modes
type Mode = 'title' | 'play' | 'pause' | 'transition' | 'ending';
let mode: Mode = 'title';
let t = 0;
const said = new Set<string>();
function sayOnce(id: string | undefined): void {
  if (!id || said.has(id)) return;
  const l = line(id);
  if (!l) return;
  said.add(id);
  hud.say(l);
}

function setPaused(on: boolean): void {
  if (on && mode === 'play') {
    mode = 'pause';
    menu.show();
    clearInput();
  } else if (!on && mode === 'pause') {
    mode = 'play';
    menu.hide();
    clearInput();
  }
}

const title = document.createElement('div');
title.id = 'sc-title';
title.innerHTML = `<h1>THE STILL CITY</h1><p>Carry it carefully. It is all the time that is left.</p><div class="begin">CLICK TO BEGIN</div>
  <div class="keys">WASD walk &nbsp;·&nbsp; drag the mouse to look and aim the flame &nbsp;·&nbsp; E wake &nbsp;·&nbsp; Shift draw the flame back &nbsp;·&nbsp; Esc pause</div>`;
document.body.appendChild(title);

const TITLE_SHOT: Shot = { yaw: -0.9, height: 1.6, dist: 6.2, lookY: 1.8, fov: 40 };

function begin(): void {
  if (mode !== 'title') return;
  audio.initAudio();
  title.classList.add('off');
  mode = 'play';
  hud.show(true);
  rig.follow(2.4, DISTRICTS[di].start.yaw);
  clearInput();
  enterDistrict(true);
}

function enterDistrict(first: boolean): void {
  const d = DISTRICTS[di];
  if (first && di === 0) for (const l of NARRATOR.opening) hud.say(l);
  hud.card(['I', 'II', 'III', 'IV', 'V'][d.index] ?? '', d.name.toUpperCase(), d.sub, 6);
  if (d.enterLine) sayOnce(d.enterLine);
  audio.cue('drip');
}

function nextDistrict(): void {
  if (mode !== 'play') return;
  mode = 'transition';
  hud.veil(true);
  setTimeout(() => {
    load(di + 1, city.s.ash);
    hud.veil(false);
    mode = 'play';
    rig.follow(0.01, DISTRICTS[di].start.yaw);
    enterDistrict(false);
  }, 1600);
}

// ------------------------------------------------------------------ input
initInput(stage.renderer.domElement);
stage.renderer.domElement.addEventListener('pointerdown', () => {
  if (mode === 'title') begin();
  audio.initAudio();
});
onKey((code) => {
  if (mode === 'title' && (code === 'Enter' || code === 'Space' || code === 'KeyE')) begin();
  if (code === 'Escape') setPaused(mode === 'play');
  if (code === 'KeyH' && mode === 'play') hints.ask();
  if (code === 'KeyJ' && mode === 'play') {
    mode = 'pause';
    menu.show('journal');
  }
});


// ------------------------------------------------------------------ the sim
const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();
let lockT = 0;
let lockFrom = 0;
let lockTo = 0;

function buildInput(): StillInput {
  let [mx, mz] = moveVector(rig.yaw);
  const pr = takePresses();
  let back = isHeld('ShiftLeft', 'ShiftRight');
  let actHeld = isHeld('KeyE');
  let rewindHeld = isHeld('KeyR');
  let trim = getTrim();
  if (bot) {
    const o = bot.step(city, DT);
    mx = o.input.mx ?? 0;
    mz = o.input.mz ?? 0;
    back = !!o.input.back;
    actHeld = !!o.input.actHeld;
    rewindHeld = !!o.input.rewindHeld;
    trim = o.input.trim ?? 0;
    pr.act = !!o.input.act;
    pr.lock = o.lock;
    if (lockT <= 0) {
      rig.yaw = o.yaw;
      rig.pitch = o.pitch;
    }
  }
  if (pr.lock) flameLock();
  stage.camera.updateMatrixWorld();
  projView.multiplyMatrices(stage.camera.projectionMatrix, stage.camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);
  const planes: number[] = [];
  for (const p of frustum.planes) planes.push(p.normal.x, p.normal.y, p.normal.z, p.constant);
  const c = stage.camera.position;
  return {
    mx, mz, yaw: rig.yaw, pitch: rig.pitch, trim, back,
    act: pr.act, actHeld, rewindHeld, cam: [c.x, c.y, c.z], frustum: planes,
  };
}

/** Flame Lock: swing the view (and so the flame) onto the Wrong Shadow. */
function flameLock(): void {
  const w = city.s.wrong;
  if (!w.on || w.gone) return;
  const b = city.s.body;
  lockFrom = rig.yaw;
  let to = Math.atan2(w.z - b.z, w.x - b.x);
  while (to - lockFrom > Math.PI) to -= Math.PI * 2;
  while (to - lockFrom < -Math.PI) to += Math.PI * 2;
  lockTo = to;
  lockT = 0.001;
}

let stride = 0;
let deathN = 0;
function handle(e: CityEvent): void {
  const d = DISTRICTS[di];
  switch (e.type) {
    case 'found': {
      const f = d.figures[e.fig];
      hints.progress();
      audio.cue('found');
      if (f.word !== undefined) {
        hud.say(wordLine(f.word));
        save.words[f.word] = true;
        persist();
      }
      sayOnce(f.line);
      if (f.clip && !said.has('tut.wake')) {
        said.add('tut.wake');
        hud.note('His shadow is at its true angle. E wakes it, for 1 Ash.');
      }
      break;
    }
    case 'wake':
      audio.cue('wake');
      sayOnce(d.lines.firstWake);
      hints.progress();
      if (d.figures[e.fig].stepIn && !said.has('tut.step')) {
        said.add('tut.step');
        setTimeout(() => hud.note('Hold E to step into his last ten seconds (2 Ash). Do what he did.'), 1800);
      }
      break;
    case 'replayEnd':
      audio.cue('replayEnd');
      sayOnce(d.lines.replayEnd);
      break;
    case 'stepIn':
      audio.cue('stepIn');
      sayOnce(d.lines.stepIn);
      break;
    case 'stepOut':
      audio.cue('stepOut');
      break;
    case 'spot':
      if (e.ok) audio.cue('lever');
      else {
        audio.cue('barFail');
        if (e.msg) hud.note(e.msg);
      }
      break;
    case 'seqStep':
      audio.cue('found', 0.6);
      hints.progress();
      break;
    case 'seqFail':
      audio.cue('barFail');
      hud.note('The hours fall out of order. Begin again.');
      hints.failed();
      break;
    case 'pageSide': {
      const pg = d.pages[e.i];
      hud.riddle('a page, lit from the side', pg.lie);
      sayOnce('library.side');
      break;
    }
    case 'pageRead': {
      const pg = d.pages[e.i];
      hud.riddle('the same page, lit from above', pg.truth);
      audio.cue('found');
      sayOnce('library.above');
      hud.say(wordLine(pg.word));
      save.words[pg.word] = true;
      persist();
      hints.progress();
      break;
    }
    case 'wrongLit':
      sayOnce(d.lines.wrongLit);
      break;
    case 'flag': {
      if (e.id === 'heart') startEnding();
      hints.progress();
      for (const m of d.mechs) if (m.opens === e.id && m.kind !== 'lever') audio.cue(m.kind === 'portcullis' ? 'portcullis' : 'gate');
      const l = d.lines.flags?.[e.id];
      if (l) setTimeout(() => sayOnce(l), 2200);
      break;
    }
    case 'brazier':
      audio.cue('brazier');
      if (d.lines.brazier) sayOnce(d.lines.brazier);
      if (e.first && !said.has('tut.brazier')) {
        said.add('tut.brazier');
        hud.note('Ash restored. If you fall, you wake here.');
      }
      break;
    case 'falseBrazier':
      audio.cue('falseBrazier');
      sayOnce('temple.fellFalse');
      break;
    case 'relight':
      audio.cue('relight');
      break;
    case 'relit':
      hud.say(FLAME.relit);
      break;
    case 'flameLow':
      audio.cue('flameLow');
      hud.say(FLAME.low);
      break;
    case 'flameOut':
      audio.cue('flameOut');
      hud.say(FLAME.out);
      break;
    case 'noAsh':
      audio.cue('noAsh');
      hud.note(`Not enough Ash (${e.need} needed). Rest at a brazier.`);
      break;
    case 'rewind':
      audio.cue('rewind');
      hud.flash();
      break;
    case 'fall':
      audio.cue('fall');
      if (city.s.ash >= 1) hud.note('Hold R to rewind.');
      break;
    case 'dead': {
      audio.cue('death');
      deathN++;
      const v = deathN >= 6 ? 3 : (deathN - 1) % 3;
      hud.say(NARRATOR.death[v]);
      hud.veil(true);
      break;
    }
    case 'respawn':
      hud.veil(false);
      bot?.restart();
      rig.follow(0.6);
      break;
    case 'wrongSeen':
      audio.cue('wrongSeen');
      sayOnce(d.lines.wrongSeen);
      break;
    case 'wrongShift':
    case 'wrongStep':
      setTimeout(() => audio.cue('stepLate', 0.8), 180);
      break;
    case 'caught':
      audio.cue('caught');
      rig.shake(0.6);
      if (d.lines.caught) hud.say(line(d.lines.caught)!);
      hints.caught();
      break;
    case 'gustWarn':
      audio.cue('gustWarn');
      break;
    case 'gust':
      audio.cue('gust');
      if (e.hit) rig.shake(0.25);
      break;
    case 'riddle': {
      const r = d.riddles[e.i];
      const rd = r.text ? { where: 'an inscription', text: r.text } : RIDDLES[r.id as keyof typeof RIDDLES];
      hud.riddle(rd.where, rd.text);
      hints.riddleRead(r.puzzle);
      audio.cue('riddle');
      break;
    }
    case 'frozenTry': {
      const m = d.mechs[e.mech];
      if (m.frozenMsg) hud.note(m.frozenMsg);
      audio.cue('noAsh');
      break;
    }
    case 'line':
      sayOnce(e.id);
      break;
    case 'plate':
      audio.cue('plate');
      break;
    case 'bridge':
      audio.cue(e.on ? 'bridgeOn' : 'bridgeOff');
      if (e.on) sayOnce(d.lines.bridge);
      break;
    case 'exit':
      nextDistrict();
      break;
    default:
      break;
  }
}

function stepSim(): void {
  const b = city.s.body;
  prevBody.set(b.x, b.y, b.z);
  prevFlame.set(city.s.flame.x, city.s.flame.y, city.s.flame.z);
  const ox = b.x;
  const oz = b.z;
  city.step(buildInput());
  for (const e of city.events) handle(e);
  const nb = city.s.body;
  if (nb.onGround) {
    stride += Math.hypot(nb.x - ox, nb.z - oz);
    if (stride > 1.45) {
      stride = 0;
      audio.cue('step', 0.8);
    }
  }
}

// ------------------------------------------------------------------ per frame
const knightAd = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: true, hp: 100, state: 'idle', stateT: 0, combo: 0, move: 'light', swingId: 0,
  sinceDash: 9, airHits: 0, slamT: -1, ember: false, lives: 3, airJumps: 1, chargeT: 0, chargeLevel: 0, bufferedAttack: false, bufferedHeavy: false,
  bufferedAimYaw: 0, dashBuffer: 0, coyote: 0, jumpBuffer: 0, dashCd: 0, dashSideWant: 0, dashDir: 0, airDash: true, iframes: 0, hitThisSwing: new Set<number>(),
} as unknown as Knight;

let acc = 0;
let last = performance.now();
let fpsT = 0;
let fpsN = 0;
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;right:10px;bottom:8px;font:12px ui-monospace,monospace;color:#9f9;z-index:30';
if (DEBUG) document.body.appendChild(fpsEl);
const tmp = new THREE.Vector3();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  t += dt;
  SHADOW_FRAME.n++;
  const [lx, ly] = takeLook();
  if (mode === 'play') {
    if (lockT > 0) {
      lockT = Math.min(1, lockT + dt / 0.28);
      const k = lockT * lockT * (3 - 2 * lockT);
      rig.yaw = lockFrom + (lockTo - lockFrom) * k;
      if (lockT >= 1) lockT = 0;
    } else rig.look(lx, ly, save.sens, save.invertY);
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 6) {
      stepSim();
      acc -= DT;
      n++;
    }
    if (n === 6) acc = 0;
  } else if (mode === 'title') rig.orbit = Math.sin(t * 0.08) * 0.25;
  if (mode === 'ending') ending.update(dt);
  if (mode === 'play') hints.update(dt);
  const alpha = mode === 'play' ? acc / DT : 1;
  const s = city.s;
  const b = s.body;
  const bx = prevBody.x + (b.x - prevBody.x) * alpha;
  const by = prevBody.y + (b.y - prevBody.y) * alpha;
  const bz = prevBody.z + (b.z - prevBody.z) * alpha;
  flameAt.set(prevFlame.x + (s.flame.x - prevFlame.x) * alpha, prevFlame.y + (s.flame.y - prevFlame.y) * alpha, prevFlame.z + (s.flame.z - prevFlame.z) * alpha);
  if (mode === 'ending' && flameOverride) flameAt.copy(flameOverride);

  // him
  Object.assign(knightAd, { x: bx, y: by, z: bz, vx: b.vx, vz: b.vz, vy: b.vy, yaw: b.yaw, onGround: b.onGround });
  (knightAd as { state: string }).state = Math.hypot(b.vx, b.vz) > 0.6 ? 'run' : 'idle';
  // in the keep-the-flame ending the flame leaves his hand: his arm comes down once it is far from him
  knight.carry = mode === 'ending' && flameAt.distanceTo(tmp.set(bx, by + 2, bz)) > 1.6 ? null : flameAt;
  knight.update(knightAd, dt, t, smoke, glow, stage.camera);
  knight.root.visible = !bodyHidden && (s.status !== 'dead' || s.statusT < 0.4);

  // the flame and its light
  const vig = mode === 'ending' ? flameOverrideVigor : Math.max(0, s.flame.vigor);
  const fs = flameState(vig);
  held.group.position.copy(flameAt).y -= 0.18;
  // a hint: the flame leans and trembles toward what matters
  lean.t = Math.max(0, lean.t - dt);
  if (lean.t > 0) {
    const a = Math.atan2(lean.z - flameAt.z, lean.x - flameAt.x);
    const k = Math.min(1, lean.t) * (0.18 + 0.05 * Math.sin(t * 23));
    held.group.position.x += Math.cos(a) * k;
    held.group.position.z += Math.sin(a) * k;
  }
  held.strength = fs === 'out' ? (s.flame.relight > 0 ? 1 - s.flame.relight / 1.2 : 0.08) : 0.45 + 0.55 * vig;
  held.update(t, stage.camera);
  halo.position.copy(flameAt);
  const hs = (fs === 'out' ? 0.6 : 2.2 + vig) * (1 + Math.sin(t * 11) * 0.04);
  halo.scale.set(hs, hs, 1);
  (halo.material as THREE.SpriteMaterial).opacity = fs === 'out' ? 0.15 : 0.32;
  const L = knight.torchLight;
  L.position.copy(knight.root.worldToLocal(tmp.copy(flameAt)));
  const flick = 0.9 + 0.07 * Math.sin(t * 19) + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 31);
  L.intensity = (mode === 'ending' ? 62 * vig : fs === 'out' ? 1.5 : fs === 'low' ? 18 + 40 * vig : 62) * flick;
  L.distance = city.radius * 1.7;
  L.shadow.needsUpdate = true;
  if (mode === 'play' && fs !== 'out' && Math.random() < dt * 6)
    glow.emit({ x: flameAt.x, y: flameAt.y + 0.1, z: flameAt.z, vy: 0.9, spread: 0.15, life: 0.9, size: 0.05, sizeEnd: 0.01, r: 4, g: 1.6, b: 0.4, gravity: -0.6, wobble: 0.5 });

  // the city
  dview?.update(dt, t, stage.camera, city, tmp.set(bx, 1.5, bz));
  figs?.update(dt, t, city);
  wrongView.update(dt, t, city, smoke, glow, stage.camera, flameAt);
  markerT = Math.max(0, markerT - dt);
  (marker.material as THREE.SpriteMaterial).opacity = Math.min(1, markerT) * (0.6 + 0.3 * Math.sin(t * 6));
  embers.t = Math.max(0, embers.t - dt);
  if (embers.t > 0 && Math.random() < dt * 30) {
    const k = Math.random();
    glow.emit({ x: bx + (embers.x - bx) * k, y: 0.15, z: bz + (embers.z - bz) * k, vy: 0.4, spread: 0.1, life: 1.6, size: 0.07, sizeEnd: 0.01, r: 4, g: 1.5, b: 0.3, gravity: -0.1 });
  }
  breezeT = Math.max(0, breezeT - dt);
  // the Heart trembles once the five plates are lit
  if (DISTRICTS[di].id === 'heart' && city.flag('plates') && mode !== 'ending') rig.shake(dt * 0.25);
  glow.update(dt, t);
  smoke.update(dt, t);

  // the camera follows him, or the ghost he has stepped into
  const g = s.ghost;
  if (mode === 'ending') {
    /* the ending's shots frame the centre */
  } else if (g) rig.target.set(g.x, 0, g.z);
  else rig.target.set(bx, by, bz);
  rig.grounded = b.onGround;
  // under a vault or a roof the camera stays beneath it
  rig.ceiling = Infinity;
  for (const dc of DISTRICTS[di].decor)
    if ((dc.kind === 'vault' || dc.kind === 'roof') && rig.target.x > dc.x0 - 2 && rig.target.x < dc.x1 + 2 && rig.target.z > dc.z0 && rig.target.z < dc.z1) rig.ceiling = Math.min(rig.ceiling, dc.y - 0.6);
  rig.update(dt, t, city.solids);
  stage.focus.set(bx, by + 1.3, bz);
  stage.update(t, stage.camera.position);
  stage.render();

  // HUD
  hud.update(dt);
  if (mode === 'play' || mode === 'pause') drawHud();
  audioBeds();

  if (DEBUG) {
    fpsN++;
    fpsT += dt;
    if (fpsT > 0.5) {
      fpsEl.textContent = `${Math.round(fpsN / fpsT)} fps · ${stage.renderer.info.render.calls} calls`;
      fpsN = 0;
      fpsT = 0;
    }
  }
}

function drawHud(): void {
  const s = city.s;
  hud.setAsh(s.ash);
  hud.setFlame(flameState(s.flame.vigor), s.flame.vigor);
  hud.setWords(save.words.slice(0, PEOPLE_WORDS + 1).filter(Boolean).length, LAST_WORDS.length);
  const f = s.focus;
  if (s.status === 'fall' && s.ash >= 1) hud.prompt('rewind', 'R', '1 Ash', Math.min(1, s.rewindHold / 0.35));
  else if (!f || s.status !== 'play') hud.prompt(null);
  else
    switch (f.kind) {
      case 'wake':
        hud.prompt('wake his shadow', 'E', '1 Ash');
        break;
      case 'stepIn':
        hud.prompt('hold to step in', 'E', '2 Ash', Math.min(1, s.stepHold / 0.6));
        break;
      case 'spot':
        hud.prompt(f.spot.label, 'E');
        break;
      case 'brazier':
        hud.prompt('rest by the fire', 'E');
        break;
      case 'torch':
        hud.prompt('relight the flame', 'E');
        break;
      case 'lever':
        hud.prompt('try the lever', 'E');
        break;
      case 'riddle':
        hud.prompt('read the inscription', 'E');
        break;
    }
  // the replay's clock
  const r = s.figs.findIndex((x) => x.state !== 'frozen');
  if (r >= 0) {
    const len = DISTRICTS[di].figures[r].clip?.len ?? 10;
    hud.timer(1 - s.figs[r].t / len, s.ghost ? 'STEPPED IN' : 'HIS LAST TEN SECONDS');
  } else hud.timer(null);
  const w = s.wrong;
  const close = w.on && !w.gone && w.dist < 6 && !w.seen && DISTRICTS[di].wrong?.mode !== 'still';
  const near = city.nearestAlign();
  hud.mood(close ? 0.8 : breezeT > 0 ? Math.min(1, breezeT) * 0.5 : 0, near ? near.align * near.align * 0.8 : 0);
}

function audioBeds(): void {
  if (!audio.audioOn()) return;
  const s = city.s;
  const d = DISTRICTS[di];
  const w = s.wrong;
  const silent = mode === 'play' && w.on && !w.gone && w.dist < 6 && d.wrong?.mode !== 'still';
  const near = city.nearestAlign();
  const word = near && d.figures[near.fig].clip === undefined;
  let br = 0;
  let cold = 0;
  d.braziers.forEach((bz) => {
    const k = Math.max(0, 1 - Math.hypot(bz.x - s.body.x, bz.z - s.body.z) / 7);
    if (bz.false) cold = Math.max(cold, k);
    else br = Math.max(br, k);
  });
  audio.setBeds({
    music: mode === 'title' ? 0.6 : silent ? 0 : mode === 'ending' ? 0.5 : 1,
    rumble: d.rumble * (mode === 'ending' ? rumbleK : 1),
    hum: near?.align ?? 0,
    pulse: word ? 2 + (near?.align ?? 0) * 7 : 0,
    breath: w.on && !w.gone && !w.seen && w.dist < 9 && d.wrong?.mode !== 'still' ? 1 - w.dist / 9 : 0,
    brazier: br,
    cold,
    wind: breezeT > 0 ? 0.4 : 0,
  });
}

// ------------------------------------------------------------------ boot
load(di);
rig.snap(TITLE_SHOT);
rig.target.set(city.s.body.x, 0, city.s.body.z);
if (params.has('skip') || BOT) begin();
requestAnimationFrame(frame);

declare global {
  interface Window {
    __still: unknown;
  }
}
window.__still = { get city() { return city; }, rig, stage, hud, load, knight, get mode() { return mode; } };
