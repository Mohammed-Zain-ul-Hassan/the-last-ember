import * as THREE from 'three';
import { CAMERA, COLORS, PLAYER, SHADOW_MOVE, SPELL } from './config';
import { SoundSynth } from './fx/SoundSynth';
import { BackgroundMusic } from './fx/BackgroundMusic';
import { VoiceLines } from './fx/VoiceLines';
import { ChronoFX } from './fx/ChronoFX';
import { Arena } from './world/Arena';
import { RecallSystem } from './player/RecallSystem';
import { PlayerController } from './player/PlayerController';
import { CharacterRig } from './player/CharacterRig';
import { SimpleOverlay } from './ui/SimpleOverlay';
import { MainMenu } from './ui/MainMenu';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsPanel, BASE_MOUSE_SENSITIVITY, runtimeControls, type GameSettings } from './ui/Settings';
import { GameHud } from './ui/GameHud';
import { AUTOTEST, TestHooks } from './debug/TestHooks';
import { Shadowballs } from './combat/Shadowballs';
import { SpellHands } from './combat/SpellHands';
import { Enemies } from './combat/Enemies';
import { WaveDirector } from './combat/WaveDirector';
import { FireWife } from './world/FireWife';
import { DamageNumbers } from './ui/DamageNumbers';
import { FormController } from './player/FormController';
import { FormHud } from './ui/FormHud';
import { OrbitCamera } from './player/OrbitCamera';

// --- Renderer / scene / camera ------------------------------------------------
const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.fog);
scene.fog = new THREE.Fog(COLORS.fog, 40, 140);

const camera = new THREE.PerspectiveCamera(
  CAMERA.baseFov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

// --- Systems --------------------------------------------------------------------
const arena = await Arena.create(scene, renderer);
/** Shared with Arena so story↔demo swaps stay in sync for spells / balls. */
const worldColliders = arena.colliders;
const enemies = new Enemies(scene);
const wife = new FireWife(scene, arena.spawns.wife);
const waves = new WaveDirector(enemies, wife, arena.spawns);
const recall = new RecallSystem();
const sound = new SoundSynth();
const music = new BackgroundMusic(sound);
const voice = new VoiceLines(sound);
voice.bindMusic(music);
const chrono = new ChronoFX(camera);
const player = new PlayerController(camera, renderer.domElement, arena.colliders);
PLAYER.spawn.copy(arena.spawns.player);
player.teleport(arena.spawns.player, PLAYER.spawnYaw, 0);
const character = new CharacterRig(scene, arena.colliders);
const balls = new Shadowballs(scene, worldColliders, enemies);
const spells = new SpellHands(balls, worldColliders, enemies, sound);
const damageNumbers = new DamageNumbers();
const forms = new FormController();
const formHud = new FormHud();
const orbit = new OrbitCamera(arena.colliders);
balls.warmup(renderer, scene, camera);

const testHooks = AUTOTEST
  ? new TestHooks({
      player,
      character,
      recall,
      arena,
      camera,
      sound,
      music,
      spells,
      forms,
      balls,
      dummies: enemies,
      damageNumbers,
      orbit,
    })
  : null;
const menuShell = document.getElementById('menu-shell')!;
if (AUTOTEST) menuShell.classList.add('hidden');

const overlay = new SimpleOverlay();
const gameHud = new GameHud();

function applySettings(s: GameSettings): void {
  runtimeControls.mouseSensitivity = BASE_MOUSE_SENSITIVITY * s.mouseSensitivity;
  sound.setMasterVolume(s.masterVolume);
  sound.setSfxVolume(s.sfxVolume);
  music.setMusicVolume(s.musicVolume);
}

/** True after the player has pressed Play at least once this session. */
let gameStarted = false;

function showMenuShell(): void {
  if (!AUTOTEST) menuShell.classList.remove('hidden');
}

function hideMenuShell(): void {
  menuShell.classList.add('hidden');
}

let settings!: SettingsPanel;
let mainMenu!: MainMenu;
let pauseMenu!: PauseMenu;

function startSession(mode: 'story' | 'demo'): void {
  gameStarted = true;
  hideAllMenuPanels();
  hideMenuShell();
  gameHud.show();
  gameHud.hideVictory();
  gameHud.hideWifeHp();
  gameHud.hideBossHp();
  arena.setMode(mode === 'demo' ? 'demo' : 'story');
  PLAYER.spawn.copy(arena.spawns.player);
  player.teleport(arena.spawns.player, PLAYER.spawnYaw, 0);
  if (mode === 'demo') {
    gameHud.setObjective('Demo — walk forward');
    waves.beginDemo();
  } else {
    gameHud.setObjective('Ascend');
    waves.begin();
  }
  sound.unlock();
  music.start();
  music.setIntensity(0);
  requestLock(renderer.domElement);
}

mainMenu = new MainMenu({
  onPlay: () => startSession('story'),
  onDemo: () => startSession('demo'),
  onSettings: () => {
    mainMenu.hide();
    settings.show('main');
    showMenuShell();
  },
});

pauseMenu = new PauseMenu({
  onResume: () => {
    hideAllMenuPanels();
    hideMenuShell();
    requestLock(renderer.domElement);
  },
  onSettings: () => {
    pauseMenu.hide();
    settings.show('pause');
    showMenuShell();
  },
  onMainMenu: () => {
    gameStarted = false;
    waves.reset();
    arena.setMode('story');
    music.setIntensity(0);
    gameHud.hideVictory();
    gameHud.hideWifeHp();
    gameHud.hideBossHp();
    hideAllMenuPanels();
    mainMenu.show();
    showMenuShell();
  },
});

settings = new SettingsPanel({
  onChange: applySettings,
  onBack: (returnTo) => {
    if (returnTo === 'pause') {
      pauseMenu.show();
      showMenuShell();
    } else {
      mainMenu.show();
      showMenuShell();
    }
  },
});

function hideAllMenuPanels(): void {
  mainMenu.hide();
  pauseMenu.hide();
  settings.hide();
}

if (!AUTOTEST) {
  mainMenu.show();
  pauseMenu.hide();
  settings.hide();
  showMenuShell();
} else {
  hideAllMenuPanels();
  hideMenuShell();
  gameHud.show();
}

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
player.onCameraToggle = () => {
  if (!player.enabled) return;
  const mode = orbit.toggle();
  character.setCameraMode(mode);
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
  voice.play(to, 'swap');
};
// Spells: LMB = left hand, RMB = right hand (shadow form only).
player.onHandPress = (hand) => {
  if (player.enabled && forms.form === 'shadow' && !forms.transitioning) spells.press(hand);
};
player.onHandRelease = (hand) => spells.release(hand);
spells.onRefused = () => formHud.flashMagicka();
spells.onCast = (dual) => voice.play('shadow', dual ? 'dual' : 'throw');

balls.onImpact = (e) => {
  sound.impact(e.power, e.point.distanceTo(camera.position));
  if (e.dummy) {
    sound.dummyHit();
    damageNumbers.show(e.point, e.damage, e.power > 0.5 ? 'charged' : 'hit');
  } else if (wife.mode === 'boss' && e.point.distanceTo(wife.root.position) < 2.8) {
    wife.damageBoss(e.damage);
    sound.dummyHit();
    damageNumbers.show(e.point, e.damage, e.power > 0.5 ? 'charged' : 'hit');
    gameHud.setBossHp(wife.hp, wife.maxHp);
  }
  for (const s of e.splash) {
    damageNumbers.show(s.dummy.position.clone().setY(1.4), s.amount, 'splash');
  }
};

enemies.onContact = (dmg, target) => {
  if (target === 'wife') {
    wife.hurt(dmg);
    gameHud.setWifeHp(wife.hp, wife.maxHp);
    sound.meleeHit(4);
  } else {
    sound.meleeHit(player.feet.distanceTo(camera.position) || 1.2);
  }
};

wife.onDefeated = () => {
  gameHud.hideBossHp();
  gameHud.showVictory();
  music.setIntensity(0);
};

wife.onBossAttack = (kind, origin) => {
  if (kind === 'burst' || kind === 'slam') {
    const dist = player.feet.distanceTo(origin);
    if (dist < (kind === 'slam' ? 4.5 : 3.2)) {
      // Soft ember thump — not a full shadowball boom.
      sound.meleeHit(dist);
    }
  } else if (kind === 'bolt') {
    sound.meleeHit(player.feet.distanceTo(origin));
  }
};

waves.onObjective = (text) => gameHud.setObjective(text);
waves.onIntensity = (n) => music.setIntensity(n);
waves.onPhase = (phase) => {
  if (phase === 'defense') {
    gameHud.hideBossHp();
    gameHud.setWifeHp(wife.hp, wife.maxHp);
  } else if (phase === 'boss') {
    gameHud.hideWifeHp();
    gameHud.setBossHp(wife.hp, wife.maxHp);
  } else if (phase === 'win') {
    gameHud.hideWifeHp();
    gameHud.hideBossHp();
    gameHud.showVictory();
  } else {
    gameHud.hideWifeHp();
    gameHud.hideBossHp();
  }
};

if (AUTOTEST) {
  waves.begin();
  music.setIntensity(0);
}

recall.onStart = () => {
  sound.recallStart();
  voice.play(forms.form, 'recall');
};
recall.onLand = (pose) => {
  player.teleport(pose.position, pose.yaw, pose.pitch);
  player.enabled = true;
  sound.recallLand();
};
recall.onReady = () => sound.cooldownReady();

document.addEventListener('pointerlockchange', () => {
  if (player.isLocked()) {
    hideAllMenuPanels();
    hideMenuShell();
    return;
  }
  spells.cancel();
  if (AUTOTEST) return;
  // Settings open: keep the panel; don't swap to pause underneath.
  if (settings.visible) {
    showMenuShell();
    return;
  }
  if (gameStarted) {
    mainMenu.hide();
    settings.hide();
    pauseMenu.show();
    showMenuShell();
  } else {
    pauseMenu.hide();
    settings.hide();
    mainMenu.show();
    showMenuShell();
  }
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
  orbit.setAspect(w / h);
  renderer.setSize(w, h);
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

  player.setCameraMode(orbit.mode);
  player.aiming = forms.form === 'shadow' && spells.pose.hands.some((h) => h.state !== 'idle');
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
  const viewCam = orbit.update(player, camera, dt);
  // Sense of speed: the runner's view widens as sprint momentum builds (Skyrim's FOV stays fixed).
  const fast =
    player.profile === 'runner' && orbit.mode === 'fp'
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
      viewEye: viewCam.position,
      cameraMode: orbit.mode,
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

  // Spells leave from the palms as posed this frame, towards whatever is under the crosshair
  // of the view camera (FP eye, or the orbit camera in TP).
  if (player.isLocked()) {
    if (orbit.mode === 'tp') {
      orbit.getForward(forward);
    } else {
      const cp = Math.cos(player.pitch);
      forward.set(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
    }
    spells.lateUpdate(character.spellHands, viewCam.position, forward, player.velocity);
    balls.update(dt);
  }
  const wifeTarget = waves.phase === 'defense' || waves.phase === 'boss' ? wife.root.position : null;
  enemies.update(dt, viewCam, player.feet, wifeTarget, waves.phase);
  wife.update(dt, player.feet);
  if (gameStarted || AUTOTEST) {
    waves.update(dt, player.feet);
    if (waves.phase === 'demo') {
      const line = arena.demoObjective(player.feet);
      if (line) gameHud.setObjective(line);
    }
    if (waves.phase === 'defense') gameHud.setWifeHp(wife.hp, wife.maxHp);
    if (waves.phase === 'boss') gameHud.setBossHp(wife.hp, wife.maxHp);
  }
  damageNumbers.update(dt, viewCam);

  renderer.render(scene, viewCam);
  testHooks?.update(viewCam);
});
