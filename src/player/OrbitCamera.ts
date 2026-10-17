import * as THREE from 'three';
import { CAMERA, type CameraMode } from '../config';

export interface OrbitTarget {
  feet: THREE.Vector3;
  /** Camera orbit angles (same conventions as the FP yaw / pitch: positive pitch looks up). */
  orbitYaw: number;
  orbitPitch: number;
}

/**
 * Third-person free orbit: the camera sits on a sphere around a pivot above the feet, looking
 * at it along the orbit direction, and is pulled in front of anything between it and the pivot.
 * The controller owns the orbit angles (mouse input); this only places the render camera.
 */
export class OrbitCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'fp';
  /** Orbit radius override used by autotest `__game.view(dist, yawDeg, height)`. */
  private distOverride: number | null = null;
  /** Smoothed (collision-limited) orbit radius. */
  private dist: number = CAMERA.thirdPerson.dist;
  private readonly head = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();

  constructor(private readonly colliders: THREE.Box3[]) {
    const tp = CAMERA.thirdPerson;
    this.camera = new THREE.PerspectiveCamera(tp.fov, 1, tp.near, CAMERA.far);
    this.camera.layers.enableAll();
    this.camera.rotation.order = 'YXZ';
  }

  setMode(mode: CameraMode): void {
    if (mode === 'tp' && this.mode !== 'tp') this.dist = this.targetDist;
    this.mode = mode;
    if (mode === 'fp') this.distOverride = null;
  }

  toggle(): CameraMode {
    this.setMode(this.mode === 'fp' ? 'tp' : 'fp');
    return this.mode;
  }

  private get targetDist(): number {
    return this.distOverride ?? CAMERA.thirdPerson.dist;
  }

  /** Autotest: `null` restores FP; otherwise forces TP at the given orbit radius. */
  setDebugView(dist: number | null): void {
    if (dist === null) {
      this.setMode('fp');
      return;
    }
    this.setMode('tp');
    this.distOverride = dist;
    this.dist = dist;
  }

  /** Orbit pitch that puts the camera `height` m above the feet at radius `dist`. */
  static pitchForHeight(dist: number, height: number): number {
    const tp = CAMERA.thirdPerson;
    const s = THREE.MathUtils.clamp((tp.pivotY - height) / Math.max(dist, 1e-3), -1, 1);
    return THREE.MathUtils.clamp(Math.asin(s), tp.minPitch, tp.maxPitch);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Places the orbit cam and returns it when in TP; otherwise returns `fpCamera`. */
  update(target: OrbitTarget, fpCamera: THREE.PerspectiveCamera, dt: number): THREE.PerspectiveCamera {
    if (this.mode === 'fp') return fpCamera;

    const tp = CAMERA.thirdPerson;
    const yaw = target.orbitYaw;
    const pitch = target.orbitPitch;
    const cp = Math.cos(pitch);
    this.fwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    this.head.set(target.feet.x, target.feet.y + tp.pivotY, target.feet.z);

    // Unit-radius offset from the head: back along the view, plus the shoulder to the right.
    const want = this.targetDist;
    const shoulder = tp.shoulder / Math.max(want, 1e-3);
    this.offset.copy(this.fwd).negate();
    this.offset.x += Math.cos(yaw) * shoulder;
    this.offset.z -= Math.sin(yaw) * shoulder;
    const len = this.offset.length();
    this.offset.divideScalar(len);

    // Collision: nearest box between the head and the desired camera spot.
    let allowed = want * len;
    this.ray.set(this.head, this.offset);
    for (const box of this.colliders) {
      if (box.containsPoint(this.head)) continue;
      if (!this.ray.intersectBox(box, this.hit)) continue;
      const d = this.hit.distanceTo(this.head) - tp.collisionPad;
      if (d < allowed) allowed = d;
    }
    allowed = Math.max(tp.minDist, allowed) / len;

    // Snap in so the camera never sits inside a wall; ease back out.
    if (allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-tp.zoomOutRate * dt));

    this.camera.aspect = fpCamera.aspect;
    this.camera.fov = tp.fov;
    this.camera.near = tp.near;
    this.camera.far = fpCamera.far;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.head).addScaledVector(this.offset, this.dist * len);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    return this.camera;
  }

  /** World-space view direction of the orbit camera as of the last `update`. */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.fwd);
  }
}
