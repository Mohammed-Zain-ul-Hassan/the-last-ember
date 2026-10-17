import * as THREE from 'three';
import { SPELL, WEAPON } from '../config';
import type { BallSpec, Shadowballs } from './Shadowballs';
import type { TrainingDummies } from '../world/TrainingDummies';
import type { SoundSynth } from '../fx/SoundSynth';

export type HandState = 'idle' | 'charging' | 'ready' | 'release';

export interface HandPose {
  state: HandState;
  /** Seconds in the current state. */
  t: number;
  /** 0..1 while charging, 1 when ready. */
  charge: number;
}

export interface SpellPose {
  /** [left, right] */
  hands: [HandPose, HandPose];
  /** Both hands are charging one dual-cast between them. */
  dual: boolean;
  /** Sprinting lowers the arms; no casting. */
  lowered: boolean;
}

/** 0 = left hand (LMB), 1 = right hand (RMB). */
export type HandIndex = 0 | 1;

/**
 * Skyrim-style casting with a shadowball in each hand: hold a hand's button to charge, release
 * once charged to cast (releasing early fizzles). Pressing both hands together merges them into
 * a dual-cast. Casting spends magicka, which regenerates after a short pause.
 */
export class SpellHands {
  /** Only the shadow form casts; when false the hands are idle and the orbs hidden. */
  enabled = false;
  magicka: number = SPELL.magickaMax;
  readonly pose: SpellPose = {
    hands: [
      { state: 'idle', t: 0, charge: 0 },
      { state: 'idle', t: 0, charge: 0 },
    ],
    dual: false,
    lowered: false,
  };
  /** Counters for the playtest. */
  readonly stats = { casts: 0, dualCasts: 0, fizzles: 0, refused: 0 };
  /** Fires when a cast was refused for lack of magicka (HUD flash). */
  onRefused: (() => void) | null = null;
  /** Fires once per ball actually thrown; a dual-cast fires once with dual = true. */
  onCast: ((dual: boolean) => void) | null = null;

  private readonly pressed = [false, false];
  private pending: HandIndex | 'dual' | null = null;
  private regenWait = 0;
  private humming = false;
  private readonly ring: HTMLElement | null = document.getElementById('crosshair');
  private readonly palms = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly mid = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly far = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();

  constructor(
    private readonly balls: Shadowballs,
    private readonly colliders: THREE.Box3[],
    private readonly dummies: TrainingDummies,
    private readonly sound: SoundSynth,
  ) {}

  /** Strongest charge on either hand (crosshair ring). */
  get charge(): number {
    const [l, r] = this.pose.hands;
    return Math.max(this.isCharging(l) ? l.charge : 0, this.isCharging(r) ? r.charge : 0);
  }

  press(i: HandIndex): void {
    this.pressed[i] = true;
    if (!this.enabled || this.pose.lowered) return;
    const hand = this.pose.hands[i];
    const other = this.pose.hands[1 - i];
    // A hand still punching forward can't start a new charge yet.
    if (hand.state === 'charging' || hand.state === 'ready') return;
    if (hand.state === 'release' && hand.t < SPELL.releaseTime) return;

    // Second hand pressed right after the first: merge into a dual-cast.
    if (other.state === 'charging' && other.t <= SPELL.dualWindow && !this.pose.dual) {
      if (this.magicka >= SPELL.cost * SPELL.dualCostMul) {
        this.pose.dual = true;
        this.setState(hand, 'charging', other.t);
        return;
      }
    }
    if (this.magicka < SPELL.cost + this.committed()) {
      this.stats.refused++;
      this.sound.noMagicka();
      this.onRefused?.();
      return;
    }
    this.setState(hand, 'charging', 0);
  }

  release(i: HandIndex): void {
    this.pressed[i] = false;
    const hand = this.pose.hands[i];
    if (this.pose.dual && (hand.state === 'charging' || hand.state === 'ready')) {
      if (hand.state === 'ready') this.pending = 'dual';
      else this.fizzleHands([0, 1]);
      return;
    }
    if (hand.state === 'ready') this.pending = i;
    else if (hand.state === 'charging') this.fizzleHands([i]);
  }

  /** Form switch, Recall, pause: drop every spell without casting. */
  cancel(): void {
    for (const hand of this.pose.hands) this.setState(hand, 'idle', 0);
    this.pose.dual = false;
    this.pending = null;
    this.stopHum();
  }

  /** Before the rig poses. */
  update(dt: number, sprinting: boolean): void {
    this.pose.lowered = this.enabled && sprinting;
    if (this.pose.lowered && this.pose.hands.some((h) => this.isCharging(h))) {
      this.fizzleHands([0, 1]);
    }
    for (const hand of this.pose.hands) {
      hand.t += dt;
      if (hand.state === 'charging') {
        hand.charge = Math.min(hand.t / SPELL.chargeTime, 1);
        if (hand.charge >= 1) this.setState(hand, 'ready', 0, 1);
      } else if (hand.state === 'release' && hand.t > SPELL.releaseTime + SPELL.recoverTime) {
        this.setState(hand, 'idle', 0);
      }
    }

    const charging = this.pose.hands.some((h) => this.isCharging(h));
    if (charging && !this.humming) {
      this.sound.startCharge();
      this.humming = true;
    } else if (!charging) this.stopHum();
    if (this.humming) this.sound.setCharge(this.charge * (this.pose.dual ? 1 : 0.7));

    if (charging || this.pending !== null) this.regenWait = SPELL.magickaRegenDelay;
    else this.regenWait = Math.max(0, this.regenWait - dt);
    if (this.regenWait === 0) this.magicka = Math.min(SPELL.magickaMax, this.magicka + SPELL.magickaRegen * dt);
    this.ring?.style.setProperty('--charge', this.enabled ? this.charge.toFixed(3) : '0');
  }

  /**
   * After the rig poses: keeps the orbs in the palms and launches released spells from them.
   * @param handBones [left, right] spell anchors above the palms of the posed body
   */
  lateUpdate(
    handBones: [THREE.Object3D, THREE.Object3D] | null,
    eye: THREE.Vector3,
    forward: THREE.Vector3,
    playerVel: THREE.Vector3,
  ): void {
    if (!this.enabled || !handBones) {
      for (let i = 0; i < 3; i++) this.balls.setOrb(i, null, 0, 0, playerVel);
      return;
    }
    // Palms face up in the casting stance: the orb floats just above and ahead of each hand.
    // The anchors already sit just above each palm.
    for (let i = 0; i < 2; i++) handBones[i].getWorldPosition(this.palms[i]);
    const [l, r] = this.pose.hands;
    const orbRadius = (h: HandPose): number =>
      THREE.MathUtils.lerp(SPELL.orbIdle, SPELL.orbCharged, this.isCharging(h) ? h.charge : 0);
    const shown = (h: HandPose): boolean => !this.pose.lowered && !(h.state === 'release' && h.t < SPELL.releaseTime);
    if (this.pose.dual) {
      this.mid.addVectors(this.palms[0], this.palms[1]).multiplyScalar(0.5);
      const c = Math.max(l.charge, r.charge);
      this.balls.setOrb(2, this.mid, THREE.MathUtils.lerp(SPELL.orbCharged, SPELL.orbDual, c), c, playerVel);
      this.balls.setOrb(0, null, 0, 0, playerVel);
      this.balls.setOrb(1, null, 0, 0, playerVel);
    } else {
      this.balls.setOrb(2, null, 0, 0, playerVel);
      this.balls.setOrb(0, shown(l) ? this.palms[0] : null, orbRadius(l), l.charge, playerVel);
      this.balls.setOrb(1, shown(r) ? this.palms[1] : null, orbRadius(r), r.charge, playerVel);
    }

    if (this.pending === null) return;
    const which = this.pending;
    this.pending = null;
    const dual = which === 'dual';
    const from = dual ? this.mid : this.palms[which];
    const cost = dual ? SPELL.cost * SPELL.dualCostMul : SPELL.cost;
    if (this.magicka < cost) {
      // Spent elsewhere while held: fizzle instead of casting for free.
      this.fizzleHands(dual ? [0, 1] : [which]);
      return;
    }
    this.magicka -= cost;
    this.regenWait = SPELL.magickaRegenDelay;

    // Fly from the palm to whatever is under the crosshair, so casts land where you aim.
    this.aimPoint(eye, forward, this.aim);
    const dir = this.aim.sub(from);
    if (dir.length() < 1.2) dir.copy(forward);
    dir.normalize();
    const spec: BallSpec = dual
      ? {
          radius: SPELL.dualRadius,
          startRadius: SPELL.orbDual,
          damage: SPELL.damage * SPELL.dualDamageMul,
          splash: SPELL.splash * SPELL.dualSplashMul,
          gravity: SPELL.gravity,
          power: 1,
        }
      : { radius: SPELL.radius, startRadius: SPELL.orbCharged, damage: SPELL.damage, splash: SPELL.splash, gravity: SPELL.gravity, power: 0 };
    this.vel.copy(dir).multiplyScalar(dual ? SPELL.speed * 0.9 : SPELL.speed).addScaledVector(playerVel, WEAPON.inherit);
    this.balls.spawn(from, this.vel, spec);
    this.sound.throwBall(dual ? 1 : 0.35);
    this.stats.casts++;
    if (dual) this.stats.dualCasts++;
    for (const i of dual ? ([0, 1] as const) : [which]) this.setState(this.pose.hands[i], 'release', 0, 1);
    this.pose.dual = false;
    this.onCast?.(dual);
  }

  private isCharging(h: HandPose): boolean {
    return h.state === 'charging' || h.state === 'ready';
  }

  /** Magicka already promised to hands that are charging. */
  private committed(): number {
    if (this.pose.dual) return SPELL.cost * SPELL.dualCostMul;
    return this.pose.hands.filter((h) => this.isCharging(h)).length * SPELL.cost;
  }

  private setState(hand: HandPose, state: HandState, t: number, charge = 0): void {
    hand.state = state;
    hand.t = t;
    hand.charge = charge;
  }

  private fizzleHands(which: readonly HandIndex[]): void {
    for (const i of which) {
      const hand = this.pose.hands[i];
      if (!this.isCharging(hand)) continue;
      this.balls.fizzle(this.palms[i], this.vel.set(0, 0, 0));
      this.setState(hand, 'idle', 0);
      this.stats.fizzles++;
    }
    this.pose.dual = false;
    this.sound.fizzle();
  }

  private stopHum(): void {
    if (!this.humming) return;
    this.sound.stopCharge();
    this.humming = false;
  }

  /** First thing the crosshair ray hits (world boxes or a dummy), up to maxRange. */
  private aimPoint(eye: THREE.Vector3, forward: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    let best: number = WEAPON.maxRange;
    this.ray.set(eye, forward);
    for (const box of this.colliders) {
      if (this.ray.intersectBox(box, this.hit)) best = Math.min(best, this.hit.distanceTo(eye));
    }
    this.far.copy(eye).addScaledVector(forward, best);
    const d = this.dummies.hitTest(eye, this.far, 0);
    if (d) best *= d.t;
    return out.copy(eye).addScaledVector(forward, best);
  }
}
