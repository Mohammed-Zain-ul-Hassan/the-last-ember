import * as THREE from 'three';
import { Figure } from '../../render/memory';
import { glowTexture } from '../../render/textures';
import { run, STAND } from '../../sim/pose';
import type { Particles } from '../../render/particles';
import type { City } from '../sim/city';

// The Wrong Shadow: a shadow standing up, in his shape (it is him, looping). Pure ink, no light of its own but two
// faint cold points where his eyes are. It is only ever seen frozen: it moves when no one is looking.

const INK = new THREE.MeshBasicMaterial({ color: 0x010002 });
const INK2 = new THREE.MeshBasicMaterial({ color: 0x010002, side: THREE.DoubleSide });

export class WrongView {
  readonly root = new THREE.Group();
  private fig: Figure;
  private eyes: THREE.Sprite;
  private outline: THREE.Sprite;
  private phase = 0;
  private shown = 0;
  /** Seconds left of the tier-3 hint's glow around it. */
  reveal = 0;

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

  update(dt: number, t: number, city: City, smoke: Particles): void {
    const w = city.s.wrong;
    const on = w.on && !w.gone;
    this.shown += ((on ? 1 : 0) - this.shown) * Math.min(1, dt * (on ? 8 : 3));
    this.root.visible = this.shown > 0.02;
    if (!this.root.visible) return;
    this.root.position.set(w.x, 0, w.z);
    this.fig.root.rotation.y = -w.yaw;
    // frozen mid-stride when it is caught looking: the pose only advances while it moves
    if (w.moving) this.phase += dt * 9;
    const p = w.moving || this.phase > 0 ? { ...STAND, ...run(this.phase / 9, 9), lean: 0.3 } : { ...STAND, head: 0.1 };
    this.fig.apply(p);
    this.eyes.position.set(Math.cos(w.yaw) * 0.12, 1.8, Math.sin(w.yaw) * 0.12);
    (this.eyes.material as THREE.SpriteMaterial).opacity = 0.55 * this.shown * (0.8 + 0.2 * Math.sin(t * 3));
    this.reveal = Math.max(0, this.reveal - dt);
    (this.outline.material as THREE.SpriteMaterial).opacity = Math.min(1, this.reveal) * 0.6;
    // it sheds a little dark, like he does
    if (Math.random() < dt * 10 * this.shown)
      smoke.emit({ x: w.x + (Math.random() - 0.5) * 0.5, y: 0.4 + Math.random() * 1.5, z: w.z + (Math.random() - 0.5) * 0.5, vy: 0.5, spread: 0.1, life: 1.1, size: 0.4, sizeEnd: 0.9, r: 0.01, g: 0.01, b: 0.03, alpha: 0.5, drag: 1.2 });
  }
}
