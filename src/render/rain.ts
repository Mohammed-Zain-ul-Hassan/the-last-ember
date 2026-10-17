import * as THREE from 'three';

// Rain: thousands of streaks drawn as line segments, animated entirely in the vertex shader. Every drop has a fixed
// place in a box that tiles the world, and each frame the copy nearest the camera is drawn, so the rain stays put
// as you move through it. Drops near the fire catch its light; none fall under the hearth's roof.

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uLen;
  uniform float uAmount;
  uniform float uBox;
  uniform float uHeight;
  uniform vec3 uCam;
  uniform vec2 uWind;
  uniform vec4 uShelter; // x0, z0, x1, z1
  uniform float uShelterY;
  uniform vec4 uLight; // xyz, radius
  uniform vec3 uStill; // xz of the fire, radius inside which time has stopped (z = 0: nowhere)
  uniform float uStillAll; // 1: time has stopped everywhere (the loop closes)
  attribute vec3 aSeed;
  attribute float aEnd;
  varying float vA;
  varying float vFire;
  void main() {
    if (aSeed.z > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    vec3 p;
    float bx = aSeed.x * uBox;
    float bz = fract(aSeed.x * 7.13 + aSeed.y * 3.7) * uBox;
    p.x = bx + uBox * floor((uCam.x - bx) / uBox + 0.5);
    p.z = bz + uBox * floor((uCam.z - bz) / uBox + 0.5);
    // inside the firelight time has stopped: those drops hang where they were (each column decides by where it stands,
    // so a drop never pops between falling and hanging)
    float still = max(uStillAll, step(distance(p.xz, uStill.xy), uStill.z));
    float fall = fract(aSeed.y - (still > 0.5 ? 0.0 : uTime) * uSpeed / uHeight * (0.85 + aSeed.z * 0.3));
    p.y = fall * uHeight - 1.0;
    bool hidden = p.y < 0.0 || (p.x > uShelter.x && p.x < uShelter.z && p.z > uShelter.y && p.z < uShelter.w && p.y < uShelterY);
    // the streak's tail points back along its fall, slanted by the wind
    p += aEnd * vec3(-uWind.x, uSpeed, -uWind.y) * (uLen / uSpeed) * (still > 0.5 ? 0.12 : 1.0); // a hanging drop is a bead
    float d = distance(p, uCam);
    // drops right at the lens fade out: with the camera pulled back they streaked across the whole fight
    vA = hidden ? 0.0 : (1.0 - aEnd * 0.85) * smoothstep(28.0, 8.0, d) * smoothstep(3.0, 7.0, d);
    vFire = smoothstep(uLight.w * 1.2, 0.0, distance(p.xz, uLight.xz)) * smoothstep(uLight.y + 6.0, 0.0, p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFireColor;
  uniform float uOpacity;
  varying float vA;
  varying float vFire;
  void main() {
    if (vA <= 0.001) discard;
    vec3 c = mix(uColor, uFireColor, vFire);
    gl_FragColor = vec4(c * vA * uOpacity, 1.0);
  }`;

export class Rain {
  readonly mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** 0..1 how hard it rains (eased by the caller). */
  level = 0;

  constructor(count = 9000) {
    const seeds = new Float32Array(count * 2 * 3);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const s = [Math.random(), Math.random(), Math.random()];
      for (let e = 0; e < 2; e++) {
        seeds.set(s, (i * 2 + e) * 3);
        ends[i * 2 + e] = e;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 15 },
        uLen: { value: 0.6 },
        uAmount: { value: 0 },
        uBox: { value: 36 },
        uHeight: { value: 18 },
        uCam: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector2(1.6, 0.6) },
        uShelter: { value: new THREE.Vector4(0, 0, 0, 0) },
        uShelterY: { value: -100 },
        uLight: { value: new THREE.Vector4(0, 2, 0, 10) },
        uStill: { value: new THREE.Vector3(0, 0, 0) },
        uStillAll: { value: 0 },
        uColor: { value: new THREE.Color(0.32, 0.36, 0.46) },
        uFireColor: { value: new THREE.Color(1.6, 0.75, 0.3) },
        uOpacity: { value: 0.42 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.LineSegments(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** A dry rectangle (x0, z0, x1, z1) under a roof at height y; pass null for none. */
  setShelter(rect: [number, number, number, number] | null, y = 0): void {
    const u = this.mesh.material.uniforms;
    if (!rect) {
      u.uShelterY.value = -100;
      return;
    }
    (u.uShelter.value as THREE.Vector4).set(...rect);
    u.uShelterY.value = y;
  }

  /** Where time stands still: drops inside (x, z, radius) hang in the air; all = everywhere. */
  setStill(x: number, z: number, radius: number, all = 0): void {
    const u = this.mesh.material.uniforms;
    (u.uStill.value as THREE.Vector3).set(x, z, radius);
    u.uStillAll.value = all;
  }

  update(t: number, cam: THREE.Vector3, light: { x: number; y: number; z: number; radius: number; on: boolean }): void {
    const u = this.mesh.material.uniforms;
    u.uTime.value = t;
    (u.uCam.value as THREE.Vector3).copy(cam);
    u.uAmount.value = Math.min(1, this.level);
    (u.uLight.value as THREE.Vector4).set(light.x, light.y, light.z, light.on ? light.radius * 0.7 : 0.001);
    this.mesh.visible = this.level > 0.01;
  }
}
