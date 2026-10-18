import type { KnightJointPose } from '../../render/knightView';
import type { Knight } from '../../sim/world';

// How he moves in the Still City (the knight himself is the hearth act's: src/render/knightView.ts).
//   idle     breathing, his weight shifting from foot to foot, his head turning slowly to the dark around him
//   walk     the careful pace of a man carrying the last fire: upright, short steps, a small bob, the free arm easy
//   sprint   the flame drawn back and running: a long stride, leaning into it, the knees high, the free arm pumping
// The two blend by his speed, on one shared step cycle, so a walk breaks into a run without a hitch.

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** The gait, as a function the knight calls for its standing and moving poses. */
export function stillGait(): (p: KnightJointPose, k: Knight, t: number, dt: number) => { stiff: number; zeta: number } {
  let phase = 0;
  let still = 0; // seconds standing (the idle settles in)
  return (p, k, t, dt) => {
    const speed = Math.hypot(k.vx, k.vz);
    if (speed < 0.35) {
      still += dt;
      const breathe = Math.sin(t * 1.6);
      const weight = Math.sin(t * 0.42); // the slow shift from one foot to the other
      p.lean = 0.04 + breathe * 0.018;
      p.bob = breathe * 0.012 - Math.abs(weight) * 0.01;
      p.twist = Math.sin(t * 0.37) * 0.07 + weight * 0.03;
      p.head = -0.05 + Math.sin(t * 0.55 + 1.3) * 0.08; // looking into the dark, then back
      p.th0 = 0.08 + weight * 0.06;
      p.th1 = -0.08 + weight * 0.06;
      p.kn0 = 0.06 + Math.max(0, weight) * 0.14;
      p.kn1 = 0.06 + Math.max(0, -weight) * 0.14;
      p.arm = 0.1 + breathe * 0.02;
      p.armTilt = 0.1;
      p.elbow = -0.22;
      p.swordRel = 0;
      return { stiff: 80, zeta: 0.85 };
    }
    still = 0;
    // 0 a walk .. 1 a sprint
    const run = smooth(3.7, 5.1, speed);
    phase += dt * mix(1.9 + speed * 1.0, 3.0 + speed * 1.15, run);
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const stride = mix(0.5, 1.12, run);
    const lift = mix(0.55, 1.55, run);
    p.th0 = s * stride;
    p.th1 = -s * stride;
    p.kn0 = Math.max(0, -s) * lift + mix(0.1, 0.22, run);
    p.kn1 = Math.max(0, s) * lift + mix(0.1, 0.22, run);
    p.lean = mix(0.07, 0.4, run);
    p.bob = Math.abs(c) * mix(0.03, 0.1, run) - mix(0.012, 0.05, run);
    p.twist = s * mix(0.05, 0.17, run);
    p.head = mix(-0.03, -0.16, run);
    // the free arm swings against the legs: easy at a walk, pumping (elbow bent) in a sprint
    p.arm = mix(0.12, -0.05, run) - s * mix(0.32, 0.9, run);
    p.armTilt = mix(0.1, 0.22, run);
    p.elbow = mix(-0.32, -1.35, run);
    p.swordRel = 0;
    return { stiff: mix(140, 400, run), zeta: mix(0.66, 0.56, run) };
  };
}
