import * as THREE from 'three';

// CPU-simulated point particles in one draw call per system. Colours may exceed 1 so bloom picks them up.
export interface EmitOpts {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  spread?: number; // random velocity added on each axis
  life: number;
  size: number;
  sizeEnd?: number;
  r: number;
  g: number;
  b: number;
  alpha?: number;
  gravity?: number; // m/s^2, negative rises
  drag?: number;
  wobble?: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
  }`;

const FRAG = /* glsl */ `
  uniform float uAdditive;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = uAdditive > 0.5 ? vec4(vColor * a, 1.0) : vec4(vColor, a);
  }`;

export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private count = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private alpha0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private wob: Float32Array;
  private mat: THREE.ShaderMaterial;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.wob = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
  }

  setScale(viewportHeightPx: number, fovDeg: number): void {
    this.mat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  get alive(): number {
    return this.count;
  }

  emit(o: EmitOpts): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    const s = o.spread ?? 0;
    const i3 = i * 3;
    this.pos[i3] = o.x;
    this.pos[i3 + 1] = o.y;
    this.pos[i3 + 2] = o.z ?? 0;
    this.vel[i3] = (o.vx ?? 0) + (Math.random() - 0.5) * 2 * s;
    this.vel[i3 + 1] = (o.vy ?? 0) + (Math.random() - 0.5) * 2 * s;
    this.vel[i3 + 2] = (o.vz ?? 0) + (Math.random() - 0.5) * 2 * s;
    this.col[i3] = o.r;
    this.col[i3 + 1] = o.g;
    this.col[i3 + 2] = o.b;
    this.life[i] = 0;
    this.maxLife[i] = o.life * (0.75 + Math.random() * 0.5);
    this.size0[i] = o.size;
    this.size1[i] = o.sizeEnd ?? o.size * 0.2;
    this.alpha0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.wob[i] = o.wobble ?? 0;
  }

  update(dt: number, t: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const k = this.life[i] / this.maxLife[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      const w = this.wob[i] ? Math.sin(t * 6 + i * 1.7) * this.wob[i] : 0;
      this.pos[i3] += (this.vel[i3] + w) * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      // quick fade in, smooth fade out
      this.alpha[i] = this.alpha0[i] * Math.min(1, k * 8) * (1 - k * k);
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    const i3 = i * 3;
    const l3 = last * 3;
    for (let a = 0; a < 3; a++) {
      this.pos[i3 + a] = this.pos[l3 + a];
      this.vel[i3 + a] = this.vel[l3 + a];
      this.col[i3 + a] = this.col[l3 + a];
    }
    this.size[i] = this.size[last];
    this.alpha[i] = this.alpha[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size0[i] = this.size0[last];
    this.size1[i] = this.size1[last];
    this.alpha0[i] = this.alpha0[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.wob[i] = this.wob[last];
  }
}
