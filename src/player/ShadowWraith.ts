import * as THREE from 'three';
import { CHARACTER, SHADOW, SPELL, WRAITH } from '../config';
import { createShadowMaterial, type ShadowUniforms } from './ShadowMaterial';
import type { ShadowWisps } from '../fx/ShadowWisps';
import type { HandPose, SpellPose } from '../combat/SpellHands';

export interface WraithInput {
  feet: THREE.Vector3;
  eye: THREE.Vector3;
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
const RIM = new THREE.Color(SHADOW.rimColor);
const RECALL_RIM = new THREE.Color(SHADOW.recallRimColor);
const UP = new THREE.Vector3(0, 1, 0);

/** Cloak silhouette (radius, height) from the hem up to the collar. */
const CLOAK_PROFILE: Array<[number, number]> = [
  [0.44, 0.1],
  [0.41, 0.25],
  [0.36, 0.45],
  [0.31, 0.65],
  [0.27, 0.85],
  [0.25, 1.02],
  [0.26, 1.17],
  [0.25, 1.29],
  [0.2, 1.39],
  [0.13, 1.46],
  [0.08, 1.5],
];

/** A tapered segment along local -Z from 0 to -1 (scale z to the length). */
function segmentGeometry(r0: number, r1: number, radial = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, 1, radial, 1, false);
  g.translate(0, 0.5, 0);
  g.rotateX(-Math.PI / 2);
  return g;
}

interface Arm {
  side: 1 | -1;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  sleeve: THREE.Mesh;
  hand: THREE.Group;
  palm: THREE.Object3D;
  /** Finger roots and their middle joints (curled each frame). */
  fingers: Array<{ root: THREE.Object3D; mid: THREE.Object3D; spread: number }>;
  smooth: THREE.Vector3;
  curl: number;
}

/**
 * The shadow form's own body: a legless, hooded wraith of ink. Its cloak flutters and trails
 * behind as it glides, smoke pours from the hem, a void fills the hood with two violet eyes, and
 * long gaunt arms end in claws that cradle the spells. Built procedurally; no GLB or skinning.
 *
 * Cloak and hood live on WRAITH.bodyLayer: third-person views and the sun's shadow see them,
 * the first-person camera does not (Skyrim-style arms-only view).
 */
export class ShadowWraith {
  readonly body = new THREE.Group();
  /** Spell anchors just above each palm: [left, right]. */
  readonly palms: [THREE.Object3D, THREE.Object3D];
  /** Meshes the first-person camera draws (playtest metrics). */
  readonly armMeshes: THREE.Mesh[] = [];
  /** Float bob (m) for the camera to share. */
  floatBob = 0;

  private readonly uniforms: ShadowUniforms;
  private readonly cloak: THREE.Mesh;
  private readonly cloakBase: Float32Array;
  private readonly cloakAngle: Float32Array;
  private readonly eyes: THREE.Mesh[] = [];
  private readonly arms: Arm[] = [];
  private readonly armRoot = new THREE.Group();
  private time = 0;
  private lowerBlend = 0;
  private visible = true;
  private smoothInit = false;
  private hemCarry = 0;
  private handCarry = 0;
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
  private readonly basis = new THREE.Matrix4();
  private readonly bx = new THREE.Vector3();
  private readonly by = new THREE.Vector3();
  private readonly bz = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly colliders: THREE.Box3[],
    private readonly wisps: ShadowWisps,
  ) {
    const { material, uniforms } = createShadowMaterial();
    this.uniforms = uniforms;
    const onBody = (o: THREE.Object3D): void => {
      o.layers.set(WRAITH.bodyLayer);
      o.castShadow = true;
    };

    // --- Cloak: a lathe with a jagged hem, animated every frame ---------------------
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < CLOAK_PROFILE.length - 1; i++) {
      const [r0, y0] = CLOAK_PROFILE[i];
      const [r1, y1] = CLOAK_PROFILE[i + 1];
      for (let k = 0; k < 2; k++) pts.push(new THREE.Vector2(lerp(r0, r1, k / 2), lerp(y0, y1, k / 2)));
    }
    pts.push(new THREE.Vector2(...CLOAK_PROFILE[CLOAK_PROFILE.length - 1]));
    const cloakGeo = new THREE.LatheGeometry(pts, 40);
    const pos = cloakGeo.getAttribute('position') as THREE.BufferAttribute;
    this.cloakAngle = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const a = Math.atan2(z, x);
      this.cloakAngle[i] = a;
      // Tattered hem: torn strips of uneven length.
      if (y < 0.3) {
        const tear = Math.abs(Math.sin(a * 7.0) * 0.06 + Math.sin(a * 13.0 + 1.3) * 0.05 + Math.sin(a * 23.0) * 0.03);
        pos.setY(i, y + tear * (1 - (y - 0.1) / 0.2));
      }
    }
    this.cloakBase = new Float32Array(pos.array as Float32Array);
    this.cloak = new THREE.Mesh(cloakGeo, material);
    onBody(this.cloak);
    this.cloak.frustumCulled = false;
    this.body.add(this.cloak);

    // --- Hood: open at the front, a void inside, two violet eyes --------------------
    const front = 1.5 * Math.PI;
    const opening = 0.85;
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 24, 16, front + opening, Math.PI * 2 - 2 * opening, 0, Math.PI * 0.62),
      material,
    );
    hood.position.set(0, 1.56, 0.01);
    hood.scale.set(1, 1.35, 1.2);
    onBody(hood);
    this.body.add(hood);
    // Peak of the hood, swept back.
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 12, 1, true), material);
    peak.position.set(0, 1.83, 0.07);
    peak.rotation.x = -0.5;
    onBody(peak);
    this.body.add(peak);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), voidMat);
    inner.position.set(0, 1.58, 0.03);
    inner.scale.set(1, 1.25, 1);
    onBody(inner);
    this.body.add(inner);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: WRAITH.eyeColor,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), eyeMat);
      eye.position.set(x, 1.6, -0.1);
      eye.scale.set(1.4, 0.6, 0.5);
      eye.layers.set(WRAITH.bodyLayer);
      this.body.add(eye);
      this.eyes.push(eye);
    }
    scene.add(this.body);

    // --- Arms: long, gaunt, clawed (first-person visible) ---------------------------
    const upperGeo = segmentGeometry(0.036, 0.027);
    const foreGeo = segmentGeometry(0.027, 0.018);
    const sleeveGeo = this.tornSleeve();
    const knuckleGeo = segmentGeometry(0.009, 0.007, 5);
    const clawGeo = segmentGeometry(0.007, 0.0005, 5);
    const palmGeo = new THREE.SphereGeometry(1, 10, 8);
    for (const side of [-1, 1] as const) {
      const mk = (geo: THREE.BufferGeometry): THREE.Mesh => {
        const m = new THREE.Mesh(geo, material);
        m.castShadow = true;
        m.frustumCulled = false;
        this.armMeshes.push(m);
        return m;
      };
      const upper = mk(upperGeo);
      const fore = mk(foreGeo);
      const sleeve = mk(sleeveGeo);
      const hand = new THREE.Group();
      const palmMesh = mk(palmGeo);
      palmMesh.scale.set(0.034, 0.013, 0.042);
      palmMesh.position.set(0, 0, -0.025);
      hand.add(palmMesh);
      const fingers: Arm['fingers'] = [];
      const spreads = [-0.026, -0.009, 0.009, 0.026];
      spreads.forEach((x, i) => {
        const root = new THREE.Object3D();
        root.position.set(x, 0, -0.06);
        const knuckle = mk(knuckleGeo);
        knuckle.scale.z = 0.05 - Math.abs(i - 1.5) * 0.006;
        root.add(knuckle);
        const mid = new THREE.Object3D();
        mid.position.z = -knuckle.scale.z;
        const claw = mk(clawGeo);
        claw.scale.z = WRAITH.claw * (1 - Math.abs(i - 1.5) * 0.12);
        mid.add(claw);
        root.add(mid);
        hand.add(root);
        fingers.push({ root, mid, spread: (i - 1.5) * 0.24 });
      });
      // Thumb, angled in from the inner side of the palm.
      const thumb = new THREE.Object3D();
      thumb.position.set(-side * 0.032, 0, -0.02);
      const tk = mk(knuckleGeo);
      tk.scale.z = 0.035;
      thumb.add(tk);
      const tmid = new THREE.Object3D();
      tmid.position.z = -0.035;
      const tc = mk(clawGeo);
      tc.scale.z = WRAITH.claw * 0.6;
      tmid.add(tc);
      thumb.add(tmid);
      hand.add(thumb);
      fingers.push({ root: thumb, mid: tmid, spread: -side * 0.7 });

      const palm = new THREE.Object3D();
      palm.position.set(0, 0.045, -0.05);
      hand.add(palm);
      this.armRoot.add(upper, fore, sleeve, hand);
      this.arms.push({ side, upper, fore, sleeve, hand, palm, fingers, smooth: new THREE.Vector3(), curl: WRAITH.relaxedCurl });
    }
    scene.add(this.armRoot);
    this.palms = [this.arms[0].palm, this.arms[1].palm];
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.body.visible = on;
    this.armRoot.visible = on;
    this.smoothInit = false;
  }

  setDissolve(v: number): void {
    this.uniforms.uDissolve.value = v;
    for (const eye of this.eyes) eye.visible = v < 0.35;
  }

  update(dt: number, input: WraithInput): void {
    if (!this.visible || dt <= 0) return;
    this.time += dt;
    const t = this.time;

    // --- Body: hover, bob, face the view, lean into the glide -------------------------
    this.floatBob = Math.sin(t * Math.PI * 2 * WRAITH.bobHz) * WRAITH.bobAmp;
    this.body.position.set(input.feet.x, input.feet.y + WRAITH.hover + this.floatBob, input.feet.z);
    this.localVel.copy(input.velocity).applyAxisAngle(UP, -input.yaw);
    this.body.rotation.set(THREE.MathUtils.clamp(this.localVel.z * 0.03, -0.12, 0.12), input.yaw, THREE.MathUtils.clamp(-this.localVel.x * 0.025, -0.1, 0.1), 'YXZ');
    this.body.updateMatrixWorld(true);
    this.animateCloak(t, input.speed);

    // --- Look -----------------------------------------------------------------------------
    this.uniforms.uTime.value = t;
    this.uniforms.uEye.value.copy(input.eye);
    this.uniforms.uRimColor.value.lerpColors(RIM, RECALL_RIM, input.recall);
    this.uniforms.uRimStrength.value = lerp(SHADOW.rimStrength, SHADOW.recallRimStrength, input.recall);
    const charging = input.spells?.hands.some((hp) => hp.state === 'charging' || hp.state === 'ready') ?? false;
    const flicker = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3);
    for (const eye of this.eyes) {
      eye.scale.y = (charging ? 0.35 : 0.6) * (0.85 + 0.15 * flicker);
      (eye.material as THREE.MeshBasicMaterial).opacity = charging ? 1 : 0.75 * flicker;
    }

    // --- Arms -------------------------------------------------------------------------
    this.euler.set(input.pitch, input.yaw, 0, 'YXZ');
    this.camQ.setFromEuler(this.euler);
    this.bodyQ.setFromAxisAngle(UP, input.yaw);
    this.lowerBlend += ((input.spells?.lowered ? 1 : 0) - this.lowerBlend) * Math.min(1, dt * 8);
    for (const arm of this.arms) this.poseArm(arm, input, dt);
    this.smoothInit = true;

    // --- Smoke: pouring from the hem, curling off sleeves and claws ------------------------
    this.hemCarry += dt * (WRAITH.hemSmoke + WRAITH.hemSmokePerSpeed * input.speed);
    while (this.hemCarry >= 1) {
      this.hemCarry -= 1;
      const a = Math.random() * Math.PI * 2;
      this.v.set(Math.cos(a) * 0.4, 0.14 + Math.random() * 0.1, Math.sin(a) * 0.4).applyMatrix4(this.body.matrixWorld);
      this.wisps.emitAt(this.v, input.velocity, 1, { inherit: 0.25, spread: 0.05, scale: 1.1, life: 1.1 });
    }
    this.handCarry += dt * 14;
    while (this.handCarry >= 1) {
      this.handCarry -= 1;
      const arm = this.arms[(Math.random() * 2) | 0];
      const src = Math.random() < 0.5 ? arm.hand : arm.sleeve;
      src.getWorldPosition(this.v);
      this.wisps.emitAt(this.v, input.velocity, 1, { inherit: 0.6, spread: 0.04, scale: 0.45, life: 0.7 });
    }
  }

  /** Flutter that grows towards the hem, and a drag that trails the cloak behind the glide. */
  private animateCloak(t: number, speed: number): void {
    const pos = this.cloak.geometry.getAttribute('position') as THREE.BufferAttribute;
    const base = this.cloakBase;
    const arr = pos.array as Float32Array;
    const vx = THREE.MathUtils.clamp(this.localVel.x, -6, 6);
    const vz = THREE.MathUtils.clamp(this.localVel.z, -6, 6);
    const gust = 0.6 + 0.4 * Math.min(speed / 3, 1);
    for (let i = 0; i < pos.count; i++) {
      const k = i * 3;
      const x = base[k];
      const y = base[k + 1];
      const z = base[k + 2];
      const low = THREE.MathUtils.clamp((1.4 - y) / 1.3, 0, 1);
      const w = low * low;
      const a = this.cloakAngle[i];
      const flutter = (Math.sin(t * 2.1 + a * 3 + y * 5) + 0.6 * Math.sin(t * 3.7 - a * 5 + y * 3)) * 0.022 * w * gust;
      const r = Math.hypot(x, z) || 1;
      arr[k] = x + (x / r) * flutter - vx * 0.035 * w;
      arr[k + 1] = y + Math.sin(t * 1.7 + a * 4) * 0.012 * w + Math.hypot(vx, vz) * 0.02 * w;
      arr[k + 2] = z + (z / r) * flutter - vz * 0.035 * w;
    }
    pos.needsUpdate = true;
    this.cloak.geometry.computeVertexNormals();
  }

  /** Casting stance (Skyrim-style) solved onto this arm's own segments. */
  private poseArm(arm: Arm, input: WraithInput, dt: number): void {
    const side = arm.side;
    const spells = input.spells;
    const hand: HandPose = spells ? spells.hands[side === -1 ? 0 : 1] : { state: 'idle', t: 0, charge: 0 };
    const mix = (a: readonly number[], b: readonly number[], k: number): THREE.Vector3 =>
      this.v.set(side * lerp(a[0], b[0], k), lerp(a[1], b[1], k), -lerp(a[2], b[2], k));
    const k = (x: number, d: number): number => smoothstep(0, d, x);
    const held = hand.state === 'charging' || hand.state === 'ready';
    const stance = SPELL.stanceHand;
    let targetCurl: number = WRAITH.relaxedCurl;
    if (spells?.dual && held) {
      mix(SPELL.chargeHand, SPELL.dualHand, k(hand.t, 0.18));
      targetCurl = 0.25;
    } else if (held) {
      mix(stance, SPELL.chargeHand, hand.state === 'ready' ? 1 : k(hand.t, 0.15));
      targetCurl = 0.25;
    } else if (hand.state === 'release') {
      if (hand.t < SPELL.releaseTime) mix(SPELL.chargeHand, SPELL.releaseHand, k(hand.t, SPELL.releaseTime));
      else mix(SPELL.releaseHand, stance, k(hand.t - SPELL.releaseTime, SPELL.recoverTime));
      targetCurl = hand.t < SPELL.releaseTime + 0.1 ? -0.15 : WRAITH.relaxedCurl;
    } else {
      mix(stance, stance, 0);
    }
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
    arm.curl += (targetCurl - arm.curl) * Math.min(1, dt * 12);

    // Shoulder fixed to the body (yaw only), so the arms reach out from under the hood.
    const [sx, sy, sz] = WRAITH.shoulder;
    this.s.set(side * sx, sy, -sz).applyQuaternion(this.bodyQ);
    this.s.x += input.feet.x;
    this.s.y += input.feet.y + WRAITH.hover + this.floatBob;
    this.s.z += input.feet.z;

    // Two-bone solve: elbows bow outward and down.
    const l1 = WRAITH.upperArm;
    const l2 = WRAITH.foreArm;
    this.dir.subVectors(target, this.s);
    const d = THREE.MathUtils.clamp(this.dir.length(), 0.08, l1 + l2 - 1e-3);
    this.dir.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    this.pole.set(side * 0.6, -0.7, 0.35).applyQuaternion(this.camQ);
    this.pole.addScaledVector(this.dir, -this.pole.dot(this.dir)).normalize();
    this.e.copy(this.s).addScaledVector(this.dir, a).addScaledVector(this.pole, hgt);
    this.h.copy(this.s).addScaledVector(this.dir, d);

    this.placeSegment(arm.upper, this.s, this.e);
    this.placeSegment(arm.fore, this.e, this.h);
    this.placeSegment(arm.sleeve, this.s, this.v.lerpVectors(this.s, this.e, 0.55));

    // Hand: points along the forearm, palm turned up towards the view.
    this.bz.subVectors(this.h, this.e).normalize().negate(); // local +Z points back up the forearm
    this.by.set(0, 1, 0).applyQuaternion(this.camQ);
    this.by.addScaledVector(this.bz, -this.by.dot(this.bz)).normalize();
    this.bx.crossVectors(this.by, this.bz);
    this.basis.makeBasis(this.bx, this.by, this.bz);
    arm.hand.quaternion.setFromRotationMatrix(this.basis);
    arm.hand.position.copy(this.h);
    for (const f of arm.fingers) {
      // Splayed claws reaching forward; they hook up around the spell as they curl.
      f.root.rotation.set(arm.curl * 0.45, f.spread * (1 - Math.max(arm.curl, 0) * 0.3), 0);
      f.mid.rotation.set(arm.curl * 0.8 + 0.15, 0, 0);
    }
  }

  /** Orients a unit -Z segment mesh from `a` to `b`. */
  private placeSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    this.hit.subVectors(b, a);
    const len = this.hit.length();
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(this.bz.set(0, 0, -1), this.hit.divideScalar(Math.max(len, 1e-5)));
    mesh.scale.set(1, 1, len);
  }

  /** Pulls `target` back along the eye->target line to just in front of the first wall hit. */
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

  /** Open sleeve cone with a torn rim, along local -Z. */
  private tornSleeve(): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(0.085, 0.055, 1, 12, 2, true);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.4) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        p.setY(i, y + Math.abs(Math.sin(a * 5) * 0.25 + Math.sin(a * 11 + 0.7) * 0.15));
      }
    }
    g.translate(0, 0.5, 0);
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }
}
