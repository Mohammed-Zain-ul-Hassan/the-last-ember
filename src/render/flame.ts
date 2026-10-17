import * as THREE from 'three';
import { PULL_GLSL } from './depth';

// Shader flame: fbm-distorted teardrop on camera-facing quads, layered for volume. Additive, HDR so it blooms.
const VERT = /* glsl */ `
  uniform float uDepthPull;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    ${PULL_GLSL}
  }`;

const FRAG = /* glsl */ `
  uniform float uTime; uniform float uStrength; uniform float uSeed; uniform float uHeat; uniform vec3 uTint; uniform float uCold;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.5 + uSeed;
    float n = fbm(vec2(uv.x * 2.6 + uSeed, uv.y * 2.4 - t * 1.6));
    float n2 = fbm(vec2(uv.x * 6.0 + 3.1, uv.y * 5.5 - t * 2.6));
    float x = (uv.x - 0.5) * 2.0;
    x += (n - 0.5) * 1.1 * pow(uv.y, 1.2);
    float width = mix(0.8, 0.02, pow(uv.y, 0.75)) * (0.7 + 0.6 * n2);
    float body = smoothstep(width, width * 0.15, abs(x));
    float h = smoothstep(1.0, 0.2, uv.y + (n2 - 0.5) * 0.5) * smoothstep(0.0, 0.1, uv.y);
    float f = body * h;
    // tongues breaking off near the top
    f *= smoothstep(0.25, 0.55, n + 0.35 * (1.0 - uv.y));
    vec3 col = mix(vec3(1.2, 0.12, 0.02), vec3(3.0, 0.95, 0.16), smoothstep(0.1, 0.5, f));
    col = mix(col, vec3(4.2, 3.0, 1.4) * uHeat, smoothstep(0.55, 0.95, f));
    // shadow fire: violet-black flames (the knight's aura)
    vec3 cold = mix(vec3(0.18, 0.02, 0.45), vec3(0.75, 0.3, 2.2), smoothstep(0.15, 0.6, f));
    cold = mix(cold, vec3(1.6, 1.2, 3.4), smoothstep(0.75, 1.0, f));
    col = mix(col, cold, uCold);
    col *= uTint;
    float a = smoothstep(0.03, 0.35, f) * uStrength;
    gl_FragColor = vec4(col * a, 1.0);
  }`;

export class Flame {
  readonly group = new THREE.Group();
  private layers: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  strength = 1;
  opacity = 1;

  /** width/height in metres; the flame's base sits at the group origin. pull: depth pull (the knight's torch). */
  constructor(width: number, height: number, layers = 3, tint = new THREE.Color(1, 1, 1), cold = false, pull = { value: 0 }) {
    for (let i = 0; i < layers; i++) {
      const k = layers === 1 ? 1 : 1 - i * 0.22;
      const geo = new THREE.PlaneGeometry(width * (1.1 - i * 0.18), height * k, 1, 1);
      geo.translate(0, (height * k) / 2, 0);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uStrength: { value: 1 },
          uSeed: { value: i * 7.31 + Math.random() * 3 },
          uHeat: { value: 0.8 + i * 0.25 },
          uTint: { value: tint },
          uCold: { value: cold ? 1 : 0 },
          uDepthPull: pull,
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.z = 0.02 * i;
      m.renderOrder = 11 + i;
      this.layers.push(m);
      this.group.add(m);
    }
  }

  update(t: number, camera: THREE.Camera): void {
    // cylindrical billboard: turn to face the camera around Y only
    const wp = this.group.getWorldPosition(_v);
    const yaw = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
    const parentYaw = this.group.parent ? this.group.parent.getWorldQuaternion(_q) : null;
    this.group.rotation.y = yaw;
    if (parentYaw) {
      // cancel the parent's rotation so the flame always faces the camera
      _e.setFromQuaternion(parentYaw, 'YXZ');
      this.group.rotation.y = yaw - _e.y;
    }
    const s = Math.max(0, this.strength);
    this.group.scale.set(0.55 + 0.45 * s, 0.35 + 0.65 * s, 1);
    this.group.visible = s > 0.01;
    for (const l of this.layers) {
      l.material.uniforms.uTime.value = t;
      l.material.uniforms.uStrength.value = Math.min(1, s * 1.4) * this.opacity;
    }
  }
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
