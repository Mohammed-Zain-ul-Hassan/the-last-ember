import * as THREE from 'three';
import { CFG } from '../config';
import type { Knight } from '../sim/world';
import type { Particles } from './particles';

// Primitive silhouette knight built facing +x; facing is applied with scale.x so the sword arm stays nearest the camera.
const BODY = new THREE.MeshStandardMaterial({ color: 0x0e0c13, roughness: 0.5, metalness: 0.45 });
const CLOTH = new THREE.MeshStandardMaterial({ color: 0x08070b, roughness: 1, side: THREE.DoubleSide });
const EYE = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 4.2), toneMapped: false });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x1b1a22, roughness: 0.25, metalness: 0.9 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function limb(len: number, r: number): { pivot: THREE.Group; end: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.add(mesh(new THREE.CapsuleGeometry(r, len - r * 2, 4, 8), BODY, 0, -len / 2, 0));
  const end = new THREE.Group();
  end.position.y = -len;
  pivot.add(end);
  return { pivot, end };
}

// [start, end] arm angles per swing; 0..2 combo, 3 heavy
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
    float r = (length(vP) - 0.75) / 1.55;
    float edge = smoothstep(0.0, 0.55, r) * smoothstep(1.0, 0.9, r);
    float alpha = pow(s, 2.2) * edge * uOpacity;
    gl_FragColor = vec4(uColor * alpha, 1.0);
  }`;

interface Leg {
  thigh: THREE.Group;
  knee: THREE.Group;
}

export class KnightView {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // leans/bobs
  private legs: Leg[] = [];
  private shoulder: THREE.Group;
  private elbow: THREE.Group;
  private sword: THREE.Group;
  private offShoulder: THREE.Group;
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
  trailColor = new THREE.Color(1.5, 1.25, 3.2);

  constructor() {
    this.root.add(this.body);
    // legs
    for (const z of [0.14, -0.14]) {
      const thigh = limb(0.5, 0.12);
      const shin = limb(0.5, 0.105);
      thigh.pivot.position.set(0, 1.0, z);
      thigh.end.add(shin.pivot);
      shin.end.add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.16), BODY, 0.07, 0.03, 0));
      this.body.add(thigh.pivot);
      this.legs.push({ thigh: thigh.pivot, knee: shin.pivot });
    }
    // torso, tassets, pauldrons
    const torso = mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.74, 10), BODY, 0, 1.42, 0);
    torso.scale.z = 0.72;
    this.body.add(torso);
    this.body.add(mesh(new THREE.CylinderGeometry(0.23, 0.37, 0.38, 10, 1, true), BODY, 0, 1.0, 0));
    for (const z of [0.3, -0.3]) {
      const p = mesh(new THREE.SphereGeometry(0.21, 10, 8), BODY, -0.02, 1.76, z);
      p.scale.set(1.25, 0.85, 1);
      this.body.add(p);
    }
    // helm with swept-back horns and a glowing visor slit
    const helm = new THREE.Group();
    helm.position.set(0.02, 2.0, 0);
    helm.add(mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.36, 10), BODY));
    helm.add(mesh(new THREE.ConeGeometry(0.17, 0.16, 10), BODY, 0, 0.26, 0));
    for (const z of [0.12, -0.12]) {
      const horn = mesh(new THREE.ConeGeometry(0.05, 0.55, 6), BODY, -0.12, 0.3, z);
      horn.rotation.z = 0.95;
      horn.rotation.x = z > 0 ? 0.25 : -0.25;
      helm.add(horn);
    }
    this.eyes = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.22), EYE);
    this.eyes.position.set(0.18, 0.03, 0);
    helm.add(this.eyes);
    this.body.add(helm);

    // sword arm (front)
    const upper = limb(0.42, 0.09);
    const fore = limb(0.4, 0.08);
    this.shoulder = upper.pivot;
    this.shoulder.position.set(0, 1.74, 0.36);
    upper.end.add(fore.pivot);
    this.elbow = fore.pivot;
    this.sword = new THREE.Group();
    fore.end.add(this.sword);
    this.sword.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), BODY, 0, 0.02, 0));
    this.sword.add(mesh(new THREE.BoxGeometry(0.32, 0.05, 0.06), STEEL, 0, -0.1, 0));
    const blade = new THREE.Shape();
    blade.moveTo(-0.045, 0);
    blade.lineTo(0.045, 0);
    blade.lineTo(0.03, -1.3);
    blade.lineTo(0, -1.45);
    blade.lineTo(-0.03, -1.3);
    blade.closePath();
    const bladeMesh = mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.015, bevelEnabled: false }), STEEL, 0, -0.12, -0.008);
    this.sword.add(bladeMesh);

    // off arm (back)
    const offU = limb(0.42, 0.09);
    const offF = limb(0.4, 0.08);
    this.offShoulder = offU.pivot;
    this.offShoulder.position.set(0, 1.74, -0.36);
    offU.end.add(offF.pivot);
    offF.pivot.rotation.z = 0.5;
    this.body.add(this.offShoulder);
    this.body.add(this.shoulder);

    // cape hangs behind the shoulders
    const capeGeo = new THREE.PlaneGeometry(0.66, 1.6, 4, 14);
    capeGeo.translate(-0.05, -0.8, 0);
    this.cape = new THREE.Mesh(capeGeo, CLOTH as THREE.MeshStandardMaterial);
    this.cape.position.set(-0.2, 1.84, -0.02);
    this.cape.castShadow = true;
    this.capeBase = Float32Array.from(capeGeo.attributes.position.array as Float32Array);
    this.body.add(this.cape);

    // sword trail: a ring masked by shader between the trailing and leading blade angles
    this.trail = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 2.3, 48, 1),
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
    this.trail.position.set(0, 1.74, 0.45);
    this.trail.visible = false;
    this.root.add(this.trail);
  }

  update(k: Knight, dt: number, t: number, smoke: Particles): void {
    this.root.position.set(k.x, k.y, 0);
    // quick paper-turn when facing flips
    this.turn += (k.facing - this.turn) * Math.min(1, dt * 22);
    this.root.scale.x = Math.abs(this.turn) < 0.08 ? 0.08 * Math.sign(this.turn || 1) : this.turn;

    let lean = 0;
    let bob = 0;
    let arm = 0.55;
    let elbow = -0.35;
    let swordRel = 0.9;
    let thighs = [0.1, -0.1];
    let knees = [0.05, 0.05];
    const speed = Math.abs(k.vx);

    switch (k.state) {
      case 'idle':
        bob = Math.sin(t * 2.2) * 0.02;
        break;
      case 'run': {
        this.phase += dt * (4 + speed * 1.15);
        const s = Math.sin(this.phase);
        thighs = [s * 0.95, -s * 0.95];
        knees = [Math.max(0, -s) * 1.3 + 0.1, Math.max(0, s) * 1.3 + 0.1];
        lean = 0.16;
        bob = Math.abs(Math.cos(this.phase)) * 0.07 - 0.03;
        arm = 0.75 + s * 0.25;
        break;
      }
      case 'air':
        thighs = [0.75, -0.25];
        knees = [1.1, 0.5];
        arm = 1.1;
        lean = k.vy > 0 ? 0.05 : -0.05;
        break;
      case 'dash':
        lean = 0.55;
        thighs = [-0.3, -0.7];
        knees = [0.9, 0.6];
        arm = -0.5;
        swordRel = 0.4;
        break;
      case 'hurt':
        lean = -0.45;
        arm = 1.6;
        thighs = [0.3, -0.2];
        break;
      case 'dead': {
        const d = Math.min(1, k.stateT / 0.6);
        lean = -1.45 * d;
        bob = -0.85 * d;
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
          arm = 0.55 + (a0 - 0.55) * (1 - (1 - e) * (1 - e));
          lean = heavy ? -0.2 * e : -0.08 * e;
          thighs = heavy ? [0.5 * e, -0.4 * e] : [0.25, -0.2];
          knees = heavy ? [0.7 * e, 0.5 * e] : [0.2, 0.2];
        } else if (tt < sp.windup + sp.active) {
          const e = (tt - sp.windup) / sp.active;
          arm = a0 + (a1 - a0) * (1 - Math.pow(1 - e, 3));
          lean = heavy ? 0.4 : 0.2;
          thighs = [0.6, -0.5];
          knees = [0.4, 0.3];
        } else {
          const e = Math.min(1, (tt - sp.windup - sp.active) / sp.recover);
          arm = a1 + (0.55 - a1) * e * e;
          lean = (heavy ? 0.4 : 0.2) * (1 - e);
          thighs = [0.6 * (1 - e), -0.5 * (1 - e)];
          knees = [0.4 * (1 - e), 0.3 * (1 - e)];
        }
        elbow = -0.1;
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

    this.body.rotation.z = -lean;
    this.body.position.y = bob;
    this.shoulder.rotation.z = arm;
    this.elbow.rotation.z = elbow;
    this.sword.rotation.z = swordRel;
    this.offShoulder.rotation.z = -arm * 0.35 + 0.2;
    for (let i = 0; i < 2; i++) {
      this.legs[i].thigh.rotation.z = thighs[i];
      this.legs[i].knee.rotation.z = -knees[i];
    }

    // visor flickers red when hurt, fades when dead
    const eyeMat = this.eyes.material as THREE.MeshBasicMaterial;
    if (k.state === 'dead') eyeMat.color.setRGB(0.3, 0.25, 0.5).multiplyScalar(Math.max(0, 1 - k.stateT));
    else if (k.iframes > 0 && k.state === 'hurt') eyeMat.color.setRGB(4, 0.6, 0.4);
    else eyeMat.color.setRGB(2.4, 2.0, 4.2);
    // invulnerability blink
    this.body.visible = !(k.iframes > 0.3 && k.state !== 'dash' && Math.floor(t * 20) % 2 === 0 && k.state !== 'dead');

    this.updateTrail(dt);
    this.updateCape(k, dt, t);

    if (k.state === 'dash' && Math.random() < 0.9) {
      for (let i = 0; i < 3; i++)
        smoke.emit({ x: k.x - k.facing * Math.random() * 0.6, y: k.y + 0.3 + Math.random() * 1.6, z: (Math.random() - 0.5) * 0.4, spread: 0.3, life: 0.45, size: 0.9, sizeEnd: 0.3, r: 0.05, g: 0.04, b: 0.08, alpha: 0.85, drag: 3 });
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
    this.capeVx += (Math.abs(k.vx) - this.capeVx) * Math.min(1, dt * 6);
    this.capeVy += (k.vy - this.capeVy) * Math.min(1, dt * 8);
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.capeBase;
    const lift = Math.min(0.75, this.capeVx * 0.07 + Math.max(0, -this.capeVy) * 0.04);
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const f = Math.max(0, Math.min(1, -by / 1.6)); // 0 at shoulders, 1 at hem (clamped: pow of a negative is NaN)
      const sway = Math.sin(t * 5.5 - f * 4 + bx * 2) * 0.06 * f * (0.5 + this.capeVx * 0.15);
      const back = -Math.pow(f, 1.2) * (0.12 + lift * 1.3);
      const yDrop = by * (1 - lift * 0.55 * f) + Math.max(0, this.capeVy) * -0.015 * f;
      pos.setXYZ(i, bx + back + sway, yDrop, base[i * 3 + 2] + Math.sin(t * 3 + f * 3) * 0.05 * f);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}
