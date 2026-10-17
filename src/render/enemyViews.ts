import * as THREE from 'three';
import { CFG } from '../config';
import type { Shade } from '../sim/world';
import type { Particles } from './particles';
import { ENEMY_RIM, rimify, setFade, setRimHot } from './rim';
import { glowTexture, tatterTexture } from './textures';

// The two new kinds of shadow. Same rules as the wraiths: matte black, rimmed by the sky, ember eyes, hit-flash.

export interface EnemyMesh {
  readonly root: THREE.Group;
  flash: number;
  turnYaw?: number;
  update(s: Shade, dt: number, t: number, smoke: Particles, embers: Particles): void;
}

const black = (key: string, side: THREE.Side = THREE.FrontSide) =>
  rimify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0, side }), 0.8, key, ENEMY_RIM);

/** Ease a view's facing toward the sim's yaw the short way round; the first call snaps. Returns the eased yaw. */
export function turnToward(v: { turnYaw?: number }, yaw: number, dt: number): number {
  if (v.turnYaw === undefined || dt <= 0) return (v.turnYaw = yaw);
  let d = (yaw - v.turnYaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  v.turnYaw += d * Math.min(1, dt * 12);
  return v.turnYaw;
}

function fade(mats: THREE.MeshStandardMaterial[], opacity: number, flash: number, hot = 0): void {
  const fl = flash * flash;
  for (const m of mats) {
    setFade(m, opacity);
    setRimHot(m, hot);
    m.emissive.setRGB(2.4 * fl, 0.5 * fl, 0.15 * fl);
  }
}

/** Crawler: a long low body, a jutting head, four jointed legs that scuttle and spring. */
export class CrawlerMesh implements EnemyMesh {
  readonly root = new THREE.Group();
  flash = 0;
  turnYaw?: number;
  private body = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group; phase: number }[] = [];
  private mat = black('crawler');
  private eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.9, 0.3), transparent: true, toneMapped: false });
  private seed = Math.random() * 10;

  constructor() {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.0, 8, 18), this.mat);
    torso.rotation.z = Math.PI / 2;
    torso.scale.set(1, 1, 0.8);
    torso.castShadow = true;
    this.body.add(torso);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 18), this.mat);
    head.rotation.z = -Math.PI / 2;
    head.position.set(0.82, 0.08, 0);
    head.castShadow = true;
    this.body.add(head);
    // spines along the back
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32 - i * 0.03, 8), this.mat);
      sp.position.set(0.4 - i * 0.22, 0.28, 0);
      sp.rotation.z = 0.5;
      this.body.add(sp);
    }
    for (const z of [0.12, -0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.eyeMat);
      eye.position.set(0.98, 0.14, z);
      this.body.add(eye);
    }
    // four legs: hip -> thigh -> knee -> shin
    [[0.45, 0.24], [0.45, -0.24], [-0.4, 0.24], [-0.4, -0.24]].forEach(([x, z], i) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0, z);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 10), this.mat);
      thigh.position.y = 0.25;
      thigh.castShadow = true;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = 0.5;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.62, 10), this.mat);
      shin.position.y = -0.31;
      shin.castShadow = true;
      knee.add(shin);
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, phase: i % 2 ? Math.PI : 0 });
    });
    this.body.position.y = 0.55;
    this.root.add(this.body);
  }

  update(s: Shade, dt: number, t: number, smoke: Particles): void {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = -turnToward(this, s.yaw, dt);
    const tt = t + this.seed;
    const moving = s.state === 'walk' || s.state === 'strike';
    const crouch = s.state === 'windup' ? s.stateT / CFG.crawler.windup : 0;
    const leap = s.state === 'strike';
    const rise = s.state === 'rise' ? Math.min(1, s.stateT / CFG.shade.riseTime) : 1;
    this.body.position.y = (0.55 - crouch * 0.25 + (leap ? 0.35 : 0) + Math.sin(tt * 14) * 0.02 * (moving ? 1 : 0)) * rise - (1 - rise) * 0.6;
    this.body.rotation.z = leap ? 0.25 : -crouch * 0.15;
    for (const l of this.legs) {
      const p = tt * 14 + l.phase;
      l.hip.rotation.z = leap ? -1.2 : moving ? Math.sin(p) * 0.6 - 0.4 : -0.4 - crouch * 0.4;
      l.knee.rotation.z = leap ? 2.2 : 2.0 + (moving ? Math.max(0, Math.cos(p)) * 0.5 : crouch * 0.6);
    }
    const opacity = s.state === 'dead' ? Math.max(0, 1 - s.deadT * 3.5) : 1;
    this.flash = Math.max(0, this.flash - dt * 6);
    fade([this.mat], opacity, this.flash, crouch * crouch);
    this.root.visible = opacity > 0.01;
    const tel = s.state === 'windup' ? 1 + 2.5 * crouch : 1;
    this.eyeMat.color.setRGB(4.5 * tel, 0.8 * tel, 0.3);
    this.eyeMat.opacity = opacity;
    if (s.state !== 'dead' && Math.random() < dt * 14)
      smoke.emit({ x: s.x - Math.cos(s.yaw) * 0.5, y: s.y + 0.4, z: s.z - Math.sin(s.yaw) * 0.5, vx: -Math.cos(s.yaw) * 0.6, vz: -Math.sin(s.yaw) * 0.6, vy: 0.3, spread: 0.2, life: 0.7, size: 0.5, sizeEnd: 1, r: 0.02, g: 0.01, b: 0.04, alpha: 0.6, drag: 1.5 });
  }
}

/** Lantern-eater: a black iron cage holding a stolen violet ember, a torn cloak, thin reaching arms. */
export class LanternMesh implements EnemyMesh {
  readonly root = new THREE.Group();
  flash = 0;
  turnYaw?: number;
  private body = new THREE.Group();
  private mat = black('lantern');
  private cloakMat: THREE.MeshStandardMaterial;
  private core: THREE.Sprite;
  private arms: THREE.Group[] = [];
  private seed = Math.random() * 10;

  constructor() {
    const tat = tatterTexture(77);
    this.cloakMat = rimify(
      new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, specularIntensity: 0, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }),
      0.6,
      'lanterncloak',
      ENEMY_RIM,
    );
    // the cage: rings and ribs around a hollow head
    const cage = new THREE.Group();
    cage.position.y = 1.35;
    for (const y of [-0.32, 0.32]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 28), this.mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      cage.add(ring);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), this.mat);
      rib.position.set(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27);
      cage.add(rib);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.4, 20), this.mat);
    cap.position.y = 0.52;
    cage.add(cap);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 16, Math.PI * 1.4), this.mat);
    hook.position.y = 0.82;
    cage.add(hook);
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0.8, 0.3, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.core.scale.setScalar(0.7);
    cage.add(this.core);
    this.body.add(cage);
    // the cloak hangs from the cage and trails into smoke
    const cloakGeo = new THREE.ConeGeometry(0.5, 1.5, 24, 8, true);
    cloakGeo.translate(0, -0.15, 0);
    const cloak = new THREE.Mesh(cloakGeo, this.cloakMat);
    cloak.rotation.x = Math.PI;
    cloak.position.y = 0.55;
    cloak.castShadow = true;
    this.body.add(cloak);
    for (const z of [0.3, -0.3]) {
      const arm = new THREE.Group();
      arm.position.set(0.05, 1.0, z);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.9, 8), this.mat);
      bone.position.y = -0.45;
      arm.add(bone);
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.root.add(this.body);
  }

  update(s: Shade, dt: number, t: number, smoke: Particles, embers: Particles): void {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = -turnToward(this, s.yaw, dt);
    const tt = t + this.seed;
    const charge = s.state === 'windup' ? s.stateT / CFG.lantern.windup : 0;
    const rise = s.state === 'rise' ? Math.min(1, s.stateT / CFG.shade.riseTime) : 1;
    this.body.scale.setScalar(0.3 + 0.7 * rise);
    this.body.rotation.z = Math.sin(tt * 1.3) * 0.08 - charge * 0.2;
    this.arms.forEach((a, i) => (a.rotation.z = 0.6 + Math.sin(tt * 2 + i) * 0.2 + charge * 1.4));
    const opacity = s.state === 'dead' ? Math.max(0, 1 - s.deadT * 3.5) : 1;
    this.flash = Math.max(0, this.flash - dt * 6);
    fade([this.mat, this.cloakMat], opacity, this.flash, charge * charge);
    this.root.visible = opacity > 0.01;
    // the stolen ember swells as it gathers a bolt
    const pulse = 0.85 + 0.15 * Math.sin(tt * 5);
    this.core.scale.setScalar((0.6 + charge * 0.9) * pulse);
    (this.core.material as THREE.SpriteMaterial).opacity = opacity;
    if (s.state === 'dead') return;
    if (Math.random() < dt * 18)
      smoke.emit({ x: s.x + (Math.random() - 0.5) * 0.4, y: s.y + 0.1, z: s.z + (Math.random() - 0.5) * 0.4, vy: -0.4, spread: 0.2, life: 1.0, size: 0.6, sizeEnd: 1.2, r: 0.02, g: 0.01, b: 0.05, alpha: 0.6, drag: 1 });
    if (charge > 0 && Math.random() < dt * 40)
      embers.emit({ x: s.x + (Math.random() - 0.5) * 1.2, y: s.y + 1.35 + (Math.random() - 0.5) * 1.2, z: s.z + (Math.random() - 0.5) * 1.2, vx: 0, vy: 0, spread: 0.2, life: 0.4, size: 0.07, sizeEnd: 0.02, r: 1.4, g: 0.6, b: 4, drag: 2 });
  }
}
