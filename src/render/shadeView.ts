import * as THREE from 'three';
import { CFG } from '../config';
import type { Shade, ShadeKind } from '../sim/world';
import { CrawlerMesh, LanternMesh, turnToward, type EnemyMesh } from './enemyViews';
import type { Particles } from './particles';
import { ENEMY_RIM, rimify, setFade, setRimHot } from './rim';
import { tatterTexture } from './textures';

const TATTER = tatterTexture(11);

const POOL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POOL_FRAG = /* glsl */ `
  uniform float uT; uniform float uA;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float ink = smoothstep(1.0, 0.55, r);
    float ring = smoothstep(0.08, 0.0, abs(r - fract(uT * 0.8) * 0.95)) * (1.0 - r);
    float rim = smoothstep(0.75, 0.95, r) * smoothstep(1.0, 0.95, r);
    vec3 col = vec3(0.0) + vec3(0.55, 0.25, 1.2) * (ring * 0.9 + rim * 0.6);
    gl_FragColor = vec4(col, (ink * 0.92 + ring * 0.5) * uA);
  }`;

/** One wraith: hooded, tattered robe, long clawed arms, ember eyes. */
class ShadeMesh {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private robe: THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>;
  private cowlMat!: THREE.MeshStandardMaterial;
  private robeBase: Float32Array;
  private arms: THREE.Group[] = [];
  private hood = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private pool: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private seed = Math.random() * 10;
  flash = 0;
  turnYaw?: number;
  private robeMat: THREE.MeshStandardMaterial;

  constructor() {
    this.mat = rimify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0 }), 0.75, 'shade', ENEMY_RIM);
    const robeMat = rimify(
      new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0, alphaMap: TATTER, alphaTest: 0.5, side: THREE.DoubleSide }),
      0.6,
      'shaderobe',
      ENEMY_RIM,
    );
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.9, 0.3), transparent: true, toneMapped: false });

    // robe: a lathe-turned hunched silhouette, flared and torn at the hem, narrow at the waist, heavy shoulders
    const profile = [
      [0.7, 0.0], [0.62, 0.1], [0.52, 0.4], [0.42, 0.8], [0.37, 1.08], [0.44, 1.3], [0.52, 1.45], [0.47, 1.57], [0.3, 1.68], [0.1, 1.74],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const robeGeo = new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(24), 36);
    robeGeo.scale(1, 1, 0.78);
    this.robeMat = robeMat;
    this.robe = new THREE.Mesh(robeGeo, robeMat);
    this.robe.castShadow = true;
    this.robe.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: TATTER, alphaTest: 0.5 });
    this.robeBase = Float32Array.from(robeGeo.attributes.position.array as Float32Array);
    this.body.add(this.robe);

    const m = (g: THREE.BufferGeometry, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(g, this.mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    // hood: a tall cowl whose point droops forward over an empty face
    this.hood.position.set(0.16, 1.66, 0);
    this.body.add(this.hood);
    // a deep cowl: rounded at the back, its point drooping forward over an empty face
    const cowlGeo = new THREE.ConeGeometry(0.28, 0.62, 32, 12, true);
    const cp = cowlGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i);
      const t = (y + 0.31) / 0.62; // 0 at the opening, 1 at the tip
      const back = Math.max(0, -cp.getX(i)) * 0.25 * (1 - t); // fuller at the back of the head
      cp.setXYZ(i, cp.getX(i) * (1 - 0.1 * t) - back + t * t * 0.3, y - t * t * 0.22, cp.getZ(i) * 0.92);
    }
    cowlGeo.computeVertexNormals();
    const cowl = m(cowlGeo, this.hood, 0, 0.2, 0);
    cowl.rotation.z = -0.35; // opening faces forward and down, the point hangs over the brow
    const cowlMat = rimify(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 1, metalness: 0, specularIntensity: 0, side: THREE.DoubleSide }), 0.8, 'shadecowl', ENEMY_RIM);
    cowl.material = cowlMat;
    this.cowlMat = cowlMat;
    const eyes = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.16, 4, 8), this.eyeMat);
    eyes.rotation.x = Math.PI / 2;
    eyes.position.set(0.17, 0.08, 0);
    this.hood.add(eyes);
    // long arms in wide ragged sleeves, ending in three hooked claws
    for (const z of [0.32, -0.32]) {
      const arm = new THREE.Group();
      arm.position.set(0.12, 1.42, z);
      m(new THREE.CylinderGeometry(0.06, 0.15, 0.55, 18, 1, true), arm, 0, -0.27, 0); // sleeve
      m(new THREE.CylinderGeometry(0.028, 0.045, 0.55, 12), arm, 0, -0.75, 0); // forearm
      for (let i = 0; i < 3; i++) {
        const claw = new THREE.ConeGeometry(0.022, 0.42, 10);
        claw.translate(0, -0.21, 0);
        const c = m(claw, arm, 0.02, -1.0, (i - 1) * 0.045);
        c.rotation.z = (i - 1) * 0.28 + 0.35;
      }
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.root.add(this.body);

    this.pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.ShaderMaterial({ vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, uniforms: { uT: { value: 0 }, uA: { value: 0 } }, transparent: true, depthWrite: false }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    this.root.add(this.pool);
  }

  update(s: Shade, dt: number, t: number, smoke: Particles, embers: Particles): void {
    const S = CFG.shade;
    const big = s.big ? 1.65 : 1;
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = -turnToward(this, s.yaw, dt);
    this.root.scale.set(big, big, big);
    const tt = t + this.seed;
    let rise = 1;
    let lean = 0.32 + Math.sin(tt * 1.7) * 0.05;
    let armA = 0.55 + Math.sin(tt * 2.3) * 0.12;
    let opacity = 1;
    let poolA = 0;
    if (s.state === 'rise') {
      const r = Math.min(1, s.stateT / S.riseTime);
      poolA = Math.min(1, r * 4);
      rise = Math.max(0, (r - 0.25) / 0.75);
      rise = 1 - Math.pow(1 - rise, 3);
      armA = 2.6 - 1.6 * rise; // arms reach up out of the pool first
    } else if (s.state === 'windup') {
      const e = s.stateT / S.windup;
      lean = 0.1 - 0.35 * e;
      armA = 0.55 + 2.2 * e; // claws raised high
    } else if (s.state === 'strike') {
      lean = 0.75;
      armA = -0.2;
    } else if (s.state === 'stagger') {
      // thrown: bent back, arms flung up; on the ground it straightens as the stagger runs out
      lean = s.air ? -0.85 + Math.min(0.3, s.stateT * 0.6) : -0.4 * (1 - Math.min(1, s.stateT / s.stun));
      armA = s.air ? 2.4 : 1.6;
    } else if (s.state === 'dead') {
      opacity = Math.max(0, 1 - s.deadT * 3.5);
      rise = 1 - s.deadT * 0.8;
      poolA = Math.max(0, 0.6 - s.deadT);
    } else poolA = 0;
    this.body.position.y = -2.0 * (1 - Math.max(0, rise)) + Math.sin(tt * 2.2) * 0.06 + 0.05;
    this.body.rotation.z = -lean;
    this.arms.forEach((a, i) => (a.rotation.z = armA + (i ? 0.25 : 0) + Math.sin(tt * 3 + i) * 0.08));
    this.hood.rotation.z = -lean * 0.4 + Math.sin(tt * 1.3) * 0.06;
    // opaque while alive (so they hide the fire behind them); transparent only while dissolving
    // the wind-up telegraph: the rim heats from ember red to white over the wind-up and flickers at the end, so the
    // moment to dodge reads from anywhere on screen
    const wind = s.state === 'windup' ? Math.min(1, s.stateT / S.windup) : 0;
    const hot = s.state === 'windup' ? wind * wind * (wind > 0.7 ? 0.8 + 0.2 * Math.sin(tt * 60) : 1) : s.state === 'strike' ? 0.8 : 0;
    for (const m of [this.mat, this.cowlMat, this.robeMat]) {
      setFade(m, opacity);
      setRimHot(m, hot);
    }
    // struck: the shade flares ember-red from inside, and recoils
    this.flash = Math.max(0, this.flash - dt * 6);
    const fl = this.flash * this.flash;
    this.mat.emissive.setRGB(2.4 * fl, 0.5 * fl, 0.15 * fl);
    this.robeMat.emissive.setRGB(1.6 * fl, 0.3 * fl, 0.1 * fl);
    this.cowlMat.emissive.setRGB(2.4 * fl, 0.5 * fl, 0.15 * fl);
    this.body.scale.x = 1 + fl * 0.12;
    this.body.visible = opacity > 0.01;
    this.pool.material.uniforms.uA.value = poolA;
    this.pool.material.uniforms.uT.value = tt;
    this.pool.visible = poolA > 0.01;
    const ps = 0.5 + 0.9 * Math.min(1, poolA);
    this.pool.scale.setScalar(ps);

    // robe hem billows; it trails behind when moving
    const pos = this.robe.geometry.attributes.position as THREE.BufferAttribute;
    const b = this.robeBase;
    for (let i = 0; i < pos.count; i++) {
      const y = b[i * 3 + 1];
      const f = Math.max(0, 1 - y / 1.74); // 1 at hem
      const x = b[i * 3];
      const z = b[i * 3 + 2];
      const ang = Math.atan2(z, x);
      const wave = Math.sin(tt * 4 + ang * 3 + y * 3) * 0.09 * f * f;
      pos.setXYZ(i, x * (1 + wave) - f * f * 0.25 * Math.abs(Math.sin(tt * 0.9)), y + wave * 0.5, z * (1 + wave));
    }
    pos.needsUpdate = true;

    // ember eyes brighten in the windup (the telegraph)
    const tel = (s.state === 'windup' ? 1 + 2.5 * (s.stateT / S.windup) : 1) * (s.big ? 1.8 : 1);
    this.eyeMat.color.setRGB(4.5 * tel, 0.8 * tel, 0.3);
    // the great shade smoulders with a red heart so it reads in the dark
    if (s.big && s.state !== 'dead' && Math.random() < dt * 40)
      embers.emit({ x: s.x + (Math.random() - 0.5) * 1.6, y: s.y + 0.5 + Math.random() * 2.6, z: s.z + (Math.random() - 0.5) * 1.6, vy: 0.6, spread: 0.3, life: 1.2, size: 0.12, sizeEnd: 0.02, r: 4, g: 0.5, b: 0.2, gravity: -0.5, wobble: 0.5 });
    this.eyeMat.opacity = opacity;

    if (s.state === 'dead') return;
    if (Math.random() < dt * 26 * big) {
      smoke.emit({
        x: s.x + (Math.random() - 0.5) * 0.7 * big, y: s.y + 0.1 + Math.random() * 0.9 * big, z: s.z + (Math.random() - 0.5) * 0.7 * big,
        vx: -Math.cos(s.yaw) * 0.5, vz: -Math.sin(s.yaw) * 0.5, vy: 0.35, spread: 0.2, life: 1.1, size: 0.8 * big, sizeEnd: 1.4 * big, r: 0.025, g: 0.015, b: 0.045, alpha: 0.75, drag: 1,
      });
    }
    if (s.light > 0.05 && Math.random() < s.light * dt * 50) {
      // burning in the light: edges smoulder and flake into embers
      embers.emit({
        x: s.x + (Math.random() - 0.5) * 0.8 * big, y: s.y + 0.3 + Math.random() * 1.6 * big, z: s.z + (Math.random() - 0.5) * 0.8 * big,
        vy: 1, spread: 0.5, life: 0.7, size: 0.09, sizeEnd: 0.02, r: 5, g: 1.5, b: 0.3, gravity: -1.2, wobble: 0.6,
      });
    }
    if (s.state === 'rise' && Math.random() < dt * 40) {
      smoke.emit({ x: s.x + (Math.random() - 0.5) * 1.4, y: s.y + 0.05, z: s.z + (Math.random() - 0.5) * 1.4, vy: 1.6, spread: 0.4, life: 0.9, size: 1.0, sizeEnd: 1.8, r: 0.02, g: 0.01, b: 0.04, alpha: 0.9, drag: 1 });
    }
  }
}

type AnyMesh = EnemyMesh | ShadeMesh;

const POOL_STOCK: [ShadeKind, number][] = [['shade', 10], ['crawler', 5], ['lantern', 4]];

export class ShadeViews {
  readonly group = new THREE.Group();
  private live = new Map<number, { kind: ShadeKind; v: AnyMesh }>();
  private pools: Record<ShadeKind, AnyMesh[]> = { shade: [], crawler: [], lantern: [] };

  private make(kind: ShadeKind): AnyMesh {
    return kind === 'crawler' ? new CrawlerMesh() : kind === 'lantern' ? new LanternMesh() : new ShadeMesh();
  }

  update(shades: readonly Shade[], dt: number, t: number, smoke: Particles, embers: Particles): void {
    const seen = new Set<number>();
    for (const s of shades) {
      seen.add(s.id);
      let e = this.live.get(s.id);
      if (!e) {
        const v = this.pools[s.kind].pop() ?? this.make(s.kind);
        v.turnYaw = undefined; // a pooled view snaps to its new shade's facing
        e = { kind: s.kind, v };
        this.group.add(v.root);
        this.live.set(s.id, e);
      }
      e.v.update(s, dt, t, smoke, embers);
    }
    for (const [id, e] of this.live) {
      if (seen.has(id)) continue;
      this.group.remove(e.v.root);
      this.live.delete(id);
      this.pools[e.kind].push(e.v);
    }
  }

  clear(): void {
    for (const e of this.live.values()) {
      this.group.remove(e.v.root);
      this.pools[e.kind].push(e.v);
    }
    this.live.clear();
  }

  /**
   * Show one of every kind for a moment so the renderer compiles their shaders now (behind the hour card), not when
   * the first crawler leaps out mid-fight. Call before renderer.compile; then `endPrewarm`.
   */
  prewarm(at: THREE.Vector3, smoke: Particles, embers: Particles): void {
    // stock the pools behind the card too: a view built mid-fight (its geometry, its materials) was a small stall
    // every time a wave outnumbered the pool
    for (const [kind, n] of POOL_STOCK) while (this.pools[kind].length < n) this.pools[kind].push(this.make(kind));
    for (const kind of ['shade', 'crawler', 'lantern'] as const) {
      for (const dying of [false, true]) {
        const v = this.pools[kind].pop() ?? this.make(kind);
        // a dissolving copy too: fading turns its materials transparent, which is a shader of its own
        const s: Shade = {
          id: -1, x: at.x, y: -4, z: at.z, vx: 0, vz: 0, hp: 1, maxHp: 1, speed: 0, yaw: 0, state: dying ? 'dead' : 'walk', stateT: 0, cd: 0,
          target: 'knight', light: 0, deadT: dying ? 0.1 : 0, big: false, kind, enraged: false,
          vy: 0, air: false, stun: CFG.shade.staggerTime, tell: 0, side: 0, sideT: 0,
        };
        v.update(s, 0, 0, smoke, embers); // inside every shadow volume, under the ground where no one sees it
        v.root.visible = true;
        this.group.add(v.root);
        this.warm.push({ kind, v });
      }
    }
  }
  private warm: { kind: ShadeKind; v: AnyMesh }[] = [];
  endPrewarm(): void {
    for (const { kind, v } of this.warm) {
      this.group.remove(v.root);
      this.pools[kind].push(v);
    }
    this.warm.length = 0;
  }

  hit(id: number): void {
    const e = this.live.get(id);
    if (e) e.v.flash = 1;
  }

  get count(): number {
    return this.live.size;
  }
}
