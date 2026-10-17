import * as THREE from 'three';
import { COLORS, LEVEL } from '../config';

export type WifeMode = 'sleep' | 'defense' | 'boss' | 'dead';

/**
 * Fire-formed wife at the summit: sleeps through the climb, is threatened during
 * defense waves, then awakens as a simple three-attack boss.
 */
export class FireWife {
  readonly root = new THREE.Group();
  mode: WifeMode = 'sleep';
  hp: number;
  maxHp: number;
  onBossAttack: ((kind: 'burst' | 'slam' | 'bolt', origin: THREE.Vector3, dir: THREE.Vector3) => void) | null = null;
  onDefeated: (() => void) | null = null;

  private readonly body: THREE.Group;
  private readonly glow: THREE.PointLight;
  private readonly emberMat: THREE.MeshStandardMaterial;
  private attackCd = 2;
  private telegraph: { kind: 'burst' | 'slam' | 'bolt'; t: number; dir: THREE.Vector3 } | null = null;
  private readonly ring: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();
  private readonly bolts: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; life: number }> = [];
  private time = 0;

  constructor(private readonly scene: THREE.Scene, anchor: THREE.Vector3) {
    this.hp = LEVEL.wifeMaxHp;
    this.maxHp = LEVEL.wifeMaxHp;
    this.root.position.copy(anchor);
    this.emberMat = new THREE.MeshStandardMaterial({
      color: 0x1a0804,
      emissive: COLORS.ember,
      emissiveIntensity: 1.4,
      roughness: 0.45,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0x2a1a08,
      emissive: COLORS.gold,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    });

    this.body = new THREE.Group();
    this.body.add(mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), this.emberMat, 0, 1.0, 0));
    this.body.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), gold, 0, 1.75, 0));
    this.body.add(mesh(new THREE.CapsuleGeometry(0.08, 0.55, 3, 6), this.emberMat, -0.4, 1.15, 0));
    this.body.add(mesh(new THREE.CapsuleGeometry(0.08, 0.55, 3, 6), this.emberMat, 0.4, 1.15, 0));
    this.root.add(this.body);

    this.glow = new THREE.PointLight(COLORS.ember, 25, 14, 1.5);
    this.glow.position.set(0, 1.4, 0);
    this.root.add(this.glow);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.85, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.ember, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.ring.visible = false;
    this.root.add(this.ring);

    this.scene.add(this.root);
  }

  setMode(mode: WifeMode): void {
    this.mode = mode;
    if (mode === 'boss') {
      this.hp = LEVEL.bossMaxHp;
      this.maxHp = LEVEL.bossMaxHp;
      this.emberMat.emissiveIntensity = 2.4;
      this.glow.intensity = 55;
      this.body.scale.setScalar(1.35);
      this.attackCd = 1.5;
    } else if (mode === 'sleep') {
      this.emberMat.emissiveIntensity = 0.9;
      this.glow.intensity = 18;
      this.body.rotation.x = 0.35;
    } else if (mode === 'defense') {
      this.body.rotation.x = 0.15;
      this.emberMat.emissiveIntensity = 1.5;
    } else if (mode === 'dead') {
      this.emberMat.emissiveIntensity = 0.2;
      this.glow.intensity = 4;
    }
  }

  /** Defense-phase damage when rushers reach her. */
  hurt(amount: number): void {
    if (this.mode !== 'defense' && this.mode !== 'boss') return;
    this.hp = Math.max(0, this.hp - amount);
    this.emberMat.emissiveIntensity = 3;
    if (this.hp <= 0 && this.mode === 'boss') {
      this.setMode('dead');
      this.onDefeated?.();
    }
  }

  /** Player shadowball damage during boss phase only. */
  hitTest(p0: THREE.Vector3, p1: THREE.Vector3, r: number): { t: number; point: THREE.Vector3 } | null {
    if (this.mode !== 'boss') return null;
    const center = this.tmp.copy(this.root.position).add(new THREE.Vector3(0, 1.2, 0));
    const radius = 0.9 + r;
    const len = p0.distanceTo(p1);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = new THREE.Vector3().lerpVectors(p0, p1, t);
      if (p.distanceTo(center) <= radius) return { t, point: p };
    }
    return null;
  }

  damageBoss(amount: number): void {
    if (this.mode !== 'boss') return;
    this.hurt(amount);
  }

  update(dt: number, playerFeet: THREE.Vector3): void {
    this.time += dt;
    const bob = this.mode === 'sleep' ? Math.sin(this.time * 1.4) * 0.04 : Math.sin(this.time * 2.2) * 0.06;
    this.body.position.y = bob;
    if (this.mode === 'sleep') this.body.rotation.x = 0.35 + Math.sin(this.time) * 0.03;

    if (this.mode === 'boss') {
      this.body.lookAt(playerFeet.x, this.root.position.y + 1.2, playerFeet.z);
      this.attackCd -= dt;
      if (this.telegraph) {
        this.telegraph.t -= dt;
        this.ring.visible = this.telegraph.kind === 'slam' || this.telegraph.kind === 'burst';
        this.ring.scale.setScalar(1 + (1 - Math.max(0, this.telegraph.t)) * 1.2);
        (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.5 * Math.max(0, this.telegraph.t);
        if (this.telegraph.t <= 0) {
          const kind = this.telegraph.kind;
          const dir = this.telegraph.dir.clone();
          this.telegraph = null;
          this.ring.visible = false;
          this.fireAttack(kind, dir, playerFeet);
        }
      } else if (this.attackCd <= 0) {
        const kinds: Array<'burst' | 'slam' | 'bolt'> = ['burst', 'slam', 'bolt'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const dir = new THREE.Vector3().subVectors(playerFeet, this.root.position).setY(0).normalize();
        this.telegraph = { kind, t: kind === 'slam' ? 0.85 : 0.55, dir };
        this.attackCd = kind === 'burst' ? 2.8 : 2.2;
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0 || b.mesh.position.distanceTo(playerFeet) < 1.0) {
        if (b.mesh.position.distanceTo(playerFeet) < 1.0) this.onBossAttack?.('bolt', b.mesh.position.clone(), b.vel.clone().normalize());
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  private fireAttack(kind: 'burst' | 'slam' | 'bolt', dir: THREE.Vector3, playerFeet: THREE.Vector3): void {
    const origin = this.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    if (kind === 'bolt') {
      const geo = new THREE.SphereGeometry(0.22, 10, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a0800, emissive: COLORS.ember, emissiveIntensity: 3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      const vel = new THREE.Vector3().subVectors(playerFeet, origin).normalize().multiplyScalar(14);
      vel.y = 0.5;
      this.scene.add(mesh);
      this.bolts.push({ mesh, vel, life: 4 });
    }
    this.onBossAttack?.(kind, origin, dir);
  }
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
