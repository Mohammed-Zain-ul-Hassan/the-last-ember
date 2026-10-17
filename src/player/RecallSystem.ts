import * as THREE from 'three';
import { RECALL } from '../config';

export interface Snapshot {
  time: number;
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}

export interface Pose {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}

export type RecallState = 'ready' | 'recalling' | 'cooldown';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Wraps an angle difference into [-PI, PI) so yaw rewinds take the short way round. */
const shortestAngle = (from: number, to: number): number =>
  THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;

/**
 * Records a rolling 3s history of player poses and plays it back in reverse along a
 * Catmull-Rom spline when triggered.
 */
export class RecallSystem {
  state: RecallState = 'ready';
  /** Linear rewind progress in [0,1] while recalling. */
  progress = 0;
  cooldownRemaining = 0;

  onStart: (() => void) | null = null;
  onLand: ((pose: Pose) => void) | null = null;
  onReady: (() => void) | null = null;

  // Ring buffer of snapshots (oldest at `head`).
  private readonly buffer: Snapshot[] = [];
  private head = 0;
  private size = 0;
  private lastSampleTime = -Infinity;

  // Active rewind data.
  private curve: THREE.CatmullRomCurve3 | null = null;
  private readonly lerpFrom = new THREE.Vector3();
  private readonly lerpTo = new THREE.Vector3();
  private startYaw = 0;
  private deltaYaw = 0;
  private startPitch = 0;
  private targetPitch = 0;
  private elapsed = 0;
  private frozenTime = 0;
  /** Distance along the recorded path from the newest point back to each snapshot. */
  private readonly distFromNewest = new Float32Array(RECALL.bufferCapacity);
  private pathLength = 0;
  private remaining = 0;

  private readonly pose: Pose = { position: new THREE.Vector3(), yaw: 0, pitch: 0 };

  constructor() {
    for (let i = 0; i < RECALL.bufferCapacity; i++) {
      this.buffer.push({ time: 0, position: new THREE.Vector3(), yaw: 0, pitch: 0 });
    }
  }

  get count(): number {
    return this.size;
  }

  /** Snapshot by age order: 0 = oldest, count-1 = newest. */
  at(i: number): Snapshot {
    return this.buffer[(this.head + i) % RECALL.bufferCapacity];
  }

  /** Number of snapshots (from the oldest) that should still be drawn as trail. */
  get visibleCount(): number {
    return this.state === 'recalling' ? this.remaining : this.size;
  }

  /** Time base for trail ages; frozen during rewind so the trail doesn't fade mid-recall. */
  referenceTime(now: number): number {
    return this.state === 'recalling' ? this.frozenTime : now;
  }

  record(now: number, position: THREE.Vector3, yaw: number, pitch: number): void {
    if (this.state === 'recalling') return;
    if (now - this.lastSampleTime >= RECALL.sampleMs) {
      this.lastSampleTime = now;
      const cap = RECALL.bufferCapacity;
      const slot = this.buffer[(this.head + this.size) % cap];
      slot.time = now;
      slot.position.copy(position);
      slot.yaw = yaw;
      slot.pitch = pitch;
      if (this.size < cap) this.size++;
      else this.head = (this.head + 1) % cap;
    }
    this.prune(now);
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    this.lastSampleTime = -Infinity;
  }

  /** Starts the rewind from the current pose. Returns false if unavailable. */
  trigger(current: Pose, now: number): boolean {
    if (this.state !== 'ready' || this.size < 1) return false;
    this.prune(now);
    if (this.size < 1) return false;

    const oldest = this.at(0);

    // Sample the path newest -> oldest, enforcing a minimum spacing between control points.
    const points: THREE.Vector3[] = [current.position.clone()];
    for (let i = this.size - 1; i >= 0; i--) {
      const p = this.at(i).position;
      if (p.distanceTo(points[points.length - 1]) >= RECALL.minSpacing) points.push(p.clone());
    }
    // Guarantee the path ends exactly at the oldest snapshot.
    const last = points[points.length - 1];
    if (!last.equals(oldest.position)) {
      if (points.length > 1 && last.distanceTo(oldest.position) < RECALL.minSpacing) {
        last.copy(oldest.position);
      } else if (oldest.position.distanceTo(last) >= RECALL.minSpacing) {
        points.push(oldest.position.clone());
      }
    }

    if (points.length >= 2) {
      this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      this.curve.arcLengthDivisions = Math.max(200, points.length * 4);
    } else {
      this.curve = null;
    }
    this.lerpFrom.copy(current.position);
    this.lerpTo.copy(oldest.position);

    this.startYaw = current.yaw;
    this.deltaYaw = shortestAngle(current.yaw, oldest.yaw);
    this.startPitch = current.pitch;
    this.targetPitch = oldest.pitch;

    // Path distance per snapshot, used to "eat" the trail as the rewind passes over it.
    let acc = current.position.distanceTo(this.at(this.size - 1).position);
    this.distFromNewest[this.size - 1] = acc;
    for (let i = this.size - 2; i >= 0; i--) {
      acc += this.at(i).position.distanceTo(this.at(i + 1).position);
      this.distFromNewest[i] = acc;
    }
    this.pathLength = acc;
    this.remaining = this.size;

    this.frozenTime = now;
    this.elapsed = 0;
    this.progress = 0;
    this.state = 'recalling';
    this.onStart?.();
    return true;
  }

  /**
   * Advances the rewind/cooldown. While recalling, returns the pose the player should take
   * this frame; otherwise null.
   */
  update(dt: number): Pose | null {
    if (this.state === 'cooldown') {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
      if (this.cooldownRemaining === 0) {
        this.state = 'ready';
        this.onReady?.();
      }
      return null;
    }
    if (this.state !== 'recalling') return null;

    this.elapsed += dt;
    const t = Math.min(this.elapsed / RECALL.durationSec, 1);
    const e = easeInOutCubic(t);
    this.progress = t;

    if (this.curve) this.curve.getPointAt(e, this.pose.position);
    else this.pose.position.lerpVectors(this.lerpFrom, this.lerpTo, e);
    this.pose.yaw = this.startYaw + this.deltaYaw * e;
    this.pose.pitch = THREE.MathUtils.lerp(this.startPitch, this.targetPitch, e);

    const travelled = e * this.pathLength;
    let k = 0;
    while (k < this.size && this.distFromNewest[k] >= travelled) k++;
    this.remaining = k;

    if (t >= 1) {
      this.pose.position.copy(this.lerpTo);
      this.pose.yaw = this.startYaw + this.deltaYaw;
      this.pose.pitch = this.targetPitch;
      this.curve = null;
      this.clear();
      this.state = 'cooldown';
      this.cooldownRemaining = RECALL.cooldownSec;
      this.onLand?.(this.pose);
    }
    return this.pose;
  }

  private prune(now: number): void {
    const cutoff = now - RECALL.historyMs;
    while (this.size > 0 && this.at(0).time < cutoff) {
      this.head = (this.head + 1) % RECALL.bufferCapacity;
      this.size--;
    }
  }
}
