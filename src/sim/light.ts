import { firstHit, type Solid } from './geom';

export interface LightSrc {
  x: number;
  y: number; // height of the flame
  z: number;
  radius: number;
}

/**
 * Is ground point (x, z) in a cast shadow? True when the line from it up to the flame passes through a solid.
 * A ruin lower than the flame throws a finite shadow that lengthens as the flame sinks; one taller than the flame
 * shadows everything behind it. This is the same shadow the renderer's shadow map draws.
 */
export function inShadow(x: number, z: number, light: LightSrc, solids: readonly Solid[]): boolean {
  return firstHit(solids, x, 0.05, z, light.x, light.y, light.z, true) < 0.999;
}

/** 0..1 light level at ground position (x, z): falls off with distance, 0 in a cast shadow or beyond the radius. */
export function lightAt(x: number, z: number, light: LightSrc, solids: readonly Solid[]): number {
  const d = Math.hypot(x - light.x, z - light.z);
  if (d >= light.radius) return 0;
  if (inShadow(x, z, light, solids)) return 0;
  return Math.pow(1 - d / light.radius, 1.2);
}
