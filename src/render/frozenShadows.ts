import * as THREE from 'three';

// The still shadows. The city stopped one minute before dawn, and the shadows of that dawn never moved again: every
// stone, post and statue throws a second shadow west, away from the Dawn Gate, whatever the fire is doing. The fire
// cannot burn them away (they darken the light they lie in), the knight casts none, and one of them has no owner.
//
// One depth map, baked from the frozen dawn's direction when a level is built (or when the ownerless shadow moves),
// sampled by every surface() material (see surface.ts). No per-frame cost but one texture read per surface pixel.

/** Objects that cast a still shadow carry this layer (the level, the rubble, the ownerless figure). */
export const FROZEN_LAYER = 3;
/** The ownerless figure alone also carries this one: its shadow is drawn apart (ink black, his violet at the edge). */
export const OWNER_LAYER = 4;
const SIZE = 2048;

/**
 * The frozen dawn: in the east (the Dawn Gate), a little south, about 30 degrees up. Points from the scene toward the
 * light. (Lower made every ruin's shadow 3-4x its height and drowned the plaza: the clue only reads as distinct shapes.)
 */
export const FROZEN_DIR = new THREE.Vector3(0.84, 0.52, 0.14).normalize();
/**
 * The ownerless shadow's own light: the same dawn, lower (about 14 degrees), so its shadow runs out from under the
 * hearth's roof and lies long across the plaza (from the same height as the others it was hidden under the hut).
 */
export const OWNER_DIR = new THREE.Vector3(0.95, 0.245, 0.16).normalize();

/** Shared by every surface material (like SURFACE). uFzK 0..1 fades the still shadows in and out. */
export const FROZEN = {
  uFzMap: { value: null as THREE.Texture | null },
  uFzOwner: { value: null as THREE.Texture | null },
  uFzMat: { value: new THREE.Matrix4() },
  uFzOwnerMat: { value: new THREE.Matrix4() },
  uFzK: { value: 0 },
  uFzDebug: { value: 0 }, // 1 paints the still shadows red (tuning only)
  // the frozen dawn's own faint light: a cold sheen with no visible source, so its shadows read everywhere, not only
  // where the fire happens to light the ground (a shadow only reads where it is darker than what is around it)
  uFzLight: { value: new THREE.Color(0.11, 0.115, 0.15) },
  uFzDir: { value: FROZEN_DIR.clone() },
};

export const FROZEN_GLSL = /* glsl */ `
  uniform sampler2D uFzMap; uniform sampler2D uFzOwner; uniform mat4 uFzMat; uniform mat4 uFzOwnerMat; uniform float uFzK; uniform float uFzDebug; uniform vec3 uFzLight; uniform vec3 uFzDir;
  float fzShadow(vec3 wp, vec3 n) {
    wp += n * 0.12; // normal offset: a face's own depth never shadows it
    if (uFzK < 0.001) return 0.0;
    vec4 c = uFzMat * vec4(wp, 1.0);
    vec3 p = c.xyz / c.w * 0.5 + 0.5;
    if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 0.0;
    float s = 0.0;
    const float px = 1.0 / ${SIZE.toFixed(1)};
    for (int j = -1; j <= 1; j += 2) for (int i = -1; i <= 1; i += 2)
      s += step(texture2D(uFzMap, p.xy + vec2(float(i), float(j)) * px * 0.75).r + 0.002, p.z);
    return s * 0.25 * uFzK;
  }
  // the ownerless shadow alone, sampled a little wider so its edge has a soft band to glow in
  float fzOwner(vec3 wp, vec3 n) {
    if (uFzK < 0.001) return 0.0;
    wp += n * 0.12;
    vec4 c = uFzOwnerMat * vec4(wp, 1.0);
    vec3 p = c.xyz / c.w * 0.5 + 0.5;
    if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 0.0;
    float s = 0.0;
    const float px = 1.0 / ${SIZE.toFixed(1)};
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++)
      s += step(texture2D(uFzOwner, p.xy + vec2(float(i), float(j)) * px * 2.2).r + 0.002, p.z);
    return s / 9.0 * uFzK;
  }`;

export class FrozenShadows {
  private rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
  private rtOwner = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  // back faces into the map: a low light grazing a lit face never shadows that face itself (no acne)
  private depth = new THREE.MeshDepthMaterial({ side: THREE.BackSide });
  private box = new THREE.Box3();
  private v = new THREE.Vector3();
  /** Direction the bake is drawn from (rotated by the ending where the shadows finally move). */
  readonly dir = FROZEN_DIR.clone();

  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.rt.depthTexture = new THREE.DepthTexture(SIZE, SIZE);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.cam.layers.set(FROZEN_LAYER);
    FROZEN.uFzMap.value = this.rt.depthTexture;
    this.rtOwner.depthTexture = new THREE.DepthTexture(SIZE, SIZE);
    this.rtOwner.depthTexture.type = THREE.UnsignedIntType;
    FROZEN.uFzOwner.value = this.rtOwner.depthTexture;
  }

  /** Point the bake camera along `dir` and fit it tightly around `bounds`; returns its projection-view matrix. */
  private aim(dir: THREE.Vector3, bounds: THREE.Box3, out: THREE.Matrix4): void {
    const c = bounds.getCenter(new THREE.Vector3());
    const r = bounds.getSize(new THREE.Vector3()).length() * 0.5 + 4;
    this.cam.position.copy(c).addScaledVector(dir, r * 2);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(c);
    this.cam.updateMatrixWorld();
    this.box.makeEmpty();
    const inv = this.cam.matrixWorldInverse;
    for (let i = 0; i < 8; i++) {
      this.v.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(inv);
      this.box.expandByPoint(this.v);
    }
    const m = 1.5;
    this.cam.left = this.box.min.x - m;
    this.cam.right = this.box.max.x + m;
    this.cam.bottom = this.box.min.y - m;
    this.cam.top = this.box.max.y + m;
    this.cam.near = Math.max(0.1, -this.box.max.z - m);
    this.cam.far = -this.box.min.z + m;
    this.cam.updateProjectionMatrix();
    out.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
  }

  /** Direction the ownerless shadow is drawn from (it turns with the others in the ending). */
  readonly ownerDir = OWNER_DIR.clone();

  /** Bake the still shadows of everything on FROZEN_LAYER inside `bounds` (world box of the level). */
  bake(scene: THREE.Scene, bounds: THREE.Box3): void {
    // lights stay in view of this pass (they draw nothing in it): if the light count changed for one pass, every
    // material would re-check its shader on the next frame
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(FROZEN_LAYER);
    });
    const prevTarget = this.renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAuto = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false; // a depth-only pass: no shadow maps drawn for it
    scene.overrideMaterial = this.depth;
    scene.background = null;
    this.aim(this.dir, bounds, FROZEN.uFzMat.value);
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear(true, true, false);
    this.renderer.render(scene, this.cam);
    // the ownerless one alone (no ruin can hide it), from its own lower angle: its own map
    this.aim(this.ownerDir, bounds, FROZEN.uFzOwnerMat.value);
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(OWNER_LAYER);
    });
    this.cam.layers.set(OWNER_LAYER);
    this.renderer.setRenderTarget(this.rtOwner);
    this.renderer.clear(true, true, false);
    this.renderer.render(scene, this.cam);
    this.cam.layers.set(FROZEN_LAYER);
    this.renderer.setRenderTarget(prevTarget);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    this.renderer.shadowMap.autoUpdate = prevAuto;
  }
}

/** Put every opaque mesh under `root` on the still-shadow layer (it stays on its own layers too). */
export function castStill(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent || !mat.depthWrite || m.userData.noStill) return;
    m.layers.enable(FROZEN_LAYER);
  });
}
