import * as THREE from 'three';
import { BloomEffect, BrightnessContrastEffect, DepthOfFieldEffect, EffectComposer, EffectPass, HueSaturationEffect, KernelSize, NoiseEffect, OutlineEffect, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import type { SkyKey } from '../data/chapters';
import { Rng } from '../sim/rng';
import { RIM, rimify } from './rim';
import { SURFACE, surface } from './surface';
import { mergeStatic } from './merge';
import { rock } from './shapes';
import { fogTexture, shaftTexture } from './textures';

export const SILHOUETTE = 0x09080d;

// The sky is a dome around the camera; the shader works from the view direction, so it is the same whichever way
// you look: horizon to zenith, a sun/moon glow in one fixed direction, streaked clouds.
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform float uGlowY; uniform float uTime; uniform float uDisc; uniform float uGlowAz; uniform float uFlash;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec3 dir = normalize(vDir);
    float y = clamp(dir.y * 1.25 + 0.22, 0.0, 1.0);
    vec3 c = mix(uHorizon, uTop, smoothstep(0.2, 0.8, y));
    // the glow sits at angle uGlowAz around the horizon (the moon over the arch; the dawn in the east, +x),
    // raised or sunk by uGlowY
    float el = uGlowY * 0.55;
    vec3 g = normalize(vec3(cos(uGlowAz) * cos(el), sin(el), sin(uGlowAz) * cos(el)));
    float d = acos(clamp(dot(dir, g), -1.0, 1.0));
    vec2 p = vec2(atan(dir.x, -dir.z), dir.y);
    vec2 gp = vec2(atan(g.x, -g.z), g.y);
    c += uGlow * (exp(-d * 10.0) * 1.3 + exp(-d * 2.6) * 0.3);
    // sun / moon disc with a soft rim and faint surface detail
    if (uDisc > 0.0) {
      float disc = smoothstep(uDisc, uDisc * 0.92, d);
      float detail = 0.82 + 0.18 * noise((p - gp) * 38.0);
      c = mix(c, uGlow * 2.4 * detail, disc);
    }
    // long streaked clouds catching the light
    float cl = noise(vec2(dir.x * 5.0 + dir.z * 3.0 + uTime * 0.004, y * 46.0)) * noise(vec2(dir.z * 2.0 - dir.x * 1.3 - uTime * 0.002, y * 13.0));
    float band = smoothstep(0.28, 0.6, cl) * smoothstep(0.15, 0.35, y) * smoothstep(0.75, 0.45, y);
    c = mix(c, c * 0.55 + uGlow * 0.18, band * 0.7);
    // lightning: the cloud lights up from inside, brightest high in the sky
    c += vec3(0.55, 0.6, 0.85) * uFlash * (0.35 + y) * (0.6 + cl * 1.4);
    gl_FragColor = vec4(c, 1.0);
  }`;

/**
 * One frame counter for every shadow redraw, so the big ones alternate instead of colliding: the moon takes even
 * frames, the hearth's cube or the torch's cube the odd ones. main advances it once at the top of every frame.
 */
export const SHADOW_FRAME = { n: 0 };

/** Does this object hold a light (itself or below)? Showing it would add that light and change every shader. */
function holdsLight(o: THREE.Object3D): boolean {
  let found = false;
  o.traverse((c) => {
    if ((c as THREE.Light).isLight) found = true;
  });
  return found;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly world = new THREE.Group();
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private fog: THREE.FogExp2;
  private moon: THREE.DirectionalLight;
  readonly dof: DepthOfFieldEffect;
  private dofPass: EffectPass;
  private cine = 0; // 0..1 how cinematic the lens is (eased)
  private flash = 0; // lightning, 0..1+, decays fast
  private flashes: number[] = []; // times of the flickers still to come
  private cineTarget = 0;
  /** What the lens and the moon's shadow frame: set every frame (the knight, or the scene's subject). */
  readonly focus = new THREE.Vector3();
  private quality: 'high' | 'medium' | 'low' = 'high';
  private hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly bloom: BloomEffect;
  readonly smaa: EffectPass;
  readonly outline: OutlineEffect;
  private far = new THREE.Group(); // follows the camera like the sky
  private skyline = new THREE.Group(); // rings of distant silhouettes, drifting a little with the camera
  private haze = new THREE.Group(); // fog banks: always ahead of the camera, between it and the distance
  private v = new THREE.Vector3();
  private ground!: THREE.Mesh;
  private scatterGroup = new THREE.Group(); // rubble and grass
  private skyAz = -1.134; // where the sun/moon glow sits around the horizon (angle on x/z)
  // the sky as an environment map: puddles and wet stone reflect it (rebuilt every couple of seconds as it changes)
  private pmrem!: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envT = 0;
  private envSig = 0; // a fingerprint of the sky when the environment map was last built
  private fogCards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private shafts: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private grassTime = { value: 0 };
  private cur: { top: THREE.Color; horizon: THREE.Color; glow: THREE.Color; fog: THREE.Color; glowY: number; stars: number; disc: number };
  dawn = 0; // 0..1 sunrise strength for the finale
  rain = 0; // 0..1: cloud hides the stars, the air thickens

  constructor(canvasParent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    // PCF (r186 dropped PCFSoft and fell back to this anyway, with a warning on every load)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasParent.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 400);
    this.scene.add(this.world);
    this.scene.add(this.far, this.skyline, this.haze);

    this.fog = new THREE.FogExp2(0x1b1730, 0.022);
    this.scene.fog = this.fog;

    this.cur = {
      top: new THREE.Color('#2a1b3d'), horizon: new THREE.Color('#e0794a'), glow: new THREE.Color('#ffb070'),
      fog: new THREE.Color('#3a2236'), glowY: -0.5, stars: 0, disc: 0.09,
    };

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 48, 24),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, fog: false, side: THREE.BackSide,
        uniforms: {
          uTop: { value: this.cur.top }, uHorizon: { value: this.cur.horizon }, uGlow: { value: this.cur.glow },
          uGlowY: { value: 0 }, uTime: { value: 0 }, uDisc: { value: 0.09 }, uGlowAz: { value: -1.134 }, uFlash: { value: 0 },
        },
      }),
    );
    this.sky.renderOrder = -10;
    this.far.add(this.sky);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileCubemapShader(); // its own shader, built now rather than on the first sky change
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.sky.material));

    this.stars = this.makeStars();
    this.far.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0x6a5a9a, 0x0a0810, 0.3);
    this.scene.add(this.hemi);
    // the moon: a cold key light from high over the arch; on high quality it casts long soft shadows around him
    this.moon = new THREE.DirectionalLight(0x9fb0ff, 0.6);
    this.moon.position.set(-8, 14, -20);
    this.moon.shadow.mapSize.set(1024, 1024);
    this.moon.shadow.autoUpdate = false; // redrawn every other frame (see update): half the cost, no visible lag
    this.moon.shadow.needsUpdate = true; // once at boot: medium quality never redraws it (see the sun below)
    this.moon.castShadow = true;
    const mc = this.moon.shadow.camera;
    mc.left = -20;
    mc.right = 20;
    mc.top = 20;
    mc.bottom = -20;
    mc.near = 1;
    mc.far = 120;
    this.moon.shadow.bias = -0.0008;
    this.moon.shadow.normalBias = 0.04;
    this.moon.shadow.radius = 1.5; // a wide kernel's per-pixel rotation read as crawling noise at the edges
    this.scene.add(this.moon, this.moon.target);

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
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    // drawn once at boot even though the night has no sun: until a shadow map exists, every lit shader samples an
    // empty slot there and the GPU drops the draw (hundreds of GL_INVALID_OPERATIONs a second on the title screen)
    this.sun.shadow.needsUpdate = true;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildSkyline();
    this.buildGrass();
    this.buildAtmosphere();
    // batch the rubble and the skyline panels into a handful of draw calls
    mergeStatic(this.scatterGroup, 24);
    mergeStatic(this.skyline, 1000);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // the knight's aura: one glowing outline around his whole silhouette (not every limb), bloomed below
    this.outline = new OutlineEffect(this.scene, this.camera, {
      edgeStrength: 3.2, pulseSpeed: 0.35, visibleEdgeColor: 0x9a6bff, hiddenEdgeColor: 0x2a1450,
      blur: true, kernelSize: KernelSize.SMALL, xRay: false, resolutionScale: 0.75,
    });
    this.composer.addPass(new EffectPass(this.camera, this.outline));
    this.cullOutlineDepth();
    // a cinematic lens for cards and cutscenes: focus on the knight, the world falls away into bokeh
    this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 8, focusRange: 4, bokehScale: 0, resolutionScale: 0.5 });
    this.dof.target = this.focus;
    this.dofPass = new EffectPass(this.camera, this.dof);
    this.dofPass.enabled = false;
    this.composer.addPass(this.dofPass);
    // bloom only on what is meant to glow (fire, eyes, embers, the aura): a lower threshold haloed every lit stone
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, intensity: 0.95, radius: 0.65 });
    // the grade: a little more contrast and colour after tone mapping; a softer vignette so shades coming in from the
    // edges are not lost in black (the colour fringe that used to sit here only blurred the silhouettes)
    this.composer.addPass(
      new EffectPass(
        this.camera,
        this.bloom,
        new VignetteEffect({ offset: 0.35, darkness: 0.55 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
        new HueSaturationEffect({ saturation: 0.12 }),
        new BrightnessContrastEffect({ contrast: 0.1, brightness: 0.015 }),
      ),
    );
    // SMAA on the graded image: smooth, precise edges on every silhouette (MSAA on the half-float target renders black)
    this.smaa = new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    this.composer.addPass(this.smaa);
    // film grain last, and faint: before SMAA it was read as edges, and strong it read as noise over everything
    const grain = new NoiseEffect({ premultiply: true });
    grain.blendMode.opacity.value = 0.12;
    this.composer.addPass(new EffectPass(this.camera, grain));

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** A lightning strike far off: two or three flickers over a third of a second. */
  lightning(t: number, strength: number): void {
    this.flashes.push(t, t + 0.09 + Math.random() * 0.05, t + 0.26 + Math.random() * 0.1);
    this.flashStrength = strength;
  }
  private flashStrength = 1;

  /**
   * Compile every shader the scene can need, including the shadow-pass variants (three only builds those the
   * first time something is drawn into a shadow map): compile, then draw two frames with every shadow redrawn.
   */
  warmup(extraShadows: THREE.LightShadow[] = []): void {
    // Chrome on Metal builds each GPU pipeline on a program's first real draw, per render target and blend state
    // (ANGLE ProgramExecutableMtl setupDraw), and three's compile() draws nothing. So the warm-up frames below draw
    // everything, frustum culling off: anything off camera (the pooled enemies under the floor, the far end of a
    // road) would otherwise meet the GPU for the first time mid-fight.
    // the same goes for what is hidden right now (a flame not yet lit, the light's edge ring, a fading shade): shown
    // for these frames too. Lights are never touched: a light coming or going changes every material's shader.
    const culled: THREE.Object3D[] = [];
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
      if (!o.visible && !o.userData.noWarm && !holdsLight(o)) {
        o.visible = true;
        hidden.push(o);
      }
    });
    // compile against the HDR buffer the game really draws into: with no target bound three builds the canvas
    // (sRGB) variant of every shader, and the linear ones the game uses were still compiled mid-fight (1 s freezes)
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.composer.inputBuffer);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    // and wait for them now: links run in the background (KHR_parallel_shader_compile), and three's first-use query
    // of a program blocks until the GPU process has finished everything queued before it (a 100+ ms stall the first
    // time a crawler leaps in). Query them all here, behind the card.
    for (const p of this.renderer.info.programs ?? []) p.getUniforms();
    for (let i = 0; i < 2; i++) {
      this.moon.shadow.needsUpdate = true;
      this.sun.shadow.needsUpdate = true;
      for (const s of extraShadows) s.needsUpdate = true;
      this.composer.render();
    }
    for (const o of culled) o.frustumCulled = true;
    for (const o of hidden) o.visible = false;
    this.composer.render(); // and leave an ordinary frame on screen, never the all-visible one
  }

  /** Cards, cutscenes and endings get a shallow depth of field; play stays sharp. */
  setCinematic(on: boolean): void {
    this.cineTarget = on ? 1 : 0;
  }

  /** What the graphics setting allows: moon shadows and the cinematic lens are high-only; low drops surface bump. */
  setQuality(q: 'high' | 'medium' | 'low'): void {
    this.quality = q;
    // shadow lights stay put (toggling castShadow recompiles every material); medium just hides the moon's shadow
    this.moon.shadow.intensity = q === 'high' ? 1 : 0;
    SURFACE.uDetail.value = q === 'low' ? 0 : 1;
  }

  /** Lower the internal resolution (adaptive quality on slow GPUs). */
  /**
   * Internal resolution: the asked-for pixel ratio, but never more than ~4.2 million pixels (a 1080p screen at 1.33x).
   * Past that, extra pixels cost a lot of fill and SMAA hides the difference.
   */
  setPixelRatio(r: number): void {
    this.wantRatio = r;
    this.resize();
  }
  private wantRatio = Math.min(window.devicePixelRatio, 1.5);

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(this.wantRatio, Math.sqrt(4.2e6 / Math.max(1, w * h))));
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get viewportHeightPx(): number {
    return this.renderer.domElement.height;
  }

  /**
   * What lies around the level: open ground with rubble and grass, an indoor floor (no grass), or the high wall
   * walk with the land far below.
   */
  setTerrain(kind: 'open' | 'indoor' | 'high'): void {
    this.ground.position.y = kind === 'high' ? -24 : 0;
    this.scatterGroup.visible = kind === 'open';
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
    this.skyAz += ((key.glowAz ?? -1.134) - this.skyAz) * k;
    this.sky.material.uniforms.uGlowAz.value = this.skyAz;
    this.fog.color.copy(c.fog);
    this.fog.density += ((key.fogDensity ?? 0.022) + this.rain * 0.008 - this.fog.density) * k;
    this.sky.material.uniforms.uGlowY.value = c.glowY;
    this.sky.material.uniforms.uDisc.value = c.disc;
    this.stars.material.opacity = c.stars * (1 - this.rain * 0.75);
    this.hemi.color.copy(c.horizon).multiplyScalar(0.6);
    // silhouettes are rimmed by the sky they stand against
    RIM.uRimColor.value.copy(c.glow).lerp(c.horizon, 0.5).multiplyScalar(0.9);
    for (const f of this.fogCards) f.material.color.copy(c.fog).lerp(c.horizon, 0.12);
    for (const s of this.shafts) s.material.color.copy(c.glow).multiplyScalar(0.16 + this.dawn * 0.4);
  }

  /** Re-render the sky into the environment map (a few ms; done every ~2 s). */
  /**
   * Refresh the reflected sky in place: the sky is drawn into one reused cube target and filtered into one reused
   * PMREM target, so the environment texture never changes identity. (A fresh PMREM per rebuild allocated new GPU
   * targets every 1.5 s through every sky change, and a new texture made every lit material re-check its shader.)
   */
  private updateEnv(): void {
    this.envCam.update(this.renderer, this.envScene);
    this.envRT = this.pmrem.fromCubemap(this.envCube.texture, this.envRT);
    if (this.scene.environment !== this.envRT.texture) this.scene.environment = this.envRT.texture;
  }
  private envCube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  private envCam = new THREE.CubeCamera(0.1, 300, this.envCube);

  update(t: number, cam: THREE.Vector3): void {
    this.sky.material.uniforms.uTime.value = t;
    // the reflected sky is rebuilt only when it has visibly changed (never mid-lightning): a rebuild is a small hitch
    const c = this.cur;
    const sig = c.top.r + c.top.g + c.top.b + c.horizon.r + c.horizon.g + c.horizon.b + c.glow.r + c.glow.g + c.glow.b + c.glowY + this.skyAz;
    if (!this.envRT || (t - this.envT > 1.5 && Math.abs(sig - this.envSig) > 0.02 && this.flash < 0.05)) {
      this.envT = t;
      this.envSig = sig;
      this.updateEnv();
    }
    // wet world: always damp tonight; puddles swell and ripple while it rains
    SURFACE.uTime.value = t;
    SURFACE.uWet.value = 0.45 + this.rain * 0.55;
    SURFACE.uRain.value = this.rain;
    this.far.position.set(cam.x, 0, cam.z);
    this.skyline.position.set(cam.x * 0.8, 0, cam.z * 0.8);
    // haze cards turn with the camera so they always lie across the view
    this.camera.getWorldDirection(this.v);
    this.haze.position.set(cam.x, 0, cam.z);
    this.haze.rotation.y = Math.atan2(-this.v.x, -this.v.z);
    this.stars.rotation.y = t * 0.004;
    this.fogCards.forEach((f, i) => {
      (f.material.map as THREE.Texture).offset.x = t * (0.004 + i * 0.002) + i * 0.3;
    });
    this.shafts.forEach((s, i) => {
      s.material.opacity = 0.55 + 0.45 * Math.sin(t * 0.25 + i * 1.7);
    });
    this.grassTime.value = t;
    while (this.flashes.length && this.flashes[0] <= t) {
      this.flashes.shift();
      this.flash = Math.max(this.flash, this.flashStrength * (0.6 + Math.random() * 0.4));
    }
    this.flash *= 0.86;
    this.sky.material.uniforms.uFlash.value = this.flash;
    this.sun.intensity = this.dawn * 4.2;
    // enough night ambient that the ground, the ruins and the shapes on them read; the fire still rules the frame
    this.hemi.intensity = 0.48 + this.dawn * 0.25 + this.flash * 2.2;
    this.sun.shadow.autoUpdate = this.dawn > 0.05;
    // no moon on the darkest hour (no disc in the sky), and none once the sun is up
    this.moon.intensity = (0.25 + 0.55 * Math.min(1, this.cur.disc * 20)) * (1 - this.dawn) + this.flash * 3.5;
    const f = this.focus;
    // the moon redraws on even frames, the hearth or the torch on odd ones (see SHADOW_FRAME): never two in one frame,
    // and not at all once it is too faint to cast anything (the darkest hour, dawn)
    if (SHADOW_FRAME.n % 2 === 0 && this.quality === 'high' && this.moon.intensity > 0.05) this.moon.shadow.needsUpdate = true;
    // snap the shadow camera to whole texels so the shadows do not shimmer as he moves
    const snap = 40 / 1024;
    const fx = Math.round(f.x / snap) * snap;
    const fz = Math.round(f.z / snap) * snap;
    this.moon.position.set(fx - 16, f.y + 28, fz - 40);
    this.moon.target.position.set(fx, f.y, fz);
    this.cine += (this.cineTarget - this.cine) * 0.06;
    this.dofPass.enabled = this.quality === 'high' && this.cine > 0.02;
    this.dof.bokehScale = 3.4 * this.cine;
  }

  render(): void {
    this.composer.render();
  }

  /**
   * The outline's depth pass only exists so walls in front of him clip his aura, but stock it redraws the whole
   * level (a second full scene render, ~13 ms a frame on an M3). Only what stands near the line from the camera to
   * him can hide him, so everything else (and every particle, flame card and rain streak) sits that pass out.
   */
  private cullOutlineDepth(): void {
    // depthPass is internal to OutlineEffect (not in its typings)
    const dp = (this.outline as unknown as { depthPass: { render: (...a: unknown[]) => void } }).depthPass;
    const full = dp.render.bind(dp);
    const hidden: THREE.Object3D[] = [];
    const sphere = new THREE.Sphere();
    const seg = new THREE.Line3();
    const near = new THREE.Vector3();
    dp.render = (...args: unknown[]) => {
      seg.set(this.camera.position, this.focus);
      this.scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.parent === null) return;
        const mat = m.material as THREE.Material;
        let keep = !mat.transparent && mat.depthWrite;
        if (keep) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const im = m as THREE.InstancedMesh;
          if (im.isInstancedMesh && im.boundingSphere === null) im.computeBoundingSphere();
          const bs = im.isInstancedMesh ? im.boundingSphere : null;
          sphere.copy(bs ?? m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld);
          seg.closestPointToPoint(sphere.center, true, near);
          keep = near.distanceTo(sphere.center) < sphere.radius + 0.6;
        }
        if (!keep) hidden.push(o);
      });
      for (const o of hidden) o.visible = false;
      full(...args);
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
    };
  }

  // ------------------------------------------------------------- builders
  private makeStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const rng = new Rng(99);
    const n = 1100;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = 0;
    for (let i = 0; i < n; i++) {
      // upper hemisphere, thinning toward the horizon
      const a = rng.range(0, Math.PI * 2);
      const el = Math.asin(Math.pow(rng.next(), 0.7)) * 0.95 + 0.03;
      p[i * 3] = Math.cos(a) * Math.cos(el) * 280;
      p[i * 3 + 1] = Math.sin(el) * 280;
      p[i * 3 + 2] = Math.sin(a) * Math.cos(el) * 280;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const s = new THREE.Points(g, m);
    s.renderOrder = -9;
    return s;
  }

  private buildGround(): void {
    // wet earth: rough enough to stay dark, smooth enough to catch the firelight
    const mat = surface(new THREE.MeshStandardMaterial({ color: 0x1a161d, roughness: 0.8, metalness: 0.04 }), 'earth');
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(40, 0, 0);
    ground.receiveShadow = true;
    // paving tops sit within a few cm of y = 0: push the ground back in depth so the stones always win (they
    // flickered through it at a distance), and draw it after the level so its full surface shader only runs where
    // nothing covers it
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 2;
    mat.polygonOffsetUnits = 4;
    ground.renderOrder = 1;
    this.scene.add(ground, this.scatterGroup);
    this.ground = ground;
    const rng = new Rng(8);
    const rockMat = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x141118, roughness: 0.9 }), 0.5, 'rock'), 'stone');
    for (let i = 0; i < 260; i++) {
      const s = rng.range(0.15, 0.5);
      const m = new THREE.Mesh(rock(s, i * 3.7), rockMat);
      // rubble over the plaza (clear of the hearth) and along the edges of the road east
      const [x, z] = scatter(rng, i % 2 === 0);
      m.position.set(x, s * 0.1, z);
      m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      m.castShadow = s > 0.34; // pebbles cast nothing anyone sees, into every shadow map
      this.scatterGroup.add(m);
    }
  }

  /**
   * Silhouette skylines in rings all around, at several distances; fog does the layering. A dead kingdom's
   * colonnades, castles, citadel and mountains, and its cathedral as one landmark behind the hearth. Each ring is
   * built from flat panels set edge to edge around the circle, every panel facing the middle.
   */
  private buildSkyline(): void {
    const layers = [
      { r: 44, hMin: 2.5, hMax: 7, seed: 11, kind: 'colonnade' },
      { r: 58, hMin: 4, hMax: 11, seed: 12, kind: 'castle' },
      { r: 80, hMin: 8, hMax: 21, seed: 13, kind: 'citadel' },
      { r: 120, hMin: 16, hMax: 40, seed: 14, kind: 'mountain' },
    ] as const;
    const mat = new THREE.MeshBasicMaterial({ color: 0x050407, fog: true, side: THREE.DoubleSide });
    for (const L of layers) {
      const rng = new Rng(L.seed);
      const P = L.kind === 'mountain' ? 26 : 12; // panel width
      const panels = Math.ceil((Math.PI * 2 * L.r) / P);
      for (let pi = 0; pi < panels; pi++) {
        const shape = new THREE.Shape();
        const x0 = -P / 2;
        shape.moveTo(x0, -2);
        let x = x0;
        while (x < P / 2) {
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
        shape.lineTo(x, -2);
        shape.lineTo(x0, -2);
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
        const th = ((pi + 0.5) / panels) * Math.PI * 2;
        mesh.position.set(Math.sin(th) * L.r, 0, -Math.cos(th) * L.r);
        mesh.rotation.y = -th;
        mesh.scale.x = ((Math.PI * 2 * L.r) / panels / P) * 1.02; // panels meet edge to edge
        this.skyline.add(mesh);
      }
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
    cath.position.set(8, 0, -68);
    cath.scale.setScalar(1.6);
    this.skyline.add(cath);
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
    const n = 2600;
    const inst = new THREE.InstancedMesh(blade, mat, n);
    const rng = new Rng(41);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const [x, z] = scatter(rng, i % 2 === 0);
      const s = rng.range(0.5, 1.4);
      e.set(rng.range(-0.25, 0.25), rng.range(0, 3), rng.range(-0.3, 0.3));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * rng.range(0.7, 1.4), s));
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = false;
    inst.receiveShadow = true;
    this.scatterGroup.add(inst);
  }

  /** Fog banks drifting between depth layers, and shafts of light from the sky glow. */
  private buildAtmosphere(): void {
    const tex = fogTexture();
    const cards = [
      { z: -14, y: 0.2, h: 4, o: 0.14 },
      { z: -24, y: 0.8, h: 8, o: 0.24 },
      { z: -38, y: 1.5, h: 13, o: 0.34 },
      { z: -62, y: 3, h: 22, o: 0.42 },
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
      this.haze.add(m);
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

/** A spot for rubble or grass: on the plaza (clear of the hearth) or along the edges of the road east. */
function scatter(rng: Rng, plaza: boolean): [number, number] {
  if (plaza) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.range(0.012, 1)) * 31;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  const side = rng.next() < 0.5 ? -1 : 1;
  return [rng.range(-12, 112), side * rng.range(2.6, 7)];
}
