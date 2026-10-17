import { describe, expect, it } from 'vitest';
import { box, cyl } from '../../sim/geom';
import { area, bodyShadow, hull, insideMargin, pointInPoly, project, shadowLength, solidShadow } from './shadowcast';

describe('shadowcast', () => {
  it('projects a point from a point light onto the ground', () => {
    // flame 2 m up at the origin; a point 1 m up, 1 m along x lands 2 m along x
    const p = project({ x: 0, y: 2, z: 0 }, 1, 1, 0, 0)!;
    expect(p[0]).toBeCloseTo(2);
    expect(p[1]).toBeCloseTo(0);
    expect(project({ x: 0, y: 2, z: 0 }, 1, 2.5, 0, 0)).toBeNull(); // above the flame: no finite shadow
  });

  it('a pole shadow lengthens as the flame sinks toward its top (a low flame, a long shadow)', () => {
    expect(shadowLength(2, 1, 3)).toBeCloseTo(1);
    expect(shadowLength(2, 1, 1.5)).toBeCloseTo(4);
    expect(shadowLength(2, 1, 1)).toBe(Infinity);
  });

  it('hulls are counter-clockwise and drop interior points', () => {
    const h = hull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]);
    expect(h).toHaveLength(4);
    expect(insideMargin(h, 0.5, 0.5)).toBeCloseTo(0.5);
    expect(insideMargin(h, 2, 0.5)).toBeLessThan(0);
  });

  it("a box's shadow runs away from the flame and covers ground behind it", () => {
    const L = { x: 0, y: 2, z: 0 };
    const s = box(3, 0, 1, 1, 1); // a 1 m cube centred 3 m along x
    const sh = solidShadow(L, s, 0, 30);
    expect(pointInPoly(sh, 4.5, 0)).toBe(true); // behind it, away from the flame
    expect(pointInPoly(sh, 1.5, 0)).toBe(false); // between the flame and the box
    expect(area(sh)).toBeGreaterThan(1);
  });

  it('a lower flame throws a longer shadow (more ground covered)', () => {
    const s = cyl(3, 0, 0.3, 1);
    const high = area(solidShadow({ x: 0, y: 3, z: 0 }, s, 0, 40));
    const low = area(solidShadow({ x: 0, y: 1.4, z: 0 }, s, 0, 40));
    expect(low).toBeGreaterThan(high * 2);
  });

  it("a body's own shadow leads it when the flame is behind: it reaches the far side of a gap", () => {
    // him at x = 0, 1.8 tall; the flame held behind him (x = -0.6) and low (1.1 m): his shadow runs out along +x
    const sh = bodyShadow({ x: -0.6, y: 1.1, z: 0 }, 0, 0, 0, 1.8, 0.3, 0, 12);
    expect(pointInPoly(sh, 3, 0)).toBe(true);
    expect(pointInPoly(sh, -1.5, 0)).toBe(false);
  });

  it('clips a runaway shadow to the light reach', () => {
    const sh = solidShadow({ x: 0, y: 1.05, z: 0 }, cyl(2, 0, 0.3, 1), 0, 6);
    for (const [x, z] of sh) expect(Math.hypot(x, z)).toBeLessThanOrEqual(6 + 1e-6);
  });
});
