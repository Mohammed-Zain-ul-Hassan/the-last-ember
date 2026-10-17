import './style.css';
import './render/mist'; // patches the fog shaders before anything renders
import * as THREE from 'three';
import { initAudio, isMuted, setBeds, setMood, setMuted, setRain, setVolumes, sfx } from './audio/sfx';
import { bestFor, gradeFor, markReached, reached, recordBest, resetProgress, saveSettings, settings } from './settings';
import { Menu } from './ui/menu';
import { CFG, DIFFICULTY } from './config';
import { getDifficulty, onDifficulty } from './difficulty';
import { CHAPTERS, DAWN_SKY, MIDNIGHT_SKY } from './data/chapters';
import { LEVELS } from './data/levels';
import { Memories } from './render/memory';
import { playEvents, type FxTargets } from './fx';
import { clearInput, initInput, isHeld, onKey, readInput, sinceLook, takeLook } from './input';
import { CameraRig, CARD_SHOT, DAWN_SHOT, ENDING_SHOT, MIDNIGHT_SHOT, REVEAL_SHOTS, ROAD_CARD_SHOT, TITLE_SHOT } from './render/cameraRig';
import { angleDiff } from './sim/geom';
import { Hearth } from './render/hearth';
import { KnightView, setKnightFade } from './render/knightView';
import { emitCount, Particles } from './render/particles';
import { Rain } from './render/rain';
import { Blobs } from './render/blobs';
import { LightRing } from './render/lightRing';
import { ShadeViews } from './render/shadeView';
import { LevelView, BRAZIER_LIGHTS, brazierZ } from './render/levelView';
import { castStill, FROZEN, FrozenShadows } from './render/frozenShadows';
import { Ghost, type GhostPose } from './render/ghost';
import { Stage, SHADOW_FRAME } from './render/stage';
import { glowTexture, rampTexture } from './render/textures';
const glowTex = glowTexture();
import { botInput } from './sim/bot';
import { NO_INPUT, World, type Input, type WorldOpts } from './sim/world';
import { Hud } from './ui/hud';
import { initCursor, requestLock, wantCursorHidden } from './ui/cursor';
import { startRecording, type Recording } from './still/record';
import { WorldUi } from './ui/worldUi';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DEMO = params.get('demo') === '1';
let seed = Number(params.get('seed') ?? 1) || 1;
// The Last Ember is one game in two acts: Act I, the Still City (index.html), hands on to this page, Act II.
//   ?from=still      straight on from the Heart: the bridge, then sunset (no title)
//   ?from=chapters   an hour chosen on the shared title's chapter list (?chapter=n)
const FROM = params.get('from');
// ?rec=1&name=x: record this tab as seen and heard (the trailer's screen recording; the first click starts it), with a
// <name>-moments.json of every event and mode change on the recording's clock. window.__recStop() ends it.
const REC = params.get('rec') === '1';
let recording: Recording | null = null;
let recT0 = 0;
const moments: Record<string, unknown>[] = [];
function moment(type: string, extra: object = {}): void {
  if (recording) moments.push({ t: +((performance.now() - recT0) / 1000).toFixed(2), hour: CHAPTERS[chapterIndex]?.clock, type, ...extra });
}
if (REC) {
  const name = params.get('name') ?? 'hearth-run';
  addEventListener(
    'pointerdown',
    () =>
      void startRecording(stage.renderer.domElement, null, name).then((r) => {
        recording = r;
        recT0 = performance.now();
        moment(`mode:${mode}`);
        (window as unknown as { __recStop: () => Promise<string> }).__recStop = async () => {
          moment('end');
          await fetch(`/__cap/file?name=${name}-moments&ext=json`, { method: 'POST', body: JSON.stringify(moments) });
          recording = null;
          return r.stop();
        };
      }),
    { once: true, capture: true },
  );
}
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
stage.aura.source = knight.aura;
const shadeViews = new ShadeViews();
stage.world.add(shadeViews.group);
const rain = new Rain();
stage.scene.add(rain.mesh);
const blobs = new Blobs();
stage.world.add(blobs.group);
for (const l of BRAZIER_LIGHTS) stage.scene.add(l);
const lightRing = new LightRing();
stage.world.add(lightRing.mesh);
const hud = new Hud();

// ------------------------------------------------------------------ the still shadows and the one with no owner
// (the story: the city froze one minute before dawn; see docs/story-loop.md)
const frozen = new FrozenShadows(stage.renderer);
const ghost = new Ghost();
stage.scene.add(ghost.root);
castStill(stage.scatterGroup);
castStill(hearth.group);
FROZEN.uFzK.value = 1;
const HEART_Y = 0.7; // the feet of whoever stands in the hearth's bowl
let ghostKey = '';
/** Re-draw the still shadows of the current place (once per level, and whenever the ownerless one moves). */
function bakeStill(): void {
  const a = world.level.area;
  const box = new THREE.Box3();
  if (a.kind === 'disc') box.set(new THREE.Vector3(a.cx - a.r - 6, -1, a.cz - a.r - 6), new THREE.Vector3(a.cx + a.r + 6, 18, a.cz + a.r + 6));
  else box.set(new THREE.Vector3(a.x0 - 4, world.level.id === 'cityWall' ? -2 : -1, a.z0 - 7), new THREE.Vector3(a.x1 + 4, 24, a.z1 + 7));
  frozen.bake(stage.scene, box);
}
/** Where the ownerless shadow's figure stands this hour: where he is going to stand, doing what he will do there. */
function ghostSpot(): { x: number; y: number; z: number; yaw: number; pose: GhostPose } | null {
  const lv = world.level;
  if (mode === 'title' || mode === 'credits') return lv.hearthX !== undefined ? { x: world.hearthX, y: HEART_Y, z: world.hearthZ, yaw: Math.PI, pose: 'open' } : null;
  if (world.chapter.phase === 'hearth' && hearth.lit) {
    const pose: GhostPose = chapterIndex === 0 ? 'stand' : chapterIndex === 1 ? 'reach' : 'open';
    return { x: world.hearthX, y: HEART_Y, z: world.hearthZ, yaw: Math.PI, pose };
  }
  if (!world.road) return null;
  const i = world.checkpointsLit;
  if (i < lv.checkpoints.length) {
    // at the next brazier, before he gets there, holding a torch to it
    const x = lv.checkpoints[i] - 1.0;
    const z = brazierZ(lv);
    return { x, y: world.floorAt(x, z, 0.3), z, yaw: 0, pose: 'light' };
  }
  if (lv.end !== undefined && lv.id === 'cityWall') {
    const x = lv.end - 6;
    return { x, y: world.floorAt(x, 0, 0.3), z: 0, yaw: Math.PI, pose: 'stand' };
  }
  return null;
}
function placeGhost(): void {
  const g = ghostSpot();
  const key = g ? `${world.level.id}|${g.x.toFixed(2)}|${g.y.toFixed(2)}|${g.pose}` : `${world.level.id}|none`;
  if (key === ghostKey) return;
  ghostKey = key;
  if (g) ghost.place(g.x, g.y, g.z, g.yaw, g.pose);
  else ghost.hide();
  bakeStill();
}

// whispers: a line, once, when the player can see what it is about
const whispered = new Set<string>();
function whisper(key: string, text: string): void {
  if (whispered.has(key)) return;
  whispered.add(key);
  hud.toast(text);
}
function storyBeats(): void {
  const tm = world.time;
  const k = world.knight;
  switch (world.chapter.id) {
    case '7pm':
      if (tm > 4) whisper('still', 'The fire moves. These shadows do not.');
      // the ownerless shadow runs west from the hearth: say it when he is near it, or soon anyway
      if (tm > 16 || (tm > 7 && k.x < world.hearthX - 2 && Math.abs(k.z - world.hearthZ) < 3.5)) whisper('owner', 'One shadow here belongs to no one.');
      break;
    case '9pm':
      if (tm > 6) whisper('moved', 'The shadow in the hearth has moved since the last hour.');
      break;
    case '11pm':
      if (tm > 6) whisper('open', 'It stands in the heart of the fire now. Arms open.');
      break;
    case '1am':
      if (tm > 4) whisper('ahead', 'Someone is already waiting at the brazier ahead.');
      break;
    case '3am':
      if (tm > 4) whisper('ahead3', 'Its shadow is ahead of you again.');
      break;
    case '5am':
      if (tm > 5) whisper('gate', 'Every shadow here has its back to the Dawn Gate.');
      break;
  }
}
const worldUi = new WorldUi(stage.camera);
let timeScale = 1;
let slowT = 0;
const fx: FxTargets = {
  rig, glow, smoke,
  flash: (s, c) => hud.flash(s * settings.flashes, c),
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

type Mode = 'title' | 'prologue' | 'intro' | 'play' | 'outro' | 'lost' | 'paused' | 'midnight' | 'dawn' | 'choice' | 'ending' | 'credits';
const DPR_STEPS = [Math.min(window.devicePixelRatio, 1.5), 1, 0.8]; // auto quality: internal resolution steps
let dprStep = 0;
let mode: Mode = 'title';
let modeT = 0;
let chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, Number(params.get('chapter') ?? 0) || 0));
/** Every hour's world is made at the chosen difficulty (shared with Act I: src/difficulty.ts). */
function newWorld(i: number, seed: number, opts: WorldOpts = {}): World {
  return new World(i, seed, { ...opts, diff: DIFFICULTY[getDifficulty()].hearth });
}
onDifficulty((d) => (world.diff = DIFFICULTY[d].hearth)); // blows land at the new rate at once; the next hour is scaled too
let world = newWorld(chapterIndex, seed);
let godMode = false;
let pausedFrom: Mode = 'play';
let pausedAt: [number, number] = [0, -1];
let ending: 'light' | 'shadow' | null = null;
let sunEdge = 30;
let choiceHold = 0;
let beat = -1; // index of the last scripted beat fired in a timeline
const midnightIndex = CHAPTERS.findIndex((c) => c.phase === 'torch');

function setMode(m: Mode): void {
  if (m !== mode) moment(`mode:${m}`);
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
  castStill(levelView.group);
  ghostKey = ''; // a new place: its still shadows are baked when the ownerless one is placed
  const sh = world.level.shelter;
  rain.setShelter(sh ? sh.rect : null, sh?.y ?? 0);
  hearth.setPresent(world.level.hearthX !== undefined);
  stage.setTerrain(world.level.id === 'cityWall' ? 'high' : world.level.id === 'cathedral' ? 'indoor' : 'open');
}

// ------------------------------------------------------------------ levels: every hour is a level
const STATS_TIME = DEMO ? 3.5 : 9; // the level-complete card waits this long (any key continues sooner)
const memories = new Memories();
stage.scene.add(memories.group);
let memEnd = 0; // outro time at which the memory gives way to the level-complete card (0 = no memory)
const outroTime = () => memEnd + STATS_TIME;

/** A memory plays as shadow theatre, letterboxed, before the level-complete card. */
function playMemory(i: number): void {
  if (!memories.has(i)) {
    memEnd = 0;
    levelComplete();
    return;
  }
  memEnd = memories.duration(i);
  memories.show(i);
  hud.hideCard();
  hud.flash(1, '#000');
  document.getElementById('mem-eyebrow')!.textContent = `A memory returns  ·  ${CHAPTERS[i].clock}`;
  document.getElementById('mem-text')!.textContent = CHAPTERS[i].memory;
  document.getElementById('letterbox')!.classList.add('on');
  document.getElementById('memline')!.classList.add('on');
}

function endMemory(): void {
  if (memories.active < 0) return;
  memories.hide();
  hud.flash(1, '#000');
  document.getElementById('letterbox')!.classList.remove('on');
  document.getElementById('memline')!.classList.remove('on');
}
const levelStats = { wounds: 0, embers: 0 };
const levelTitle = (i: number) => `Level ${i + 1} of ${CHAPTERS.length}  ·  <b>${LEVELS[CHAPTERS[i].level].name}</b>`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function levelComplete(): void {
  const c = world.chapter;
  const i = chapterIndex;
  const next = CHAPTERS[i + 1];
  const stats: [string, string | number][] = [
    ['shades freed', world.kills],
    ['wounds taken', levelStats.wounds],
    ['best combo', hud.bestCombo],
    [world.road ? 'time' : 'hearth', world.road ? mmss(world.time) : `${Math.round(Math.max(0, world.hearthHp))}%`],
  ];
  if (!world.road) stats.splice(3, 0, ['embers fed', levelStats.embers]);
  const grade = gradeFor(levelStats.wounds, world.road ? null : Math.max(0, world.hearthHp));
  const prev = bestFor(c.id);
  const isBest = recordBest(c.id, { grade, wounds: levelStats.wounds, time: world.time });
  stats.unshift(['grade', `<em class="grade g${grade}">${grade}</em>`]);
  stats.push([isBest ? (prev ? 'new best' : 'first clear') : 'best', isBest ? '✦' : prev!.grade]);
  const hint = next ? `Next  ·  Level ${i + 2}: ${next.title}${DEMO ? '' : '   ·   any key to continue'}` : '';
  document.getElementById('card')!.classList.toggle('dim', memories.active >= 0);
  hud.card(c.roman, 'A memory returns', c.memory, hint, { eyebrow: `<b>Level ${i + 1} complete</b>  ·  ${c.clock}`, stats, level: i + 1, levels: CHAPTERS.length });
}

function startChapter(i: number, quick = false, opts: WorldOpts = {}): void {
  endMemory(); // never carry a memory (or the dawn's reveal) into a new hour
  chapterIndex = i;
  markReached(i);
  document.getElementById('card')!.classList.remove('dim');
  levelStats.wounds = 0;
  levelStats.embers = 0;
  whispered.clear();
  // a new night: time runs again, and the still shadows lie where the frozen dawn throws them
  stillAll = 0;
  frozen.dir.copy(FROZEN_DIR_START);
  FROZEN.uFzDir.value.copy(FROZEN_DIR_START);
  FROZEN.uFzK.value = 1;
  ghostKey = '';
  hud.bestCombo = 0;
  world = newWorld(i, seed, opts);
  ensureLevel();
  shadeViews.clear();
  worldUi.clear();
  clearInput();
  applyPhase(i);
  setKnightFade(1);
  setMood('night');
  stage.dawn = 0;
  const c = world.chapter;
  const best = bestFor(c.id);
  hud.card(c.roman, c.title, c.line, best ? `best grade  ${best.grade}` : '', { eyebrow: levelTitle(i), level: i, levels: CHAPTERS.length });
  hud.show(false);
  hud.choice(false);
  knight.pose = 'kneel';
  rig.go(cardShot(), quick ? 0.6 : 1.6);
  warmShaders();
  setMode('intro');
  if (quick) modeT = 2.4;
  sfx('bell');
}

/** The hour card's wide shot: around him on the open grounds, high behind him down a street or a nave. */
function cardShot() {
  return world.road ? ROAD_CARD_SHOT : CARD_SHOT;
}

/**
 * Compile every shader this hour can need now, while its card covers the screen, so nothing stalls mid-fight:
 * one of each enemy (and a dissolving one), every shadow pass. Cheap when they are already compiled.
 */
function warmShaders(): void {
  shadeViews.prewarm(new THREE.Vector3(world.knight.x, 0, world.knight.z), smoke, glow);
  stage.warmup([hearth.light.shadow, knight.torchLight.shadow]);
  shadeViews.endPrewarm();
}

/** Fallen: on the road, rise again at the last lit brazier; on the grounds, the hour begins again. */
function retry(): void {
  if (world.road && world.checkpointsLit > 0) startChapter(chapterIndex, true, { startX: world.respawnX, checkpointsLit: world.checkpointsLit });
  else startChapter(chapterIndex, true);
}

// ------------------------------------------------------------------ places: names and reveal shots
const seenRegions = new Set<string>();
let revealT = 0;
let revealYaw = 0; // the follow camera's heading before a reveal shot, restored after it
function regionHere(): { x0: number; kind: string; name?: string; sub?: string } | undefined {
  const x = world.knight.x;
  return world.level.regions.find((r) => x >= r.x0 && x < r.x1);
}
function placeCheck(dt: number): void {
  if (revealT > 0) {
    // looking around hands the camera straight back: a reveal never holds the view against the player
    revealT = sinceLook() < 0.1 ? 0 : revealT - dt;
    if (revealT <= 0) rig.follow(0.7, revealYaw);
    return;
  }
  const r = regionHere();
  if (!r?.name) return;
  const key = `${world.level.id}:${r.x0}`;
  if (seenRegions.has(key)) return;
  seenRegions.add(key);
  hud.place(r.name, r.sub ?? '');
  const shot = REVEAL_SHOTS[r.kind];
  // the place is always named; the camera only swings away to show it when nothing is coming for him
  const k = world.knight;
  const threat = world.shades.some((s) => s.state !== 'dead' && Math.hypot(s.x - k.x, s.z - k.z) < 12);
  if (shot && !threat) {
    revealYaw = rig.yaw;
    rig.go(shot, 1.0);
    revealT = 1.7;
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
  rig.torch = world.torch;
  rig.follow(0.8, world.level.startYaw);
  clearInput(); // the key that skipped the card must not also jump or swing on the first frame
  setMode('play');
  if (!DEMO && teach < 0) teach = 0; // the controls, once a session (see TEACH)
}

// The controls, taught one at a time when play first begins, each held until it is done (or a while has passed):
// one short instruction per line, never three at once.
const TEACH = ['W A S D to move', 'Move the mouse to look', 'Click or J to strike'];
let teach = -1;
let teachT = 0;
let looked = 0;
addEventListener('pointermove', (e) => {
  if (teach === 1) looked += Math.abs(e.movementX) + Math.abs(e.movementY);
});
function teachStep(dt: number): void {
  if (teach < 0 || teach >= TEACH.length) return;
  teachT += dt;
  const k = world.knight;
  const done = teach === 0 ? Math.hypot(k.vx, k.vz) > 1.5 : teach === 1 ? looked > 120 : k.state === 'attack' || k.state === 'heavy' || k.state === 'charge';
  if ((done && teachT > 1.0) || teachT > 9) {
    teach++;
    teachT = 0;
  }
  if (teach < TEACH.length) hud.keep(TEACH[teach]);
}

function restartAll(): void {
  ending = null;
  stage.dawn = 0;
  sunEdge = 30;
  startChapter(0);
}

/** Where something is, in words, relative to where the camera looks. */
function emberWords(x: number, z: number): string {
  const k = world.knight;
  const a = angleDiff(rig.yaw, Math.atan2(z - k.z, x - k.x));
  if (Math.abs(a) < 0.6) return 'an ember wakes in the ruins ahead';
  if (Math.abs(a) > 2.5) return 'an ember wakes in the ruins behind you';
  return a > 0 ? 'an ember wakes in the ruins  →' : '←  an ember wakes in the ruins';
}

/** Embers, braziers and the gate: toasts, sounds and the level's props. */
function journeyEvents(): void {
  for (const e of world.events) {
    switch (e.type) {
      case 'shrine':
        hud.toast(emberWords(e.x, e.z));
        sfx('ui');
        break;
      case 'ember':
        worldUi.pop('an ember', e.x, e.y + 2.4, 'soul', e.z);
        hud.toast('carry it home to the hearth');
        sfx('ignite');
        break;
      case 'feed':
        worldUi.pop(`+${CFG.hearth.emberHeal} the hearth drinks`, e.x, 3.4, 'soul big', e.z);
        fx.flash(0.25, '#ffb070');
        sfx('ignite');
        break;
      case 'checkpoint':
        hud.toast(world.checkpointsLit === 1 && !whispered.has('before') ? 'It was here before you.' : 'a brazier is lit · you will rise here');
        whispered.add('before');
        sfx('ignite');
        break;
      case 'kill':
        if (e.big) whisper('marshal', 'He was nearest the fire. He almost reached it.');
        break;
      case 'gate':
        if (levelView) levelView.gateTarget = e.open ? 1 : 0;
        if (e.open) hud.toast('the doors open');
        break;
    }
  }
}

/** The furthest level reached, never past the last one (saved progress can come from an older build). */
function furthest(): number {
  return Math.min(reached(), CHAPTERS.length - 1);
}

// ------------------------------------------------------------------ input
initInput(stage.renderer.domElement);
// the cursor hides (and the pointer locks) while the game is played; Esc releases it and pauses
initCursor(stage.renderer.domElement, () => {
  if (mode !== 'title' && mode !== 'paused' && mode !== 'credits') pause();
});
// every way into play from a menu is a click or a key: take the lock in that same gesture
const lockFor = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A): void => {
  fn(...a);
  if (!DEMO) requestLock();
};
onKey((code) => {
  initAudio();
  // take the mouse for looking whenever the player acts in the game (a click or a key is the gesture it needs)
  if (code === 'KeyM') return setMuted(!isMuted());
  // Esc opens the menu from anywhere in the game (the title has its own menu; credits go back to it)
  if ((code === 'Escape' || code === 'KeyP') && mode !== 'title' && mode !== 'paused' && mode !== 'credits') return pause();
  switch (mode) {
    case 'title':
      menu.key(code);
      return;
    case 'prologue':
      // a key moves the opening on: out of the theatre to the plaza, then on to the first hour
      if (modeT < PRO_MEM - 0.3) modeT = PRO_MEM - 0.3;
      else if (modeT > PRO_MEM + 1.5) modeT = PRO_END;
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
    case 'outro':
      if (memEnd > 0 && modeT > 1.0 && modeT < memEnd) modeT = memEnd; // skip the memory to the card
      else if (modeT > memEnd + 1.0 && modeT < outroTime()) modeT = outroTime();
      return;
    case 'lost':
      if (modeT > 0.8 && (code === 'KeyR' || code === 'Enter' || code === 'Space' || code === 'KeyJ')) retry();
      return;
    case 'credits':
      if (modeT > 1.5 && (code === 'Enter' || code === 'KeyR' || code === 'Escape' || code === 'KeyJ' || code === 'Space')) goTitle();
      return;
    case 'paused':
      menu.key(code);
      return;
    case 'play':
      if (code === 'Escape' || code === 'KeyP') pause();
      else if (code === 'KeyR') hud.toast('hold R to restart the level');
      return;
  }
});
window.addEventListener('blur', () => {
  if (mode === 'play' && !DEMO) pause();
});

function applySettings(): void {
  setVolumes(settings.volume, settings.music, settings.sfx);
  rig.shakeScale = settings.shake;
  worldUi.numbers = settings.numbers;
  applyQuality();
}

function pause(): void {
  if (mode === 'paused') return;
  wantCursorHidden(false);
  pausedFrom = mode;
  pausedAt = [modeT, beat];
  hud.hideCard();
  hud.show(false);
  setMode('paused');
  menu.open('pause');
}

// ------------------------------------------------------------------ menus: title, pause, settings, levels
const menu = new Menu({
  settings,
  levels: () =>
    CHAPTERS.map((c, i) => ({ roman: c.roman, clock: c.clock, title: c.title, place: LEVELS[c.level].name, best: bestFor(c.id)?.grade, locked: i > furthest() })),
  canContinue: () => (furthest() > 0 ? `Level ${furthest() + 1}  ·  ${CHAPTERS[furthest()].title}` : null),
  context: () => levelTitle(chapterIndex),
  begin: lockFor(() => goPrologue()),
  continue: lockFor(() => goLevel(furthest())),
  level: lockFor((i: number) => goLevel(i)),
  resume: lockFor(() => {
    menu.close();
    clearInput();
    if (pausedFrom === 'play') hud.show(true);
    setMode(pausedFrom);
    // a scene paused part-way goes on from where it was (it would otherwise replay from the start)
    if (pausedFrom !== 'play') [modeT, beat] = pausedAt;
  }),
  restart: lockFor(() => goLevel(chapterIndex)),
  quit: () => goTitle(),
  changed: () => {
    applySettings();
    saveSettings();
  },
  resetProgress: () => resetProgress(),
  sound: () => {
    initAudio();
    sfx('ui');
  },
});

// ------------------------------------------------------------------ the opening (story)
// What a new player needs before the first hour: what happened (shadow theatre: a city at its last fire, the fire
// failing, the dark at the gates, and the night stopping), then the place it left behind (a slow shot along the
// still shadows to the hearth, the one with no owner among them), then 7 PM. Any key moves it on.
const PRO_MEM = 22; // memory 6's length (memory.ts)
const PRO_END = PRO_MEM + 9.5;
/** Begin the night from the title: the opening first, then the first hour. */
function goPrologue(): void {
  initAudio();
  menu.close();
  endMemory();
  ending = null;
  stage.dawn = 0;
  sunEdge = 30;
  hud.title(false);
  hud.show(false);
  chapterIndex = 0;
  world = newWorld(0, seed);
  ensureLevel();
  applyPhase(0);
  kneelAtHearth();
  knight.pose = 'kneel';
  stillAll = 0;
  ghostKey = '';
  setMode('prologue');
}
function prologue(): void {
  // straight on from the Still City (Act I): the bridge; opened on its own, the hearth's own telling
  const L = FROM === 'still'
    ? ['Act II  ·  The Hearth', 'He carried it out of the still city, past the walls.', 'To the old hearth, where the keepers kept their fire.', 'He set it down, and the held second with it.', 'And for the first time since, the sun began to set.', 'They will come for it. Keep it until morning.']
    : ['A hundred years ago', 'A city kept its last fire burning.', 'Its keeper swore to keep it lit, whatever it cost.', 'On the last night, the fire was dying, and the dark came in.', 'Then, one minute before dawn, the night stopped.', 'It has begun again, every night since.'];
  at(0, 0, () => {
    memories.show(6);
    hud.flash(1, '#000');
    document.getElementById('letterbox')!.classList.add('on');
    document.getElementById('memline')!.classList.add('on');
    memLine(L[0], '');
  });
  at(0.9, 1, () => memLine(null, L[1]));
  at(5.2, 2, () => memLine(null, L[2]));
  at(9.6, 3, () => memLine(null, L[3]));
  at(15.6, 4, () => {
    memLine(null, L[4]);
    sfx('bell');
  });
  at(19.2, 5, () => memLine(null, L[5]));
  at(PRO_MEM - 0.3, 6, () => {
    endMemory();
    memLine('', '');
    // the place it left behind: low across the plaza from the west, along the still shadows, toward the hearth
    rig.snap({ yaw: -1.66, height: 1.3, dist: 18, lookY: 0.7, fov: 40 });
    rig.go({ yaw: -1.42, height: 2.6, dist: 8.5, lookY: 1.1, fov: 44 }, 9);
  });
  at(PRO_MEM + 1.0, 7, () => hud.card('', '', 'Every shadow here points away from the Dawn Gate.'));
  at(PRO_MEM + 4.9, 8, () => hud.card('', '', 'One of them belongs to no one.'));
  at(PRO_END, 9, () => {
    hud.hideCard();
    startChapter(0);
    whispered.add('owner'); // already said
  });
}

/** Start a level from a menu: clear any ending, memory or dawn state first. */
function goLevel(i: number): void {
  initAudio();
  menu.close();
  endMemory();
  ending = null;
  stage.dawn = 0;
  sunEdge = 30;
  hud.title(false);
  startChapter(i);
}

/** Back to the title: the knight kneels at the hearth again. */
function goTitle(): void {
  // in The Last Ember the title is the shared one (Act I's page): this page's own title is for /classic alone
  if (FROM) {
    location.href = `./${DEBUG ? '?debug=1' : ''}`;
    return;
  }
  menu.close();
  endMemory();
  ending = null;
  stage.dawn = 0;
  sunEdge = 30;
  chapterIndex = 0;
  world = newWorld(0, seed);
  ensureLevel();
  shadeViews.clear();
  worldUi.clear();
  applyPhase(0);
  setKnightFade(1);
  hud.hideCard();
  hud.show(false);
  hud.choice(false);
  hud.title(true);
  stage.setSky(CHAPTERS[0].sky, 1);
  setMood('night');
  knight.pose = 'kneel';
  kneelAtHearth();
  rig.go(TITLE_SHOT, 1.4);
  setMode('title');
  menu.open('title');
}

// ------------------------------------------------------------------ scripted scenes
let simAcc = 0;
/**
 * Advance the sim in fixed 1/60 s steps. `source` is asked for input once per step that actually runs, so a key
 * pressed on a frame where no step runs (high-refresh displays) stays latched for the next step instead of being lost.
 */
// ---- render interpolation
// The sim ticks at a fixed 60 Hz; screens refresh at 60, 120, 144... Drawing the latest tick as-is makes bodies hold
// still for a frame and then jump (micro-stutter that also reads as input lag). Instead each frame draws a blend of
// the last two ticks, by how far we are into the next one. The sim itself is untouched: the blended poses are
// written in just for drawing and the true ones put back right after.
interface Pose3 {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
let prevWorld: World | null = null;
const prevK: Pose3 = { x: 0, y: 0, z: 0, yaw: 0 };
const prevS = new Map<number, Pose3>();
// his move clock too: the sword arm and its trail are posed from it, so on a 120 Hz screen they stepped at 60
let prevKState = '';
let prevKStateT = 0;
let trueKStateT = NaN;
function snapshot(): void {
  const k = world.knight;
  prevWorld = world;
  prevKState = k.state;
  prevKStateT = k.stateT;
  prevK.x = k.x;
  prevK.y = k.y;
  prevK.z = k.z;
  prevK.yaw = k.yaw;
  for (const sh of world.shades) {
    const p = prevS.get(sh.id);
    if (p) {
      p.x = sh.x;
      p.y = sh.y;
      p.z = sh.z;
      p.yaw = sh.yaw;
    } else prevS.set(sh.id, { x: sh.x, y: sh.y, z: sh.z, yaw: sh.yaw });
  }
  if (prevS.size > world.shades.length + 16) for (const id of prevS.keys()) if (!world.shades.some((q) => q.id === id)) prevS.delete(id);
}
const truePoses: number[] = [];
function blendPose(o: Pose3, p: Pose3, a: number): void {
  truePoses.push(o.x, o.y, o.z, o.yaw);
  if (Math.abs(o.x - p.x) + Math.abs(o.z - p.z) + Math.abs(o.y - p.y) > 3) return; // a teleport: don't smear it
  o.x = p.x + (o.x - p.x) * a;
  o.y = p.y + (o.y - p.y) * a;
  o.z = p.z + (o.z - p.z) * a;
  o.yaw = p.yaw + angleDiff(p.yaw, o.yaw) * a;
}
function interpolate(): void {
  truePoses.length = 0;
  if (prevWorld !== world) return;
  const a = Math.min(1, simAcc / CFG.dt);
  blendPose(world.knight, prevK, a);
  const k = world.knight;
  if (k.state === prevKState && k.stateT >= prevKStateT) {
    trueKStateT = k.stateT;
    k.stateT = prevKStateT + (k.stateT - prevKStateT) * a;
  }
  for (const sh of world.shades) {
    const p = prevS.get(sh.id);
    if (p) blendPose(sh, p, a);
    else truePoses.push(sh.x, sh.y, sh.z, sh.yaw);
  }
}
function restorePoses(): void {
  if (!truePoses.length) return;
  const put = (o: Pose3, i: number) => {
    o.x = truePoses[i];
    o.y = truePoses[i + 1];
    o.z = truePoses[i + 2];
    o.yaw = truePoses[i + 3];
  };
  put(world.knight, 0);
  world.shades.forEach((sh, i) => put(sh, 4 + i * 4));
  truePoses.length = 0;
  if (!Number.isNaN(trueKStateT)) {
    world.knight.stateT = trueKStateT;
    trueKStateT = NaN;
  }
}

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
    snapshot();
    world.step(input);
    if (recording) for (const e of world.events) moment(e.type, e);
    for (const e of world.events) {
      if (e.type === 'knightHurt') levelStats.wounds += e.dmg;
      else if (e.type === 'feed') levelStats.embers++;
    }
    playEvents(world.events, fx);
    worldUi.events(world.events, world);
    journeyEvents();
    for (const e of world.events) {
      if (e.type === 'hit') {
        shadeViews.hit(e.id);
        hud.hit();
      } else if (e.type === 'wallSlam') shadeViews.hit(e.id);
    }
    if (world.status !== 'playing') break;
  }
}

/** Walk the knight towards (x, z) during cutscenes (drives the sim so animation stays consistent). */
function walkTo(x: number, z: number, dt: number): boolean {
  const dx = x - world.knight.x;
  const dz = z - world.knight.z;
  const d = Math.hypot(dx, dz);
  const done = d < 0.25;
  stepSim(done ? NO_INPUT : { ...NO_INPUT, mx: dx / d, mz: dz / d }, dt);
  return done;
}

/** The title and midnight pose: beside the hearth, facing it. */
function kneelAtHearth(): void {
  const k = world.knight;
  k.x = world.hearthX - 1.75;
  k.z = world.hearthZ;
  k.yaw = 0;
}

function midnight(dt: number): void {
  world.spawning = false;
  world.endless = true;
  world.status = 'playing';
  const arrived = modeT > 0.2 ? walkTo(world.hearthX - 1.75, world.hearthZ, dt) : false;
  if (arrived) world.knight.yaw += angleDiff(world.knight.yaw, 0) * Math.min(1, dt * 6); // turn to the fire
  stage.setSky(MIDNIGHT_SKY, Math.min(1, dt * 0.5));
  // the hearth gutters
  if (modeT < 4.6) {
    const p = Math.min(1, modeT / 4.2);
    hearth.strength = Math.max(0.08, (1 - p) * 0.55 * (0.6 + 0.4 * Math.abs(Math.sin(modeT * 9.1) * Math.sin(modeT * 3.3))));
    hearth.flameTop = 1.4 + 0.9 * (1 - p);
  }
  at(0.0, 0, () => {
    hud.show(false);
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
    fx.flash(0.55, '#ffb070');
    rig.kick(1.2);
    rig.shake(0.3);
    const hx = world.hearthX;
    const hz = world.hearthZ;
    for (let i = 0; i < 90; i++)
      glow.emit({ x: hx + (Math.random() - 0.5) * 1.5, y: 1.3, z: hz + (Math.random() - 0.5) * 1.5, vx: (world.knight.x - hx) * 1.6 + (Math.random() - 0.5) * 2, vz: (world.knight.z - hz) * 1.6 + (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, spread: 0.6, life: 1.1, size: 0.12, sizeEnd: 0.02, r: 5, g: 2.2, b: 0.5, gravity: 3, drag: 0.8 });
    for (let i = 0; i < 40; i++)
      smoke.emit({ x: hx + (Math.random() - 0.5), y: 1.3, z: hz + (Math.random() - 0.5), vy: 1.5, spread: 0.8, life: 3.5, size: 0.9, sizeEnd: 2.4, r: 0.03, g: 0.025, b: 0.035, alpha: 0.4, drag: 0.4 });
  });
  at(5.6, 4, () => hud.card('XII', 'Midnight', 'The hearth is ash. The shadow that stood in it is gone.'));
  at(7.2, 5, () => {
    knight.pose = 'stand';
    setMood('night');
  });
  at(9.6, 6, () => startChapter(midnightIndex));
}

/** The memory caption under the letterbox (the reveal speaks a line at a time). */
function memLine(eyebrow: string | null, text: string): void {
  if (eyebrow !== null) document.getElementById('mem-eyebrow')!.textContent = eyebrow;
  const el = document.getElementById('mem-text')!;
  el.textContent = text;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-out' });
}

// The dawn: the sun reaches the gate, and the last memory is not a memory. It is still happening, and it is you.
const REVEAL = 4.2; // seconds into the dawn when the reveal begins
const REVEAL_LEN = 19; // the reveal memory's length (memory.ts, set 5)
function dawn(dt: number): void {
  stage.setSky(DAWN_SKY, Math.min(1, dt * 0.45));
  stage.dawn = Math.min(1, modeT / 5);
  at(0, 0, () => {
    hud.show(false);
    rig.go(DAWN_SHOT, 3);
    sfx('dawn');
    setMood('dawn');
    world = newWorld(chapterIndex, seed, { startX: knightX, startY: knightY, startZ: knightZ, checkpointsLit: world.checkpointsLit });
    dawnBase = knightX;
    sunEdge = dawnBase + 30;
    world.spawning = false;
    world.endless = true;
    shadeViews.clear();
  });
  at(0.6, 1, () => hud.card('', 'Dawn', 'The sun reaches the Dawn Gate. For the first time since the night stopped.'));
  at(3.6, 2, () => hud.hideCard());
  at(REVEAL, 3, () => {
    memories.show(5);
    hud.flash(1, '#000');
    document.getElementById('letterbox')!.classList.add('on');
    document.getElementById('memline')!.classList.add('on');
    memLine('Not a memory  ·  It is still happening', '');
  });
  at(REVEAL + 1.2, 4, () => memLine(null, 'They were not running from the dark.'));
  at(REVEAL + 5.0, 5, () => memLine(null, 'They were running back. To the one in the fire.'));
  at(REVEAL + 9.8, 6, () => memLine(null, ''));
  at(REVEAL + 13.9, 7, () => memLine(null, 'It was you.'));
  at(REVEAL + 16.4, 8, () => memLine(null, 'You never closed your eyes. You stepped in.'));
  at(REVEAL + REVEAL_LEN - 0.4, 9, () => {
    endMemory();
    memLine('', '');
    hud.card('', '', 'You gave the fire yourself, and the night stopped.', 'Back to the fire, and it never ends. Or on into the morning.');
  });
  stepSim(NO_INPUT, dt);
  if (modeT > REVEAL + REVEAL_LEN + 5.5) {
    hud.hideCard();
    setMode('choice');
    choiceHold = 0;
    rig.follow(2.5, 0);
  }
}
let knightX = 0;
let knightY = 0;
let knightZ = 0;
let dawnBase = 0;

function choice(dt: number): void {
  stage.dawn = 1;
  stage.setSky(DAWN_SKY, Math.min(1, dt));
  const target = dawnBase + 2.5;
  sunEdge += (target - sunEdge) * Math.min(1, dt * 0.9);
  hud.choice(modeT > 0.6);
  stepSim(DEMO ? { ...NO_INPUT, mx: 1 } : () => ({ ...readInput(rig.yaw), attack: false, heavy: false }), dt);
  const k = world.knight;
  const inLight = k.x > sunEdge + 0.4; // on into the morning: he lets the fire go out
  const inShadow = k.x < dawnBase - 4.4; // back into the gatehouse's shadow, toward the fire: the night begins again
  choiceHold = inLight || inShadow ? choiceHold + dt : 0;
  if (choiceHold > 1.1) {
    ending = inLight ? 'light' : 'shadow';
    hud.choice(false);
    setMode('ending');
  }
}

/** The still shadows turn as the morning climbs (the ending where he lets the fire go): k 0..1. */
const thawDir = new THREE.Vector3();
function thaw(k: number): void {
  // from the frozen dawn, low in the east, up toward the morning sun; re-baked as it goes (a cutscene: one depth pass)
  thawDir.copy(FROZEN_DIR_START).lerp(new THREE.Vector3(0.25, 1, -0.35), k).normalize();
  frozen.dir.copy(thawDir);
  FROZEN.uFzDir.value.copy(thawDir);
  bakeStill();
  FROZEN.uFzK.value = 1 - Math.max(0, (k - 0.55) / 0.45);
}
const FROZEN_DIR_START = frozen.dir.clone();

function endingScene(dt: number): void {
  const light = ending === 'light';
  stage.dawn = light ? 1 : Math.max(0, 1 - modeT / 9);
  at(0, 0, () => {
    rig.go(ENDING_SHOT, 4);
    if (light) sfx('gutter');
  });
  if (light) {
    // he walks on into the morning; the torch, the last fire in the city, goes out; the shadows finally move
    stepSim(NO_INPUT, dt);
    at(0.6, 1, () => {
      knight.setTorch(false);
      fx.flash(0.2, '#ffd8b0');
      const k = world.knight;
      for (let i = 0; i < 40; i++)
        smoke.emit({ x: k.x + 0.4, y: k.y + 1.6, z: k.z, vy: 1.4, spread: 0.4, life: 2.6, size: 0.4, sizeEnd: 1.4, r: 0.05, g: 0.045, b: 0.05, alpha: 0.6, drag: 0.6 });
    });
    at(1.2, 2, () => hud.card('', '', 'He let the fire go out.'));
    const sp = Math.max(0, Math.min(1, (modeT - 3) / 8));
    if (sp > 0) thaw(sp);
    at(4.6, 3, () => hud.card('', '', 'Somewhere, a shadow moved.'));
    at(7.8, 4, () => hud.card('', '', 'Then all of them did.'));
    const p = Math.max(0, Math.min(1, (modeT - 8) / 5));
    setKnightFade(1 - p);
    if (p > 0 && p < 1) {
      const k = world.knight;
      for (let i = 0; i < 6; i++)
        glow.emit({ x: k.x + (Math.random() - 0.5) * 1.0, y: k.y + Math.random() * 2.2, z: k.z + (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), vx: -0.4, spread: 0.3, life: 2.4, size: 0.12, sizeEnd: 0.02, r: 4, g: 3.2, b: 2.2, gravity: -0.6, wobble: 0.8 });
    }
    at(11.2, 5, () => hud.card('', '', 'They went home. So did he.'));
  } else {
    // he turns back to the fire; the sun sinks back below the hills; time stops everywhere; the night begins again
    sunEdge += (dawnBase - 4.5 - sunEdge) * Math.min(1, dt * 0.5);
    const arrived = walkTo(dawnBase - 5.2, world.knight.z, dt);
    if (arrived) knight.pose = 'kneel';
    stage.setSky(CHAPTERS[0].sky, Math.min(1, dt * 0.35));
    stillAll = modeT > 3 ? 1 : 0;
    at(0.4, 1, () => hud.card('', '', 'He turned back to the fire.'));
    at(4.4, 2, () => hud.card('', '', 'The sun sank back behind the hills.'));
    at(8.4, 3, () => hud.card('', '', 'No one aged. No one woke. No one was lost.'));
    at(12.0, 4, () => hud.card('', '', 'The sun sets, as it has every night.'));
  }
  at(15.5, 9, () => {
    hud.card('', 'The Last Ember', light ? 'The last ember went out. Morning came.' : 'The fire endures. So does the night.', 'Thank you for playing  ·  Enter to begin again');
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
kneelAtHearth();
fitParticles();
applySettings();
if (DEMO) {
  /* the demo drives itself */
} else if (FROM === 'still') queueMicrotask(goPrologue); // (once the whole module has run: state declared below)
else if (FROM === 'chapters') queueMicrotask(() => goLevel(chapterIndex));
else menu.open('title');
if (FROM) {
  // arrived without a click on this page: sound starts with the first touch (the click that takes the lock)
  const wake = () => initAudio();
  // (capture: the click that takes the pointer lock is stopped before it reaches the game)
  addEventListener('pointerdown', wake, { once: true, capture: true });
  addEventListener('keydown', wake, { once: true, capture: true });
}

let manualClock = false;
let closeT = 0; // seconds the close-quarters lean still holds
let restartHold = 0; // seconds R has been held
let stillAll = 0; // 1 once the loop closes: time stops everywhere
let boltT = 9; // seconds to the next lightning // trailer capture drives the game with exact steps (tick) instead of rAF
function frame(now: number): void {
  if (!manualClock) update(now);
  requestAnimationFrame(frame);
  // no cursor while the game is being played (a menu, the title or the credits bring it back)
  wantCursorHidden(!DEMO && mode !== 'title' && mode !== 'paused' && mode !== 'credits' && !menu.isOpen, mode === 'play');
}

// adaptive quality: if real frames run slow for ~2 s, drop the internal resolution one step (never back up)
let slowFrames = 0;
/** Fixed quality from settings, or auto (start high, step down if frames run slow). */
function applyQuality(): void {
  const q = settings.quality;
  const r = q === 'high' ? DPR_STEPS[0] : q === 'medium' ? 1 : q === 'low' ? 0.75 : DPR_STEPS[q === 'auto' ? dprStep : 0];
  stage.setPixelRatio(r);
  stage.smaa.enabled = q !== 'low' && !(q === 'auto' && dprStep === DPR_STEPS.length - 1);
  stage.setQuality(q === 'low' ? 'low' : q === 'medium' || (q === 'auto' && dprStep > 0) ? 'medium' : 'high');
  fitParticles();
}
function adaptQuality(rawDt: number): void {
  if (settings.quality !== 'auto') return;
  if (rawDt <= 0 || rawDt > 0.09) return; // throttled/background frames say nothing about the GPU
  slowFrames = rawDt > 1 / 45 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
  if (slowFrames > 120 && dprStep < DPR_STEPS.length - 1) {
    dprStep++;
    slowFrames = 0;
    stage.setPixelRatio(DPR_STEPS[dprStep]);
    if (dprStep === DPR_STEPS.length - 1) stage.smaa.enabled = false;
    stage.setQuality(dprStep === DPR_STEPS.length - 1 ? 'low' : 'medium'); // the first thing to go: moon shadows, the lens
    fitParticles();
    console.info(`[quality] pixel ratio -> ${DPR_STEPS[dprStep]}`);
  }
}

function update(now: number): void {
  SHADOW_FRAME.n++;
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
      menu.close();
      hud.title(false);
      startChapter(chapterIndex);
    }
  } else if (mode === 'midnight') rig.orbit -= rawDt * 0.09; // the world goes black around one flame
  else rig.orbit *= 1 - Math.min(1, rawDt * 1.5);

  if (mode === 'intro' && modeT > 3.8) beginPlay();
  if (mode === 'prologue') prologue();

  if (mode === 'play') {
    teachStep(rawDt);
    // restart is a held R (it sits beside the turn keys; a stray tap must not throw the level away)
    restartHold = isHeld('KeyR') ? restartHold + rawDt : 0;
    if (restartHold > 0.6) {
      restartHold = 0;
      startChapter(chapterIndex, true);
      return;
    }
    stepSim(DEMO ? () => botInput(world) : () => readInput(rig.yaw), dt);
    placeCheck(rawDt);
    if (world.status === 'cleared') {
      knightX = world.knight.x;
      knightY = world.knight.y;
      knightZ = world.knight.z;
      if (world.chapter.phase === 'dawn') setMode('dawn');
      else {
        setMode('outro');
        playMemory(chapterIndex);
        hud.show(false);
        rig.go(cardShot(), 2.5);
        fx.slowmo(1, 0);
      }
    } else if (world.status === 'lost') {
      setMode('lost');
      const why = world.loseReason === 'hearth' ? 'The hearth went dark.' : 'The knight fell, and the dark came in.';
      hud.card(world.chapter.roman, 'The fire is lost', why, DEMO ? '' : 'R to rise again', { eyebrow: levelTitle(chapterIndex), level: chapterIndex, levels: CHAPTERS.length });
      hud.show(false);
    }
  }

  if (mode === 'outro' && memEnd > 0 && modeT >= memEnd && document.getElementById('memline')!.classList.contains('on')) {
    document.getElementById('memline')!.classList.remove('on');
    document.getElementById('letterbox')!.classList.remove('on');
    levelComplete();
  }
  if (mode === 'outro' && modeT >= outroTime()) {
    endMemory();
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

  // ---- render-side updates (drawn from the blend of the last two sim ticks; see interpolate)
  interpolate();
  if (mode === 'intro' || mode === 'play' || mode === 'outro' || mode === 'lost' || mode === 'title' || mode === 'prologue') {
    const sky = mode === 'outro' && CHAPTERS[chapterIndex + 1] && chapterIndex + 1 !== midnightIndex ? CHAPTERS[chapterIndex + 1].sky : world.chapter.sky;
    stage.setSky(sky, Math.min(1, rawDt * (mode === 'outro' ? 0.9 : 0.6)));
  }
  if (hearth.lit && mode !== 'midnight') {
    hearth.strength = world.hearthHp / CFG.hearth.maxHp;
    hearth.flameTop = world.light.y;
  }
  hearth.update(dt, t, glow, smoke, stage.camera);
  levelView?.update(dt, t, stage.camera, world.shrines.map((s) => s.active), world.checkpointsLit);
  placeGhost();
  if (mode === 'play') storyBeats();
  if (mode !== 'paused') {
    // how lit he stands (the sim's light model, shadows of solids included) and where the fire is: his edges answer it
    const lit = mode === 'title' || mode === 'intro' || mode === 'play' || mode === 'outro' || mode === 'lost';
    knight.exposure = lit ? world.lightAt(world.knight.x, world.knight.z) : 0.4;
    hearth.light.getWorldPosition(knight.fireAt);
    knight.update(world.knight, dt, t, smoke, glow, stage.camera);
    // contact shadows: under him, and under every shade that is up and walking
    const kb = world.knight;
    const live = mode === 'play' || mode === 'outro' || mode === 'lost';
    const spots = [{ x: kb.x, y: kb.y, z: kb.z, floor: world.floorAt(kb.x, kb.z, 0.2, kb.y), r: 0.55, a: knight.root.visible ? 1 : 0 }];
    if (live)
      for (const s of world.shades) {
        if (s.kind === 'lantern') continue; // it floats too high to touch the ground
        const a = s.state === 'dead' ? Math.max(0, 1 - s.deadT * 3) : s.state === 'rise' ? Math.min(1, s.stateT / 0.9) : 1;
        spots.push({ x: s.x, y: s.y, z: s.z, floor: world.floorAt(s.x, s.z, 0.2, s.y), r: s.big ? 1.1 : s.kind === 'crawler' ? 0.6 : 0.5, a });
      }
    blobs.update(spots);
    shadeViews.update(live ? world.shades : [], dt, t, smoke, glow);
    ambient(dt);
    drawProjectiles(dt);
    // once the loop closes, time stops: every ember and wisp hangs where it is
    glow.update(dt * (1 - stillAll), t);
    smoke.update(dt * (1 - stillAll), t);
  }
  // sun wash on the ground for the dawn choice
  const washOn = mode === 'choice' || mode === 'ending';
  const wm = sunWash.material as THREE.MeshBasicMaterial;
  wm.opacity += ((washOn ? 0.14 : 0) - wm.opacity) * Math.min(1, rawDt * 2);
  sunWash.scale.x = 40;
  sunWash.position.x = sunEdge + 20 - 3; // the ramp's soft edge sits on sunEdge
  sunWash.position.y = (washOn ? world.knight.y : 0) + 0.04;
  // the dawn sun stands low in the east, behind him wherever he is
  const kk = world.knight;
  stage.sun.position.set(kk.x + 30, kk.y + 6, kk.z + 8);
  stage.sun.target.position.set(kk.x, kk.y, kk.z);

  // the camera: authored shots frame the hearth on the title and at midnight, otherwise the knight
  const k = world.knight;
  if (mode === 'title') rig.target.set(world.hearthX - 0.9, 0, world.hearthZ);
  else if (mode === 'prologue') rig.target.set(world.hearthX, 0, world.hearthZ);
  else if (mode === 'midnight') rig.target.set(world.hearthX - 1.1, 0, world.hearthZ);
  else rig.target.set(k.x, k.y, k.z);
  // the camera moves only by the mouse (moving it, dragging, or a two-finger swipe)
  const [lookX, lookY] = takeLook();
  if (rig.following && (mode === 'play' || mode === 'choice')) {
    rig.look(lookX, lookY, settings.sens, settings.invertY);
    // only the demo bot's camera follows him on its own; a player's moves only when they move the mouse (playtesters:
    // a camera that swung by itself, or with the movement keys, was not theirs)
    const speed = Math.hypot(k.vx, k.vz);
    if (DEMO && speed > 1 && k.state !== 'dash') rig.yaw += angleDiff(rig.yaw, k.yaw) * Math.min(1, rawDt * 2.2 * Math.min(1, speed / CFG.knight.speed));
  }
  // lean in a touch while shades are at close quarters, and hold it a second after: a zoom that followed every
  // swing pumped the whole view in and out
  const close = mode === 'play' && world.shades.some((s) => s.state !== 'dead' && Math.hypot(s.x - k.x, s.z - k.z) < 3.5);
  closeT = close ? 1 : Math.max(0, closeT - rawDt);
  rig.zoomTarget = closeT > 0 ? 0.93 : 1;
  rig.grounded = k.onGround || mode !== 'play';
  rig.update(rawDt, t, world.solids);
  fitParticles(); // particle sizes follow the lens as it changes (they were fitted to the title's 36 deg once)
  // the world UI projects through this camera before the render would refresh its matrices: refresh them now, or
  // every bar and marker trails the view by a frame while it turns
  stage.camera.updateMatrixWorld();
  // the lens: shallow focus on him for cards, cutscenes and endings; sharp while you play
  stage.focus.set(k.x, k.y + 1.3, k.z);
  stage.setCinematic(mode === 'title' || mode === 'prologue' || mode === 'intro' || (mode === 'outro' && memories.active < 0) || mode === 'midnight' || mode === 'dawn' || mode === 'ending' || mode === 'credits');
  // rain: steady through the night, heaviest at the darkest hour, gone at dawn
  const dry = mode === 'dawn' || mode === 'choice' || mode === 'ending' || mode === 'credits';
  rain.level += ((dry ? 0 : world.chapter.rain) - rain.level) * Math.min(1, rawDt * (dry ? 0.35 : 0.6));
  stage.rain = rain.level;
  const L0 = world.light;
  rain.update(t, stage.camera.position, { x: L0.x, y: L0.y, z: L0.z, radius: L0.radius, on: hearth.lit || knight.torchOn });
  // the story's other tell: inside the firelight the rain has stopped falling (time stopped there first)
  const lightOn = hearth.lit || knight.torchOn;
  rain.setStill(L0.x, L0.z, lightOn ? L0.radius * 0.8 : 0, stillAll);
  const ringOn = (mode === 'play' || mode === 'intro') && memories.active < 0 && (world.torch ? knight.torchOn : hearth.lit);
  lightRing.update(t, rawDt, L0.x, world.floorAt(L0.x, L0.z, 0.2, (world.torch ? world.knight.y : 0) + 0.5), L0.z, L0.radius, ringOn, world.torch ? 1 : hearth.strength);
  rain.mesh.visible = rain.mesh.visible && memories.active < 0;
  setRain(memories.active >= 0 || mode === 'paused' ? rain.level * 0.35 : rain.level);
  // now and then, in the heavier rain, lightning far off, and its thunder a moment later
  const stormy = rain.level > 0.4 && memories.active < 0 && (mode === 'play' || mode === 'intro' || mode === 'title' || mode === 'prologue' || mode === 'midnight');
  boltT -= stormy ? rawDt : 0;
  if (boltT <= 0) {
    boltT = 18 + Math.random() * 26;
    if (stormy && settings.flashes > 0.05) {
      stage.lightning(t, 0.55 + Math.random() * 0.45 * settings.flashes);
      setTimeout(() => sfx('thunder'), 700 + Math.random() * 1800);
    }
  }
  memories.update(rawDt, stage.camera, glow, smoke);
  stage.update(t, stage.camera.position);
  hud.update(world, rawDt);
  worldUi.update(world, rawDt, mode === 'play' && memories.active < 0);
  worldUi.hearthMarker(world, mode === 'play');
  const danger = mode === 'play' ? Math.min(1, world.shades.filter((s) => s.state !== 'dead' && Math.abs(s.x - world.knight.x) < 6).length / 3) : 0;
  // the hearth's crackle fades out over ~12 m from it; the carried torch makes no sound of its own
  const nearHearth = Math.max(0, 1 - Math.hypot(world.knight.x - world.hearthX, world.knight.z - world.hearthZ) / 12);
  setBeds(hearth.lit && !world.torch ? hearth.strength * nearHearth : 0, danger);
  stage.render();
  restorePoses();

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
function addBoltSprite(): void {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.35, 2.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sp.scale.setScalar(0.75);
  sp.visible = false;
  stage.scene.add(sp);
  boltSprites.push(sp);
}
for (let i = 0; i < 12; i++) addBoltSprite(); // made up front, so the warm-up draws them before the first lantern fires
function drawProjectiles(dt: number): void {
  const live = mode === 'play' ? world.bolts : [];
  while (boltSprites.length < live.length) addBoltSprite();
  boltSprites.forEach((sp, i) => {
    const b = live[i];
    sp.visible = !!b;
    if (!b) return;
    sp.position.set(b.x, b.y, b.z);
    sp.scale.setScalar(0.65 + Math.sin(t * 30 + i) * 0.1);
    // trail density per second, not per frame (a 144 Hz screen drew 2.4x the smoke)
    for (let j = 0, c = emitCount(dt * 120); j < c; j++)
      smoke.emit({ x: b.x, y: b.y, z: b.z, vx: -b.vx * 0.05, vy: -b.vy * 0.05, vz: -b.vz * 0.05, spread: 0.1, life: 0.45, size: 0.45, sizeEnd: 0.15, r: 0.03, g: 0.0, b: 0.06, alpha: 0.85, drag: 2 });
    if (Math.random() < dt * 60) glow.emit({ x: b.x, y: b.y, z: b.z, spread: 0.3, life: 0.25, size: 0.08, sizeEnd: 0.01, r: 1.2, g: 0.5, b: 3.5 });
  });
  if (mode !== 'play') return;
  // the Marshal's shockwave: a ring of fire and smoke racing outward along the ground
  for (const w of world.waves) {
    const n = Math.max(1, Math.round(dt * 60 * w.r));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = w.x + Math.cos(a) * w.r;
      const z = w.z + Math.sin(a) * w.r;
      glow.emit({ x, y: 0.15, z, vy: 2.5 + Math.random() * 2, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, spread: 0.3, life: 0.4, size: 0.18, sizeEnd: 0.03, r: 4, g: 0.6, b: 0.25, gravity: 6, drag: 1 });
      if (i % 2) smoke.emit({ x, y: 0.2, z, vy: 1.6, spread: 0.3, life: 0.6, size: 0.7, sizeEnd: 1.4, r: 0.05, g: 0.0, b: 0.02, alpha: 0.7, drag: 2 });
    }
  }
}

/** Ash drifting down through every frame; ink mist seeping from every shadow the fire casts. */
function ambient(dt: number): void {
  const cam = stage.camera.position;
  if (mode === 'play' || mode === 'intro' || mode === 'title' || mode === 'prologue') {
    // sample the ground around him: wherever a ruin's shadow falls inside the firelight, ink seeps up
    const L = world.light;
    const cx = rig.target.x;
    const cz = rig.target.z;
    const tries = Math.round(dt * 420); // ink seeping from the shadows: a hint of where they rise, not a fog over the fight
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 18;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (Math.hypot(x - L.x, z - L.z) > L.radius * 1.4 || !world.inShadow(x, z)) continue;
      smoke.emit({
        x, y: 0.05, z,
        vx: (Math.random() - 0.5) * 0.2, vy: 0.22, spread: 0.08, life: 2.2, size: 0.8, sizeEnd: 1.5,
        r: 0.035, g: 0.015, b: 0.07, alpha: 0.24, drag: 0.3,
      });
      if (Math.random() < 0.08)
        glow.emit({ x, y: 0.1, z, vy: 0.35, spread: 0.05, life: 2.2, size: 0.05, sizeEnd: 0.01, r: 0.9, g: 0.4, b: 2.2, wobble: 0.3 });
    }
  }
  // rain splashes on whatever is underfoot (the ground, a wall top, the hut's roof), and drips off the eaves
  if (rain.level > 0.02 && memories.active < 0) {
    const ns = dt * 150 * rain.level;
    for (let i = 0, c = emitCount(ns); i < c; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.sqrt(Math.random()) * 13;
      const x = rig.target.x + Math.cos(a) * r;
      const z = rig.target.z + Math.sin(a) * r;
      // no drop lands where time has stopped (inside the firelight, or anywhere once the loop has closed)
      if (stillAll > 0.5 || ((hearth.lit || knight.torchOn) && Math.hypot(x - world.light.x, z - world.light.z) < world.light.radius * 0.8)) continue;
      const y = world.floorAt(x, z, 0.02);
      smoke.emit({ x, y: y + 0.03, z, vy: 0.9, spread: 0.25, life: 0.22, size: 0.05, sizeEnd: 0.13, r: 0.42, g: 0.45, b: 0.55, alpha: 0.45, drag: 3 });
    }
    const sh = world.level.shelter;
    if (sh) {
      const nd = dt * 26 * rain.level;
      for (let i = 0, c = emitCount(nd); i < c; i++) {
        const side = Math.random() < 0.5 ? 0 : 2;
        glow.emit({ x: sh.rect[0] + Math.random() * (sh.rect[2] - sh.rect[0]), y: sh.y - 0.05, z: sh.rect[1 + side] + (side ? 0.15 : -0.15), vy: -2, spread: 0.02, life: 0.5, size: 0.035, sizeEnd: 0.025, r: 1.1, g: 0.75, b: 0.5, gravity: 14 });
      }
    }
  }
  const n = dt * (stage.dawn > 0.5 ? 6 : 12);
  for (let i = 0, c = emitCount(n); i < c; i++) {
    smoke.emit({
      x: cam.x + (Math.random() - 0.5) * 30, y: 8 + Math.random() * 3, z: cam.z + (Math.random() - 0.5) * 30,
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
    start: () => { menu.close(); hud.title(false); startChapter(chapterIndex); },
    restart: () => startChapter(chapterIndex, true),
    skipTo: (i: number) => { menu.close(); hud.title(false); startChapter(i, true); },
    play: () => beginPlay(),
    midnight: () => { hud.title(false); hud.hideCard(); chapterIndex = midnightIndex - 1; world = newWorld(chapterIndex, seed); applyPhase(chapterIndex); setMode('midnight'); },
    dawn: () => { hud.title(false); hud.hideCard(); chapterIndex = CHAPTERS.length - 1; applyPhase(chapterIndex); knightX = 0; setMode('dawn'); },
    endHour: () => { world.time = world.chapter.duration - 0.1; },
    set godMode(v: boolean) { godMode = v; },
    set manual(v: boolean) { manualClock = v; },
    set timeScale(v: number) { timeScale = v; slowT = v === 1 ? 0 : 1e9; },
    get godMode() { return godMode; },
    setSeed: (n: number) => { seed = n; },
    snapshot: () => JSON.stringify({ mode, chapter: world.chapter.id, t: world.time, knight: { x: world.knight.x, y: world.knight.y, z: world.knight.z, yaw: world.knight.yaw, hp: world.knight.hp, state: world.knight.state }, hearth: world.hearthHp, shades: world.shades.map((s) => ({ id: s.id, x: +s.x.toFixed(2), z: +s.z.toFixed(2), hp: +s.hp.toFixed(2), state: s.state, big: s.big })) }),
    renderer: stage.renderer,
    kv: knight,
    stage,
    /** Advance the whole game by ms without waiting for animation frames (screenshots of exact moments). */
    tick: (ms: number, steps = 1) => { for (let i = 0; i < steps; i++) update(last + ms); },
    /**
     * Frame-time survey of a level under god mode: warm it behind its card, let the GPU settle, then time n frames
     * (sim + render + GPU finish) through the fight. Median / p95 / worst ms and the frames over 20 ms. One unbroken run:
     * yielding mid-run let the real frame loop draw in between and polluted the frames after it. gl.finish drains the
     * GPU each frame, so absolute numbers run high; compare runs, and profile in DevTools for the real picture.
     */
    hitches: async (i: number, n = 900) => {
      const gl = stage.renderer.getContext();
      godMode = true;
      menu.close();
      hud.title(false);
      startChapter(i, true);
      for (let f = 0; f < 240; f++) update(last + 1000 / 60);
      await new Promise((r) => setTimeout(r, 2500));
      beginPlay();
      const ms: number[] = [];
      const spikes: [number, number][] = [];
      for (let f = 0; f < n; f++) {
        const t0 = performance.now();
        update(last + 1000 / 60);
        gl.finish();
        const d = performance.now() - t0;
        ms.push(d);
        if (d > 20) spikes.push([f, Math.round(d)]);
      }
      const s = [...ms].sort((a, b) => a - b);
      const q = (p: number) => +s[Math.min(n - 1, Math.floor(n * p))].toFixed(1);
      return { level: CHAPTERS[i].id, median: q(0.5), p95: q(0.95), p99: q(0.99), worst: +s[n - 1].toFixed(0), spikes };
    },
    /** Render n frames synchronously and return GPU+CPU ms per frame. */
    bench: (n = 60) => {
      const gl = stage.renderer.getContext();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { update(last + 1000 / 60); gl.finish(); }
      return +((performance.now() - t0) / n).toFixed(2);
    },
    rig,
    THREE,
    /** Live objects for profiling from the console (wrap a method, time it). */
    parts: { get world() { return world; }, get level() { return levelView; }, glow, smoke, shadeViews, hud, worldUi, rain, memories, hearth, frozen, FROZEN, ghost, bakeStill },
  };
}

// ------------------------------------------------------------------ trailer capture (?debug=1&trailer=1, dev only)
if (DEBUG && params.get('trailer') === '1') {
  void import('./trailer').then((m) => m.installTrailer((window as unknown as { __game: Parameters<typeof m.installTrailer>[0] }).__game));
}
