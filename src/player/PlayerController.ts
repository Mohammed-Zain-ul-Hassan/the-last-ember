import * as THREE from 'three';
import { PLAYER } from '../config';

/** Keys whose default browser behaviour (sticky keys, scrolling, focus change) must be suppressed. */
const BLOCKED_CODES = new Set(['ShiftLeft', 'ShiftRight', 'Space', 'Tab']);
const JUMP_BUFFER_SEC = 0.12;
const EPS = 1e-4;

/**
 * First-person controller: pointer-lock mouse look, WASD + sprint + jump, and
 * axis-separated AABB collision against static boxes.
 */
export class PlayerController {
  readonly feet = PLAYER.spawn.clone();
  readonly velocity = new THREE.Vector3();
  yaw: number = PLAYER.spawnYaw;
  pitch = 0;
  onGround = false;
  /** When false, input and physics are ignored (e.g. during Recall). */
  enabled = true;

  onRecall: (() => void) | null = null;
  onJump: (() => void) | null = null;
  onRespawn: (() => void) | null = null;

  private readonly keys = new Set<string>();
  private jumpBuffer = 0;
  /** Visual-only camera offset that smooths out stair step-ups. */
  private stepSmooth = 0;
  private readonly wish = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly lockTarget: HTMLElement,
    private readonly colliders: THREE.Box3[],
  ) {
    this.camera.rotation.order = 'YXZ';
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp, { passive: false });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', () => {
      if (!this.isLocked()) this.keys.clear();
    });
  }

  /** Horizontal speed in m/s. */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get walking(): boolean {
    return this.keys.has('KeyV') && !this.sprinting;
  }

  get sprinting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.lockTarget;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (BLOCKED_CODES.has(e.code)) e.preventDefault();
    if (!this.isLocked()) return;
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Space') this.jumpBuffer = JUMP_BUFFER_SEC;
    if (e.code === 'KeyE') this.onRecall?.();
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (BLOCKED_CODES.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isLocked() || !this.enabled) return;
    // Drop occasional bogus spikes some browsers emit on pointer-lock transitions.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.yaw -= e.movementX * PLAYER.mouseSensitivity;
    this.pitch -= e.movementY * PLAYER.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PLAYER.maxPitch, PLAYER.maxPitch);
  };

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.enabled) return;
    const frameDt = Math.min(dt, PLAYER.maxFrameDt);
    const steps = Math.max(1, Math.ceil(frameDt / PLAYER.maxSubstep));
    const h = frameDt / steps;
    for (let i = 0; i < steps; i++) this.step(h);

    this.jumpBuffer = Math.max(0, this.jumpBuffer - frameDt);
    this.stepSmooth *= Math.exp(-frameDt * 18);
    if (Math.abs(this.stepSmooth) < 1e-3) this.stepSmooth = 0;

    if (this.feet.y < PLAYER.respawnY) this.respawn();
  }

  private step(h: number): void {
    // Wish direction from WASD relative to yaw.
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    this.wish.set(-sin * fwd + cos * strafe, 0, -cos * fwd - sin * strafe);
    const hasInput = this.wish.lengthSq() > 0;
    if (hasInput) this.wish.normalize();

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const walking = this.keys.has('KeyV') && !sprinting;
    const speed = walking ? PLAYER.slowWalkSpeed : PLAYER.walkSpeed * (sprinting ? PLAYER.sprintMultiplier : 1);

    // Horizontal velocity: snappy on the ground, limited air control that preserves momentum.
    if (this.onGround || hasInput) {
      const accel = this.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
      const tx = this.wish.x * speed;
      const tz = this.wish.z * speed;
      const dx = tx - this.velocity.x;
      const dz = tz - this.velocity.z;
      const dist = Math.hypot(dx, dz);
      const maxDelta = accel * h;
      if (dist <= maxDelta || dist < EPS) {
        this.velocity.x = tx;
        this.velocity.z = tz;
      } else {
        this.velocity.x += (dx / dist) * maxDelta;
        this.velocity.z += (dz / dist) * maxDelta;
      }
    }

    // Jump (buffered so a slightly-early press still counts on landing).
    if (this.jumpBuffer > 0 && this.onGround) {
      this.velocity.y = PLAYER.jumpVelocity;
      this.onGround = false;
      this.jumpBuffer = 0;
      this.onJump?.();
    }

    this.velocity.y += PLAYER.gravity * h;

    this.moveHorizontal('x', this.velocity.x * h);
    this.moveHorizontal('z', this.velocity.z * h);
    this.moveVertical(this.velocity.y * h);
  }

  /** A box blocks horizontally only if it rises above step height and reaches the body. */
  private isWall(box: THREE.Box3): boolean {
    return box.max.y > this.feet.y + PLAYER.stepUp && box.min.y < this.feet.y + PLAYER.height;
  }

  private overlapsFootprint(box: THREE.Box3): boolean {
    const r = PLAYER.radius;
    return (
      this.feet.x + r > box.min.x + EPS &&
      this.feet.x - r < box.max.x - EPS &&
      this.feet.z + r > box.min.z + EPS &&
      this.feet.z - r < box.max.z - EPS
    );
  }

  private moveHorizontal(axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return;
    this.feet[axis] += delta;
    const r = PLAYER.radius;
    for (const box of this.colliders) {
      if (!this.isWall(box) || !this.overlapsFootprint(box)) continue;
      if (delta > 0) this.feet[axis] = box.min[axis] - r - EPS;
      else this.feet[axis] = box.max[axis] + r + EPS;
      this.velocity[axis] = 0;
    }
  }

  private moveVertical(delta: number): void {
    const wasOnGround = this.onGround;
    this.feet.y += delta;

    // Ceiling: stop upward motion when the head enters a box overhead.
    if (this.velocity.y > 0) {
      const head = this.feet.y + PLAYER.height;
      for (const box of this.colliders) {
        if (!this.overlapsFootprint(box)) continue;
        if (box.min.y > this.feet.y + PLAYER.stepUp && head > box.min.y && this.feet.y < box.max.y) {
          this.feet.y = box.min.y - PLAYER.height;
          this.velocity.y = 0;
        }
      }
    }

    // Track the highest supporting surface beneath the player (within step-up reach).
    let support = -Infinity;
    for (const box of this.colliders) {
      if (!this.overlapsFootprint(box)) continue;
      const top = box.max.y;
      if (top <= this.feet.y + PLAYER.stepUp && top > support) support = top;
    }

    this.onGround = false;
    if (this.velocity.y <= 0 && support > -Infinity) {
      const gap = this.feet.y - support;
      // Land / step up, or stick to the ground while walking down stairs.
      if (gap <= EPS || (wasOnGround && gap <= PLAYER.stepUp)) {
        if (wasOnGround) this.stepSmooth += this.feet.y - support;
        this.feet.y = support;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // External control
  // ---------------------------------------------------------------------------

  /** Directly sets pose without physics (used while Recall drives the camera). */
  setPose(position: THREE.Vector3, yaw: number, pitch: number): void {
    this.feet.copy(position);
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, -PLAYER.maxPitch, PLAYER.maxPitch);
  }

  /** Places the player and clears all motion state. */
  teleport(position: THREE.Vector3, yaw: number, pitch: number): void {
    this.setPose(position, yaw, pitch);
    this.velocity.set(0, 0, 0);
    this.stepSmooth = 0;
    this.jumpBuffer = 0;
    this.onGround = false;
  }

  respawn(): void {
    this.teleport(PLAYER.spawn, PLAYER.spawnYaw, 0);
    this.onRespawn?.();
  }

  syncCamera(bobY = 0, roll = 0): void {
    this.camera.position.set(this.feet.x, this.feet.y + PLAYER.eyeHeight + this.stepSmooth + bobY, this.feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
  }
}
