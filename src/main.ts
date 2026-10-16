import './style.css';
import * as THREE from 'three';
import { initAudio, isMuted, setBeds, setMuted, sfx } from './audio/sfx';
import { CFG } from './config';
import { CHAPTERS } from './data/chapters';
import { playEvents, type FxTargets } from './fx';
import { clearInput, initInput, onKey, readInput } from './input';
import { CameraRig, CARD_SHOT, GAMEPLAY_SHOT, TITLE_SHOT } from './render/cameraRig';
import { Hearth } from './render/hearth';
import { KnightView } from './render/knightView';
import { Particles } from './render/particles';
import { ShadeViews } from './render/shadeView';
import { Stage } from './render/stage';
import { botInput } from './sim/bot';
import { World } from './sim/world';
import { Hud } from './ui/hud';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DEMO = params.get('demo') === '1';
let seed = Number(params.get('seed') ?? 1) || 1;
if (params.get('capture') === '1') document.body.classList.add('capture');

// ------------------------------------------------------------------ setup
const stage = new Stage(document.getElementById('app')!);
const rig = new CameraRig(stage.camera);
const glow = new Particles(3000, true);
const smoke = new Particles(1800, false);
stage.scene.add(smoke.points, glow.points);
const hearth = new Hearth(CFG.hearth.x);
stage.world.add(hearth.group);
const knightView = new KnightView();
stage.world.add(knightView.root);
const shadeViews = new ShadeViews();
stage.world.add(shadeViews.group);
const hud = new Hud();
const fx: FxTargets = { rig, glow, smoke, flash: (s, c) => hud.flash(s, c) };

const fitParticles = () => {
  glow.setScale(stage.viewportHeightPx, stage.camera.fov);
  smoke.setScale(stage.viewportHeightPx, stage.camera.fov);
};
window.addEventListener('resize', fitParticles);

type Mode = 'title' | 'intro' | 'play' | 'outro' | 'lost' | 'end' | 'paused';
let mode: Mode = 'title';
let modeT = 0;
let chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, Number(params.get('chapter') ?? 0) || 0));
let world = new World(chapterIndex, seed);
let godMode = false;
let pausedFrom: Mode = 'play';

function setMode(m: Mode): void {
  mode = m;
  modeT = 0;
}

function startChapter(i: number, quick = false): void {
  chapterIndex = i;
  world = new World(i, seed);
  shadeViews.clear();
  clearInput();
  const c = world.chapter;
  hud.card(c.roman, c.title, c.line);
  hud.show(false);
  rig.go(CARD_SHOT, quick ? 0.6 : 1.4);
  setMode('intro');
  if (quick) modeT = 2.2;
  sfx('bell');
}

function beginPlay(): void {
  hud.hideCard();
  hud.show(true);
  rig.go(GAMEPLAY_SHOT, 2.2);
  setMode('play');
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
      if (modeT > 0.8) modeT = Math.max(modeT, 3.6);
      return;
    case 'lost':
      if (modeT > 0.8 && (code === 'KeyR' || code === 'Enter' || code === 'Space')) startChapter(chapterIndex, true);
      return;
    case 'end':
      if (modeT > 2 && (code === 'Enter' || code === 'KeyR')) startChapter(0);
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

// ------------------------------------------------------------------ loop
let acc = 0;
let last = performance.now();
let t = 0;
let fpsT = 0;
let frames = 0;
hud.title(true);
hud.show(false);
rig.snap(TITLE_SHOT);
stage.setSky(CHAPTERS[0].sky, 1);
fitParticles();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  modeT += dt;

  if (mode === 'title') {
    rig.orbit = Math.sin(t * 0.12) * 0.35;
    if (DEMO && modeT > 1.5) {
      hud.title(false);
      startChapter(chapterIndex);
    }
  } else rig.orbit *= 1 - Math.min(1, dt * 1.5);

  if (mode === 'intro' && modeT > 3.6) beginPlay();

  if (mode === 'play') {
    acc += dt;
    while (acc >= CFG.dt) {
      acc -= CFG.dt;
      if (godMode) {
        world.knight.iframes = Math.max(world.knight.iframes, 0.2);
        world.hearthHp = Math.max(world.hearthHp, 50);
      }
      world.step(DEMO ? botInput(world) : readInput());
      playEvents(world.events, fx);
      if (world.status !== 'playing') break;
    }
    if (world.status === 'cleared') {
      setMode('outro');
      const next = CHAPTERS[chapterIndex + 1];
      hud.card(world.chapter.roman, 'The hour passes', next ? 'The fire endures. For now.' : 'Midnight is coming.');
      hud.show(false);
      rig.go(CARD_SHOT, 2.5);
    } else if (world.status === 'lost') {
      setMode('lost');
      const why = world.loseReason === 'hearth' ? 'The hearth went dark.' : 'The knight fell, and the dark came in.';
      hud.card(world.chapter.roman, 'The fire is lost', why, DEMO ? '' : 'R to rise again');
      hud.show(false);
    }
  } else acc = 0;

  if (mode === 'outro' && modeT > 3.2) {
    const next = chapterIndex + 1;
    if (next < CHAPTERS.length) startChapter(next);
    else {
      setMode('end');
      hud.card('XII', 'Midnight', 'The hearth gutters. He reaches for a torch before the last flame dies…', 'To be continued  ·  Enter to begin again');
    }
  }
  if (mode === 'lost' && DEMO && modeT > 3) startChapter(chapterIndex, true);

  // ---- render-side updates
  const sky = (mode === 'outro' && CHAPTERS[chapterIndex + 1]) ? CHAPTERS[chapterIndex + 1].sky : world.chapter.sky;
  stage.setSky(sky, Math.min(1, dt * (mode === 'outro' ? 0.9 : 0.6)));
  const live = mode === 'play' || mode === 'outro' || mode === 'lost';
  hearth.strength = world.hearthHp / CFG.hearth.maxHp;
  hearth.flameTop = world.light.y;
  hearth.update(dt, t, glow, glow);
  knightView.root.visible = mode !== 'title';
  if (mode !== 'paused') {
    knightView.update(world.knight, dt, t, smoke);
    shadeViews.update(live ? world.shades : [], dt, t, smoke, glow);
    glow.update(dt, t);
    smoke.update(dt, t);
  }
  const camTarget = mode === 'title' ? 0 : Math.max(-7, Math.min(7, world.knight.x * 0.75));
  rig.update(dt, t, camTarget);
  stage.update(t, rig.x);
  hud.update(world, dt);
  const danger = mode === 'play' ? Math.min(1, world.shades.filter((s) => s.state !== 'dead' && Math.abs(s.x - world.light.x) < 6).length / 3) : 0;
  setBeds(hearth.strength, danger);
  stage.render();

  if (DEBUG) {
    frames++;
    fpsT += dt;
    if (fpsT >= 0.5) {
      hud.fps(`${Math.round(frames / fpsT)} fps · ${glow.alive + smoke.alive} particles · ${stage.renderer.info.render.calls} calls`);
      frames = 0;
      fpsT = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ debug hooks
if (DEBUG) {
  (window as unknown as { __game: unknown }).__game = {
    get world() { return world; },
    get mode() { return mode; },
    get state() {
      return { mode, chapter: world.chapter.id, status: world.status, time: world.time, hearth: world.hearthHp, hp: world.knight.hp, shades: world.shades.length, kills: world.kills };
    },
    start: () => { hud.title(false); startChapter(chapterIndex); },
    restart: () => startChapter(chapterIndex, true),
    skipTo: (i: number) => { hud.title(false); startChapter(i, true); },
    play: () => beginPlay(),
    set godMode(v: boolean) { godMode = v; },
    get godMode() { return godMode; },
    setSeed: (n: number) => { seed = n; },
    snapshot: () => JSON.stringify({ mode, chapter: world.chapter.id, t: world.time, knight: { x: world.knight.x, y: world.knight.y, hp: world.knight.hp, state: world.knight.state }, hearth: world.hearthHp, shades: world.shades.map((s) => ({ id: s.id, x: +s.x.toFixed(2), hp: +s.hp.toFixed(2), state: s.state })) }),
    renderer: stage.renderer,
    THREE,
  };
}
