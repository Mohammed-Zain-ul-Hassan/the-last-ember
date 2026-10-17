import * as THREE from 'three';

// The Still City's rain (open districts): built to read as rain at a glance and to cost almost nothing.
//   streaks   two layers of soft, tapered quads, turned to face the camera about their fall line: a near layer (fewer,
//             longer, brighter) and a far one (many, thin). Every drop has its own speed, length and brightness, falls
//             slanted by the wind, and lives in a box that tiles the world around the camera, so the cost never grows
//             with the district. Cool in the moonlight; warm where the flame is near.
//   splashes  little rings blooming on the ground around him, each at a new place every time.
//   veil      far rain: a faint, scrolling band of streaks at a distance, behind the walls' tops.
// None of it casts or receives shadows; all of it is drawn after the scene, additive, without writing depth.

const STREAK_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  uniform float uBox;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uLen;
  uniform float uWidth;
  uniform vec2 uWind;
  uniform vec4 uFlame; // xyz, reach
  uniform vec4 uShelter[4]; // x0, z0, x1, z1 (dry under a vault)
  uniform float uShelterY[4];
  attribute vec4 aSeed;
  varying vec2 vUv;
  varying float vA;
  varying float vFire;
  void main() {
    // where this drop's column stands: the copy of it nearest the camera
    float bx = aSeed.x * uBox;
    float bz = aSeed.y * uBox;
    vec3 head;
    head.x = bx + uBox * floor((uCam.x - bx) / uBox + 0.5);
    head.z = bz + uBox * floor((uCam.z - bz) / uBox + 0.5);
    float speed = uSpeed * (0.8 + aSeed.z * 0.45);
    head.y = fract(aSeed.w - uTime * speed / uHeight) * uHeight - 0.3;
    vec3 dir = normalize(vec3(uWind.x, -speed, uWind.y));
    float len = uLen * (0.6 + aSeed.z * 0.8);
    vec3 tail = head - dir * len;
    // turn the quad to face the camera about its own fall line
    vec3 toCam = normalize(uCam - head);
    vec3 side = normalize(cross(dir, toCam)) * uWidth * (0.7 + aSeed.w * 0.6);
    vec3 p = mix(head, tail, position.y) + side * position.x;
    float hidden = step(head.y, 0.0);
    for (int i = 0; i < 4; i++) {
      vec4 r = uShelter[i];
      if (head.x > r.x && head.x < r.z && head.z > r.y && head.z < r.w && head.y < uShelterY[i]) hidden = 1.0;
    }
    float d = distance(head, uCam);
    vA = (1.0 - hidden) * smoothstep(2.2, 5.0, d) * smoothstep(uBox * 0.5, uBox * 0.3, d) * (0.45 + 0.55 * aSeed.z);
    vFire = smoothstep(uFlame.w, 0.0, distance(head, uFlame.xyz));
    vUv = vec2(position.x * 2.0, position.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const STREAK_FRAG = /* glsl */ `
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vA;
  varying float vFire;
  void main() {
    if (vA <= 0.002) discard;
    // soft across, bright at the head and fading along the tail (motion blur)
    float across = 1.0 - vUv.x * vUv.x;
    float along = pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.08, 1.0 - abs(vUv.y - 0.04));
    float a = across * along * vA * uOpacity;
    vec3 c = uCool + uWarm * vFire * vFire;
    gl_FragColor = vec4(c * a, 1.0);
  }`;

const SPLASH_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec4 uFlame;
  uniform vec4 uShelter[4];
  uniform float uShelterY[4];
  attribute vec4 aSeed;
  varying vec2 vUv;
  varying float vT;
  varying float vFire;
  varying float vA;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float rate = 0.7 + aSeed.z * 0.5;
    float k = uTime * rate + aSeed.w;
    float cycle = floor(k);
    vT = fract(k);
    // a new place each cycle, scattered round him
    float ang = hash(cycle * 12.9898 + aSeed.x * 78.233) * 6.2831;
    float rad = sqrt(hash(cycle * 39.346 + aSeed.y * 11.135)) * 9.0;
    vec3 c = vec3(uCam.x + cos(ang) * rad, 0.03, uCam.z + sin(ang) * rad);
    float hidden = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 r = uShelter[i];
      if (c.x > r.x && c.x < r.z && c.z > r.y && c.z < r.w && uShelterY[i] > 0.0) hidden = 1.0;
    }
    float s = 0.03 + vT * 0.11;
    vec3 p = c + vec3(position.x, 0.0, position.y) * s;
    vUv = position.xy * 2.0;
    vFire = smoothstep(uFlame.w, 0.0, distance(c, uFlame.xyz));
    vA = (1.0 - hidden) * smoothstep(9.0, 4.0, rad);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const SPLASH_FRAG = /* glsl */ `
  uniform vec3 uCool;
  uniform vec3 uWarm;
  varying vec2 vUv;
  varying float vT;
  varying float vFire;
  varying float vA;
  void main() {
    float r = length(vUv);
    float ring = smoothstep(0.22, 0.0, abs(r - 0.7)) * (1.0 - vT) * (1.0 - vT) * 0.45;
    float a = ring * vA;
    if (a <= 0.002) discard;
    gl_FragColor = vec4((uCool * 1.2 + uWarm * vFire * 0.8) * a, 1.0);
  }`;

const VEIL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uCool;
  varying vec2 vUv;
  void main() {
    vec2 uv = vec2(vUv.x * 18.0, vUv.y * 2.0 + uTime * 0.7);
    float s = texture2D(uMap, uv).r * 0.7 + texture2D(uMap, uv * vec2(1.7, 0.6) + vec2(0.3, uTime * 0.4)).r * 0.5;
    float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
    gl_FragColor = vec4(uCool * s * fade * uOpacity, 1.0);
  }`;
const VEIL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

function streakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const l = 18 + Math.random() * 40;
    const grd = g.createLinearGradient(x, y, x - 3, y + l);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grd;
    g.lineWidth = Math.random() < 0.3 ? 1.5 : 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 3, y + l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function seeds(n: number): THREE.InstancedBufferAttribute {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = Math.random();
  return new THREE.InstancedBufferAttribute(a, 4);
}

export class StillRain {
  readonly group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  private veil: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private shared = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uFlame: { value: new THREE.Vector4(0, -100, 0, 1) },
    uWind: { value: new THREE.Vector2(0.45, 0.16) },
    uShelter: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uShelterY: { value: [-100, -100, -100, -100] },
    uCool: { value: new THREE.Color(0.15, 0.18, 0.26) },
    uWarm: { value: new THREE.Color(1.9, 0.95, 0.38) },
  };

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1, 1, 1);
    quad.translate(0, 0.5, 0); // x -0.5..0.5 across, y 0 (head) .. 1 (tail)
    const layer = (n: number, box: number, len: number, width: number, opacity: number) => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.attributes.position);
      g.setAttribute('aSeed', seeds(n));
      g.instanceCount = n;
      const m = new THREE.ShaderMaterial({
        vertexShader: STREAK_VERT,
        fragmentShader: STREAK_FRAG,
        uniforms: { ...this.shared, uBox: { value: box }, uHeight: { value: 14 }, uSpeed: { value: 7 }, uLen: { value: len }, uWidth: { value: width }, uOpacity: { value: opacity } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.mats.push(m);
      this.group.add(mesh);
    };
    // a calm, steady rain (Moeez): few drops, falling slowly, short and soft
    layer(850, 18, 0.42, 0.012, 0.42); // near
    layer(2400, 44, 0.3, 0.022, 0.26); // far
    // splashes on the ground
    const flat = new THREE.PlaneGeometry(1, 1);
    const sg = new THREE.InstancedBufferGeometry();
    sg.index = flat.index;
    sg.setAttribute('position', flat.attributes.position);
    sg.setAttribute('aSeed', seeds(150));
    sg.instanceCount = 150;
    const sm = new THREE.ShaderMaterial({ vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, uniforms: this.shared, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const splashes = new THREE.Mesh(sg, sm);
    splashes.frustumCulled = false;
    splashes.renderOrder = 5;
    this.mats.push(sm);
    this.group.add(splashes);
    // the far veil: a band of rain round the view, drawn behind whatever stands nearer
    const vm = new THREE.ShaderMaterial({ vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG, uniforms: { uMap: { value: streakTexture() }, uTime: this.shared.uTime, uOpacity: { value: 0.08 }, uCool: this.shared.uCool }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false });
    this.veil = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 18, 32, 1, true), vm);
    this.veil.frustumCulled = false;
    this.veil.renderOrder = 4;
    this.group.add(this.veil);
    this.group.visible = false;
    this.group.userData.noWarm = true;
  }

  /** Dry places (a vault over a passage): up to four rects with the height under which no rain falls. */
  setShelters(rects: { x0: number; z0: number; x1: number; z1: number; y: number }[]): void {
    for (let i = 0; i < 4; i++) {
      const r = rects[i];
      this.shared.uShelter.value[i].set(r?.x0 ?? 0, r?.z0 ?? 0, r?.x1 ?? 0, r?.z1 ?? 0);
      this.shared.uShelterY.value[i] = r ? r.y : -100;
    }
  }

  set on(v: boolean) {
    this.group.visible = v;
  }

  update(t: number, cam: THREE.Vector3, flame: THREE.Vector3, reach: number): void {
    if (!this.group.visible) return;
    this.shared.uTime.value = t;
    this.shared.uCam.value.copy(cam);
    this.shared.uFlame.value.set(flame.x, flame.y, flame.z, Math.max(0.5, reach * 0.55));
    this.veil.position.set(cam.x, 6, cam.z);
  }
}
