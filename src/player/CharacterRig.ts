import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER, PLAYER, SHADOW } from '../config';
import type { MoveState } from './PlayerController';
import { createVesselMaterials, type VesselUniforms } from './VesselMaterial';
import { ShadowWraith } from './ShadowWraith';
import type { SpellPose } from '../combat/SpellHands';
import { ShadowWisps } from '../fx/ShadowWisps';

export type Form = 'runner' | 'shadow';

export interface RigInput {
  /** Feet position of the physics controller (world space). */
  feet: THREE.Vector3;
  /** Camera (eye) position including head bob; the hands are solved relative to it. */
  eye: THREE.Vector3;
  yaw: number;
  pitch: number;
  velocity: THREE.Vector3;
  /** Horizontal speed (m/s) and its components along the body's forward / right axes. */
  speed: number;
  forwardSpeed: number;
  strafeSpeed: number;
  onGround: boolean;
  state: MoveState;
  /** Seconds into the current slide. */
  slideT: number;
  /** 0 standing .. 1 fully crouched. */
  crouch: number;
  recalling: boolean;
  recallProgress: number;
  /** Which body is presented: the runner vessel (mannequin) or the shadow wraith. */
  form: Form;
  /** Shadow form spell hands (null in runner form). */
  spells: SpellPose | null;
}

type ClipKey = keyof typeof CHARACTER.clips;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const TAU = Math.PI * 2;
const SLIDE_LOOP_FADE = 0.15;

/**
 * The player's body for the first-person view: the runner vessel (an animated mannequin) or,
 * in shadow form, the procedural ShadowWraith.
 *
 * The physics controller owns position; this class only presents it:
 *  - clips (idle / walk / jog / sprint / crouch / slide / air / land) blended by state and
 *    speed, locomotion phase-locked to distance travelled
 *  - head and neck removed from the visible mesh (a hidden copy still casts the shadow)
 *  - root "head-locked" under the camera, pushed back so the chest always stays behind the lens
 *  - spine follows camera pitch; hands pulled towards camera-space targets with IK and kept
 *    out of walls
 *  - shadow form hands everything to the wraith (its own body, arms, smoke and float)
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  /** Camera offsets the main loop applies so the whole view bobs with the stride. */
  headBobY = 0;
  headRoll = 0;
  /** Fires when a foot plants; intensity 0 (soft walk) .. 1 (sprint). */
  onFootstep: ((intensity: number) => void) | null = null;
  /** Distance from the eye (m) at which the near-eye dissolve has removed half the body. */
  readonly nearFadeRadius = (SHADOW.nearFadeStart + SHADOW.nearFadeEnd) / 2;

  private readonly model = new THREE.Group();
  private readonly wisps: ShadowWisps;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<ClipKey, THREE.AnimationAction>();
  private readonly durations = new Map<ClipKey, number>();
  private readonly weights = new Map<ClipKey, number>();

  private head: THREE.Object3D | null = null;
  private chest: THREE.Object3D | null = null;
  private spine: THREE.Object3D[] = [];
  private arms: Array<{ side: 1 | -1; upper: THREE.Object3D; fore: THREE.Object3D; hand: THREE.Object3D }> = [];
  private feet: Array<{ bone: THREE.Object3D; armed: boolean }> = [];
  private drawnMeshes: THREE.SkinnedMesh[] = [];
  private vessel: { forSlot: (name: string) => THREE.MeshStandardMaterial; uniforms: VesselUniforms } | null = null;
  private form: Form = 'runner';
  private readonly wraith: ShadowWraith;

  private time = 0;
  private idlePhase = 0;
  private stridePhase = 0;
  private crouchPhase = 0;
  private airBlend = 0;
  private slideBlend = 0;
  private recallBlend = 0;
  private wasSliding = false;
  private exitT = Infinity;
  private landT = Infinity;
  private landK = 0;
  private wasOnGround = true;
  private airVy = 0;
  private kickY = 0;
  private kickV = 0;
  private burst = 0;
  private loaded = false;

  private readonly tmpHead = new THREE.Vector3();
  private readonly tmpChest = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpAxis = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpPQ = new THREE.Quaternion();
  private readonly tmpR = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpCamQ = new THREE.Quaternion();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpHand = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly ikS = new THREE.Vector3();
  private readonly ikE = new THREE.Vector3();
  private readonly ikH = new THREE.Vector3();
  private readonly ikDir = new THREE.Vector3();
  private readonly ikPole = new THREE.Vector3();
  private readonly ikNewE = new THREE.Vector3();
  private readonly ikReach = new THREE.Vector3();
  private readonly ikA = new THREE.Vector3();
  private readonly ikB = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly colliders: THREE.Box3[]) {
    this.root.add(this.model);
    scene.add(this.root);
    this.root.visible = false;
    this.wisps = new ShadowWisps(scene);
    this.wraith = new ShadowWraith(scene, colliders, this.wisps);
    this.wraith.setVisible(false);
    this.load();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Meshes drawn to the first-person camera (playtest metrics). */
  get visibleMeshes(): THREE.Mesh[] {
    return this.form === 'shadow' ? this.wraith.armMeshes : this.drawnMeshes;
  }

  /** [left, right] spell anchors above the wraith's palms. */
  get spellHands(): [THREE.Object3D, THREE.Object3D] | null {
    return this.form === 'shadow' ? this.wraith.palms : null;
  }

  /** Presents a form: the runner vessel (mannequin) or the shadow wraith, never both. */
  setForm(form: Form): void {
    this.form = form;
    this.model.visible = form === 'runner';
    this.wraith.setVisible(form === 'shadow');
  }

  /** Compiles both bodies' shaders so the first form switch doesn't hitch. */
  warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const form = this.form;
    for (const f of ['shadow', 'runner'] as const) {
      this.setForm(f);
      renderer.compile(scene, camera);
    }
    this.setForm(form);
  }

  /** Form-transition burn: 0 = whole body, 1 = gone. */
  setDissolve(v: number): void {
    if (this.vessel) this.vessel.uniforms.uDissolve.value = v;
    this.wraith.setDissolve(v);
  }

  get handBones(): THREE.Object3D[] {
    return this.form === 'shadow' ? this.wraith.palms : this.arms.map((a) => a.hand);
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.wisps.setViewport(heightPx, fovDeg);
  }

  /** Extra smoke this frame (slide start, hard landing). */
  puff(amount: number): void {
    this.burst += amount;
  }

  update(dt: number, input: RigInput): void {
    if (dt <= 0) return;
    this.time += dt;
    this.stepCameraKick(dt, input);
    if (!this.loaded || !this.mixer) return;
    const ease = (rate: number): number => Math.min(1, dt * rate);

    // --- State blends ------------------------------------------------------------------
    const sliding = input.state === 'slide' && !input.recalling;
    if (sliding && !this.wasSliding) this.exitT = Infinity;
    if (!sliding && this.wasSliding && input.onGround) this.exitT = 0;
    this.wasSliding = sliding;
    this.exitT += dt;

    this.airBlend += ((input.onGround ? 0 : 1) - this.airBlend) * ease(input.onGround ? 14 : 10);
    this.slideBlend += ((sliding ? 1 : 0) - this.slideBlend) * ease(sliding ? 20 : 12);
    const recallTarget = input.recalling ? Math.sin(Math.PI * Math.min(input.recallProgress, 1)) : 0;
    this.recallBlend += (recallTarget - this.recallBlend) * ease(14);
    this.landT += dt;

    // --- Shadow form: the wraith presents itself; the mannequin stays hidden ------------
    if (this.form === 'shadow') {
      this.wraith.update(dt, {
        feet: input.feet,
        eye: input.eye,
        yaw: input.yaw,
        pitch: input.pitch,
        velocity: input.velocity,
        speed: input.speed,
        onGround: input.onGround,
        recall: this.recallBlend,
        spells: input.spells,
      });
      const burst = Math.round(this.burst);
      this.burst = 0;
      this.wisps.update(dt, [], input.velocity, input.speed, burst);
      // It floats: the view rides the slow bob, with a slight sway instead of a stride.
      this.headBobY = this.wraith.floatBob * 0.6 + this.kickY;
      this.headRoll = Math.sin(this.time * 0.7) * 0.004 - input.strafeSpeed * 0.003;
      return;
    }

    // --- Clip weights ------------------------------------------------------------------
    const w = this.computeWeights(input);
    const rate = ease(16);
    let sum = 0;
    for (const key of this.actions.keys()) {
      const cur = this.weights.get(key) ?? 0;
      const next = cur + ((w[key] ?? 0) - cur) * rate;
      this.weights.set(key, next);
      sum += next;
    }
    // Weights must sum to 1, or the mixer blends towards the bind (T) pose.
    for (const [key, action] of this.actions) action.setEffectiveWeight((this.weights.get(key) ?? 0) / Math.max(sum, 1e-4));

    // --- Phases: locomotion advances by distance travelled so the feet don't slide -------
    this.idlePhase = (this.idlePhase + dt / this.dur('idle')) % 1;
    const air = this.airBlend;
    if (input.recalling) {
      this.stridePhase -= dt * CHARACTER.recallCyclesPerSec;
    } else if (air < 0.5 && !sliding) {
      const s = CHARACTER.stride;
      const ww = this.weights.get('walk') ?? 0;
      const wj = this.weights.get('jog') ?? 0;
      const wsp = this.weights.get('sprint') ?? 0;
      const total = ww + wj + wsp;
      const stride = total > 1e-3 ? (ww * s.walk + wj * s.jog + wsp * s.sprint) / total : s.walk;
      const direction = input.forwardSpeed >= -0.3 * input.speed ? 1 : -1;
      this.stridePhase += (direction * input.speed * dt) / stride;
      this.crouchPhase += (direction * input.speed * dt) / s.crouchWalk;
    }
    this.stridePhase = THREE.MathUtils.euclideanModulo(this.stridePhase, 1);
    this.crouchPhase = THREE.MathUtils.euclideanModulo(this.crouchPhase, 1);

    this.setTime('idle', this.idlePhase * this.dur('idle'));
    this.setTime('crouchIdle', this.idlePhase * this.dur('crouchIdle'));
    for (const k of ['walk', 'jog', 'sprint'] as const) this.setTime(k, this.stridePhase * this.dur(k));
    this.setTime('crouchWalk', this.crouchPhase * this.dur('crouchWalk'));
    this.setTime('slideStart', Math.min(input.slideT, this.dur('slideStart') - 1e-3));
    this.setTime('slideLoop', THREE.MathUtils.euclideanModulo(input.slideT - this.dur('slideStart'), this.dur('slideLoop')));
    this.setTime('slideExit', Math.min(this.exitT, this.dur('slideExit') - 1e-3));
    this.setTime('jumpLoop', CHARACTER.airPhase * this.dur('jumpLoop'));
    this.setTime('land', Math.min(CHARACTER.landStart + this.landT * CHARACTER.landRate, this.dur('land') - 1e-3));
    this.mixer.update(0);

    // --- Root follows the physics body ---------------------------------------------
    this.root.position.copy(input.feet);
    this.root.rotation.set(0, input.yaw + CHARACTER.modelYaw, 0);

    // --- Procedural layers on top of the clips -----------------------------------------
    this.applySpinePitch(input);
    this.applyHeadLock(input);
    this.applyArmIK(input, air);
    this.detectFootsteps(input);

    // --- Look ----------------------------------------------------------------------------
    if (this.vessel) {
      this.vessel.uniforms.uTime.value = this.time;
      this.vessel.uniforms.uEye.value.copy(input.eye);
    }
    // The runner vessel doesn't smoke; this only drains particles left from the shadow form.
    this.burst = 0;
    this.wisps.update(dt, [], input.velocity, input.speed, 0);

    // --- Camera bob driven by the stride ---------------------------------------------
    const moveW = smoothstep(0.1, 1.2, input.speed);
    const bobAmount = moveW * (1 - air) * (1 - this.slideBlend) * (input.recalling ? 0 : 1);
    const slideShake = Math.sin(this.time * 47) * 0.003 * this.slideBlend * Math.min(input.speed / 8, 1);
    this.headBobY = Math.sin(this.stridePhase * TAU * 2) * CHARACTER.headBob * bobAmount + this.kickY + slideShake;
    this.headRoll =
      Math.cos(this.stridePhase * TAU) * CHARACTER.headRoll * bobAmount -
      input.strafeSpeed * 0.002 +
      this.slideBlend * CHARACTER.slideRoll;
  }

  /** Target weight per clip for the current movement state. */
  private computeWeights(input: RigInput): Partial<Record<ClipKey, number>> {
    const w: Partial<Record<ClipKey, number>> = {};
    if (input.recalling) {
      w.sprint = 1;
      return w;
    }

    // Ground locomotion: piecewise-linear blend over speedPoints.
    const p = CHARACTER.speedPoints;
    const s = input.speed;
    const ground: Partial<Record<ClipKey, number>> = {};
    if (s <= p.walk) {
      const t = smoothstep(p.idle + 0.1, p.walk, s);
      ground.idle = 1 - t;
      ground.walk = t;
    } else if (s <= p.jog) {
      const t = (s - p.walk) / (p.jog - p.walk);
      ground.walk = 1 - t;
      ground.jog = t;
    } else {
      const t = Math.min((s - p.jog) / (p.sprint - p.jog), 1);
      ground.jog = 1 - t;
      ground.sprint = t;
    }
    // Crouch replaces standing locomotion (the slide has its own clips).
    const crouch = input.state === 'slide' ? 0 : input.crouch;
    const crouchMove = smoothstep(0.2, 1.4, s);
    ground.crouchIdle = crouch * (1 - crouchMove);
    ground.crouchWalk = crouch * crouchMove;
    for (const k of ['idle', 'walk', 'jog', 'sprint'] as const) ground[k] = (ground[k] ?? 0) * (1 - crouch);

    // Slide: start clip, then the loop; Slide_Exit plays for a moment after it ends.
    const slide: Partial<Record<ClipKey, number>> = {};
    let slideW = 0;
    if (input.state === 'slide') {
      const dStart = this.dur('slideStart');
      const loop = smoothstep(dStart - SLIDE_LOOP_FADE, dStart, input.slideT);
      slide.slideStart = 1 - loop;
      slide.slideLoop = loop;
      slideW = this.slideBlend;
    } else if (this.exitT < this.dur('slideExit')) {
      slide.slideExit = 1;
      slideW = 1 - smoothstep(0.4, 1, this.exitT / this.dur('slideExit'));
    }

    // Landing: a short dip into Jump_Land, scaled by how hard we hit the ground.
    const landW = this.landK * (1 - smoothstep(0, 0.45, this.landT)) * (1 - slideW);
    const air = this.airBlend * (1 - slideW);
    const groundW = (1 - slideW) * (1 - air) * (1 - landW);

    for (const [k, v] of Object.entries(ground) as Array<[ClipKey, number]>) w[k] = v * groundW;
    for (const [k, v] of Object.entries(slide) as Array<[ClipKey, number]>) w[k] = v * slideW;
    w.jumpLoop = air * (1 - landW);
    w.land = landW;
    return w;
  }

  /** Footfalls from the posed clip itself, so steps stay in sync with every gait. */
  private detectFootsteps(input: RigInput): void {
    const active = input.onGround && !input.recalling && this.slideBlend < 0.3 && this.airBlend < 0.5 && input.speed > 0.4;
    const intensity =
      THREE.MathUtils.clamp((input.speed - 1) / (PLAYER.topSpeed - 1), 0, 1) * (1 - 0.6 * input.crouch) + 0.1;
    const contact = THREE.MathUtils.lerp(CHARACTER.footContact, CHARACTER.crouchFootContact, input.crouch);
    const rearm = THREE.MathUtils.lerp(CHARACTER.footRearm, CHARACTER.crouchFootRearm, input.crouch);
    for (const foot of this.feet) {
      foot.bone.getWorldPosition(this.tmpHand);
      const h = this.tmpHand.y - this.root.position.y;
      if (h > rearm) foot.armed = true;
      else if (h < contact && foot.armed) {
        foot.armed = false;
        if (active) this.onFootstep?.(intensity);
      }
    }
  }

  /** Spring that dips the camera on take-off and landing; also arms the landing pose. */
  private stepCameraKick(dt: number, input: RigInput): void {
    if (this.wasOnGround && !input.onGround) this.kickV -= CHARACTER.jumpKick;
    if (!this.wasOnGround && input.onGround) {
      const impact = -this.airVy;
      this.kickV -= THREE.MathUtils.clamp(impact * CHARACTER.landKick, 0.2, 2.4);
      // Running landings flow straight on; hard drops show the landing crouch.
      const k = smoothstep(4, CHARACTER.landFullSpeed, impact) * (1 - 0.6 * smoothstep(4, 9, input.speed));
      if (k > 0.05 && input.state !== 'slide') {
        this.landK = k;
        this.landT = 0;
      }
      if (impact > 6) this.puff(Math.min(40, impact * 2));
    }
    if (!input.onGround) this.airVy = input.velocity.y;
    this.wasOnGround = input.onGround;
    this.kickV += (-180 * this.kickY - 14 * this.kickV) * dt;
    this.kickY += this.kickV * dt;
    this.kickY = THREE.MathUtils.clamp(this.kickY, -0.14, 0.1);
  }

  // ---------------------------------------------------------------------------
  // Procedural bone layers
  // ---------------------------------------------------------------------------

  /** Rotates `bone` about a world-space axis, keeping its parent chain intact. */
  private rotateBoneWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
    if (!bone.parent) return;
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(this.tmpPQ);
    this.tmpR.setFromAxisAngle(axis, angle);
    // local' = parent^-1 * R * parent * local
    this.tmpQ.copy(this.tmpPQ).invert().multiply(this.tmpR).multiply(this.tmpPQ);
    bone.quaternion.premultiply(this.tmpQ);
  }

  private applySpinePitch(input: RigInput): void {
    if (this.spine.length === 0) return;
    this.root.updateMatrixWorld(true);
    // Body's right axis in world space; positive rotation about it pitches the view up.
    this.tmpAxis.set(Math.cos(input.yaw), 0, -Math.sin(input.yaw));
    // Looking down while sliding / airborne would fold the chest into the lens; follow less.
    const fold = input.pitch < 0 ? 1 - 0.5 * Math.max(this.slideBlend, this.airBlend) : 1;
    const share = (CHARACTER.spinePitchShare * fold * input.pitch) / this.spine.length;
    for (const bone of this.spine) this.rotateBoneWorld(bone, this.tmpAxis, share);
  }

  /**
   * Moves the root so the (hidden) head sits just behind the eye, then further back until the
   * chest's front surface is behind the eye plane. Crouch / slide also lock the head height.
   */
  private applyHeadLock(input: RigInput): void {
    if (!this.head) return;
    this.root.updateMatrixWorld(true);
    this.head.getWorldPosition(this.tmpHead);
    const fwd = this.tmpFwd.set(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));

    let dx = input.eye.x - fwd.x * CHARACTER.cameraBackOffset - this.tmpHead.x;
    let dz = input.eye.z - fwd.z * CHARACTER.cameraBackOffset - this.tmpHead.z;
    const vLock = Math.max(this.slideBlend, input.crouch);
    const dy = (input.eye.y - CHARACTER.headBelowEye - this.tmpHead.y) * vLock;

    if (this.chest) {
      this.chest.getWorldPosition(this.tmpChest);
      const ahead =
        (this.tmpChest.x + dx - input.eye.x) * fwd.x + (this.tmpChest.z + dz - input.eye.z) * fwd.z + CHARACTER.chestRadius;
      const excess = ahead + CHARACTER.chestClearance;
      if (excess > 0) {
        dx -= fwd.x * excess;
        dz -= fwd.z * excess;
      }
    }
    this.root.position.x += dx;
    this.root.position.y += dy;
    this.root.position.z += dz;
    this.root.updateMatrixWorld(true);
  }

  /**
   * Two-bone IK: pulls each hand towards a point fixed relative to the camera so the hands read
   * in first person, then keeps that point out of walls so the palms brace instead of clipping.
   */
  private applyArmIK(input: RigInput, air: number): void {
    if (this.arms.length === 0) return;
    const moveW = smoothstep(0.1, 1.2, input.speed);
    const sprintK = THREE.MathUtils.clamp((input.speed - CHARACTER.speedPoints.jog) / 3, 0, 1);
    const pumpK = moveW * (1 - air) * (0.7 + 0.5 * sprintK);
    const phase = this.stridePhase * TAU;
    const rc = this.recallBlend;
    // The slide clip's hands (one trailing on the floor) win while sliding.
    const ikW = THREE.MathUtils.lerp(CHARACTER.armIkWeight * (1 - this.slideBlend), 1, rc);
    this.tmpEuler.set(input.pitch, input.yaw, 0, 'YXZ');
    this.tmpCamQ.setFromEuler(this.tmpEuler);

    for (const arm of this.arms) {
      const swing = Math.sin(phase + (arm.side === -1 ? 0 : Math.PI));
      const lift = Math.cos(phase + (arm.side === -1 ? 0 : Math.PI));
      // Target in eye space (x right, y up, -z forward).
      const t = this.tmpTarget.set(arm.side * CHARACTER.handSide, -CHARACTER.handDown, -CHARACTER.handForward);
      t.z += -swing * CHARACTER.handPumpForward * pumpK;
      t.y += lift * CHARACTER.handPumpUp * pumpK;
      // Thrown up and out while airborne.
      t.y += air * CHARACTER.handAirUp;
      t.x += arm.side * air * CHARACTER.handAirOut;
      // Recall: both hands rise to a casting pose in front of the chest.
      t.x = THREE.MathUtils.lerp(t.x, arm.side * CHARACTER.recallHandSide, rc);
      t.y = THREE.MathUtils.lerp(t.y, CHARACTER.recallHandUp, rc);
      t.z = THREE.MathUtils.lerp(t.z, -CHARACTER.recallHandForward, rc);
      t.applyQuaternion(this.tmpCamQ).add(input.eye);

      arm.hand.getWorldPosition(this.tmpHand);
      t.lerpVectors(this.tmpHand, t, ikW);
      this.keepOutOfWalls(input.eye, t);
      this.solveTwoBone(arm.upper, arm.fore, arm.hand, t, arm.side);
    }
  }

  /** Pulls `target` back along the eye->target line to just in front of the first wall hit. */
  private keepOutOfWalls(eye: THREE.Vector3, target: THREE.Vector3): void {
    const dir = this.ikDir.subVectors(target, eye);
    const len = dir.length();
    if (len < 1e-4) return;
    dir.divideScalar(len);
    this.ray.set(eye, dir);
    let reach = len + CHARACTER.palmOffset;
    for (const box of this.colliders) {
      if (!this.ray.intersectBox(box, this.ikA)) continue;
      reach = Math.min(reach, this.ikA.distanceTo(eye));
    }
    const allowed = Math.max(0.05, reach - CHARACTER.palmOffset);
    if (allowed < len) target.copy(eye).addScaledVector(dir, allowed);
  }

  private solveTwoBone(
    upper: THREE.Object3D,
    fore: THREE.Object3D,
    hand: THREE.Object3D,
    target: THREE.Vector3,
    side: 1 | -1,
  ): void {
    const s = this.ikS;
    const e = this.ikE;
    const h = this.ikH;
    upper.updateWorldMatrix(true, true);
    upper.getWorldPosition(s);
    fore.getWorldPosition(e);
    hand.getWorldPosition(h);
    const l1 = s.distanceTo(e);
    const l2 = e.distanceTo(h);
    if (l1 < 1e-4 || l2 < 1e-4) return;

    const toTarget = this.ikDir.subVectors(target, s);
    const distance = THREE.MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    toTarget.normalize();
    const a = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(l1 * l1 - a * a, 0));

    // Elbow bends outward and down, relative to the body.
    const pole = this.ikPole
      .set(side * CHARACTER.elbowOut, -CHARACTER.elbowDown, CHARACTER.elbowBack)
      .applyQuaternion(this.tmpCamQ);
    pole.addScaledVector(toTarget, -pole.dot(toTarget)).normalize();
    const newE = this.ikNewE.copy(s).addScaledVector(toTarget, a).addScaledVector(pole, height);
    const reach = this.ikReach.copy(s).addScaledVector(toTarget, distance);

    // Aim the upper arm at the new elbow, then the forearm at the reachable hand point.
    this.aimBone(upper, s, e, newE);
    fore.updateWorldMatrix(true, true);
    fore.getWorldPosition(e);
    hand.getWorldPosition(h);
    this.aimBone(fore, e, h, reach);
  }

  /** Rotates `bone` (about the pivot) so the direction pivot->from points at pivot->to. */
  private aimBone(bone: THREE.Object3D, pivot: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): void {
    const a = this.ikA.subVectors(from, pivot).normalize();
    const b = this.ikB.subVectors(to, pivot).normalize();
    this.tmpR.setFromUnitVectors(a, b);
    if (!bone.parent) return;
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(this.tmpPQ);
    this.tmpQ.copy(this.tmpPQ).invert().multiply(this.tmpR).multiply(this.tmpPQ);
    bone.quaternion.premultiply(this.tmpQ);
  }

  private dur(key: ClipKey): number {
    return this.durations.get(key) ?? 1;
  }

  private setTime(key: ClipKey, t: number): void {
    const action = this.actions.get(key);
    if (action) action.time = t;
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private load(): void {
    new GLTFLoader().load(
      CHARACTER.modelUrl,
      (gltf) => {
        try {
          this.setup(gltf.scene, gltf.animations);
        } catch (err) {
          console.error('Character setup failed.', err);
        }
      },
      undefined,
      (err) => console.error('Character failed to load.', err),
    );
  }

  private setup(scene: THREE.Group, clips: THREE.AnimationClip[]): void {
    const bones = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o);
    });
    const bone = (name: string): THREE.Object3D | undefined => bones.get(name);
    const b = CHARACTER.bones;

    this.head = bone(b.head) ?? null;
    this.chest = bone(b.chest) ?? null;
    this.spine = b.spine.map(bone).filter((x): x is THREE.Object3D => !!x);
    for (const [side, names] of [[-1, b.arms.left], [1, b.arms.right]] as const) {
      const [upper, fore, hand] = names.map(bone);
      if (upper && fore && hand) this.arms.push({ side, upper, fore, hand });
    }
    this.feet = b.feet.map(bone).filter((x): x is THREE.Object3D => !!x).map((f) => ({ bone: f, armed: true }));
    const missing = [b.head, b.chest, ...b.spine, ...b.arms.left, ...b.arms.right].filter((n) => !bone(n));
    if (missing.length) console.warn(`Character is missing bones: ${missing.join(', ')}`);

    this.model.add(scene);
    this.normaliseScale(scene);
    this.prepareMeshes(scene);
    this.setupAnimation(scene, clips, bone(b.hips));

    this.root.visible = true;
    this.loaded = true;
  }

  /** Scales the rig to the player's height and puts the soles on y = 0 (rest pose bounds). */
  private normaliseScale(scene: THREE.Group): void {
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const height = box.max.y - box.min.y;
    if (!(height > 0)) return;
    const s = PLAYER.height / height;
    this.model.scale.setScalar(s);
    this.model.position.y = -box.min.y * s;
  }

  private prepareMeshes(scene: THREE.Group): void {
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });
    this.vessel = createVesselMaterials();

    for (const mesh of meshes) {
      mesh.frustumCulled = false; // skinned bounds don't follow the posed mesh
      const slot = (mesh.material as THREE.Material).name;
      mesh.material = this.vessel.forSlot(slot);

      // Invisible, shadow-only copy with the full (head included) geometry.
      const shadowProxy = new THREE.SkinnedMesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      shadowProxy.frustumCulled = false;
      shadowProxy.castShadow = true;
      shadowProxy.bind(mesh.skeleton, mesh.bindMatrix);
      mesh.parent?.add(shadowProxy);

      // Visible mesh: head and neck removed so the camera never sits inside them.
      const trimmed = this.removeHiddenTriangles(mesh);
      if (trimmed) {
        mesh.geometry = trimmed;
        this.drawnMeshes.push(mesh);
      } else mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
    this.setForm(this.form);
  }

  /** Returns a copy of the mesh geometry without triangles skinned (mostly) to hidden bones. */
  private removeHiddenTriangles(mesh: THREE.SkinnedMesh): THREE.BufferGeometry | null {
    const geo = mesh.geometry;
    const skinIndex = geo.getAttribute('skinIndex');
    const skinWeight = geo.getAttribute('skinWeight');
    if (!skinIndex || !skinWeight) return geo;

    const hidden = new Set<number>();
    const names: readonly string[] = CHARACTER.bones.hidden;
    mesh.skeleton.bones.forEach((b, i) => {
      if (names.includes(b.name)) hidden.add(i);
    });

    const vertexCount = geo.getAttribute('position').count;
    const isHidden = new Uint8Array(vertexCount);
    for (let v = 0; v < vertexCount; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (hidden.has(skinIndex.getComponent(v, k))) w += skinWeight.getComponent(v, k);
      }
      isHidden[v] = w >= CHARACTER.hiddenWeightThreshold ? 1 : 0;
    }

    const index = geo.getIndex();
    const count = index ? index.count : vertexCount;
    const kept: number[] = [];
    for (let i = 0; i < count; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      if (isHidden[a] || isHidden[b] || isHidden[c]) continue;
      kept.push(a, b, c);
    }
    if (kept.length === 0) return null;

    const trimmed = geo.clone();
    trimmed.setIndex(kept);
    return trimmed;
  }

  private setupAnimation(scene: THREE.Group, clips: THREE.AnimationClip[], hips: THREE.Object3D | undefined): void {
    const find = (name: string): THREE.AnimationClip | undefined =>
      clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
    this.mixer = new THREE.AnimationMixer(scene);
    const missing: string[] = [];
    for (const [key, name] of Object.entries(CHARACTER.clips) as Array<[ClipKey, string]>) {
      const clip = find(name);
      if (!clip) {
        missing.push(name);
        continue;
      }
      if (hips) this.makeInPlace(clip, hips);
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.paused = true; // we set time by hand each frame
      action.setEffectiveWeight(0);
      this.actions.set(key, action);
      this.durations.set(key, clip.duration);
      this.weights.set(key, key === 'idle' ? 1 : 0);
    }
    if (missing.length) throw new Error(`Missing clips: ${missing.join(', ')}. Found: ${clips.map((c) => c.name).join(', ')}`);
  }

  /** Removes horizontal hip drift so physics alone moves the character (vertical bob stays). */
  private makeInPlace(clip: THREE.AnimationClip, hips: THREE.Object3D): void {
    // The hips' parent may be rotated (Z-up rigs): find which local axis is world up.
    hips.parent?.updateWorldMatrix(true, false);
    hips.parent?.getWorldQuaternion(this.tmpPQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.tmpPQ.invert()).normalize();
    const v0 = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const track of clip.tracks) {
      if (track.name !== `${hips.name}.position`) continue;
      const values = track.values;
      v0.fromArray(values, 0);
      for (let i = 0; i < values.length; i += 3) {
        v.fromArray(values, i);
        const rise = v.clone().sub(v0).dot(up);
        v.copy(v0).addScaledVector(up, rise).toArray(values, i);
      }
    }
  }
}
