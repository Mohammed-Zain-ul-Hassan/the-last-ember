// Pooled camera-facing point particles. One additive pool (fire, embers, sparks: HDR colour so bloom catches them)
// and one alpha pool (smoke, the dark wisps shades leave). No allocation per frame.

import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  }
`;

const FRAG = /* glsl */ `
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uSoft);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

export interface SpawnOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  // colour ramp: start -> end (rgb may exceed 1)
  r: number;
  g: number;
  b: number;
  r2?: number;
  g2?: number;
  b2?: number;
  alpha?: number;
  drag?: number;
  gravity?: number;
  curl?: number; // sideways wobble
}

export class ParticlePool {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private a0: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private curl: Float32Array;
  private seed: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  alive = 0;

  constructor(n: number, additive: boolean, soft = 1.6) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.age = new Float32Array(n).fill(1e9);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.c0 = new Float32Array(n * 3);
    this.c1 = new Float32Array(n * 3);
    this.a0 = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1000;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
  }

  setScale(viewportHeightPx: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  spawn(o: SpawnOpts): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0;
    this.vel[i * 3 + 1] = o.vy ?? 0;
    this.vel[i * 3 + 2] = o.vz ?? 0;
    this.life[i] = o.life;
    this.age[i] = 0;
    this.s0[i] = o.size;
    this.s1[i] = o.sizeEnd ?? o.size;
    this.c0[i * 3] = o.r;
    this.c0[i * 3 + 1] = o.g;
    this.c0[i * 3 + 2] = o.b;
    this.c1[i * 3] = o.r2 ?? o.r;
    this.c1[i * 3 + 1] = o.g2 ?? o.g;
    this.c1[i * 3 + 2] = o.b2 ?? o.b;
    this.a0[i] = o.alpha ?? 1;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.curl[i] = o.curl ?? 0;
    this.seed[i] = Math.random() * 100;
  }

  update(dt: number, time: number): void {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) {
        if (this.size[i] !== 0) {
          this.size[i] = 0;
          this.col[i * 4 + 3] = 0;
        }
        continue;
      }
      alive++;
      this.age[i] += dt;
      const t = Math.min(1, this.age[i] / this.life[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      const c = this.curl[i];
      const sd = this.seed[i];
      this.vel[i * 3] = this.vel[i * 3] * dr + Math.sin(time * 3.1 + sd) * c * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr + this.grav[i] * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * dr + Math.cos(time * 2.7 + sd * 1.3) * c * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      this.col[i * 4 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      this.col[i * 4 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      // fade in fast, out slow
      const fin = Math.min(1, t * 8);
      this.col[i * 4 + 3] = this.a0[i] * fin * (1 - t) * (1 - t * 0.3);
    }
    this.alive = alive;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.age.fill(1e9);
  }
}

/** Fire recipes shared by hearth, torch and effects. */
export class FireFx {
  readonly add: ParticlePool;
  readonly smoke: ParticlePool;
  constructor() {
    this.add = new ParticlePool(2600, true, 1.5);
    this.smoke = new ParticlePool(900, false, 1.2);
  }

  /** One frame of flame from a source; `power` 0..1+ scales size and count. */
  flame(x: number, y: number, z: number, power: number, dt: number, spread = 0.45): void {
    const n = Math.floor(70 * power * dt) + (Math.random() < (70 * power * dt) % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * spread * (0.6 + 0.4 * power);
      const hot = Math.random();
      this.add.spawn({
        x: x + Math.cos(a) * rr,
        y: y + Math.random() * 0.15,
        z: z + Math.sin(a) * rr,
        vx: -Math.cos(a) * rr * 0.6,
        vy: 1.6 + Math.random() * 1.8 * (0.5 + power),
        vz: -Math.sin(a) * rr * 0.6,
        life: 0.45 + Math.random() * 0.5,
        size: (0.9 + Math.random() * 0.7) * (0.5 + power * 0.7),
        sizeEnd: 0.15,
        r: 5.5 + hot * 3,
        g: 2.6 + hot * 1.6,
        b: 0.7 + hot * 0.5,
        r2: 1.6,
        g2: 0.18,
        b2: 0.03,
        alpha: 0.75,
        drag: 0.8,
        gravity: 1.2,
        curl: 2.5,
      });
    }
    // embers
    if (Math.random() < power * dt * 9) {
      this.add.spawn({
        x: x + (Math.random() - 0.5) * spread,
        y: y + 0.4,
        z: z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 2 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 1.2,
        life: 1.6 + Math.random() * 1.8,
        size: 0.09,
        sizeEnd: 0.03,
        r: 9,
        g: 3.2,
        b: 0.6,
        r2: 3,
        g2: 0.5,
        b2: 0.05,
        alpha: 1,
        drag: 0.5,
        gravity: 0.3,
        curl: 4,
      });
    }
    // smoke
    if (Math.random() < power * dt * 6) {
      this.smoke.spawn({
        x: x + (Math.random() - 0.5) * spread,
        y: y + 1.2 + power,
        z: z + (Math.random() - 0.5) * spread,
        vy: 1.1,
        life: 2.4,
        size: 1.2,
        sizeEnd: 3.2,
        r: 0.03,
        g: 0.025,
        b: 0.03,
        alpha: 0.35,
        drag: 0.3,
        curl: 1,
      });
    }
  }

  burst(x: number, y: number, z: number, n: number, speed: number, hot = 1, size = 0.12): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.2) * 1.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * Math.cos(e) * s,
        vy: Math.sin(e) * s + 1,
        vz: Math.sin(a) * Math.cos(e) * s,
        life: 0.35 + Math.random() * 0.5,
        size: size * (0.7 + Math.random()),
        sizeEnd: 0.02,
        r: 8 * hot,
        g: 3 * hot,
        b: 0.6 * hot,
        r2: 2,
        g2: 0.3,
        b2: 0.05,
        drag: 2.5,
        gravity: -6,
      });
    }
  }

  /** Dark smoke puff where a shade dies or rises. */
  puff(x: number, y: number, z: number, n: number, scale = 1, burnGlow = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.5 + Math.random() * 1.6) * scale;
      this.smoke.spawn({
        x: x + Math.cos(a) * 0.2 * scale,
        y: y + Math.random() * 0.8 * scale,
        z: z + Math.sin(a) * 0.2 * scale,
        vx: Math.cos(a) * s,
        vy: 0.8 + Math.random() * 1.4,
        vz: Math.sin(a) * s,
        life: 0.9 + Math.random() * 0.8,
        size: 0.7 * scale,
        sizeEnd: 1.9 * scale,
        r: 0.012,
        g: 0.008,
        b: 0.02,
        alpha: 0.85,
        drag: 2,
        curl: 1.5,
      });
    }
    if (burnGlow > 0) this.burst(x, y + 0.6, z, Math.round(10 * burnGlow), 3.5, 1, 0.1);
  }

  update(dt: number, time: number): void {
    this.add.update(dt, time);
    this.smoke.update(dt, time);
  }
}
