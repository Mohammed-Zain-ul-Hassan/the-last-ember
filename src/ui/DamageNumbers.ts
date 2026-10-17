import * as THREE from 'three';

interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  age: number;
  life: number;
  drift: number;
}

const POOL = 24;

/** Floating damage numbers: DOM labels projected from world space, rising and fading. */
export class DamageNumbers {
  private readonly labels: Label[] = [];
  private next = 0;
  private readonly v = new THREE.Vector3();
  /** Total labels shown so far (playtest metering). */
  shown = 0;

  constructor() {
    const layer = document.createElement('div');
    layer.id = 'damage-layer';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;overflow:hidden;';
    document.body.appendChild(layer);
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:0;top:0;font-weight:800;letter-spacing:0.04em;white-space:nowrap;' +
        'text-shadow:0 0 6px rgba(80,30,160,0.9),0 2px 2px rgba(0,0,0,0.9);display:none;will-change:transform,opacity;';
      layer.appendChild(el);
      this.labels.push({ el, pos: new THREE.Vector3(), age: 1, life: 1, drift: 0 });
    }
  }

  /** `kind`: 'hit' (direct), 'charged' (direct, charged ball), 'splash'. */
  show(pos: THREE.Vector3, amount: number, kind: 'hit' | 'charged' | 'splash'): void {
    const l = this.labels[this.next];
    this.next = (this.next + 1) % POOL;
    l.pos.copy(pos);
    l.age = 0;
    l.life = kind === 'charged' ? 1.0 : 0.8;
    l.drift = (Math.random() - 0.5) * 40;
    l.el.textContent = String(amount);
    const size = kind === 'charged' ? 30 : kind === 'splash' ? 16 : 21;
    l.el.style.fontSize = `${size}px`;
    l.el.style.color = kind === 'charged' ? '#e7c8ff' : kind === 'splash' ? '#b59ad8' : '#f4ecff';
    l.el.style.display = 'block';
    this.shown++;
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const l of this.labels) {
      if (l.age >= l.life) continue;
      l.age += dt;
      const t = Math.min(l.age / l.life, 1);
      if (t >= 1) {
        l.el.style.display = 'none';
        continue;
      }
      this.v.copy(l.pos);
      this.v.y += 0.6 * t;
      this.v.project(camera);
      if (this.v.z > 1) {
        l.el.style.opacity = '0';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * w + l.drift * t;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const pop = t < 0.15 ? 1 + (1 - t / 0.15) * 0.5 : 1;
      l.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${pop.toFixed(2)})`;
      l.el.style.opacity = (1 - t * t).toFixed(2);
    }
  }
}
