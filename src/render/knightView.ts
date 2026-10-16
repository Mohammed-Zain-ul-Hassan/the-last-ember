import * as THREE from 'three';
import { CFG, HERO, type MoveSpec } from '../config';
import type { Knight, KnightState, Move } from '../sim/world';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { AuraLayer, AuraSource } from './auraEffect';
import { DEPTH, PULL_GLSL, pullForward } from './depth';
import { Flame } from './flame';
import type { Particles } from './particles';
import { rimify } from './rim';
import { taperTube } from './shapes';
import { SHADOW, shadowify } from './shadowBody';
import { bladePoint, buildSword, SWORD, SWORD_PALETTES, type SwordParts } from './sword';
import { glowTexture, tatterTexture } from './textures';

// The shadow knight: living shadow in the shape of a knight. Built from primitives facing +x; facing is a mirror on
// scale.x so the sword arm stays nearest the camera, and the mirror happens mid-pivot while he faces the camera,
// so a turn reads as a turn. Every pose goes through springs with per-joint gains: the core leads and the head,
// arms and blade follow a beat later, so motion has follow-through and overlap instead of snapping between keys.
// pure black and fully matte: a shadow does not reflect the fire, only the aura gives it shape
// every material of his is pulled forward in depth (src/render/depth.ts) so the props he touches never cut into him
const BODY = pullForward(shadowify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.42, 'kbody'));
const DARK = pullForward(shadowify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.55, 'kdark'));
const STEEL = pullForward(rimify(new THREE.MeshStandardMaterial({ color: 0x1d1c26, roughness: 0.18, metalness: 0.95 }), 1.3, 'steel'));
const EYE = pullForward(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 4.8), toneMapped: false, transparent: true }));
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

// ---------------------------------------------------------------- slashes
// Arm angle sweeps a0 -> a1 in the arm's plane; tilt rotates that plane (0 = vertical cleave, ~1.3 = horizontal).
interface Swing {
  a0: number;
  a1: number;
  tilt: number;
  twist: number;
  lean: number;
}
const VARIANTS: Swing[] = [
  { a0: 3.8, a1: 0.35, tilt: 0.05, twist: 0.35, lean: 0.25 }, // overhead cleave
  { a0: 3.5, a1: 0.5, tilt: 0.7, twist: 0.5, lean: 0.25 }, // diagonal down
  { a0: 0.25, a1: 3.2, tilt: -0.55, twist: -0.35, lean: 0.08 }, // rising diagonal
  { a0: 3.1, a1: 0.8, tilt: 1.3, twist: 0.8, lean: 0.15 }, // horizontal sweep
  { a0: 0.7, a1: 3.4, tilt: 1.1, twist: -0.75, lean: 0.05 }, // backhand
];
const POOLS = [
  [0, 1, 3],
  [2, 4, 1],
  [3, 1, 0],
];
const HEAVY: Swing = { a0: 4.45, a1: 0.05, tilt: 0.12, twist: 0.5, lean: 0.5 };

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
    float edge = smoothstep(0.0, 0.6, r) * smoothstep(1.0, 0.88, r);
    float core = smoothstep(0.82, 0.97, r) * smoothstep(1.0, 0.97, r);
    float alpha = (pow(s, 2.4) * edge * 0.75 + core * pow(s, 6.0) * 1.5) * uOpacity;
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
/** During a swing the sword arm must hit its marks exactly, so it springs at full stiffness. */
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
    m.transparent = a < 0.999 || m === EYE;
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
  private swing: Swing = VARIANTS[0];
  private lastVariant = -1;
  private phase = 0;
  private capeVx = 0;
  private capeVy = 0;
  private eyes: THREE.Mesh;
  private kneelK = 0;
  private cur: Pose = { ...REST };
  private vel: Pose = Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;
  private prevGround = true;
  private prevState: KnightState = 'idle';
  private prevVx = 0;
  private prevFv = 0;
  private prevFacing: 1 | -1 = 1;
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
  // turning: he pivots toward the camera; the mirror flips at the halfway point
  private face: 1 | -1 = 1;
  private turnFrom: 1 | -1 = -1;
  private turnP = 1;
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
    this.head.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 24), BODY, 0, 0.12, 0));
    this.head.add(mesh(new THREE.ConeGeometry(0.155, 0.22, 24), BODY, 0, 0.44, 0));
    this.head.add(mesh(new RoundedBoxGeometry(0.1, 0.06, 0.34, 2, 0.025), BODY, 0.14, 0.2, 0));
    for (const s of [1, -1]) {
      this.head.add(
        mesh(
          taperTube([new THREE.Vector3(0, 0.25, 0.12 * s), new THREE.Vector3(-0.12, 0.45, 0.22 * s), new THREE.Vector3(-0.42, 0.62, 0.26 * s), new THREE.Vector3(-0.78, 0.58, 0.2 * s), new THREE.Vector3(-1.02, 0.72, 0.14 * s)], 0.065),
          BODY,
        ),
      );
    }
    this.eyes = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.26), EYE);
    this.eyes.position.set(0.18, 0.12, 0);
    this.head.add(this.eyes);

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
    FADERS.push(this.sword.blade.material, this.sword.gem.material);
    fore.end.add(this.sword.group);

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
    this.torchLight = new THREE.PointLight(0xff8840, 0, 0, 2);
    this.torchLight.position.y = 0.75;
    this.torchLight.shadow.mapSize.set(512, 512);
    this.torchLight.shadow.camera.near = 0.2;
    this.torchLight.shadow.camera.far = 30;
    this.torchLight.shadow.bias = -0.004;
    this.torch.add(this.torchLight);
    this.torchHalo = new THREE.Sprite(
      pullForward(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.1, 0.5, 0.18), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.35 })),
    );
    this.torchHalo.position.y = 0.8;
    this.torch.add(this.torchHalo);
    this.torch.visible = false;
    // a carried ember floats over his shoulder
    this.emberOrb = new THREE.Sprite(
      pullForward(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3.2, 1.3, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
    );
    this.emberOrb.position.set(-0.45, 2.75, 0.3);
    this.emberOrb.visible = false;
    this.root.add(this.emberOrb);
    this.chest.add(this.offShoulder);
    this.chest.add(this.shoulder);

    // cape: torn shadow-cloth
    const capeGeo = new THREE.PlaneGeometry(0.9, 2.1, 5, 16);
    capeGeo.translate(-0.05, -1.05, 0);
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

  setTorch(on: boolean): void {
    this.torchOn = on;
    this.torch.visible = on;
    this.torchLight.castShadow = on;
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
  private target(k: Knight, t: number, dt: number): { p: Pose; stiff: number; zeta: number } {
    const p: Pose = { ...REST };
    let stiff = 170;
    let zeta = 0.62;
    const speed = Math.abs(k.vx);
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
        this.applyFidget(p);
        stiff = 150;
        zeta = 0.58;
        break;
      }
      case 'run': {
        // stride grows with speed, so starting and stopping walk into the run instead of popping
        const amp = 0.3 + 0.7 * smooth((speed - 0.3) / 4.5);
        this.phase += dt * (3.2 + speed * 1.15);
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
        if (Math.sign(k.vx) !== k.facing && speed > 1.5) {
          // pivoting: momentum still carries him back while he digs in toward the new direction
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
        const heavy = k.state === 'heavy';
        const sp: MoveSpec = k.move === 'light' ? CFG.combo[k.combo] : CFG[k.move];
        if (k.swingId !== this.lastSwing) {
          this.lastSwing = k.swingId;
          this.swing = this.pickSwing(k.move, k.combo);
        }
        const S = this.swing;
        const tt = k.stateT;
        p.armTilt = S.tilt;
        p.elbow = 0.06;
        p.swordRel = 0;
        if (k.move === 'plunge') {
          // hang with the blade raised, dive, then slam it down into the ground
          if (k.slamT < 0) {
            const diving = tt >= sp.windup;
            p.arm = S.a0;
            p.lean = diving ? 0.35 : -0.15;
            p.th0 = 1.15;
            p.th1 = -0.1;
            p.kn0 = 1.6;
            p.kn1 = 1.2;
            p.offArm = 1.6;
            p.head = diving ? 0.3 : -0.2;
            this.trailTail = p.arm + p.elbow - Math.PI / 2;
          } else {
            const e = Math.min(1, k.slamT / 0.07);
            const r = Math.min(1, k.slamT / sp.recover);
            p.arm = S.a0 + (S.a1 - S.a0) * (1 - Math.pow(1 - e, 3));
            p.lean = 0.55 * (1 - r * 0.6);
            p.bob = -0.4 * (1 - r);
            p.th0 = 1.0;
            p.th1 = -0.7;
            p.kn0 = 1.6;
            p.kn1 = 1.5;
            p.offArm = -0.4;
            if (k.slamT < 0.12) this.trailFade = 1;
          }
          this.trailHead = p.arm + p.elbow - Math.PI / 2;
          stiff = 1500;
          zeta = 0.9;
          break;
        }
        if (tt < sp.windup) {
          const e = tt / sp.windup;
          const ee = 1 - (1 - e) * (1 - e);
          p.arm = REST.arm + (S.a0 - REST.arm) * ee;
          p.lean = heavy ? -0.3 * e : -0.12 * e;
          p.twist = -S.twist * ee;
          p.th0 = heavy ? 0.6 * e : 0.35;
          p.th1 = heavy ? -0.5 * e : -0.3;
          p.kn0 = heavy ? 0.9 * e : 0.3;
          p.kn1 = heavy ? 0.7 * e : 0.3;
          p.offArm = 0.8 * ee;
        } else if (tt < sp.windup + sp.active) {
          const e = (tt - sp.windup) / sp.active;
          p.arm = S.a0 + (S.a1 - S.a0) * (1 - Math.pow(1 - e, 3));
          p.lean = S.lean;
          p.twist = S.twist;
          p.th0 = 0.75;
          p.th1 = -0.6;
          p.kn0 = 0.5;
          p.kn1 = 0.4;
          p.offArm = -0.6;
          p.bob = heavy ? -0.18 : -0.06;
        } else {
          const e = Math.min(1, (tt - sp.windup - sp.active) / sp.recover);
          p.arm = S.a1 + (REST.arm - S.a1) * e * e;
          p.lean = S.lean * (1 - e);
          p.twist = S.twist * (1 - e);
          p.armTilt = S.tilt * (1 - e) + REST.armTilt * e;
          p.th0 = 0.75 * (1 - e);
          p.th1 = -0.6 * (1 - e);
          p.kn0 = 0.5 * (1 - e);
          p.kn1 = 0.4 * (1 - e);
          p.offArm = -0.6 * (1 - e);
        }
        if (k.move === 'air') {
          // strike from a tuck, legs folded under him
          p.th0 = 1.0;
          p.th1 = -0.2;
          p.kn0 = 1.5;
          p.kn1 = 1.0;
          p.bob = 0;
        } else if (k.move === 'dashStrike') {
          // a flat, low thrust: the whole body is the blade
          p.lean = Math.max(p.lean, 0.7);
          p.th0 = -0.35;
          p.th1 = -0.95;
          p.kn0 = 1.0;
          p.kn1 = 0.8;
          p.offArm = -1.1;
          p.head = 0.3;
        } else if (k.move === 'lunge') {
          p.th0 = 1.0;
          p.th1 = -0.9;
          p.kn0 = 0.7;
          p.kn1 = 0.2;
        }
        const tip = p.arm + p.elbow - Math.PI / 2;
        if (tt < sp.windup) this.trailTail = tip; // the arc starts where the blade actually is at the top of the wind-up
        else if (tt < sp.windup + sp.active + 0.05) this.trailFade = 1;
        this.trailHead = tip;
        stiff = 1500;
        zeta = 0.9;
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
    return { p, stiff, zeta };
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

  private pickSwing(move: Move, combo: number): Swing {
    const j = (a: number) => (Math.random() - 0.5) * 2 * a;
    switch (move) {
      case 'heavy':
        return { ...HEAVY, tilt: HEAVY.tilt + j(0.15), a0: HEAVY.a0 + j(0.1) };
      case 'charged':
        // released from high behind: the whole body brings the blade over and down into the ground
        return { a0: 3.9, a1: -0.25 + j(0.08), tilt: 0.1 + j(0.05), twist: 0.8, lean: 0.75 };
      case 'plunge':
        return { a0: 4.4, a1: 0.05, tilt: 0.08, twist: 0.3, lean: 0.5 };
      case 'lunge':
        return { a0: 2.75 + j(0.1), a1: 1.5, tilt: 1.35 + j(0.1), twist: 0.55, lean: 0.55 };
      case 'dashStrike':
        return { a0: 2.35, a1: 1.45 + j(0.08), tilt: 1.42, twist: 0.7, lean: 0.8 };
      default: {
        const poolIdx = move === 'air' ? 0 : Math.min(combo, POOLS.length - 1);
        const pool = POOLS[poolIdx].filter((i) => i !== this.lastVariant);
        const i = pool[Math.floor(Math.random() * pool.length)];
        this.lastVariant = i;
        const v = VARIANTS[i];
        return { ...v, a0: Math.min(4.5, v.a0 + j(0.2)), a1: v.a1 + j(0.2), tilt: v.tilt + j(0.22), twist: v.twist + j(0.1) };
      }
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
    } else if (this.idleT > HERO.fidgetAfter && this.guardK < 0.6 && this.turnP >= 1) {
      this.nextFidget -= dt;
      if (this.nextFidget <= 0) {
        this.fidget = this.pickFidget();
        this.fidgetT = 0;
        this.nextFidget = HERO.fidgetGap[0] + Math.random() * (HERO.fidgetGap[1] - HERO.fidgetGap[0]);
      }
    }

    // turning
    if (k.facing !== this.face) {
      this.turnFrom = this.face;
      this.face = k.facing;
      this.turnP = this.turnP < 1 ? 1 - this.turnP : 0;
      this.vel.twist += 2.5; // the chest leads the turn
    }
    this.turnP = Math.min(1, this.turnP + dt / HERO.turnTime);

    // forward acceleration (for the lean), the stop and the double-jump somersault
    const fv = k.vx * k.facing;
    if (dt > 0) {
      const acc = k.facing === this.prevFacing ? (fv - this.prevFv) / dt : 0;
      this.accel += (acc - this.accel) * Math.min(1, dt * 10);
    }
    this.prevFv = fv;
    this.prevFacing = k.facing;
    if (this.prevState === 'run' && k.state === 'idle' && Math.abs(this.prevVx) > 4) this.brakeT = 0.28;
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
    this.prevVx = k.vx;
  }

  /** at: the interpolated position to draw him at (the sim steps at 60 Hz; the screen may not). */
  update(k: Knight, dt: number, t: number, smoke: Particles, glow: Particles, camera: THREE.Camera, at?: { x: number; y: number }): void {
    const px = at?.x ?? k.x;
    const py = at?.y ?? k.y;
    dt = Math.max(0, dt);
    this.root.position.set(px, py, 0);
    this.floorY = k.onGround ? py + 0.03 : -Infinity; // the cape folds onto the floor instead of sinking into it
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

    // the turn: pivot toward the camera, mirror at the halfway point while he is narrowest
    const te = smooth(this.turnP);
    const u = Math.cos(te * Math.PI);
    const sx = this.turnFrom * (u >= 0 ? 1 : -1) * Math.max(0.16, Math.pow(Math.abs(u), 0.6));
    this.root.scale.x = sx;
    this.root.rotation.y = -Math.sign(sx) * Math.sin(te * Math.PI) * 0.8;
    // the somersault: fast off the jump, slowing as he opens out
    this.spin.rotation.z = this.flipT < 1 ? -Math.PI * 2 * (1 - Math.pow(1 - this.flipT, 2.2)) : 0;

    // springs: semi-implicit Euler in small substeps so stiff springs stay stable at low frame rates
    const { p, stiff, zeta } = this.target(k, t, dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    const swinging = k.state === 'attack' || k.state === 'heavy';
    for (const key of KEYS) {
      const ks = stiff * (swinging && SWING_KEYS.has(key) ? 1 : GAIN[key]);
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
    // during swings the arm must hit its marks exactly; springs only shape the rest of the body
    const arm = swinging ? p.arm : c.arm;

    this.squash.scale.set(1 / Math.sqrt(c.sy), c.sy, 1 / Math.sqrt(c.sy));
    this.body.position.y = c.bob;
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
      glow.emit({ x: this.tmp.x + Math.cos(a) * r, y: this.tmp.y + Math.sin(a) * r, z: this.tmp.z, vx: (-Math.cos(a) * r) / life, vy: (-Math.sin(a) * r) / life, spread: 0.05, life, size: full ? 0.12 : 0.08, sizeEnd: 0.03, r: full ? 2.6 : 1.4, g: full ? 1.8 : 0.9, b: 5 });
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
    this.torchFlame.strength = 1;
    this.torchFlame.update(t, camera);
    if (this.torchOn) this.torchLight.intensity = 60 * (0.9 + 0.1 * Math.sin(t * 19) + 0.05 * Math.sin(t * 7));
    this.torchHalo.visible = this.torchOn;
    this.emberOrb.visible = k.ember;
    if (k.ember) {
      const e = 0.55 + Math.sin(t * 6) * 0.08;
      this.emberOrb.scale.set(e, e, 1);
      this.emberOrb.position.y = 2.75 + Math.sin(t * 2.2) * 0.08;
      if (Math.random() < dt * 30) {
        this.emberOrb.getWorldPosition(this.tmp);
        glow.emit({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vy: 0.8, vx: -k.vx * 0.1, spread: 0.25, life: 0.9, size: 0.09, sizeEnd: 0.01, r: 5, g: 2, b: 0.4, gravity: -0.5, wobble: 0.5 });
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
        x: this.tmp.x + (Math.random() - 0.5) * 0.25, y: this.tmp.y, z: this.tmp.z + 0.2, vy: 0.7 + Math.random() * 0.5, vx: -k.vx * 0.1,
        spread: 0.2, life: 0.9, size: 0.045, sizeEnd: 0.005, r: 4.2, g: 1.4, b: 0.3, gravity: -0.6, wobble: 0.5,
      });
    }
    if (k.state !== 'dead' && fade > 0.05) {
      const rate = dt * (16 + this.dashGlow * 70);
      for (let i = 0; i < rate + (Math.random() < rate % 1 ? 1 : 0); i++) {
        const part = this.parts[Math.floor(Math.random() * this.parts.length)];
        part.getWorldPosition(this.tmp);
        smoke.emit({
          x: this.tmp.x + (Math.random() - 0.5) * 0.2, y: this.tmp.y, z: this.tmp.z * 0.5,
          vx: -k.vx * 0.2 - k.facing * 0.15, vy: 0.7 + Math.random() * 0.4, spread: 0.12, life: 0.9, size: 0.38, sizeEnd: 0.85,
          r: 0.015, g: 0.008, b: 0.035, alpha: 0.5 * fade, drag: 1.4, wobble: 0.4,
        });
      }
      if (Math.random() < dt * (8 + this.dashGlow * 30)) {
        const part = this.parts[Math.floor(Math.random() * this.parts.length)];
        part.getWorldPosition(this.tmp);
        glow.emit({
          x: this.tmp.x, y: this.tmp.y, z: 0.25, vy: 0.8, spread: 0.25, life: 1.3, size: 0.05, sizeEnd: 0.008,
          r: this.torchOn ? 3.4 : 1.1, g: this.torchOn ? 1.2 : 0.6, b: this.torchOn ? 0.3 : 3.0, gravity: -0.4, wobble: 0.6,
        });
      }
    }
    if ((k.state === 'dash' || Math.abs(k.vx) > 6) && k.state !== 'dead') {
      const e = this.eyePos;
      for (let i = 0; i < 3; i++)
        glow.emit({ x: e.x - k.vx * i * 0.005, y: e.y, z: e.z, life: 0.25, size: 0.09, sizeEnd: 0.01, r: this.torchOn ? 4 : 2, g: this.torchOn ? 2 : 1.8, b: this.torchOn ? 1 : 4.5 });
    }
    if (k.state === 'dash') {
      // shadow-step: the body smears into a streak of dark smoke
      for (let i = 0; i < 6; i++)
        smoke.emit({ x: px - k.facing * Math.random() * 1.2, y: py + 0.2 + Math.random() * 2.0, z: (Math.random() - 0.5) * 0.4, vx: -k.facing * 2, spread: 0.3, life: 0.45, size: 0.9, sizeEnd: 0.3, r: 0.02, g: 0.01, b: 0.05, alpha: 0.75, drag: 3 });
    }
    const skidding = k.state === 'run' && Math.sign(k.vx) !== k.facing && Math.abs(k.vx) > 1.5;
    if ((this.landT > 0.2 && this.landImpact > 0.5) || ((skidding || this.brakeT > 0.15) && Math.random() < dt * 40)) {
      // dust thrown up where his feet bite
      for (let i = 0; i < (skidding || this.brakeT > 0 ? 2 : 4); i++)
        smoke.emit({ x: px + k.facing * 0.3 + (Math.random() - 0.5) * 1.0, y: py + 0.05, vx: (Math.random() - 0.5) * 3 + k.vx * 0.3, vy: 0.4, spread: 0.3, life: 0.6, size: 0.6, sizeEnd: 1.2, r: 0.03, g: 0.02, b: 0.05, alpha: 0.55, drag: 3 });
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
    S.light.intensity = HERO.swordLight * (0.75 + this.breath * 0.3 + this.swordFlare * 1.6 + chargeLv * 2) * alive * SHADOW.uFade.value;
    const gs = 1 + this.breath * 0.35 + this.swordFlare * 0.6 + chargeLv * 0.8;
    S.gem.scale.set(gs, gs * 1.35, gs);
    const rate = dt * (2 + this.swordFlare * 40 + chargeLv * 30) * alive;
    for (let i = 0; i < rate + (Math.random() < rate % 1 ? 1 : 0); i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      S.group.localToWorld(bladePoint(0.08 + Math.random() * 0.9, side, this.tmp));
      glow.emit({
        x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vy: 0.5 + Math.random() * 0.4, vx: -k.vx * 0.05, spread: 0.15, life: 0.7, size: 0.032, sizeEnd: 0.004,
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
    this.capeVx += (Math.abs(k.vx) - this.capeVx) * Math.min(1, dt * 5);
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
      const f = Math.max(0, Math.min(1, -by / 2.1));
      const wind = Math.sin(t * 1.3 + f * 2) * 0.12 * f + Math.sin(t * 4.7 - f * 5 + bx * 3) * 0.05 * f;
      const sway = Math.sin(t * (5.5 + this.capeVx * 0.9) - f * 4 + bx * 2) * 0.06 * f * (0.4 + this.capeVx * 0.15);
      const back = -Math.pow(f, 1.25) * (0.16 + lift * 1.35) - wind - breathe * f;
      const pool = kneel * Math.max(0, f - 0.45) * 1.1;
      // rising: the cape trails down; falling: it billows up
      const yDrop = by * (1 - lift * 0.55 * f) + Math.max(0, this.capeVy) * -0.02 * f + pool * 0.9;
      pos.setXYZ(i, bx + back + sway - pool, yDrop, base[i * 3 + 2] + Math.sin(t * 3 + f * 3) * 0.05 * f);
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
