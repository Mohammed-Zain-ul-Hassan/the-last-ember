import * as THREE from 'three';
import { CAMERA, CHRONO_DASH, PLAYER, SHADOW_MOVE, type CameraMode } from '../config';
import { AUTOTEST } from '../debug/TestHooks';
import { runtimeControls } from '../ui/Settings';

/** Keys whose default browser behaviour (sticky keys, scrolling, focus change) must be suppressed. */
const BLOCKED_CODES = new Set(['ShiftLeft', 'ShiftRight', 'Space', 'Tab', 'KeyC', 'KeyQ']);
const JUMP_BUFFER_SEC = 0.12;
const EPS = 1e-4;

export type MoveState = 'ground' | 'slide' | 'crouch' | 'air';
/** Runner: Mirror's Edge momentum + slide. Shadow: Skyrim run / stamina sprint / sneak. */
export type MoveProfile = 'runner' | 'shadow';

/**
 * First-person controller: pointer-lock mouse look, WASD movement in one of two profiles
 * (runner: momentum sprint + slide; shadow: stamina sprint + sneak), jump, and axis-separated
 * AABB collision against static boxes.
 */
export class PlayerController {
  readonly feet = PLAYER.spawn.clone();
  readonly velocity = new THREE.Vector3();
  yaw: number = PLAYER.spawnYaw;
  pitch = 0;
  onGround = false;
  /** When false, input and physics are ignored (e.g. during Recall). */
  enabled = true;
  /** Current capsule height; shrinks while crouching or sliding. */
  height: number = PLAYER.height;
  /** Extra sprint speed built up by running, on top of PLAYER.runSpeed. */
  momentum = 0;
  sliding = false;
  /** Seconds since the current slide started. */
  slideT = 0;
  profile: MoveProfile = 'runner';
  /** Shadow-form sprint stamina. */
  stamina: number = SHADOW_MOVE.staminaMax;
  /** True while actually sprinting this frame (either profile). */
  sprintActive = false;
  /**
   * In TP the mouse drives the orbit camera instead of the body: movement is relative to
   * orbitYaw and `yaw` (body facing) turns towards the move direction, or the aim while `aiming`.
   */
  cameraMode: CameraMode = 'fp';
  orbitPitch = 0;
  /**
   * Autotest `view()`: holds the orbit at this yaw offset from the body and moves relative to
   * the body, like a body-locked camera. Any orbit look (mouse, `orbitLook`) clears it.
   */
  orbitLock: number | null = null;
  private freeOrbitYaw: number = PLAYER.spawnYaw;
  /** Set each frame by the game: a spell hand is busy, so the body faces the camera. */
  aiming = false;

  onRecall: (() => void) | null = null;
  /** Mouse buttons by hand: 0 = left hand (LMB), 1 = right hand (RMB). */
  onHandPress: ((hand: 0 | 1) => void) | null = null;
  onHandRelease: ((hand: 0 | 1) => void) | null = null;
  /** Q: switch between the runner and shadow forms. */
  onFormToggle: (() => void) | null = null;
  /** T: toggle first-person / third-person camera. */
  onCameraToggle: (() => void) | null = null;
  onJump: (() => void) | null = null;
  /** Air chrono-dash (second jump) — horizontal burst. */
  onChronoDash: (() => void) | null = null;
  onRespawn: (() => void) | null = null;
  onSlide: (() => void) | null = null;
  /** Fires on touchdown with the fall speed (m/s, positive). */
  onLand: ((impact: number) => void) | null = null;

  private readonly keys = new Set<string>();
  private jumpBuffer = 0;
  private slideBuffer = 0;
  private staminaWait = 0;
  private exhausted = false;
  /** Remaining air chrono-dashes; refilled on landing. */
  private airCharges = CHRONO_DASH.airCharges;
  /** Visual-only camera offset that smooths out stair step-ups. */
  private stepSmooth = 0;
  private readonly wish = new THREE.Vector3();
  private readonly dashDir = new THREE.Vector3();
  private hasMoveInput = false;

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
    document.addEventListener('mousedown', (e) => {
      if ((e.button === 0 || e.button === 2) && this.isLocked()) this.press(`Mouse${e.button}`);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 || e.button === 2) this.release(`Mouse${e.button}`);
    });
    // Right mouse is the right hand: never open the browser menu.
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!this.isLocked()) this.keys.clear();
    });
  }

  /** Horizontal speed in m/s. */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get eyeHeight(): number {
    return this.height - (PLAYER.height - PLAYER.eyeHeight);
  }

  get state(): MoveState {
    if (!this.onGround) return 'air';
    if (this.sliding) return 'slide';
    return this.height < PLAYER.height - 0.05 ? 'crouch' : 'ground';
  }

  /** 0 when standing, 1 at full crouch / slide height. */
  get crouchAmount(): number {
    return THREE.MathUtils.clamp((PLAYER.height - this.height) / (PLAYER.height - PLAYER.crouchHeight), 0, 1);
  }

  get sprinting(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  isLocked(): boolean {
    return AUTOTEST || document.pointerLockElement === this.lockTarget;
  }

  /** Playtest only: replaces the held keys (added keys count as presses, removed ones as releases). */
  setTestKeys(codes: string[]): void {
    for (const c of codes) if (!this.keys.has(c)) this.press(c);
    for (const c of this.keys) if (!codes.includes(c)) this.release(c);
    this.keys.clear();
    for (const c of codes) this.keys.add(c);
  }

  /** Playtest only: a single key press and release (jump, recall, a quick throw...). */
  tapTestKey(code: string): void {
    this.press(code);
    this.release(code);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (BLOCKED_CODES.has(e.code)) e.preventDefault();
    if (!this.isLocked()) return;
    this.keys.add(e.code);
    if (!e.repeat) this.press(e.code);
  };

  private press(code: string): void {
    if (code === 'Space') this.jumpBuffer = JUMP_BUFFER_SEC;
    if (code === 'KeyC') this.slideBuffer = PLAYER.slideBuffer;
    if (code === 'KeyE') this.onRecall?.();
    if (code === 'KeyQ') this.onFormToggle?.();
    if (code === 'KeyT') this.onCameraToggle?.();
    if (code === 'Mouse0') this.onHandPress?.(0);
    if (code === 'Mouse2') this.onHandPress?.(1);
  }

  private release(code: string): void {
    if (code === 'Mouse0') this.onHandRelease?.(0);
    if (code === 'Mouse2') this.onHandRelease?.(1);
  }

  /** Switches movement rules (called by the form controller at the swap point). */
  setProfile(profile: MoveProfile): void {
    if (this.sliding) this.endSlide();
    this.profile = profile;
    this.momentum = 0;
    this.slideBuffer = 0;
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (BLOCKED_CODES.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isLocked() || !this.enabled) return;
    // Drop occasional bogus spikes some browsers emit on pointer-lock transitions.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    const sens = runtimeControls.mouseSensitivity;
    if (this.cameraMode === 'tp') {
      this.orbitLook(
        this.orbitYaw - e.movementX * sens,
        this.orbitPitch - e.movementY * sens,
      );
      return;
    }
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PLAYER.maxPitch, PLAYER.maxPitch);
  };

  get orbitYaw(): number {
    return this.orbitLock === null ? this.freeOrbitYaw : this.yaw + this.orbitLock;
  }

  /** Sets the TP orbit angles (pitch clamped to the orbit range). */
  orbitLook(yaw: number, pitch: number): void {
    const tp = CAMERA.thirdPerson;
    this.orbitLock = null;
    this.freeOrbitYaw = yaw;
    this.orbitPitch = THREE.MathUtils.clamp(pitch, tp.minPitch, tp.maxPitch);
  }

  /** Switches the look scheme, carrying the view direction across so it doesn't jump. */
  setCameraMode(mode: CameraMode): void {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    if (mode === 'tp') {
      this.orbitLook(this.yaw, CAMERA.thirdPerson.enterPitch);
    } else {
      this.yaw = this.orbitYaw;
      this.pitch = THREE.MathUtils.clamp(this.orbitPitch, -PLAYER.maxPitch, PLAYER.maxPitch);
      this.orbitLock = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.enabled) return;
    const frameDt = Math.min(dt, PLAYER.maxFrameDt);
    const steps = Math.max(1, Math.ceil(frameDt / PLAYER.maxSubstep));
    const h = frameDt / steps;
    for (let i = 0; i < steps; i++) this.step(h);
    if (this.cameraMode === 'tp' && this.orbitLock === null) {
      this.turnBody(frameDt);
      // The rig's head / casting arms follow the camera's pitch.
      this.pitch = THREE.MathUtils.clamp(this.orbitPitch, -PLAYER.maxPitch, PLAYER.maxPitch);
    }

    this.jumpBuffer = Math.max(0, this.jumpBuffer - frameDt);
    this.slideBuffer = Math.max(0, this.slideBuffer - frameDt);
    this.stepSmooth *= Math.exp(-frameDt * 18);
    if (Math.abs(this.stepSmooth) < 1e-3) this.stepSmooth = 0;

    if (this.feet.y < PLAYER.respawnY) this.respawn();
  }

  /** TP: turns the body towards the aim (while casting) or the move direction, at a capped rate. */
  private turnBody(dt: number): void {
    let target: number;
    if (this.aiming) target = this.orbitYaw;
    else if (this.hasMoveInput) target = Math.atan2(-this.wish.x, -this.wish.z);
    else return;
    const diff = THREE.MathUtils.euclideanModulo(target - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    const max = CAMERA.thirdPerson.turnRate * dt;
    this.yaw += THREE.MathUtils.clamp(diff, -max, max);
  }

  private step(h: number): void {
    // Wish direction from WASD relative to yaw (the orbit camera's yaw in TP).
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const basis = this.cameraMode === 'tp' && this.orbitLock === null ? this.orbitYaw : this.yaw;
    const sin = Math.sin(basis);
    const cos = Math.cos(basis);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    this.wish.set(-sin * fwd + cos * strafe, 0, -cos * fwd - sin * strafe);
    const hasInput = this.wish.lengthSq() > 0;
    if (hasInput) this.wish.normalize();
    this.hasMoveInput = hasInput;

    if (this.profile === 'shadow') {
      this.stepShadow(h, hasInput, fwd);
    } else {
      this.updateSlide();
      if (this.sliding) this.stepSlide(h, hasInput);
      else this.stepRun(h, hasInput, fwd);
    }

    // Jump / chrono-dash (buffered so a slightly-early press still counts on landing).
    if (this.jumpBuffer > 0) {
      if (this.onGround && this.hasHeadroom(PLAYER.height)) {
        this.velocity.y = this.profile === 'shadow' ? SHADOW_MOVE.jumpVelocity : PLAYER.jumpVelocity;
        this.onGround = false;
        this.jumpBuffer = 0;
        if (this.sliding) this.endSlide();
        this.onJump?.();
      } else if (!this.onGround && this.airCharges > 0) {
        this.fireChronoDash();
      }
    }

    this.velocity.y += PLAYER.gravity * h;
    this.updateHeight(h);

    const vx = this.velocity.x;
    const vz = this.velocity.z;
    this.moveHorizontal('x', vx * h);
    this.moveHorizontal('z', vz * h);
    // A wall stopped us: most of the built-up momentum is gone.
    if ((vx !== 0 && this.velocity.x === 0) || (vz !== 0 && this.velocity.z === 0)) {
      this.momentum *= PLAYER.momentumWallKeep;
    }
    this.moveVertical(this.velocity.y * h);
  }

  /** Normal running: snappy on the ground, momentum-preserving air control. */
  private stepRun(h: number, hasInput: boolean, fwd: number): void {
    const crouched = this.height < PLAYER.height - 0.2;
    const sprinting = this.sprinting && fwd > 0 && !crouched;
    const walking = this.keys.has('KeyV') && !sprinting;
    const speed = this.speed;
    this.sprintActive = sprinting && hasInput;

    // Momentum builds while sprinting forward at (close to) full speed on the ground.
    if (this.onGround) {
      const turned = hasInput && speed > 1 && this.angleToVelocity() > PLAYER.momentumTurnAngle;
      if (!sprinting || !hasInput) this.momentum -= PLAYER.momentumDecay * h;
      else if (turned) this.momentum -= PLAYER.momentumTurnDecay * h;
      else if (speed >= PLAYER.runSpeed + this.momentum - 0.5) this.momentum += PLAYER.momentumGain * h;
      this.momentum = THREE.MathUtils.clamp(this.momentum, 0, PLAYER.topSpeed - PLAYER.runSpeed);
    }

    let target: number;
    if (crouched) target = PLAYER.crouchSpeed;
    else if (walking) target = PLAYER.slowWalkSpeed;
    else if (sprinting) target = PLAYER.runSpeed + this.momentum;
    else target = PLAYER.walkSpeed;

    if (!this.onGround) {
      if (!hasInput) return;
      // In the air you can steer, but never brake below the speed you jumped with.
      target = Math.max(target, speed);
    }
    this.accelerate(target, this.onGround ? PLAYER.groundAccel : PLAYER.airAccel, h);
  }

  /**
   * Shadow form (Skyrim-like): running is the default, Shift sprints while stamina lasts,
   * C sneaks. No slide, no momentum.
   */
  private stepShadow(h: number, hasInput: boolean, fwd: number): void {
    const crouched = this.height < PLAYER.height - 0.2;
    const wantSprint = this.sprinting && fwd > 0 && !crouched && hasInput;
    if (this.exhausted && this.stamina > SHADOW_MOVE.staminaMax * 0.15) this.exhausted = false;
    const sprint = wantSprint && !this.exhausted && this.stamina > 0;
    this.sprintActive = sprint;
    if (sprint && this.onGround) {
      this.stamina = Math.max(0, this.stamina - SHADOW_MOVE.sprintDrain * h);
      this.staminaWait = SHADOW_MOVE.staminaRegenDelay;
      if (this.stamina === 0) this.exhausted = true;
    } else {
      this.staminaWait = Math.max(0, this.staminaWait - h);
      if (this.staminaWait === 0) this.stamina = Math.min(SHADOW_MOVE.staminaMax, this.stamina + SHADOW_MOVE.staminaRegen * h);
    }

    let target: number;
    if (crouched) target = SHADOW_MOVE.sneakSpeed;
    else if (this.keys.has('KeyV')) target = SHADOW_MOVE.walkSpeed;
    else if (sprint) target = SHADOW_MOVE.sprintSpeed;
    else target = SHADOW_MOVE.runSpeed;

    if (!this.onGround) {
      if (!hasInput) return;
      target = Math.max(target, this.speed);
    }
    this.accelerate(target, this.onGround ? SHADOW_MOVE.groundAccel : SHADOW_MOVE.airAccel, h);
  }

  /** Moves the horizontal velocity towards wish * target at up to `accel` m/s². */
  private accelerate(target: number, accel: number, h: number): void {
    const tx = this.wish.x * target;
    const tz = this.wish.z * target;
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

  /** Slide: low friction, slow steering towards the move keys. */
  private stepSlide(h: number, hasInput: boolean): void {
    this.slideT += h;
    const speed = Math.max(0, this.speed - PLAYER.slideFriction * h);
    let angle = Math.atan2(this.velocity.x, this.velocity.z);
    if (hasInput) {
      const want = Math.atan2(this.wish.x, this.wish.z);
      const diff = THREE.MathUtils.euclideanModulo(want - angle + Math.PI, Math.PI * 2) - Math.PI;
      // Only keys pointing roughly along the slide steer it; S does not brake it.
      if (Math.abs(diff) < Math.PI / 2) {
        angle += THREE.MathUtils.clamp(diff, -PLAYER.slideTurnRate * h, PLAYER.slideTurnRate * h);
      }
    }
    this.velocity.x = Math.sin(angle) * speed;
    this.velocity.z = Math.cos(angle) * speed;
  }

  /** Starts and ends slides. */
  private updateSlide(): void {
    if (this.sliding) {
      if (!this.onGround || this.speed < PLAYER.slideEndSpeed || this.slideT > PLAYER.slideMaxTime) this.endSlide();
      return;
    }
    if (this.slideBuffer > 0 && this.onGround && this.speed >= PLAYER.slideMinSpeed) {
      this.slideBuffer = 0;
      this.sliding = true;
      this.slideT = 0;
      const boosted = Math.min(this.speed + PLAYER.slideBoost, PLAYER.topSpeed + PLAYER.slideBoost);
      const k = boosted / this.speed;
      this.velocity.x *= k;
      this.velocity.z *= k;
      this.onSlide?.();
    }
  }

  private endSlide(): void {
    this.sliding = false;
    // Whatever speed survived the slide carries on as sprint momentum.
    this.momentum = THREE.MathUtils.clamp(this.speed - PLAYER.runSpeed, 0, PLAYER.topSpeed - PLAYER.runSpeed);
  }

  /** Shrinks to crouch height while sliding / crouching; only grows back where there is room. */
  private updateHeight(h: number): void {
    const target = this.sliding || this.keys.has('KeyC') ? PLAYER.crouchHeight : PLAYER.height;
    if (target < this.height) {
      this.height = Math.max(target, this.height - PLAYER.heightRate * h);
    } else if (target > this.height) {
      const next = Math.min(target, this.height + PLAYER.heightRate * h);
      if (this.hasHeadroom(next)) this.height = next;
    }
  }

  /** True if a capsule of the given height fits at the current position. */
  private hasHeadroom(height: number): boolean {
    for (const box of this.colliders) {
      if (!this.overlapsFootprint(box)) continue;
      if (box.min.y > this.feet.y + PLAYER.stepUp && box.min.y < this.feet.y + height && box.max.y > this.feet.y) {
        return false;
      }
    }
    return true;
  }

  /** Angle between the wish direction and the current horizontal velocity. */
  private angleToVelocity(): number {
    const s = this.speed;
    if (s < EPS) return 0;
    const dot = (this.wish.x * this.velocity.x + this.wish.z * this.velocity.z) / s;
    return Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
  }

  /** A box blocks horizontally only if it rises above step height and reaches the body. */
  private isWall(box: THREE.Box3): boolean {
    return box.max.y > this.feet.y + PLAYER.stepUp && box.min.y < this.feet.y + this.height;
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
    const fallSpeed = -this.velocity.y;
    this.feet.y += delta;

    // Ceiling: stop upward motion when the head enters a box overhead.
    if (this.velocity.y > 0) {
      const head = this.feet.y + this.height;
      for (const box of this.colliders) {
        if (!this.overlapsFootprint(box)) continue;
        if (box.min.y > this.feet.y + PLAYER.stepUp && head > box.min.y && this.feet.y < box.max.y) {
          this.feet.y = box.min.y - this.height;
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
        if (!wasOnGround) {
          this.airCharges = CHRONO_DASH.airCharges;
          this.onLand?.(fallSpeed);
        }
      }
    }
  }

  /** Horizontal chronomancer dash — consumes one air charge. */
  private fireChronoDash(): void {
    // Prefer wish if WASD is held; else camera forward on XZ.
    if (this.hasMoveInput) {
      this.dashDir.copy(this.wish);
    } else {
      const basis = this.cameraMode === 'tp' && this.orbitLock === null ? this.orbitYaw : this.yaw;
      this.dashDir.set(-Math.sin(basis), 0, -Math.cos(basis));
    }
    if (this.dashDir.lengthSq() < 1e-6) this.dashDir.set(0, 0, -1);
    else this.dashDir.normalize();

    this.velocity.x = this.dashDir.x * CHRONO_DASH.speed;
    this.velocity.z = this.dashDir.z * CHRONO_DASH.speed;
    this.velocity.y = CHRONO_DASH.lift;
    this.airCharges -= 1;
    this.jumpBuffer = 0;
    this.onChronoDash?.();
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
    this.slideBuffer = 0;
    this.sliding = false;
    this.momentum = 0;
    this.airCharges = CHRONO_DASH.airCharges;
    this.onGround = false;
    // Landing somewhere low (e.g. a Recall that ends under a bar): stay crouched.
    this.height = this.hasHeadroom(PLAYER.height) ? PLAYER.height : PLAYER.crouchHeight;
  }

  respawn(): void {
    this.teleport(PLAYER.spawn, PLAYER.spawnYaw, 0);
    this.onRespawn?.();
  }

  syncCamera(bobY = 0, roll = 0): void {
    this.camera.position.set(this.feet.x, this.feet.y + this.eyeHeight + this.stepSmooth + bobY, this.feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
  }
}
