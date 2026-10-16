import type { Wall } from '../data/chapters';

export interface LightSrc {
  x: number;
  y: number; // height of the flame
  radius: number;
}

export type Interval = [number, number];

/**
 * Ground shadows cast by low walls along the play lane (1D, side view).
 * A wall shorter than the flame throws a finite shadow that lengthens as the flame sinks;
 * a wall taller than the flame shadows everything behind it.
 */
export function shadowIntervals(light: LightSrc, walls: readonly Wall[], minX: number, maxX: number): Interval[] {
  const out: Interval[] = [];
  for (const w of walls) {
    const near = w.x - w.w / 2;
    const far = w.x + w.w / 2;
    if (near <= light.x && light.x <= far) continue;
    if (w.x > light.x) {
      const end = w.h >= light.y ? maxX : light.x + ((far - light.x) * light.y) / (light.y - w.h);
      out.push([far, Math.min(end, maxX)]);
    } else {
      const end = w.h >= light.y ? minX : light.x + ((near - light.x) * light.y) / (light.y - w.h);
      out.push([Math.max(end, minX), near]);
    }
  }
  return out;
}

/** 0..1 light level at ground position x. */
export function lightAt(x: number, light: LightSrc, shadows: readonly Interval[]): number {
  for (const [a, b] of shadows) if (x >= a && x <= b) return 0;
  const d = Math.abs(x - light.x);
  if (d >= light.radius) return 0;
  return Math.pow(1 - d / light.radius, 1.2);
}
