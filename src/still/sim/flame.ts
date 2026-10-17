// The flame in his hand. It is aimed with the camera: looking up lifts it, swinging the view sweeps it round him.
// Shift draws it back behind his shoulder, low and close, so his own shadow runs out ahead of him (the bridges, the
// fifth plate). Its health is one number, `vigor`: steady, low, or out.

export const FLAME = {
  reach: 0.55, // how far in front of him the raised hand holds it
  side: 0.26, // and to the left (his off hand)
  backReach: 0.45, // drawn back: this far behind his shoulder
  front: [1.05, 3.05] as const, // height range, looking down .. looking up
  back: [1.88, 2.95] as const, // drawn back: low enough to stretch his shadow out of sight, high enough to shorten it
  trim: 0.35, // the wheel moves it this much either way
  ease: 14, // how fast it follows the view (1/s)
  radius: { steady: 11, low: 6.5, out: 1.4 },
  lit: { steady: 8, low: 4.5, out: 0.8 }, // the Wrong Shadow counts as lit inside this (the light is faint beyond)
  lowAt: 0.45, // vigor below this is a low flame
  regen: 0.06, // vigor per second, while lit
  minPitch: -0.3,
  maxPitch: 1.05,
};

export type FlameState = 'steady' | 'low' | 'out';
export const flameState = (vigor: number): FlameState => (vigor <= 0 ? 'out' : vigor < FLAME.lowAt ? 'low' : 'steady');

/** 0 looking down at him .. 1 looking up (the camera's pitch: positive looks down). */
export function lift(pitch: number): number {
  return Math.max(0, Math.min(1, (FLAME.maxPitch - pitch) / (FLAME.maxPitch - FLAME.minPitch)));
}

/** Where he holds the flame: from his feet (x, y, z), the camera's heading and pitch, the wheel trim, drawn back or not. */
export function flameTarget(x: number, y: number, z: number, yaw: number, pitch: number, trim: number, back: boolean): [number, number, number] {
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const k = lift(pitch);
  const [lo, hi] = back ? FLAME.back : FLAME.front;
  const h = Math.max(lo - 0.2, Math.min(hi + 0.2, lo + (hi - lo) * k + trim * FLAME.trim));
  if (back) return [x - fx * FLAME.backReach, y + h, z - fz * FLAME.backReach];
  // his left of forward on x/z (y up) is (fz, -fx)
  return [x + fx * FLAME.reach + fz * FLAME.side, y + h, z + fz * FLAME.reach - fx * FLAME.side];
}

/** The light's reach for a vigor (eased between the states so a gust dims it rather than snapping it). */
export function radiusFor(vigor: number): number {
  if (vigor <= 0) return FLAME.radius.out;
  if (vigor >= FLAME.lowAt) return FLAME.radius.steady;
  const k = vigor / FLAME.lowAt;
  return FLAME.radius.low + (FLAME.radius.steady - FLAME.radius.low) * k * k;
}
export function litRangeFor(vigor: number): number {
  const s = flameState(vigor);
  return FLAME.lit[s];
}
