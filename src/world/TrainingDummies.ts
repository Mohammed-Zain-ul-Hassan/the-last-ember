import * as THREE from 'three';
import { DUMMY } from '../config';

export interface Dummy {
  readonly index: number;
  /** Base centre on the floor. */
  readonly position: THREE.Vector3;
  health: number;
  /** Seconds left before a knocked-out dummy stands back up (0 = standing). */
  downTimer: number;
  readonly root: THREE.Group;
  /** Wobbles about the base; holds everything above it. */
  readonly body: THREE.Group;
  readonly materials: THREE.MeshStandardMaterial[];
  readonly bar: THREE.Group;
  readonly barFill: THREE.Mesh;
  tilt: THREE.Vector2;
  tiltV: THREE.Vector2;
  /** 0..1 dark ink flash after a hit. */
  stain: number;
  /** Slump while knocked out (0 standing .. 1 slumped). */
  slump: number;
}

export interface DummyHit {
  dummy: Dummy;
  /** Fraction along the tested segment, 0..1. */
  t: number;
  point: THREE.Vector3;
}

const BODY_COLOR = new THREE.Color(DUMMY.bodyColor);
const INK = new THREE.Color(0x0a0812);

/**
 * Pale linen-and-stone training dummies. They collide with the player, wobble away from hits,
 * flash with ink, show a health bar, and stand back up after being knocked out.
 */
export class TrainingDummies {
  readonly dummies: Dummy[] = [];
  onKnockout: ((d: Dummy) => void) | null = null;

  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, colliders: THREE.Box3[]) {
    DUMMY.spots.forEach(([x, z, yaw], index) => {
      const d = this.build(index, x, z, yaw);
      scene.add(d.root);
      this.dummies.push(d);
      // The player bumps into the dummy's base / body.
      colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.35, 0, z - 0.35), new THREE.Vector3(x + 0.35, DUMMY.height, z + 0.35)));
    });
  }

  /**
   * Swept-sphere test of the segment p0->p1 (radius r) against every standing dummy's hit
   * capsule. Returns the earliest hit.
   */
  hitTest(p0: THREE.Vector3, p1: THREE.Vector3, r: number): DummyHit | null {
    let best: DummyHit | null = null;
    for (const d of this.dummies) {
      if (d.downTimer > 0) continue;
      this.a.set(d.position.x, DUMMY.hitBottom, d.position.z);
      this.b.set(d.position.x, DUMMY.hitTop, d.position.z);
      const t = segmentCapsuleHit(p0, p1, this.a, this.b, DUMMY.hitRadius + r, this.tmp);
      if (t !== null && (!best || t < best.t)) {
        best = { dummy: d, t, point: new THREE.Vector3().lerpVectors(p0, p1, t) };
      }
    }
    return best;
  }

  /** Applies damage; `dir` is the travel direction of the hit (for the wobble). */
  damage(d: Dummy, amount: number, dir: THREE.Vector3, strength: number): void {
    if (d.downTimer > 0 || amount <= 0) return;
    d.health = Math.max(0, d.health - amount);
    // Kick the wobble spring away from the hit, in the dummy's own frame.
    const yaw = d.root.rotation.y;
    const lx = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
    const lz = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
    const kick = 2.5 + 5 * strength;
    d.tiltV.x += lz * kick;
    d.tiltV.y -= lx * kick;
    d.stain = Math.min(1, d.stain + 0.5 + 0.5 * strength);
    if (d.health === 0) {
      d.downTimer = DUMMY.resetDelay;
      this.onKnockout?.(d);
    }
  }

  /** Splash damage with linear falloff; returns the hits for damage numbers. */
  splash(center: THREE.Vector3, radius: number, maxDamage: number, except: Dummy | null): Array<{ dummy: Dummy; amount: number }> {
    const out: Array<{ dummy: Dummy; amount: number }> = [];
    if (radius <= 0) return out;
    for (const d of this.dummies) {
      if (d === except || d.downTimer > 0) continue;
      // Distance to the hit capsule's axis.
      const y = THREE.MathUtils.clamp(center.y, DUMMY.hitBottom, DUMMY.hitTop);
      this.tmp.set(d.position.x, y, d.position.z);
      const dist = Math.max(0, this.tmp.distanceTo(center) - DUMMY.hitRadius);
      if (dist >= radius) continue;
      const amount = Math.round(maxDamage * (1 - dist / radius) * 0.6);
      if (amount <= 0) continue;
      this.damage(d, amount, this.tmp.sub(center).setY(0).normalize(), 0.5);
      out.push({ dummy: d, amount });
    }
    return out;
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const d of this.dummies) {
      if (d.downTimer > 0) {
        d.downTimer = Math.max(0, d.downTimer - dt);
        if (d.downTimer === 0) d.health = DUMMY.health;
      }
      const down = d.downTimer > 0 ? 1 : 0;
      d.slump += (down - d.slump) * Math.min(1, dt * (down ? 6 : 3));

      // Damped spring wobble about the base.
      for (const k of ['x', 'y'] as const) {
        d.tiltV[k] += (-90 * d.tilt[k] - 7 * d.tiltV[k]) * dt;
        d.tilt[k] += d.tiltV[k] * dt;
      }
      d.body.rotation.set(d.tilt.x + d.slump * 0.5, 0, d.tilt.y);
      d.body.position.y = -0.25 * d.slump;

      d.stain = Math.max(0, d.stain - dt * 1.6);
      const ink = Math.max(d.stain, d.slump * 0.85);
      for (const m of d.materials) m.color.lerpColors(BODY_COLOR, INK, ink);

      const frac = d.health / DUMMY.health;
      d.barFill.scale.x = Math.max(frac, 0.001);
      d.barFill.position.x = -0.3 * (1 - frac);
      (d.barFill.material as THREE.MeshBasicMaterial).color.setHSL(0.02 + 0.08 * frac, 0.9, 0.55);
      d.bar.visible = d.downTimer === 0;
      d.bar.quaternion.copy(camera.quaternion);
    }
  }

  private build(index: number, x: number, z: number, yaw: number): Dummy {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 });
    const linen = new THREE.MeshStandardMaterial({ color: DUMMY.bodyColor, roughness: 0.85 });
    const ring = new THREE.MeshStandardMaterial({ color: 0x2a1406, emissive: DUMMY.ringColor, emissiveIntensity: 0.9 });
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    root.add(mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 24), stone, 0, 0.05, 0));
    const body = new THREE.Group();
    body.position.y = 0;
    root.add(body);
    // The wobble pivots at the top of the base plate.
    const pivot = new THREE.Group();
    pivot.position.y = 0.1;
    body.add(pivot);
    pivot.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 12), stone, 0, 0.3, 0));
    pivot.add(mesh(new THREE.CapsuleGeometry(0.27, 0.55, 6, 16), linen, 0, 1.05, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.17, 20, 14), linen, 0, 1.6, 0));
    pivot.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), stone, 0, 1.3, 0));
    // Target rings on the chest, facing the dummy's front (-Z).
    for (const [r, t] of [[0.16, 0.025], [0.08, 0.02]] as const) {
      const torus = mesh(new THREE.TorusGeometry(r, t, 8, 32), ring, 0, 1.12, -0.27);
      pivot.add(torus);
    }

    // Health bar (billboarded each frame).
    const bar = new THREE.Group();
    bar.position.set(0, 2.05, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.07), new THREE.MeshBasicMaterial({ color: 0x05070d, transparent: true, opacity: 0.75, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.045), new THREE.MeshBasicMaterial({ color: 0xffa020, depthWrite: false }));
    fill.position.z = 0.001;
    bar.add(back, fill);
    root.add(bar);

    return {
      index,
      position: new THREE.Vector3(x, 0, z),
      health: DUMMY.health,
      downTimer: 0,
      root,
      body,
      materials: [linen],
      bar,
      barFill: fill,
      tilt: new THREE.Vector2(),
      tiltV: new THREE.Vector2(),
      stain: 0,
      slump: 0,
    };
  }
}

/**
 * Earliest t in [0,1] at which the moving point p0->p1 comes within `radius` of segment a-b,
 * or null. Sampled analytically on the closest-approach of the two segments.
 */
function segmentCapsuleHit(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  out: THREE.Vector3,
): number | null {
  // Coarse but robust: march the segment in steps no longer than radius/2.
  const len = p0.distanceTo(p1);
  const steps = Math.max(1, Math.ceil(len / (radius * 0.5)));
  const ab = new THREE.Vector3().subVectors(b, a);
  const abLen2 = ab.lengthSq();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.lerpVectors(p0, p1, t);
    const s = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(out, a).dot(ab) / abLen2, 0, 1);
    const cx = a.x + ab.x * s;
    const cy = a.y + ab.y * s;
    const cz = a.z + ab.z * s;
    const dx = out.x - cx;
    const dy = out.y - cy;
    const dz = out.z - cz;
    if (dx * dx + dy * dy + dz * dz <= radius * radius) return t;
  }
  return null;
}
