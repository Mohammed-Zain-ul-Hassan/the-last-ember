import './style.css';
import * as THREE from 'three';
import { initAudio, isMuted, setBeds, setMood, setMuted, sfx } from './audio/sfx';
import { CFG } from './config';
import { CHAPTERS, DAWN_SKY, MIDNIGHT_SKY } from './data/chapters';
import { playEvents, type FxTargets } from './fx';
import { clearInput, initInput, onKey, readInput } from './input';
import { CameraRig, CARD_SHOT, DAWN_SHOT, ENDING_SHOT, GAMEPLAY_SHOT, MIDNIGHT_SHOT, REVEAL_SHOTS, TITLE_SHOT, TORCH_SHOT } from './render/cameraRig';
import { Hearth } from './render/hearth';
import { KnightView, setKnightFade } from './render/knightView';
import { Particles } from './render/particles';
import { ShadeViews } from './render/shadeView';
import { LevelView } from './render/levelView';
import { Stage } from './render/stage';
import { glowTexture, rampTexture } from './render/textures';
const glowTex = glowTexture();
import { botInput } from './sim/bot';
import { NO_INPUT, World, type Input, type WorldOpts } from './sim/world';
import { Hud } from './ui/hud';
import { WorldUi } from './ui/worldUi';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DEMO = params.get('demo') === '1';
let seed = Number(params.get('seed') ?? 1) || 1;
if (params.get('capture') === '1') document.body.classList.add('capture');

// ------------------------------------------------------------------ setup
const stage = new Stage(document.getElementById('app')!);
const rig = new CameraRig(stage.camera);
const glow = new Particles(3500, true);
const smoke = new Particles(2400, false);
stage.scene.add(smoke.points, glow.points);
const hearth = new Hearth(CFG.hearth.x);
stage.world.add(hearth.group);
const knight = new KnightView();
stage.world.add(knight.root);
stage.outline.selection.set(knight.outlineTargets);
const shadeViews = new ShadeViews();
stage.world.add(shadeViews.group);
const hud = new Hud();
const worldUi = new WorldUi(stage.camera);
let timeScale = 1;
let slowT = 0;
const fx: FxTargets = {
  rig, glow, smoke,
  flash: (s, c) => hud.flash(s, c),
  slowmo: (scale, seconds) => {
    timeScale = scale;
    slowT = seconds;
  },
};

// sunlit ground for the dawn choice: a warm additive wash right of the sun's edge
const sunWash = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 5),
  new THREE.MeshBasicMaterial({ map: rampTexture(), color: new THREE.Color(1.2, 0.75, 0.42), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
);
sunWash.rotation.x = -Math.PI / 2;
sunWash.position.y = 0.03;
stage.scene.add(sunWash);

const fitParticles = () => {
  glow.setScale(stage.viewportHeightPx, stage.camera.fov);
  smoke.setScale(stage.viewportHeightPx, stage.camera.fov);
};
window.addEventListener('resize', fitParticles);

type Mode = 'title' | 'intro' | 'play' | 'outro' | 'lost' | 'paused' | 'midnight' | 'dawn' | 'choice' | 'ending' | 'credits';
let mode: Mode = 'title';
let modeT = 0;
let chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, Number(params.get('chapter') ?? 0) || 0));
let world = new World(chapterIndex, seed);
let godMode = false;
let pausedFrom: Mode = 'play';
let ending: 'light' | 'shadow' | null = null;
let sunEdge = 30;
let choiceHold = 0;
let beat = -1; // index of the last scripted beat fired in a timeline
const midnightIndex = CHAPTERS.findIndex((c) => c.phase === 'torch');

function setMode(m: Mode): void {
  mode = m;
  modeT = 0;
  beat = -1;
}

/** Fire timeline beats once each: at(1.5, () => ...). */
function at(time: number, idx: number, fn: () => void): void {
  if (modeT >= time && beat < idx) {
    beat = idx;
    fn();
  }
}

function applyPhase(i: number): void {
  const torch = CHAPTERS[i].phase !== 'hearth';
  knight.setTorch(torch);
  hearth.setLit(!torch);
  hearth.strength = torch ? 0 : 1;
}

let levelView: LevelView | null = null;
/** Build the place for the current world (only when the place changes). */
function ensureLevel(): void {
  if (levelView && levelView.id === world.level.id) return;
  levelView?.dispose();
  levelView = new LevelView(world.level);
  stage.world.add(levelView.group);
  hearth.group.visible = world.level.hearthX !== undefined;
}

function startChapter(i: number, quick = false, opts: WorldOpts = {}): void {
  chapterIndex = i;
  world = new World(i, seed, opts);
  ensureLevel();
  shadeViews.clear();
  worldUi.clear();
  clearInput();
  applyPhase(i);
  setKnightFade(1);
  stage.outline.edgeStrength = 3.2;
  setMood('night');
  stage.dawn = 0;
  rig.fitSpan = true;
  const c = world.chapter;
  hud.card(c.roman, c.title, c.line);
  hud.show(false);
  hud.choice(false);
  knight.pose = 'kneel';
  rig.go(CARD_SHOT, quick ? 0.6 : 1.6);
  setMode('intro');
  if (quick) modeT = 2.4;
  sfx('bell');
}

/** Fallen: on the road, rise again at the last lit brazier; on the grounds, the hour begins again. */
function retry(): void {
  if (world.road && world.checkpointsLit > 0) startChapter(chapterIndex, true, { startX: world.respawnX, checkpointsLit: world.checkpointsLit });
  else startChapter(chapterIndex, true);
}

// ------------------------------------------------------------------ places: names and reveal shots
const seenRegions = new Set<string>();
let revealT = 0;
function regionHere(): { x0: number; kind: string; name?: string; sub?: string } | undefined {
  const x = world.knight.x;
  return world.level.regions.find((r) => x >= r.x0 && x < r.x1);
}
function placeCheck(dt: number): void {
  if (revealT > 0) {
    revealT -= dt;
    if (revealT <= 0) {
      rig.fitSpan = true;
      rig.go(world.torch ? TORCH_SHOT : GAMEPLAY_SHOT, 1.4);
    }
    return;
  }
  const r = regionHere();
  if (!r?.name) return;
  const key = `${world.level.id}:${r.x0}`;
  if (seenRegions.has(key)) return;
  seenRegions.add(key);
  hud.place(r.name, r.sub ?? '');
  const shot = REVEAL_SHOTS[r.kind];
  if (shot) {
    rig.fitSpan = false;
    rig.go(shot, 1.2);
    revealT = 2.9;
  }
}

function beginPlay(): void {
  hud.hideCard();
  hud.show(true);
  // the place he starts in is named, not revealed (the hour card already swung the camera)
  seenRegions.clear();
  revealT = 0;
  const r0 = regionHere();
  if (r0?.name) {
    seenRegions.add(`${world.level.id}:${r0.x0}`);
    hud.place(r0.name, r0.sub ?? '');
  }
  knight.pose = 'stand';
  rig.minSpan = world.torch ? 13 : 17.5;
  rig.go(world.torch ? TORCH_SHOT : GAMEPLAY_SHOT, 2.2);
  setMode('play');
}

function restartAll(): void {
  ending = null;
  stage.dawn = 0;
  sunEdge = 30;
  startChapter(0);
}

/** Embers, braziers and the gate: toasts, sounds and the level's props. */
function journeyEvents(): void {
  for (const e of world.events) {
    switch (e.type) {
      case 'shrine':
        hud.toast(e.x < world.knight.x ? '← an ember wakes in the ruins' : 'an ember wakes in the ruins →');
        sfx('ui');
        break;
      case 'ember':
        worldUi.pop('an ember', e.x, e.y + 2.4, 'soul', 0);
        hud.toast('carry it home to the hearth');
        sfx('ignite');
        break;
      case 'feed':
        worldUi.pop(`+${CFG.hearth.emberHeal} the hearth drinks`, e.x, 3.4, 'soul big', 0);
        hud.flash(0.25, '#ffb070');
        sfx('ignite');
        break;
      case 'checkpoint':
        hud.toast('a brazier is lit · you will rise here');
        sfx('ignite');
        break;
      case 'gate':
        if (levelView) levelView.gateTarget = e.open ? 1 : 0;
        if (e.open) hud.toast('the doors open');
        break;
    }
  }
}

// ------------------------------------------------------------------ input
initInput(stage.renderer.domElement);
onKey((code) => {
  initAudio();
  if (code === 'KeyM') return setMuted(!isMuted());
  switch (mode) {
    case 'title':
      sfx('ui');
      hud.title(false);
      startChapter(chapterIndex);
      return;
    case 'intro':
      if (modeT > 0.8) modeT = Math.max(modeT, 3.8);
      return;
    case 'midnight':
      if (modeT > 2 && modeT < 9) {
        modeT = 9;
        beat = Math.max(beat, 2);
        knight.setTorch(true);
        hearth.setLit(false);
      }
      return;
    case 'lost':
      if (modeT > 0.8 && (code === 'KeyR' || code === 'Enter' || code === 'Space')) retry();
      return;
    case 'credits':
      if (modeT > 1.5 && (code === 'Enter' || code === 'KeyR')) restartAll();
      return;
    case 'paused':
      if (code === 'Escape' || code === 'KeyP') {
        hud.hideCard();
        setMode(pausedFrom);
      }
      return;
    case 'play':
      if (code === 'Escape' || code === 'KeyP') pause();
      else if (code === 'KeyR') startChapter(chapterIndex, true);
      return;
  }
});
window.addEventListener('blur', () => {
  if (mode === 'play' && !DEMO) pause();
});

function pause(): void {
  pausedFrom = mode;
  hud.card('', 'Paused', 'The fire waits for no one, but it will wait for you.', 'Esc to return  ·  R to restart the hour  ·  M mute');
  setMode('paused');
}

// ------------------------------------------------------------------ scripted scenes
let simAcc = 0;
/**
 * Advance the sim in fixed 1/60 s steps. `source` is asked for input once per step that actually runs, so a key
 * pressed on a frame where no step runs (high-refresh displays) stays latched for the next step instead of being lost.
 */
function stepSim(source: Input | (() => Input), dt: number): void {
  simAcc += dt;
  let first = true;
  while (simAcc >= CFG.dt) {
    simAcc -= CFG.dt;
    let input: Input;
    if (typeof source === 'function') input = source();
    else {
      input = first ? source : { ...source, jump: false, attack: false, heavy: false, dash: false };
      first = false;
    }
    if (godMode) {
      world.knight.iframes = Math.max(world.knight.iframes, 0.2);
      world.hearthHp = Math.max(world.hearthHp, 50);
    }
    world.step(input);
    playEvents(world.events, fx);
    worldUi.events(world.events, world);
    journeyEvents();
    for (const e of world.events) {
      if (e.type === 'hit') {
        shadeViews.hit(e.id);
        hud.hit();
      }
    }
    if (world.status !== 'playing') break;
  }
}

/** Walk the knight towards x during cutscenes (drives the sim so animation stays consistent). */
function walkTo(x: number, dt: number): boolean {
  const dx = x - world.knight.x;
  const done = Math.abs(dx) < 0.25;
  stepSim(done ? NO_INPUT : { ...NO_INPUT, right: dx > 0, left: dx < 0 }, dt);
  return done;
}

function midnight(dt: number): void {
  world.spawning = false;
  world.endless = true;
  world.status = 'playing';
  const arrived = modeT > 0.2 ? walkTo(-1.6, dt) : false;
  if (arrived && world.knight.facing < 0) stepSim({ ...NO_INPUT, right: true }, CFG.dt);
  stage.setSky(MIDNIGHT_SKY, Math.min(1, dt * 0.5));
  // the hearth gutters
  if (modeT < 4.6) {
    const p = Math.min(1, modeT / 4.2);
    hearth.strength = Math.max(0.08, (1 - p) * 0.55 * (0.6 + 0.4 * Math.abs(Math.sin(modeT * 9.1) * Math.sin(modeT * 3.3))));
    hearth.flameTop = 1.4 + 0.9 * (1 - p);
  }
  at(0.0, 0, () => {
    hud.show(false);
    rig.fitSpan = false;
    rig.go(MIDNIGHT_SHOT, 2.5);
    sfx('gutter');
    setMood('silent');
  });
  at(1.0, 1, () => hud.card('XII', 'Midnight', 'The hearth is dying. Take its fire before it goes.'));
  at(3.4, 2, () => {
    knight.pose = 'kneel';
    hud.hideCard();
  });
  at(4.6, 3, () => {
    // the ancient fire passes into the torch
    knight.setTorch(true);
    hearth.setLit(false);
    hearth.strength = 0;
    sfx('ignite');
    hud.flash(0.55, '#ffb070');
    rig.kick(1.2);
    rig.shake(0.3);
    const hx = CFG.hearth.x;
    for (let i = 0; i < 90; i++)
      glow.emit({ x: hx + (Math.random() - 0.5) * 1.5, y: 1.3, vx: (world.knight.x - hx) * 1.6 + (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, spread: 0.6, life: 1.1, size: 0.12, sizeEnd: 0.02, r: 5, g: 2.2, b: 0.5, gravity: 3, drag: 0.8 });
    for (let i = 0; i < 40; i++)
      smoke.emit({ x: hx + (Math.random() - 0.5), y: 1.3, vy: 1.5, spread: 0.8, life: 3.5, size: 0.9, sizeEnd: 2.4, r: 0.03, g: 0.025, b: 0.035, alpha: 0.4, drag: 0.4 });
  });
  at(5.6, 4, () => hud.card('XII', 'Midnight', 'The hearth is ash. Its fire lives in your hand now.'));
  at(7.2, 5, () => {
    knight.pose = 'stand';
    setMood('night');
  });
  at(9.6, 6, () => startChapter(midnightIndex));
}

function dawn(dt: number): void {
  stage.setSky(DAWN_SKY, Math.min(1, dt * 0.45));
  stage.dawn = Math.min(1, modeT / 5);
  at(0, 0, () => {
    hud.show(false);
    rig.go(DAWN_SHOT, 3);
    sfx('dawn');
    setMood('dawn');
    world = new World(chapterIndex, seed, { startX: knightX, startY: knightY, checkpointsLit: world.checkpointsLit });
    dawnBase = knightX;
    sunEdge = dawnBase + 30;
    world.spawning = false;
    world.endless = true;
    shadeViews.clear();
  });
  at(0.6, 1, () => hud.card('', 'Dawn', 'The sun returns. It will not spare a shadow.'));
  at(5.0, 2, () => hud.hideCard());
  stepSim(NO_INPUT, dt);
  if (modeT > 5.8) {
    setMode('choice');
    choiceHold = 0;
    rig.minSpan = 17.5;
    rig.go(GAMEPLAY_SHOT, 2.5);
  }
}
let knightX = 0;
let knightY = 0;
let dawnBase = 0;

function choice(dt: number): void {
  stage.dawn = 1;
  stage.setSky(DAWN_SKY, Math.min(1, dt));
  const target = dawnBase + 2.5;
  sunEdge += (target - sunEdge) * Math.min(1, dt * 0.9);
  hud.choice(modeT > 0.6);
  stepSim(DEMO ? { ...NO_INPUT, right: true } : () => ({ ...readInput(), attack: false, heavy: false }), dt);
  const k = world.knight;
  const inLight = k.x > sunEdge + 0.4;
  const inShadow = k.x < dawnBase - 4.4; // back into the shadow of the gatehouse
  choiceHold = inLight || inShadow ? choiceHold + dt : 0;
  if (choiceHold > 1.1) {
    ending = inLight ? 'light' : 'shadow';
    hud.choice(false);
    setMode('ending');
  }
}

function endingScene(dt: number): void {
  const light = ending === 'light';
  stage.dawn = 1;
  at(0, 0, () => {
    rig.go(ENDING_SHOT, 4);
    rig.fitSpan = false;
    if (light) sfx('dissolve');
  });
  if (light) {
    stepSim(NO_INPUT, dt);
    at(0.4, 1, () => (knight.pose = 'kneel'));
    const p = Math.max(0, Math.min(1, (modeT - 1.6) / 5));
    setKnightFade(1 - p);
    stage.outline.edgeStrength = 3.2 * (1 - p);
    if (p > 0 && p < 1) {
      const k = world.knight;
      for (let i = 0; i < 6; i++)
        glow.emit({ x: k.x + (Math.random() - 0.5) * 1.0, y: k.y + Math.random() * 2.2, z: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), vx: -0.4, spread: 0.3, life: 2.4, size: 0.12, sizeEnd: 0.02, r: 4, g: 3.2, b: 2.2, gravity: -0.6, wobble: 0.8 });
    }
    at(1.0, 2, () => hud.card('', '', 'He stepped into the light.'));
    at(5.5, 3, () => hud.card('', '', 'For a moment, he remembered every name.'));
    at(10, 4, () => hud.card('', '', 'The ember lives. The knight does not.'));
  } else {
    sunEdge += (dawnBase - 4.5 - sunEdge) * Math.min(1, dt * 0.5);
    const arrived = walkTo(dawnBase - 5.2, dt);
    at(0.2, 1, () => hud.card('', '', 'He turned from the light.'));
    if (arrived) knight.pose = 'kneel';
    at(5.0, 2, () => hud.card('', '', 'In the shadow of the arch, he keeps the cold hearth still.'));
    at(10, 3, () => hud.card('', '', 'The sun will rise every day. He will watch it from the dark. Alone.'));
  }
  at(14.5, 9, () => {
    hud.card('', 'The Last Ember', light ? 'The fire endures. The knight is free.' : 'The fire endures. So does its keeper.', 'Thank you for playing  ·  Enter to begin again');
    setMode('credits');
  });
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let t = 0;
let fpsT = 0;
let frames = 0;
ensureLevel();
hud.title(true);
hud.show(false);
rig.snap(TITLE_SHOT);
stage.setSky(CHAPTERS[0].sky, 1);
knight.pose = 'kneel';
world.knight.x = -1.7;
fitParticles();

let manualClock = false; // trailer capture drives the game with exact steps (tick) instead of rAF
function frame(now: number): void {
  if (!manualClock) update(now);
  requestAnimationFrame(frame);
}

// adaptive quality: if real frames run slow for ~2 s, drop the internal resolution one step (never back up)
const DPR_STEPS = [Math.min(window.devicePixelRatio, 1.5), 1, 0.8];
let dprStep = 0;
let slowFrames = 0;
function adaptQuality(rawDt: number): void {
  if (rawDt <= 0 || rawDt > 0.09) return; // throttled/background frames say nothing about the GPU
  slowFrames = rawDt > 1 / 45 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
  if (slowFrames > 120 && dprStep < DPR_STEPS.length - 1) {
    dprStep++;
    slowFrames = 0;
    stage.setPixelRatio(DPR_STEPS[dprStep]);
    if (dprStep === DPR_STEPS.length - 1) stage.smaa.enabled = false;
    fitParticles();
    console.info(`[quality] pixel ratio -> ${DPR_STEPS[dprStep]}`);
  }
}

function update(now: number): void {
  const rawDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = Math.max(last, now);
  adaptQuality(rawDt);
  if (slowT > 0) {
    slowT -= rawDt;
    if (slowT <= 0) timeScale = 1;
  }
  const dt = rawDt * (mode === 'play' ? timeScale : 1);
  t += dt;
  modeT += rawDt;

  if (mode === 'title') {
    rig.orbit = Math.sin(t * 0.12) * 0.22;
    if (DEMO && modeT > 1.5) {
      hud.title(false);
      startChapter(chapterIndex);
    }
  } else rig.orbit *= 1 - Math.min(1, rawDt * 1.5);

  if (mode === 'intro' && modeT > 3.8) beginPlay();

  if (mode === 'play') {
    stepSim(DEMO ? () => botInput(world) : readInput, dt);
    placeCheck(rawDt);
    if (world.status === 'cleared') {
      knightX = world.knight.x;
      knightY = world.knight.y;
      if (world.chapter.phase === 'dawn') setMode('dawn');
      else {
        setMode('outro');
        hud.card(world.chapter.roman, 'A memory returns', world.chapter.memory);
        hud.show(false);
        rig.go(CARD_SHOT, 2.5);
        fx.slowmo(1, 0);
      }
    } else if (world.status === 'lost') {
      setMode('lost');
      const why = world.loseReason === 'hearth' ? 'The hearth went dark.' : 'The knight fell, and the dark came in.';
      hud.card(world.chapter.roman, 'The fire is lost', why, DEMO ? '' : 'R to rise again');
      hud.show(false);
    }
  }

  if (mode === 'outro' && modeT > 4.2) {
    const next = chapterIndex + 1;
    if (next === midnightIndex) {
      world.status = 'playing';
      setMode('midnight');
    } else if (next < CHAPTERS.length) startChapter(next);
  }
  if (mode === 'midnight') midnight(rawDt);
  if (mode === 'dawn') dawn(rawDt);
  if (mode === 'choice') choice(rawDt);
  if (mode === 'ending') endingScene(rawDt);
  if (mode === 'lost' && DEMO && modeT > 3) retry();
  if (mode === 'credits' && DEMO && modeT > 6) restartAll();

  // ---- render-side updates
  if (mode === 'intro' || mode === 'play' || mode === 'outro' || mode === 'lost' || mode === 'title') {
    const sky = mode === 'outro' && CHAPTERS[chapterIndex + 1] && chapterIndex + 1 !== midnightIndex ? CHAPTERS[chapterIndex + 1].sky : world.chapter.sky;
    stage.setSky(sky, Math.min(1, rawDt * (mode === 'outro' ? 0.9 : 0.6)));
  }
  if (hearth.lit && mode !== 'midnight') {
    hearth.strength = world.hearthHp / CFG.hearth.maxHp;
    hearth.flameTop = world.light.y;
  }
  hearth.update(dt, t, glow, smoke, stage.camera);
  levelView?.update(dt, t, stage.camera, world.shrines.map((s) => s.active), world.checkpointsLit);
  if (mode !== 'paused') {
    knight.update(world.knight, dt, t, smoke, glow, stage.camera);
    const live = mode === 'play' || mode === 'outro' || mode === 'lost';
    shadeViews.update(live ? world.shades : [], dt, t, smoke, glow);
    ambient(dt);
    drawProjectiles(dt);
    glow.update(dt, t);
    smoke.update(dt, t);
  }
  // sun wash on the ground for the dawn choice
  const washOn = mode === 'choice' || mode === 'ending';
  const wm = sunWash.material as THREE.MeshBasicMaterial;
  wm.opacity += ((washOn ? 0.14 : 0) - wm.opacity) * Math.min(1, rawDt * 2);
  sunWash.scale.x = 40;
  sunWash.position.x = sunEdge + 20 - 3; // the ramp's soft edge sits on sunEdge

  let camTarget = 0;
  if (mode === 'title') camTarget = -0.9;
  else if (mode === 'midnight') camTarget = -1.1;
  else {
    const look = world.knight.x + world.knight.facing * 2.2 + (revealT > 0 ? 5 : 0);
    camTarget = Math.max(world.minX + 7, Math.min(world.maxX - 7, look));
  }
  rig.liftTarget = mode === 'title' || mode === 'midnight' ? 0 : world.knight.y * 0.8;
  // lean in when the knight is fighting at close quarters
  const k = world.knight;
  const close = mode === 'play' && world.shades.some((s) => s.state !== 'dead' && Math.abs(s.x - k.x) < 3.2);
  rig.zoomTarget = close && (k.state === 'attack' || k.state === 'heavy' || k.state === 'dash') ? 0.78 : close ? 0.88 : 1;
  if (mode === 'play' && close) camTarget = camTarget * 0.6 + k.x * 0.4;
  if (revealT > 0) rig.zoomTarget = 1;
  rig.update(rawDt, t, camTarget);
  stage.update(t, rig.x);
  hud.update(world, rawDt);
  worldUi.update(world, rawDt, mode === 'play');
  worldUi.hearthMarker(world, mode === 'play');
  const danger = mode === 'play' ? Math.min(1, world.shades.filter((s) => s.state !== 'dead' && Math.abs(s.x - world.knight.x) < 6).length / 3) : 0;
  setBeds(hearth.lit ? hearth.strength : knight.torchOn ? 0.5 : 0, danger);
  stage.render();

  if (DEBUG) {
    frames++;
    fpsT += rawDt;
    if (fpsT >= 0.5) {
      hud.fps(`${Math.round(frames / fpsT)} fps · ${glow.alive + smoke.alive} particles · ${mode}`);
      frames = 0;
      fpsT = 0;
    }
  }
}

/** Shadow bolts (a swallowing violet core with a dark trail) and the Marshal's ground waves. */
const boltSprites: THREE.Sprite[] = [];
function drawProjectiles(dt: number): void {
  const live = mode === 'play' ? world.bolts : [];
  while (boltSprites.length < live.length) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.35, 2.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.scale.setScalar(0.75);
    stage.scene.add(sp);
    boltSprites.push(sp);
  }
  boltSprites.forEach((sp, i) => {
    const b = live[i];
    sp.visible = !!b;
    if (!b) return;
    sp.position.set(b.x, b.y, 0.3);
    sp.scale.setScalar(0.65 + Math.sin(t * 30 + i) * 0.1);
    for (let j = 0; j < 2; j++)
      smoke.emit({ x: b.x, y: b.y, z: 0.3, vx: -b.vx * 0.05, vy: -b.vy * 0.05, spread: 0.1, life: 0.45, size: 0.45, sizeEnd: 0.15, r: 0.03, g: 0.0, b: 0.06, alpha: 0.85, drag: 2 });
    glow.emit({ x: b.x, y: b.y, z: 0.3, spread: 0.3, life: 0.25, size: 0.08, sizeEnd: 0.01, r: 1.2, g: 0.5, b: 3.5 });
  });
  if (mode !== 'play') return;
  for (const w of world.waves) {
    const n = Math.max(1, Math.round(dt * 160));
    for (let i = 0; i < n; i++) {
      glow.emit({ x: w.x, y: 0.15, z: (Math.random() - 0.5) * 1.6, vy: 2.5 + Math.random() * 2, vx: w.dir * 2, spread: 0.4, life: 0.4, size: 0.18, sizeEnd: 0.03, r: 4, g: 0.6, b: 0.25, gravity: 6, drag: 1 });
      smoke.emit({ x: w.x, y: 0.2, z: (Math.random() - 0.5) * 1.4, vy: 1.6, spread: 0.3, life: 0.6, size: 0.7, sizeEnd: 1.4, r: 0.05, g: 0.0, b: 0.02, alpha: 0.7, drag: 2 });
    }
  }
}

/** Ash drifting down through every frame; ink mist seeping from every shadow the fire casts. */
function ambient(dt: number): void {
  if (mode === 'play' || mode === 'intro' || mode === 'title') {
    for (const [a, b] of world.shadows) {
      const lo = Math.max(a, rig.x - 16);
      const hi = Math.min(b, rig.x + 16);
      if (hi - lo < 0.3) continue;
      const rate = dt * (hi - lo) * 3.2;
      for (let i = 0; i < rate + (Math.random() < rate % 1 ? 1 : 0); i++) {
        smoke.emit({
          x: lo + Math.random() * (hi - lo), y: 0.05, z: (Math.random() - 0.5) * 2.4,
          vx: (Math.random() - 0.5) * 0.2, vy: 0.22, spread: 0.08, life: 2.6, size: 1.0, sizeEnd: 1.9,
          r: 0.035, g: 0.015, b: 0.07, alpha: 0.3, drag: 0.3,
        });
        if (Math.random() < 0.08)
          glow.emit({ x: lo + Math.random() * (hi - lo), y: 0.1, z: (Math.random() - 0.5) * 2, vy: 0.35, spread: 0.05, life: 2.2, size: 0.05, sizeEnd: 0.01, r: 0.9, g: 0.4, b: 2.2, wobble: 0.3 });
      }
    }
  }
  const n = dt * (stage.dawn > 0.5 ? 3 : 6);
  for (let i = 0; i < n + (Math.random() < n % 1 ? 1 : 0); i++) {
    smoke.emit({
      x: rig.x + (Math.random() - 0.5) * 30, y: 8 + Math.random() * 3, z: (Math.random() - 0.5) * 8,
      vx: 0.5, vy: -0.55, spread: 0.1, life: 14, size: 0.06, sizeEnd: 0.045, r: 0.13, g: 0.12, b: 0.14, alpha: 0.6, wobble: 0.5,
    });
  }
}

requestAnimationFrame(frame);

// ------------------------------------------------------------------ debug hooks
if (DEBUG) {
  (window as unknown as { __game: unknown }).__game = {
    get world() { return world; },
    get mode() { return mode; },
    get state() {
      return { mode, chapter: world.chapter.id, status: world.status, time: +world.time.toFixed(2), hearth: world.hearthHp, hp: world.knight.hp, shades: world.shades.length, kills: world.kills, ending };
    },
    start: () => { hud.title(false); startChapter(chapterIndex); },
    restart: () => startChapter(chapterIndex, true),
    skipTo: (i: number) => { hud.title(false); startChapter(i, true); },
    play: () => beginPlay(),
    midnight: () => { hud.title(false); hud.hideCard(); chapterIndex = midnightIndex - 1; world = new World(chapterIndex, seed); applyPhase(chapterIndex); setMode('midnight'); },
    dawn: () => { hud.title(false); hud.hideCard(); chapterIndex = CHAPTERS.length - 1; applyPhase(chapterIndex); knightX = 0; setMode('dawn'); },
    endHour: () => { world.time = world.chapter.duration - 0.1; },
    set godMode(v: boolean) { godMode = v; },
    set manual(v: boolean) { manualClock = v; },
    set timeScale(v: number) { timeScale = v; slowT = v === 1 ? 0 : 1e9; },
    get godMode() { return godMode; },
    setSeed: (n: number) => { seed = n; },
    snapshot: () => JSON.stringify({ mode, chapter: world.chapter.id, t: world.time, knight: { x: world.knight.x, y: world.knight.y, hp: world.knight.hp, state: world.knight.state }, hearth: world.hearthHp, shades: world.shades.map((s) => ({ id: s.id, x: +s.x.toFixed(2), hp: +s.hp.toFixed(2), state: s.state, big: s.big })) }),
    renderer: stage.renderer,
    kv: knight,
    stage,
    /** Advance the whole game by ms without waiting for animation frames (screenshots of exact moments). */
    tick: (ms: number, steps = 1) => { for (let i = 0; i < steps; i++) update(last + ms); },
    /** Render n frames synchronously and return GPU+CPU ms per frame. */
    bench: (n = 60) => {
      const gl = stage.renderer.getContext();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { update(last + 1000 / 60); gl.finish(); }
      return +((performance.now() - t0) / n).toFixed(2);
    },
    rig,
    THREE,
  };
}

// ------------------------------------------------------------------ trailer capture (?debug=1&trailer=1, dev only)
if (DEBUG && params.get('trailer') === '1') {
  void import('./trailer').then((m) => m.installTrailer((window as unknown as { __game: Parameters<typeof m.installTrailer>[0] }).__game));
}
