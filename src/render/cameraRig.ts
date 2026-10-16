import * as THREE from 'three';
import { firstHit, type Solid } from '../sim/geom';

/** An authored shot around a target point. yaw 0 puts the camera on +z looking toward -z. */
export interface Shot {
  yaw: number; // radians around the target
  height: number;
  dist: number;
  lookY: number;
  fov: number;
  lead?: number; // look this far ahead of the target along +x (the road): reveals look into the place he enters
}

export const CARD_SHOT: Shot = { yaw: 0.85, height: 7.5, dist: 21, lookY: 2.6, fov: 34 };
export const TITLE_SHOT: Shot = { yaw: -0.32, height: 1.25, dist: 7.6, lookY: 2.1, fov: 38 };
export const MIDNIGHT_SHOT: Shot = { yaw: -0.5, height: 1.5, dist: 7.5, lookY: 1.7, fov: 34 };
export const DAWN_SHOT: Shot = { yaw: 0.28, height: 3.4, dist: 19, lookY: 3.2, fov: 36 };
/** The hour card on the road: high behind him, looking down the street (or the nave, or along the wall). */
export const ROAD_CARD_SHOT: Shot = { yaw: -1.25, height: 9, dist: 16, lookY: 2.6, fov: 44, lead: 6 };
/**
 * First sight of each place, while play continues: a crane over the street, a high look across the market, low and
 * looking up the nave, out over the drop beside the wall. yaw -PI/2 is straight behind him on the road.
 */
export const REVEAL_SHOTS: Record<string, Shot> = {
  street: { yaw: -1.35, height: 7, dist: 11, lookY: 2.5, fov: 52, lead: 9 },
  market: { yaw: -1.0, height: 9.5, dist: 13, lookY: 1, fov: 55, lead: 9 },
  nave: { yaw: -1.5708, height: 1.2, dist: 5, lookY: 9, fov: 62, lead: 12 },
  apse: { yaw: -1.75, height: 2.5, dist: 7, lookY: 10, fov: 58, lead: 14 },
  rampart: { yaw: -0.6, height: 6, dist: 12, lookY: 0, fov: 50, lead: 6 },
  gatehouse: { yaw: -1.3, height: 3, dist: 9, lookY: 9, fov: 55, lead: 12 },
};
export const ENDING_SHOT: Shot = { yaw: -0.35, height: 1.8, dist: 8, lookY: 2.0, fov: 36 };

/** The third-person camera: behind his right shoulder, looking where the mouse points. */
export const FOLLOW = { dist: 6.2, torchDist: 5.6, height: 1.95, shoulder: 0.95, fov: 55, minPitch: -0.55, maxPitch: 1.05, pitch: 0.24 };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

/** Authored shots and a mouse-driven follow camera, blended by tweens, with trauma shake and zoom punches. */
export class CameraRig {
  private cam: THREE.PerspectiveCamera;
  private mode: 'shot' | 'follow' = 'shot';
  private shot: Shot = { ...TITLE_SHOT };
  private from: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 38 };
  private live: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 38 };
  private tweenT = 1;
  private tweenDur = 1;
  private trauma = 0;
  private punch = 0;
  private boom = FOLLOW.dist; // current follow distance after wall pull-in (eased)
  private shoulder = FOLLOW.shoulder; // current shoulder offset after wall pull-in (eased)
  shakeScale = 1;
  orbit = 0; // extra slow yaw drift for title/cards
  zoom = 1; // <1 leans in (combat), eased
  zoomTarget = 1;
  /** Follow camera heading on the ground: forward is (cos yaw, sin yaw) on x/z. */
  yaw = -Math.PI / 2;
  pitch = FOLLOW.pitch; // positive looks down at him
  torch = false; // the torch road sits a little closer
  /** What shots frame and what the follow camera orbits (feet position). */
  readonly target = new THREE.Vector3();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
  }

  get following(): boolean {
    return this.mode === 'follow';
  }

  private capture(): void {
    this.from.pos.copy(this.cam.position);
    this.cam.getWorldDirection(this.v);
    this.from.look.copy(this.cam.position).addScaledVector(this.v, Math.max(4, this.cam.position.distanceTo(this.live.look)));
    this.from.fov = this.cam.fov;
  }

  /** Tween to an authored shot around the target. */
  go(shot: Shot, dur: number): void {
    this.capture();
    this.mode = 'shot';
    this.shot = { ...shot };
    this.tweenT = 0;
    this.tweenDur = Math.max(0.001, dur);
  }

  snap(shot: Shot): void {
    this.mode = 'shot';
    this.shot = { ...shot };
    this.tweenT = 1;
  }

  /** Tween into the follow camera. keepYaw = false turns it to the heading the current view already has. */
  follow(dur: number, yaw?: number): void {
    this.capture();
    if (yaw !== undefined) this.yaw = yaw;
    else {
      this.cam.getWorldDirection(this.v);
      this.yaw = Math.atan2(this.v.z, this.v.x);
    }
    this.pitch = FOLLOW.pitch;
    this.mode = 'follow';
    this.tweenT = 0;
    this.tweenDur = Math.max(0.001, dur);
  }

  /** Mouse look in pixels. sens 0..1. */
  look(dx: number, dy: number, sens: number, invertY: boolean): void {
    const k = 0.0007 + sens * 0.0045;
    this.yaw += dx * k;
    this.pitch = Math.max(FOLLOW.minPitch, Math.min(FOLLOW.maxPitch, this.pitch + dy * k * (invertY ? -1 : 1)));
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kick(amount: number): void {
    this.punch = Math.min(1.5, this.punch + amount);
  }

  private shotPose(out: Pose): void {
    const s = this.shot;
    const yaw = s.yaw + this.orbit;
    const t = this.target;
    out.pos.set(t.x + Math.sin(yaw) * s.dist, s.height + t.y * 0.8, t.z + Math.cos(yaw) * s.dist);
    out.look.set(t.x + (s.lead ?? 0), s.lookY + t.y * 0.8, t.z);
    out.fov = s.fov;
  }

  private followPose(out: Pose, dt: number, solids: readonly Solid[]): void {
    const t = this.target;
    const fx = Math.cos(this.yaw);
    const fz = Math.sin(this.yaw);
    // pivot: his head height, nudged over the right shoulder (less of it when a wall stands at that shoulder)
    const py = t.y + FOLLOW.height;
    const sh = firstHit(solids, t.x, py, t.z, t.x - fz * (FOLLOW.shoulder + 0.4), py, t.z + fx * (FOLLOW.shoulder + 0.4));
    const shoulderWant = sh < 1 ? Math.max(0, sh * (FOLLOW.shoulder + 0.4) - 0.4) : FOLLOW.shoulder;
    this.shoulder += (shoulderWant - this.shoulder) * Math.min(1, dt * (shoulderWant < this.shoulder ? 14 : 3));
    const px = t.x - fz * this.shoulder;
    const pz = t.z + fx * this.shoulder;
    const cp = Math.cos(this.pitch);
    const want = (this.torch ? FOLLOW.torchDist : FOLLOW.dist) * this.zoom;
    const bx = -fx * cp;
    const by = Math.sin(this.pitch);
    const bz = -fz * cp;
    // a wall between him and the camera pulls it in (fast), and it eases back out (slowly)
    const hit = firstHit(solids, px, py, pz, px + bx * (want + 0.3), py + by * (want + 0.3), pz + bz * (want + 0.3));
    const room = hit < 1 ? Math.max(0.9, hit * (want + 0.3) - 0.35) : want;
    this.boom += (room - this.boom) * Math.min(1, dt * (room < this.boom ? 18 : 3));
    const d = Math.min(this.boom, want);
    out.pos.set(px + bx * d, Math.max(0.35, py + by * d), pz + bz * d);
    out.look.set(px + fx * 2, py - Math.sin(this.pitch) * 0.6 + 0.15, pz + fz * 2);
    out.fov = FOLLOW.fov;
  }

  update(dt: number, t: number, solids: readonly Solid[] = []): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.punch = Math.max(0, this.punch - dt * 5);
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * (this.zoomTarget < this.zoom ? 2.5 : 1.2));

    if (this.mode === 'follow') this.followPose(this.live, dt, solids);
    else this.shotPose(this.live);
    const pos = this.v.copy(this.live.pos);
    const look = this.v2.copy(this.live.look);
    let fov = this.live.fov;
    if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / this.tweenDur);
      const e = ease(this.tweenT);
      pos.lerpVectors(this.from.pos, pos, e);
      look.lerpVectors(this.from.look, look, e);
      fov = this.from.fov + (fov - this.from.fov) * e;
    }
    // punch: lean toward what we look at
    if (this.punch > 0) pos.lerp(look, Math.min(0.2, this.punch * 0.05));
    const sh = this.trauma * this.trauma * 0.35 * this.shakeScale * (this.mode === 'follow' ? 0.6 : 1);
    const nx = (Math.sin(t * 47.1) + Math.sin(t * 23.3)) * 0.5 * sh;
    const ny = (Math.sin(t * 41.7 + 1) + Math.sin(t * 19.9)) * 0.5 * sh;
    const nz = (Math.sin(t * 37.3 + 2) + Math.sin(t * 29.1)) * 0.5 * sh;
    this.cam.position.set(pos.x + nx, pos.y + ny, pos.z + nz);
    this.cam.lookAt(look.x + nx * 0.5, look.y + ny * 0.5, look.z + nz * 0.5);
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
