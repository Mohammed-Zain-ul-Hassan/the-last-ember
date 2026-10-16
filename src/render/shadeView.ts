import * as THREE from 'three';
import { CFG } from '../config';
import type { Shade } from '../sim/world';
import type { Particles } from './particles';
import { rimify } from './rim';
import { tatterTexture } from './textures';

const TATTER = tatterTexture(11);

const POOL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POOL_FRAG = /* glsl */ `
  uniform float uT; uniform float uA;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float ink = smoothstep(1.0, 0.55, r);
    float ring = smoothstep(0.08, 0.0, abs(r - fract(uT * 0.8) * 0.95)) * (1.0 - r);
    float rim = smoothstep(0.75, 0.95, r) * smoothstep(1.0, 0.95, r);
    vec3 col = vec3(0.0) + vec3(0.55, 0.25, 1.2) * (ring * 0.9 + rim * 0.6);
    gl_FragColor = vec4(col, (ink * 0.92 + ring * 0.5) * uA);
  }`;

/** One wraith: hooded, tattered robe, long clawed arms, ember eyes. */
class ShadeMesh {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private robe: THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>;
  private robeBase: Float32Array;
  private arms: THREE.Group[] = [];
  private hood = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private pool: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private seed = Math.random() * 10;

  constructor() {
    this.mat = rimify(new THREE.MeshStandardMaterial({ color: 0x040306, roughness: 1, transparent: true }), 0.75, 'shade');
    const robeMat = rimify(
      new THREE.MeshStandardMaterial({ color: 0x040306, roughness: 1, alphaMap: TATTER, alphaTest: 0.5, side: THREE.DoubleSide, transparent: true }),
      0.6,
      'shaderobe',
    );
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.9, 0.3), transparent: true, toneMapped: false });

    const robeGeo = new THREE.ConeGeometry(0.62, 1.75, 16, 10, true);
    robeGeo.translate(0, 0.875, 0);
    this.robe = new THREE.Mesh(robeGeo, robeMat);
    this.robe.castShadow = true;
    this.robe.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: TATTER, alphaTest: 0.5 });
    this.robeBase = Float32Array.from(robeGeo.attributes.position.array as Float32Array);
    this.body.add(this.robe);

    const m = (g: THREE.BufferGeometry, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(g, this.mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    // chest mass and hunched shoulders
    m(new THREE.SphereGeometry(0.36, 12, 10), this.body, 0.05, 1.4, 0).scale.set(1.1, 1.0, 1.15);
    // hood: a forward-drooping cowl
    this.hood.position.set(0.22, 1.72, 0);
    this.body.add(this.hood);
    const cowl = m(new THREE.ConeGeometry(0.26, 0.62, 12, 1, true), this.hood, 0.0, 0.08, 0);
    cowl.rotation.z = -1.0;
    const back = m(new THREE.SphereGeometry(0.25, 10, 8), this.hood, -0.05, 0, 0);
    back.scale.set(1.0, 1.15, 0.95);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.2), this.eyeMat);
    eyes.position.set(0.2, -0.02, 0);
    this.hood.add(eyes);
    // long arms ending in three claws
    for (const z of [0.3, -0.3]) {
      const arm = new THREE.Group();
      arm.position.set(0.1, 1.45, z);
      m(new THREE.CylinderGeometry(0.05, 0.08, 0.85, 6), arm, 0, -0.42, 0);
      for (let i = 0; i < 3; i++) {
        const c = m(new THREE.ConeGeometry(0.025, 0.32, 4), arm, 0.03, -0.95, (i - 1) * 0.05);
        c.rotation.z = Math.PI + (i - 1) * 0.25 + 0.3;
      }
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.root.add(this.body);

    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.ShaderMaterial({ vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, uniforms: { uT: { value: 0 }, uA: { value: 0 } }, transparent: true, depthWrite: false }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    this.root.add(this.pool);
  }

  update(s: Shade, dt: number, t: number, smoke: Particles, embers: Particles): void {
    const S = CFG.shade;
    const big = s.big ? 1.65 : 1;
    this.root.position.set(s.x, s.y, -0.2);
    this.root.scale.set(s.facing * big, big, big);
    const tt = t + this.seed;
    let rise = 1;
    let lean = 0.32 + Math.sin(tt * 1.7) * 0.05;
    let armA = 0.55 + Math.sin(tt * 2.3) * 0.12;
    let opacity = 1;
    let poolA = 0;
    if (s.state === 'rise') {
      const r = Math.min(1, s.stateT / S.riseTime);
      poolA = Math.min(1, r * 4);
      rise = Math.max(0, (r - 0.25) / 0.75);
      rise = 1 - Math.pow(1 - rise, 3);
      armA = 2.6 - 1.6 * rise; // arms reach up out of the pool first
    } else if (s.state === 'windup') {
      const e = s.stateT / S.windup;
      lean = 0.1 - 0.35 * e;
      armA = 0.55 + 2.2 * e; // claws raised high
    } else if (s.state === 'strike') {
      lean = 0.75;
      armA = -0.2;
    } else if (s.state === 'stagger') {
      lean = -0.4 * (1 - s.stateT / S.staggerTime);
      armA = 1.6;
    } else if (s.state === 'dead') {
      opacity = Math.max(0, 1 - s.deadT * 3.5);
      rise = 1 - s.deadT * 0.8;
      poolA = Math.max(0, 0.6 - s.deadT);
    } else poolA = 0;
    this.body.position.y = -2.0 * (1 - Math.max(0, rise)) + Math.sin(tt * 2.2) * 0.06 + 0.05;
    this.body.rotation.z = -lean;
    this.arms.forEach((a, i) => (a.rotation.z = armA + (i ? 0.25 : 0) + Math.sin(tt * 3 + i) * 0.08));
    this.hood.rotation.z = -lean * 0.4 + Math.sin(tt * 1.3) * 0.06;
    this.mat.opacity = opacity;
    this.robe.material.opacity = opacity;
    this.body.visible = opacity > 0.01;
    this.pool.material.uniforms.uA.value = poolA;
    this.pool.material.uniforms.uT.value = tt;
    this.pool.visible = poolA > 0.01;
    const ps = 0.5 + 0.9 * Math.min(1, poolA);
    this.pool.scale.setScalar(ps);

    // robe hem billows; it trails behind when moving
    const pos = this.robe.geometry.attributes.position as THREE.BufferAttribute;
    const b = this.robeBase;
    for (let i = 0; i < pos.count; i++) {
      const y = b[i * 3 + 1];
      const f = Math.max(0, 1 - y / 1.75); // 1 at hem
      const x = b[i * 3];
      const z = b[i * 3 + 2];
      const ang = Math.atan2(z, x);
      const wave = Math.sin(tt * 4 + ang * 3 + y * 3) * 0.09 * f * f;
      pos.setXYZ(i, x * (1 + wave) - f * f * 0.25 * Math.abs(Math.sin(tt * 0.9)), y + wave * 0.5, z * (1 + wave));
    }
    pos.needsUpdate = true;

    // ember eyes brighten in the windup (the telegraph)
    const tel = (s.state === 'windup' ? 1 + 2.5 * (s.stateT / S.windup) : 1) * (s.big ? 1.8 : 1);
    this.eyeMat.color.setRGB(4.5 * tel, 0.8 * tel, 0.3);
    // the great shade smoulders with a red heart so it reads in the dark
    if (s.big && s.state !== 'dead' && Math.random() < dt * 40)
      embers.emit({ x: s.x + (Math.random() - 0.5) * 1.6, y: s.y + 0.5 + Math.random() * 2.6, z: -0.1, vy: 0.6, spread: 0.3, life: 1.2, size: 0.12, sizeEnd: 0.02, r: 4, g: 0.5, b: 0.2, gravity: -0.5, wobble: 0.5 });
    this.eyeMat.opacity = opacity;

    if (s.state === 'dead') return;
    if (Math.random() < dt * 26 * big) {
      smoke.emit({
        x: s.x + (Math.random() - 0.5) * 0.7 * big, y: s.y + 0.1 + Math.random() * 0.9 * big, z: -0.2 + (Math.random() - 0.5) * 0.5,
        vx: -s.facing * 0.5, vy: 0.35, spread: 0.2, life: 1.1, size: 0.8 * big, sizeEnd: 1.4 * big, r: 0.025, g: 0.015, b: 0.045, alpha: 0.75, drag: 1,
      });
    }
    if (s.light > 0.05 && Math.random() < s.light * dt * 50) {
      // burning in the light: edges smoulder and flake into embers
      embers.emit({
        x: s.x + (Math.random() - 0.5) * 0.8 * big, y: s.y + 0.3 + Math.random() * 1.6 * big, z: -0.1,
        vy: 1, spread: 0.5, life: 0.7, size: 0.09, sizeEnd: 0.02, r: 5, g: 1.5, b: 0.3, gravity: -1.2, wobble: 0.6,
      });
    }
    if (s.state === 'rise' && Math.random() < 0.7) {
      smoke.emit({ x: s.x + (Math.random() - 0.5) * 1.4, y: 0.05, z: -0.2, vy: 1.6, spread: 0.4, life: 0.9, size: 1.0, sizeEnd: 1.8, r: 0.02, g: 0.01, b: 0.04, alpha: 0.9, drag: 1 });
    }
  }
}

export class ShadeViews {
  readonly group = new THREE.Group();
  private live = new Map<number, ShadeMesh>();
  private pool: ShadeMesh[] = [];

  update(shades: readonly Shade[], dt: number, t: number, smoke: Particles, embers: Particles): void {
    const seen = new Set<number>();
    for (const s of shades) {
      seen.add(s.id);
      let v = this.live.get(s.id);
      if (!v) {
        v = this.pool.pop() ?? new ShadeMesh();
        this.group.add(v.root);
        this.live.set(s.id, v);
      }
      v.update(s, dt, t, smoke, embers);
    }
    for (const [id, v] of this.live) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      this.live.delete(id);
      this.pool.push(v);
    }
  }

  clear(): void {
    for (const v of this.live.values()) {
      this.group.remove(v.root);
      this.pool.push(v);
    }
    this.live.clear();
  }

  get count(): number {
    return this.live.size;
  }
}
