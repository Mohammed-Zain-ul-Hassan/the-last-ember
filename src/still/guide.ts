import * as THREE from 'three';
import { glowTexture } from '../render/textures';
import type { Particles } from '../render/particles';
import type { City } from './sim/city';
import { OBJECTIVES, type Objective } from './data/objectives';
import { standFor } from './bot';
import type { StillHud } from './ui/hud';
import { save } from './save';

// Guidance in the game's own language. No arrows: the flame shows the way. A quiet line says what to do next; an
// ember leaves the flame and drifts along the way to it (around corners, through doors), waits there, and comes back;
// a warmth ring fills as the flame nears a shadow's true angle. The line is always there. Guided: the ember keeps
// leading. Gentle: it leads when asked (H). Off: no ember.

/** A chevron of light lying on the floor, pointing along +x (the trail's arrows, made of the flame's own light). */
function chevron(): THREE.BufferGeometry {
  const w = 0.09;
  const a = 0.32;
  const pts = [
    [-a * 0.6, -a], [-a * 0.6 + w, -a], [a * 0.4 + w, 0], [a * 0.4, 0],
    [-a * 0.6, a], [a * 0.4, 0], [a * 0.4 + w, 0], [-a * 0.6 + w, a],
  ];
  const pos: number[] = [];
  for (const q of [pts.slice(0, 4), pts.slice(4, 8)]) for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k][0], 0, q[k][1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

const TRAIL_MAX = 48;
const TRAIL_STEP = 1.25;

export class Guide {
  private trail: THREE.InstancedMesh;
  private ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private ringGlow: THREE.Sprite;
  private onStep = 0; // seconds on the current step
  /** The coaching line for the true angle (main shows it by the warmth ring), or null. */
  coach: string | null = null;
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
    // the trail: ember chevrons on the floor, a wave of light running along them toward the next place
    this.trail = new THREE.InstancedMesh(chevron(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), TRAIL_MAX);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 3;
    this.trail.userData.noWarm = true;
    for (let i = 0; i < TRAIL_MAX; i++) this.trail.setColorAt(i, new THREE.Color(0, 0, 0));
    scene.add(this.trail);
    // the ring of light where to stand for a true angle
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    scene.add(this.ring);
    this.ringGlow = mk(1.6, new THREE.Color(1.4, 0.7, 0.25), 0.3);
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

  /** The ember chevrons from his feet along the way to the target, lit by a wave running toward it. */
  private drawTrail(c: City, t: number, to: [number, number] | null): void {
    const b = c.s.body;
    if (!to || Math.hypot(to[0] - b.x, to[1] - b.z) < 2.4) {
      this.trail.count = 0;
      return;
    }
    const path = this.route(c, new THREE.Vector3(b.x, 0, b.z), to);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let n = 0;
    let carry = 1.1; // the first chevron a step ahead of him
    for (let i = 0; i < path.length - 1 && n < TRAIL_MAX; i++) {
      const a = path[i];
      const z = path[i + 1];
      const len = Math.hypot(z.x - a.x, z.z - a.z);
      const yaw = Math.atan2(z.z - a.z, z.x - a.x);
      q.setFromAxisAngle(up, -yaw);
      let d = carry;
      while (d < len && n < TRAIL_MAX) {
        const k = d / len;
        const x = a.x + (z.x - a.x) * k;
        const zz = a.z + (z.z - a.z) * k;
        if (Math.hypot(to[0] - x, to[1] - zz) < 0.9) break;
        m.compose(new THREE.Vector3(x, c.floorAt(x, zz, 0.1, 3) + 0.04, zz), q, new THREE.Vector3(1, 1, 1));
        this.trail.setMatrixAt(n, m);
        // a wave of light runs along the trail, toward the goal
        const wave = Math.max(0, Math.cos((n * 0.45 - t * 3.2) % (Math.PI * 2)));
        const near = Math.max(0.25, 1 - n / 30);
        col.setRGB(1.6, 0.7, 0.22).multiplyScalar((0.25 + 0.75 * wave * wave) * near);
        this.trail.setColorAt(n, col);
        n++;
        d += TRAIL_STEP;
      }
      carry = d - len;
    }
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
  }

  /** The ring where to stand for a true angle, and what the flame says once he is in it. */
  private drawStand(c: City, t: number, o: Objective | null): void {
    this.coach = null;
    const id = o?.stand ? (typeof o.stand === 'function' ? o.stand(c) : o.stand) : null;
    const fi = id ? c.d.figures.findIndex((f) => f.id === id) : -1;
    if (fi < 0 || c.s.figs[fi].locked || c.s.figs[fi].state !== 'frozen') {
      this.ring.visible = this.ringGlow.visible = false;
      return;
    }
    const f = c.d.figures[fi];
    const yaw = Math.atan2(f.z - f.light[2], f.x - f.light[0]);
    const st = standFor(f.light, yaw, false);
    const y = c.floorAt(st.x, st.z, 0.2, 3) + 0.05;
    this.ring.position.set(st.x, y, st.z);
    const pulse = 0.85 + 0.15 * Math.sin(t * 4);
    this.ring.scale.setScalar(pulse);
    this.ring.material.opacity = 0.75;
    this.ringGlow.position.set(st.x, y + 0.3, st.z);
    this.ring.visible = this.ringGlow.visible = true;
    // in the ring: say plainly what is left to do (a five-year-old can follow it)
    const b = c.s.body;
    if (Math.hypot(st.x - b.x, st.z - b.z) > 1.2) return;
    const fl = c.s.flame;
    const dy = f.light[1] - fl.y;
    const off = Math.hypot(f.light[0] - fl.x, f.light[2] - fl.z);
    let face = yaw - b.yaw;
    while (face > Math.PI) face -= Math.PI * 2;
    while (face < -Math.PI) face += Math.PI * 2;
    if (Math.abs(face) > 0.5) this.coach = face > 0 ? 'turn toward him: move the view right ⟶' : 'turn toward him: ⟵ move the view left';
    else if (dy < -0.2) this.coach = 'lower the flame: look down ↓';
    else if (dy > 0.2) this.coach = 'raise the flame: look up ↑';
    else if (off > 0.35) this.coach = 'step into the middle of the ring';
    else this.coach = 'hold it there…';
    if (!c.diff.coach) this.coach = null; // Hard: the ring shows where, the player finds the angle
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
      this.onStep = -dt;
    }
    this.asked = Math.max(0, this.asked - dt);
    this.onStep = key === this.objKey ? this.onStep + dt : 0;
    // Guided: always. Gentle: when asked (H), or after a minute stuck on the step. Off: never. Hard plays Guided as
    // Gentle (and waits longer), and never lays the ember trail.
    const d = c.diff;
    const gentle = save.hints === 'gentle' || !d.trail;
    const show = active && !!ob && save.hints !== 'off' && (!gentle || this.asked > 0 || this.onStep > 60 * d.hintDelay);
    this.drawTrail(c, t, show && d.trail && !c.s.ghost ? this.target(c) : null);
    this.drawStand(c, t, show ? ob!.o : null);
    const leads = show && !c.s.ghost;
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
