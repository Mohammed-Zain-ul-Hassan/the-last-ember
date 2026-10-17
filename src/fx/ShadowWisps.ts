import * as THREE from 'three';
import { SHADOW } from '../config';

/**
 * Pooled smoke particles streaming off the shadow body: dark wisps that drift up and lag
 * behind as you move, plus the odd ember. Simulated on the CPU (a few hundred points).
 */
export class ShadowWisps {
  readonly points: THREE.Points;
  private readonly count: number;
  private readonly emberChance: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly ember: Float32Array;
  private readonly scale: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly uniforms = {
    uScale: { value: 400 },
    uSmoke: { value: new THREE.Color(SHADOW.wispColor) },
    uEmber: { value: new THREE.Color(SHADOW.emberColor) },
  };
  private next = 0;
  private carry = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    opts: { count?: number; smokeColor?: number; emberColor?: number; emberChance?: number } = {},
  ) {
    const n = (this.count = opts.count ?? SHADOW.wispCount);
    this.emberChance = opts.emberChance ?? SHADOW.emberChance;
    if (opts.smokeColor !== undefined) this.uniforms.uSmoke.value.setHex(opts.smokeColor);
    if (opts.emberColor !== undefined) this.uniforms.uEmber.value.setHex(opts.emberColor);
    this.scale = new Float32Array(n).fill(1);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1);
    this.life = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.ember = new Float32Array(n);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aEmber', new THREE.BufferAttribute(this.ember, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aEmber;
        varying float vAlpha;
        varying float vEmber;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          // Never let smoke fill the lens.
          vAlpha = aAlpha * smoothstep(${SHADOW.wispNearStart.toFixed(2)}, ${SHADOW.wispNearEnd.toFixed(2)}, dist);
          vEmber = aEmber;
          gl_PointSize = min(aSize * uScale / max(dist, 0.05), 160.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSmoke;
        uniform vec3 uEmber;
        varying float vAlpha;
        varying float vEmber;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          if (r > 1.0 || vAlpha <= 0.001) discard;
          float soft = pow(1.0 - r, mix(1.6, 3.0, vEmber));
          vec3 col = mix(uSmoke, uEmber * 2.2, vEmber);
          gl_FragColor = vec4(col, soft * vAlpha);
          #include <colorspace_fragment>
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  /** Viewport height in pixels and vertical FOV, so sprite sizes are in world metres. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /**
   * @param sources bones to emit from
   * @param bodyVelocity world velocity of the body (wisps inherit a little and lag behind)
   * @param burst extra particles to spawn this frame (slide start, landing)
   */
  update(dt: number, sources: THREE.Object3D[], bodyVelocity: THREE.Vector3, speed: number, burst = 0): void {
    if (dt <= 0) return;
    if (sources.length > 0) {
      this.carry += dt * (SHADOW.wispRate + SHADOW.wispRatePerSpeed * speed);
      let spawn = Math.floor(this.carry) + burst;
      this.carry -= Math.floor(this.carry);
      while (spawn-- > 0) {
        sources[(Math.random() * sources.length) | 0].getWorldPosition(this.tmp);
        this.emitAt(this.tmp, bodyVelocity, 1);
      }
    }

    const [s0, s1] = SHADOW.wispSize;
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = Math.min(this.age[i] / this.life[i], 1);
      const k = i * 3;
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag + 0.5 * dt;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const ember = this.ember[i];
      this.size[i] = (ember > 0 ? 0.035 * (1 - t) : THREE.MathUtils.lerp(s0, s1, Math.sqrt(t))) * this.scale[i];
      // Quick fade in, long fade out.
      this.alpha[i] = Math.min(1, t * 8) * (1 - t) * (ember > 0 ? 1 : 0.9);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aEmber.needsUpdate = true;
  }

  /**
   * Spawns `count` particles around `pos`.
   * @param inherit share of `velocity` the smoke keeps (it lags behind moving sources)
   * @param spread jitter radius (m) of the spawn point; `burst` adds an outward kick (m/s)
   */
  emitAt(
    pos: THREE.Vector3,
    velocity: THREE.Vector3,
    count: number,
    opts: { inherit?: number; spread?: number; burst?: number; scale?: number; life?: number } = {},
  ): void {
    const inherit = opts.inherit ?? 0.35;
    const spread = opts.spread ?? 0.06;
    const burst = opts.burst ?? 0;
    const [l0, l1] = SHADOW.wispLife;
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const k = i * 3;
      // Random direction for the jitter / burst kick.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const dx = r * Math.cos(a);
      const dy = u;
      const dz = r * Math.sin(a);
      const j = spread * Math.cbrt(Math.random());
      this.pos[k] = pos.x + dx * j;
      this.pos[k + 1] = pos.y + dy * j;
      this.pos[k + 2] = pos.z + dz * j;
      const kick = burst * (0.5 + Math.random() * 0.5);
      this.vel[k] = velocity.x * inherit + (Math.random() - 0.5) * 0.5 + dx * kick;
      this.vel[k + 1] = 0.15 + Math.random() * 0.35 + dy * kick;
      this.vel[k + 2] = velocity.z * inherit + (Math.random() - 0.5) * 0.5 + dz * kick;
      this.age[i] = 0;
      this.life[i] = THREE.MathUtils.lerp(l0, l1, Math.random()) * (opts.life ?? 1);
      this.scale[i] = opts.scale ?? 1;
      this.ember[i] = Math.random() < this.emberChance ? 1 : 0;
    }
  }
}
