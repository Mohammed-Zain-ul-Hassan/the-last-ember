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
import type { Frame } from './sim/types';
import { LAST_WORDS, PEOPLE_WORDS, RIDDLES } from '../data/stillCity';
import { City, DT, type CityEvent, type StillInput } from './sim/city';
import { flameState } from './sim/flame';
import { BRAZIER_POOL, DistrictView, TORCH_LIGHTS } from './render/districtView';
import { FigureViews } from './render/figureView';
import { SCENERY } from './render/scenery';
import { WrongView } from './render/wrongView';
import { StillHud } from './ui/hud';
import { StillMenu } from './ui/menu';
import { persist, save } from './save';
import { clearInput, getTrim, initInput, isHeld, moveVector, onKey, takeLook, takePresses } from './input';
import * as audio from './audio';
import { DISTRICTS } from './data';
import { Bot, quickScript } from './bot';
import { GATE_SCRIPT } from './scripts/gateWard';
import { MARKET_SCRIPT } from './scripts/market';
import { TEMPLE_SCRIPT } from './scripts/temple';
import { LIBRARY_SCRIPT } from './scripts/library';
import { HEART_SCRIPT } from './scripts/heart';
import { HEART } from './data/heart';
import { Ending } from './ending';
import { Hints } from './hints';
import { Guide } from './guide';
import { Captions } from './ui/captions';
import { Narrative } from './narrative/narrative';
import { bus } from './narrative/bus';
import { startRecording, type Recording } from './record';
import { initCursor, requestLock, wantCursorHidden } from '../ui/cursor';

// The Still City. You carry the only fire left in a city that froze mid-breath four thousand years ago. Your flame
// wakes the dead for ten seconds at a time, and something that moves only when unseen follows you.
// (Design: "The Still City: Game Design & Narration", Moeez Abid. Build notes: docs/still-city-build.md.)

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
/** ?bot=1: the game plays itself, start to end (the recorded run). */
const BOT = params.get('bot') === '1';
/** ?rec=1: record the run (canvas and sound) to trailer/raw/ through the dev server. */
const REC = params.get('rec') === '1';
let recording: Recording | null = null;
const SCRIPTS = [GATE_SCRIPT, MARKET_SCRIPT, TEMPLE_SCRIPT, LIBRARY_SCRIPT, HEART_SCRIPT];
let bot: Bot | null = null;

// ------------------------------------------------------------------ the stage
const stage = new Stage(document.getElementById('app')!);
stage.ambientK = 0.38; // the flame is the light here
// only the flame casts shadows in the Still City (the moon's and the dawn sun's maps are not drawn or sampled)
stage.flameOnlyShadows();
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
// everything the player hears is captioned; the narrative engine speaks the lines beats.json ties to events
const captions = new Captions();
const narrative: Narrative = new Narrative((l, pr, lane) => {
  captions.say(l, pr, lane);
  // the Library: it repeats the narrator's line, slightly late (over it, not after it), in its own voice
  const w = city?.s.wrong;
  if (l.voice === 'narrator' && DISTRICTS[di]?.id === 'library' && w?.on && !w.gone && w.dist < 16)
    narrative.sayLine({ id: l.id + '.echo', voice: 'wrong', text: l.text }, pr, 0.9, 'whisper');
});
const menu = new StillMenu({
  resume: () => {
    setPaused(false);
    requestLock();
  },
  lastBrazier: () => {
    setPaused(false);
    city.s.status = 'dead';
    city.s.statusT = 1.6;
  },
  mute: (m) => audio.setMuted(m),
  captions: () => captions.apply(),
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
const guide = new Guide(stage.world);
const hints = new Hints((l, pr) => captions.say(l, pr), (txt) => captions.note(txt), () => city, () => `${DISTRICTS[di].id}:${guide.index}`, {
  glowFigure: (i, sec) => figs?.hint(i, sec),
  ghostReplay: (i) => figs?.ghostReplay(i),
  onPuzzle: () => !!guide.current?.stand,
  brightenRiddle: (sec) => dview?.brightenPlaques(sec),
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
  speak: (l, pr) => captions.say(l, pr),
  emit: (type) => bus.emit({ type }),
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

// the light grows colder and the air closer, district by district (the Rumble is louder each time, too)
const SKIES = [
  { top: '#07060d', horizon: '#16112a', glow: '#40457a', glowY: 0.9, fog: '#09070f', stars: 0.6, disc: 0.035, fogDensity: 0.024 },
  { top: '#05050c', horizon: '#111024', glow: '#363d70', glowY: 0.9, fog: '#07070f', stars: 0.45, disc: 0.03, fogDensity: 0.028 },
  { top: '#030307', horizon: '#0a0a16', glow: '#262c52', glowY: 0.9, fog: '#05050b', stars: 0, disc: 0, fogDensity: 0.034 },
  { top: '#020205', horizon: '#080811', glow: '#1c2244', glowY: 0.9, fog: '#04040a', stars: 0, disc: 0, fogDensity: 0.04 },
  { top: '#020206', horizon: '#0b0c1c', glow: '#2a3466', glowY: 0.95, fog: '#05060e', stars: 0.25, disc: 0.0, fogDensity: 0.036 },
];
const AMBIENT = [0.7, 0.6, 0.44, 0.38, 0.48];

function load(i: number, ash?: number): void {
  di = i;
  dview?.dispose();
  figs?.group.removeFromParent();
  const d = DISTRICTS[i];
  city = new City(d, save.words, ash);
  stage.setSky(SKIES[d.index], 1);
  stage.ambientK = AMBIENT[d.index];
  wrongView.mirror = d.wrong?.mode === 'face' || d.wrong?.mode === 'final';
  // ?quick=1: the main path only (the sequence figures at the Heart and the Temple's priests are puzzles, kept)
  const script = params.get('quick') === '1' ? quickScript(SCRIPTS[i], d.figures, ['old', 'dancer', 'twin']) : SCRIPTS[i];
  bot = BOT ? new Bot(script, d.start.yaw) : null;
  hints.reset();
  humFor.clear();
  captions.clear();
  narrative.clear();
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
const said = new Set<string>(); // one-time tutorial notes already shown
function noteOnce(key: string, text: string, delay = 0): void {
  if (said.has(key)) return;
  said.add(key);
  if (delay) setTimeout(() => captions.note(text), delay * 1000);
  else captions.note(text);
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
  <div class="keys">WASD walk &nbsp;·&nbsp; move the mouse to look and aim the flame &nbsp;·&nbsp; E wake &nbsp;·&nbsp; Shift draw the flame back &nbsp;·&nbsp; Esc pause</div>`;
document.body.appendChild(title);

const TITLE_SHOT: Shot = { yaw: -0.9, height: 1.6, dist: 6.2, lookY: 1.8, fov: 40 };

function begin(): void {
  if (mode !== 'title') return;
  audio.initAudio();
  if (!BOT) requestLock(); // inside the click or key that began it: the one moment a lock is granted without asking
  title.classList.add('off');
  mode = 'play';
  hud.show(true);
  clearInput();
  enterDistrict(true);
}

// ------------------------------------------------------------------ the one cinematic: a short look at each place
// (the brief: cutscenes minimal, the story told in play). Two letterboxed views, about five seconds, skippable.
let cine: { frames: Frame[]; i: number; t: number } | null = null;
function establish(): void {
  const d = DISTRICTS[di];
  // a crane over him and his flame, looking down the place he has come to (lit by the fire he carries), easing
  // down behind him as play begins
  const sy = d.start.yaw;
  const back = Math.atan2(-Math.cos(sy), -Math.sin(sy));
  const at: [number, number, number] = [d.start.x + Math.cos(sy) * 3, 0, d.start.z + Math.sin(sy) * 3];
  const frames: Frame[] = [
    { at, yaw: back - 0.55, height: 7.5, dist: 9, lookY: 0.6, fov: 54, dur: 3 },
    { at: [d.start.x, 0, d.start.z], yaw: back + 0.3, height: 3.2, dist: 6.5, lookY: 1.7, fov: 50, dur: 3.2 },
  ];
  cine = { frames, i: 0, t: 0 };
  hud.letterbox(true);
  hud.root.classList.add('cine');
  stage.setCinematic(true);
  frameShot(0, 0.01);
}
function frameShot(i: number, dur: number): void {
  const f = cine!.frames[i];
  rig.target.set(...f.at);
  rig.go({ yaw: f.yaw, height: f.height, dist: f.dist, lookY: f.lookY, fov: f.fov }, dur);
}
function endCine(): void {
  if (!cine) return;
  cine = null;
  hud.letterbox(false);
  hud.root.classList.remove('cine');
  stage.setCinematic(false);
  const b = city.s.body;
  rig.target.set(b.x, b.y, b.z);
  rig.follow(1.6, DISTRICTS[di].start.yaw);
  clearInput();
}
function updateCine(dt: number): void {
  if (!cine) return;
  cine.t += dt;
  const f = cine.frames[cine.i];
  if (cine.t >= (f.dur ?? 3.2) * 0.8) {
    cine.t = 0;
    cine.i++;
    if (cine.i >= cine.frames.length) endCine();
    else frameShot(cine.i, 2.4);
  }
}

function enterDistrict(first: boolean): void {
  const d = DISTRICTS[di];
  establish();
  bus.setDistrict(d.id);
  if (first && di === 0) bus.emit({ type: 'start' });
  bus.emit({ type: 'enter' });
  hud.card(['I', 'II', 'III', 'IV', 'V'][d.index] ?? '', d.name.toUpperCase(), d.sub, 6);
  audio.cue('drip');
  bus.emit({ type: 'drip' });
}

function nextDistrict(): void {
  if (mode !== 'play') return;
  mode = 'transition';
  hud.veil(true);
  setTimeout(() => {
    load(di + 1, city.s.ash);
    hud.veil(false);
    mode = 'play';
    enterDistrict(false);
  }, 1600);
}

// ------------------------------------------------------------------ input
initInput(stage.renderer.domElement);
// the cursor hides (and the pointer locks) while the game is played; Esc releases it and pauses; a click takes it back
initCursor(
  stage.renderer.domElement,
  () => {
    if (mode === 'play') setPaused(true);
  },
  'Click to take the flame',
);
// a click anywhere starts it (the title lies over the canvas)
document.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('#sc-menu, #sc-choice, #sc-credits')) return;
  if (cine) endCine();
  else if (mode === 'title' && !REC) begin();
  audio.initAudio();
});
onKey((code) => {
  if (cine && (code === 'Space' || code === 'Enter' || code === 'Escape')) return endCine();
  if (mode === 'title' && (code === 'Enter' || code === 'Space' || code === 'KeyE')) begin();
  if (code === 'Escape') setPaused(mode === 'play');
  if (code === 'KeyH' && mode === 'play') {
    hints.ask();
    guide.ask();
  }
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

// falling stones (the collapse, the Heart): seen dropping through the dust for the 0.9 s before they land
const stones: { mesh: THREE.Mesh; x: number; z: number; t: number }[] = [];
const STONE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.9 });
function dropStone(x: number, z: number): void {
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + Math.random() * 0.18, 0), STONE_MAT);
  mesh.castShadow = true;
  stage.world.add(mesh);
  stones.push({ mesh, x, z, t: 0 });
  for (let k = 0; k < 8; k++) smoke.emit({ x: x + (Math.random() - 0.5), y: 7 + Math.random() * 2, z: z + (Math.random() - 0.5), vy: -2.5, spread: 0.3, life: 1.3, size: 0.3, sizeEnd: 0.7, r: 0.1, g: 0.09, b: 0.09, alpha: 0.45, drag: 0.5 });
}
function updateStones(dt: number): void {
  for (let i = stones.length - 1; i >= 0; i--) {
    const st = stones[i];
    st.t += dt;
    const y = Math.max(0.25, 9 - 0.5 * 11 * st.t * st.t);
    st.mesh.position.set(st.x, y, st.z);
    st.mesh.rotation.x += dt * 3;
    if (st.t > 3) {
      st.mesh.removeFromParent();
      st.mesh.geometry.dispose();
      stones.splice(i, 1);
    }
  }
}

let stride = 0;
function handle(e: CityEvent): void {
  const d = DISTRICTS[di];
  switch (e.type) {
    case 'found': {
      const f = d.figures[e.fig];
      audio.cue('found');
      hints.progress();
      if (f.word !== undefined) {
        const known = save.words[f.word];
        save.words[f.word] = true;
        persist();
        if (!known) narrative.say(`word.${f.word + 1}`, 2);
      }
      bus.emit({ type: 'shadowLit', fig: f.id, word: f.word });
      if (f.clip) noteOnce('tut.wake', 'His shadow is at its true angle. E wakes it, for 1 Ash.', 1.5);
      break;
    }
    case 'wake':
      audio.cue('wake');
      hints.progress();
      bus.emit({ type: 'wake', fig: d.figures[e.fig].id });
      if (d.figures[e.fig].stepIn) noteOnce('tut.step', 'Hold E to step into his last ten seconds (2 Ash). Do what he did.', 1.8);
      break;
    case 'replayEnd':
      audio.cue('replayEnd');
      bus.emit({ type: 'replayEnd', fig: d.figures[e.fig].id });
      break;
    case 'stepIn':
      audio.cue('stepIn');
      bus.emit({ type: 'stepIn', fig: d.figures[e.fig].id });
      break;
    case 'stepOut':
      audio.cue('stepOut');
      break;
    case 'spot':
      if (e.ok) audio.cue('lever');
      else {
        audio.cue('barFail');
        hints.failed();
        if (e.msg) captions.note(e.msg, 2);
      }
      break;
    case 'seqStep':
      audio.cue('found', 0.6);
      hints.progress();
      break;
    case 'seqFail':
      audio.cue('barFail');
      captions.note('The hours fall out of order. Begin again.', 2);
      hints.failed();
      break;
    case 'pageSide': {
      const pg = d.pages[e.i];
      hud.riddle('a page, lit from the side', pg.lie);
      bus.emit({ type: 'pageSide', page: pg.id });
      break;
    }
    case 'pageRead': {
      const pg = d.pages[e.i];
      hud.riddle('the same page, lit from above', pg.truth);
      audio.cue('found');
      save.words[pg.word] = true;
      persist();
      bus.emit({ type: 'pageRead', page: pg.id });
      narrative.say(`word.${pg.word + 1}`, 2, 2.5);
      hints.progress();
      break;
    }
    case 'wrongLit':
      bus.emit({ type: 'wrongLit' });
      break;
    case 'flag': {
      if (e.id === 'heart') startEnding();
      hints.progress();
      for (const m of d.mechs)
        if (m.opens === e.id && m.kind !== 'lever') {
          audio.cue(m.kind === 'portcullis' ? 'portcullis' : 'gate');
          bus.emit({ type: 'mech', kind: m.kind, id: m.id });
        }
      bus.emit({ type: 'flag', id: e.id });
      break;
    }
    case 'brazier':
      audio.cue('brazier');
      bus.emit({ type: 'brazier', first: e.first, id: d.braziers[e.i].id });
      if (e.first) noteOnce('tut.brazier', 'Ash restored. If you fall, you wake here.');
      break;
    case 'falseBrazier':
      audio.cue('falseBrazier');
      bus.emit({ type: 'falseBrazier' });
      break;
    case 'relight':
      audio.cue('relight');
      break;
    case 'relit':
      bus.emit({ type: 'relit' });
      break;
    case 'flameLow':
      audio.cue('flameLow');
      bus.emit({ type: 'flameLow' });
      break;
    case 'flameOut':
      audio.cue('flameOut');
      bus.emit({ type: 'flameOut' });
      noteOnce('tut.out', 'The flame is out. Find a torch on the walls and relight it (E).', 2);
      break;
    case 'noAsh':
      audio.cue('noAsh');
      captions.note(`Not enough Ash (${e.need} needed). Rest at a brazier.`, 2);
      break;
    case 'rewind':
      audio.cue('rewind');
      hud.flash();
      break;
    case 'fall':
      audio.cue('fall');
      if (city.s.ash >= 1) captions.note('Hold R to rewind.', 3);
      break;
    case 'dead':
      audio.cue('death');
      bus.emit({ type: 'death', cause: e.cause });
      hints.failed();
      hud.veil(true);
      break;
    case 'respawn':
      hud.veil(false);
      rig.follow(0.6);
      bot?.restart();
      break;
    case 'wrongSeen':
      audio.cue('wrongSeen');
      bus.emit({ type: 'wrongSeen' });
      break;
    case 'wrongShift':
      setTimeout(() => audio.cue('stepLate', 0.8), 180);
      bus.emit({ type: 'wrongShift' });
      break;
    case 'wrongStep':
      setTimeout(() => audio.cue('stepLate', 0.8), 180);
      break;
    case 'caught':
      audio.cue('caught');
      rig.shake(0.6);
      bus.emit({ type: 'caught', n: e.n });
      hints.caught();
      noteOnce('tut.caught', 'It moves only when it is unseen and unlit. Turn the light on it: right click (Flame Lock).', 1);
      break;
    case 'gustWarn':
      audio.cue('gustWarn');
      bus.emit({ type: 'gustWarn' });
      noteOnce('tut.gust', 'Wind. Draw the flame back (Shift) to shelter it.');
      break;
    case 'gust':
      audio.cue('gust');
      if (e.hit) rig.shake(0.25);
      break;
    case 'debrisWarn':
      audio.cue('collapse', 0.25);
      bus.emit({ type: 'debrisWarn' });
      dropStone(e.x, e.z);
      break;
    case 'debris':
      audio.cue('collapse', 0.5);
      for (let k = 0; k < 14; k++)
        smoke.emit({ x: e.x + (Math.random() - 0.5) * 0.8, y: 0.2, z: e.z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 1 + Math.random(), spread: 0.3, life: 1.2, size: 0.6, sizeEnd: 1.4, r: 0.09, g: 0.08, b: 0.08, alpha: 0.5, drag: 2 });
      if (e.hit) rig.shake(0.4);
      break;
    case 'riddle': {
      const r = d.riddles[e.i];
      const rd = r.text ? { where: 'an inscription', text: r.text } : RIDDLES[r.id as keyof typeof RIDDLES];
      hud.riddle(rd.where, rd.text);
      audio.cue('riddle');
      bus.emit({ type: 'riddleRead', id: r.id });
      hints.riddleRead(r.puzzle);
      break;
    }
    case 'frozenTry': {
      const m = d.mechs[e.mech];
      if (m.frozenMsg) captions.note(m.frozenMsg, 2);
      audio.cue('noAsh');
      break;
    }
    case 'line':
      bus.emit({ type: 'line', id: e.id });
      break;
    case 'plate':
      audio.cue('plate');
      break;
    case 'bridge':
      audio.cue(e.on ? 'bridgeOn' : 'bridgeOff');
      bus.emit({ type: 'bridge', on: e.on });
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
let creditsT = 0;
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
  if (cine) updateCine(dt);
  // no cursor while the game is played (or a shot plays); paused, the title, the ending's choice and the credits show it
  wantCursorHidden(!BOT && (mode === 'play' || !!cine) && !menu.open);
  if (mode === 'play' && !cine) {
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
  if (mode === 'ending') {
    ending.update(dt);
    if (ending.phase === 'credits' && recording) {
      creditsT += dt;
      if (creditsT > 8) {
        const r = recording;
        recording = null;
        void r.stop().then((txt) => ((window as unknown as { __recDone: string }).__recDone = txt));
      }
    }
  }
  if (mode === 'play' && !cine) {
    hints.update(dt);
    trackAttempts(dt);
  }
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
  // the fire is drawn on his palm, where his arm actually reached (the sim's point is within a few centimetres)
  if (knight.carry && knight.root.visible) knight.handPos(flameAt).y += 0.1;

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
  SCENERY.uFlame.value.copy(flameAt);
  SCENERY.uLight.value = vig;
  SCENERY.uTime.value = t;
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
  updateStones(dt);

  // the camera follows him, or the ghost he has stepped into
  const g = s.ghost;
  if (mode === 'ending' || cine) {
    /* the ending's shots, and the establishing shot, frame their own places */
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
  if (mode !== 'pause') {
    captions.update(dt);
    narrative.update(dt);
  }
  guide.update(dt, t, city, flameAt, hud, glow, mode === 'play' && !cine);
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

const humFor = new Set<number>();
const shutSaid = new Map<string, number>();
let wasClose = false;
let wasBehind = false;
let dripT = -99;
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
  const close = w.on && !w.gone && w.dist < 6 && DISTRICTS[di].wrong?.mode !== 'still';
  const near = city.nearestAlign();
  hud.mood(close ? 0.8 : breezeT > 0 ? Math.min(1, breezeT) * 0.5 : 0, near ? near.align * near.align * 0.8 : 0);
  // the warmth ring: how near the flame is to the true angle of the shadow in front of him
  const ring = mode === 'play' && s.status === 'play' && !s.ghost && near && near.align > 0.12 && !s.figs[near.fig].locked ? near.align : null;
  // standing in the guide's ring, the flame says plainly what is left: turn, lower, raise, hold
  const coach = mode === 'play' && !cine ? guide.coach : null;
  hud.align(coach ? Math.max(0.05, near?.align ?? 0.05) : ring, coach);
  if (ring !== null && ring > 0.55 && !humFor.has(near!.fig)) {
    humFor.add(near!.fig);
    bus.emit({ type: 'aligning' });
  }
  // near a brazier: its sound captioned as he approaches (a warm crackle, or a false one's cold hum)
  if (mode === 'play') {
    let cold = 0;
    let warm = 0;
    for (const bz of DISTRICTS[di].braziers) {
      const k = Math.max(0, 1 - Math.hypot(bz.x - s.body.x, bz.z - s.body.z) / 7);
      if (bz.false) cold = Math.max(cold, k);
      else warm = Math.max(warm, k);
    }
    if (cold > 0.55 && !nearCold) bus.emit({ type: 'nearFalse' });
    if (warm > 0.55 && !nearWarm) bus.emit({ type: 'nearWarm' });
    nearCold = cold > 0.55;
    nearWarm = warm > 0.55;
  }
  // a shut way: say plainly what opens it (once, then again only after a while)
  if (mode === 'play' && !cine) {
    for (const m of DISTRICTS[di].mechs) {
      if (!m.shutMsg || city.mechOpen(m) || Math.hypot(m.x - s.body.x, m.z - s.body.z) > 4.5) continue;
      if (t - (shutSaid.get(m.id) ?? -99) > 25) {
        shutSaid.set(m.id, t);
        captions.note(m.shutMsg, 2);
      }
    }
  }
  // sound cues the captions name: the silence when it is close, its breath behind him, water before an action beat
  if (mode === 'play') {
    if (close && !wasClose) bus.emit({ type: 'silence' });
    wasClose = close;
    const behind = w.on && !w.gone && !w.seen && w.dist < 7 && DISTRICTS[di].wrong?.mode !== 'still';
    if (behind && !wasBehind) bus.emit({ type: 'breath' });
    wasBehind = behind;
    for (const [dx, dz] of DISTRICTS[di].drips ?? [])
      if (Math.hypot(dx - s.body.x, dz - s.body.z) < 9 && t - dripT > 7) {
        dripT = t;
        audio.cue('drip');
        bus.emit({ type: 'drip' });
      }
  }
}

let nearCold = false;
let nearWarm = false;
// a failed attempt at a true angle: the flame held near it a while, then given up (the hints count these)
let tryFig = -1;
let tryT = 0;
let tryPeak = 0;
function trackAttempts(dt: number): void {
  const near = city.nearestAlign();
  if (near && near.align > 0.5 && !city.s.figs[near.fig].locked && DISTRICTS[di].figures[near.fig].puzzle) {
    if (tryFig !== near.fig) {
      tryFig = near.fig;
      tryT = 0;
      tryPeak = 0;
    }
    tryT += dt;
    tryPeak = Math.max(tryPeak, near.align);
  } else {
    if (tryFig >= 0 && tryT > 1.5 && !city.s.figs[tryFig]?.locked && (!near || near.fig !== tryFig || near.align < 0.3)) {
      hints.failed();
      tryFig = -1;
    }
    if (!near || near.align < 0.3) tryFig = -1;
  }
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
    rain: d.rain ? 1 : 0,
  });
}

// ------------------------------------------------------------------ boot
load(di);
rig.snap(TITLE_SHOT);
rig.target.set(city.s.body.x, 0, city.s.body.z);
if (REC) {
  // the recording opens on the title, then the run begins (sound needs the page to have been touched: the bot run
  // is started by a click on the canvas, which also starts the audio)
  const go = async () => {
    audio.initAudio();
    await new Promise((r) => setTimeout(r, 300));
    recording = await startRecording(stage.renderer.domElement, audio.audioStream(), params.get('name') ?? 'still-city-run');
    (window as unknown as { __recStop: () => Promise<string> | undefined }).__recStop = () => recording?.stop();
    setTimeout(begin, 5000);
  };
  document.addEventListener('pointerdown', () => void go(), { once: true });
} else if (params.has('skip') || BOT) begin();
requestAnimationFrame(frame);

declare global {
  interface Window {
    __still: unknown;
  }
}
window.__still = { get city() { return city; }, rig, stage, hud, load, knight, get mode() { return mode; } };
