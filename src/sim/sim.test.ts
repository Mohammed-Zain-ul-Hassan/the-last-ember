import { describe, expect, it } from 'vitest';
import { shadowedByPoint, shadowLength, shadowedBySun, litBySun, LightGrid, type PointLightState } from './light';
import { World, NO_INPUT, type Input } from './world';
import { CHAPTERS, chapterIndex, clockText } from './chapters';
import { CONFIG } from '../config';

const stone = { x: 5, z: 0, r: 0.5, h: 3 };

describe('point-light shadows', () => {
  it('a point behind a stone is shadowed, in front is not', () => {
    const L: PointLightState = { x: 0, z: 0, h: 2, r: 30 };
    expect(shadowedByPoint(L, 8, 0, stone)).toBe(true);
    expect(shadowedByPoint(L, 3, 0, stone)).toBe(false);
    expect(shadowedByPoint(L, 8, 3, stone)).toBe(false);
  });

  it('a flame taller than the stone makes the shadow finite', () => {
    const tall: PointLightState = { x: 0, z: 0, h: 6, r: 30 };
    const len = shadowLength(6, 3, 5); // 5 / (1 - 0.5) - 5 = 5
    expect(len).toBeCloseTo(5, 5);
    expect(shadowedByPoint(tall, 7, 0, stone)).toBe(true); // 2 m behind: inside the 5 m shadow
    expect(shadowedByPoint(tall, 13, 0, stone)).toBe(false); // 8 m behind: past the shadow's tip
    expect(shadowLength(2, 3, 5)).toBe(Infinity);
  });

  it('the flare shrinks shadows: the same point goes from dark to lit', () => {
    const low: PointLightState = { x: 0, z: 0, h: 2.5, r: 30 };
    const flare: PointLightState = { x: 0, z: 0, h: 9, r: 30 };
    expect(shadowedByPoint(low, 12, 0, stone)).toBe(true);
    expect(shadowedByPoint(flare, 12, 0, stone)).toBe(false);
  });

  it('sun shadows fall away from the sun', () => {
    const sun = { on: true, dx: -1, dz: 0, elev: 0.1, edge: -Infinity };
    // sun in the west (-x): the shadow falls east (+x) of the stone
    expect(shadowedBySun(sun, 10, 0, stone)).toBe(true);
    expect(shadowedBySun(sun, 0, 0, stone)).toBe(false);
  });
});

describe('dawn ridge', () => {
  it('sunlight reaches the west first, then the ridge shadow recedes east', () => {
    const w = new World(1, chapterIndex('5am'));
    w.godMode = true;
    for (let i = 0; i < 60 * 30; i++) w.step(1 / 60, NO_INPUT);
    const q = w.query();
    expect(w.sun.on).toBe(true);
    const tip = w.sun.ridge!;
    let litWest = 0;
    let litEast = 0;
    for (let x = -28; x <= 28; x += 1) {
      for (let z = -28; z <= 28; z += 1) {
        const u = x * w.sun.dx + z * w.sun.dz;
        if (!litBySun(q, x, z)) continue;
        if (u < tip) litWest++;
        else litEast++;
      }
    }
    expect(litWest).toBeGreaterThan(50);
    expect(litEast).toBe(0);
  });
});

describe('flow field', () => {
  it('routes through darkness rather than across light', () => {
    const g = new LightGrid(10, 0.5, []);
    // light everything except a dark corridor along z = 5 row
    g.lit.fill(1);
    for (let i = 0; i < g.n; i++) {
      const k = g.index(g.cx(i), 5);
      if (k >= 0) g.lit[k] = 0;
    }
    g.rebuildFlow(0, 5, 0.6, 14);
    const far = g.index(-8, 5);
    const lit = g.index(-8, -5);
    expect(g.dist[far]).toBeLessThan(g.dist[lit]);
    expect(g.dirX[far]).toBeGreaterThan(0.5); // walks east along the corridor
  });
});

describe('world', () => {
  it('builds and runs a chapter deterministically for a seed', () => {
    const run = () => {
      const w = new World(7, 1);
      for (let i = 0; i < 60 * 20; i++) w.step(1 / 60, NO_INPUT);
      return w.snapshot();
    };
    expect(run()).toEqual(run());
  });

  it('shades spawn only in darkness', () => {
    const w = new World(3, 1);
    let checked = 0;
    for (let i = 0; i < 60 * 30; i++) {
      w.step(1 / 60, NO_INPUT);
      for (const e of w.events) {
        if (e.type === 'spawn') {
          checked++;
          expect(w.isLit(e.x, e.z)).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('time eats the fire: the hearth burns down with nobody guarding it', () => {
    const w = new World(1, 2);
    const f0 = w.fuel;
    for (let i = 0; i < 60 * 20; i++) {
      w.step(1 / 60, NO_INPUT);
      w.shades.length = 0;
    }
    expect(w.fuel).toBeLessThan(f0 - 10);
  });

  it('a flare costs fuel and raises the flame above the stones', () => {
    const w = new World(1, 1);
    const f0 = w.fuel;
    const h0 = w.fire.h;
    const flare: Input = { ...NO_INPUT, flare: true };
    w.step(1 / 60, flare);
    w.step(1 / 60, NO_INPUT);
    w.step(0.1, NO_INPUT);
    expect(w.fuel).toBeLessThan(f0 - CONFIG.flare.cost + 1);
    expect(w.fire.h).toBeGreaterThan(h0 + 3);
  });

  it('the knight casts a shadow in hearth mode but not while carrying the torch', () => {
    const w = new World(1, 1);
    w.knight.x = 0;
    w.knight.z = 4;
    w.step(1 / 60, NO_INPUT);
    expect(w.isLit(0, 6)).toBe(false); // directly behind him, away from the fire
    expect(w.isLit(2.5, 3)).toBe(true);
    const t = new World(1, chapterIndex('1am'));
    t.step(1 / 60, NO_INPUT);
    expect(t.isLit(t.knight.x + 1, t.knight.z + 1)).toBe(true);
  });

  it('a three-hit combo kills a shade standing in front of the knight', () => {
    const w = new World(1, 1);
    const s = w.addShade('shade', 0, 5);
    s.state = 'move';
    w.knight.x = 0;
    w.knight.z = 3.5;
    let killed = false;
    for (let i = 0; i < 90; i++) {
      const inp: Input = { ...NO_INPUT, aimX: 0, aimZ: 10, attack: i % 12 === 0 };
      w.step(1 / 60, inp);
      if (w.events.some((e) => e.type === 'shadeDie')) killed = true;
      s.x = 0;
      s.z = 5;
    }
    expect(killed).toBe(true);
  });

  it('the knight dies and the run is lost', () => {
    const w = new World(1, 1);
    for (let i = 0; i < CONFIG.knight.hp; i++) {
      w.knight.invuln = 0;
      w.hurtKnight(1, 0, 10);
    }
    w.step(1 / 60, NO_INPUT);
    expect(w.status).toBe('lost');
    expect(w.loseReason).toBe('knight');
  });

  it('dawn: standing in the sun chooses the light', () => {
    const w = new World(1, chapterIndex('5am'));
    w.godMode = true;
    for (let i = 0; i < 60 * 60 && w.status === 'play'; i++) {
      w.knight.x = -22;
      w.knight.z = -2;
      w.step(1 / 60, NO_INPUT);
    }
    expect(w.status).toBe('ending');
    expect(w.ending).toBe('light');
  });

  it('chapters cover 7 PM to 5 AM and the clock reads like a clock', () => {
    expect(CHAPTERS[0].label).toBe('7 PM');
    expect(CHAPTERS[CHAPTERS.length - 1].label).toBe('5 AM');
    expect(clockText(CHAPTERS[0], 0)).toBe('7:00 PM');
    expect(clockText(CHAPTERS[2], 0.75)).toBe('12:30 AM');
    expect(clockText(CHAPTERS[3], 0.5)).toBe('2:00 AM');
  });
});
