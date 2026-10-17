import * as THREE from 'three';
import { CAMERA, COLORS, PLAYER, SHADOW_MOVE, SPELL } from './config';
import { SoundSynth } from './fx/SoundSynth';
import { ChronoFX } from './fx/ChronoFX';
import { Arena } from './world/Arena';
import { BreadcrumbTrail } from './world/BreadcrumbTrail';
import { RecallSystem } from './player/RecallSystem';
import { PlayerController } from './player/PlayerController';
import { CharacterRig } from './player/CharacterRig';
import { SimpleOverlay } from './ui/SimpleOverlay';
import { AUTOTEST, TestHooks } from './debug/TestHooks';
import { TrainingDummies } from './world/TrainingDummies';
import { Shadowballs } from './combat/Shadowballs';
import { SpellHands } from './combat/SpellHands';
import { DamageNumbers } from './ui/DamageNumbers';
import { FormController } from './player/FormController';
import { FormHud } from './ui/FormHud';

// --- Renderer / scene / camera ------------------------------------------------
const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.fog);
scene.fog = new THREE.Fog(COLORS.fog, 35, 110);

const camera = new THREE.PerspectiveCamera(
  CAMERA.baseFov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

// --- Systems --------------------------------------------------------------------
const arena = new Arena(scene, renderer);
// Shadowballs hit the level boxes; dummies are hit-tested by capsule, so snapshot before adding theirs.
const worldColliders = arena.colliders.slice();
const dummies = new TrainingDummies(scene, arena.colliders);
const trail = new BreadcrumbTrail(scene);
const recall = new RecallSystem();
const sound = new SoundSynth();
const chrono = new ChronoFX(camera);
const player = new PlayerController(camera, renderer.domElement, arena.colliders);
const character = new CharacterRig(scene, arena.colliders);
const balls = new Shadowballs(scene, worldColliders, dummies);
const spells = new SpellHands(balls, worldColliders, dummies, sound);
const damageNumbers = new DamageNumbers();
const forms = new FormController();
const formHud = new FormHud();
balls.warmup(renderer, scene, camera);

const testHooks = AUTOTEST
  ? new TestHooks({ player, character, recall, arena, camera, sound, spells, forms, balls, dummies, damageNumbers })
  : null;
if (AUTOTEST) document.getElementById('blocker')?.classList.add('hidden');

const overlay = new SimpleOverlay(() => {
  sound.unlock();
  requestLock(renderer.domElement);
});

/** Simulation clock in ms; only advances while playing so pausing doesn't eat history. */
let simTime = 0;

player.onJump = () => sound.jump();
player.onSlide = () => {
  sound.startSlide();
  character.puff(24);
};
player.onLand = (impact) => {
  // The wraith settles silently; only the runner thuds down.
  if (impact > 3 && forms.form === 'runner') sound.land(impact);
};
// Only the runner has feet; the wraith glides (see setDrift below).
character.onFootstep = (intensity) => sound.footstep(intensity);
player.onRespawn = () => recall.clear();
player.onRecall = () => {
  if (!player.enabled) return;
  if (recall.trigger({ position: player.feet, yaw: player.yaw, pitch: player.pitch }, simTime)) {
    player.enabled = false;
    spells.cancel();
  }
};

// --- Forms: Q swaps the runner vessel and the shadow entity ----------------------
player.onFormToggle = () => {
  if (player.enabled) forms.toggle();
};
forms.onStart = (to) => {
  spells.cancel();
  sound.formShift(to === 'shadow');
  formHud.announce(to);
  character.puff(to === 'shadow' ? 50 : 15);
};
forms.onSwap = (to) => {
  player.setProfile(to);
  character.setForm(to);
  spells.enabled = to === 'shadow';
};
// Spells: LMB = left hand, RMB = right hand (shadow form only).
player.onHandPress = (hand) => {
  if (player.enabled && forms.form === 'shadow' && !forms.transitioning) spells.press(hand);
};
player.onHandRelease = (hand) => spells.release(hand);
spells.onRefused = () => formHud.flashMagicka();

balls.onImpact = (e) => {
  sound.impact(e.power, e.point.distanceTo(camera.position));
  if (e.dummy) {
    sound.dummyHit();
    damageNumbers.show(e.point, e.damage, e.power > 0.5 ? 'charged' : 'hit');
  }
  for (const s of e.splash) {
    damageNumbers.show(s.dummy.position.clone().setY(1.4), s.amount, 'splash');
  }
};

recall.onStart = () => sound.recallStart();
recall.onLand = (pose) => {
  player.teleport(pose.position, pose.yaw, pose.pitch);
  player.enabled = true;
  sound.recallLand();
};
recall.onReady = () => sound.cooldownReady();

document.addEventListener('pointerlockchange', () => {
  overlay.setLocked(player.isLocked());
  if (!player.isLocked()) spells.cancel();
});

function requestLock(el: HTMLElement): void {
  // Prefer raw (unaccelerated) mouse input where supported; fall back to a plain request.
  try {
    const result = el.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
    result?.catch(() => {
      (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch(() => undefined);
    });
  } catch {
    el.requestPointerLock();
  }
}

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  trail.setViewport(h * renderer.getPixelRatio(), CAMERA.baseFov);
  character.setViewport(h * renderer.getPixelRatio(), CAMERA.baseFov);
  balls.setViewport(h * renderer.getPixelRatio(), CAMERA.baseFov);
}
window.addEventListener('resize', onResize);
onResize();

// --- Main loop ------------------------------------------------------------------
let last = performance.now();
let speedFov = 0;
let bodiesWarm = false;
const forward = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (player.isLocked()) {
    simTime += dt * 1000;
    player.update(dt);
    const pose = recall.update(dt);
    if (pose && recall.state === 'recalling') player.setPose(pose.position, pose.yaw, pose.pitch);
    recall.record(simTime, player.feet, player.yaw, player.pitch);
    forms.update(dt);
    spells.update(dt, player.profile === 'shadow' && player.sprintActive);
  }
  character.setDissolve(forms.dissolve);
  if (!bodiesWarm && character.isLoaded) {
    character.warmup(renderer, scene, camera);
    bodiesWarm = true;
  }

  // The slide scrape follows the slide; Recall or a jump out of it cuts it.
  if (player.sliding && recall.state !== 'recalling') sound.setSlideSpeed(player.speed);
  else sound.stopSlide();
  // The wraith's cloak rustles and breathes as it glides.
  sound.setDrift(forms.form === 'shadow' && player.isLocked() && recall.state !== 'recalling' ? player.speed : -1);

  player.syncCamera(character.headBobY, character.headRoll);
  trail.update(recall, simTime);
  // Sense of speed: the runner's view widens as sprint momentum builds (Skyrim's FOV stays fixed).
  const fast =
    player.profile === 'runner'
      ? THREE.MathUtils.clamp((player.speed - PLAYER.walkSpeed) / (PLAYER.topSpeed - PLAYER.walkSpeed), 0, 1)
      : 0;
  speedFov += (fast * CAMERA.speedFov - speedFov) * Math.min(1, dt * 4);
  chrono.baseFov = CAMERA.baseFov + speedFov;
  chrono.update(recall.state === 'recalling' ? recall.progress : null);
  overlay.update(recall.state, recall.cooldownRemaining);
  formHud.update(dt, forms.form, forms.dissolve, spells.magicka / SPELL.magickaMax, player.stamina / SHADOW_MOVE.staminaMax);

  {
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const v = player.velocity;
    character.update(dt, {
      feet: player.feet,
      eye: camera.position,
      yaw: player.yaw,
      pitch: player.pitch,
      velocity: v,
      speed: player.speed,
      forwardSpeed: -v.x * sin - v.z * cos,
      strafeSpeed: v.x * cos - v.z * sin,
      onGround: player.onGround,
      state: player.state,
      slideT: player.slideT,
      crouch: player.crouchAmount,
      recalling: recall.state === 'recalling',
      recallProgress: recall.progress,
      form: forms.form,
      spells: forms.form === 'shadow' ? spells.pose : null,
    });
  }

  // Spells leave from the palms as posed this frame.
  if (player.isLocked()) {
    const cp = Math.cos(player.pitch);
    forward.set(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
    spells.lateUpdate(character.spellHands, camera.position, forward, player.velocity);
    balls.update(dt);
  }
  dummies.update(dt, camera);
  damageNumbers.update(dt, camera);

  renderer.render(scene, testHooks?.viewCamera(camera) ?? camera);
  testHooks?.update();
});
