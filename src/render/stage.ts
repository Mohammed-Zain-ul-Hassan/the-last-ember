import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { WALLS, type SkyKey } from '../data/chapters';
import { Rng } from '../sim/rng';

export const SILHOUETTE = 0x09080d;

const SKY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform float uGlowY; uniform float uTime;
  varying vec2 vUv;
  void main() {
    float y = vUv.y;
    vec3 c = mix(uHorizon, uTop, smoothstep(0.18, 0.85, y));
    vec2 gp = vec2(0.62, 0.5 + uGlowY * 0.42);
    float d = distance(vec2(vUv.x * 2.2, y), vec2(gp.x * 2.2, gp.y));
    c += uGlow * (exp(-d * 9.0) * 1.6 + exp(-d * 2.4) * 0.35);
    // faint high cloud bands
    float band = sin(y * 40.0 + sin(vUv.x * 9.0 + uTime * 0.03) * 2.0) * 0.5 + 0.5;
    c *= 0.94 + 0.06 * band;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly world = new THREE.Group(); // everything that moves with gameplay
  private sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private fog: THREE.FogExp2;
  private moon: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  readonly bloom: BloomEffect;
  private cur: { top: THREE.Color; horizon: THREE.Color; glow: THREE.Color; fog: THREE.Color; glowY: number; stars: number };

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

    this.fog = new THREE.FogExp2(0x1b1730, 0.022);
    this.scene.fog = this.fog;

    this.cur = {
      top: new THREE.Color('#2a1b3d'), horizon: new THREE.Color('#e0794a'), glow: new THREE.Color('#ffb070'),
      fog: new THREE.Color('#3a2236'), glowY: -0.5, stars: 0,
    };

    // sky: a huge backdrop plane, unaffected by fog
    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 220),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, fog: false,
        uniforms: {
          uTop: { value: this.cur.top }, uHorizon: { value: this.cur.horizon }, uGlow: { value: this.cur.glow },
          uGlowY: { value: 0 }, uTime: { value: 0 },
        },
      }),
    );
    this.sky.position.set(0, 60, -150);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.stars = this.makeStars();
    this.scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0x6a5a9a, 0x0a0810, 0.35);
    this.scene.add(this.hemi);
    // cold back light for rims on silhouettes
    this.moon = new THREE.DirectionalLight(0x9fb0ff, 0.6);
    this.moon.position.set(-8, 14, -20);
    this.scene.add(this.moon);

    this.buildGround();
    this.buildSkyline();
    this.buildRuins();

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.85, luminanceSmoothing: 0.25, intensity: 1.15, radius: 0.7 });
    this.composer.addPass(
      new EffectPass(this.camera, this.bloom, new VignetteEffect({ offset: 0.32, darkness: 0.62 }), new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })),
    );

    this.resize();
    window.addEventListener('resize', () => this.resize());
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

  /** Blend the sky/fog towards a chapter's palette. k=1 snaps. */
  setSky(key: SkyKey, k: number): void {
    const c = this.cur;
    c.top.lerp(new THREE.Color(key.top), k);
    c.horizon.lerp(new THREE.Color(key.horizon), k);
    c.glow.lerp(new THREE.Color(key.glow), k);
    c.fog.lerp(new THREE.Color(key.fog), k);
    c.glowY += (key.glowY - c.glowY) * k;
    c.stars += (key.stars - c.stars) * k;
    this.fog.color.copy(c.fog);
    this.sky.material.uniforms.uGlowY.value = c.glowY;
    this.stars.material.opacity = c.stars;
    this.hemi.color.copy(c.horizon).multiplyScalar(0.6);
  }

  update(t: number, camX: number): void {
    this.sky.material.uniforms.uTime.value = t;
    this.sky.position.x = camX * 0.9; // sky effectively at infinity
    this.stars.position.x = camX * 0.9;
    this.stars.rotation.z = t * 0.004;
  }

  render(): void {
    this.composer.render();
  }

  // ------------------------------------------------------------- builders
  private makeStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const rng = new Rng(99);
    const n = 900;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = rng.range(-240, 240);
      p[i * 3 + 1] = rng.range(-10, 110);
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -40);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // a slightly raised, lighter lane so the play line reads
    const lane = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 3.2), new THREE.MeshStandardMaterial({ color: 0x221d26, roughness: 0.95 }));
    lane.position.set(0, -0.1, 0);
    lane.receiveShadow = true;
    this.scene.add(lane);
    // foreground rubble, dark and out of the light, frames the shot
    const rng = new Rng(5);
    const rock = new THREE.MeshStandardMaterial({ color: SILHOUETTE, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const s = rng.range(0.15, 0.5);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
      m.position.set(rng.range(-30, 30), s * 0.1, rng.range(1.9, 3.2));
      m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  /** Flat silhouette skylines at several depths; fog does the layering. */
  private buildSkyline(): void {
    const layers = [
      { z: -9, w: 70, hMin: 2.5, hMax: 7, seed: 11, kind: 'colonnade' },
      { z: -22, w: 120, hMin: 5, hMax: 15, seed: 12, kind: 'castle' },
      { z: -42, w: 200, hMin: 9, hMax: 30, seed: 13, kind: 'citadel' },
      { z: -75, w: 320, hMin: 14, hMax: 38, seed: 14, kind: 'mountain' },
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
        const w = L.kind === 'colonnade' ? rng.range(0.6, 1.2) : rng.range(2, 6);
        const gap = L.kind === 'colonnade' ? rng.range(1.5, 4) : rng.range(0.5, 4);
        shape.lineTo(x, h);
        if (L.kind !== 'colonnade' && rng.next() < 0.45) {
          // spire
          shape.lineTo(x + w / 2, h + rng.range(2, 8));
        } else if (rng.next() < 0.5) {
          // broken top
          shape.lineTo(x + w * 0.3, h - rng.range(0.2, 1.2));
          shape.lineTo(x + w * 0.6, h + rng.range(-0.4, 0.6));
        }
        shape.lineTo(x + w, h * rng.range(0.7, 1));
        shape.lineTo(x + w, rng.range(0, L.hMin * 0.4));
        x += w + gap;
        shape.lineTo(x, rng.range(0, L.hMin * 0.4));
      }
      shape.lineTo(L.w / 2, -2);
      shape.lineTo(x0, -2);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      mesh.position.set(0, 0, L.z);
      this.scene.add(mesh);
    }
  }

  /** Lit 3D ruins near the lane: they catch firelight and cast the shadows you see. */
  private buildRuins(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0x1c1820, roughness: 0.9, metalness: 0.05 });
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, stone);
      m.position.set(x, y, z);
      m.rotation.set(0, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.world.add(m);
      return m;
    };
    // lane walls: must match WALLS in the sim (solid, standable, they cast the spawn shadows)
    const rng = new Rng(21);
    for (const w of WALLS) {
      add(new THREE.BoxGeometry(w.w, w.h, 1.6), w.x, w.h / 2, 0);
      // broken masonry on top, a little irregular
      for (let i = 0; i < 3; i++) {
        const bw = rng.range(0.25, 0.5);
        add(new THREE.BoxGeometry(bw, rng.range(0.15, 0.35), rng.range(0.4, 0.9)), w.x + rng.range(-w.w / 2 + bw / 2, w.w / 2 - bw / 2), w.h + 0.08, rng.range(-0.4, 0.4), rng.range(-0.3, 0.3));
      }
    }
    // the hearth's great broken arch, behind it
    add(new THREE.BoxGeometry(1.1, 8, 1.1), -3.6, 4, -3.2);
    add(new THREE.BoxGeometry(1.1, 5.2, 1.1), 3.6, 2.6, -3.2);
    add(new THREE.BoxGeometry(5.2, 0.9, 1.0), -1.4, 8.3, -3.2, 0, -0.06);
    add(new THREE.BoxGeometry(1.4, 0.9, 1.0), 3.0, 5.6, -3.2, 0, 0.5);
    // colonnade stubs further back
    for (let i = 0; i < 14; i++) {
      const x = -26 + i * 4 + rng.range(-0.8, 0.8);
      if (Math.abs(x) < 5) continue;
      const h = rng.range(1.5, 6.5);
      add(new THREE.CylinderGeometry(0.42, 0.5, h, 10), x, h / 2, rng.range(-5.5, -4.2));
      if (rng.next() < 0.35) add(new THREE.BoxGeometry(1.2, 0.4, 1.2), x, h + 0.2, -4.8, rng.range(0, 1));
    }
  }
}
