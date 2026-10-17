import * as THREE from 'three';

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  eyeHeight: 1.65,
  walkSpeed: 6.0,
  slowWalkSpeed: 2.2,
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

  /** Sprint starts at runSpeed and builds towards topSpeed while you keep running forward. */
  runSpeed: 7.5,
  topSpeed: 10.5,
  /** m/s gained per second of uninterrupted sprinting. */
  momentumGain: 1.6,
  /** m/s lost per second when you stop sprinting, and when turning harder than momentumTurnAngle. */
  momentumDecay: 5,
  momentumTurnDecay: 7,
  momentumTurnAngle: THREE.MathUtils.degToRad(45),
  /** Fraction of momentum kept after running into a wall. */
  momentumWallKeep: 0.25,

  /** Crouch / slide capsule. */
  crouchHeight: 0.9,
  crouchSpeed: 2.8,
  /** Height (m/s) the capsule shrinks / grows at. */
  heightRate: 7,
  /** A crouch press this long before landing still starts a slide. */
  slideBuffer: 0.15,
  slideMinSpeed: 5.5,
  slideBoost: 1.2,
  /** Deceleration (m/s²) while sliding, and the speed at which the slide ends. */
  slideFriction: 3.2,
  slideEndSpeed: 3.6,
  slideMaxTime: 1.1,
  /** How fast (rad/s) the slide can be steered towards the move keys. */
  slideTurnRate: 0.9,
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
  /** Extra FOV (deg) at top sprint speed. */
  speedFov: 8,
  near: 0.03,
  far: 400,
  /** Third-person free orbit (T toggles): the mouse orbits a pivot above the feet. */
  thirdPerson: {
    /** Orbit radius (m) when nothing is in the way. */
    dist: 3.4,
    /** Pivot height above the feet and its offset to the camera's right (over the shoulder). */
    pivotY: 1.45,
    shoulder: 0.35,
    minPitch: THREE.MathUtils.degToRad(-70),
    maxPitch: THREE.MathUtils.degToRad(60),
    /** Orbit pitch when entering TP (slightly looking down). */
    enterPitch: -0.15,
    /** Collision: stop this far before a hit, never closer than minDist; zoom back out at this rate (1/s). Keep minDist below collisionPad-scale gaps or it pushes the camera into walls. */
    collisionPad: 0.2,
    minDist: 0.08,
    zoomOutRate: 5,
    /** Body turn rate (rad/s) towards the move / aim direction. */
    turnRate: 10,
    fov: 55,
    near: 0.08,
  },
} as const;

export type CameraMode = 'fp' | 'tp';

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
  /**
   * The runner "vessel" body: purple plate over black undersuit — shadow knight armour.
   */
  vessel: {
    /** Material slot name in the GLB -> colour. */
    colors: { M_Main: 0x6b2fa0, M_Joints: 0x0a0a0c } as Record<string, number>,
    roughness: 0.32,
    metalness: 0.72,
  },
  /** Quaternius Universal Animation Library mannequin + clips; built by scripts/build-character.mjs. */
  modelUrl: '/models/character/shadow.glb',
  /** Yaw (rad) that turns the model to face -Z like the camera. */
  modelYaw: Math.PI,
  bones: {
    hips: 'pelvis',
    spine: ['spine_01', 'spine_02', 'spine_03'],
    chest: 'spine_03',
    head: 'Head',
    /** Triangles skinned mostly to these are cut from the visible mesh (the shadow proxy keeps them). */
    hidden: ['Head', 'neck_01'],
    arms: {
      left: ['upperarm_l', 'lowerarm_l', 'hand_l'],
      right: ['upperarm_r', 'lowerarm_r', 'hand_r'],
    },
    /** Ankles, used to detect footfalls for the step sounds. */
    feet: ['foot_l', 'foot_r'],
  },
  clips: {
    idle: 'Idle_Loop',
    walk: 'Walk_Loop',
    jog: 'Jog_Fwd_Loop',
    sprint: 'Sprint_Loop',
    crouchIdle: 'Crouch_Idle_Loop',
    crouchWalk: 'Crouch_Fwd_Loop',
    slideStart: 'Slide_Start',
    slideLoop: 'Slide_Loop',
    slideExit: 'Slide_Exit',
    jumpLoop: 'Jump_Loop',
    land: 'Jump_Land',
  },

  /** Distance (m) covered by one full cycle of each locomotion clip; tune until feet stop sliding. */
  stride: { walk: 2.0, jog: 3.6, sprint: 4.6, crouchWalk: 1.6 },
  /** Ground speeds (m/s) at which each locomotion clip is fully weighted; blends linearly between. */
  speedPoints: { idle: 0, walk: 1.8, jog: 5.5, sprint: 8.0 },
  /** Normalised Jump_Loop time held while airborne. */
  airPhase: 0.3,
  /** Landing overlay: start time (s) into Jump_Land, playback rate, and fall speed for full weight. */
  landStart: 0.35,
  landRate: 1.6,
  landFullSpeed: 14,
  /** A footstep fires when an ankle drops below contact height (m, above the model root); re-arms above rearm. */
  footContact: 0.135,
  footRearm: 0.19,
  /** Crouch-walking barely lifts the feet, so the thresholds drop at full crouch. */
  crouchFootContact: 0.112,
  crouchFootRearm: 0.15,
  /** Cycles per second the sprint clip plays backwards during a Recall. */
  recallCyclesPerSec: 2.6,

  /** How far behind the eye (m) the hidden head sits horizontally. */
  cameraBackOffset: 0.08,
  /**
   * How far (m) the chest's front surface must stay behind the eye plane. Negative lets it lean
   * ahead: it sits ~0.4 m below the eye, so only an extreme lean could bring it near the lens.
   */
  chestClearance: -0.1,
  /** Approximate chest half-depth (m) in front of the chest bone. */
  chestRadius: 0.14,
  /** Head sits this far (m) below the eye when the vertical head-lock (crouch/slide) is active. */
  headBelowEye: 0.08,
  /** Fraction of the camera pitch handed to the spine bones (split across three). */
  spinePitchShare: 0.55,

  /** Blend between the clip's hands (0) and the camera-space IK targets (1). */
  armIkWeight: 0.75,
  /** Hand targets in eye space (m): sideways, down, forward. */
  handSide: 0.22,
  handDown: 0.22,
  handForward: 0.42,
  /** Run pump: forward/back and up/down travel (m), opposite phase per hand. */
  handPumpForward: 0.14,
  handPumpUp: 0.12,
  handAirUp: 0.2,
  handAirOut: 0.14,
  /** Recall casting pose (eye space, m). */
  recallHandSide: 0.16,
  recallHandUp: -0.06,
  recallHandForward: 0.5,
  /** Elbow pole vector (eye space): how far the elbows bend out, down and back. */
  elbowOut: 0.5,
  elbowDown: 0.8,
  elbowBack: 0.4,
  /** Hands stop this far (m) in front of a wall, so the palms brace on it. */
  palmOffset: 0.06,
  /** Skin-weight share on hidden bones above which a vertex is removed from the visible mesh. */
  hiddenWeightThreshold: 0.5,

  headBob: 0.03,
  headRoll: 0.012,
  slideRoll: 0.05,
  jumpKick: 0.6,
  landKick: 0.12,
} as const;

/** The ink-and-smoke look of the shadow essence (particle body + trails). */
export const SHADOW = {
  baseColor: 0x030407,
  /** Cool mist at the silhouette (no warm tones on the body). */
  rimColor: 0x8a9ab3,
  recallRimColor: 0x00f0ff,
  rimStrength: 0.5,
  recallRimStrength: 0.9,
  /** Share of the silhouette edge eaten by noise (0..1). */
  erosion: 0.55,
  /** Erosion multiplier right in front of the eye (hands fray more). */
  nearErosionBoost: 2.4,
  /** World-space noise frequency and drift speed of the ink edge. */
  noiseScale: 5.5,
  noiseSpeed: 0.9,
  /** The body dissolves between these distances (m) from the eye. */
  nearFadeStart: 0.14,
  nearFadeEnd: 0.34,

  /** Dense particle pool for the humanoid shadow cloud. */
  wispCount: 1400,
  /** Fallback rates when CharacterRig drains wisps with empty sources. */
  wispRate: 20,
  wispRatePerSpeed: 10,
  wispLife: [0.55, 1.25] as const,
  wispSize: [0.1, 0.48] as const,
  /** Near-void ash — denser, blacker silhouette. */
  wispColor: 0x06070b,
  /** Rare cold glints in the body (eyes / malice), not ball energy. */
  emberColor: 0x3a2a66,
  emberChance: 0.02,
  /** Particles fade out between these distances (m) from the eye. */
  wispNearStart: 0.16,
  wispNearEnd: 0.42,
} as const;

/** Shadowball: tap to throw, hold to charge. Values lerp from quick (charge 0) to full (charge 1). */
/** Shadowball projectiles: pools, looks and impacts (gameplay values are in SPELL). */
export const WEAPON = {
  /** Share of the player's velocity a ball inherits. */
  inherit: 0.35,
  lifetime: 3,
  maxRange: 80,
  poolSize: 12,
  lightCount: 4,
  /** Hard void core — reads as a sphere, not body smoke. */
  coreColor: 0x020208,
  /** Inner seam / energy. */
  flameColor: 0x5b1fff,
  /** Bright corona and trail sparks (distinct from body ash). */
  lipColor: 0xc45bff,
  lightColor: 0x9b4dff,
  /** Trail smoke (separate from SHADOW.wispColor). */
  trailSmoke: 0x1a0a2e,
  decalCount: 16,
  decalLife: 8,
} as const;

/** Q switches between the runner vessel and the shadow entity. */
export const FORMS = {
  transitionTime: 0.6,
} as const;

/**
 * Shadow form moves like Skyrim, only heavier: the wraith glides slowly, takes a moment to get
 * going, sprints on stamina and sneaks. No slide or momentum.
 */
export const SHADOW_MOVE = {
  walkSpeed: 1.3,
  runSpeed: 2.9,
  sprintSpeed: 4.6,
  sneakSpeed: 1.1,
  groundAccel: 9,
  airAccel: 3,
  jumpVelocity: 6.0,
  staminaMax: 100,
  /** Stamina per second while sprinting, regenerated per second after the delay. */
  sprintDrain: 20,
  staminaRegen: 15,
  staminaRegenDelay: 1.0,
} as const;

/** Skyrim-style shadowball: hold a hand's button to charge, release when charged to cast. */
export const SPELL = {
  chargeTime: 0.6,
  /** A second hand pressed within this window (s) of the first merges into a dual-cast. */
  dualWindow: 0.2,
  cost: 25,
  dualCostMul: 2.8,
  dualDamageMul: 2.2,
  dualSplashMul: 2,
  magickaMax: 100,
  magickaRegen: 12,
  magickaRegenDelay: 1.5,
  damage: 30,
  splash: 1.0,
  speed: 22,
  gravity: 0.8,
  radius: 0.16,
  dualRadius: 0.26,
  /** Orb sizes in the palm: idle, fully charged, and dual (between the hands). */
  orbIdle: 0.022,
  orbCharged: 0.036,
  orbDual: 0.065,
  /** Casting stance (eye space, m: right, up, forward) for the right hand; the left mirrors it. */
  stanceHand: [0.24, -0.22, 0.42] as const,
  /** Charging pulls the hand back/up; release punches it forward; dual brings both to centre. */
  chargeHand: [0.21, -0.17, 0.4] as const,
  releaseHand: [0.14, -0.12, 0.62] as const,
  dualHand: [0.075, -0.22, 0.48] as const,
  sprintHand: [0.26, -0.48, 0.3] as const,
  releaseTime: 0.12,
  recoverTime: 0.35,
} as const;

export const DUMMY = {
  /** Footprint centres (x, z) and facing yaw (rad) of the training dummies. */
  spots: [
    [-5, 12, 0],
    [7, 14, 0],
    [-9, 1, Math.PI / 4],
    [12, 3, -Math.PI / 4],
    [-8, -4, 0],
  ] as const,
  health: 100,
  resetDelay: 2.5,
  height: 1.8,
  /** Hit capsule: radius (m) from the post's axis between these heights. */
  hitRadius: 0.32,
  hitBottom: 0.55,
  hitTop: 1.85,
  bodyColor: 0xd8cfbd,
  ringColor: 0xff7a2a,
} as const;

/** Shadow form: dedicated wraith GLB + accent wisps + casting palm anchors. */
export const WRAITH = {
  modelUrl: '/models/character/wraith.glb',
  /** Yaw (rad) that turns the model to face -Z like the camera. */
  modelYaw: Math.PI,
  /** Material slot -> tint (near-black ink + cool violet accent). */
  colors: { W_Body: 0x05050c, W_Accent: 0x4a2a78 } as Record<string, number>,
  bones: {
    hips: 'pelvis',
    head: 'Head',
    chest: 'spine_03',
    /** Trimmed from the FP mesh (everything but forearms + claws); TP keeps full geo. */
    hidden: [
      'Head', 'neck_01', 'spine_01', 'spine_02', 'spine_03', 'pelvis',
      'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r',
      'scythe', 'hem_f', 'hem_b', 'hem_l', 'hem_r',
    ],
    arms: {
      left: ['upperarm_l', 'lowerarm_l', 'hand_l'],
      right: ['upperarm_r', 'lowerarm_r', 'hand_r'],
    },
  },
  clips: { idle: 'Float_Loop' },
  /** Legacy body layer (kept for arena shadow-camera bookkeeping). */
  bodyLayer: 1,
  /** Hover height (m) of the hem above the floor. Float_Loop carries the body bob. */
  hover: 0.1,
  /** Camera bob (m) phase-locked to Float_Loop. */
  bobAmp: 0.035,
  /** Arm IK weight: idle in FP (holds forearms in frame), and blend-in/out rate (1/s). */
  fpIdleIk: 1,
  /** FP idle wrist target in camera space (side-mirrored x, up, forward). */
  fpIdleHand: [0.25, -0.2, 0.55] as const,
  ikBlendRate: 9,
  /** FP head-lock: shoulders just behind the lens (FP mesh is forearms + claws only). */
  cameraBackOffset: 0.14,
  chestClearance: 0,
  chestRadius: 0.22,
  /** Shoulders relative to the feet (m): sideways, up, forward. */
  shoulder: [0.2, 1.36, 0.02] as const,
  upperArm: 0.34,
  foreArm: 0.36,
  /** Kept for stance curl targets. */
  claw: 0.12,
  relaxedCurl: 0.35,
  eyeColor: 0x6a5cff,
  /** Accent wisps per second at rest and per m/s of glide (model carries the silhouette). */
  hemSmoke: 36,
  hemSmokePerSpeed: 18,
} as const;
