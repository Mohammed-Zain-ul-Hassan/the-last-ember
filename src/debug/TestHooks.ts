import * as THREE from 'three';
import type { PlayerController } from '../player/PlayerController';
import type { CharacterRig } from '../player/CharacterRig';
import type { RecallSystem } from '../player/RecallSystem';
import type { Arena } from '../world/Arena';
import type { SoundSynth } from '../fx/SoundSynth';
import type { SpellHands } from '../combat/SpellHands';
import type { FormController } from '../player/FormController';
import type { Shadowballs } from '../combat/Shadowballs';
import type { Enemies } from '../combat/Enemies';
import type { DamageNumbers } from '../ui/DamageNumbers';
import { OrbitCamera } from '../player/OrbitCamera';

/** True when the page was opened with `?autotest`: scripted input, no pointer lock needed. */
export const AUTOTEST = new URLSearchParams(window.location.search).has('autotest');

export interface FrameMetrics {
  /** Visible body vertices in the view frustum closer to the eye than 0.1 m / 0.2 m. */
  near10: number;
  near20: number;
  /** Of those within 0.2 m, how many are mostly visible (less than half dissolved by the shader). */
  camClip: number;
  /** Hand bones inside a collider box. */
  handInWall: number;
  speed: number;
  height: number;
  state: string;
  feet: [number, number, number];
  fps: number;
  /** Master-bus RMS level now (worst = loudest frame), and cumulative sound events. */
  audioRms: number;
  footsteps: number;
  lands: number;
  slides: number;
  /** Shadowballs in flight, totals, and each dummy's health. */
  ballsActive: number;
  thrown: number;
  impacts: number;
  dummyHits: number;
  decals: number;
  damageShown: number;
  dummyHealth: number[];
  charge: number;
  form: string;
  transitioning: boolean;
  magicka: number;
  stamina: number;
  casts: number;
  dualCasts: number;
  spellFizzles: number;
  refused: number;
  profile: string;
  /** Wraith glide sound level. */
  drift: number;
}

interface Deps {
  player: PlayerController;
  character: CharacterRig;
  recall: RecallSystem;
  arena: Arena;
  camera: THREE.PerspectiveCamera;
  sound: SoundSynth;
  music?: { start: () => void };
  spells: SpellHands;
  forms: FormController;
  balls: Shadowballs;
  dummies: Enemies;
  damageNumbers: DamageNumbers;
  orbit: OrbitCamera;
}

/**
 * Exposes `window.__game` for the Playwright playtest. Holds the keys the script presses
 * and samples clipping metrics every frame, so the script can read the worst case.
 */
export class TestHooks {
  private readonly v = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly vertexCache = new WeakMap<THREE.BufferGeometry, Uint32Array>();
  private worst: FrameMetrics | null = null;
  private frames = 0;
  private fpsT0 = performance.now();
  private fps = 0;
  private audioBuf: Float32Array<ArrayBuffer> | null = null;
  private peak = 0;
  private maxY = -Infinity;
  private viewCam: THREE.Camera | null = null;

  constructor(private readonly d: Deps) {
    // Needs Chrome's --autoplay-policy=no-user-gesture-required; harmless without it.
    d.sound.unlock();
    d.music?.start();
    (window as unknown as { __game: unknown }).__game = {
      ...d,
      setKeys: (codes: string[]) => d.player.setTestKeys(codes),
      tap: (code: string) => d.player.tapTestKey(code),
      look: (yaw: number, pitch: number) => {
        d.player.yaw = yaw;
        d.player.pitch = pitch;
      },
      teleport: (x: number, y: number, z: number, yaw: number, pitch = 0) =>
        d.player.teleport(new THREE.Vector3(x, y, z), yaw, pitch),
      metrics: () => this.sample(),
      /** Instantly presents a form (no transition), as the swap point would. */
      setForm: (f: 'runner' | 'shadow') => {
        if (d.forms.form === f) return;
        d.forms.form = f;
        d.forms.onSwap?.(f);
      },
      refill: () => {
        d.spells.magicka = 100;
        d.player.stamina = 100;
      },
      drain: (m: number) => {
        d.spells.magicka = m;
      },
      /** Highest feet height since the last call (jump peaks), then resets. */
      takeMaxY: () => {
        const y = this.maxY;
        this.maxY = -Infinity;
        return y;
      },
      resetDummies: () => {
        for (const x of d.dummies.dummies) {
          x.health = 100;
          x.downTimer = 0;
        }
      },
      /**
       * Orbit camera (dist m, yaw deg relative to the body's facing — 180 = directly behind,
       * 150 ≈ over the shoulder — and camera height m above the feet) or null for FP.
       * The orbit stays locked to the body until `orbitLook` frees it.
       */
      view: (dist: number | null, yawDeg = 150, height = 1.2) => {
        d.orbit.setDebugView(dist);
        d.player.setCameraMode(d.orbit.mode);
        if (dist !== null) {
          d.player.orbitLook(d.player.yaw, OrbitCamera.pitchForHeight(dist, height));
          d.player.orbitLock = THREE.MathUtils.degToRad(yawDeg) - Math.PI;
        }
        d.character.setCameraMode(d.orbit.mode);
      },
      setCameraMode: (mode: 'fp' | 'tp') => {
        d.orbit.setMode(mode);
        d.player.setCameraMode(mode);
        d.character.setCameraMode(mode);
      },
      /** Free TP orbit angles (rad; positive pitch looks up); unlocks a `view()` orbit. */
      orbitLook: (yaw: number, pitch: number) => d.player.orbitLook(yaw, pitch),
      /** Loudest master-bus RMS since the last call, then resets. */
      takePeak: () => {
        const p = this.peak;
        this.peak = 0;
        return p;
      },
      /** Worst metrics since the last call, then resets. */
      takeWorst: () => {
        const w = this.worst;
        this.worst = null;
        return w;
      },
    };
  }

  /** Called once per frame after rendering. */
  update(viewCam?: THREE.Camera): void {
    this.viewCam = viewCam ?? this.d.camera;
    this.frames++;
    const now = performance.now();
    if (now - this.fpsT0 >= 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsT0);
      this.frames = 0;
      this.fpsT0 = now;
    }
    const m = this.sample();
    this.peak = Math.max(this.peak, m.audioRms);
    this.maxY = Math.max(this.maxY, m.feet[1]);
    const w = this.worst;
    if (!w) {
      this.worst = m;
      return;
    }
    w.near10 = Math.max(w.near10, m.near10);
    w.near20 = Math.max(w.near20, m.near20);
    w.camClip = Math.max(w.camClip, m.camClip);
    w.handInWall = Math.max(w.handInWall, m.handInWall);
    w.fps = Math.min(w.fps || m.fps, m.fps || w.fps);
    w.audioRms = Math.max(w.audioRms, m.audioRms);
    w.footsteps = m.footsteps;
    w.lands = m.lands;
    w.slides = m.slides;
  }

  /** Every other vertex still referenced by the visible (trimmed) index. */
  private usedVertices(geo: THREE.BufferGeometry): Uint32Array {
    let list = this.vertexCache.get(geo);
    if (!list) {
      const index = geo.getIndex();
      const count = geo.getAttribute('position').count;
      const used = new Uint8Array(count);
      if (index) for (let i = 0; i < index.count; i++) used[index.getX(i)] = 1;
      else used.fill(1);
      const out: number[] = [];
      for (let i = 0; i < count; i += 2) if (used[i]) out.push(i);
      list = new Uint32Array(out);
      this.vertexCache.set(geo, list);
    }
    return list;
  }

  private sample(): FrameMetrics {
    const { player, character, arena, camera } = this.d;
    const cam = this.viewCam ?? camera;
    cam.updateMatrixWorld();
    this.pv.multiplyMatrices(
      (cam as THREE.PerspectiveCamera).projectionMatrix,
      cam.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.pv);
    const eye = cam.position;
    const fade = character.nearFadeRadius;

    let near10 = 0;
    let near20 = 0;
    let camClip = 0;
    for (const mesh of character.visibleMeshes) {
      for (const i of this.usedVertices(mesh.geometry)) {
        mesh.getVertexPosition(i, this.v);
        this.v.applyMatrix4(mesh.matrixWorld);
        const dist = this.v.distanceTo(eye);
        if (dist > 0.2 || !this.frustum.containsPoint(this.v)) continue;
        near20++;
        if (dist < 0.1) near10++;
        if (dist > fade) camClip++;
      }
    }

    let handInWall = 0;
    for (const hand of character.handBones) {
      hand.getWorldPosition(this.v);
      if (arena.colliders.some((b) => b.containsPoint(this.v))) handInWall++;
    }

    return {
      near10,
      near20,
      camClip,
      handInWall,
      speed: player.speed,
      height: player.height,
      state: player.state,
      feet: [player.feet.x, player.feet.y, player.feet.z],
      fps: this.fps,
      audioRms: this.audioLevel(),
      ...this.d.sound.stats,
      ballsActive: this.d.balls.active,
      ...this.d.balls.stats,
      damageShown: this.d.damageNumbers.shown,
      dummyHealth: this.d.dummies.dummies.map((x) => x.health),
      charge: this.d.spells.charge,
      form: this.d.forms.form,
      transitioning: this.d.forms.transitioning,
      magicka: this.d.spells.magicka,
      stamina: this.d.player.stamina,
      casts: this.d.spells.stats.casts,
      dualCasts: this.d.spells.stats.dualCasts,
      spellFizzles: this.d.spells.stats.fizzles,
      refused: this.d.spells.stats.refused,
      profile: this.d.player.profile,
      drift: this.d.sound.driftLevel,
    };
  }

  private audioLevel(): number {
    const meter = this.d.sound.meter();
    if (!meter) return -1;
    if (!this.audioBuf || this.audioBuf.length !== meter.fftSize) this.audioBuf = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(this.audioBuf);
    let sum = 0;
    for (const v of this.audioBuf) sum += v * v;
    return Math.sqrt(sum / this.audioBuf.length);
  }
}
