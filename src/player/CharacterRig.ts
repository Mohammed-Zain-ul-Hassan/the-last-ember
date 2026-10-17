import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER, PLAYER } from '../config';

export interface RigInput {
  /** Feet position of the physics controller (world space). */
  feet: THREE.Vector3;
  /** Camera (eye) position including head bob; the hands are solved relative to it. */
  eye: THREE.Vector3;
  yaw: number;
  pitch: number;
  /** Horizontal speed (m/s) and its components along the body's forward / right axes. */
  speed: number;
  forwardSpeed: number;
  strafeSpeed: number;
  verticalSpeed: number;
  onGround: boolean;
  recalling: boolean;
  recallProgress: number;
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const TAU = Math.PI * 2;

/**
 * Full-body skinned character for the first-person view.
 *
 * The physics controller owns position; this class only presents it:
 *  - locomotion clips (idle / walk / run) blended by speed and phase-locked to distance travelled
 *  - head triangles removed from the visible mesh (a hidden copy still casts the shadow)
 *  - body root "head-locked" under the camera so the camera never inherits animation jitter
 *  - spine follows camera pitch, arms are lifted a little so the hands read in first person
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  /** Camera offsets the main loop applies so the whole view bobs with the stride. */
  headBobY = 0;
  headRoll = 0;

  private readonly model = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private idle: THREE.AnimationAction | null = null;
  private walk: THREE.AnimationAction | null = null;
  private run: THREE.AnimationAction | null = null;
  private duration = { idle: 1, walk: 1, run: 1 };

  private head: THREE.Object3D | null = null;
  private spine: THREE.Object3D[] = [];
  private arms: Array<{ side: 1 | -1; upper: THREE.Object3D; fore: THREE.Object3D; hand: THREE.Object3D }> = [];
  private bodyMaterials: THREE.MeshStandardMaterial[] = [];

  private idlePhase = 0;
  private stridePhase = 0;
  private weights = { idle: 1, walk: 0, run: 0 };
  private airBlend = 0;
  private recallBlend = 0;
  private wasOnGround = true;
  private airVy = 0;
  private kickY = 0;
  private kickV = 0;
  private loaded = false;

  private readonly tmpHead = new THREE.Vector3();
  private readonly tmpAxis = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpPQ = new THREE.Quaternion();
  private readonly tmpR = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpCamQ = new THREE.Quaternion();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly ikS = new THREE.Vector3();
  private readonly ikE = new THREE.Vector3();
  private readonly ikH = new THREE.Vector3();
  private readonly ikDir = new THREE.Vector3();
  private readonly ikPole = new THREE.Vector3();
  private readonly ikNewE = new THREE.Vector3();
  private readonly ikReach = new THREE.Vector3();
  private readonly ikA = new THREE.Vector3();
  private readonly ikB = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.root.add(this.model);
    scene.add(this.root);
    this.root.visible = false;
    this.load();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  update(dt: number, input: RigInput): void {
    if (dt <= 0) return;
    this.stepCameraKick(dt, input);
    if (!this.loaded || !this.mixer || !this.idle || !this.walk || !this.run) return;
    const ease = (rate: number): number => Math.min(1, dt * rate);

    // --- Blend targets from speed ----------------------------------------------------
    const moveW = smoothstep(0.1, 1.2, input.speed);
    const runMix = smoothstep(CHARACTER.walkToRunStart, CHARACTER.walkToRunEnd, input.speed);
    let tIdle = 1 - moveW;
    let tWalk = moveW * (1 - runMix);
    let tRun = moveW * runMix;

    this.airBlend += ((input.onGround ? 0 : 1) - this.airBlend) * ease(input.onGround ? 12 : 16);
    const recallTarget = input.recalling ? Math.sin(Math.PI * Math.min(input.recallProgress, 1)) : 0;
    this.recallBlend += (recallTarget - this.recallBlend) * ease(14);

    if (input.recalling) {
      tIdle = 0;
      tWalk = 0;
      tRun = 1;
    }
    // Airborne: hold the run pose so the body doesn't keep jogging on thin air.
    const air = this.airBlend;
    tIdle *= 1 - air;
    tWalk *= 1 - air;
    tRun = tRun * (1 - air) + air;

    const wRate = ease(14);
    this.weights.idle += (tIdle - this.weights.idle) * wRate;
    this.weights.walk += (tWalk - this.weights.walk) * wRate;
    this.weights.run += (tRun - this.weights.run) * wRate;

    // --- Phase: advance by distance travelled so the feet don't slide ----------------
    this.idlePhase = (this.idlePhase + dt / this.duration.idle) % 1;
    if (input.recalling) {
      this.stridePhase -= dt * CHARACTER.recallCyclesPerSec;
    } else if (air < 0.5) {
      const stride = THREE.MathUtils.lerp(CHARACTER.walkStride, CHARACTER.runStride, runMix);
      const direction = input.forwardSpeed >= -0.3 * input.speed ? 1 : -1;
      this.stridePhase += (direction * input.speed * dt) / stride;
    }
    this.stridePhase = THREE.MathUtils.euclideanModulo(this.stridePhase, 1);
    const phase = air > 0.5 && !input.recalling ? CHARACTER.airPhase : this.stridePhase;

    this.idle.time = this.idlePhase * this.duration.idle;
    this.walk.time = this.stridePhase * this.duration.walk;
    this.run.time = phase * this.duration.run;
    this.idle.setEffectiveWeight(this.weights.idle);
    this.walk.setEffectiveWeight(this.weights.walk);
    this.run.setEffectiveWeight(this.weights.run);
    this.mixer.update(0);

    // --- Root follows the physics body ---------------------------------------------
    this.root.position.copy(input.feet);
    this.root.rotation.set(0, input.yaw, 0); // this rig already faces -Z

    // --- Procedural layers on top of the clips -----------------------------------------
    this.applySpinePitch(input);
    this.applyArmIK(input, moveW, air);

    // --- Head-lock: keep the (hidden) head just behind the camera --------------------
    this.root.updateMatrixWorld(true);
    if (this.head) {
      this.head.getWorldPosition(this.tmpHead);
      const fx = -Math.sin(input.yaw);
      const fz = -Math.cos(input.yaw);
      const targetX = input.feet.x - fx * CHARACTER.cameraBackOffset;
      const targetZ = input.feet.z - fz * CHARACTER.cameraBackOffset;
      this.root.position.x += targetX - this.tmpHead.x;
      this.root.position.z += targetZ - this.tmpHead.z;
      this.root.updateMatrixWorld(true);
    }

    // --- Cyan tint while rewinding ----------------------------------------------------
    for (const m of this.bodyMaterials) m.emissiveIntensity = CHARACTER.recallGlow * this.recallBlend;

    // --- Camera bob driven by the stride ---------------------------------------------
    const bobAmount = moveW * (1 - air) * (input.recalling ? 0 : 1);
    this.headBobY = Math.sin(this.stridePhase * TAU * 2) * CHARACTER.headBob * bobAmount + this.kickY;
    this.headRoll = Math.cos(this.stridePhase * TAU) * CHARACTER.headRoll * bobAmount - input.strafeSpeed * 0.002;
  }

  /** Spring that dips the camera on take-off and landing. */
  private stepCameraKick(dt: number, input: RigInput): void {
    if (this.wasOnGround && !input.onGround) this.kickV -= CHARACTER.jumpKick;
    if (!this.wasOnGround && input.onGround) {
      this.kickV -= THREE.MathUtils.clamp(-this.airVy * CHARACTER.landKick, 0.2, 2.4);
    }
    if (!input.onGround) this.airVy = input.verticalSpeed;
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
    // Body's right axis in world space; positive rotation about it pitches the view up.
    this.root.updateMatrixWorld(true);
    this.tmpAxis.set(Math.cos(input.yaw), 0, -Math.sin(input.yaw));
    const share = (CHARACTER.spinePitchShare * input.pitch) / this.spine.length;
    for (const bone of this.spine) this.rotateBoneWorld(bone, this.tmpAxis, share);
  }

  /**
   * Two-bone IK: places each hand at a point fixed relative to the camera, so the hands read
   * in first person whatever the run clip does. The clip still drives everything else.
   */
  private applyArmIK(input: RigInput, moveW: number, air: number): void {
    if (this.arms.length === 0) return;
    const sprintK = THREE.MathUtils.clamp((input.speed - CHARACTER.walkToRunEnd) / 3, 0, 1);
    const pumpK = moveW * (1 - air) * (0.7 + 0.5 * sprintK);
    const phase = this.stridePhase * TAU;
    const rc = this.recallBlend;
    this.tmpEuler.set(input.pitch, input.yaw, 0, 'YXZ');
    this.tmpCamQ.setFromEuler(this.tmpEuler);

    for (const arm of this.arms) {
      const swing = Math.sin(phase + (arm.side === -1 ? 0 : Math.PI));
      const lift = Math.cos(phase + (arm.side === -1 ? 0 : Math.PI));
      // Target in eye space (x right, y up, -z forward).
      const t = this.tmpTarget.set(
        arm.side * CHARACTER.handSide,
        -CHARACTER.handDown,
        -CHARACTER.handForward,
      );
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
      this.solveTwoBone(arm.upper, arm.fore, arm.hand, t, arm.side);
    }
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
    const pole = this.ikPole.set(side * CHARACTER.elbowOut, -CHARACTER.elbowDown, CHARACTER.elbowBack).applyQuaternion(this.tmpCamQ);
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

  /** Rotates  (about the pivot) so the direction pivot->from points at pivot->to. */
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
    // GLTFLoader strips ':' from node names, so "mixamorig:Head" becomes "mixamorigHead".
    const bone = (suffix: string): THREE.Object3D | undefined => bones.get(`${CHARACTER.bonePrefix}${suffix}`);

    this.head = bone('Head') ?? null;
    this.spine = ['Spine', 'Spine1', 'Spine2'].map(bone).filter((b): b is THREE.Object3D => !!b);
    for (const [side, name] of [[-1, 'Left'], [1, 'Right']] as const) {
      const upper = bone(name + 'Arm');
      const fore = bone(name + 'ForeArm');
      const hand = bone(name + 'Hand');
      if (upper && fore && hand) this.arms.push({ side, upper, fore, hand });
    }

    this.model.add(scene);
    this.normaliseScale(scene, bone);
    this.prepareMeshes(scene);
    this.setupAnimation(scene, clips);

    this.root.visible = true;
    this.loaded = true;
  }

  /** Scales the rig to the player's height and puts the soles on y = 0. */
  private normaliseScale(scene: THREE.Group, bone: (s: string) => THREE.Object3D | undefined): void {
    scene.updateMatrixWorld(true);
    const top = bone('HeadTop_End') ?? bone('Head');
    const soles = [bone('LeftToe_End'), bone('RightToe_End'), bone('LeftFoot'), bone('RightFoot')].filter(
      (b): b is THREE.Object3D => !!b,
    );
    if (!top || soles.length === 0) return;
    const p = new THREE.Vector3();
    top.getWorldPosition(p);
    const topY = p.y;
    let soleY = Infinity;
    for (const s of soles) {
      s.getWorldPosition(p);
      soleY = Math.min(soleY, p.y);
    }
    const height = topY - soleY;
    if (height <= 0) return;
    const s = PLAYER.height / height;
    this.model.scale.setScalar(s);
    this.model.position.y = -soleY * s;
  }

  private prepareMeshes(scene: THREE.Group): void {
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
    });

    for (const mesh of meshes) {
      mesh.frustumCulled = false; // skinned bounds don't follow the posed mesh
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.isMeshStandardMaterial) {
        material.emissive = new THREE.Color(CHARACTER.glowColor);
        material.emissiveIntensity = 0;
        this.bodyMaterials.push(material);
      }

      // Invisible, shadow-only copy with the full (head included) geometry.
      const shadowProxy = new THREE.SkinnedMesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      shadowProxy.frustumCulled = false;
      shadowProxy.castShadow = true;
      shadowProxy.bind(mesh.skeleton, mesh.bindMatrix);
      mesh.parent?.add(shadowProxy);

      // Visible mesh: head triangles removed so the camera never sits inside a head.
      const trimmed = this.removeHeadTriangles(mesh);
      if (trimmed) mesh.geometry = trimmed;
      else mesh.visible = false; // e.g. a visor that is entirely head
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
  }

  /** Returns a copy of the mesh geometry without triangles skinned (mostly) to the head bone. */
  private removeHeadTriangles(mesh: THREE.SkinnedMesh): THREE.BufferGeometry | null {
    const geo = mesh.geometry;
    const skinIndex = geo.getAttribute('skinIndex');
    const skinWeight = geo.getAttribute('skinWeight');
    if (!skinIndex || !skinWeight) return geo;

    const headBones = new Set<number>();
    mesh.skeleton.bones.forEach((b, i) => {
      if (/Head/.test(b.name)) headBones.add(i);
    });

    const vertexCount = geo.getAttribute('position').count;
    const isHead = new Uint8Array(vertexCount);
    for (let v = 0; v < vertexCount; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        const idx = k === 0 ? skinIndex.getX(v) : k === 1 ? skinIndex.getY(v) : k === 2 ? skinIndex.getZ(v) : skinIndex.getW(v);
        const wt = k === 0 ? skinWeight.getX(v) : k === 1 ? skinWeight.getY(v) : k === 2 ? skinWeight.getZ(v) : skinWeight.getW(v);
        if (headBones.has(idx)) w += wt;
      }
      isHead[v] = w >= CHARACTER.headWeightThreshold ? 1 : 0;
    }

    const index = geo.getIndex();
    const source: ArrayLike<number> = index ? (index.array as ArrayLike<number>) : Array.from({ length: vertexCount }, (_, i) => i);
    const kept: number[] = [];
    for (let i = 0; i < source.length; i += 3) {
      const a = source[i];
      const b = source[i + 1];
      const c = source[i + 2];
      if (isHead[a] || isHead[b] || isHead[c]) continue;
      kept.push(a, b, c);
    }
    if (kept.length === 0) return null;

    const trimmed = geo.clone();
    trimmed.setIndex(kept);
    return trimmed;
  }

  private setupAnimation(scene: THREE.Group, clips: THREE.AnimationClip[]): void {
    const find = (name: string): THREE.AnimationClip | undefined =>
      clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const idleClip = find('Idle');
    const walkClip = find('Walk');
    const runClip = find('Run');
    if (!idleClip || !walkClip || !runClip) {
      throw new Error(`Missing Idle/Walk/Run clips. Found: ${clips.map((c) => c.name).join(', ')}`);
    }
    for (const clip of [idleClip, walkClip, runClip]) this.makeInPlace(clip);

    this.mixer = new THREE.AnimationMixer(scene);
    const make = (clip: THREE.AnimationClip): THREE.AnimationAction => {
      const action = this.mixer!.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.paused = true; // we set time by hand each frame
      action.setEffectiveWeight(0);
      return action;
    };
    this.idle = make(idleClip);
    this.walk = make(walkClip);
    this.run = make(runClip);
    this.idle.setEffectiveWeight(1);
    this.duration = { idle: idleClip.duration, walk: walkClip.duration, run: runClip.duration };
  }

  /** Removes horizontal root motion from the hips so physics alone moves the character. */
  private makeInPlace(clip: THREE.AnimationClip): void {
    for (const track of clip.tracks) {
      if (!track.name.endsWith('Hips.position')) continue;
      const values = track.values;
      const x0 = values[0];
      const z0 = values[2];
      for (let i = 0; i < values.length; i += 3) {
        values[i] = x0;
        values[i + 2] = z0;
      }
    }
  }
}

