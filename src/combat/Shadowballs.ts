import * as THREE from 'three';
import { WEAPON } from '../config';
import { NOISE_GLSL } from '../player/ShadowMaterial';
import { ShadowWisps } from '../fx/ShadowWisps';
import type { TrainingDummies, Dummy } from '../world/TrainingDummies';

const lerp = THREE.MathUtils.lerp;

/** Hard void sphere + hot violet corona — reads as a projectile, not body ash. */
function orbMaterial(mode: 'core' | 'corona'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCore: { value: new THREE.Color(WEAPON.coreColor) },
      uFlame: { value: new THREE.Color(WEAPON.flameColor) },
      uLip: { value: new THREE.Color(WEAPON.lipColor) },
      uSeed: { value: Math.random() * 40 },
    },
    transparent: true,
    depthWrite: mode === 'core',
    blending: mode === 'corona' ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: mode === 'corona' ? THREE.BackSide : THREE.FrontSide,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vWorld;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uFlame;
      uniform vec3 uLip;
      uniform float uSeed;
      varying vec3 vN;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = 1.0 - abs(dot(normalize(vN), v));
        float flick = sh_noise(vWorld * 7.0 + vec3(uSeed, -uTime * 5.0, uTime));
        ${
          mode === 'core'
            ? `// Solid void ball with a cracked violet seam — not soft smoke.
        float crack = step(0.62, fres * (0.7 + 0.5 * flick));
        vec3 col = mix(uCore, uFlame, pow(fres, 1.4) * (0.35 + 0.4 * flick));
        col = mix(col, uLip, crack * 0.55);
        gl_FragColor = vec4(col, 0.95);`
            : `// Additive corona shell — hot, hard-edged energy.
        float a = pow(fres, 1.2) * smoothstep(0.15, 0.95, fres + flick * 0.35);
        gl_FragColor = vec4(mix(uFlame, uLip, flick) * a * 1.8, a);`
        }
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Projectile look: hard void core + bright corona (separate from body wisps). */
class BallVisual {
  readonly group = new THREE.Group();
  private readonly coreMat = orbMaterial('core');
  private readonly coronaMat = orbMaterial('corona');

  constructor(geo: THREE.BufferGeometry) {
    const core = new THREE.Mesh(geo, this.coreMat);
    const corona = new THREE.Mesh(geo, this.coronaMat);
    corona.scale.setScalar(1.35);
    corona.renderOrder = 4;
    this.group.add(core, corona);
  }

  set(time: number, radius: number, _dir: THREE.Vector3, _tail: number): void {
    this.group.scale.setScalar(radius);
    this.coreMat.uniforms.uTime.value = time;
    this.coronaMat.uniforms.uTime.value = time;
  }
}

/** What a thrown ball does; `power` 0 (single) .. 1 (dual) scales the visuals and effects. */
export interface BallSpec {
  radius: number;
  /** Size it leaves the hand at (it swells to `radius` within a few metres). */
  startRadius: number;
  damage: number;
  splash: number;
  gravity: number;
  power: number;
}

interface Ball extends BallSpec {
  visual: BallVisual;
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  light: THREE.PointLight | null;
}

interface Burst {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  size: number;
}

interface Decal {
  mesh: THREE.Mesh;
  age: number;
}

export interface ImpactEvent {
  point: THREE.Vector3;
  power: number;
  dummy: Dummy | null;
  damage: number;
  splash: Array<{ dummy: Dummy; amount: number }>;
}

/**
 * Pooled shadowball projectiles: flight with slight gravity, swept hits against the world boxes
 * and the dummies, particle-essence visuals, smoke trails, impact bursts and scorch decals.
 */
export class Shadowballs {
  /** Orbs held in the palms (left, right, dual); positioned by SpellHands. */
  private readonly orbs: BallVisual[] = [];
  onImpact: ((e: ImpactEvent) => void) | null = null;
  /** Counters for the playtest. */
  readonly stats = { thrown: 0, impacts: 0, dummyHits: 0, decals: 0 };

  private readonly balls: Ball[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly bursts: Burst[] = [];
  private readonly decals: Decal[] = [];
  private nextDecal = 0;
  private readonly smoke: ShadowWisps;
  private time = 0;
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly zero = new THREE.Vector3();
  private readonly tmpBox = new THREE.Box3();

  constructor(
    scene: THREE.Scene,
    /** World boxes the balls hit (dummies are tested separately, by capsule). */
    private readonly colliders: THREE.Box3[],
    private readonly dummies: TrainingDummies,
  ) {
    const geo = new THREE.IcosahedronGeometry(1, 4);
    for (let i = 0; i < 3; i++) {
      const orb = new BallVisual(geo);
      orb.group.visible = false;
      scene.add(orb.group);
      this.orbs.push(orb);
    }

    for (let i = 0; i < WEAPON.poolSize; i++) {
      const visual = new BallVisual(geo);
      visual.group.visible = false;
      scene.add(visual.group);
      this.balls.push({
        visual,
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        light: null,
        radius: 0,
        startRadius: 0,
        damage: 0,
        splash: 0,
        gravity: 0,
        power: 0,
      });
    }
    for (let i = 0; i < WEAPON.lightCount; i++) {
      // Always "visible" at zero intensity: toggling lights changes the scene's light count,
      // which recompiles every lit shader (a visible hitch on the first throw).
      const light = new THREE.PointLight(WEAPON.lightColor, 0, 6, 1.6);
      scene.add(light);
      this.lights.push(light);
    }
    const burstMat = (): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color: 0x06070c, transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), burstMat());
      mesh.visible = false;
      scene.add(mesh);
      this.bursts.push({ mesh, age: 1, life: 1, size: 1 });
    }
    const decalMat = new THREE.MeshBasicMaterial({
      map: this.makeScorchTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < WEAPON.decalCount; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat.clone());
      mesh.visible = false;
      scene.add(mesh);
      this.decals.push({ mesh, age: Infinity });
    }
    // Trail palette is weapon energy, not body ash — keeps balls separable.
    this.smoke = new ShadowWisps(scene, {
      count: 1000,
      smokeColor: WEAPON.trailSmoke,
      emberColor: WEAPON.lipColor,
      emberChance: 0.22,
    });
  }

  /** Compiles every combat shader up front so the first throw doesn't hitch. */
  warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const objs = [...this.orbs.map((o) => o.group), ...this.balls.map((b) => b.visual.group), ...this.bursts.map((b) => b.mesh), ...this.decals.map((d) => d.mesh)];
    for (const o of objs) o.visible = true;
    renderer.compile(scene, camera);
    for (const o of objs) o.visible = false;
  }

  get active(): number {
    return this.balls.filter((b) => b.alive).length;
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.smoke.setViewport(heightPx, fovDeg);
  }

  /**
   * Drives a palm orb (0 left, 1 right, 2 dual); `pos` null hides it.
   * @param heat 0 idle smoulder .. 1 fully charged (more smoke)
   */
  setOrb(index: number, pos: THREE.Vector3 | null, radius: number, heat: number, velocity: THREE.Vector3): void {
    const orb = this.orbs[index];
    orb.group.visible = pos !== null;
    if (!pos) return;
    orb.group.position.copy(pos);
    orb.set(this.time, radius, this.dir.set(0, 1, 0), 0.6);
    // Charging sparks — bright trail embers, not body ash.
    const n = Math.max(1, Math.round(1 + heat * 3));
    this.smoke.emitAt(pos, velocity, n, {
      inherit: 0.7,
      spread: radius * (0.45 + heat * 0.35),
      scale: 0.35 + heat * 0.45,
      life: 0.4 + heat * 0.2,
    });
  }

  /** A small puff where a spell fizzled out. */
  fizzle(pos: THREE.Vector3, velocity: THREE.Vector3): void {
    this.smoke.emitAt(pos, velocity, 10, { inherit: 0.6, spread: 0.05, burst: 0.8, scale: 0.4, life: 0.5 });
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, spec: BallSpec): void {
    const ball = this.balls.find((b) => !b.alive) ?? this.balls.reduce((a, b) => (a.age > b.age ? a : b));
    if (ball.alive) this.kill(ball);
    ball.alive = true;
    ball.pos.copy(pos);
    ball.vel.copy(vel);
    Object.assign(ball, spec);
    ball.age = 0;
    ball.visual.group.visible = true;
    ball.visual.group.position.copy(pos);
    ball.light = this.lights.find((l) => !this.balls.some((b) => b.alive && b !== ball && b.light === l)) ?? null;
    this.stats.thrown++;
    this.smoke.emitAt(pos, vel, 10 + Math.round(14 * spec.power), { inherit: 0.15, spread: ball.radius, burst: 1.2, scale: 0.7 });
  }

  update(dt: number): void {
    this.time += dt;
    for (const ball of this.balls) if (ball.alive) this.stepBall(ball, dt);
    this.updateBursts(dt);
    this.updateDecals(dt);
    this.smoke.update(dt, [], this.zero, 0);
  }

  private stepBall(ball: Ball, dt: number): void {
    ball.age += dt;
    ball.vel.y -= ball.gravity * dt;
    this.step.copy(ball.vel).multiplyScalar(dt);
    this.p1.copy(ball.pos).add(this.step);

    // Dummies first (capsule), then the world boxes; keep whichever is hit first.
    const dHit = this.dummies.hitTest(ball.pos, this.p1, ball.radius);
    const len = this.step.length();
    let wallT = Infinity;
    if (len > 1e-6) {
      this.dir.copy(this.step).divideScalar(len);
      this.ray.set(ball.pos, this.dir);
      for (const box of this.colliders) {
        if (box.containsPoint(ball.pos)) {
          wallT = 0;
          break;
        }
        if (this.ray.intersectBox(box, this.hit)) {
          const d = this.hit.distanceTo(ball.pos);
          if (d <= len) wallT = Math.min(wallT, d / len);
        }
      }
    }
    if (dHit && dHit.t <= wallT) {
      this.impact(ball, dHit.point, null, dHit.dummy);
      return;
    }
    if (wallT <= 1) {
      this.hit.copy(ball.pos).addScaledVector(this.step, wallT);
      this.impact(ball, this.hit, this.surfaceNormal(this.hit), null);
      return;
    }
    if (ball.age > WEAPON.lifetime) {
      this.kill(ball);
      return;
    }

    ball.pos.copy(this.p1);
    const speed = ball.vel.length();
    ball.visual.group.position.copy(ball.pos);
    // Leaves the hand at palm size and swells to full size within a few metres.
    const grow = THREE.MathUtils.smoothstep(ball.age, 0, 0.08);
    const shown = lerp(ball.startRadius, ball.radius, grow);
    ball.visual.set(this.time, shown, this.dir.copy(ball.vel).divideScalar(Math.max(speed, 1e-4)), Math.min(1.4, speed / 25));
    if (ball.light) {
      ball.light.position.copy(ball.pos);
      ball.light.intensity = 3 + 6 * ball.power;
    }
    // Magenta energy trail behind the hard orb (lighter than body smoke).
    this.smoke.emitAt(ball.pos, ball.vel, Math.max(1, Math.round(dt * (90 + 110 * ball.power))), {
      inherit: 0.05,
      spread: ball.radius * 0.55,
      scale: 0.35 + ball.power * 0.5,
      life: 0.55,
    });
  }

  private impact(ball: Ball, point: THREE.Vector3, normal: THREE.Vector3 | null, dummy: Dummy | null): void {
    const charge = ball.power;
    const damage = Math.round(ball.damage);
    const splashR = ball.splash;
    this.dir.copy(ball.vel).normalize();
    if (dummy) {
      this.dummies.damage(dummy, damage, this.dir, charge);
      this.stats.dummyHits++;
    }
    const splash = this.dummies.splash(point, splashR, damage, dummy);
    this.stats.dummyHits += splash.length;

    // Burst: ink shockwave + ash cloud with cool violet motes.
    const burst = this.bursts.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    burst.mesh.position.copy(point);
    burst.age = 0;
    burst.life = 0.22 + 0.2 * charge;
    burst.size = Math.max(0.5, splashR) * (0.8 + 0.4 * charge);
    burst.mesh.visible = true;
    this.smoke.emitAt(point, this.zero, 32 + Math.round(60 * charge), {
      inherit: 0,
      spread: 0.12 + 0.35 * charge,
      burst: 2.2 + 3.8 * charge,
      scale: 0.85 + charge,
    });
    if (normal) this.placeDecal(point, normal, 0.5 + 1.1 * charge);

    this.stats.impacts++;
    this.onImpact?.({ point: point.clone(), power: charge, dummy, damage: dummy ? damage : 0, splash });
    this.kill(ball);
  }

  private kill(ball: Ball): void {
    ball.alive = false;
    ball.visual.group.visible = false;
    if (ball.light) {
      ball.light.intensity = 0;
      ball.light = null;
    }
  }

  private updateBursts(dt: number): void {
    for (const b of this.bursts) {
      if (!b.mesh.visible) continue;
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) {
        b.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      b.mesh.scale.setScalar(0.15 + b.size * e);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }
  }

  private placeDecal(point: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    const d = this.decals[this.nextDecal];
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.mesh.position.copy(point).addScaledVector(normal, 0.01);
    d.mesh.lookAt(this.hit.copy(d.mesh.position).add(normal));
    d.mesh.rotateZ(Math.random() * Math.PI * 2);
    d.mesh.scale.setScalar(size);
    d.mesh.visible = true;
    d.age = 0;
    this.stats.decals++;
  }

  private updateDecals(dt: number): void {
    for (const d of this.decals) {
      if (!d.mesh.visible) continue;
      d.age += dt;
      const fade = THREE.MathUtils.clamp((WEAPON.decalLife - d.age) / 2, 0, 1);
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      if (fade <= 0) d.mesh.visible = false;
    }
  }

  /** Normal of the box face the point lies on (closest face of the box that contains it). */
  private surfaceNormal(p: THREE.Vector3): THREE.Vector3 {
    let best = Infinity;
    const n = new THREE.Vector3(0, 1, 0);
    for (const box of this.colliders) {
      if (!this.tmpBox.copy(box).expandByScalar(0.02).containsPoint(p)) continue;
      const faces: Array<[number, THREE.Vector3]> = [
        [Math.abs(p.x - box.min.x), new THREE.Vector3(-1, 0, 0)],
        [Math.abs(p.x - box.max.x), new THREE.Vector3(1, 0, 0)],
        [Math.abs(p.y - box.min.y), new THREE.Vector3(0, -1, 0)],
        [Math.abs(p.y - box.max.y), new THREE.Vector3(0, 1, 0)],
        [Math.abs(p.z - box.min.z), new THREE.Vector3(0, 0, -1)],
        [Math.abs(p.z - box.max.z), new THREE.Vector3(0, 0, 1)],
      ];
      for (const [dist, normal] of faces) {
        if (dist < best) {
          best = dist;
          n.copy(normal);
        }
      }
    }
    return n;
  }

  /** Jagged ink splat with cool ash edges. */
  private makeScorchTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d')!;
    const cx = size / 2;
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = size * (0.3 + 0.16 * Math.random());
      c.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    }
    const grad = c.createRadialGradient(cx, cx, 0, cx, cx, size * 0.46);
    grad.addColorStop(0, 'rgba(2,2,4,0.95)');
    grad.addColorStop(0.55, 'rgba(8,8,14,0.88)');
    grad.addColorStop(0.82, 'rgba(40,36,70,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
