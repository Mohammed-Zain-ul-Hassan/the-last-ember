import * as THREE from 'three';
import { CFG } from '../config';
import type { Shade } from '../sim/world';
import type { Particles } from './particles';

const SHADE_MAT = new THREE.MeshStandardMaterial({ color: 0x050407, roughness: 1, metalness: 0, transparent: true, opacity: 1 });

/** One shade: a hunched smoky silhouette with ember eyes. */
class ShadeMesh {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private arms: THREE.Mesh[] = [];
  private eyes: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private seed = Math.random() * 10;

  constructor() {
    this.mat = SHADE_MAT.clone();
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.9, 0.3), transparent: true, toneMapped: false });
    const m = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const o = new THREE.Mesh(g, this.mat);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.castShadow = true;
      this.body.add(o);
      return o;
    };
    m(new THREE.SphereGeometry(0.42, 12, 10), 0, 0.75, 0, 1, 1.45, 0.85); // torso, tapering into smoke
    m(new THREE.SphereGeometry(0.26, 10, 8), 0.2, 1.45, 0, 1.05, 0.95, 0.9); // hunched head, forward
    m(new THREE.ConeGeometry(0.34, 0.8, 10), 0, 0.25, 0, 1, 1, 0.8).rotation.z = Math.PI; // wispy hem
    for (const z of [0.28, -0.28]) {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.95, 6), this.mat);
      arm.position.set(0.2, 1.05, z);
      arm.rotation.z = 2.0;
      arm.castShadow = true;
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.eyes = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), this.eyeMat);
    this.eyes.position.set(0.42, 1.5, 0);
    this.body.add(this.eyes);
    this.root.add(this.body);
  }

  update(s: Shade, dt: number, t: number, smoke: Particles, embers: Particles): void {
    const S = CFG.shade;
    this.root.position.set(s.x, s.y, -0.25);
    this.root.scale.x = s.facing;
    const tt = t + this.seed;
    let rise = 1;
    let lean = 0.15 + Math.sin(tt * 2) * 0.04;
    let armA = 2.0 + Math.sin(tt * 3) * 0.15;
    let opacity = 1;
    if (s.state === 'rise') {
      rise = Math.min(1, s.stateT / S.riseTime);
      rise = 1 - Math.pow(1 - rise, 3);
    } else if (s.state === 'windup') {
      const e = s.stateT / S.windup;
      lean = -0.35 * e;
      armA = 2.0 + 1.1 * e;
    } else if (s.state === 'strike') {
      lean = 0.6;
      armA = 1.1;
    } else if (s.state === 'stagger') {
      lean = -0.5 * (1 - s.stateT / S.staggerTime);
    } else if (s.state === 'dead') {
      opacity = Math.max(0, 1 - s.deadT * 4);
      rise = 1 + s.deadT * 0.6;
    }
    this.body.position.y = -S.h * (1 - Math.min(1, rise)) + Math.sin(tt * 2.6) * 0.05;
    this.body.scale.set(1, Math.min(1.2, 0.4 + 0.6 * rise), 1);
    this.body.rotation.z = -lean;
    for (const a of this.arms) a.rotation.z = armA;
    this.mat.opacity = opacity;
    this.root.visible = opacity > 0.01;

    // ember eyes brighten in the windup (the telegraph)
    const tel = s.state === 'windup' ? 1 + 2 * (s.stateT / S.windup) : 1;
    this.eyeMat.color.setRGB(4.5 * tel, 0.8 * tel, 0.3);
    this.eyeMat.opacity = opacity;

    if (s.state === 'dead') return;
    // trailing dark smoke; burning off when lit
    if (Math.random() < dt * 30) {
      smoke.emit({
        x: s.x + (Math.random() - 0.5) * 0.6, y: s.y + 0.2 + Math.random() * 1.2, z: -0.25 + (Math.random() - 0.5) * 0.4,
        vx: -s.facing * 0.4, vy: 0.5, spread: 0.2, life: 0.9, size: 0.7, sizeEnd: 1.2, r: 0.03, g: 0.02, b: 0.05, alpha: 0.7, drag: 1,
      });
    }
    if (s.light > 0.05 && Math.random() < s.light * dt * 40) {
      embers.emit({
        x: s.x + (Math.random() - 0.5) * 0.7, y: s.y + 0.4 + Math.random() * 1.3, z: -0.25,
        vy: 0.8, spread: 0.4, life: 0.6, size: 0.08, sizeEnd: 0.02, r: 5, g: 1.6, b: 0.3, gravity: -1, wobble: 0.5,
      });
    }
    if (s.state === 'rise' && Math.random() < 0.6) {
      smoke.emit({ x: s.x + (Math.random() - 0.5) * 1.2, y: 0.05, z: -0.25, vy: 1.4, spread: 0.4, life: 0.8, size: 0.9, sizeEnd: 1.6, r: 0.02, g: 0.01, b: 0.03, alpha: 0.9, drag: 1 });
    }
  }
}

export class ShadeViews {
  readonly group = new THREE.Group();
  private live = new Map<number, ShadeMesh>();
  private pool: ShadeMesh[] = [];

  update(shades: readonly Shade[], dt: number, t: number, smoke: Particles, embers: Particles): void {
    const seen = new Set<number>();
    for (const s of shades) {
      seen.add(s.id);
      let v = this.live.get(s.id);
      if (!v) {
        v = this.pool.pop() ?? new ShadeMesh();
        this.group.add(v.root);
        this.live.set(s.id, v);
      }
      v.update(s, dt, t, smoke, embers);
    }
    for (const [id, v] of this.live) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      this.live.delete(id);
      this.pool.push(v);
    }
  }

  clear(): void {
    for (const v of this.live.values()) {
      this.group.remove(v.root);
      this.pool.push(v);
    }
    this.live.clear();
  }

  get count(): number {
    return this.live.size;
  }
}
