import * as THREE from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { DEPTH } from './depth';
import { HERO } from '../config';

// The knight's aura: one living shadow-fire around his whole silhouette instead of a drawn outline.
//
// Each frame his silhouette is rendered into a small mask (body in red, sword in green). A persistent buffer then
// advects last frame's aura upward through a swirling noise field, lets it decay, and re-injects the softly dilated
// mask. What comes out is fire that hugs him where he stands, climbs off his shoulders and helm, streams behind
// him when he runs, hangs in the air behind a dash, and smears behind every swing of the blade. Three channels:
//   r: body fire (violet)   g: the sword's sheath (hotter, tighter, shorter-lived)   b: dark smoke he sheds
// The composite adds the fire before bloom so it glows, darkens the air under the smoke, keeps his body itself a
// pure black shadow, and hides the aura behind anything clearly nearer the camera than he is.

/** How one channel of the aura burns. Sizes are in figure heights so it reads the same in close-ups and wide shots. */
export interface AuraLayer {
  inner: THREE.Color; // HDR colour where it is densest, against the silhouette
  outer: THREE.Color; // colour of the tips
  intensity: number;
  life: number; // seconds a wisp survives after leaving the silhouette: longer = longer trails
  rise: number; // figure heights per second the flames climb
  spread: number; // how far it reaches past the silhouette
}

/** What the aura wraps and how it burns this frame. The knight's view owns one and updates it every frame. */
export interface AuraSource {
  root: THREE.Object3D; // his whole rig: the mask passes draw only this subtree, never the rest of the scene
  bodyMeshes: THREE.Mesh[];
  swordMeshes: THREE.Mesh[];
  swordRoot: THREE.Object3D; // the sword's frame: a fast swing is motion-blurred between its last two transforms
  smearMeshes: THREE.Mesh[]; // the parts drawn into that blur (the blade: the rest is too small to matter)
  keepVisible: THREE.Object3D | null; // drawn into the mask even while hidden (the hurt blink flickers his body, not his aura)
  anchor: THREE.Vector3; // world position of his chest: the aura is sized and depth-tested against it
  height: number; // metres of figure the sizes are relative to
  fade: number; // 0..1: the dawn dissolve, death
  body: AuraLayer;
  sword: AuraLayer;
  smoke: AuraLayer;
  dt: number; // game time since the last frame (0 while paused: the aura freezes with the world)
  time: number;
  light: THREE.Vector3; // the fire that lights him: the side of his outline facing it burns warm
  lightColor: THREE.Color;
  lightAmount: number; // 0..1, how lit he is
}

const LAYER = 7; // render layer the mask pass draws
const TAIL = 0.38; // radians of travel the blade's afterglow trails behind it

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
  float au_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float au_noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(au_hash(i), au_hash(i + vec3(1, 0, 0)), f.x), mix(au_hash(i + vec3(0, 1, 0)), au_hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(au_hash(i + vec3(0, 0, 1)), au_hash(i + vec3(1, 0, 1)), f.x), mix(au_hash(i + vec3(0, 1, 1)), au_hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;

const FEED_FRAG = /* glsl */ `
  uniform sampler2D tPrev; uniform sampler2D tMask;
  uniform vec2 uTexel; uniform vec2 uShift; uniform float uDt; uniform float uTime; uniform float uAspect; uniform float uScale;
  uniform vec3 uRise; uniform vec3 uLife; uniform vec3 uSpread; uniform vec3 uGain;
  varying vec2 vUv;
  ${NOISE}
  vec4 prev(vec2 uv, float r) {
    vec2 o = uTexel * r;
    return (texture2D(tPrev, uv) * 2.0 + texture2D(tPrev, uv + vec2(o.x, 0.0)) + texture2D(tPrev, uv - vec2(o.x, 0.0))
          + texture2D(tPrev, uv + vec2(0.0, o.y)) + texture2D(tPrev, uv - vec2(0.0, o.y))) / 6.0;
  }
  // the mask dilated by a ring of taps: about 1 at the silhouette, falling to 0 at radius r (in figure heights)
  float ring(vec2 uv, float r, vec4 ch) {
    vec2 d = vec2(r * uScale / uAspect, r * uScale);
    float c = dot(texture2D(tMask, uv), ch);
    float s = c * 2.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982 + 0.39;
      s += dot(texture2D(tMask, uv + vec2(cos(a), sin(a)) * d), ch);
      s += dot(texture2D(tMask, uv + vec2(cos(a + 0.39), sin(a + 0.39)) * d * 0.5), ch);
    }
    return max(c, min(1.0, s / 18.0 * 1.8));
  }
  void main() {
    vec2 uv = vUv;
    // swirl: two noise fields shear the flow so wisps curl instead of climbing in straight columns
    vec2 q = uv * vec2(uAspect, 1.0) / max(uScale, 1e-3);
    float nx = au_noise(vec3(q * 3.2, uTime * 1.1)) - 0.5;
    float ny = au_noise(vec3(q * 3.2 + 11.7, uTime * 1.1)) - 0.5;
    vec2 swirl = vec2(nx / uAspect, ny) * uScale;
    vec2 up = vec2(0.0, uScale);
    vec2 back = uv - uShift; // keep the aura anchored to the world as the camera moves
    float blurR = clamp(uDt * 60.0, 0.5, 2.0);
    float b = prev(back - (up + swirl * 1.8) * uRise.x * uDt, blurR).r;
    float s = prev(back - (up * 0.6 + swirl * 0.9) * uRise.y * uDt, blurR).g;
    float k = prev(back - (up + swirl * 2.6) * uRise.z * uDt, blurR).b;
    vec3 v = vec3(b, s, k) * exp(-3.0 * uDt / max(uLife, vec3(1e-3)));
    const vec4 R = vec4(1.0, 0.0, 0.0, 0.0);
    const vec4 G = vec4(0.0, 1.0, 0.0, 0.0);
    vec3 m = vec3(ring(uv, uSpread.x, R), ring(uv, uSpread.y, G), ring(uv, uSpread.z, R));
    // alpha: where he is this frame only (no history), so the hot rim hugs him and never smears into the trail
    gl_FragColor = vec4(max(v, m * uGain), m.x);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D tAura; uniform sampler2D tMask;
  uniform vec3 uBodyIn; uniform vec3 uBodyOut; uniform vec3 uSwordIn; uniform vec3 uSwordOut; uniform vec3 uSmoke;
  uniform vec3 uGlow; uniform float uFade; uniform float uKnightZ; uniform vec2 uCenter; uniform float uScale; uniform float uAspect; uniform float uClock;
  uniform float uPull; uniform vec2 uLightDir; uniform float uLightAmt; uniform vec3 uLitRim; uniform float uRimPx; uniform vec3 uEdge;
  ${NOISE}
  float au_fbm(vec3 p) { return au_noise(p) * 0.55 + au_noise(p * 2.1 + 7.3) * 0.3 + au_noise(p * 4.3 + 1.7) * 0.15; }
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec4 a = texture2D(tAura, uv);
    if (a.r + a.g + a.b < 0.003 || uFade <= 0.0) { outputColor = inputColor; return; }
    vec2 m = texture2D(tMask, uv).rg;
    // small holes (tattered cloth) count as mostly inside, so they smoulder instead of blazing
    vec2 hr = vec2(0.012 * uScale / uAspect, 0.012 * uScale);
    float near = (texture2D(tMask, uv + vec2(hr.x, 0.0)).r + texture2D(tMask, uv - vec2(hr.x, 0.0)).r
                + texture2D(tMask, uv + vec2(0.0, hr.y)).r + texture2D(tMask, uv - vec2(0.0, hr.y)).r) * 0.25;
    float inside = max(m.r, near * near * 0.85);
    // a gap the silhouette surrounds on most sides (a hole in his cape, a nook under his arm) is not his outer edge:
    // no outline there, so only his true silhouette is drawn
    vec2 er = vec2(0.035 * uScale / uAspect, 0.035 * uScale);
    float around = 0.0;
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.7853982 + 0.2;
      around += texture2D(tMask, uv + vec2(cos(ang), sin(ang)) * er).r;
    }
    inside = max(inside, smoothstep(5.2, 6.8, around));
    // only things clearly nearer the camera than the knight (past his depth pull) hide his aura
    float vis = (1.0 - smoothstep(uKnightZ + uPull + 0.4, uKnightZ + uPull + 1.6, getViewZ(depth))) * uFade;
    // noise in a frame that travels with him, scrolling upward: the fire breaks into tongues as it climbs
    vec2 q = (uv - uCenter) * vec2(uAspect, 1.0) / uScale;
    float n = au_fbm(vec3(q * 4.2 + vec2(0.0, -uClock * 1.6), uClock * 0.35));
    float n2 = au_noise(vec3(q * 11.0 + vec2(3.1, -uClock * 3.4), uClock));
    // his body stays a pure black shadow: the aura only burns outside the silhouette
    float outside = 1.0 - smoothstep(0.2, 0.7, inside);
    float body = a.r;
    // the edge: no drawn line. Violet rises out of the black of him toward his silhouette, peaks where shadow meets
    // air, and dissolves outward into the halo. Rings of the full-res mask at growing radii measure how near the edge
    // a pixel is from either side, so the falloff is smooth and stays the same width on screen at any zoom.
    vec2 px = texelSize * uRimPx;
    // deep inside him, or out past his spread, the answer is known: sample the rings only near the edge
    float c1 = m.r;
    float c2 = m.r;
    float c3 = m.r;
    if (a.a > 0.004 && !(m.r > 0.99 && around > 7.95)) {
      c1 = 0.0;
      c2 = 0.0;
      c3 = 0.0;
      for (int i = 0; i < 8; i++) {
        float ang = float(i) * 0.7853982 + 0.39;
        vec2 o = vec2(cos(ang), sin(ang)) * px;
        c1 += texture2D(tMask, uv + o).r;
        c2 += texture2D(tMask, uv + o * uEdge.x * 0.45).r;
        c3 += texture2D(tMask, uv + o * uEdge.x).r;
      }
      c1 *= 0.125;
      c2 *= 0.125;
      c3 *= 0.125;
    }
    // outside: how much of him lies within reach (1 at his edge, nothing a few widths out)
    float gOut = clamp((c1 * 0.5 + c2 * 0.3 + c3 * 0.2) * 2.0, 0.0, 1.0) * outside;
    // inside: how much open air lies within reach. A small hole in the cloth is all body around: no glow there.
    float gIn = clamp(((1.0 - c1) * 0.5 + (1.0 - c2) * 0.3 + (1.0 - c3) * 0.2) * 2.0, 0.0, 1.0) * m.r * (1.0 - outside) * (1.0 - smoothstep(0.8, 0.95, c3));
    float line = pow(gOut, 1.25);
    float inner = gIn * gIn;
    // which way the silhouette faces here, and whether that side faces the fire: that edge burns warm
    vec2 gp = px * 2.0;
    vec2 grad = vec2(texture2D(tMask, uv + vec2(gp.x, 0.0)).r - texture2D(tMask, uv - vec2(gp.x, 0.0)).r,
                     texture2D(tMask, uv + vec2(0.0, gp.y)).r - texture2D(tMask, uv - vec2(0.0, gp.y)).r);
    float toFire = max(0.0, dot(-grad / max(length(grad), 1e-4), uLightDir)) * uLightAmt;
    vec3 rimCol = mix(uBodyIn, uLitRim, smoothstep(0.0, 0.75, toFire)) * (1.0 + 0.15 * toFire);
    // a soft halo just outside the line, and dimmer tongues of shadow-fire climbing off him
    float halo = smoothstep(0.55, 1.0, a.a) * outside;
    float tongues = smoothstep(0.22, 0.95, body * (0.25 + 0.95 * n + 0.3 * n2)) * outside;
    vec3 glow = (uBodyOut * tongues + rimCol * (line * uEdge.y * (0.75 + 0.3 * n2) + halo * halo * 0.3) + mix(uBodyOut * 1.6, rimCol, gIn) * inner * uEdge.z) * uGlow.x;
    float sw = a.g;
    float sheath = smoothstep(0.04, 0.8, sw * (0.75 + 0.45 * n2));
    vec3 swCol = mix(uSwordOut, uSwordIn, smoothstep(0.6, 1.0, sw));
    // around the blade, never over it: the steel, its edges and its runes stay readable
    glow += swCol * sheath * (1.0 - 0.92 * m.g) * (1.0 - 0.6 * m.r) * uGlow.y;
    float smoke = smoothstep(0.05, 0.85, a.b * (0.35 + 0.95 * n)) * outside * uGlow.z;
    vec3 col = inputColor.rgb * (1.0 - smoke * 0.65 * vis) + uSmoke * smoke * vis + glow * vis;
    outputColor = vec4(col, inputColor.a);
  }`;

export class AuraEffect extends Effect {
  source: AuraSource | null = null;
  private camera: THREE.PerspectiveCamera;
  private mask: THREE.WebGLRenderTarget;
  private feed: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private feedMat: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private maskMats = new Map<string, THREE.MeshBasicMaterial>();
  private swaps: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private prevVP = new THREE.Matrix4();
  private hasPrev = false;
  private prevSword = new THREE.Matrix4();
  private hasPrevSword = false;
  private rel: THREE.Matrix4[] = [];
  // the blade's tail: max-blended so overlapping copies keep the brightest, newest one
  private smearMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00, side: THREE.DoubleSide, fog: false, toneMapped: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
  });
  private needsClear = true;
  private warmed = false;
  private aspect = 16 / 9;
  private height = 720; // render height in pixels

  constructor(camera: THREE.PerspectiveCamera) {
    const u = (v: unknown) => new THREE.Uniform(v);
    super('AuraEffect', FRAG, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, THREE.Uniform>([
        ['tAura', u(null)], ['tMask', u(null)],
        ['uBodyIn', u(new THREE.Color())], ['uBodyOut', u(new THREE.Color())], ['uSwordIn', u(new THREE.Color())], ['uSwordOut', u(new THREE.Color())],
        ['uSmoke', u(new THREE.Color())], ['uGlow', u(new THREE.Vector3())], ['uFade', u(0)], ['uKnightZ', u(-10)],
        ['uCenter', u(new THREE.Vector2(0.5, 0.5))], ['uScale', u(0.2)], ['uAspect', u(16 / 9)], ['uClock', u(0)],
        ['uPull', u(0)], ['uLightDir', u(new THREE.Vector2(1, 0))], ['uLightAmt', u(0)], ['uLitRim', u(new THREE.Color())], ['uRimPx', u(1.5)],
        ['uEdge', u(new THREE.Vector3(HERO.aura.edge.width, HERO.aura.edge.outer, HERO.aura.edge.inner))],
      ]),
    });
    this.camera = camera;
    this.mask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.mask.texture.generateMipmaps = false;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.feed = [rt(), rt()];
    const v2 = () => ({ value: new THREE.Vector2() });
    const v3 = () => ({ value: new THREE.Vector3() });
    this.feedMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FEED_FRAG,
      uniforms: {
        tPrev: { value: null }, tMask: { value: null }, uTexel: v2(), uShift: v2(), uDt: { value: 0 }, uTime: { value: 0 },
        uAspect: { value: 1 }, uScale: { value: 0.2 }, uRise: v3(), uLife: v3(), uSpread: v3(), uGain: v3(),
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.feedMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  override setSize(width: number, height: number): void {
    // the mask is full resolution so the line where his black body meets the fire stays crisp in close-ups;
    // the aura itself is soft, so it runs at half resolution and the composite's noise restores the detail
    const w = Math.max(1, Math.ceil(width / 2));
    const h = Math.max(1, Math.ceil(height / 2));
    this.mask.setSize(Math.max(1, width), Math.max(1, height));
    for (const f of this.feed) f.setSize(w, h);
    this.feedMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.aspect = width / Math.max(1, height);
    this.height = Math.max(1, height);
    this.needsClear = true;
  }

  override update(renderer: THREE.WebGLRenderer, _input: THREE.WebGLRenderTarget, _dt?: number): void {
    const src = this.source;
    const U = this.uniforms;
    if (!src || src.fade <= 0.001) {
      U.get('uFade')!.value = 0;
      this.needsClear = true;
      return;
    }
    const cam = this.camera;
    const dt = src.dt;
    src.dt = 0; // consumed: if the knight is not updated next frame (pause), the aura holds still

    // where he is on screen, how big, and how far
    const view = _v.copy(src.anchor).applyMatrix4(cam.matrixWorldInverse);
    const scale = src.height / (2 * Math.max(0.1, -view.z) * Math.tan((cam.fov * Math.PI) / 360));
    _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const cur = _p.copy(src.anchor).applyMatrix4(_vp);
    const shift = _s.set(0, 0);
    if (this.hasPrev) {
      const was = _q.copy(src.anchor).applyMatrix4(this.prevVP);
      shift.set((cur.x - was.x) * 0.5, (cur.y - was.y) * 0.5);
      if (shift.length() > 0.2) this.needsClear = true; // a camera cut: start the aura fresh
    }
    this.prevVP.copy(_vp);
    this.hasPrev = true;

    // keep the renderer's state exactly as the composer left it
    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_col);
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevLayers = cam.layers.mask;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);

    if (this.needsClear) {
      for (const f of this.feed) {
        renderer.setRenderTarget(f);
        renderer.clear(true, false, false);
      }
      this.needsClear = false;
    }

    // compile the smear material up front: compiling it on the first swing would hitch the frame the player strikes
    if (!this.warmed) {
      this.warmed = true;
      renderer.compile(this.quadScene, this.quadCam);
      const saved = src.smearMeshes.map((m) => m.material);
      for (const m of src.smearMeshes) {
        m.material = this.smearMat;
        m.layers.enable(LAYER);
      }
      cam.layers.set(LAYER);
      renderer.setRenderTarget(this.mask);
      renderer.render(src.root, cam);
      cam.layers.mask = prevLayers;
      src.smearMeshes.forEach((m, i) => (m.material = saved[i]));
    }

    // 1. the silhouette mask: body red, sword green, depth-tested against each other
    this.swaps.length = 0;
    this.swap(src.bodyMeshes, 'body');
    this.swap(src.swordMeshes, 'sword');
    const keep = src.keepVisible;
    const wasVisible = keep ? keep.visible : true;
    if (keep) keep.visible = true;
    cam.layers.set(LAYER);
    renderer.setRenderTarget(this.mask);
    renderer.clear(true, true, false);
    renderer.render(src.root, cam);
    if (dt > 0) this.smearSword(renderer, src);
    if (keep) keep.visible = wasVisible;
    cam.layers.mask = prevLayers;
    for (const [m, mat] of this.swaps) m.material = mat;

    // 2. advect, decay and re-inject
    const F = this.feedMat.uniforms;
    const L = [src.body, src.sword, src.smoke];
    F.tPrev.value = this.feed[0].texture;
    F.tMask.value = this.mask.texture;
    F.uShift.value.copy(shift);
    F.uDt.value = Math.min(dt, 0.05);
    F.uTime.value = src.time;
    F.uAspect.value = this.aspect;
    F.uScale.value = scale;
    F.uRise.value.set(L[0].rise, L[1].rise, L[2].rise);
    F.uLife.value.set(L[0].life, L[1].life, L[2].life);
    F.uSpread.value.set(L[0].spread, L[1].spread, L[2].spread);
    F.uGain.value.set(1, 1, 1);
    renderer.setRenderTarget(this.feed[1]);
    renderer.render(this.quadScene, this.quadCam);
    this.feed.reverse();

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(_col, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadowAuto;

    // 3. the composite
    U.get('tAura')!.value = this.feed[0].texture;
    U.get('tMask')!.value = this.mask.texture;
    (U.get('uBodyIn')!.value as THREE.Color).copy(src.body.inner);
    (U.get('uBodyOut')!.value as THREE.Color).copy(src.body.outer);
    (U.get('uSwordIn')!.value as THREE.Color).copy(src.sword.inner);
    (U.get('uSwordOut')!.value as THREE.Color).copy(src.sword.outer);
    (U.get('uSmoke')!.value as THREE.Color).copy(src.smoke.inner);
    (U.get('uGlow')!.value as THREE.Vector3).set(src.body.intensity, src.sword.intensity, src.smoke.intensity);
    U.get('uFade')!.value = src.fade;
    U.get('uKnightZ')!.value = view.z;
    (U.get('uCenter')!.value as THREE.Vector2).set(cur.x * 0.5 + 0.5, cur.y * 0.5 + 0.5);
    U.get('uScale')!.value = scale;
    U.get('uAspect')!.value = this.aspect;
    U.get('uClock')!.value = src.time;
    U.get('uPull')!.value = DEPTH.uDepthPull.value;
    // the outline is ~0.6% of his height on screen, kept between 1.5 and 3.5 real pixels
    U.get('uRimPx')!.value = Math.max(1.5, Math.min(3.5, scale * this.height * 0.0065));
    // screen direction from him to the fire (in pixels, so it matches the outline's facing)
    const lp = _q.copy(src.light).applyMatrix4(_vp);
    const ld = U.get('uLightDir')!.value as THREE.Vector2;
    ld.set((lp.x - cur.x) * this.aspect, lp.y - cur.y);
    const near = ld.length();
    if (near > 1e-4) ld.divideScalar(near);
    U.get('uLightAmt')!.value = lp.z < 1 ? src.lightAmount : 0;
    (U.get('uLitRim')!.value as THREE.Color).copy(src.lightColor);
  }

  /**
   * A swing moves the blade ~30 degrees a frame, so the aura it leaves would strobe into separate ghost blades. Draw
   * the blade again at transforms interpolated back along its path, fading with age, so the aura picks up a short
   * comet tail behind the blade (the slash trail draws the full arc). The body's depth is already in the mask, so
   * it still hides the blade when the blade passes behind him.
   */
  private smearSword(renderer: THREE.WebGLRenderer, src: AuraSource): void {
    const root = src.swordRoot;
    const cur = root.matrixWorld;
    const had = this.hasPrevSword;
    this.prevSword.decompose(_p1, _q1, _s1); // read last frame's transform before it is overwritten
    this.prevSword.copy(cur);
    this.hasPrevSword = true;
    if (!had || !root.visible) return;
    cur.decompose(_p0, _q0, _s0);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(_q0.dot(_q1))));
    const move = _p0.distanceTo(_p1);
    if (move > 1.5) return; // a teleport or a cut, not a swing
    const span = Math.min(1, TAIL / Math.max(angle, 1e-3)); // fraction of this frame's travel the tail covers
    const n = Math.min(16, Math.ceil(Math.max((angle * span) / 0.03, (move * span) / 0.05)));
    if (n < 2) return;
    // each smeared mesh relative to the sword's frame
    _inv.copy(cur).invert();
    const meshes = src.smearMeshes;
    while (this.rel.length < meshes.length) this.rel.push(new THREE.Matrix4());
    meshes.forEach((m, i) => this.rel[i].multiplyMatrices(_inv, m.matrixWorld));
    for (const m of src.bodyMeshes) m.layers.disable(LAYER);
    for (const m of src.swordMeshes) if (!meshes.includes(m)) m.layers.disable(LAYER);
    for (const m of meshes) m.material = this.smearMat; // the caller restores the real materials
    const autoClear = renderer.autoClear;
    const autoWorld = src.root.matrixWorldAutoUpdate;
    renderer.autoClear = false;
    src.root.matrixWorldAutoUpdate = false;
    for (let i = 0; i < n; i++) {
      const w = i / n; // 0 = oldest, fading toward the blade's tail
      const f = 1 - span + span * w;
      this.smearMat.color.setRGB(0, w * 0.9, 0);
      _m.compose(_pm.lerpVectors(_p1, _p0, f), _qm.slerpQuaternions(_q1, _q0, f), _sm.lerpVectors(_s1, _s0, f));
      meshes.forEach((m, j) => m.matrixWorld.multiplyMatrices(_m, this.rel[j]));
      renderer.render(src.root, this.camera);
    }
    // put every smeared mesh back where it really is
    meshes.forEach((m, j) => m.matrixWorld.multiplyMatrices(cur, this.rel[j]));
    renderer.autoClear = autoClear;
    src.root.matrixWorldAutoUpdate = autoWorld;
    for (const m of src.bodyMeshes) m.layers.enable(LAYER);
    for (const m of src.swordMeshes) m.layers.enable(LAYER);
  }

  /** Swap each mesh to its flat mask colour for the mask pass (alpha-tested cloth keeps its tatters). */
  private swap(meshes: THREE.Mesh[], kind: 'body' | 'sword'): void {
    for (const m of meshes) {
      const mat = m.material as THREE.Material & { alphaMap?: THREE.Texture | null; alphaTest: number };
      const key = `${kind}:${mat.alphaMap ? mat.alphaMap.uuid : ''}:${mat.alphaTest}`;
      let mm = this.maskMats.get(key);
      if (!mm) {
        mm = new THREE.MeshBasicMaterial({
          color: kind === 'body' ? 0xff0000 : 0x00ff00, side: THREE.DoubleSide, fog: false, toneMapped: false,
          // tattered cloth counts as a little more whole than it looks, so its holes smoulder instead of blazing
          alphaMap: mat.alphaMap ?? null, alphaTest: mat.alphaTest * 0.5,
        });
        this.maskMats.set(key, mm);
      }
      m.layers.enable(LAYER);
      this.swaps.push([m, m.material]);
      m.material = mm;
    }
  }

  override dispose(): void {
    this.mask.dispose();
    for (const f of this.feed) f.dispose();
    this.feedMat.dispose();
    for (const m of this.maskMats.values()) m.dispose();
    this.smearMat.dispose();
    super.dispose();
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _s = new THREE.Vector2();
const _vp = new THREE.Matrix4();
const _col = new THREE.Color();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _pm = new THREE.Vector3();
const _s0 = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _sm = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _qm = new THREE.Quaternion();
