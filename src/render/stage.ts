import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { WALLS, type SkyKey } from '../data/chapters';
import { Rng } from '../sim/rng';
import { RIM, rimify } from './rim';
import { fogTexture, shaftTexture, tatterTexture } from './textures';

export const SILHOUETTE = 0x09080d;

const SKY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform float uGlowY; uniform float uTime; uniform float uDisc;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float y = vUv.y;
    vec3 c = mix(uHorizon, uTop, smoothstep(0.2, 0.8, y));
    vec2 p = vec2(vUv.x * 2.36, y);
    vec2 gp = vec2(0.62 * 2.36, 0.5 + uGlowY * 0.42);
    float d = distance(p, gp);
    c += uGlow * (exp(-d * 10.0) * 1.3 + exp(-d * 2.6) * 0.3);
    // sun / moon disc with a soft rim and faint surface detail
    if (uDisc > 0.0) {
      float disc = smoothstep(uDisc, uDisc * 0.92, d);
      float detail = 0.82 + 0.18 * noise((p - gp) * 38.0);
      c = mix(c, uGlow * 2.4 * detail, disc);
    }
    // long streaked clouds catching the light
    float cl = noise(vec2(vUv.x * 7.0 + uTime * 0.004, y * 46.0)) * noise(vec2(vUv.x * 2.0 - uTime * 0.002, y * 13.0));
    float band = smoothstep(0.28, 0.6, cl) * smoothstep(0.15, 0.35, y) * smoothstep(0.75, 0.45, y);
    c = mix(c, c * 0.55 + uGlow * 0.18, band * 0.7);
    gl_FragColor = vec4(c, 1.0);
  }`;

interface Banner {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  base: Float32Array;
  seed: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly world = new THREE.Group();
  private sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private fog: THREE.FogExp2;
  private moon: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly bloom: BloomEffect;
  private far = new THREE.Group(); // follows the camera like the sky
  private fogCards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private shafts: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private banners: Banner[] = [];
  private grassTime = { value: 0 };
  private cur: { top: THREE.Color; horizon: THREE.Color; glow: THREE.Color; fog: THREE.Color; glowY: number; stars: number; disc: number };
  dawn = 0; // 0..1 sunrise strength for the finale

  constructor(canvasParent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasParent.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 400);
    this.scene.add(this.world);
    this.scene.add(this.far);

    this.fog = new THREE.FogExp2(0x1b1730, 0.022);
    this.scene.fog = this.fog;

    this.cur = {
      top: new THREE.Color('#2a1b3d'), horizon: new THREE.Color('#e0794a'), glow: new THREE.Color('#ffb070'),
      fog: new THREE.Color('#3a2236'), glowY: -0.5, stars: 0, disc: 0.09,
    };

    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 220),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, fog: false,
        uniforms: {
          uTop: { value: this.cur.top }, uHorizon: { value: this.cur.horizon }, uGlow: { value: this.cur.glow },
          uGlowY: { value: 0 }, uTime: { value: 0 }, uDisc: { value: 0.09 },
        },
      }),
    );
    this.sky.position.set(0, 60, -150);
    this.sky.renderOrder = -10;
    this.far.add(this.sky);

    this.stars = this.makeStars();
    this.far.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0x6a5a9a, 0x0a0810, 0.18);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x9fb0ff, 0.6);
    this.moon.position.set(-8, 14, -20);
    this.scene.add(this.moon);

    // dawn sun: low, from the right, casting long shadows to the left
    this.sun = new THREE.DirectionalLight(0xffc89a, 0);
    this.sun.position.set(30, 6, 8);
    this.sun.target.position.set(0, 0, 0);
    this.sun.shadow.mapSize.set(2048, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 12;
    sc.bottom = -4;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildSkyline();
    this.buildRuins();
    this.buildStatues();
    this.buildBanners();
    this.buildGrass();
    this.buildAtmosphere();

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.85, luminanceSmoothing: 0.25, intensity: 1.15, radius: 0.7 });
    const grain = new NoiseEffect({ premultiply: true });
    grain.blendMode.opacity.value = 0.35;
    this.composer.addPass(
      new EffectPass(this.camera, this.bloom, new VignetteEffect({ offset: 0.3, darkness: 0.68 }), new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), grain),
    );

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Lower the internal resolution (adaptive quality on slow GPUs). */
  setPixelRatio(r: number): void {
    this.renderer.setPixelRatio(r);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get viewportHeightPx(): number {
    return this.renderer.domElement.height;
  }

  /** Blend the sky/fog/rim towards a palette. k=1 snaps. */
  setSky(key: SkyKey, k: number): void {
    const c = this.cur;
    c.top.lerp(_c.set(key.top), k);
    c.horizon.lerp(_c.set(key.horizon), k);
    c.glow.lerp(_c.set(key.glow), k);
    c.fog.lerp(_c.set(key.fog), k);
    c.glowY += (key.glowY - c.glowY) * k;
    c.stars += (key.stars - c.stars) * k;
    c.disc += ((key.disc ?? 0) - c.disc) * k;
    this.fog.color.copy(c.fog);
    this.fog.density += ((key.fogDensity ?? 0.022) - this.fog.density) * k;
    this.sky.material.uniforms.uGlowY.value = c.glowY;
    this.sky.material.uniforms.uDisc.value = c.disc;
    this.stars.material.opacity = c.stars;
    this.hemi.color.copy(c.horizon).multiplyScalar(0.6);
    // silhouettes are rimmed by the sky they stand against
    RIM.uRimColor.value.copy(c.glow).lerp(c.horizon, 0.5).multiplyScalar(0.9);
    for (const f of this.fogCards) f.material.color.copy(c.fog).lerp(c.horizon, 0.12);
    for (const s of this.shafts) s.material.color.copy(c.glow).multiplyScalar(0.16 + this.dawn * 0.4);
  }

  update(t: number, camX: number): void {
    this.sky.material.uniforms.uTime.value = t;
    this.far.position.x = camX * 0.9;
    this.stars.rotation.z = t * 0.004;
    this.fogCards.forEach((f, i) => {
      (f.material.map as THREE.Texture).offset.x = t * (0.004 + i * 0.002) + i * 0.3;
    });
    this.shafts.forEach((s, i) => {
      s.material.opacity = 0.55 + 0.45 * Math.sin(t * 0.25 + i * 1.7);
    });
    this.grassTime.value = t;
    for (const b of this.banners) {
      const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = b.base[i * 3];
        const y = b.base[i * 3 + 1];
        const f = Math.max(0, -y / 3); // hangs from the top
        pos.setX(i, x + Math.sin(t * 1.6 + b.seed - f * 3) * 0.25 * f + f * f * 0.5);
        pos.setZ(i, Math.sin(t * 2.3 + b.seed + x * 2 - f * 4) * 0.18 * f);
      }
      pos.needsUpdate = true;
      b.mesh.geometry.computeVertexNormals();
    }
    this.sun.intensity = this.dawn * 4.2;
    this.hemi.intensity = 0.18 + this.dawn * 0.35;
    this.sun.castShadow = this.dawn > 0.05;
    this.moon.intensity = 0.6 * (1 - this.dawn);
  }

  render(): void {
    this.composer.render();
  }

  // ------------------------------------------------------------- builders
  private makeStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const rng = new Rng(99);
    const n = 1100;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = rng.range(-240, 240);
      p[i * 3 + 1] = rng.range(-10, 110) * Math.sqrt(rng.next());
      p[i * 3 + 2] = 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const s = new THREE.Points(g, m);
    s.position.set(0, 20, -145);
    s.renderOrder = -9;
    return s;
  }

  private buildGround(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a161e, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -40);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // worn flagstones under the lane, lighter so firelight and cast shadows read clearly
    const stones = new THREE.Group();
    const rng = new Rng(8);
    const flag = new THREE.MeshStandardMaterial({ color: 0x241f28, roughness: 0.9 });
    for (let x = -20; x < 20; x += 0) {
      const w = rng.range(0.9, 1.7);
      for (const z of [-1.2, 0, 1.2]) {
        if (rng.next() < 0.12) continue;
        const s = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.12, 1.14), flag);
        s.position.set(x + w / 2, -0.05 + rng.range(-0.02, 0.02), z + rng.range(-0.05, 0.05));
        s.rotation.y = rng.range(-0.03, 0.03);
        s.receiveShadow = true;
        stones.add(s);
      }
      x += w;
    }
    this.scene.add(stones);
    const rock = rimify(new THREE.MeshStandardMaterial({ color: SILHOUETTE, roughness: 1 }), 0.5, 'rock');
    for (let i = 0; i < 40; i++) {
      const s = rng.range(0.15, 0.5);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
      m.position.set(rng.range(-30, 30), s * 0.1, rng.range(1.9, 3.2));
      m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  /** Flat silhouette skylines at several depths; fog does the layering. A dead kingdom's cathedral and towers. */
  private buildSkyline(): void {
    const layers = [
      { z: -11, w: 80, hMin: 2.5, hMax: 7, seed: 11, kind: 'colonnade' },
      { z: -24, w: 130, hMin: 4, hMax: 10, seed: 12, kind: 'castle' },
      { z: -44, w: 200, hMin: 7, hMax: 19, seed: 13, kind: 'citadel' },
      { z: -78, w: 320, hMin: 14, hMax: 36, seed: 14, kind: 'mountain' },
    ] as const;
    const mat = new THREE.MeshBasicMaterial({ color: 0x050407, fog: true });
    for (const L of layers) {
      const rng = new Rng(L.seed);
      const shape = new THREE.Shape();
      const x0 = -L.w / 2;
      shape.moveTo(x0, -2);
      let x = x0;
      while (x < L.w / 2) {
        const h = rng.range(L.hMin, L.hMax);
        if (L.kind === 'mountain') {
          const w = rng.range(12, 30);
          shape.lineTo(x + w * 0.45, h);
          shape.lineTo(x + w * 0.55, h * rng.range(0.85, 1));
          x += w;
          shape.lineTo(x, h * rng.range(0.3, 0.6));
          continue;
        }
        if (L.kind === 'colonnade') {
          // broken columns with capitals
          const w = rng.range(0.7, 1.1);
          shape.lineTo(x, h);
          shape.lineTo(x - 0.25, h);
          shape.lineTo(x - 0.25, h + 0.35);
          shape.lineTo(x + w * 0.6, h + 0.35 + rng.range(-0.3, 0.1));
          shape.lineTo(x + w + 0.25, h + 0.3);
          shape.lineTo(x + w, h);
          shape.lineTo(x + w, 0);
          x += w + rng.range(2.2, 4.5);
          shape.lineTo(x, 0);
          continue;
        }
        const w = rng.range(2.5, 6.5);
        const gap = rng.range(0.3, 3);
        shape.lineTo(x, h);
        const roll = rng.next();
        if (roll < 0.35) {
          // gothic spire with a pinnacle
          shape.lineTo(x + w * 0.2, h + 0.5);
          shape.lineTo(x + w / 2, h + rng.range(3, 7.5));
          shape.lineTo(x + w * 0.8, h + 0.5);
        } else if (roll < 0.6) {
          // crenellated tower top
          const n = Math.max(2, Math.floor(w / 0.9));
          for (let i = 0; i < n; i++) {
            const a = x + (i / n) * w;
            const b = x + ((i + 0.5) / n) * w;
            shape.lineTo(a, h + 0.8);
            shape.lineTo(b, h + 0.8);
            shape.lineTo(b, h);
          }
        } else {
          // broken, collapsed top
          shape.lineTo(x + w * 0.3, h - rng.range(0.4, 2.5));
          shape.lineTo(x + w * 0.55, h + rng.range(-0.5, 1.2));
          shape.lineTo(x + w * 0.7, h - rng.range(1, 3));
        }
        shape.lineTo(x + w, h * rng.range(0.75, 1));
        shape.lineTo(x + w, rng.range(0, L.hMin * 0.5));
        x += w + gap;
        shape.lineTo(x, rng.range(0, L.hMin * 0.5));
      }
      shape.lineTo(L.w / 2, -2);
      shape.lineTo(x0, -2);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      mesh.position.set(0, 0, L.z);
      this.scene.add(mesh);
    }
    // the cathedral: one unmistakable landmark behind the hearth
    const c = new THREE.Shape();
    c.moveTo(-14, 0);
    c.lineTo(-14, 16);
    c.lineTo(-11.5, 26);
    c.lineTo(-9, 16);
    c.lineTo(-6, 16);
    c.lineTo(-6, 21);
    c.lineTo(0, 30); // gable
    c.lineTo(6, 21);
    c.lineTo(6, 16);
    c.lineTo(9, 16);
    c.lineTo(10.5, 31);
    c.lineTo(11.2, 40); // great spire, broken at the tip
    c.lineTo(11.6, 37);
    c.lineTo(12.5, 31);
    c.lineTo(14, 16);
    c.lineTo(14, 0);
    c.closePath();
    const rose = new THREE.Path();
    rose.absarc(0, 19, 2.4, 0, Math.PI * 2, true);
    c.holes.push(rose);
    const cath = new THREE.Mesh(new THREE.ShapeGeometry(c), mat);
    cath.position.set(4, 0, -34);
    this.scene.add(cath);
  }

  /** Lit 3D ruins near the lane: they catch firelight and cast the shadows you see. */
  private buildRuins(): void {
    const stone = rimify(new THREE.MeshStandardMaterial({ color: 0x17141b, roughness: 0.9, metalness: 0.05 }), 0.5, 'stone');
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, stone);
      m.position.set(x, y, z);
      m.rotation.set(0, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.world.add(m);
      return m;
    };
    const rng = new Rng(21);
    for (const w of WALLS) {
      add(new THREE.BoxGeometry(w.w, w.h, 1.6), w.x, w.h / 2, 0);
      for (let i = 0; i < 3; i++) {
        const bw = rng.range(0.25, 0.5);
        add(new THREE.BoxGeometry(bw, rng.range(0.15, 0.35), rng.range(0.4, 0.9)), w.x + rng.range(-w.w / 2 + bw / 2, w.w / 2 - bw / 2), w.h + 0.08, rng.range(-0.4, 0.4), rng.range(-0.3, 0.3));
      }
    }
    // the hearth's great broken arch
    add(new THREE.BoxGeometry(1.1, 8, 1.1), -3.6, 4, -3.2);
    add(new THREE.BoxGeometry(1.1, 5.2, 1.1), 3.6, 2.6, -3.2);
    add(new THREE.BoxGeometry(5.2, 0.9, 1.0), -1.4, 8.3, -3.2, 0, -0.06);
    add(new THREE.BoxGeometry(1.4, 0.9, 1.0), 3.0, 5.6, -3.2, 0, 0.5);
    add(new THREE.BoxGeometry(1.6, 0.6, 1.6), -3.6, 0.3, -3.2);
    add(new THREE.BoxGeometry(1.6, 0.6, 1.6), 3.6, 0.3, -3.2);
    for (let i = 0; i < 14; i++) {
      const x = -26 + i * 4 + rng.range(-0.8, 0.8);
      if (Math.abs(x) < 5) continue;
      const h = rng.range(1.5, 6.5);
      add(new THREE.CylinderGeometry(0.42, 0.5, h, 10), x, h / 2, rng.range(-5.5, -4.2));
      if (rng.next() < 0.35) add(new THREE.BoxGeometry(1.2, 0.4, 1.2), x, h + 0.2, -4.8, rng.range(0, 1));
    }
  }

  /** Stone knights of his fallen order, kneeling forever behind the hearth. */
  private buildStatues(): void {
    const stone = rimify(new THREE.MeshStandardMaterial({ color: 0x1b1820, roughness: 0.95 }), 0.6, 'statue');
    const rng = new Rng(31);
    const spots = [-15, -9.5, 8.5, 14.5, 20];
    for (const sx of spots) {
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
        const m = new THREE.Mesh(geo, stone);
        m.position.set(x, y, z);
        m.rotation.z = rz;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      };
      add(new THREE.BoxGeometry(1.6, 0.5, 1.4), 0, 0.25, 0); // plinth
      add(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0.15, 0.75, 0.2); // knee forward
      add(new THREE.BoxGeometry(0.6, 0.25, 0.4), -0.2, 0.62, -0.2); // kneeling leg
      add(new THREE.CylinderGeometry(0.42, 0.25, 0.9, 8), 0, 1.35, 0, -0.25); // torso, bowed
      if (rng.next() > 0.3) add(new THREE.SphereGeometry(0.22, 8, 6), 0.25, 1.95, 0); // head (some lost)
      add(new THREE.BoxGeometry(0.08, 1.8, 0.03), 0.55, 1.0, 0.25); // planted sword
      add(new THREE.BoxGeometry(0.4, 0.06, 0.08), 0.55, 1.6, 0.25);
      add(new THREE.SphereGeometry(0.2, 6, 4), -0.05, 1.75, 0.38);
      add(new THREE.SphereGeometry(0.2, 6, 4), -0.05, 1.75, -0.38);
      const s = rng.range(1.35, 1.8);
      g.scale.setScalar(s);
      g.position.set(sx, 0, rng.range(-7.5, -6.2));
      g.rotation.y = sx < 0 ? 0.35 : -0.35 + Math.PI; // all face the hearth
      if (sx > 0) g.scale.x *= 1;
      this.world.add(g);
    }
  }

  private buildBanners(): void {
    const tat = tatterTexture(19);
    const pole = rimify(new THREE.MeshStandardMaterial({ color: 0x0c0a10, roughness: 0.6, metalness: 0.4 }), 0.8, 'pole');
    const spots = [
      { x: -7.8, z: -2.6, h: 6.5 },
      { x: 6.4, z: -2.8, h: 5.5 },
      { x: -18, z: -5, h: 8 },
      { x: 17, z: -4.6, h: 7 },
    ];
    for (const [i, s] of spots.entries()) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, s.h, 6), pole);
      p.position.set(s.x, s.h / 2, s.z);
      p.castShadow = true;
      this.world.add(p);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), pole);
      bar.position.set(s.x + 0.55, s.h - 0.15, s.z);
      this.world.add(bar);
      const geo = new THREE.PlaneGeometry(1.1, 3, 4, 12);
      geo.translate(0.55, -1.5, 0);
      const mat = rimify(
        new THREE.MeshStandardMaterial({ color: 0x1a0c10, roughness: 1, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }),
        0.7,
        'banner',
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x + 0.05, s.h - 0.2, s.z);
      m.castShadow = true;
      m.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: tat, alphaTest: 0.5 });
      this.world.add(m);
      this.banners.push({ mesh: m, base: Float32Array.from(geo.attributes.position.array as Float32Array), seed: i * 2.3 });
    }
  }

  /** Dry grass tufts along the front edge, swaying in the wind (vertex shader). */
  private buildGrass(): void {
    const blade = new THREE.ConeGeometry(0.035, 0.7, 3);
    blade.translate(0, 0.35, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a080c, roughness: 1 });
    const time = this.grassTime;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #else
            vec4 wp = vec4(0.0);
          #endif
          float sway = sin(uTime * 1.7 + wp.x * 0.6 + wp.z) * 0.18 + sin(uTime * 4.1 + wp.x * 2.0) * 0.05;
          transformed.x += sway * position.y * position.y;`,
        );
    };
    mat.customProgramCacheKey = () => 'grass';
    const n = 900;
    const inst = new THREE.InstancedMesh(blade, mat, n);
    const rng = new Rng(41);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const front = rng.next() < 0.6;
      const x = rng.range(-34, 34);
      const z = front ? rng.range(1.75, 3.4) : rng.range(-3.5, -1.8);
      const s = rng.range(0.5, 1.4) * (front ? 1 : 0.8);
      e.set(rng.range(-0.25, 0.25), rng.range(0, 3), rng.range(-0.3, 0.3));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * rng.range(0.7, 1.4), s));
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = false;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  /** Fog banks drifting between depth layers, and shafts of light from the sky glow. */
  private buildAtmosphere(): void {
    const tex = fogTexture();
    const cards = [
      { z: -9, y: 0.2, h: 4, o: 0.18 },
      { z: -18, y: 0.8, h: 8, o: 0.26 },
      { z: -31, y: 1.5, h: 13, o: 0.34 },
      { z: -56, y: 3, h: 22, o: 0.42 },
      { z: 3.5, y: -0.6, h: 2, o: 0.12 }, // low ground mist in front
    ];
    for (const c of cards) {
      const map = tex.clone();
      map.needsUpdate = true;
      map.repeat.set(2, 1);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(240, c.h),
        new THREE.MeshBasicMaterial({ map, transparent: true, opacity: c.o, depthWrite: false, fog: false, color: 0x6a5a80 }),
      );
      m.position.set(0, c.y + c.h * 0.3, c.z);
      m.renderOrder = -5;
      this.fogCards.push(m);
      this.scene.add(m);
    }
    const st = shaftTexture();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(4 + i * 2.5, 140),
        new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: 0x332211 }),
      );
      m.position.set(40 + i * 9, 30, -120);
      m.rotation.z = 0.42 + i * 0.05;
      m.renderOrder = -8;
      this.shafts.push(m);
      this.far.add(m);
    }
  }
}

const _c = new THREE.Color();
