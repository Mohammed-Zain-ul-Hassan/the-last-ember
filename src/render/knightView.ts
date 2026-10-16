import * as THREE from 'three';
import { CFG } from '../config';
import type { Knight } from '../sim/world';
import { Flame } from './flame';
import type { Particles } from './particles';
import { rimify } from './rim';
import { glowTexture, tatterTexture } from './textures';

// The shadow knight, built from primitives facing +x. Facing is applied with scale.x so the sword arm stays nearest
// the camera. Silhouette first: tall horned helm, broad pauldrons, narrow waist, long torn cape, greatsword.
const BODY = rimify(new THREE.MeshStandardMaterial({ color: 0x0b0a10, roughness: 0.42, metalness: 0.55 }), 1.0, 'knight');
const DARK = rimify(new THREE.MeshStandardMaterial({ color: 0x060509, roughness: 0.8, metalness: 0.2 }), 0.7, 'knightdark');
const STEEL = rimify(new THREE.MeshStandardMaterial({ color: 0x1d1c26, roughness: 0.18, metalness: 0.95 }), 1.3, 'steel');
const EYE = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 4.8), toneMapped: false });
const EDGE = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.9, 2.6), toneMapped: false });
let CAPE_MAT: THREE.MeshStandardMaterial | null = null;

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function limb(len: number, r0: number, r1 = r0 * 0.8, mat: THREE.Material = BODY): { pivot: THREE.Group; end: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.add(mesh(new THREE.CylinderGeometry(r1, r0, len, 8), mat, 0, -len / 2, 0));
  pivot.add(mesh(new THREE.SphereGeometry(r0 * 1.05, 8, 6), mat));
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

/** A tube along a curve that tapers to a point: horns. */
function horn(points: THREE.Vector3[], r: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const tub = 16;
  const rad = 6;
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

const SWINGS: [number, number][] = [
  [3.7, 0.4],
  [0.1, 3.3],
  [3.9, -0.4],
  [4.3, 0.15],
];

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

interface Leg {
  thigh: THREE.Group;
  knee: THREE.Group;
}

export type KnightPose = 'stand' | 'kneel';

/** Fade the whole knight (the dawn ending dissolves him into light). */
export function setKnightFade(a: number): void {
  for (const m of [BODY, DARK, STEEL, EYE, EDGE, CAPE_MAT]) {
    if (!m) continue;
    m.transparent = a < 0.999;
    m.opacity = a;
  }
}

export class KnightView {
  readonly root = new THREE.Group();
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
  private phase = 0;
  private turn = 1;
  private capeVx = 0;
  private capeVy = 0;
  private eyes: THREE.Mesh;
  private kneelK = 0;
  pose: KnightPose = 'stand';
  readonly torch = new THREE.Group();
  readonly torchFlame: Flame;
  readonly torchLight: THREE.PointLight;
  private torchHalo: THREE.Sprite;
  torchOn = false;
  readonly trailColor = new THREE.Color(1.6, 1.3, 3.4);
  private eyeWorld = new THREE.Vector3();

  constructor() {
    this.root.add(this.body);
    // legs: greaves flare at the shin
    for (const z of [0.15, -0.15]) {
      const thigh = limb(0.56, 0.13, 0.11);
      const shin = limb(0.54, 0.1, 0.13);
      thigh.pivot.position.set(0, 1.1, z);
      thigh.end.add(shin.pivot);
      shin.end.add(mesh(new THREE.BoxGeometry(0.34, 0.1, 0.17), BODY, 0.08, 0.03, 0));
      this.body.add(thigh.pivot);
      this.legs.push({ thigh: thigh.pivot, knee: shin.pivot });
    }
    // chest pivots at the waist so the torso can twist/lean independently
    this.chest.position.y = 1.12;
    this.body.add(this.chest);
    this.chest.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.42, 10, 1, true), DARK, 0, -0.05, 0)); // fauld/skirt
    const torso = mesh(new THREE.CylinderGeometry(0.42, 0.21, 0.82, 10), BODY, 0, 0.45, 0);
    torso.scale.z = 0.68;
    this.chest.add(torso);
    // layered pauldrons with a spike
    for (const z of [0.33, -0.33]) {
      const p1 = mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), BODY, -0.03, 0.78, z);
      p1.scale.set(1.3, 1.0, 1.05);
      const p2 = mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), BODY, -0.05, 0.68, z * 1.08);
      p2.scale.set(1.25, 0.9, 1);
      const spike = mesh(new THREE.ConeGeometry(0.05, 0.28, 6), BODY, -0.08, 0.98, z);
      spike.rotation.z = 0.5;
      this.chest.add(p1, p2, spike);
    }
    // neck + helm
    this.head.position.set(0.03, 0.98, 0);
    this.chest.add(this.head);
    this.head.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 10), BODY, 0, 0.12, 0));
    this.head.add(mesh(new THREE.ConeGeometry(0.155, 0.22, 10), BODY, 0, 0.44, 0));
    this.head.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.34), BODY, 0.14, 0.2, 0));
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

    // sword arm (front)
    const upper = limb(0.44, 0.1, 0.085);
    const fore = limb(0.42, 0.09, 0.075);
    this.shoulder = upper.pivot;
    this.shoulder.position.set(0, 0.7, 0.4);
    upper.end.add(fore.pivot);
    this.elbow = fore.pivot;
    this.sword = new THREE.Group();
    fore.end.add(this.sword);
    this.sword.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), DARK, 0, 0.05, 0));
    this.sword.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), STEEL, 0, 0.22, 0));
    this.sword.add(mesh(new THREE.BoxGeometry(0.44, 0.05, 0.07), STEEL, 0, -0.12, 0));
    const blade = new THREE.Shape();
    blade.moveTo(-0.06, 0);
    blade.lineTo(0.06, 0);
    blade.lineTo(0.045, -1.42);
    blade.lineTo(0, -1.62);
    blade.lineTo(-0.045, -1.42);
    blade.closePath();
    this.sword.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.02, bevelEnabled: false }), STEEL, 0, -0.14, -0.01));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.45, 0.03), EDGE);
    edge.position.set(0.05, -0.86, 0);
    edge.rotation.z = -0.008;
    this.sword.add(edge);

    // off arm (back) carries the torch after midnight
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

    // cape: torn cloth hanging from the shoulders
    const capeGeo = new THREE.PlaneGeometry(0.85, 2.0, 5, 16);
    capeGeo.translate(-0.05, -1.0, 0);
    const tat = tatterTexture(7);
    const capeMat = rimify(
      new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 1, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }),
      0.8,
      'cape',
    );
    CAPE_MAT = capeMat;
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(-0.24, 0.84, -0.02);
    this.cape.castShadow = true;
    this.cape.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: tat, alphaTest: 0.5 });
    this.capeBase = Float32Array.from(capeGeo.attributes.position.array as Float32Array);
    this.chest.add(this.cape);

    // sword trail
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
    this.trail.position.set(0, 1.82, 0.5);
    this.trail.visible = false;
    this.root.add(this.trail);
  }

  setTorch(on: boolean): void {
    this.torchOn = on;
    this.torch.visible = on;
    this.torchLight.castShadow = on;
    if (!on) this.torchLight.intensity = 0;
    this.trailColor.copy(on ? new THREE.Color(3.4, 1.3, 0.35) : new THREE.Color(1.6, 1.3, 3.4));
    EDGE.color.copy(on ? new THREE.Color(3.0, 1.0, 0.25) : new THREE.Color(1.1, 0.9, 2.6));
  }

  /** World position of the visor, for eye trails. */
  get eyePos(): THREE.Vector3 {
    return this.eyes.getWorldPosition(this.eyeWorld);
  }

  update(k: Knight, dt: number, t: number, smoke: Particles, glow: Particles, camera: THREE.Camera): void {
    this.root.position.set(k.x, k.y, 0);
    this.turn += (k.facing - this.turn) * Math.min(1, dt * 22);
    this.root.scale.x = Math.abs(this.turn) < 0.08 ? 0.08 * Math.sign(this.turn || 1) : this.turn;
    this.kneelK += ((this.pose === 'kneel' ? 1 : 0) - this.kneelK) * Math.min(1, dt * (this.pose === 'kneel' ? 6 : 2.2));

    let lean = 0;
    let bob = 0;
    let twist = 0;
    let arm = 0.5;
    let elbow = -0.45;
    let swordRel = 1.25;
    let headTilt = 0;
    let thighs = [0.12, -0.12];
    let knees = [0.08, 0.08];
    const speed = Math.abs(k.vx);
    const breathe = Math.sin(t * 1.9);

    switch (k.state) {
      case 'idle':
        bob = breathe * 0.015;
        lean = 0.04 + breathe * 0.015;
        headTilt = -0.05 + Math.sin(t * 0.7) * 0.04;
        break;
      case 'run': {
        this.phase += dt * (4 + speed * 1.1);
        const s = Math.sin(this.phase);
        thighs = [s * 0.95, -s * 0.95];
        knees = [Math.max(0, -s) * 1.35 + 0.12, Math.max(0, s) * 1.35 + 0.12];
        lean = 0.2;
        twist = s * 0.12;
        bob = Math.abs(Math.cos(this.phase)) * 0.08 - 0.04;
        arm = 0.95 + s * 0.2;
        elbow = -0.7;
        swordRel = 1.6; // blade trails behind, low
        break;
      }
      case 'air':
        thighs = [0.85, -0.3];
        knees = [1.2, 0.6];
        arm = 1.3;
        lean = k.vy > 0 ? 0.08 : -0.06;
        break;
      case 'dash':
        lean = 0.62;
        thighs = [-0.35, -0.8];
        knees = [1.0, 0.7];
        arm = -0.7;
        swordRel = 0.3;
        headTilt = 0.2;
        break;
      case 'hurt':
        lean = -0.5;
        arm = 1.7;
        thighs = [0.35, -0.2];
        headTilt = -0.3;
        break;
      case 'dead': {
        const d = Math.min(1, k.stateT / 0.7);
        lean = -1.45 * d;
        bob = -0.95 * d;
        thighs = [0.9 * d, 0.4 * d];
        knees = [1.4 * d, 1.0 * d];
        arm = 2.4 * d;
        break;
      }
      case 'attack':
      case 'heavy': {
        const heavy = k.state === 'heavy';
        const sp = heavy ? CFG.heavy : CFG.combo[k.combo];
        const idx = heavy ? 3 : k.combo;
        const [a0, a1] = SWINGS[idx];
        const tt = k.stateT;
        if (tt < sp.windup) {
          const e = tt / sp.windup;
          const ee = 1 - (1 - e) * (1 - e);
          arm = 0.5 + (a0 - 0.5) * ee;
          lean = heavy ? -0.25 * e : -0.1 * e;
          twist = -0.35 * ee;
          thighs = heavy ? [0.55 * e, -0.45 * e] : [0.3, -0.25];
          knees = heavy ? [0.8 * e, 0.6 * e] : [0.25, 0.25];
        } else if (tt < sp.windup + sp.active) {
          const e = (tt - sp.windup) / sp.active;
          arm = a0 + (a1 - a0) * (1 - Math.pow(1 - e, 3));
          lean = heavy ? 0.45 : 0.25;
          twist = 0.35;
          thighs = [0.7, -0.55];
          knees = [0.45, 0.35];
        } else {
          const e = Math.min(1, (tt - sp.windup - sp.active) / sp.recover);
          arm = a1 + (0.5 - a1) * e * e;
          lean = (heavy ? 0.45 : 0.25) * (1 - e);
          twist = 0.35 * (1 - e);
          thighs = [0.7 * (1 - e), -0.55 * (1 - e)];
          knees = [0.45 * (1 - e), 0.35 * (1 - e)];
        }
        elbow = -0.08;
        swordRel = 0;
        const tip = arm + elbow - Math.PI / 2;
        if (k.swingId !== this.lastSwing) {
          this.lastSwing = k.swingId;
          this.trailTail = tip;
        }
        if (tt >= sp.windup && tt < sp.windup + sp.active + 0.05) this.trailFade = 1;
        else if (tt < sp.windup) this.trailTail = tip;
        this.trailHead = tip;
        break;
      }
    }

    // kneel (oath pose) blends over everything: one knee down, sword planted, head bowed
    const kk = this.kneelK;
    if (kk > 0.001) {
      const L = (a: number, b: number) => a + (b - a) * kk;
      lean = L(lean, 0.28);
      bob = L(bob, -0.62);
      thighs = [L(thighs[0], 1.45), L(thighs[1], -0.25)];
      knees = [L(knees[0], 1.5), L(knees[1], 1.75)];
      arm = L(arm, 1.15);
      elbow = L(elbow, -0.75);
      swordRel = L(swordRel, -0.5); // blade straight down into the ground
      headTilt = L(headTilt, 0.38);
      twist = L(twist, 0);
    }

    this.body.position.y = bob;
    this.chest.rotation.z = -lean;
    this.chest.rotation.y = twist;
    this.head.rotation.z = -headTilt;
    this.shoulder.rotation.z = arm;
    this.elbow.rotation.z = elbow;
    this.sword.rotation.z = swordRel;
    if (this.torchOn) {
      // torch held up and forward with a slow sway
      this.offShoulder.rotation.z = 1.05 + Math.sin(t * 2.1) * 0.04 - lean * 0.5;
      this.offElbow.rotation.z = 0.95;
      this.torch.rotation.z = -1.9 + lean * 0.5;
    } else {
      this.offShoulder.rotation.z = -arm * 0.3 + 0.25 + kk * 0.5;
      this.offElbow.rotation.z = 0.55;
    }
    for (let i = 0; i < 2; i++) {
      this.legs[i].thigh.rotation.z = thighs[i];
      this.legs[i].knee.rotation.z = -knees[i];
    }

    const eyeMat = this.eyes.material as THREE.MeshBasicMaterial;
    if (k.state === 'dead') eyeMat.color.setRGB(0.3, 0.25, 0.5).multiplyScalar(Math.max(0, 1 - k.stateT));
    else if (k.state === 'hurt') eyeMat.color.setRGB(4, 0.6, 0.4);
    else if (this.torchOn) eyeMat.color.setRGB(4.4, 2.4, 1.2);
    else eyeMat.color.setRGB(2.6, 2.2, 4.8);
    this.body.visible = !(k.iframes > 0.3 && k.state !== 'dash' && Math.floor(t * 20) % 2 === 0 && k.state !== 'dead');

    this.updateTrail(dt);
    this.updateCape(k, dt, t);
    this.torchFlame.strength = 1;
    this.torchFlame.update(t, camera);
    if (this.torchOn) this.torchLight.intensity = 60 * (0.9 + 0.1 * Math.sin(t * 19) + 0.05 * Math.sin(t * 7));
    this.torchHalo.visible = this.torchOn;
    const hs = 2.6 + Math.sin(t * 13) * 0.15;
    this.torchHalo.scale.set(hs, hs, 1);

    // he is made of shadow: smoke always bleeds off his shoulders and hem
    if (k.state !== 'dead' && Math.random() < dt * 22) {
      smoke.emit({
        x: k.x - k.facing * (0.2 + Math.random() * 0.4), y: k.y + 0.6 + Math.random() * 1.6 + bob, z: (Math.random() - 0.5) * 0.5,
        vx: -k.vx * 0.15 - k.facing * 0.2, vy: 0.55, spread: 0.15, life: 1.2, size: 0.55, sizeEnd: 1.1, r: 0.02, g: 0.015, b: 0.04, alpha: 0.55, drag: 1.2,
      });
    }
    if (k.state !== 'dead' && Math.random() < dt * (this.torchOn ? 10 : 5)) {
      glow.emit({
        x: k.x + (Math.random() - 0.5) * 0.6, y: k.y + 0.4 + Math.random() * 1.8, z: 0.3,
        vy: 0.6, spread: 0.2, life: 1.6, size: 0.06, sizeEnd: 0.01,
        r: this.torchOn ? 4 : 1.2, g: this.torchOn ? 1.4 : 1.0, b: this.torchOn ? 0.3 : 3.2, gravity: -0.3, wobble: 0.5,
      });
    }
    if ((k.state === 'dash' || speed > 6) && k.state !== 'dead') {
      const e = this.eyePos;
      for (let i = 0; i < 3; i++)
        glow.emit({ x: e.x - k.vx * i * 0.005, y: e.y, z: e.z, life: 0.22, size: 0.09, sizeEnd: 0.01, r: this.torchOn ? 4 : 2, g: this.torchOn ? 2 : 1.8, b: this.torchOn ? 1 : 4.5 });
    }
    if (k.state === 'dash') {
      for (let i = 0; i < 4; i++)
        smoke.emit({ x: k.x - k.facing * Math.random() * 0.8, y: k.y + 0.3 + Math.random() * 1.8, z: (Math.random() - 0.5) * 0.4, spread: 0.3, life: 0.4, size: 0.8, sizeEnd: 0.2, r: 0.02, g: 0.015, b: 0.04, alpha: 0.7, drag: 3 });
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
    const lift = Math.min(0.85, this.capeVx * 0.075 + Math.max(0, -this.capeVy) * 0.045);
    const kneel = this.kneelK;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const f = Math.max(0, Math.min(1, -by / 2.0));
      const wind = Math.sin(t * 1.3 + f * 2) * 0.12 * f + Math.sin(t * 4.7 - f * 5 + bx * 3) * 0.05 * f;
      const sway = Math.sin(t * 5.5 - f * 4 + bx * 2) * 0.06 * f * (0.4 + this.capeVx * 0.15);
      const back = -Math.pow(f, 1.25) * (0.16 + lift * 1.35) - wind;
      // when kneeling the cape pools on the ground behind him
      const pool = kneel * Math.max(0, f - 0.45) * 1.1;
      const yDrop = by * (1 - lift * 0.55 * f) + Math.max(0, this.capeVy) * -0.015 * f + pool * 0.9;
      pos.setXYZ(i, bx + back + sway - pool, yDrop, base[i * 3 + 2] + Math.sin(t * 3 + f * 3) * 0.05 * f);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}
