import * as THREE from 'three';
import { CFG, HERO, type MoveSpec } from '../config';
import type { Knight, KnightState } from '../sim/world';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AuraLayer, AuraSource } from './auraEffect';
import { DEPTH, PULL_GLSL, pullForward } from './depth';
import { Flame } from './flame';
import { emitCount, type Particles } from './particles';
import { rimify } from './rim';
import { taperTube } from './shapes';
import { SHADOW, shadowify } from './shadowBody';
import { SHADOW_FRAME } from './stage';
import { bladePoint, buildSword, SWORD, SWORD_PALETTES, type SwordParts } from './sword';
import { glowTexture, tatterTexture } from './textures';

// The shadow knight: living shadow in the shape of a knight. Built from primitives facing +x; the sim's yaw turns
// the root (rotation.y = -yaw), so the sword arm (local +z) is his right. Every pose goes through springs with
// per-joint gains: the core leads and the head, arms and blade follow a beat later, so motion has follow-through and
// overlap instead of snapping between keys. He banks into curves, shuffles his feet when he turns on the spot, steps
// back with his guard up, breathes, and fidgets when he has stood still a while.
DEPTH.uDepthPull.value = HERO.depthPull;
// every material of his is pulled forward in depth (src/render/depth.ts) so the props he touches never cut into him
const BODY = pullForward(shadowify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.42, 'kbody'));
const DARK = pullForward(shadowify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.55, 'kdark'));
const STEEL = pullForward(rimify(new THREE.MeshStandardMaterial({ color: 0x1d1c26, roughness: 0.18, metalness: 0.95 }), 1.3, 'steel'));
const EYE = pullForward(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 4.8), toneMapped: false, transparent: true }));
EYE.userData.alwaysClear = true;
const FADERS: THREE.Material[] = [STEEL, EYE]; // materials the dawn dissolve fades (the sword adds its own)

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

function limb(len: number, r0: number, r1 = r0 * 0.8, mat: THREE.Material = BODY): { pivot: THREE.Group; end: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.add(mesh(new THREE.CylinderGeometry(r1, r0, len, 18, 1), mat, 0, -len / 2, 0));
  // joint balls hide inside the limb's own shadow: not worth six cube-face redraws each
  pivot.add(mesh(new THREE.SphereGeometry(r0 * 1.05, 18, 12), mat, 0, 0, 0, false));
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};
/** 0 -> 1 -> 0 over len seconds, eased at both ends. */
const env = (t: number, len: number, att = 0.25, rel = 0.35) => smooth(t / (len * att)) * (1 - smooth((t - len * (1 - rel)) / (len * rel)));

// ---------------------------------------------------------------- cuts
// The sword arm is a chain in one plane: the upper arm swings from hanging (0) forward (PI/2) and up over him (PI),
// and `tilt` turns that plane about his forward axis: 0 is a vertical cut, positive tips it so low points to his
// left and high to his right, negative the other way, ~1.25 is a flat sweep. The blade points along
// arm + elbow + wrist.
//
// Every cut is authored like an action game's: a chambered wind-up (elbow folded, wrist cocked so the blade trails
// the hand), a contact phase where the body unwinds first, the elbow extends and the wrist whips the blade through,
// and a follow-through that carries on past the target. A step goes with every cut and the weight drops into it.
// The combo is one flowing chain: each cut ends where the next begins.
interface Cut {
  tilt: number; // the cut's plane
  a0: number; // the arm at the top of the wind-up (the chamber)
  a1: number; // the arm at the end of contact
  over: number; // follow-through: how far the arm carries on past a1
  elbow0: number; // the chambered elbow; it straightens through contact
  fold: number; // the elbow folds again as the blade wraps round him
  wrist0: number; // cocked: the blade trails the hand...
  wrist1: number; // ...then snaps past it at the end of contact
  twist0: number; // the chest coils away...
  twist1: number; // ...and unwinds a beat before the arm (hips, chest, arm, blade)
  lean0: number;
  lean1: number;
  crouch: number; // loading the legs in the wind-up
  drop: number; // the weight dropping into the blade at contact
  step: 0 | 1; // the foot that steps in: 0 right, 1 left
  stride: number;
  sy0: number; // stretch at the top of a big wind-up...
  sy1: number; // ...squash at the strike
  off0: number; // the off arm reaches out in the wind-up...
  off1: number; // ...and pulls back hard at contact (torque)
  aim?: number; // a thrust: the blade holds this angle while the arm drives out
}

const CUT = (c: Partial<Cut> & Pick<Cut, 'tilt' | 'a0' | 'a1'>): Cut => ({
  over: 0.35, elbow0: 0.6, fold: 0.45, wrist0: 0.55, wrist1: -0.2, twist0: -0.35, twist1: 0.4, lean0: 0.05, lean1: 0.3,
  crouch: 0.04, drop: 0.08, step: 0, stride: 0.6, sy0: 1, sy1: 1, off0: 0.7, off1: -0.45, ...c,
});

/** The three-cut combo (and the aerial chain). */
const COMBO: Cut[] = [
  // I. the draw-cut: rising from his low guard, right hip to over his left shoulder
  CUT({ tilt: -0.6, a0: 0.15, a1: 2.85, over: 0.4, elbow0: 0.35, fold: 0.3, wrist0: -0.55, wrist1: 0.25, twist0: -0.35, twist1: 0.45, lean0: 0.2, lean1: -0.04, drop: -0.03, step: 0, stride: 0.55, off0: 0.6, off1: -0.4 }),
  // II. the backhand: back down the same line, left shoulder to right hip, stepping through with the other foot
  CUT({ tilt: -0.6, a0: 3.3, a1: 0.3, over: 0.35, elbow0: 0.9, fold: 0.4, wrist0: 0.6, wrist1: -0.25, twist0: 0.5, twist1: -0.4, lean0: -0.05, lean1: 0.32, drop: 0.09, step: 1, stride: 0.65, off0: -0.3, off1: 0.5 }),
  // III. the finisher: the blade circles up behind him and comes down through the centre line with all his weight
  CUT({ tilt: 0.1, a0: 4.1, a1: 0.15, over: 0.3, elbow0: 1.0, fold: 0.35, wrist0: 0.7, wrist1: -0.3, twist0: -0.3, twist1: 0.25, lean0: -0.28, lean1: 0.5, crouch: 0.02, drop: 0.22, step: 0, stride: 0.85, sy0: 1.05, sy1: 0.93, off0: 1.1, off1: -0.65 }),
];
/** Heavy: the cleave. Coiled hard to the right, it sweeps flat round two thirds of a circle. */
const CLEAVE = CUT({ tilt: 1.2, a0: 3.75, a1: 0.1, over: 0.6, elbow0: 1.0, fold: 0.5, wrist0: 0.8, wrist1: -0.3, twist0: -0.85, twist1: 0.9, lean0: 0, lean1: 0.35, crouch: 0.12, drop: 0.22, step: 1, stride: 0.85, sy0: 1.02, sy1: 0.95, off0: 0.95, off1: -1.0 });
/** The charged strike: released from high behind him, straight down into the ground. */
const REND = CUT({ tilt: 0.1, a0: 3.9, a1: -0.1, over: 0.25, elbow0: 0.15, fold: 0.3, wrist0: 0.2, wrist1: -0.3, twist0: -0.5, twist1: 0.6, lean0: -0.2, lean1: 0.62, crouch: 0.05, drop: 0.3, step: 0, stride: 1.1, sy0: 1.04, sy1: 0.9, off0: 1.2, off1: -0.8 });
/** Heavy in the air: hang with the blade raised, dive, slam. */
const PLUNGE = CUT({ tilt: 0.08, a0: 4.4, a1: 0.05, over: 0, elbow0: 0.3, wrist0: 0.3, wrist1: -0.2, twist0: -0.2, twist1: 0.3, lean0: -0.15, lean1: 0.55 });
/** Attack while running: a lunging thrust, the off arm flung back for balance. */
const LUNGE = CUT({ tilt: 1.3, a0: 2.35, a1: 1.45, over: 0.1, elbow0: 1.9, fold: 0.15, twist0: -0.5, twist1: 0.35, lean0: 0.2, lean1: 0.6, drop: 0.12, step: 0, stride: 1.1, off0: 0.3, off1: -0.95, aim: 1.5 });
/** Attack out of a dash: the whole body behind the point. */
const PIERCE = CUT({ tilt: 1.35, a0: 2.3, a1: 1.5, over: 0.08, elbow0: 1.8, fold: 0.1, twist0: -0.45, twist1: 0.3, lean0: 0.45, lean1: 0.8, drop: 0.16, step: 0, stride: 1.2, off0: -0.6, off1: -1.1, aim: 1.52 });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Contact timing: the blade is already moving fast on the first frame and still accelerating into the middle. */
const whip = (e: number) => 0.35 * smooth(e) + 0.65 * (1 - Math.pow(1 - Math.max(0, Math.min(1, e)), 3));

const TRAIL_VERT = /* glsl */ `
  uniform float uDepthPull;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    ${PULL_GLSL}
  }`;
const TRAIL_FRAG = /* glsl */ `
  uniform float uHead; uniform float uTail; uniform float uOpacity; uniform vec3 uColor;
  varying vec2 vP;
  void main() {
    float a = atan(vP.y, vP.x);
    float s = (a - uTail) / (uHead - uTail);
    if (s < 0.0 || s > 1.0) discard;
    float r = (length(vP) - 0.8) / 1.75;
    float edge = smoothstep(0.3, 0.85, r) * smoothstep(1.0, 0.9, r);
    float core = smoothstep(0.84, 0.97, r) * smoothstep(1.0, 0.97, r);
    float alpha = (pow(s, 3.0) * edge * 0.5 + core * pow(s, 5.0) * 1.4) * uOpacity;
    gl_FragColor = vec4(uColor * alpha, 1.0);
  }`;

// ---------------------------------------------------------------- pose springs
const KEYS = ['lean', 'bob', 'twist', 'arm', 'armTilt', 'elbow', 'swordRel', 'swordRoll', 'head', 'headYaw', 'th0', 'th1', 'kn0', 'kn1', 'offArm', 'offElbow', 'sy', 'breath'] as const;
type Key = (typeof KEYS)[number];
type Pose = Record<Key, number>;
const REST: Pose = {
  lean: 0.06, bob: 0, twist: 0, arm: 0.25, armTilt: 0.08, elbow: 0.45, swordRel: 0.45, swordRoll: 0, head: -0.05, headYaw: 0,
  th0: 0.15, th1: -0.15, kn0: 0.1, kn1: 0.12, offArm: 0.2, offElbow: 0.5, sy: 1, breath: 0,
};
/** Per-joint spring gains: legs are crisp (no foot slide), the core leads, the head, off arm and blade trail behind. */
const GAIN: Pose = {
  lean: 1, bob: 1.15, twist: 0.85, arm: 0.75, armTilt: 0.8, elbow: 0.6, swordRel: 0.48, swordRoll: 0.45, head: 0.5, headYaw: 0.35,
  th0: 1.3, th1: 1.3, kn0: 1.3, kn1: 1.3, offArm: 0.55, offElbow: 0.5, sy: 1.6, breath: 0.6,
};
/** During a cut the sword arm follows it exactly (see target()). */
const SWING_KEYS = new Set<Key>(['arm', 'armTilt', 'elbow', 'swordRel', 'swordRoll']);

// Arm angles: arm swings the upper arm forward from hanging, elbow flexes the forearm forward (never backward, an
// elbow does not bend that way), swordRel turns the blade in the fist. The blade points along arm + elbow + swordRel.
/** Standing still: arm relaxed, fist just in front of the hip, the blade lowered with its point near the ground. */
const AT_REST: Partial<Pose> = {
  lean: 0.04, bob: -0.02, arm: 0.05, elbow: 0.55, swordRel: 0.42, armTilt: 0.1, offArm: 0.1, offElbow: 0.35, head: 0.02,
  th0: 0.12, th1: -0.14, kn0: 0.12, kn1: 0.18, twist: 0,
};
/** On guard after a fight: knees bent, weight forward, fist at his chest, blade raised forward, off hand up. */
const ON_GUARD: Partial<Pose> = {
  lean: 0.17, bob: -0.12, arm: 0.55, elbow: 0.95, swordRel: 0.75, armTilt: 0.12, offArm: 0.8, offElbow: 1.05, head: -0.12,
  th0: 0.42, th1: -0.34, kn0: 0.52, kn1: 0.44, twist: -0.12, swordRoll: 0,
};

type Fidget = 'look' | 'twirl' | 'roll' | 'flick';
const FIDGET_LEN: Record<Fidget, number> = { look: 2.6, twirl: 1.0, roll: 1.7, flick: 1.15 };

interface Leg {
  thigh: THREE.Group;
  knee: THREE.Group;
}

export type KnightPose = 'stand' | 'kneel';

/** Fade the whole knight (the dawn ending dissolves him into light). */
export function setKnightFade(a: number): void {
  SHADOW.uFade.value = a;
  for (const m of FADERS) {
    const tr = a < 0.999 || m.userData.alwaysClear === true;
    if (m.transparent !== tr) {
      m.transparent = tr;
      m.needsUpdate = true; // a different shader: three only switches when told
    }
    m.opacity = a;
  }
}

const layer = (inner: THREE.Color, outer: THREE.Color, L: { life: number; rise: number; spread: number; intensity: number }): AuraLayer => ({
  inner, outer, intensity: L.intensity, life: L.life, rise: L.rise, spread: L.spread,
});
const VIOLET_IN = new THREE.Color(1.1, 0.5, 3.1);
const VIOLET_OUT = new THREE.Color(0.16, 0.03, 0.5);
const HURT_IN = new THREE.Color(3.0, 0.38, 0.3);
const HURT_OUT = new THREE.Color(0.5, 0.03, 0.06);
const LIT_RIM = new THREE.Color(2.8, 1.15, 0.32); // the side of his outline that faces the fire

export class KnightView {
  readonly root = new THREE.Group();
  private spin = new THREE.Group(); // somersaults pivot about his hips
  private squash = new THREE.Group(); // squash & stretch around the feet
  private body = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private legs: Leg[] = [];
  private shoulder: THREE.Group;
  private elbow: THREE.Group;
  private sword: SwordParts;
  private offShoulder: THREE.Group;
  private offElbow: THREE.Group;
  private cape: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private capeBase: Float32Array;
  private trail: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
  private trailHead = 0;
  private trailTail = 0;
  private trailFade = 0;
  private lastSwing = -1;
  private cut: Cut = COMBO[0];
  private from = { arm: 0, elbow: 0, wrist: 0, tilt: 0 }; // where the arm was when this cut began
  private phase = 0;
  private capeVx = 0;
  private capeVy = 0;
  private eyes!: THREE.Mesh;
  private kneelK = 0;
  private cur: Pose = { ...REST };
  private vel: Pose = Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;
  private prevGround = true;
  private prevState: KnightState = 'idle';
  private prevSpeed = 0;
  private prevFv = 0;
  private prevAirJumps: number = CFG.knight.airJumps;
  private landT = 0;
  private landImpact = 0;
  private stretchT = 0;
  private brakeT = 0;
  private flipT = 1;
  private fallVy = 0;
  private dashGlow = 0;
  private swordFlare = 0;
  private hurtFlash = 0;
  private accel = 0;
  // turning: the drawn yaw chases the sim's the short way round; its rate banks him and shuffles his feet
  private turn = NaN;
  private yawVel = 0;
  private bank = 0;
  private shuffle = 0;
  private visY = NaN; // drawn height (eased on steps)
  private fv = 0; // speed along his facing (negative: stepping back)
  private sv = 0; // speed to his right
  // idle life
  private breath = 0;
  private combatT = 9;
  private guardK = 0;
  private idleT = 0;
  private fidget: Fidget | null = null;
  private fidgetT = 0;
  private nextFidget = 3;
  private lastFidget: Fidget | null = null;
  private parts: THREE.Mesh[] = [];
  pose: KnightPose = 'stand';
  readonly torch = new THREE.Group();
  readonly torchFlame: Flame;
  readonly torchLight: THREE.PointLight;
  private torchHalo: THREE.Sprite;
  private emberOrb: THREE.Sprite;
  torchOn = false;
  /** The blade's look (see SWORD_PALETTES); applied on the next setTorch. */
  swordPalette: keyof typeof SWORD_PALETTES = HERO.swordPalette;
  readonly trailColor = new THREE.Color(1.6, 1.3, 3.4);
  /** What the stage's aura wraps and how it burns; updated every frame. */
  readonly aura: AuraSource;
  private eyeWorld = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  /** 0..1: how lit the ground he stands on is, from the sim's light model (wall shadows included). Set each frame. */
  exposure = 0;
  private expo = 0;
  /** Where the fire that lights him is (the hearth's flame). Set each frame; in the torch phase his own torch. */
  readonly fireAt = new THREE.Vector3(0, 1.6, 0);
  private floorY = -Infinity;

  constructor() {
    this.root.add(this.spin);
    this.spin.position.y = 1.05;
    this.spin.add(this.squash);
    this.squash.position.y = -1.05;
    this.squash.add(this.body);
    for (const z of [0.15, -0.15]) {
      const thigh = limb(0.56, 0.13, 0.11);
      const shin = limb(0.54, 0.1, 0.13);
      thigh.pivot.position.set(0, 1.1, z);
      thigh.end.add(shin.pivot);
      shin.end.add(mesh(new RoundedBoxGeometry(0.34, 0.1, 0.17, 2, 0.035), BODY, 0.08, 0.03, 0, false));
      this.body.add(thigh.pivot);
      this.legs.push({ thigh: thigh.pivot, knee: shin.pivot });
    }
    this.chest.position.y = 1.12;
    this.body.add(this.chest);
    this.chest.add(mesh(new THREE.CylinderGeometry(0.25, 0.42, 0.46, 28, 1, true), DARK, 0, -0.06, 0));
    const torso = mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.82, 28, 3), BODY, 0, 0.45, 0);
    torso.scale.z = 0.68;
    this.chest.add(torso);
    for (const z of [0.33, -0.33]) {
      const p1 = mesh(new THREE.SphereGeometry(0.24, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), BODY, -0.03, 0.78, z);
      p1.scale.set(1.3, 1.0, 1.05);
      const p2 = mesh(new THREE.SphereGeometry(0.2, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), BODY, -0.05, 0.68, z * 1.08, false);
      p2.scale.set(1.25, 0.9, 1);
      const spike = mesh(new THREE.ConeGeometry(0.05, 0.3, 12), BODY, -0.08, 0.99, z, false);
      spike.rotation.z = 0.5;
      this.chest.add(p1, p2, spike);
    }
    this.head.position.set(0.03, 0.98, 0);
    this.chest.add(this.head);
    this.buildHelm();

    const upper = limb(0.44, 0.1, 0.085);
    const fore = limb(0.42, 0.09, 0.075);
    this.shoulder = upper.pivot;
    this.shoulder.position.set(0, 0.7, 0.4);
    this.shoulder.rotation.order = 'XYZ';
    upper.end.add(fore.pivot);
    this.elbow = fore.pivot;
    // a gauntleted fist closed around the grip, and the cuff at his wrist
    fore.end.add(mesh(new RoundedBoxGeometry(0.15, 0.13, 0.14, 2, 0.045), BODY, 0, 0, 0, false));
    fore.end.add(mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.09, 16), BODY, 0, 0.075, 0, false));
    this.sword = buildSword(STEEL, DARK);
    this.sword.gem.material.userData.alwaysClear = true;
    FADERS.push(this.sword.blade.material, this.sword.gem.material);
    fore.end.add(this.sword.group);
    // the blade's light hangs off the root, not the sword: the hurt blink hides his body (and the sword in his hand),
    // and a light that drops out of the scene changes the light count, which recompiles every lit material (a freeze).
    // updateSword() keeps it at the blade.
    this.root.add(this.sword.light);

    const offU = limb(0.44, 0.1, 0.085);
    const offF = limb(0.42, 0.09, 0.075);
    this.offShoulder = offU.pivot;
    this.offShoulder.position.set(0, 0.7, -0.4);
    offU.end.add(offF.pivot);
    this.offElbow = offF.pivot;
    offF.end.add(this.torch);
    this.torch.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.75, 6), DARK, 0, 0.12, 0));
    this.torch.add(mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 8), STEEL, 0, 0.48, 0));
    this.torchFlame = new Flame(0.55, 0.85, 2, undefined, false, DEPTH.uDepthPull);
    this.torchFlame.group.position.y = 0.52;
    this.torch.add(this.torchFlame.group);
    this.torchLight = new THREE.PointLight(0xff8840, 0, 18, 2);
    this.torchLight.position.y = 0.75;
    this.torchLight.shadow.mapSize.set(512, 512);
    this.torchLight.shadow.camera.near = 0.2;
    this.torchLight.shadow.camera.far = 16; // the torch lights a few metres; past that nothing needs its shadow
    this.torchLight.shadow.bias = -0.004;
    // on the root, not the torch, for the same reason as the blade's light (see above). update() keeps it at the torch.
    this.root.add(this.torchLight);
    this.torchHalo = new THREE.Sprite(
      pullForward(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.1, 0.5, 0.18), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.35 })),
    );
    this.torchHalo.position.y = 0.8;
    this.torch.add(this.torchHalo);
    for (const c of this.torch.children) c.visible = false;
    this.torchLight.castShadow = true; // always: toggling a shadow light recompiles every material (a freeze)
    this.torchLight.shadow.autoUpdate = false;
    this.torchLight.shadow.needsUpdate = true; // a map must exist before the first frame (see the sun in stage.ts)
    // a carried ember floats over his shoulder
    this.emberOrb = new THREE.Sprite(
      pullForward(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3.2, 1.3, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
    );
    this.emberOrb.position.set(-0.45, 2.75, 0.3);
    this.emberOrb.visible = false;
    this.root.add(this.emberOrb);
    this.chest.add(this.offShoulder);
    this.chest.add(this.shoulder);

    // cape: torn shadow-cloth hanging across his back (the plane spans his shoulders along z; it trails along -x)
    const capeGeo = new THREE.PlaneGeometry(0.9, 2.1, 5, 16);
    capeGeo.translate(-0.05, -1.05, 0);
    capeGeo.rotateY(Math.PI / 2);
    const tat = tatterTexture(7);
    const capeMat = pullForward(shadowify(
      new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }),
      0.6,
      'kcape',
    ));
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(-0.24, 0.84, -0.02);
    this.cape.castShadow = true;
    this.cape.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: tat, alphaTest: 0.5 });
    this.capeBase = Float32Array.from(capeGeo.attributes.position.array as Float32Array);
    this.chest.add(this.cape);

    // his small parts cast nothing visible but cost a draw in each face of the torch's shadow cube
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (m.geometry.boundingSphere!.radius < 0.11) m.castShadow = false;
    });

    // the shadow parts: smoke is emitted from them, and the aura wraps their union (the sword has its own)
    const swordMeshes = new Set<THREE.Object3D>(this.sword.meshes);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material !== BODY && m.material !== DARK) || swordMeshes.has(m)) return;
      this.parts.push(m);
    });

    const A = HERO.aura;
    this.aura = {
      root: this.root,
      bodyMeshes: [...this.parts, this.cape],
      swordMeshes: this.sword.meshes,
      swordRoot: this.sword.group,
      smearMeshes: [this.sword.blade],
      keepVisible: this.body,
      anchor: new THREE.Vector3(),
      height: CFG.knight.h,
      fade: 1,
      body: layer(VIOLET_IN.clone(), VIOLET_OUT.clone(), A.body),
      sword: layer(new THREE.Color(), new THREE.Color(), A.sword),
      smoke: layer(new THREE.Color(0.012, 0.004, 0.03), new THREE.Color(0, 0, 0), A.smoke),
      dt: 0,
      time: 0,
      light: new THREE.Vector3(),
      lightColor: LIT_RIM.clone(),
      lightAmount: 0,
    };

    // sword trail lives in the chest at the shoulder, so it shares the arm's lean, twist and swing tilt
    this.trail = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 2.55, 48, 1),
      new THREE.ShaderMaterial({
        vertexShader: TRAIL_VERT,
        fragmentShader: TRAIL_FRAG,
        uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: this.trailColor }, uDepthPull: DEPTH.uDepthPull },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.trail.position.copy(this.shoulder.position);
    this.trail.visible = false;
    this.chest.add(this.trail);
    this.setTorch(false);
  }

  /**
   * The helm, built for its silhouette (he is a shadow: the outline is all anyone sees). A pointed war-dome, a flared
   * two-lame neck guard over the shoulders (the wide samurai line from behind), a swept fin crest, and two great
   * crescent horns that rise out of his temples and hook forward. Under the brow: a faceplate with a ridge and two
   * slanted slits of light.
   */
  private buildHelm(): void {
    const h = new THREE.Group(); // built from pieces, then merged into one mesh (see below)
    const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
    const P = (r: number, y: number) => new THREE.Vector2(r, y);
    // the dome, rising to a point
    const dome = mesh(new THREE.LatheGeometry([P(0.001, 0.56), P(0.035, 0.545), P(0.09, 0.5), P(0.145, 0.42), P(0.183, 0.32), P(0.203, 0.2), P(0.198, 0.08), P(0.18, -0.03)], 28), BODY, 0, 0, 0);
    dome.scale.set(1.08, 1, 0.94);
    h.add(dome);
    // the neck guard: two flared lames, open at the face (the face is +x, phi = PI/2 in a lathe)
    const lame = (top: number, r0: number, r1: number, drop: number) =>
      new THREE.LatheGeometry([P(r0, top), P((r0 + r1) / 2 + 0.01, top - drop * 0.5), P(r1, top - drop), P(r1 - 0.018, top - drop - 0.006), P(r0 - 0.02, top - 0.01)], 26, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6);
    h.add(mesh(lame(0.11, 0.19, 0.285, 0.17), BODY, -0.01, 0, 0));
    h.add(mesh(lame(0.0, 0.25, 0.36, 0.17), BODY, -0.02, 0, 0));
    // the faceplate, a ridge down its middle, a pointed chin
    h.add(mesh(new RoundedBoxGeometry(0.09, 0.27, 0.29, 2, 0.03), BODY, 0.15, 0.1, 0));
    const ridge = mesh(new RoundedBoxGeometry(0.05, 0.3, 0.035, 2, 0.015), BODY, 0.195, 0.08, 0, false);
    ridge.rotation.z = -0.12;
    h.add(ridge);
    const chin = mesh(new THREE.ConeGeometry(0.06, 0.14, 4), BODY, 0.16, -0.07, 0, false);
    chin.rotation.set(0, Math.PI / 4, Math.PI);
    h.add(chin);
    // a hard brow over the eyes, angled down to the centre (a scowl)
    for (const s of [1, -1]) {
      const brow = mesh(new RoundedBoxGeometry(0.06, 0.045, 0.16, 2, 0.015), BODY, 0.2, 0.215, 0.075 * s, false);
      brow.rotation.x = 0.32 * s;
      h.add(brow);
    }
    // the crest: a fin swept back off the crown
    const fin = new THREE.Shape();
    fin.moveTo(0.1, 0.42);
    fin.quadraticCurveTo(0.03, 0.6, -0.25, 0.72);
    fin.quadraticCurveTo(-0.14, 0.56, -0.17, 0.36);
    fin.lineTo(0.1, 0.42);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 14 });
    finGeo.translate(0, 0, -0.015);
    h.add(mesh(finGeo, BODY));
    // the horns: out of the temples, outward and up, hooking forward at the tips; thick at the root, needle-sharp
    for (const s of [1, -1]) {
      const pts = [V(0.03, 0.3, 0.13 * s), V(0.01, 0.35, 0.27 * s), V(-0.01, 0.47, 0.4 * s), V(0.03, 0.63, 0.47 * s), V(0.11, 0.79, 0.46 * s), V(0.22, 0.9, 0.39 * s)];
      h.add(mesh(taperTube(pts, 0.072, 0.02, 32, 14, 1.6), BODY));
      // a collar where each horn grows out of the helm
      const collar = mesh(new THREE.TorusGeometry(0.062, 0.014, 8, 18), BODY, 0.028, 0.31, 0.15 * s, false);
      collar.rotation.set(0, Math.PI / 2, 0.35 * s);
      h.add(collar);
    }
    // two slanted slits of light, inner ends low: the eyes (one mesh: render reads its colour and position)
    const slit = (s: number) => {
      const g = new THREE.BoxGeometry(0.03, 0.024, 0.095);
      g.rotateX(-0.3 * s);
      g.translate(0, 0, 0.068 * s);
      return g;
    };
    // one mesh for the whole helm: each piece would be drawn again in the aura mask and in every shadow map
    h.updateMatrixWorld(true);
    const parts = h.children.map((o) => {
      const m = o as THREE.Mesh;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
      g.clearGroups();
      return g;
    });
    this.head.add(mesh(mergeGeometries(parts), BODY));
    this.eyes = new THREE.Mesh(mergeGeometries([slit(1), slit(-1)]), EYE);
    this.eyes.position.set(0.197, 0.165, 0);
    this.head.add(this.eyes);
  }

  setTorch(on: boolean): void {
    this.torchOn = on;
    for (const c of this.torch.children) c.visible = on;
    // redrawn on alternate frames while lit (see update), never every frame: the hearth is always out when the torch
    // burns, so the torch takes its slot opposite the moon
    this.torchLight.shadow.autoUpdate = false;
    if (!on) this.torchLight.intensity = 0;
    // the blade's look (HERO.swordPalette); with the torch lit, the fire he carries runs down the blade too
    const P = SWORD_PALETTES[this.swordPalette][on ? 'torch' : 'night'];
    this.trailColor.copy(P.trail);
    SWORD.uEdge.value.copy(P.edge);
    SWORD.uRune.value.copy(P.rune);
    this.sword.blade.material.color.setHex(P.steel);
    this.sword.light.color.setHex(P.light);
    this.sword.gem.material.color.copy(P.gem);
    this.aura.sword.inner.copy(P.auraIn);
    this.aura.sword.outer.copy(P.auraOut);
  }

  get eyePos(): THREE.Vector3 {
    return this.eyes.getWorldPosition(this.eyeWorld);
  }

  /** Target pose for the current sim state. Springs do the rest. */
  private target(k: Knight, t: number, dt: number): { p: Pose; stiff: number; zeta: number; exact: boolean } {
    const p: Pose = { ...REST };
    let stiff = 170;
    let zeta = 0.62;
    let exact = false; // the sword arm follows the cut exactly (no spring lag), so the blade is where the hit is
    const speed = Math.hypot(k.vx, k.vz);
    const b = this.breath; // -0.5 exhaled .. 0.5 inhaled
    // leaning into acceleration, back against braking
    const accLean = Math.max(-0.22, Math.min(0.28, this.accel * 0.011));
    switch (k.state) {
      case 'idle': {
        const g = this.guardK;
        for (const key of KEYS) {
          const r = AT_REST[key] ?? REST[key];
          p[key] = r + ((ON_GUARD[key] ?? r) - r) * g;
        }
        // breathing: the chest rises and opens on the inhale, the shoulders lift, the head settles on the exhale
        p.breath = b;
        p.bob += b * 0.026;
        p.lean -= b * 0.035;
        p.arm += b * 0.04;
        p.offArm += b * 0.05;
        p.head += -b * 0.03;
        // weight drifts slowly from one leg to the other
        const w = Math.sin(t * 0.83) * 0.6 + Math.sin(t * 0.31 + 1.7) * 0.4;
        p.kn0 += Math.max(0, w) * 0.14;
        p.kn1 += Math.max(0, -w) * 0.14;
        p.bob -= Math.abs(w) * 0.018;
        p.twist += w * 0.035;
        // on guard the blade breathes too; at rest his gaze wanders
        p.swordRel += Math.sin(t * 1.4) * 0.035 * g;
        p.arm += Math.sin(t * 1.4 + 0.6) * 0.02 * g;
        p.headYaw = Math.sin(t * 0.27) * 0.16 * (1 - g);
        p.head += Math.sin(t * 0.41 + 2) * 0.04 * (1 - g);
        if (this.brakeT > 0) {
          // planting the front foot to stop: brace back, then the springs settle him
          const e = this.brakeT / 0.28;
          p.lean = p.lean * (1 - e) - 0.16 * e;
          p.bob -= 0.12 * e;
          p.th0 += 0.5 * e;
          p.kn0 = p.kn0 * (1 - e) + 0.2 * e;
          p.th1 -= 0.3 * e;
          p.kn1 += 0.65 * e;
          p.offArm += 0.5 * e;
        }
        // turning on the spot: his feet shuffle round under him instead of sliding
        const turning = Math.min(1, Math.max(0, Math.abs(this.yawVel) - 0.5) / 3);
        if (turning > 0) {
          const s = Math.sin(this.shuffle);
          p.th0 += s * 0.32 * turning;
          p.th1 -= s * 0.32 * turning;
          p.kn0 += Math.max(0, s) * 0.5 * turning;
          p.kn1 += Math.max(0, -s) * 0.5 * turning;
          p.bob += (Math.abs(Math.cos(this.shuffle)) * 0.04 - 0.03) * turning;
        }
        this.applyFidget(p);
        stiff = 150;
        zeta = 0.58;
        break;
      }
      case 'run': {
        // stride grows with speed, so starting and stopping walk into the run instead of popping
        const amp = 0.3 + 0.7 * smooth((speed - 0.3) / 4.5);
        // stepping back (backpedal) keeps his facing: the stride runs in reverse, his guard stays up
        const backing = this.fv < -0.5 && Math.abs(this.yawVel) < 3;
        const skid = !backing && this.fv < 0 && speed > 1.5;
        this.phase += dt * (3.2 + speed * 1.15) * (backing ? -1 : 1);
        const s = Math.sin(this.phase);
        const c = Math.cos(this.phase);
        p.th0 = s * 1.05 * amp;
        p.th1 = -s * 1.05 * amp;
        p.kn0 = (Math.max(0, -s) * 1.6 + 0.15) * amp + 0.1;
        p.kn1 = (Math.max(0, s) * 1.6 + 0.15) * amp + 0.1;
        p.lean = 0.12 + 0.3 * amp + accLean; // he drives forward into the run
        p.twist = s * 0.15 * amp;
        p.bob = (Math.abs(c) * 0.1 - 0.055) * amp;
        // at speed the blade is dragged low behind him; it bounces a beat after the stride
        p.arm = 0.25 + (-0.55 + Math.sin(this.phase - 0.7) * 0.13) * amp;
        p.elbow = 0.45 + 0.1 * amp;
        p.swordRel = 0.45 - 1.5 * amp + Math.sin(this.phase - 1.1) * 0.08 * amp;
        p.armTilt = 0.08 + 0.07 * amp;
        p.offArm = -Math.sin(this.phase - 0.35) * 0.95 * amp + 0.25;
        p.offElbow = 0.7 + 0.35 * amp + Math.max(0, Math.sin(this.phase - 0.35)) * 0.3 * amp;
        // the head holds the horizon: it counters most of the chest's lean
        p.head = -p.lean * 0.55 + Math.abs(c) * 0.03 * amp;
        if (backing) {
          p.lean = 0.02;
          p.th0 *= 0.75;
          p.th1 *= 0.75;
          p.arm = ON_GUARD.arm!;
          p.elbow = ON_GUARD.elbow!;
          p.swordRel = ON_GUARD.swordRel!;
          p.armTilt = ON_GUARD.armTilt!;
          p.offArm = ON_GUARD.offArm!;
          p.offElbow = ON_GUARD.offElbow!;
          p.head = -0.08;
        } else if (skid) {
          // reversing: momentum still carries him while he turns and digs in toward the new direction
          p.lean = 0.5;
          p.bob = -0.17;
          p.th0 = 0.8;
          p.th1 = -0.55;
          p.kn0 = 0.55;
          p.kn1 = 1.0;
          p.arm = -0.25;
          p.offArm = 0.95;
          p.twist = 0.22;
          p.head = -0.2;
        }
        stiff = 420;
        break;
      }
      case 'air': {
        const r = Math.max(-1, Math.min(1, k.vy / 8)); // +1 rising, -1 falling
        const up = (r + 1) / 2;
        const L = (a: number, b: number) => b + (a - b) * up; // a = rising, b = falling
        p.th0 = L(1.15, 0.4);
        p.th1 = L(-0.1, -0.4);
        p.kn0 = L(1.75, 0.4);
        p.kn1 = L(1.15, 0.75);
        p.arm = L(1.4, 2.2);
        p.elbow = L(0.3, 0.2);
        p.swordRel = L(0.2, 0.1);
        p.offArm = L(1.2, 2.0);
        p.offElbow = L(0.7, 0.3);
        p.lean = L(-0.1, 0.14);
        p.head = L(-0.25, 0.12);
        p.armTilt = 0.2;
        if (this.flipT < 1) {
          // somersault: tucked tight, blade held in close
          const e = env(this.flipT, 1, 0.15, 0.3);
          const T: Partial<Pose> = { th0: 1.6, th1: 1.35, kn0: 2.1, kn1: 2.1, arm: 1.9, elbow: 0.6, swordRel: -1.3, offArm: 1.7, offElbow: 1.4, lean: 0.35, head: 0.3 };
          for (const key of Object.keys(T) as Key[]) p[key] += ((T[key] as number) - p[key]) * e;
        }
        stiff = 260;
        break;
      }
      case 'dash':
        p.lean = 0.75;
        p.th0 = -0.45;
        p.th1 = -0.95;
        p.kn0 = 1.0;
        p.kn1 = 0.8;
        p.arm = -0.9;
        p.swordRel = -0.8;
        p.armTilt = 0.25;
        p.offArm = -1.1;
        p.head = 0.3;
        p.sy = 0.9; // stretched long and low
        stiff = 900;
        zeta = 0.8;
        break;
      case 'hurt':
        p.lean = -0.6;
        p.arm = 1.9;
        p.head = -0.4;
        p.th0 = 0.45;
        p.th1 = -0.25;
        p.offArm = 1.4;
        stiff = 600;
        break;
      case 'dead': {
        const d = Math.min(1, k.stateT / 0.7);
        p.lean = -1.45 * d;
        p.bob = -0.95 * d;
        p.th0 = 0.9 * d;
        p.th1 = 0.4 * d;
        p.kn0 = 1.4 * d;
        p.kn1 = 1.0 * d;
        p.arm = 2.4 * d;
        stiff = 300;
        break;
      }
      case 'charge': {
        // gathering: feet planted wide, blade raised high behind him, the whole body coiled; it trembles as it fills
        const lv = Math.min(1, k.chargeT / CFG.charge.full);
        const shake = Math.sin(t * 55) * 0.035 * lv;
        p.lean = -0.18 - lv * 0.08;
        p.bob = -0.16 - lv * 0.12;
        p.twist = -0.5 - lv * 0.2;
        p.th0 = 0.7;
        p.th1 = -0.75;
        p.kn0 = 0.9 + lv * 0.3;
        p.kn1 = 0.5;
        p.arm = 3.5 + lv * 0.35 + shake; // raised over his head, drawing further back as it fills
        p.elbow = 0.08;
        p.swordRel = -0.1;
        p.armTilt = 0.1;
        p.offArm = 1.2;
        p.offElbow = 0.6;
        p.head = -0.12;
        p.breath = 0.5 + lv * 0.5; // drawing a deep breath
        stiff = 420;
        zeta = 0.85;
        break;
      }
      case 'attack':
      case 'heavy': {
        const sp: MoveSpec = k.move === 'light' ? CFG.combo[k.combo] : CFG[k.move];
        if (k.swingId !== this.lastSwing) {
          // a new cut starts from wherever the arm really is (the last cut's follow-through, a guard, a charge)
          this.lastSwing = k.swingId;
          this.cut = this.pickCut(k);
          this.from.arm = this.cur.arm;
          this.from.elbow = this.cur.elbow;
          this.from.wrist = this.cur.swordRel;
          this.from.tilt = this.cur.armTilt;
        }
        const C = this.cut;
        const F = this.from;
        const tt = k.stateT;
        const dir = Math.sign(C.a1 - C.a0) || -1;
        exact = true;
        // the stance under the cut: s 0 = his guard stance, 1 = the full stride, the stepping foot planted ahead
        const legs = (s: number, lift = 0) => {
          const a = s * C.stride;
          const front = 0.38 + 0.55 * a;
          const back = -0.32 - 0.45 * a;
          const fk = 0.48 + 0.2 * a + lift;
          const bk = 0.36 - 0.12 * a;
          if (C.step === 0) [p.th0, p.kn0, p.th1, p.kn1] = [front, fk, back, bk];
          else [p.th1, p.kn1, p.th0, p.kn0] = [front, fk, back, bk];
        };
        const head = () => {
          // his eyes stay on what he is cutting: the head counters the chest's twist and lean
          p.headYaw = -p.twist * 0.6;
          p.head = -p.lean * 0.45;
        };
        if (k.move === 'plunge') {
          if (k.slamT < 0) {
            // hang with the blade raised (gathered from wherever it was), then dive
            const diving = tt >= sp.windup;
            const e = smooth(tt / Math.max(0.01, sp.windup));
            p.arm = lerp(F.arm, C.a0, e);
            p.elbow = lerp(F.elbow, C.elbow0, e);
            p.swordRel = lerp(F.wrist, C.wrist0, e);
            p.armTilt = lerp(F.tilt, C.tilt, e);
            p.lean = diving ? 0.35 : -0.15;
            p.th0 = 1.15;
            p.th1 = -0.1;
            p.kn0 = 1.6;
            p.kn1 = 1.2;
            p.offArm = 1.6;
            p.head = diving ? 0.3 : -0.2;
            this.trailTail = p.arm + p.elbow + p.swordRel - Math.PI / 2;
          } else {
            const e = Math.min(1, k.slamT / 0.07);
            const r = Math.min(1, k.slamT / sp.recover);
            const s = 1 - Math.pow(1 - e, 3);
            p.arm = lerp(C.a0, C.a1, s);
            p.elbow = lerp(C.elbow0, 0.05, s) + C.fold * smooth((k.slamT - 0.07) / 0.15);
            p.swordRel = lerp(C.wrist0, C.wrist1, s);
            p.armTilt = C.tilt;
            p.lean = 0.55 * (1 - r * 0.6);
            p.bob = -0.4 * (1 - r);
            p.sy = 1 - 0.08 * (1 - smooth(k.slamT / 0.2));
            p.th0 = 1.0;
            p.th1 = -0.7;
            p.kn0 = 1.6;
            p.kn1 = 1.5;
            p.offArm = -0.4;
            if (k.slamT < 0.12) this.trailFade = 1;
          }
          this.trailHead = p.arm + p.elbow + p.swordRel - Math.PI / 2;
          stiff = 1500;
          zeta = 0.9;
          break;
        }
        const end = sp.windup + sp.active;
        if (tt < sp.windup) {
          // anticipation: into the chamber, decelerating into it; the stepping foot lifts
          const e = tt / sp.windup;
          const ee = 1 - (1 - e) * (1 - e);
          p.arm = lerp(F.arm, C.a0, ee);
          p.elbow = lerp(F.elbow, C.elbow0, ee);
          p.swordRel = C.aim !== undefined ? lerp(F.wrist, C.aim - C.a0 - C.elbow0, ee) : lerp(F.wrist, C.wrist0, ee);
          p.armTilt = lerp(F.tilt, C.tilt, smooth(e * 1.4));
          // the core unwinds before the arm moves: its target flips in the last third of the wind-up
          p.twist = e < 0.65 ? C.twist0 : C.twist1;
          p.lean = C.lean0;
          p.bob = -C.crouch;
          p.sy = lerp(1, C.sy0, ee);
          legs(0.3 * ee, 0.5 * Math.sin(Math.PI * Math.min(1, e * 1.2)));
          p.offArm = C.off0;
          p.offElbow = 0.85;
        } else if (tt < end) {
          // contact: hips and chest lead, the elbow straightens in the first half, the wrist whips the blade through
          const e = (tt - sp.windup) / sp.active;
          p.arm = lerp(C.a0, C.a1, whip(e));
          p.elbow = 0.05 + (C.elbow0 - 0.05) * (1 - smooth(e / 0.45));
          p.swordRel = C.aim !== undefined ? C.aim - p.arm - p.elbow : lerp(C.wrist0, C.wrist1, smooth((e - 0.1) / 0.6));
          p.armTilt = C.tilt;
          p.twist = C.twist1;
          p.lean = C.lean1;
          p.bob = -C.drop;
          p.sy = C.sy1;
          legs(1);
          p.offArm = C.off1;
          p.offElbow = 0.45;
        } else {
          const r = (tt - end) / sp.recover;
          if (r < 0.45) {
            // follow-through: the blade carries on past the target and wraps round him, the body overshoots its unwind
            const f = smooth(r / 0.45);
            const fe = 1 - (1 - f) * (1 - f);
            p.arm = C.a1 + dir * C.over * fe;
            p.elbow = 0.05 + C.fold * fe;
            p.swordRel = C.aim !== undefined ? C.aim - p.arm - p.elbow : C.wrist1 + dir * 0.25 * fe;
            p.armTilt = C.tilt;
            p.twist = C.twist1 * 1.12;
            p.lean = C.lean1 * 0.9;
            p.bob = -C.drop * (1 - 0.4 * f);
            p.sy = lerp(C.sy1, 1, f);
            legs(1);
            p.offArm = C.off1;
            p.offElbow = 0.5;
          } else {
            // released to the springs: the blade's momentum carries into them and he settles back into his guard
            exact = false;
            for (const key of KEYS) if (ON_GUARD[key] !== undefined) p[key] = ON_GUARD[key] as number;
            legs(1 - smooth((r - 0.45) / 0.55));
            p.sy = 1;
            head();
            stiff = 260;
            zeta = 0.62;
            break;
          }
        }
        head();
        if (k.move === 'air') {
          // cutting from a tuck, legs folded under him
          p.th0 = 1.0;
          p.th1 = -0.2;
          p.kn0 = 1.5;
          p.kn1 = 1.0;
          p.bob = 0;
          p.sy = 1;
        } else if (k.move === 'dashStrike') {
          p.th0 = -0.35;
          p.th1 = -0.95;
          p.kn0 = 1.0;
          p.kn1 = 0.8;
          p.head = 0.3;
        }
        const tip = p.arm + p.elbow + p.swordRel - Math.PI / 2;
        if (C.aim !== undefined) {
          // a thrust has no arc to smear
          this.trailTail = tip;
          this.trailFade = 0;
        } else if (tt < sp.windup) this.trailTail = tip; // the arc starts where the blade really is at the chamber
        else if (tt < end + 0.03) this.trailFade = 1; // the smear is the contact; it fades through the follow-through
        this.trailHead = tip;
        stiff = 1100;
        zeta = 0.82;
        break;
      }
    }
    // landing crouch and take-off stretch
    if (this.landT > 0) {
      const e = this.landT / 0.24;
      p.bob += -0.34 * e * this.landImpact;
      p.th0 += 0.85 * e * this.landImpact;
      p.th1 += -0.45 * e * this.landImpact;
      p.kn0 += 1.4 * e * this.landImpact;
      p.kn1 += 1.25 * e * this.landImpact;
      p.lean += 0.3 * e * this.landImpact;
      p.sy = 1 - 0.1 * e * this.landImpact;
      stiff = Math.max(stiff, 500);
    }
    if (this.stretchT > 0) p.sy = 1 + 0.12 * (this.stretchT / 0.16);
    // kneel (oath pose): one knee down, back straight, sword planted, head bowed. He still breathes.
    const kk = this.kneelK;
    if (kk > 0.001) {
      const K: Partial<Pose> = {
        lean: 0.12, bob: -0.6, th0: 1.5, th1: -0.2, kn0: 1.55, kn1: 1.8, arm: 0.75, elbow: 0.5, swordRel: -1.3, swordRoll: 0, armTilt: 0.05, head: 0.32,
        headYaw: 0, offArm: 1.15, offElbow: 1.3, twist: 0, sy: 1,
      };
      for (const key of Object.keys(K) as Key[]) p[key] = p[key] + ((K[key] as number) - p[key]) * kk;
      p.breath = b;
      p.bob += b * 0.022 * kk;
      p.lean -= b * 0.03 * kk;
      p.head -= b * 0.035 * kk;
      p.offArm += b * 0.03 * kk;
    }
    return { p, stiff, zeta, exact };
  }

  /** Idle flourishes, layered over the stance once he has stood still a while. */
  private applyFidget(p: Pose): void {
    const f = this.fidget;
    if (!f) return;
    const t = this.fidgetT;
    const len = FIDGET_LEN[f];
    const e = env(t, len);
    switch (f) {
      case 'look': // a glance back over his shoulder at the dark he came from
        p.headYaw -= 1.2 * e;
        p.head -= 0.1 * e;
        p.twist -= 0.16 * e;
        p.offArm += 0.1 * e;
        break;
      case 'twirl': // the blade spins once around his wrist
        p.swordRel += Math.PI * 2 * smooth(t / (len * 0.75));
        p.arm += 0.35 * e;
        p.elbow += 0.25 * e;
        p.armTilt += 0.25 * e;
        break;
      case 'roll': // shoulders roll, a long breath
        p.breath += 0.6 * e;
        p.lean -= 0.1 * e;
        p.head -= 0.14 * e;
        p.twist += Math.sin((t / len) * Math.PI * 2) * 0.16 * e;
        p.arm += 0.18 * e;
        p.offArm += 0.3 * e;
        break;
      case 'flick': {
        // raise the blade, then snap it down and aside to shake the shadow off it
        const up = smooth(t / (len * 0.3));
        const snap = smooth((t - len * 0.32) / (len * 0.12));
        const out = 1 - smooth((t - len * 0.6) / (len * 0.4));
        p.arm += (0.7 * up - 0.95 * snap) * out;
        p.swordRel += (0.8 * up - 1.0 * snap) * out;
        p.swordRoll += 0.9 * snap * out;
        p.lean += 0.1 * snap * out;
        break;
      }
    }
  }

  private pickFidget(): Fidget {
    const all: Fidget[] = this.guardK > 0.5 ? ['twirl', 'flick'] : ['look', 'twirl', 'roll', 'flick'];
    const pool = all.filter((f) => f !== this.lastFidget);
    const f = pool[Math.floor(Math.random() * pool.length)];
    this.lastFidget = f;
    return f;
  }

  private pickCut(k: Knight): Cut {
    // a touch of variety, never enough to break the chain from one cut into the next
    const j = (a: number) => (Math.random() - 0.5) * 2 * a;
    const vary = (c: Cut): Cut => ({ ...c, tilt: c.tilt + j(0.07), a1: c.a1 + j(0.08), over: c.over + j(0.06) });
    switch (k.move) {
      case 'heavy':
        return vary(CLEAVE);
      case 'charged':
        return vary(REND);
      case 'plunge':
        return PLUNGE;
      case 'lunge':
        return LUNGE;
      case 'dashStrike':
        return PIERCE;
      case 'air':
        return vary(COMBO[(Math.max(1, k.airHits) - 1) % COMBO.length]);
      default:
        return vary(COMBO[Math.min(k.combo, COMBO.length - 1)]);
    }
  }

  /** Breath, guard, fidgets, turns, flips and the other moments the sim does not know about. */
  private track(k: Knight, dt: number, t: number): void {
    // an asymmetric breath: a quicker inhale, a long exhale
    const bp = (t / HERO.breathPeriod) % 1;
    this.breath = (bp < 0.4 ? smooth(bp / 0.4) : 1 - smooth((bp - 0.4) / 0.6)) - 0.5;

    const fighting = k.state === 'attack' || k.state === 'heavy' || k.state === 'charge' || k.state === 'hurt';
    this.combatT = fighting ? 0 : this.combatT + dt;
    const guard = this.combatT < HERO.guardHold ? 1 : 0;
    this.guardK += (guard - this.guardK) * Math.min(1, dt * (guard ? 9 : 1.4));

    // fidgets: only standing still, at rest, and never in the middle of a turn
    if (k.state === 'idle' && this.pose === 'stand' && this.kneelK < 0.05) this.idleT += dt;
    else this.idleT = 0;
    if (this.fidget) {
      this.fidgetT += dt;
      if (this.idleT === 0 || this.fidgetT >= FIDGET_LEN[this.fidget]) {
        // a full turn of the blade is the same pose: unwind it so the springs carry the spin forward, never back
        if (this.fidget === 'twirl' && smooth(this.fidgetT / (FIDGET_LEN.twirl * 0.75)) > 0.5) this.cur.swordRel -= Math.PI * 2;
        this.fidget = null;
      }
    } else if (this.idleT > HERO.fidgetAfter && this.guardK < 0.6 && Math.abs(this.yawVel) < 0.5) {
      this.nextFidget -= dt;
      if (this.nextFidget <= 0) {
        this.fidget = this.pickFidget();
        this.fidgetT = 0;
        this.nextFidget = HERO.fidgetGap[0] + Math.random() * (HERO.fidgetGap[1] - HERO.fidgetGap[0]);
      }
    }

    // his feet shuffle as he turns on the spot; a sharp turn at speed is led by the chest
    this.shuffle += dt * Math.min(14, Math.abs(this.yawVel) * 3);
    if (Math.abs(this.yawVel) > 6 && k.onGround) this.vel.twist += Math.sign(this.yawVel) * dt * 20;

    // forward acceleration (for the lean), the stop and the double-jump somersault
    const speed = Math.hypot(k.vx, k.vz);
    if (dt > 0) this.accel += ((this.fv - this.prevFv) / dt - this.accel) * Math.min(1, dt * 10);
    this.prevFv = this.fv;
    if (this.prevState === 'run' && k.state === 'idle' && this.prevSpeed > 4) this.brakeT = 0.28;
    this.brakeT = Math.max(0, this.brakeT - dt);
    if (k.airJumps < this.prevAirJumps && !k.onGround) this.flipT = 0;
    this.prevAirJumps = k.airJumps;
    if (this.flipT < 1) this.flipT = Math.min(1, this.flipT + (dt / HERO.flipTime) * (k.state === 'air' ? 1 : 3));

    // a blow snaps him back before the springs catch him
    if (k.state === 'hurt' && this.prevState !== 'hurt') {
      this.vel.lean -= 7;
      this.vel.head -= 10;
      this.vel.arm += 5;
      this.hurtFlash = 1;
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.5);
    if ((k.state === 'attack' || k.state === 'heavy') && k.stateT < 0.05) this.swordFlare = 1;
    this.prevState = k.state;
    this.prevSpeed = speed;
  }

  /** k is already blended between sim steps by the game loop (see interpolate() in main.ts). */
  update(k: Knight, dt: number, t: number, smoke: Particles, glow: Particles, camera: THREE.Camera): void {
    dt = Math.max(0, dt);
    // a step up is a one-tick lift in the sim (up to 0.42 m): on his feet it eases over a few frames instead
    if (k.onGround && Number.isFinite(this.visY) && Math.abs(k.y - this.visY) < 0.6) this.visY += (k.y - this.visY) * (1 - Math.exp(-25 * dt));
    else this.visY = k.y;
    this.root.position.set(k.x, this.visY, k.z);
    // turn toward the sim's yaw the short way round (quick, but never a pop); how fast he turns banks and shuffles him
    if (!Number.isFinite(this.turn)) this.turn = k.yaw;
    let d = (k.yaw - this.turn) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const step = d * Math.min(1, dt * 40);
    this.turn += step;
    if (dt > 0) this.yawVel += (step / dt - this.yawVel) * Math.min(1, dt * 12);
    this.root.rotation.y = -this.turn;
    const fx = Math.cos(k.yaw);
    const fz = Math.sin(k.yaw);
    this.fv = k.vx * fx + k.vz * fz;
    this.sv = k.vz * fx - k.vx * fz;
    this.floorY = k.onGround ? this.visY + 0.03 : -Infinity; // the cape folds onto the floor instead of sinking into it
    this.expo += (Math.max(0, Math.min(1, this.exposure)) - this.expo) * Math.min(1, dt * 4);
    SHADOW.uExposure.value = this.expo;
    this.kneelK += ((this.pose === 'kneel' ? 1 : 0) - this.kneelK) * Math.min(1, dt * (this.pose === 'kneel' ? 6 : 2.2));

    // jump / land detection from the sim state
    if (this.prevGround && !k.onGround && k.vy > 0) this.stretchT = 0.16;
    if (!this.prevGround && k.onGround) {
      this.landT = 0.24;
      this.landImpact = Math.min(1, Math.max(0.35, -this.fallVy / 14));
    }
    if (!k.onGround) this.fallVy = k.vy;
    this.prevGround = k.onGround;
    this.landT = Math.max(0, this.landT - dt);
    this.stretchT = Math.max(0, this.stretchT - dt);
    this.track(k, dt, t);

    // the somersault: fast off the jump, slowing as he opens out
    this.spin.rotation.z = this.flipT < 1 ? -Math.PI * 2 * (1 - Math.pow(1 - this.flipT, 2.2)) : 0;

    // springs: semi-implicit Euler in small substeps so stiff springs stay stable at low frame rates
    const { p, stiff, zeta, exact } = this.target(k, t, dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (const key of KEYS) {
      if (exact && SWING_KEYS.has(key)) {
        // the sword arm hits its marks exactly; its speed is kept, so when the springs take it back after the
        // follow-through, the blade's momentum carries into them instead of stopping dead
        if (dt > 0) this.vel[key] = Math.max(-30, Math.min(30, (p[key] - this.cur[key]) / dt));
        this.cur[key] = p[key];
        continue;
      }
      const ks = stiff * GAIN[key];
      const kd = 2 * Math.sqrt(ks) * zeta;
      let x = this.cur[key];
      let v = this.vel[key];
      for (let s = 0; s < n; s++) {
        v += (ks * (p[key] - x) - kd * v) * h;
        x += v * h;
      }
      // never let a bad frame (huge or negative dt) leave the rig in an exploded state
      if (!Number.isFinite(x) || Math.abs(x) > 50) {
        x = p[key];
        v = 0;
      }
      this.cur[key] = x;
      this.vel[key] = v;
    }
    const c = this.cur;
    const arm = c.arm;

    this.squash.scale.set(1 / Math.sqrt(c.sy), c.sy, 1 / Math.sqrt(c.sy));
    this.body.position.y = c.bob;
    // banking: running a curve he leans into it, like anyone running hard round a corner
    const banking = k.onGround && (k.state === 'run' || k.state === 'dash');
    const bankWant = banking ? Math.max(-0.3, Math.min(0.3, this.yawVel * Math.hypot(k.vx, k.vz) * 0.02)) : 0;
    this.bank += (bankWant - this.bank) * Math.min(1, dt * 8);
    this.body.rotation.x = this.bank;
    this.chest.rotation.z = -c.lean;
    this.chest.rotation.y = c.twist;
    this.chest.scale.set(1 + c.breath * 0.022, 1 + c.breath * 0.016, 1 + c.breath * 0.03);
    // the head lags behind the chest a little (secondary motion)
    this.head.rotation.z = -c.head + this.vel.lean * 0.04;
    this.head.rotation.y = c.headYaw;
    this.shoulder.rotation.z = arm;
    this.shoulder.rotation.x = c.armTilt;
    this.elbow.rotation.z = c.elbow;
    this.sword.group.rotation.z = c.swordRel;
    this.sword.group.rotation.y = c.swordRoll;
    this.trail.rotation.x = c.armTilt;
    if (this.torchOn) {
      this.offShoulder.rotation.z = 1.05 + Math.sin(t * 2.1) * 0.04 - c.lean * 0.5 + c.breath * 0.04;
      this.offElbow.rotation.z = 0.95;
      this.torch.rotation.z = -1.9 + c.lean * 0.5;
    } else {
      this.offShoulder.rotation.z = c.offArm;
      this.offElbow.rotation.z = c.offElbow;
    }
    this.legs[0].thigh.rotation.z = c.th0;
    this.legs[1].thigh.rotation.z = c.th1;
    this.legs[0].knee.rotation.z = -c.kn0;
    this.legs[1].knee.rotation.z = -c.kn1;

    const eyeMat = this.eyes.material as THREE.MeshBasicMaterial;
    if (k.state === 'dead') eyeMat.color.setRGB(0.3, 0.25, 0.5).multiplyScalar(Math.max(0, 1 - k.stateT));
    else if (k.state === 'hurt') eyeMat.color.setRGB(4, 0.6, 0.4);
    else if (this.torchOn) eyeMat.color.setRGB(4.4, 2.4, 1.2);
    else eyeMat.color.setRGB(2.6, 2.2, 4.8).multiplyScalar(1 + c.breath * 0.25);
    this.body.visible = !(k.iframes > 0.3 && k.state !== 'dash' && Math.floor(t * 20) % 2 === 0 && k.state !== 'dead');

    // the aura flares when he shadow-steps or strikes
    const chargeLv = k.state === 'charge' ? Math.min(1, k.chargeT / CFG.charge.full) : 0;
    const flare = k.state === 'dash' ? 1 : k.state === 'charge' ? 0.3 + chargeLv * 0.9 : k.state === 'attack' || k.state === 'heavy' ? (k.move === 'charged' ? 1 : 0.45) : 0;
    if (chargeLv > 0 && Math.random() < dt * (20 + chargeLv * 70)) {
      // shadow pulled in from the air toward the blade
      this.sword.group.getWorldPosition(this.tmp);
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 0.8;
      const life = 0.3;
      const full = chargeLv >= 1;
      const e = Math.random() * Math.PI * 2;
      const ox = Math.cos(a) * Math.cos(e) * r;
      const oz = Math.cos(a) * Math.sin(e) * r;
      const oy = Math.sin(a) * r;
      glow.emit({ x: this.tmp.x + ox, y: this.tmp.y + oy, z: this.tmp.z + oz, vx: -ox / life, vy: -oy / life, vz: -oz / life, spread: 0.05, life, size: full ? 0.12 : 0.08, sizeEnd: 0.03, r: full ? 2.6 : 1.4, g: full ? 1.8 : 0.9, b: 5 });
    }
    this.dashGlow += (flare - this.dashGlow) * Math.min(1, dt * (flare > this.dashGlow ? 20 : 4));
    const swingOn = k.state === 'attack' || k.state === 'heavy';
    this.swordFlare = Math.max(swingOn ? 0.55 : 0, this.swordFlare - dt * 2.5, chargeLv);
    SHADOW.uTime.value = t;
    SHADOW.uAuraStrength.value = (k.state === 'dead' ? 0.3 : 1) * (1 + this.dashGlow * 2.2) * (1 + c.breath * 0.15);

    this.updateAura(k, t, dt, chargeLv);
    this.updateSword(k, t, dt, glow, chargeLv);
    this.updateTrail(dt);
    this.updateCape(k, dt, t);
    this.torchFlame.strength = this.torchOn ? 1 : 0; // (at 1 the flame re-showed itself every frame, torch lit or not)
    this.torchFlame.update(t, camera);
    if (this.torchOn && SHADOW_FRAME.n % 2 === 1) this.torchLight.shadow.needsUpdate = true;
    if (this.torchOn) {
      this.torch.updateWorldMatrix(true, false);
      this.torchLight.position.set(0, 0.75, 0).applyMatrix4(this.torch.matrixWorld);
      this.root.worldToLocal(this.torchLight.position);
    }
    if (this.torchOn) this.torchLight.intensity = 60 * (0.9 + 0.1 * Math.sin(t * 19) + 0.05 * Math.sin(t * 7));
    this.torchHalo.visible = this.torchOn;
    this.emberOrb.visible = k.ember;
    if (k.ember) {
      const e = 0.55 + Math.sin(t * 6) * 0.08;
      this.emberOrb.scale.set(e, e, 1);
      this.emberOrb.position.y = 2.75 + Math.sin(t * 2.2) * 0.08;
      if (Math.random() < dt * 30) {
        this.emberOrb.getWorldPosition(this.tmp);
        glow.emit({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vy: 0.8, vx: -k.vx * 0.1, vz: -k.vz * 0.1, spread: 0.25, life: 0.9, size: 0.09, sizeEnd: 0.01, r: 5, g: 2, b: 0.4, gravity: -0.5, wobble: 0.5 });
      }
    }
    const hs = 2.6 + Math.sin(t * 13) * 0.15;
    this.torchHalo.scale.set(hs, hs, 1);

    // shadow bleeds off every part of him and rises like smoke (the aura's smoke channel carries the rest)
    const fade = SHADOW.uFade.value;
    const burn = Math.max(0, this.expo - 0.35) * fade;
    if (k.state !== 'dead' && Math.random() < dt * burn * 22) {
      // the fire eats at a living shadow: his edges flake away in embers
      const part = this.parts[Math.floor(Math.random() * this.parts.length)];
      part.getWorldPosition(this.tmp);
      glow.emit({
        x: this.tmp.x + (Math.random() - 0.5) * 0.25, y: this.tmp.y, z: this.tmp.z + (Math.random() - 0.5) * 0.25, vy: 0.7 + Math.random() * 0.5, vx: -k.vx * 0.1, vz: -k.vz * 0.1,
        spread: 0.2, life: 0.9, size: 0.045, sizeEnd: 0.005, r: 4.2, g: 1.4, b: 0.3, gravity: -0.6, wobble: 0.5,
      });
    }
    if (k.state !== 'dead' && fade > 0.05) {
      const rate = dt * (16 + this.dashGlow * 70);
      for (let i = 0, n = emitCount(rate); i < n; i++) {
        const part = this.parts[Math.floor(Math.random() * this.parts.length)];
        part.getWorldPosition(this.tmp);
        smoke.emit({
          x: this.tmp.x + (Math.random() - 0.5) * 0.2, y: this.tmp.y, z: this.tmp.z + (Math.random() - 0.5) * 0.2,
          vx: -k.vx * 0.2 - fx * 0.15, vz: -k.vz * 0.2 - fz * 0.15, vy: 0.7 + Math.random() * 0.4, spread: 0.12, life: 0.9, size: 0.38, sizeEnd: 0.85,
          r: 0.015, g: 0.008, b: 0.035, alpha: 0.5 * fade, drag: 1.4, wobble: 0.4,
        });
      }
      if (Math.random() < dt * (8 + this.dashGlow * 30)) {
        const part = this.parts[Math.floor(Math.random() * this.parts.length)];
        part.getWorldPosition(this.tmp);
        glow.emit({
          x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vy: 0.8, spread: 0.25, life: 1.3, size: 0.05, sizeEnd: 0.008,
          r: this.torchOn ? 3.4 : 1.1, g: this.torchOn ? 1.2 : 0.6, b: this.torchOn ? 0.3 : 3.0, gravity: -0.4, wobble: 0.6,
        });
      }
    }
    if ((k.state === 'dash' || Math.hypot(k.vx, k.vz) > 6) && k.state !== 'dead') {
      const e = this.eyePos;
      for (let i = 0; i < 3; i++)
        glow.emit({ x: e.x - k.vx * i * 0.005, y: e.y, z: e.z - k.vz * i * 0.005, life: 0.25, size: 0.09, sizeEnd: 0.01, r: this.torchOn ? 4 : 2, g: this.torchOn ? 2 : 1.8, b: this.torchOn ? 1 : 4.5 });
    }
    if (k.state === 'dash') {
      // shadow-step: the body smears into a streak of dark smoke
      // the step's heading: forward, a backstep or a sidestep
      const dx = Math.cos(k.yaw + k.dashDir);
      const dz = Math.sin(k.yaw + k.dashDir);
      for (let i = 0; i < 6; i++) {
        const b = Math.random() * 1.2;
        smoke.emit({ x: k.x - dx * b, y: this.visY + 0.2 + Math.random() * 2.0, z: k.z - dz * b + (Math.random() - 0.5) * 0.4, vx: -dx * 2, vz: -dz * 2, spread: 0.3, life: 0.45, size: 0.9, sizeEnd: 0.3, r: 0.02, g: 0.01, b: 0.05, alpha: 0.75, drag: 3 });
      }
    }
    const skidding = k.state === 'run' && this.fv < 0 && !(this.fv < -0.5 && Math.abs(this.yawVel) < 3) && Math.hypot(k.vx, k.vz) > 1.5;
    if ((this.landT > 0.2 && this.landImpact > 0.5) || ((skidding || this.brakeT > 0.15) && Math.random() < dt * 40)) {
      // dust thrown up where his feet bite
      for (let i = 0; i < (skidding || this.brakeT > 0 ? 2 : 4); i++)
        smoke.emit({
          x: k.x + fx * 0.3 + (Math.random() - 0.5) * 1.0, y: this.visY + 0.05, z: k.z + fz * 0.3 + (Math.random() - 0.5) * 1.0,
          vx: (Math.random() - 0.5) * 3 + k.vx * 0.3, vz: (Math.random() - 0.5) * 3 + k.vz * 0.3, vy: 0.4, spread: 0.3, life: 0.6, size: 0.6, sizeEnd: 1.2, r: 0.03, g: 0.02, b: 0.05, alpha: 0.55, drag: 3,
        });
    }
  }

  /** Drive the screen-space aura from what he is doing. */
  private updateAura(k: Knight, t: number, dt: number, chargeLv: number): void {
    const A = this.aura;
    const H = HERO.aura;
    A.dt = dt;
    A.time = t;
    this.chest.getWorldPosition(A.anchor);
    A.fade = SHADOW.uFade.value * (k.state === 'dead' ? Math.max(0, 1 - k.stateT * 0.9) : 1);
    // below a third of his health the fire gutters like a candle in a draught
    const low = k.hp / CFG.knight.maxHp < H.lowHp && k.state !== 'dead';
    const gutter = low ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9.3) * Math.sin(t * 3.7 + 1)) : 1;
    const dash = k.state === 'dash' || (k.move === 'dashStrike' && k.state === 'attack');
    A.body.intensity = H.body.intensity * (1 + this.dashGlow * 0.55 + chargeLv * 0.9 + this.breath * 0.18) * gutter * (1 - 0.3 * this.expo);
    A.body.life = dash ? H.dashLife : H.body.life * (1 + chargeLv * 0.5);
    A.body.rise = H.body.rise * (1 + chargeLv * 0.9);
    A.body.inner.copy(VIOLET_IN).lerp(HURT_IN, this.hurtFlash);
    A.body.outer.copy(VIOLET_OUT).lerp(HURT_OUT, this.hurtFlash);
    const swinging = k.state === 'attack' || k.state === 'heavy';
    A.sword.intensity = H.sword.intensity * (0.85 + this.swordFlare * 0.45 + chargeLv * 1.1 + this.breath * 0.12);
    A.sword.life = swinging || this.fidget === 'twirl' || this.fidget === 'flick' ? H.swingLife : H.sword.life;
    A.smoke.intensity = H.smoke.intensity * (1 + this.dashGlow * 0.6);
    A.smoke.life = dash ? H.smoke.life * 1.6 : H.smoke.life;
    if (this.torchOn) this.torchLight.getWorldPosition(A.light);
    else A.light.copy(this.fireAt);
    A.lightAmount = this.expo;
  }

  /** The blade's glow, its light on the ground, the stone in its pommel and the motes it sheds. */
  private updateSword(k: Knight, t: number, dt: number, glow: Particles, chargeLv: number): void {
    const S = this.sword;
    SWORD.uTime.value = t;
    SWORD.uFlare.value = this.swordFlare;
    const alive = k.state !== 'dead' ? 1 : Math.max(0, 1 - k.stateT);
    S.group.updateWorldMatrix(true, false);
    S.group.localToWorld(bladePoint(0.55, 0, S.light.position));
    this.root.worldToLocal(S.light.position);
    S.light.intensity = HERO.swordLight * (0.75 + this.breath * 0.3 + this.swordFlare * 1.6 + chargeLv * 2) * alive * SHADOW.uFade.value;
    const gs = 1 + this.breath * 0.35 + this.swordFlare * 0.6 + chargeLv * 0.8;
    S.gem.scale.set(gs, gs * 1.35, gs);
    const rate = dt * (2 + this.swordFlare * 40 + chargeLv * 30) * alive;
    for (let i = 0, n = emitCount(rate); i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      S.group.localToWorld(bladePoint(0.08 + Math.random() * 0.9, side, this.tmp));
      glow.emit({
        x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vy: 0.5 + Math.random() * 0.4, vx: -k.vx * 0.05, vz: -k.vz * 0.05, spread: 0.15, life: 0.7, size: 0.032, sizeEnd: 0.004,
        r: this.torchOn ? 4.2 : 1.6, g: this.torchOn ? 1.6 : 1.1, b: this.torchOn ? 0.4 : 4.2, gravity: -0.3, wobble: 0.4,
      });
    }
  }

  private updateTrail(dt: number): void {
    this.trailTail += (this.trailHead - this.trailTail) * Math.min(1, dt * 9);
    this.trailFade = Math.max(0, this.trailFade - dt * 5);
    const on = this.trailFade > 0.01 && Math.abs(this.trailHead - this.trailTail) > 0.05;
    this.trail.visible = on;
    if (!on) return;
    const u = this.trail.material.uniforms;
    u.uHead.value = this.trailHead;
    u.uTail.value = this.trailTail;
    u.uOpacity.value = this.trailFade;
  }

  private updateCape(k: Knight, dt: number, t: number): void {
    // it streams back from his forward speed (and a little from sidesteps); stepping back presses it to him
    this.capeVx += (Math.max(0, this.fv) + Math.abs(this.sv) * 0.35 - this.capeVx) * Math.min(1, dt * 5);
    this.capeVy += (k.vy - this.capeVy) * Math.min(1, dt * 7);
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.capeBase;
    // at a run the cape streams out behind him (and off his legs, so the stride reads)
    const lift = Math.min(1.05, this.capeVx * 0.13 + Math.max(0, -this.capeVy) * 0.05);
    const kneel = this.kneelK;
    const breathe = this.cur.breath * 0.04;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bw = base[i * 3 + 2]; // across the shoulders
      const f = Math.max(0, Math.min(1, -by / 2.1));
      const wind = Math.sin(t * 1.3 + f * 2) * 0.12 * f + Math.sin(t * 4.7 - f * 5 + bw * 3) * 0.05 * f;
      const sway = Math.sin(t * (5.5 + this.capeVx * 0.9) - f * 4 + bw * 2) * 0.06 * f * (0.4 + this.capeVx * 0.15);
      const back = -Math.pow(f, 1.25) * (0.16 + lift * 1.35) - wind - breathe * f;
      const pool = kneel * Math.max(0, f - 0.45) * 1.1;
      // rising: the cape trails down; falling: it billows up
      const yDrop = by * (1 - lift * 0.55 * f) + Math.max(0, this.capeVy) * -0.02 * f + pool * 0.9;
      pos.setXYZ(i, bx + back + sway - pool, yDrop, bw * (1 + f * 0.25) + Math.sin(t * 3 + f * 3 + bw) * 0.05 * f);
    }
    if (Number.isFinite(this.floorY)) {
      // nothing of it goes below the floor he stands on: the hem folds onto the stones instead
      this.cape.updateWorldMatrix(true, false);
      const m = this.cape.matrixWorld;
      _inv.copy(m).invert();
      for (let i = 0; i < pos.count; i++) {
        _p.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (_p.y >= this.floorY) continue;
        _p.y = this.floorY;
        _p.applyMatrix4(_inv);
        pos.setXYZ(i, _p.x, _p.y, _p.z);
      }
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}

const _p = new THREE.Vector3();
const _inv = new THREE.Matrix4();
