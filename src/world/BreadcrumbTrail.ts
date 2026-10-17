import * as THREE from 'three';
import { RECALL, TRAIL } from '../config';
import type { RecallSystem } from '../player/RecallSystem';

// #00f0ff written straight to the framebuffer (shaders below skip color-space conversion).
const CYAN = new THREE.Vector3(0, 240 / 255, 1);

const ribbonVertex = /* glsl */ `
  attribute float aAge;
  varying float vAge;
  void main() {
    vAge = aAge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAge;
  void main() {
    float life = clamp(1.0 - vAge, 0.0, 1.0);
    float a = life * life * 0.9;
    vec3 c = mix(uColor, vec3(1.0), life * 0.35);
    gl_FragColor = vec4(c, a);
  }
`;

const pointsVertex = /* glsl */ `
  attribute float aAge;
  uniform float uSize;
  uniform float uScale;
  varying float vAge;
  void main() {
    vAge = aAge;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const pointsFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAge;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float life = clamp(1.0 - vAge, 0.0, 1.0);
    float soft = smoothstep(0.5, 0.0, r);
    float a = life * life * soft;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), soft * 0.5), a);
  }
`;

/**
 * Glowing cyan ribbon (two crossed strips so it reads from any angle) plus particle dots
 * along the last 3 seconds of recorded positions, faded by snapshot age.
 */
export class BreadcrumbTrail {
  private readonly maxPoints = RECALL.bufferCapacity;
  private readonly ribbonPos: Float32Array;
  private readonly ribbonAge: Float32Array;
  private readonly ribbonGeo = new THREE.BufferGeometry();
  private readonly dotPos: Float32Array;
  private readonly dotAge: Float32Array;
  private readonly dotGeo = new THREE.BufferGeometry();
  private readonly dotMat: THREE.ShaderMaterial;

  private readonly tmpP = new THREE.Vector3();
  private readonly tmpTangent = new THREE.Vector3();
  private readonly side = new THREE.Vector3(1, 0, 0);

  constructor(scene: THREE.Scene) {
    // Ribbon: 4 vertices per point (vertical pair + horizontal pair).
    this.ribbonPos = new Float32Array(this.maxPoints * 4 * 3);
    this.ribbonAge = new Float32Array(this.maxPoints * 4);
    const indices: number[] = [];
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      indices.push(a, a + 1, b, a + 1, b + 1, b); // vertical strip
      indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); // horizontal strip
    }
    this.ribbonGeo.setIndex(indices);
    this.ribbonGeo.setAttribute('position', new THREE.BufferAttribute(this.ribbonPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.ribbonGeo.setAttribute('aAge', new THREE.BufferAttribute(this.ribbonAge, 1).setUsage(THREE.DynamicDrawUsage));
    this.ribbonGeo.setDrawRange(0, 0);

    const ribbonMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: CYAN } },
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(this.ribbonGeo, ribbonMat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 10;
    scene.add(ribbon);

    // Particle dots.
    const maxDots = Math.ceil(this.maxPoints / TRAIL.particleEvery) + 1;
    this.dotPos = new Float32Array(maxDots * 3);
    this.dotAge = new Float32Array(maxDots);
    this.dotGeo.setAttribute('position', new THREE.BufferAttribute(this.dotPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dotGeo.setAttribute('aAge', new THREE.BufferAttribute(this.dotAge, 1).setUsage(THREE.DynamicDrawUsage));
    this.dotGeo.setDrawRange(0, 0);
    this.dotMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: CYAN },
        uSize: { value: TRAIL.particleSize },
        uScale: { value: 500 },
      },
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dots = new THREE.Points(this.dotGeo, this.dotMat);
    dots.frustumCulled = false;
    dots.renderOrder = 11;
    scene.add(dots);
  }

  /** World-size -> pixel scale for the point sprites; call on resize / FOV change. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.dotMat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(recall: RecallSystem, now: number): void {
    const n = recall.visibleCount;
    const ref = recall.referenceTime(now);
    const hw = TRAIL.halfWidth;
    const lift = TRAIL.heightOffset;

    let dotCount = 0;
    for (let i = 0; i < n; i++) {
      const snap = recall.at(i);
      const age = THREE.MathUtils.clamp((ref - snap.time) / RECALL.historyMs, 0, 1);

      // Horizontal side vector perpendicular to local travel direction.
      const prev = recall.at(Math.max(0, i - 1)).position;
      const next = recall.at(Math.min(n - 1, i + 1)).position;
      this.tmpTangent.subVectors(next, prev).setY(0);
      if (this.tmpTangent.lengthSq() > 1e-6) {
        this.side.set(-this.tmpTangent.z, 0, this.tmpTangent.x).normalize();
      }

      const p = this.tmpP.copy(snap.position);
      p.y += lift;
      const o = i * 12;
      this.ribbonPos[o] = p.x;
      this.ribbonPos[o + 1] = p.y + hw;
      this.ribbonPos[o + 2] = p.z;
      this.ribbonPos[o + 3] = p.x;
      this.ribbonPos[o + 4] = p.y - hw;
      this.ribbonPos[o + 5] = p.z;
      this.ribbonPos[o + 6] = p.x + this.side.x * hw;
      this.ribbonPos[o + 7] = p.y;
      this.ribbonPos[o + 8] = p.z + this.side.z * hw;
      this.ribbonPos[o + 9] = p.x - this.side.x * hw;
      this.ribbonPos[o + 10] = p.y;
      this.ribbonPos[o + 11] = p.z - this.side.z * hw;
      const a = i * 4;
      this.ribbonAge[a] = this.ribbonAge[a + 1] = this.ribbonAge[a + 2] = this.ribbonAge[a + 3] = age;

      if (i % TRAIL.particleEvery === 0) {
        const d = dotCount * 3;
        this.dotPos[d] = p.x;
        this.dotPos[d + 1] = p.y;
        this.dotPos[d + 2] = p.z;
        this.dotAge[dotCount] = age;
        dotCount++;
      }
    }

    this.ribbonGeo.setDrawRange(0, Math.max(0, n - 1) * 12);
    this.ribbonGeo.attributes.position.needsUpdate = true;
    this.ribbonGeo.attributes.aAge.needsUpdate = true;
    this.dotGeo.setDrawRange(0, dotCount);
    this.dotGeo.attributes.position.needsUpdate = true;
    this.dotGeo.attributes.aAge.needsUpdate = true;
  }
}
