// Draws the World: lights that match the sim's light, the diorama camera, VFX for sim events.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { World, GameEvent } from '../sim/world';
import { CHAPTERS } from '../sim/chapters';
import { createPost, type Post } from './post';
import { buildEnv, type Env } from './env';
import { KnightView, ShadesView } from './actors';
import { FireFx } from './particles';

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

export interface CameraShot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

/** Expanding ring on the ground (flare shockwave, landing). */
class Rings {
  private list: { mesh: THREE.Mesh; t: number; life: number; r0: number; r1: number; mat: THREE.MeshBasicMaterial }[] = [];
  readonly group = new THREE.Group();
  constructor() {
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(4, 1.6, 0.4),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.06;
      mesh.visible = false;
      this.group.add(mesh);
      this.list.push({ mesh, t: 1, life: 1, r0: 1, r1: 1, mat });
    }
  }
  fire(x: number, z: number, r0: number, r1: number, life: number, color: THREE.Color): void {
    const r = this.list.find((q) => q.t >= q.life) ?? this.list[0];
    r.t = 0;
    r.life = life;
    r.r0 = r0;
    r.r1 = r1;
    r.mesh.position.x = x;
    r.mesh.position.z = z;
    r.mat.color.copy(color);
    r.mesh.visible = true;
  }
  update(dt: number): void {
    for (const r of this.list) {
      if (r.t >= r.life) {
        r.mesh.visible = false;
        continue;
      }
      r.t += dt;
      const p = Math.min(1, r.t / r.life);
      const e = 1 - Math.pow(1 - p, 3);
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(s, s, s);
      r.mat.opacity = (1 - p) * 0.9;
    }
  }
}

/** Sword arcs: a fan-shaped additive sheet that fades. */
class Slashes {
  private list: { mesh: THREE.Mesh; t: number; mat: THREE.ShaderMaterial }[] = [];
  readonly group = new THREE.Group();
  constructor() {
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uT: { value: 1 }, uArc: { value: 2.5 }, uColor: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vP; uniform float uT; uniform float uArc; uniform vec3 uColor;
          void main(){
            float r = length(vP);
            float a = atan(vP.y, vP.x);              // -arc/2 .. arc/2 around +x
            float u = clamp(a / uArc + 0.5, 0.0, 1.0); // 0 start .. 1 end of swing
            float head = smoothstep(uT - 0.55, uT, u) * step(u, uT);
            float edge = smoothstep(0.55, 0.95, (r - 0.9) / 2.0) * smoothstep(1.0, 0.92, (r - 0.9) / 2.0);
            float body = smoothstep(0.0, 0.9, (r - 0.9) / 2.0) * 0.35;
            float fade = 1.0 - smoothstep(1.0, 1.6, uT);
            float al = head * (edge + body) * fade;
            gl_FragColor = vec4(uColor * al, al);
          }`,
      });
      const geo = new THREE.RingGeometry(0.9, 2.95, 32, 1, -1.8, 3.6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.list.push({ mesh, t: 2, mat });
    }
  }
  fire(x: number, z: number, angle: number, step: number, arc: number, range: number, fiery: boolean): void {
    const s = this.list.find((q) => q.t >= 1.6) ?? this.list[0];
    s.t = 0;
    s.mesh.visible = true;
    s.mesh.position.set(x, step === 2 ? 0.7 : 1.15, z);
    // ring lies flat; its +x axis must point along the knight's facing
    s.mesh.rotation.set(-Math.PI / 2, 0, 0);
    s.mesh.rotateZ(angle - Math.PI / 2 + (step === 1 ? Math.PI : 0));
    if (step === 1) s.mesh.rotateX(Math.PI); // mirrored sweep direction
    const sc = range / 2.9;
    s.mesh.scale.set(sc, sc, sc);
    s.mat.uniforms.uArc.value = arc;
    const c = fiery ? new THREE.Color(5, 1.8, 0.45) : new THREE.Color(1.6, 1.5, 1.9);
    s.mat.uniforms.uColor.value.copy(c);
  }
  update(dt: number): void {
    for (const s of this.list) {
      if (s.t >= 1.6) {
        s.mesh.visible = false;
        continue;
      }
      s.t += dt * 9;
      s.mat.uniforms.uT.value = s.t;
    }
  }
}

export class View {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: Post;
  readonly env: Env;
  readonly knight = new KnightView();
  readonly shades = new ShadesView(64);
  readonly fx = new FireFx();
  readonly rings = new Rings();
  readonly slashes = new Slashes();
  readonly fireLight: THREE.PointLight;
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ridge: THREE.Mesh;
  private halo: THREE.Sprite;
  private fog: THREE.FogExp2;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camYaw: number = CONFIG.camera.yaw;
  private trauma = 0;
  private time = 0;
  shakeScale = 1;
  shot: CameraShot | null = null;
  shotBlend = 0;
  /** extra zoom for moments (0 = default) */
  zoom = 0;
  hearthLit = true;
  torchLit = false;
  hearthPower = 1; // visual multiplier for the hearth flame (cutscenes)
  dissolve = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(host: HTMLElement, world: World) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, 0.5, 900);
    this.post = createPost(host, this.scene, this.camera);
    this.fog = new THREE.FogExp2('#140f22', 0.011);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color('#050408');

    this.env = buildEnv(world.props);
    this.scene.add(this.env.group, this.env.sky);
    this.scene.add(this.knight.root, this.shades.group, this.fx.add.points, this.fx.smoke.points);
    this.scene.add(this.rings.group, this.slashes.group);

    this.fireLight = new THREE.PointLight('#ff8a3c', 300, 30, 1.7);
    this.fireLight.castShadow = true;
    this.fireLight.shadow.mapSize.set(CONFIG.render.shadowMap, CONFIG.render.shadowMap);
    this.fireLight.shadow.camera.near = 0.25;
    this.fireLight.shadow.camera.far = 48;
    this.fireLight.shadow.bias = -0.004;
    this.fireLight.shadow.normalBias = 0.03;
    this.scene.add(this.fireLight);

    this.sun = new THREE.DirectionalLight('#ffb27a', 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -48;
    sc.right = 48;
    sc.top = 48;
    sc.bottom = -48;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true; // allocate the map once, or every draw fails on a zero-size target
    this.scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight('#8a90c8', 0.16);
    this.moon.position.set(-20, 30, -40);
    this.scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight('#2a2440', '#08060a', 0.35);
    this.scene.add(this.hemi);

    // the eastern ridge whose shadow is the dawn line
    const D = CONFIG.dawn;
    this.ridge = new THREE.Mesh(
      new THREE.BoxGeometry(8, D.ridgeHeight, 400),
      new THREE.MeshStandardMaterial({ color: '#0c0a0e', roughness: 1 }),
    );
    const ang = Math.atan2(0.96, -0.28);
    this.ridge.position.set(0.96 * (D.ridgeDist + 4), D.ridgeHeight / 2, -0.28 * (D.ridgeDist + 4));
    this.ridge.rotation.y = ang - Math.PI / 2;
    this.ridge.castShadow = true;
    this.ridge.visible = false;
    this.scene.add(this.ridge);

    // a soft halo around the hearth flame
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(c);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        color: new THREE.Color(2.4, 0.9, 0.3),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      }),
    );
    this.halo.scale.set(5, 5, 5);
    this.scene.add(this.halo);

    const k = world.knight;
    this.camTarget.set(k.x * CONFIG.camera.follow, 0, k.z * CONFIG.camera.follow);
    this.camPos.copy(this.desiredCamPos(this.camTarget));
  }

  private desiredCamPos(target: THREE.Vector3): THREE.Vector3 {
    const C = CONFIG.camera;
    const dist = C.distance * (1 - this.zoom * 0.35);
    const p = C.pitch;
    return new THREE.Vector3(
      target.x + Math.sin(this.camYaw) * Math.cos(p) * dist,
      target.y + Math.sin(p) * dist,
      target.z + Math.cos(this.camYaw) * Math.cos(p) * dist,
    );
  }

  get yaw(): number {
    return this.camYaw;
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v * this.shakeScale);
  }

  /** Mouse position (NDC) to a point on the ground. */
  groundPoint(ndcX: number, ndcY: number, out: THREE.Vector3): boolean {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, out) !== null;
  }

  /** World point to screen pixels (for HUD labels). */
  toScreen(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.post.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight, behind: v.z > 1 };
  }

  onEvents(events: GameEvent[], world: World): void {
    const fiery = world.mode !== 'hearth';
    for (const e of events) {
      switch (e.type) {
        case 'swing': {
          const c = CONFIG.knight.combo[e.step];
          this.slashes.fire(e.x, e.z, e.angle, e.step, c.arc, c.range, fiery);
          break;
        }
        case 'hit':
          this.fx.burst(e.x, 1.0, e.z, e.heavy ? 22 : 10, e.heavy ? 9 : 6, fiery ? 1 : 0.6, e.heavy ? 0.16 : 0.11);
          this.fx.puff(e.x, 0.3, e.z, e.heavy ? 6 : 3, 0.6);
          this.addTrauma(e.heavy ? CONFIG.feel.shakeHeavy : CONFIG.feel.shakeHit);
          break;
        case 'immune':
          this.fx.puff(e.x, 1, e.z, 4, 1.2);
          break;
        case 'shadeDie': {
          const sc = CONFIG.kinds[e.kind].scale;
          this.fx.puff(e.x, 0.2, e.z, Math.round(10 * sc), sc, e.burned ? 1.2 : 0.5);
          if (e.kind === 'boss') {
            this.addTrauma(0.9);
            this.rings.fire(e.x, e.z, 1, 18, 1.6, new THREE.Color(3, 1.2, 0.4));
          }
          break;
        }
        case 'spawn': {
          const sc = CONFIG.kinds[e.kind].scale;
          this.fx.puff(e.x, -0.2, e.z, Math.round(5 * sc), sc * 0.8);
          break;
        }
        case 'knightHurt':
          this.addTrauma(CONFIG.feel.shakeHurt);
          this.fx.burst(e.x, 1.3, e.z, 10, 5, 0.4, 0.1);
          break;
        case 'knightDie':
          this.addTrauma(0.8);
          this.fx.puff(e.x, 0.5, e.z, 20, 1.4);
          break;
        case 'dash':
          this.fx.puff(e.x, 0.6, e.z, 5, 0.7);
          break;
        case 'flare':
          this.addTrauma(CONFIG.feel.shakeFlare);
          this.rings.fire(e.x, e.z, 1.5, world.fire.r, 0.7, new THREE.Color(4, 1.5, 0.35));
          this.fx.burst(e.x, world.mode === 'hearth' ? 1 : 2.4, e.z, 60, 12, 1.2, 0.18);
          break;
        case 'bossSummon':
          this.addTrauma(0.6);
          this.rings.fire(e.x, e.z, 1, 9, 1, new THREE.Color(0.6, 0.1, 0.9));
          break;
        default:
          break;
      }
    }
  }

  /** Sky, fog and ambient follow the chapter (sunset fades to night; dawn brightens). */
  private atmosphere(world: World): { sunGlow: number; stars: number } {
    const ch = world.chapter;
    const next = CHAPTERS[Math.min(CHAPTERS.length - 1, world.chIndex + 1)];
    const u = this.env.skyUniforms;
    let mix = 0;
    let target = ch.sky;
    let from = ch.sky;
    if (ch.sunset) {
      // sunset sky gives way to the night sky over the hour
      from = ch.sky;
      target = next.sky;
      mix = Math.min(1, world.t / 45);
    } else if (ch.mode === 'dawn') {
      from = CHAPTERS[4].sky;
      target = ch.sky;
      mix = world.dawnT < 0 ? Math.min(0.25, world.t / 80) : Math.min(1, 0.25 + world.dawnT / (CONFIG.dawn.sweepTime * 0.8));
    }
    u.uTop.value.copy(tmpA.set(from.top).lerp(tmpB.set(target.top), mix));
    u.uHorizon.value.copy(tmpA.set(from.horizon).lerp(tmpB.set(target.horizon), mix));
    this.fog.color.copy(tmpA.set(from.fog).lerp(tmpB.set(target.fog), mix));
    (this.scene.background as THREE.Color).copy(this.fog.color);
    u.uBottom.value.copy(this.fog.color);
    let sunGlow = 0;
    if (ch.sunset) sunGlow = Math.max(0, 1 - world.t / 40);
    if (ch.mode === 'dawn') sunGlow = world.dawnT < 0 ? 0.15 : Math.min(1.4, 0.2 + world.dawnT / 12);
    const stars = ch.sunset ? Math.min(1, world.t / 50) : ch.mode === 'dawn' ? Math.max(0, 1 - mix * 1.3) : 1;
    // ambient: dusk and dawn are brighter, the dead of night almost black
    const amb = ch.sunset ? 0.5 - 0.3 * mix : ch.mode === 'dawn' ? 0.2 + 0.7 * mix : 0.2 - ch.dim * 0.15;
    this.hemi.intensity = amb;
    this.hemi.color.copy(this.fog.color).multiplyScalar(2.2).lerp(tmpA.set('#3a3456'), 0.5);
    this.moon.intensity = ch.mode === 'dawn' ? 0.1 : 0.22;
    this.fog.density = ch.mode === 'torch' ? 0.014 : 0.011;
    return { sunGlow, stars };
  }

  update(world: World, dt: number, realDt: number): void {
    this.time += realDt;
    const k = world.knight;
    const torchMode = world.mode !== 'hearth' || this.torchLit;

    // --- fire light: the same light the sim solves
    const F = world.fire;
    const flick = 1 + Math.sin(this.time * 17.3) * 0.04 + Math.sin(this.time * 7.1) * 0.05 + (Math.random() - 0.5) * 0.06;
    const fk = world.flareK();
    let lightPos: THREE.Vector3;
    if (torchMode) {
      lightPos = new THREE.Vector3();
      this.knight.torchTip.getWorldPosition(lightPos);
      // the sim holds the light at F.h; keep the drawn light there so shadows agree with gameplay
      lightPos.set(F.x, F.h, F.z);
    } else {
      lightPos = new THREE.Vector3(F.x, F.h, F.z);
    }
    this.fireLight.position.copy(lightPos);
    const lit = torchMode ? this.torchLit || world.mode !== 'hearth' : this.hearthLit;
    const reach = F.r;
    this.fireLight.distance = reach * 1.18;
    // intensity scaled so the edge of the reach is still clearly lit
    const base = (torchMode ? 2.2 : 1.6) * Math.pow(reach, 1.7);
    this.fireLight.intensity = lit ? base * flick * (1 + fk * 1.2) * (torchMode ? 1 : this.hearthPower) : 0;
    this.fireLight.color.setRGB(1, 0.5 + fk * 0.15, 0.2 + fk * 0.1);

    // --- flame particles
    if (this.hearthLit && !torchMode) {
      const fuelPow = Math.min(1.4, (0.35 + (F.h - CONFIG.hearth.heightMin) / 2.5) * this.hearthPower + fk * 1.6);
      this.fx.flame(0, 0.45, 0, fuelPow, realDt, 0.7);
      this.halo.position.set(0, 1.2 + fuelPow * 0.6, 0);
      const hs = 4 + fuelPow * 3 + fk * 6;
      this.halo.scale.set(hs, hs, hs);
      this.halo.visible = true;
      this.env.coalMat.color.setRGB(3 * this.hearthPower + 0.3, 0.8 * this.hearthPower + 0.05, 0.15);
    } else {
      this.halo.visible = false;
      this.env.coalMat.color.setRGB(this.hearthLit ? 0.6 : 0.12, this.hearthLit ? 0.12 : 0.02, 0.01);
    }
    if (torchMode && lit) {
      const tip = new THREE.Vector3();
      this.knight.torchTip.getWorldPosition(tip);
      this.fx.flame(tip.x, tip.y - 0.05, tip.z, 0.35 + fk * 1.2, realDt, 0.12);
      // smoke off the gauntlet: story only
      if (Math.random() < realDt * 3) {
        this.fx.smoke.spawn({ x: tip.x, y: tip.y - 0.5, z: tip.z, vy: 0.6, life: 1.4, size: 0.3, sizeEnd: 0.9, r: 0.05, g: 0.045, b: 0.05, alpha: 0.4, curl: 1 });
      }
    }

    // embers flying home
    for (const e of world.embers) {
      if (!e.alive) continue;
      this.fx.add.spawn({
        x: e.x,
        y: e.y,
        z: e.z,
        life: e.memory ? 0.5 : 0.28,
        size: e.memory ? 0.55 : 0.28,
        sizeEnd: 0.02,
        r: e.memory ? 7 : 8,
        g: e.memory ? 5 : 2.6,
        b: e.memory ? 2.5 : 0.5,
        r2: 2,
        g2: 0.4,
        b2: 0.05,
      });
    }

    // burning shades smoke and spark
    for (const s of world.shades) {
      if (s.state === 'dead' || s.burn < 0.3) continue;
      if (Math.random() < realDt * 18 * s.burn) {
        const sc = CONFIG.kinds[s.kind].scale;
        this.fx.add.spawn({
          x: s.x + (Math.random() - 0.5) * 0.6 * sc,
          y: 0.3 + Math.random() * 1.2 * sc,
          z: s.z + (Math.random() - 0.5) * 0.6 * sc,
          vy: 1.5 + Math.random() * 2,
          life: 0.5,
          size: 0.16,
          sizeEnd: 0.03,
          r: 7,
          g: 2,
          b: 0.4,
          r2: 1,
          g2: 0.1,
          b2: 0,
          curl: 3,
        });
        this.fx.smoke.spawn({
          x: s.x,
          y: 0.8 * sc,
          z: s.z,
          vy: 1.2,
          life: 0.9,
          size: 0.5 * sc,
          sizeEnd: 1.4 * sc,
          r: 0.02,
          g: 0.015,
          b: 0.02,
          alpha: 0.6,
          curl: 2,
        });
      }
    }

    // --- sun (sunset and dawn)
    const S = world.sun;
    if (S.on) {
      const dist = 120;
      const dir = new THREE.Vector3(S.dx * Math.cos(S.elev), Math.sin(S.elev), S.dz * Math.cos(S.elev));
      this.sun.position.copy(dir.multiplyScalar(dist));
      this.sun.target.position.set(0, 0, 0);
      this.sun.target.updateMatrixWorld();
      const e = S.elev;
      this.sun.intensity = world.mode === 'dawn' ? 1.2 + e * 6 : Math.min(2.2, e * 20);
      this.sun.color.setRGB(1, 0.55 + e * 1.4, 0.32 + e * 1.2);
      this.sun.shadow.autoUpdate = true;
      this.ridge.visible = world.mode === 'dawn';
      this.env.skyUniforms.uSunDir.value.set(S.dx, Math.max(0.02, Math.sin(S.elev)), S.dz);
    } else {
      this.sun.intensity = 0;
      this.sun.shadow.autoUpdate = false;
      this.ridge.visible = false;
    }
    const atm = this.atmosphere(world);
    this.env.skyUniforms.uSunGlow.value = atm.sunGlow;
    this.env.skyUniforms.uStars.value = atm.stars;
    this.env.skyUniforms.uTime.value = this.time;

    // --- actors
    this.knight.setDissolve(this.dissolve);
    this.knight.update(k, realDt, torchMode && lit && world.mode !== 'hearth' ? true : this.torchLit);
    this.shades.update(world.shades, this.time);

    // --- camera
    const C = CONFIG.camera;
    const want = new THREE.Vector3();
    if (world.mode === 'hearth') want.set(k.x * C.follow, 0, k.z * C.follow);
    else want.set(k.x * 0.85, 0, k.z * 0.85);
    this.camTarget.lerp(want, 1 - Math.exp(-realDt * C.lerp));
    this.camYaw = C.yaw + Math.sin(this.time * 0.05) * 0.05;
    let pos = this.desiredCamPos(this.camTarget);
    let tgt = this.camTarget.clone();
    if (this.shot) {
      pos = pos.lerp(this.shot.pos, this.shotBlend);
      tgt = tgt.lerp(this.shot.target, this.shotBlend);
    }
    this.camPos.lerp(pos, 1 - Math.exp(-realDt * 6));
    // shake: trauma^2, decays
    this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = (f: number, o: number) => Math.sin(this.time * f + o) * 0.6 + Math.sin(this.time * f * 2.3 + o * 3) * 0.4;
    this.camera.position.set(this.camPos.x + n(37, 1) * sh * 0.8, this.camPos.y + n(41, 2) * sh * 0.6, this.camPos.z + n(43, 3) * sh * 0.8);
    this.camera.lookAt(tgt);
    this.camera.rotateZ(n(29, 4) * sh * 0.03);
    const fov = this.shot?.fov ?? C.fov;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, realDt * 4);
      this.camera.updateProjectionMatrix();
    }

    // tilt-shift band follows the knight on screen
    const ks = this.toScreen(k.x, 1, k.z);
    const el = this.post.renderer.domElement;
    const off = 0.5 - ks.y / Math.max(1, el.clientHeight);
    this.post.tilt.offset += (Math.max(-0.3, Math.min(0.3, off)) - this.post.tilt.offset) * Math.min(1, realDt * 3);

    this.fx.add.setScale(el.clientHeight * this.post.renderer.getPixelRatio(), this.camera.fov);
    this.fx.smoke.setScale(el.clientHeight * this.post.renderer.getPixelRatio(), this.camera.fov);
    this.fx.update(realDt, this.time);
    this.rings.update(realDt);
    this.slashes.update(realDt);
    void dt;
  }

  render(): void {
    this.post.composer.render();
  }
}
