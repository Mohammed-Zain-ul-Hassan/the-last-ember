import * as THREE from 'three';

export interface Shot {
  yaw: number; // radians around the target, 0 = straight side view
  height: number;
  dist: number;
  lookY: number;
  fov: number;
}

export const GAMEPLAY_SHOT: Shot = { yaw: 0.21, height: 3.1, dist: 17, lookY: 2.75, fov: 36 };
export const CARD_SHOT: Shot = { yaw: 0.85, height: 7.5, dist: 21, lookY: 2.6, fov: 34 };
export const TITLE_SHOT: Shot = { yaw: -0.32, height: 1.25, dist: 7.6, lookY: 2.1, fov: 38 };
export const MIDNIGHT_SHOT: Shot = { yaw: -0.5, height: 1.5, dist: 7.5, lookY: 1.7, fov: 34 };
export const TORCH_SHOT: Shot = { yaw: 0.24, height: 2.7, dist: 13, lookY: 2.3, fov: 36 };
export const DAWN_SHOT: Shot = { yaw: 0.28, height: 3.4, dist: 19, lookY: 3.2, fov: 36 };
export const ENDING_SHOT: Shot = { yaw: -0.35, height: 1.8, dist: 8, lookY: 2.0, fov: 36 };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Follow camera with authored shots, trauma shake and zoom punches. */
export class CameraRig {
  private cur: Shot = { ...TITLE_SHOT };
  private from: Shot = { ...TITLE_SHOT };
  private to: Shot = { ...TITLE_SHOT };
  private tweenT = 1;
  private tweenDur = 1;
  x = 0;
  private trauma = 0;
  private punch = 0;
  shakeScale = 1;
  orbit = 0; // extra slow yaw drift for title/cards
  minSpan = 17.5;
  zoom = 1; // <1 leans in (combat), eased
  zoomTarget = 1;
  fitSpan = true; // close-ups turn this off

  private cam: THREE.PerspectiveCamera;

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
  }

  go(shot: Shot, dur: number): void {
    this.from = { ...this.cur };
    this.to = { ...shot };
    this.tweenT = 0;
    this.tweenDur = Math.max(0.001, dur);
  }

  snap(shot: Shot): void {
    this.cur = { ...shot };
    this.to = { ...shot };
    this.tweenT = 1;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kick(amount: number): void {
    this.punch = Math.min(1.5, this.punch + amount);
  }

  update(dt: number, t: number, targetX: number): void {
    if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / this.tweenDur);
      const e = ease(this.tweenT);
      for (const k of Object.keys(this.cur) as (keyof Shot)[]) this.cur[k] = this.from[k] + (this.to[k] - this.from[k]) * e;
    }
    this.x += (targetX - this.x) * Math.min(1, dt * 3.2);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.punch = Math.max(0, this.punch - dt * 5);

    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * (this.zoomTarget < this.zoom ? 2.5 : 1.2));
    const s = this.cur;
    const yaw = s.yaw + this.orbit;
    // keep ~minSpan metres of lane visible whatever the aspect ratio
    const fit = this.minSpan / 2 / (Math.tan((s.fov * Math.PI) / 360) * this.cam.aspect);
    const dist = (this.fitSpan ? Math.max(s.dist, fit * (s.dist / GAMEPLAY_SHOT.dist)) : s.dist) * (1 - this.punch * 0.05) * this.zoom;
    const sh = this.trauma * this.trauma * 0.35 * this.shakeScale;
    const nx = (Math.sin(t * 47.1) + Math.sin(t * 23.3)) * 0.5 * sh;
    const ny = (Math.sin(t * 41.7 + 1) + Math.sin(t * 19.9)) * 0.5 * sh;
    this.cam.position.set(this.x + Math.sin(yaw) * dist + nx, s.height + ny, Math.cos(yaw) * dist);
    this.cam.lookAt(this.x + nx * 0.5, s.lookY + ny * 0.5, 0);
    if (Math.abs(this.cam.fov - s.fov) > 0.01) {
      this.cam.fov = s.fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
