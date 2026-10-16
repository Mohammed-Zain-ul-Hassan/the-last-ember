import * as THREE from 'three';
import { CFG, type MoveSpec } from '../config';
import type { Knight, Move } from '../sim/world';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Flame } from './flame';
import type { Particles } from './particles';
import { rimify } from './rim';
import { SHADOW, shadowify } from './shadowBody';
import { glowTexture, tatterTexture } from './textures';

// The shadow knight: living shadow in the shape of a knight. Built from primitives facing +x; facing is applied with
// scale.x so the sword arm stays nearest the camera. Every pose goes through springs, so motion has follow-through
// and overshoot instead of snapping between keyframes.
// pure black and fully matte: a shadow does not reflect the fire, only the aura gives it shape
const BODY = shadowify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.42, 'kbody');
const DARK = shadowify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.55, 'kdark');
const STEEL = rimify(new THREE.MeshStandardMaterial({ color: 0x1d1c26, roughness: 0.18, metalness: 0.95 }), 1.3, 'steel');
const EYE = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 4.8), toneMapped: false, transparent: true });
const EDGE = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.9, 2.6), toneMapped: false, transparent: true });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function limb(len: number, r0: number, r1 = r0 * 0.8, mat: THREE.Material = BODY): { pivot: THREE.Group; end: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.add(mesh(new THREE.CylinderGeometry(r1, r0, len, 18, 1), mat, 0, -len / 2, 0));
  pivot.add(mesh(new THREE.SphereGeometry(r0 * 1.05, 18, 12), mat));
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

/** A tube along a curve that tapers to a point: horns. */
function horn(points: THREE.Vector3[], r: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const tub = 24;
  const rad = 12;
  const g = new THREE.TubeGeometry(curve, tub, r, rad, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    curve.getPointAt(i / tub, c);
    const s = 1 - (i / tub) * 0.95;
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      p.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(s).add(c);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

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
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
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
const KEYS = ['lean', 'bob', 'twist', 'arm', 'armTilt', 'elbow', 'swordRel', 'head', 'th0', 'th1', 'kn0', 'kn1', 'offArm', 'offElbow', 'sy'] as const;
type Key = (typeof KEYS)[number];
type Pose = Record<Key, number>;
const REST: Pose = {
  lean: 0.06, bob: 0, twist: 0, arm: 0.45, armTilt: 0.15, elbow: -0.5, swordRel: 1.3, head: -0.05,
  th0: 0.15, th1: -0.15, kn0: 0.1, kn1: 0.12, offArm: 0.2, offElbow: 0.5, sy: 1,
};

interface Leg {
  thigh: THREE.Group;
  knee: THREE.Group;
}

export type KnightPose = 'stand' | 'kneel';

/** Fade the whole knight (the dawn ending dissolves him into light). */
export function setKnightFade(a: number): void {
  SHADOW.uFade.value = a;
  for (const m of [STEEL, EYE, EDGE]) {
    m.transparent = a < 0.999 || m !== STEEL;
    m.opacity = a;
  }
}

export class KnightView {
  readonly root = new THREE.Group();
  private squash = new THREE.Group(); // squash & stretch around the feet
  private body = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private legs: Leg[] = [];
  private shoulder: THREE.Group;
  private elbow: THREE.Group;
  private sword: THREE.Group;
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
  private turn = 1;
  private capeVx = 0;
  private capeVy = 0;
  private eyes: THREE.Mesh;
  private kneelK = 0;
  private cur: Pose = { ...REST };
  private vel: Pose = Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;
  private prevGround = true;
  private landT = 0;
  private landImpact = 0;
  private stretchT = 0;
  private fallVy = 0;
  private dashGlow = 0;
  private parts: THREE.Mesh[] = [];
  private aura: Flame;
  pose: KnightPose = 'stand';
  readonly torch = new THREE.Group();
  readonly torchFlame: Flame;
  readonly torchLight: THREE.PointLight;
  private torchHalo: THREE.Sprite;
  torchOn = false;
  readonly trailColor = new THREE.Color(1.6, 1.3, 3.4);
  private eyeWorld = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor() {
    this.root.add(this.squash);
    this.squash.add(this.body);
    for (const z of [0.15, -0.15]) {
      const thigh = limb(0.56, 0.13, 0.11);
      const shin = limb(0.54, 0.1, 0.13);
      thigh.pivot.position.set(0, 1.1, z);
      thigh.end.add(shin.pivot);
      shin.end.add(mesh(new RoundedBoxGeometry(0.34, 0.1, 0.17, 2, 0.035), BODY, 0.08, 0.03, 0));
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
      const p2 = mesh(new THREE.SphereGeometry(0.2, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), BODY, -0.05, 0.68, z * 1.08);
      p2.scale.set(1.25, 0.9, 1);
      const spike = mesh(new THREE.ConeGeometry(0.05, 0.3, 12), BODY, -0.08, 0.99, z);
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
          horn([new THREE.Vector3(0, 0.25, 0.12 * s), new THREE.Vector3(-0.12, 0.45, 0.22 * s), new THREE.Vector3(-0.42, 0.62, 0.26 * s), new THREE.Vector3(-0.78, 0.58, 0.2 * s), new THREE.Vector3(-1.02, 0.72, 0.14 * s)], 0.065),
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
    this.sword = new THREE.Group();
    fore.end.add(this.sword);
    this.sword.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), DARK, 0, 0.05, 0));
    this.sword.add(mesh(new THREE.SphereGeometry(0.05, 12, 8), STEEL, 0, 0.22, 0));
    this.sword.add(mesh(new RoundedBoxGeometry(0.44, 0.05, 0.07, 2, 0.02), STEEL, 0, -0.12, 0));
    const blade = new THREE.Shape();
    blade.moveTo(-0.06, 0);
    blade.lineTo(0.06, 0);
    blade.lineTo(0.045, -1.42);
    blade.lineTo(0, -1.62);
    blade.lineTo(-0.045, -1.42);
    blade.closePath();
    this.sword.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2 }), STEEL, 0, -0.14, -0.01));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.45, 0.03), EDGE);
    edge.position.set(0.05, -0.86, 0);
    this.sword.add(edge);

    const offU = limb(0.44, 0.1, 0.085);
    const offF = limb(0.42, 0.09, 0.075);
    this.offShoulder = offU.pivot;
    this.offShoulder.position.set(0, 0.7, -0.4);
    offU.end.add(offF.pivot);
    this.offElbow = offF.pivot;
    offF.end.add(this.torch);
    this.torch.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.75, 6), DARK, 0, 0.12, 0));
    this.torch.add(mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 8), STEEL, 0, 0.48, 0));
    this.torchFlame = new Flame(0.55, 0.85, 2);
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
      new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.1, 0.5, 0.18), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.35 }),
    );
    this.torchHalo.position.y = 0.8;
    this.torch.add(this.torchHalo);
    this.torch.visible = false;
    this.chest.add(this.offShoulder);
    this.chest.add(this.shoulder);

    // cape: torn shadow-cloth
    const capeGeo = new THREE.PlaneGeometry(0.9, 2.1, 5, 16);
    capeGeo.translate(-0.05, -1.05, 0);
    const tat = tatterTexture(7);
    const capeMat = shadowify(
      new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }),
      0.6,
      'kcape',
    );
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(-0.24, 0.84, -0.02);
    this.cape.castShadow = true;
    this.cape.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: tat, alphaTest: 0.5 });
    this.capeBase = Float32Array.from(capeGeo.attributes.position.array as Float32Array);
    this.chest.add(this.cape);

    // the shadow parts: smoke is emitted from them, and the stage outlines their union as one aura
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material !== BODY && m.material !== DARK)) return;
      this.parts.push(m);
    });

    // shadow-fire rising off him, behind the body
    this.aura = new Flame(1.5, 2.5, 2, new THREE.Color(1, 1, 1), true);
    this.aura.group.position.set(-0.15, 0.75, -0.45);
    this.aura.opacity = 0.5;
    this.root.add(this.aura.group);

    // sword trail lives in the chest at the shoulder, so it shares the arm's lean, twist and swing tilt
    this.trail = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 2.55, 48, 1),
      new THREE.ShaderMaterial({
        vertexShader: TRAIL_VERT,
        fragmentShader: TRAIL_FRAG,
        uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: this.trailColor } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.trail.position.copy(this.shoulder.position);
    this.trail.visible = false;
    this.chest.add(this.trail);
  }

  setTorch(on: boolean): void {
    this.torchOn = on;
    this.torch.visible = on;
    this.torchLight.castShadow = on;
    if (!on) this.torchLight.intensity = 0;
    this.trailColor.copy(on ? new THREE.Color(3.4, 1.3, 0.35) : new THREE.Color(1.6, 1.3, 3.4));
    EDGE.color.copy(on ? new THREE.Color(3.0, 1.0, 0.25) : new THREE.Color(1.1, 0.9, 2.6));
  }

  /** Meshes the stage outlines as one silhouette (body + cape). */
  get outlineTargets(): THREE.Object3D[] {
    return [...this.parts, this.cape];
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
    const breathe = Math.sin(t * 1.9);
    switch (k.state) {
      case 'idle':
        p.lean = 0.06 + breathe * 0.025;
        p.bob = breathe * 0.02;
        p.twist = Math.sin(t * 0.6) * 0.06;
        p.head = -0.05 + Math.sin(t * 0.7) * 0.06;
        p.arm = 0.45 + breathe * 0.04;
        break;
      case 'run': {
        this.phase += dt * (4 + speed * 1.1);
        const s = Math.sin(this.phase);
        const c = Math.cos(this.phase);
        p.th0 = s * 1.05;
        p.th1 = -s * 1.05;
        p.kn0 = Math.max(0, -s) * 1.45 + 0.15;
        p.kn1 = Math.max(0, s) * 1.45 + 0.15;
        p.lean = 0.3;
        p.twist = s * 0.14;
        p.bob = Math.abs(c) * 0.09 - 0.05;
        p.arm = -0.55 + s * 0.12; // blade trails behind, low, like a charge
        p.elbow = -0.25;
        p.swordRel = 0.85;
        p.armTilt = 0.35;
        p.offArm = -s * 0.7 + 0.2;
        p.offElbow = 0.9;
        p.head = -0.12;
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
        p.elbow = L(-0.6, -0.3);
        p.swordRel = L(1.1, 0.6);
        p.offArm = L(1.2, 2.0);
        p.offElbow = L(0.7, 0.3);
        p.lean = L(-0.1, 0.14);
        p.head = L(-0.25, 0.12);
        p.armTilt = 0.4;
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
        p.swordRel = 0.15;
        p.armTilt = 0.5;
        p.offArm = -1.1;
        p.head = 0.3;
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
        p.elbow = -0.08;
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
    // kneel (oath pose): one knee down, back straight, sword planted, head bowed
    const kk = this.kneelK;
    if (kk > 0.001) {
      const K: Partial<Pose> = { lean: 0.12, bob: -0.6, th0: 1.5, th1: -0.2, kn0: 1.55, kn1: 1.8, arm: 1.35, elbow: -1.1, swordRel: -0.3, armTilt: 0.05, head: 0.32, offArm: 1.15, offElbow: 1.3, twist: 0, sy: 1 };
      for (const key of Object.keys(K) as Key[]) p[key] = p[key] + ((K[key] as number) - p[key]) * kk;
    }
    return { p, stiff, zeta };
  }

  private pickSwing(move: Move, combo: number): Swing {
    const j = (a: number) => (Math.random() - 0.5) * 2 * a;
    switch (move) {
      case 'heavy':
        return { ...HEAVY, tilt: HEAVY.tilt + j(0.15), a0: HEAVY.a0 + j(0.1) };
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

  update(k: Knight, dt: number, t: number, smoke: Particles, glow: Particles, camera: THREE.Camera): void {
    this.root.position.set(k.x, k.y, 0);
    this.turn += (k.facing - this.turn) * Math.min(1, dt * 22);
    this.root.scale.x = Math.abs(this.turn) < 0.08 ? 0.08 * Math.sign(this.turn || 1) : this.turn;
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

    // springs: semi-implicit Euler in small substeps so stiff springs stay stable at low frame rates
    const { p, stiff, zeta } = this.target(k, t, dt);
    dt = Math.max(0, dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    const damp = 2 * Math.sqrt(stiff) * zeta;
    for (let s = 0; s < n; s++) {
      for (const key of KEYS) {
        this.vel[key] += (stiff * (p[key] - this.cur[key]) - damp * this.vel[key]) * h;
        this.cur[key] += this.vel[key] * h;
      }
    }
    for (const key of KEYS) {
      // never let a bad frame (huge or negative dt) leave the rig in an exploded state
      if (!Number.isFinite(this.cur[key]) || Math.abs(this.cur[key]) > 50) {
        this.cur[key] = p[key];
        this.vel[key] = 0;
      }
    }
    const c = this.cur;
    // during swings the arm must hit its marks exactly; springs only shape the rest of the body
    const arm = k.state === 'attack' || k.state === 'heavy' ? p.arm : c.arm;

    this.squash.scale.set(1 / Math.sqrt(c.sy), c.sy, 1 / Math.sqrt(c.sy));
    this.body.position.y = c.bob;
    this.chest.rotation.z = -c.lean;
    this.chest.rotation.y = c.twist;
    // the head lags behind the chest a little (secondary motion)
    this.head.rotation.z = -c.head + this.vel.lean * 0.04;
    this.shoulder.rotation.z = arm;
    this.shoulder.rotation.x = c.armTilt;
    this.elbow.rotation.z = c.elbow;
    this.sword.rotation.z = c.swordRel;
    this.trail.rotation.x = c.armTilt;
    if (this.torchOn) {
      this.offShoulder.rotation.z = 1.05 + Math.sin(t * 2.1) * 0.04 - c.lean * 0.5;
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
    else eyeMat.color.setRGB(2.6, 2.2, 4.8);
    this.body.visible = !(k.iframes > 0.3 && k.state !== 'dash' && Math.floor(t * 20) % 2 === 0 && k.state !== 'dead');

    // the aura flares when he shadow-steps or strikes
    const flare = k.state === 'dash' ? 1 : k.state === 'attack' || k.state === 'heavy' ? 0.45 : 0;
    this.dashGlow += (flare - this.dashGlow) * Math.min(1, dt * (flare > this.dashGlow ? 20 : 4));
    SHADOW.uTime.value = t;
    SHADOW.uAuraStrength.value = (k.state === 'dead' ? 0.3 : 1) * (1 + this.dashGlow * 2.2);
    this.aura.opacity = (0.42 + this.dashGlow * 0.5) * (k.state === 'dead' ? 0.2 : 1) * SHADOW.uFade.value;
    this.aura.strength = 0.85 + Math.sin(t * 3.1) * 0.05;
    this.aura.group.position.y = 0.75 + c.bob;
    this.aura.update(t, camera);

    this.updateTrail(dt);
    this.updateCape(k, dt, t);
    this.torchFlame.strength = 1;
    this.torchFlame.update(t, camera);
    if (this.torchOn) this.torchLight.intensity = 60 * (0.9 + 0.1 * Math.sin(t * 19) + 0.05 * Math.sin(t * 7));
    this.torchHalo.visible = this.torchOn;
    const hs = 2.6 + Math.sin(t * 13) * 0.15;
    this.torchHalo.scale.set(hs, hs, 1);

    // shadow bleeds off every part of him and rises like smoke
    const fade = SHADOW.uFade.value;
    if (k.state !== 'dead' && fade > 0.05) {
      const rate = dt * (30 + this.dashGlow * 90);
      for (let i = 0; i < rate + (Math.random() < rate % 1 ? 1 : 0); i++) {
        const part = this.parts[Math.floor(Math.random() * this.parts.length)];
        part.getWorldPosition(this.tmp);
        smoke.emit({
          x: this.tmp.x + (Math.random() - 0.5) * 0.2, y: this.tmp.y, z: this.tmp.z * 0.5,
          vx: -k.vx * 0.2 - k.facing * 0.15, vy: 0.7 + Math.random() * 0.4, spread: 0.12, life: 0.9, size: 0.38, sizeEnd: 0.85,
          r: 0.015, g: 0.008, b: 0.035, alpha: 0.6 * fade, drag: 1.4, wobble: 0.4,
        });
      }
      if (Math.random() < dt * (8 + this.dashGlow * 30)) {
        const part = this.parts[Math.floor(Math.random() * this.parts.length)];
        part.getWorldPosition(this.tmp);
        glow.emit({
          x: this.tmp.x, y: this.tmp.y, z: 0.25, vy: 0.8, spread: 0.25, life: 1.3, size: 0.07, sizeEnd: 0.01,
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
        smoke.emit({ x: k.x - k.facing * Math.random() * 1.2, y: k.y + 0.2 + Math.random() * 2.0, z: (Math.random() - 0.5) * 0.4, vx: -k.facing * 2, spread: 0.3, life: 0.45, size: 0.9, sizeEnd: 0.3, r: 0.02, g: 0.01, b: 0.05, alpha: 0.75, drag: 3 });
    }
    if (this.landT > 0.2 && this.landImpact > 0.5) {
      for (let i = 0; i < 4; i++)
        smoke.emit({ x: k.x + (Math.random() - 0.5) * 1.4, y: k.y + 0.05, vx: (Math.random() - 0.5) * 4, vy: 0.4, spread: 0.3, life: 0.6, size: 0.7, sizeEnd: 1.3, r: 0.03, g: 0.02, b: 0.05, alpha: 0.6, drag: 3 });
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
    const lift = Math.min(0.85, this.capeVx * 0.075 + Math.max(0, -this.capeVy) * 0.05);
    const kneel = this.kneelK;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const f = Math.max(0, Math.min(1, -by / 2.1));
      const wind = Math.sin(t * 1.3 + f * 2) * 0.12 * f + Math.sin(t * 4.7 - f * 5 + bx * 3) * 0.05 * f;
      const sway = Math.sin(t * 5.5 - f * 4 + bx * 2) * 0.06 * f * (0.4 + this.capeVx * 0.15);
      const back = -Math.pow(f, 1.25) * (0.16 + lift * 1.35) - wind;
      const pool = kneel * Math.max(0, f - 0.45) * 1.1;
      // rising: the cape trails down; falling: it billows up
      const yDrop = by * (1 - lift * 0.55 * f) + Math.max(0, this.capeVy) * -0.02 * f + pool * 0.9;
      pos.setXYZ(i, bx + back + sway - pool, yDrop, base[i * 3 + 2] + Math.sin(t * 3 + f * 3) * 0.05 * f);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}
