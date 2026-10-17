import * as THREE from 'three';
import { CAMERA, COLORS } from './config';
import { SoundSynth } from './fx/SoundSynth';
import { ChronoFX } from './fx/ChronoFX';
import { Arena } from './world/Arena';
import { BreadcrumbTrail } from './world/BreadcrumbTrail';
import { RecallSystem } from './player/RecallSystem';
import { PlayerController } from './player/PlayerController';
import { CharacterRig } from './player/CharacterRig';
import { SimpleOverlay } from './ui/SimpleOverlay';

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
const trail = new BreadcrumbTrail(scene);
const recall = new RecallSystem();
const sound = new SoundSynth();
const chrono = new ChronoFX(camera);
const player = new PlayerController(camera, renderer.domElement, arena.colliders);
const character = new CharacterRig(scene);

const overlay = new SimpleOverlay(() => {
  sound.unlock();
  requestLock(renderer.domElement);
});

/** Simulation clock in ms; only advances while playing so pausing doesn't eat history. */
let simTime = 0;

player.onJump = () => sound.jump();
player.onRespawn = () => recall.clear();
player.onRecall = () => {
  if (!player.enabled) return;
  if (recall.trigger({ position: player.feet, yaw: player.yaw, pitch: player.pitch }, simTime)) {
    player.enabled = false;
  }
};

recall.onStart = () => sound.recallStart();
recall.onLand = (pose) => {
  player.teleport(pose.position, pose.yaw, pose.pitch);
  player.enabled = true;
  sound.recallLand();
};
recall.onReady = () => sound.cooldownReady();

document.addEventListener('pointerlockchange', () => overlay.setLocked(player.isLocked()));

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
}
window.addEventListener('resize', onResize);
onResize();

// --- Main loop ------------------------------------------------------------------
let last = performance.now();
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
  }

  player.syncCamera(character.headBobY, character.headRoll);
  trail.update(recall, simTime);
  chrono.update(recall.state === 'recalling' ? recall.progress : null);
  overlay.update(recall.state, recall.cooldownRemaining);

  {
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const v = player.velocity;
    character.update(dt, {
      feet: player.feet,
      eye: camera.position,
      yaw: player.yaw,
      pitch: player.pitch,
      speed: player.speed,
      forwardSpeed: -v.x * sin - v.z * cos,
      strafeSpeed: v.x * cos - v.z * sin,
      verticalSpeed: v.y,
      onGround: player.onGround,
      recalling: recall.state === 'recalling',
      recallProgress: recall.progress,
    });
  }

  renderer.render(scene, camera);
});
