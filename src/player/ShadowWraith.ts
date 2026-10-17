import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER, PLAYER, SPELL, WRAITH, type CameraMode } from '../config';
import type { ShadowWisps } from '../fx/ShadowWisps';
import type { HandPose, SpellPose } from '../combat/SpellHands';
import { createShadowMaterial, type ShadowUniforms } from './ShadowMaterial';

export interface WraithInput {
  feet: THREE.Vector3;
  /** FP eye — casting IK aims from here. */
  eye: THREE.Vector3;
  /** Render camera — near dissolve uses this. */
  viewEye: THREE.Vector3;
  cameraMode: CameraMode;
  yaw: number;
  pitch: number;
  velocity: THREE.Vector3;
  speed: number;
  onGround: boolean;
  /** 0..1 Recall glow. */
  recall: number;
  spells: SpellPose | null;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;
const UP = new THREE.Vector3(0, 1, 0);

interface Arm {
  side: 1 | -1;
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  hand: THREE.Object3D;
  palm: THREE.Object3D;
  smooth: THREE.Vector3;
  /** 0 = Float_Loop pose, 1 = full IK. */
  weight: number;
  animUpper: THREE.Quaternion;
  animFore: THREE.Quaternion;
}

/**
 * Shadow form: dedicated wraith GLB (idle float + skinned mesh) with accent wisps
 * from hem/hands and palm anchors for SpellHands. Casting applies two-bone IK onto
 * the arm bones; otherwise palms follow the idle pose.
 */
export class ShadowWraith {
  readonly body = new THREE.Group();
  /** Spell anchors just above each palm: [left, right]. */
  readonly palms: [THREE.Object3D, THREE.Object3D];
  /** Float bob (m) for the camera to share. */
  floatBob = 0;

  private readonly model = new THREE.Group();
  private readonly arms: Arm[] = [];
  private readonly leftPalm = new THREE.Object3D();
  private readonly rightPalm = new THREE.Object3D();
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private loaded = false;
  private visible = true;
  private dissolve = 0;
  private time = 0;
  private lowerBlend = 0;
  private smoothInit = false;
  private emitCarry = 0;
  private cameraMode: CameraMode = 'fp';
  private head: THREE.Object3D | null = null;
  private chest: THREE.Object3D | null = null;
  private readonly shadowMats: Array<{ material: THREE.MeshBasicMaterial; uniforms: ShadowUniforms }> = [];
  private readonly fpMeshes: THREE.SkinnedMesh[] = [];
  private readonly tpMeshes: THREE.SkinnedMesh[] = [];

  private readonly localVel = new THREE.Vector3();
  private readonly camQ = new THREE.Quaternion();
  private readonly bodyQ = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly h = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly tmpHead = new THREE.Vector3();
  private readonly tmpChest = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpPQ = new THREE.Quaternion();
  private readonly tmpR = new THREE.Quaternion();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly ikA = new THREE.Vector3();
  private readonly ikB = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly colliders: THREE.Box3[],
    private readonly wisps: ShadowWisps,
  ) {
    this.leftPalm.position.set(0, 0.04, -0.05);
    this.rightPalm.position.set(0, 0.04, -0.05);
    this.palms = [this.leftPalm, this.rightPalm];
    this.body.add(this.model);
    this.model.rotation.y = WRAITH.modelYaw;
    scene.add(this.body);
    this.load();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Meshes drawn for the active camera mode. */
  get visibleMeshes(): THREE.Mesh[] {
    return this.cameraMode === 'tp' ? this.tpMeshes : this.fpMeshes;
  }

  /** @deprecated alias for playtest metrics — use visibleMeshes. */
  get armMeshes(): THREE.Mesh[] {
    return this.visibleMeshes;
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.body.visible = on;
    this.smoothInit = false;
    this.applyMeshVisibility();
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.applyMeshVisibility();
  }

  private applyMeshVisibility(): void {
    const on = this.visible;
    const tp = this.cameraMode === 'tp';
    for (const m of this.fpMeshes) m.visible = on && !tp;
    for (const m of this.tpMeshes) m.visible = on && tp;
  }

  setDissolve(v: number): void {
    this.dissolve = THREE.MathUtils.clamp(v, 0, 1);
    for (const { uniforms } of this.shadowMats) uniforms.uDissolve.value = this.dissolve;
  }

  update(dt: number, input: WraithInput): void {
    if (!this.visible || dt <= 0) return;
    this.time += dt;

    const loop = this.idleAction;
    const phase = loop ? loop.time / loop.getClip().duration : this.time / 2.4;
    this.floatBob = Math.sin(phase * Math.PI * 2) * WRAITH.bobAmp;
    this.body.position.set(input.feet.x, input.feet.y + WRAITH.hover, input.feet.z);
    this.localVel.copy(input.velocity).applyAxisAngle(UP, -input.yaw);
    this.body.rotation.set(
      THREE.MathUtils.clamp(this.localVel.z * 0.03, -0.12, 0.12),
      input.yaw,
      THREE.MathUtils.clamp(-this.localVel.x * 0.025, -0.1, 0.1),
      'YXZ',
    );

    if (!this.loaded) return;

    this.mixer?.update(dt);
    this.body.updateMatrixWorld(true);

    if (input.cameraMode === 'fp') this.applyHeadLock(input);

    this.euler.set(input.pitch, input.yaw, 0, 'YXZ');
    this.camQ.setFromEuler(this.euler);
    this.bodyQ.setFromAxisAngle(UP, input.yaw);
    this.lowerBlend += ((input.spells?.lowered ? 1 : 0) - this.lowerBlend) * Math.min(1, dt * 8);

    for (const arm of this.arms) this.poseArm(arm, input, dt);
    this.smoothInit = true;
    this.body.updateMatrixWorld(true);

    for (const { uniforms } of this.shadowMats) {
      uniforms.uTime.value = this.time;
      uniforms.uEye.value.copy(input.viewEye);
    }

    this.emitAccents(dt, input);
  }

  /**
   * Pushes the body so the (trimmed) head sits behind the FP eye and the chest
   * stays clear of the lens — same idea as CharacterRig.applyHeadLock.
   */
  private applyHeadLock(input: WraithInput): void {
    if (!this.head) return;
    this.body.updateMatrixWorld(true);
    this.head.getWorldPosition(this.tmpHead);
    const fwd = this.tmpFwd.set(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));

    let dx = input.eye.x - fwd.x * WRAITH.cameraBackOffset - this.tmpHead.x;
    let dz = input.eye.z - fwd.z * WRAITH.cameraBackOffset - this.tmpHead.z;
    const dy = input.eye.y - CHARACTER.headBelowEye - this.tmpHead.y;

    if (this.chest) {
      this.chest.getWorldPosition(this.tmpChest);
      const ahead =
        (this.tmpChest.x + dx - input.eye.x) * fwd.x +
        (this.tmpChest.z + dz - input.eye.z) * fwd.z +
        WRAITH.chestRadius;
      const excess = ahead + WRAITH.chestClearance;
      if (excess > 0) {
        dx -= fwd.x * excess;
        dz -= fwd.z * excess;
      }
    }
    this.body.position.x += dx;
    this.body.position.y += dy * 0.5;
    this.body.position.z += dz;
    this.body.updateMatrixWorld(true);
  }

  private load(): void {
    new GLTFLoader().load(
      WRAITH.modelUrl,
      (gltf) => {
        try {
          this.setup(gltf.scene, gltf.animations);
        } catch (err) {
          console.error('Wraith setup failed.', err);
        }
      },
      undefined,
      (err) => console.error('Wraith failed to load.', err),
    );
  }

  private setup(scene: THREE.Group, clips: THREE.AnimationClip[]): void {
    const bones = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o);
    });
    const bone = (name: string): THREE.Object3D | undefined => bones.get(name);
    const b = WRAITH.bones;

    this.head = bone(b.head) ?? null;
    this.chest = bone(b.chest) ?? null;

    const handL = bone(b.arms.left[2]);
    const handR = bone(b.arms.right[2]);
    if (handL) handL.add(this.leftPalm);
    if (handR) handR.add(this.rightPalm);

    for (const [side, names, palm] of [
      [-1, b.arms.left, this.leftPalm] as const,
      [1, b.arms.right, this.rightPalm] as const,
    ]) {
      const [upper, fore, hand] = names.map(bone);
      if (!upper || !fore || !hand) {
        console.warn(`Wraith missing arm bones (${side}): ${names.join(', ')}`);
        continue;
      }
      this.arms.push({
        side,
        upper,
        fore,
        hand,
        palm,
        smooth: new THREE.Vector3(),
        weight: 0,
        animUpper: new THREE.Quaternion(),
        animFore: new THREE.Quaternion(),
      });
    }

    this.model.add(scene);
    this.normaliseScale(scene);
    this.prepareMeshes(scene);
    this.setupIdle(scene, clips);

    this.body.visible = this.visible;
    this.loaded = true;
  }

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

    const cache = new Map<string, { material: THREE.MeshBasicMaterial; uniforms: ShadowUniforms }>();
    const forSlot = (name: string) => {
      const hit = cache.get(name);
      if (hit) return hit;
      const made = createShadowMaterial();
      const hex = WRAITH.colors[name] ?? WRAITH.colors.W_Body ?? 0x05050c;
      made.material.color.setHex(hex);
      // Light body erosion in TP; near-eye boost in the shader still frays FP leftovers.
      made.uniforms.uErosion.value = 0.28;
      made.uniforms.uRimColor.value.setHex(0x6a5cff);
      made.uniforms.uRimStrength.value = name === 'W_Accent' ? 0.85 : 0.4;
      cache.set(name, made);
      this.shadowMats.push(made);
      return made;
    };

    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      const slot = (mesh.material as THREE.Material).name || 'W_Body';
      const mat = forSlot(slot).material;
      mesh.material = mat;

      const tpMesh = new THREE.SkinnedMesh(mesh.geometry, mat);
      tpMesh.frustumCulled = false;
      tpMesh.castShadow = true;
      tpMesh.receiveShadow = true;
      tpMesh.bind(mesh.skeleton, mesh.bindMatrix);
      mesh.parent?.add(tpMesh);
      this.tpMeshes.push(tpMesh);

      const trimmed = this.removeHiddenTriangles(mesh);
      if (trimmed) {
        mesh.geometry = trimmed;
        this.fpMeshes.push(mesh);
      } else mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.applyMeshVisibility();
  }

  private removeHiddenTriangles(mesh: THREE.SkinnedMesh): THREE.BufferGeometry | null {
    const geo = mesh.geometry;
    const skinIndex = geo.getAttribute('skinIndex');
    const skinWeight = geo.getAttribute('skinWeight');
    if (!skinIndex || !skinWeight) return geo;

    const hidden = new Set<number>();
    const hiddenNames: readonly string[] = WRAITH.bones.hidden;
    mesh.skeleton.bones.forEach((b, i) => {
      if (hiddenNames.includes(b.name)) hidden.add(i);
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

  private setupIdle(scene: THREE.Group, clips: THREE.AnimationClip[]): void {
    const name = WRAITH.clips.idle;
    const clip =
      clips.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
      clips.find((c) => /float|idle/i.test(c.name)) ??
      clips[0];
    this.mixer = new THREE.AnimationMixer(scene);
    if (!clip) {
      console.warn('Wraith has no idle clip; mesh will be static.');
      return;
    }
    this.idleAction = this.mixer.clipAction(clip);
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.play();
  }

  /** Accent wisps only — hem tendrils and hand trails; the mesh owns the silhouette. */
  private emitAccents(dt: number, input: WraithInput): void {
    const presence = 1 - this.dissolve;
    if (presence < 0.04) return;

    const charging = input.spells?.hands.some((hp) => hp.state === 'charging' || hp.state === 'ready') ?? false;
    const rate =
      (WRAITH.hemSmoke + WRAITH.hemSmokePerSpeed * input.speed + (charging ? 22 : 0)) * presence;
    this.emitCarry += dt * rate;
    while (this.emitCarry >= 1) {
      this.emitCarry -= 1;
      if (Math.random() < 0.55) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.22 + Math.random() * 0.2;
        this.v.set(Math.cos(a) * r, 0.05 + Math.random() * 0.18, Math.sin(a) * r).applyMatrix4(this.body.matrixWorld);
        this.wisps.emitAt(this.v, input.velocity, 1, { inherit: 0.2, spread: 0.07, scale: 1.15, life: 1.2 });
      } else {
        const arm = this.arms[(Math.random() * this.arms.length) | 0];
        if (!arm) continue;
        arm.palm.getWorldPosition(this.v);
        this.v.x += (Math.random() - 0.5) * 0.06;
        this.v.y += (Math.random() - 0.5) * 0.05;
        this.wisps.emitAt(this.v, input.velocity, 1, {
          inherit: 0.45,
          spread: 0.03,
          scale: 0.45 + Math.random() * 0.3,
          life: 0.75,
        });
      }
    }
  }

  /**
   * Float_Loop drives the arms; IK toward camera-space spell targets blends in while
   * casting (and partially in FP idle so the forearms stay in frame).
   */
  private poseArm(arm: Arm, input: WraithInput, dt: number): void {
    const side = arm.side;
    const spells = input.spells;
    const hand: HandPose = spells ? spells.hands[side === -1 ? 0 : 1] : { state: 'idle', t: 0, charge: 0 };
    const casting = hand.state === 'charging' || hand.state === 'ready' || hand.state === 'release';

    const goal = casting ? 1 : input.cameraMode === 'fp' ? WRAITH.fpIdleIk : 0;
    arm.weight += (goal - arm.weight) * Math.min(1, dt * WRAITH.ikBlendRate);
    if (!this.smoothInit) arm.weight = goal;
    if (arm.weight < 0.002) return;
    arm.animUpper.copy(arm.upper.quaternion);
    arm.animFore.copy(arm.fore.quaternion);

    const mix = (a: readonly number[], b: readonly number[], k: number): THREE.Vector3 =>
      this.v.set(side * lerp(a[0], b[0], k), lerp(a[1], b[1], k), -lerp(a[2], b[2], k));
    const k = (x: number, d: number): number => smoothstep(0, d, x);
    const held = hand.state === 'charging' || hand.state === 'ready';
    const stance = SPELL.stanceHand;
    if (spells?.dual && held) mix(SPELL.chargeHand, SPELL.dualHand, k(hand.t, 0.18));
    else if (held) mix(stance, SPELL.chargeHand, hand.state === 'ready' ? 1 : k(hand.t, 0.15));
    else if (hand.state === 'release') {
      if (hand.t < SPELL.releaseTime) mix(SPELL.chargeHand, SPELL.releaseHand, k(hand.t, SPELL.releaseTime));
      else mix(SPELL.releaseHand, stance, k(hand.t - SPELL.releaseTime, SPELL.recoverTime));
    } else mix(WRAITH.fpIdleHand, WRAITH.fpIdleHand, 0);

    const target = this.v;
    const tremble = hand.state === 'ready' ? 0.005 : 0;
    target.x += (Math.random() - 0.5) * tremble + Math.sin(this.time * 0.8 + side * 2) * 0.006;
    target.y += (Math.random() - 0.5) * tremble + Math.sin(this.time * 1.1 + side) * 0.01;
    this.h.set(side * SPELL.sprintHand[0], SPELL.sprintHand[1], -SPELL.sprintHand[2]);
    target.lerp(this.h, this.lowerBlend);
    if (!this.smoothInit || hand.state === 'release') arm.smooth.copy(target);
    else arm.smooth.lerp(target, Math.min(1, dt * 14));
    target.copy(arm.smooth).applyQuaternion(this.camQ).add(input.eye);
    this.keepOutOfWalls(input.eye, target);
    this.solveTwoBone(arm, target);
    if (arm.weight < 0.999) {
      arm.upper.quaternion.copy(arm.animUpper.slerp(arm.upper.quaternion, arm.weight));
      arm.fore.quaternion.copy(arm.animFore.slerp(arm.fore.quaternion, arm.weight));
    }
  }

  private solveTwoBone(arm: Arm, target: THREE.Vector3): void {
    const { upper, fore, hand, side } = arm;
    upper.updateWorldMatrix(true, true);
    upper.getWorldPosition(this.s);
    fore.getWorldPosition(this.e);
    hand.getWorldPosition(this.h);
    const l1 = this.s.distanceTo(this.e);
    const l2 = this.e.distanceTo(this.h);
    if (l1 < 1e-4 || l2 < 1e-4) return;

    this.dir.subVectors(target, this.s);
    const distance = THREE.MathUtils.clamp(this.dir.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    this.dir.normalize();
    const a = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    this.pole.set(side * 0.6, -0.7, 0.35).applyQuaternion(this.camQ);
    this.pole.addScaledVector(this.dir, -this.pole.dot(this.dir)).normalize();
    this.e.copy(this.s).addScaledVector(this.dir, a).addScaledVector(this.pole, height);
    this.h.copy(this.s).addScaledVector(this.dir, distance);

    this.aimBone(upper, this.s, fore.getWorldPosition(this.v), this.e);
    fore.updateWorldMatrix(true, true);
    fore.getWorldPosition(this.e);
    hand.getWorldPosition(this.v);
    this.aimBone(fore, this.e, this.v, this.h);
  }

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

  private keepOutOfWalls(eye: THREE.Vector3, target: THREE.Vector3): void {
    this.dir.subVectors(target, eye);
    const len = this.dir.length();
    if (len < 1e-4) return;
    this.dir.divideScalar(len);
    this.ray.set(eye, this.dir);
    let reach = len + CHARACTER.palmOffset;
    for (const box of this.colliders) {
      if (this.ray.intersectBox(box, this.hit)) reach = Math.min(reach, this.hit.distanceTo(eye));
    }
    const allowed = Math.max(0.05, reach - CHARACTER.palmOffset);
    if (allowed < len) target.copy(eye).addScaledVector(this.dir, allowed);
  }
}
