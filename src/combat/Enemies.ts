import * as THREE from 'three';
import { DUMMY, LEVEL } from '../config';
import type { Dummy, DummyHit } from '../world/TrainingDummies';

export type EnemyKind = 'static' | 'rusher';

export interface Enemy extends Dummy {
  kind: EnemyKind;
  /** Chase target while alive; null = idle. */
  target: THREE.Vector3 | null;
  contactCd: number;
  alive: boolean;
  maxHealth: number;
}

/**
 * Climb / defense enemies. Reuses dummy hit capsules so Shadowballs keep working.
 * Rushers walk toward a target; statics stand and take hits. No auto-reset during story.
 */
export class Enemies {
  readonly list: Enemy[] = [];
  onKill: ((e: Enemy) => void) | null = null;
  onContact: ((damage: number, target: 'player' | 'wife') => void) | null = null;

  private readonly scene: THREE.Scene;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private nextId = 0;

  /** Compatibility alias for Shadowballs / SpellHands. */
  get dummies(): Dummy[] {
    return this.list;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnStatic(pos: THREE.Vector3, yaw = 0): Enemy {
    return this.spawn('static', pos, yaw, DUMMY.health);
  }

  spawnRusher(pos: THREE.Vector3, target: THREE.Vector3 | null = null): Enemy {
    return this.spawn('rusher', pos, 0, LEVEL.rusherHealth, target);
  }

  clear(): void {
    for (const e of this.list) this.scene.remove(e.root);
    this.list.length = 0;
  }

  aliveCount(): number {
    return this.list.filter((e) => e.alive).length;
  }

  hitTest(p0: THREE.Vector3, p1: THREE.Vector3, r: number): DummyHit | null {
    let best: DummyHit | null = null;
    for (const d of this.list) {
      if (!d.alive || d.downTimer > 0) continue;
      this.a.set(d.position.x, d.position.y + DUMMY.hitBottom, d.position.z);
      this.b.set(d.position.x, d.position.y + DUMMY.hitTop, d.position.z);
      const t = segmentCapsuleHit(p0, p1, this.a, this.b, DUMMY.hitRadius + r, this.tmp);
      if (t !== null && (!best || t < best.t)) {
        best = { dummy: d, t, point: new THREE.Vector3().lerpVectors(p0, p1, t) };
      }
    }
    return best;
  }

  damage(d: Dummy, amount: number, dir: THREE.Vector3, strength: number): void {
    const e = d as Enemy;
    if (!e.alive || e.downTimer > 0 || amount <= 0) return;
    e.health = Math.max(0, e.health - amount);
    const yaw = e.root.rotation.y;
    const lx = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw);
    const lz = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
    const kick = 2.5 + 5 * strength;
    e.tiltV.x += lz * kick;
    e.tiltV.y -= lx * kick;
    e.stain = Math.min(1, e.stain + 0.5 + 0.5 * strength);
    if (e.health === 0) {
      e.alive = false;
      e.downTimer = 999;
      this.onKill?.(e);
    }
  }

  splash(center: THREE.Vector3, radius: number, maxDamage: number, except: Dummy | null): Array<{ dummy: Dummy; amount: number }> {
    const out: Array<{ dummy: Dummy; amount: number }> = [];
    if (radius <= 0) return out;
    for (const d of this.list) {
      if (d === except || !d.alive || d.downTimer > 0) continue;
      const y = THREE.MathUtils.clamp(center.y, d.position.y + DUMMY.hitBottom, d.position.y + DUMMY.hitTop);
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

  /**
   * @param playerFeet player position for rusher chase / contact
   * @param wifePos wife position during defense (rushers prefer this when set)
   */
  update(dt: number, camera: THREE.Camera, playerFeet: THREE.Vector3, wifePos: THREE.Vector3 | null, phase: string): void {
    for (const e of this.list) {
      if (!e.alive) {
        e.slump += (1 - e.slump) * Math.min(1, dt * 6);
        e.body.rotation.set(0.5, 0, 0);
        e.body.position.y = -0.25;
        e.bar.visible = false;
        e.root.visible = e.slump < 0.99;
        continue;
      }

      e.contactCd = Math.max(0, e.contactCd - dt);

      if (e.kind === 'rusher') {
        const preferWife = phase === 'defense' && wifePos;
        e.target = preferWife ? wifePos : playerFeet;
        if (e.target) {
          this.move.set(e.target.x - e.position.x, 0, e.target.z - e.position.z);
          const dist = this.move.length();
          if (dist > 0.05) {
            this.move.multiplyScalar(1 / dist);
            e.root.rotation.y = Math.atan2(this.move.x, this.move.z);
            const step = Math.min(dist, LEVEL.rusherSpeed * dt);
            e.position.x += this.move.x * step;
            e.position.z += this.move.z * step;
            e.root.position.x = e.position.x;
            e.root.position.z = e.position.z;
          }
          if (dist < LEVEL.contactRange && e.contactCd <= 0) {
            e.contactCd = LEVEL.contactCooldown;
            this.onContact?.(LEVEL.rusherDamage, preferWife ? 'wife' : 'player');
          }
        }
      }

      for (const k of ['x', 'y'] as const) {
        e.tiltV[k] += (-90 * e.tilt[k] - 7 * e.tiltV[k]) * dt;
        e.tilt[k] += e.tiltV[k] * dt;
      }
      e.body.rotation.set(e.tilt.x, 0, e.tilt.y);
      e.stain = Math.max(0, e.stain - dt * 1.6);
      const frac = e.health / e.maxHealth;
      e.barFill.scale.x = Math.max(frac, 0.001);
      e.barFill.position.x = -0.3 * (1 - frac);
      (e.barFill.material as THREE.MeshBasicMaterial).color.setHSL(0.02 + 0.08 * frac, 0.9, 0.55);
      e.bar.visible = true;
      e.bar.quaternion.copy(camera.quaternion);
    }
  }

  private spawn(kind: EnemyKind, pos: THREE.Vector3, yaw: number, health: number, target: THREE.Vector3 | null = null): Enemy {
    const index = this.nextId++;
    const root = new THREE.Group();
    root.position.copy(pos);
    root.rotation.y = yaw;
    const stone = new THREE.MeshStandardMaterial({ color: 0x1a1418, roughness: 0.9 });
    const bodyMat = new THREE.MeshStandardMaterial({
      color: kind === 'rusher' ? 0x2a1018 : DUMMY.bodyColor,
      emissive: kind === 'rusher' ? 0x4a1010 : 0x000000,
      emissiveIntensity: kind === 'rusher' ? 0.35 : 0,
      roughness: 0.85,
    });
    const ring = new THREE.MeshStandardMaterial({ color: 0x2a1406, emissive: DUMMY.ringColor, emissiveIntensity: 1.1 });
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    root.add(mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 16), stone, 0, 0.05, 0));
    const body = new THREE.Group();
    root.add(body);
    const pivot = new THREE.Group();
    pivot.position.y = 0.1;
    body.add(pivot);
    pivot.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10), stone, 0, 0.3, 0));
    pivot.add(mesh(new THREE.CapsuleGeometry(0.27, 0.55, 4, 12), bodyMat, 0, 1.05, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), bodyMat, 0, 1.6, 0));
    if (kind === 'static') {
      for (const [r, t] of [[0.16, 0.025], [0.08, 0.02]] as const) {
        pivot.add(mesh(new THREE.TorusGeometry(r, t, 6, 20), ring, 0, 1.12, -0.27));
      }
    }

    const bar = new THREE.Group();
    bar.position.set(0, 2.05, 0);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x05070d, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.045),
      new THREE.MeshBasicMaterial({ color: 0xff7a2f, depthWrite: false }),
    );
    fill.position.z = 0.001;
    bar.add(back, fill);
    root.add(bar);
    this.scene.add(root);

    const enemy: Enemy = {
      index,
      kind,
      position: pos.clone(),
      health,
      maxHealth: health,
      downTimer: 0,
      root,
      body,
      materials: [bodyMat],
      bar,
      barFill: fill,
      tilt: new THREE.Vector2(),
      tiltV: new THREE.Vector2(),
      stain: 0,
      slump: 0,
      target,
      contactCd: 0,
      alive: true,
    };
    this.list.push(enemy);
    return enemy;
  }
}

function segmentCapsuleHit(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  out: THREE.Vector3,
): number | null {
  const len = p0.distanceTo(p1);
  const steps = Math.max(1, Math.ceil(len / (radius * 0.5)));
  const ab = new THREE.Vector3().subVectors(b, a);
  const abLen2 = Math.max(ab.lengthSq(), 1e-8);
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
