import * as THREE from 'three';

// The edge of the firelight, drawn on the ground: the game's one rule (shades rise in the dark, burn in the light)
// made visible. A thin warm line with slow embers running round it, a soft glow on its dark side; it breathes with
// the flame and fades as the fire weakens.

const VERT = /* glsl */ `
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
  uniform float uT; uniform float uA; uniform float uR; uniform float uS;
  varying vec2 vP;
  void main() {
    float r = length(vP) * uS; // metres
    float d = (r - uR);
    // a crisp line with a soft glow outside it (the dark side) and a faint warm fill just inside
    float line = exp(-d * d / 0.006);
    float glow = exp(-max(d, 0.0) * 3.0) * step(0.0, d) * 0.22 + exp(-max(-d, 0.0) * 1.6) * step(d, 0.0) * 0.08;
    float a = atan(vP.y, vP.x);
    float run = 0.65 + 0.35 * sin(a * 18.0 - uT * 1.2) * sin(a * 7.0 + uT * 0.7);
    float v = (line * run + glow) * uA;
    gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * v * 1.6, v);
  }`;

export class LightRing {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private a = 0;

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uT: { value: 0 }, uA: { value: 0 }, uR: { value: 1 }, uS: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  /** x/z/radius of the light, the floor height under its centre, whether it should show at all. */
  update(t: number, dt: number, x: number, y: number, z: number, radius: number, on: boolean, strength: number): void {
    this.a += ((on ? 1 : 0) - this.a) * Math.min(1, dt * 3);
    const u = this.mesh.material.uniforms;
    u.uA.value = this.a * (0.55 + 0.45 * strength) * (0.92 + 0.08 * Math.sin(t * 2.3));
    // the geometry spans a little past the line so the outer glow fits
    const span = radius + 1.6;
    this.mesh.scale.set(span, span, 1);
    u.uS.value = span;
    u.uR.value = radius;
    u.uT.value = t;
    this.mesh.position.set(x, y + 0.03, z);
    this.mesh.visible = this.a > 0.01;
  }
}
