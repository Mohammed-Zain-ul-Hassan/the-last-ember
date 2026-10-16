import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { lightAt, shadowIntervals } from './light';
import { NO_INPUT, World, type Input } from './world';

const press = (p: Partial<Input>): Input => ({ ...NO_INPUT, ...p });

describe('light', () => {
  it('casts a finite shadow behind a wall shorter than the flame, longer as the flame sinks', () => {
    const wall = [{ x: 5.5, w: 1.2, h: 1.0 }];
    const [hi] = shadowIntervals({ x: 0, y: 2.6, radius: 12 }, wall, -17, 17);
    const [lo] = shadowIntervals({ x: 0, y: 1.6, radius: 12 }, wall, -17, 17);
    expect(hi[0]).toBeCloseTo(6.1);
    expect(hi[1]).toBeCloseTo((6.1 * 2.6) / 1.6);
    expect(lo[1]).toBeGreaterThan(hi[1]);
  });

  it('a wall taller than the flame shadows everything behind it', () => {
    const [s] = shadowIntervals({ x: 0, y: 1.0, radius: 12 }, [{ x: -4, w: 1, h: 1.5 }], -17, 17);
    expect(s).toEqual([-17, -4.5]);
  });

  it('is zero in shadow and beyond the radius, highest at the fire', () => {
    const light = { x: 0, y: 2.6, radius: 10 };
    const sh = shadowIntervals(light, [{ x: 5, w: 1, h: 1 }], -17, 17);
    expect(lightAt(0, light, sh)).toBe(1);
    expect(lightAt(6, light, sh)).toBe(0);
    expect(lightAt(-11, light, sh)).toBe(0);
    expect(lightAt(-3, light, sh)).toBeGreaterThan(0);
  });
});

describe('world', () => {
  it('only spawns shades in darkness', () => {
    const w = new World(1, 42);
    for (let i = 0; i < 200; i++) expect(w.lightAt(w.pickSpawnX())).toBe(0);
  });

  it('a 3-hit combo kills a 3 hp shade standing in front of the knight', () => {
    const w = new World(0, 1);
    w.knight.x = -14;
    const s = w.spawnShade(-12.6);
    s.state = 'walk';
    s.cd = 99; // never attacks
    for (let i = 0; i < 120 && (s.state as string) !== 'dead'; i++) w.step(press({ attack: i % 6 === 0 }));
    expect(s.state).toBe('dead');
    expect(w.kills).toBe(1);
  });

  it('dash gives invulnerability frames', () => {
    const w = new World(0, 1);
    w.step(press({ dash: true }));
    expect(w.knight.state).toBe('dash');
    expect(w.knight.iframes).toBeGreaterThan(0);
  });

  it('loses when the hearth burns out', () => {
    const w = new World(0, 1);
    w.hearthHp = 1;
    const s = w.spawnShade(1.5);
    s.state = 'walk';
    s.hp = 999;
    w.knight.x = -15;
    for (let i = 0; i < 600 && w.status === 'playing'; i++) w.step(NO_INPUT);
    expect(w.status).toBe('lost');
    expect(w.loseReason).toBe('hearth');
  });

  it('clears the hour when time runs out and dissolves remaining shades', () => {
    const w = new World(0, 1);
    w.knight.iframes = 1e9; // god mode
    w.hearthHp = 1e9;
    const frames = Math.ceil(w.chapter.duration / CFG.dt) + 600;
    for (let i = 0; i < frames && w.status === 'playing'; i++) {
      w.knight.iframes = 1e9;
      w.step(NO_INPUT);
    }
    expect(w.status).toBe('cleared');
    expect(w.shades.every((s) => s.state === 'dead')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const w = new World(2, 7);
      for (let i = 0; i < 1200; i++) w.step(press({ right: i % 90 < 45, attack: i % 11 === 0 }));
      return JSON.stringify([w.knight.x, w.hearthHp, w.kills, w.shades.map((s) => [s.id, s.x.toFixed(4)])]);
    };
    expect(run()).toBe(run());
  });
});
