import * as THREE from 'three';

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  eyeHeight: 1.65,
  walkSpeed: 6.0,
  slowWalkSpeed: 2.2,
  sprintMultiplier: 1.4,
  groundAccel: 60,
  airAccel: 14,
  groundFriction: 12,
  gravity: -24,
  jumpVelocity: 8.5,
  stepUp: 0.4,
  mouseSensitivity: 0.0022,
  maxPitch: THREE.MathUtils.degToRad(85),
  maxFrameDt: 1 / 30,
  maxSubstep: 1 / 120,
  respawnY: -15,
  spawn: new THREE.Vector3(0, 0, 18),
  spawnYaw: 0,
} as const;

export const RECALL = {
  historyMs: 3000,
  sampleMs: 20,
  durationSec: 0.8,
  cooldownSec: 3.0,
  minSpacing: 0.05,
  bufferCapacity: 256,
} as const;

export const CAMERA = {
  baseFov: 75,
  punchFov: 92,
  near: 0.03,
  far: 400,
} as const;

export const COLORS = {
  cyan: 0x00f0ff,
  amber: 0xffa020,
  floor: 0x0a1220,
  panel: 0x1a2433,
  panelDark: 0x111824,
  fog: 0x060b16,
} as const;

export const TRAIL = {
  heightOffset: 1.0,
  halfWidth: 0.06,
  particleEvery: 4,
  particleSize: 0.22,
} as const;

export const CHARACTER = {
  modelUrl: '/models/character/soldier.glb',
  /** GLTFLoader strips ':' from names, so 'mixamorig:Hips' is 'mixamorigHips'. */
  bonePrefix: 'mixamorig',
  glowColor: 0x00f0ff,
  recallGlow: 0.12,

  /** Distance (m) covered by one full animation cycle; tune until feet stop sliding. */
  walkStride: 1.5,
  runStride: 3.6,
  /** Speeds (m/s) between which the walk clip fades into the run clip. */
  walkToRunStart: 2.4,
  walkToRunEnd: 4.4,
  /** Normalised run-cycle time used as the held pose while airborne. */
  airPhase: 0.12,
  /** Cycles per second the run clip plays backwards during a Recall. */
  recallCyclesPerSec: 2.6,

  /** How far behind the camera (m) the hidden head sits; keeps the chest out of the lens. */
  cameraBackOffset: 0.12,
  /** Fraction of the camera pitch handed to the spine bones (split across three). */
  spinePitchShare: 0.6,
  /** Hand targets in eye space (m): sideways, down, forward. The hands are solved here with IK. */
  handSide: 0.2,
  handDown: 0.3,
  handForward: 0.55,
  /** Run pump: forward/back and up/down travel (m), opposite phase per hand. */
  handPumpForward: 0.1,
  handPumpUp: 0.06,
  handAirUp: 0.2,
  handAirOut: 0.14,
  /** Recall casting pose (eye space, m). */
  recallHandSide: 0.16,
  recallHandUp: -0.06,
  recallHandForward: 0.55,
  /** Elbow pole vector (eye space): how far the elbows bend out, down and back. */
  elbowOut: 0.5,
  elbowDown: 0.8,
  elbowBack: 0.4,
  /** Skin-weight share on head bones above which a vertex is removed from the visible mesh. */
  headWeightThreshold: 0.5,

  headBob: 0.03,
  headRoll: 0.012,
  jumpKick: 0.6,
  landKick: 0.12,
} as const;
