import * as THREE from 'three';
import { glowTexture } from '../render/textures';
import type { Particles } from '../render/particles';
import type { City } from './sim/city';
import { OBJECTIVES, type Objective } from './data/objectives';
import type { StillHud } from './ui/hud';
import { save } from './save';

// Guidance in the game's own language. No arrows: the flame shows the way. A quiet line says what to do next; an
// ember leaves the flame and drifts along the way to it (around corners, through doors), waits there, and comes back;
// a warmth ring fills as the flame nears a shadow's true angle. The line is always there. Guided: the ember keeps
// leading. Gentle: it leads when asked (H). Off: no ember.

export class Guide {
  private ember: THREE.Sprite;
  private core: THREE.Sprite;
  private path: THREE.Vector3[] = [];
  private seg = 0;
  private u = 0;
  private state: 'idle' | 'fly' | 'wait' = 'idle';
  private waitT = 0;
  private restT = 1.5;
  private objKey = '';
  private asked = 0;
  index = -1;
  current: Objective | null = null;

  constructor(scene: THREE.Object3D) {
    const mk = (size: number, color: THREE.Color, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, opacity, fog: false }));
      s.scale.setScalar(size);
      s.visible = false;
      s.userData.noWarm = true;
      scene.add(s);
      return s;
    };
    this.ember = mk(0.9, new THREE.Color(2.2, 1.0, 0.35), 0.55);
    this.core = mk(0.22, new THREE.Color(4, 2.6, 1.2), 1);
  }

  /** H in Gentle mode: lead once. */
  ask(): void {
    this.asked = 12;
    if (this.state === 'idle') this.restT = 0;
  }

  /** The objective now: the first one not done. */
  private objective(c: City): { o: Objective; i: number } | null {
    const list = OBJECTIVES[c.d.id] ?? [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const done = typeof o.done === 'function' ? o.done(c) : c.flag(o.done);
      if (!done) return { o, i };
    }
    return null;
  }

  target(c: City): [number, number] | null {
    const o = this.current;
    if (!o) return null;
    return typeof o.at === 'function' ? o.at(c) : o.at;
  }

  /** The way from him to the target: the corners still ahead of him, then the target itself. */
  private route(c: City, from: THREE.Vector3, to: [number, number]): THREE.Vector3[] {
    const via = this.current?.via ?? [];
    const pts = [...via, to];
    // start from whichever corner makes the shortest whole way (corners already behind him drop out)
    let best = pts.length - 1;
    let bestLen = Infinity;
    for (let k = 0; k < pts.length; k++) {
      let len = Math.hypot(pts[k][0] - from.x, pts[k][1] - from.z);
      for (let j = k; j < pts.length - 1; j++) len += Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]);
      if (len < bestLen - 1e-3) {
        bestLen = len;
        best = k;
      }
    }
    void c;
    return [from.clone(), ...pts.slice(best).map(([x, z]) => new THREE.Vector3(x, 1.35, z))];
  }

  update(dt: number, t: number, c: City, flame: THREE.Vector3, hud: StillHud, glow: Particles, active: boolean): void {
    const ob = active ? this.objective(c) : null;
    this.current = ob?.o ?? null;
    this.index = ob?.i ?? -1;
    const text = ob ? (typeof ob.o.text === 'function' ? ob.o.text(c) : ob.o.text) : '';
    hud.objective(text);
    const key = `${c.d.id}:${this.index}`;
    if (key !== this.objKey) {
      this.objKey = key;
      this.state = 'idle';
      this.restT = 1.2;
    }
    this.asked = Math.max(0, this.asked - dt);
    const leads = active && !!ob && (save.hints === 'guided' || (save.hints === 'gentle' && this.asked > 0)) && !c.s.ghost;
    const to = leads ? this.target(c) : null;
    const b = c.s.body;
    const far = !!to && Math.hypot(to[0] - b.x, to[1] - b.z) > 2.2;
    if (!leads || !to) {
      this.state = 'idle';
      this.ember.visible = this.core.visible = false;
      return;
    }
    if (this.state === 'idle') {
      this.restT -= dt;
      this.ember.visible = this.core.visible = false;
      if (this.restT <= 0 && far) {
        this.path = this.route(c, flame, to);
        this.seg = 0;
        this.u = 0;
        this.state = 'fly';
      }
      return;
    }
    let pos: THREE.Vector3;
    if (this.state === 'fly') {
      // drift along the way at a walking pace, a little ahead of him, never too far
      const a = this.path[this.seg];
      const z = this.path[this.seg + 1];
      const len = Math.max(0.01, a.distanceTo(z));
      const ahead = this.path[this.seg].distanceTo(b as unknown as THREE.Vector3) > 14;
      this.u += (dt * (ahead ? 1.6 : 4.2)) / len;
      if (this.u >= 1) {
        this.u = 0;
        this.seg++;
        if (this.seg >= this.path.length - 1) {
          this.state = 'wait';
          this.waitT = 3.5;
        }
      }
      const s = Math.min(this.seg, this.path.length - 2);
      pos = this.path[s].clone().lerp(this.path[s + 1], this.state === 'wait' ? 1 : this.u);
    } else {
      pos = this.path[this.path.length - 1].clone();
      this.waitT -= dt;
      if (this.waitT <= 0 || !far) {
        this.state = 'idle';
        this.restT = far ? 4 : 2;
      }
    }
    pos.y += Math.sin(t * 3.1) * 0.12;
    pos.x += Math.sin(t * 1.7) * 0.08;
    this.ember.position.copy(pos);
    this.core.position.copy(pos);
    this.ember.visible = this.core.visible = true;
    const pulse = 0.8 + 0.2 * Math.sin(t * 6);
    (this.ember.material as THREE.SpriteMaterial).opacity = 0.5 * pulse;
    if (Math.random() < dt * 22) glow.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 0.3, spread: 0.12, life: 0.9, size: 0.06, sizeEnd: 0.01, r: 4, g: 1.6, b: 0.4, gravity: -0.3, wobble: 0.4 });
  }
}
