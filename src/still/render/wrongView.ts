import * as THREE from 'three';
import { Figure } from '../../render/memory';
import { KnightView } from '../../render/knightView';
import { glowTexture } from '../../render/textures';
import { run, STAND } from '../../sim/pose';
import type { Particles } from '../../render/particles';
import type { Knight } from '../../sim/world';
import type { City } from '../sim/city';

// The Wrong Shadow: a shadow standing up, in his shape (it is him, looping). Early on it is pure ink with two faint
// cold points for eyes. From the Library it wears his face: it is drawn as the knight himself, without the flame.
// It is only ever seen frozen: it moves when no one is looking.

const INK = new THREE.MeshBasicMaterial({ color: 0x010002 });
const INK2 = new THREE.MeshBasicMaterial({ color: 0x010002, side: THREE.DoubleSide });

export type WrongPose = 'reach' | 'hold' | 'stand' | 'walk';
export interface WrongOverride {
  x: number;
  z: number;
  yaw: number;
  pose: WrongPose;
  target?: THREE.Vector3; // what its hand reaches for
}

export class WrongView {
  readonly root = new THREE.Group();
  private fig: Figure;
  private face: KnightView | null = null;
  private faceAd = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: true, state: 'idle', stateT: 0, combo: 0, move: 'light', swingId: 0, ember: false, chargeT: 0, slamT: -1, iframes: 0, hitThisSwing: new Set<number>() } as unknown as Knight;
  private eyes: THREE.Sprite;
  private outline: THREE.Sprite;
  private phase = 0;
  private shown = 0;
  /** Seconds left of the tier-3 hint's glow around it. */
  reveal = 0;
  private held = 0;
  /** From the Library on, it wears his face. */
  mirror = false;
  override: WrongOverride | null = null;

  constructor() {
    this.fig = new Figure('knight', 0, 1, 1.95, { baseY: 0, mat: INK, matDouble: INK2 });
    this.root.add(this.fig.root);
    this.fig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    this.eyes = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.35, 0.45, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.0 }));
    this.eyes.scale.set(0.22, 0.1, 1);
    this.root.add(this.eyes);
    this.outline = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.4, 0.55, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.outline.scale.set(2.2, 3.4, 1);
    this.outline.position.y = 1.1;
    this.root.add(this.outline);
    this.root.visible = false;
    this.root.userData.dynamic = true;
  }

  /** His own figure, without its light (the light would change every shader's light count: it never joins the scene). */
  private faceView(): KnightView {
    if (!this.face) {
      this.face = new KnightView();
      this.face.root.remove(this.face.torchLight);
      this.face.setTorch(false);
      this.face.armed = false; // no sword in the city, and its light must never join the scene either
      this.face.root.userData.dynamic = true;
    }
    return this.face;
  }

  update(dt: number, t: number, city: City, smoke: Particles, glow: Particles, camera: THREE.Camera, flame: THREE.Vector3): void {
    const w = city.s.wrong;
    const o = this.override;
    const on = !!o || (w.on && !w.gone);
    this.shown += ((on ? 1 : 0) - this.shown) * Math.min(1, dt * (on ? 8 : 3));
    this.root.visible = this.shown > 0.02;
    if (!this.root.visible) {
      if (this.face) this.face.root.visible = false;
      return;
    }
    const x = o ? o.x : w.x;
    const z = o ? o.z : w.z;
    const yaw = o ? o.yaw : w.yaw;
    const moving = o ? o.pose === 'walk' : w.moving;
    const mirror = this.mirror || !!o;
    this.root.position.set(x, 0, z);
    this.fig.root.visible = !mirror;
    if (mirror) {
      const f = this.faceView();
      if (!f.root.parent) this.root.parent?.add(f.root);
      f.root.visible = true;
      const ad = this.faceAd as unknown as Record<string, unknown>;
      const prevX = ad.x as number;
      const prevZ = ad.z as number;
      Object.assign(ad, { x, z, y: 0, yaw, state: moving ? 'run' : 'idle', vx: moving ? (x - prevX) / Math.max(dt, 1e-3) : 0, vz: moving ? (z - prevZ) / Math.max(dt, 1e-3) : 0 });
      const reach = o?.pose === 'reach' ? flame : o?.pose === 'hold' ? (o.target ?? null) : null;
      f.carry = reach;
      f.update(this.faceAd, dt, t, smoke, glow, camera);
    } else {
      this.fig.root.rotation.y = -yaw;
      if (moving) this.phase += dt * 9;
      const p = moving || this.phase > 0 ? { ...STAND, ...run(this.phase / 9, 9), lean: 0.3 } : { ...STAND, head: 0.1 };
      this.fig.apply(p);
    }
    this.eyes.position.set(Math.cos(yaw) * 0.12, 1.8, Math.sin(yaw) * 0.12);
    (this.eyes.material as THREE.SpriteMaterial).opacity = mirror ? 0 : 0.55 * this.shown * (0.8 + 0.2 * Math.sin(t * 3));
    this.reveal = Math.max(0, this.reveal - dt);
    // held in the light (the Flame Lock's whole point): a cold halo says it cannot move while it is lit
    this.held += ((w.lit && w.on ? 1 : 0) - this.held) * Math.min(1, dt * 6);
    (this.outline.material as THREE.SpriteMaterial).opacity = Math.max(Math.min(1, this.reveal) * 0.6, this.held * 0.3);
    // it sheds a little dark, like he does
    if (!mirror && Math.random() < dt * 10 * this.shown)
      smoke.emit({ x: x + (Math.random() - 0.5) * 0.5, y: 0.4 + Math.random() * 1.5, z: z + (Math.random() - 0.5) * 0.5, vy: 0.5, spread: 0.1, life: 1.1, size: 0.4, sizeEnd: 0.9, r: 0.01, g: 0.01, b: 0.03, alpha: 0.5, drag: 1.2 });
  }
}
