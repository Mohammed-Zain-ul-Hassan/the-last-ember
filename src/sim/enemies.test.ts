import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { CHAPTERS } from '../data/chapters';
import { NO_INPUT, World, type Input } from './world';

const press = (p: Partial<Input>): Input => ({ ...NO_INPUT, ...p });
const at = (level: string) => {
  const w = new World(CHAPTERS.findIndex((c) => c.level === level), 5);
  w.spawning = false;
  return w;
};
const awake = <T extends { state: string; stateT: number }>(s: T) => {
  s.state = 'walk';
  s.stateT = 0;
  return s;
};

describe('crawlers', () => {
  it('crouch, then pounce from range and wound the knight', () => {
    const w = at('lowerCity');
    w.knight.x = 20.5;
    const c = awake(w.spawnShade(23, false, 'crawler'));
    c.cd = 0;
    let pounced = false;
    for (let i = 0; i < 90; i++) {
      w.step(NO_INPUT);
      if (w.events.some((e) => e.type === 'pounce')) pounced = true;
    }
    expect(pounced).toBe(true);
    expect(w.knight.hp).toBeLessThan(CFG.knight.maxHp);
  });

  it('arrive in pairs', () => {
    const w = new World(CHAPTERS.findIndex((c) => c.id === '1am'), 9);
    w.knight.iframes = 1e9;
    const before = w.shades.length;
    let pairs = 0;
    for (let i = 0; i < 60 * 40 && pairs === 0; i++) {
      w.step(NO_INPUT);
      const born = w.events.filter((e) => e.type === 'spawn').length;
      if (born === 2 && w.shades.slice(-2).every((s) => s.kind === 'crawler')) pairs++;
    }
    expect(before).toBe(0);
    expect(pairs).toBe(1);
  });
});

describe('lantern-eaters', () => {
  it('hover above jump height, keep their distance, and their bolts wound and dim the torch', () => {
    const w = at('lowerCity');
    w.knight.x = 20.5;
    const l = awake(w.spawnShade(24, false, 'lantern'));
    l.cd = 0;
    let fired = false;
    let hit = false;
    for (let i = 0; i < 240; i++) {
      w.step(NO_INPUT);
      if (w.events.some((e) => e.type === 'bolt')) fired = true;
      if (w.events.some((e) => e.type === 'boltHit')) hit = true;
    }
    expect(fired).toBe(true);
    expect(hit).toBe(true);
    expect(l.y).toBeGreaterThan(2);
    expect(Math.abs(l.x - w.knight.x)).toBeGreaterThan(CFG.lantern.near - 1);
    expect(w.knight.hp).toBeLessThan(CFG.knight.maxHp);
  });

  it('cannot be burned by light (they eat it)', () => {
    const w = new World(CHAPTERS.findIndex((c) => c.id === '11pm'), 2);
    w.spawning = false;
    const l = awake(w.spawnShade(w.hearthX + 1.5, false, 'lantern'));
    l.cd = 1e9;
    const hp = l.hp;
    for (let i = 0; i < 120; i++) w.step(NO_INPUT);
    expect(l.hp).toBe(hp);
  });

  it('a sword stroke cuts a bolt out of the air', () => {
    const w = at('lowerCity');
    w.knight.x = 20.5;
    w.knight.facing = 1;
    w.bolts.push({ id: 999, x: 22.2, y: 1.2, vx: -1, vy: 0, life: 3 });
    let cut = false;
    for (let i = 0; i < 20; i++) {
      w.step(press({ attack: i === 0 }));
      if (w.events.some((e) => e.type === 'boltCut')) cut = true;
    }
    expect(cut).toBe(true);
    expect(w.knight.hp).toBe(CFG.knight.maxHp);
  });
});

describe('the Hollow Marshal', () => {
  it('below half health cries out, calls crawlers, and strikes send ground waves you must jump', () => {
    const w = at('cathedral');
    w.knight.x = 80;
    w.knight.iframes = 0;
    const m = awake(w.spawnShade(82, true));
    m.cd = 1e9;
    m.hp = m.maxHp * 0.4;
    let cried = false;
    w.step(NO_INPUT);
    if (w.events.some((e) => e.type === 'marshalCry')) cried = true;
    expect(cried).toBe(true);
    expect(w.shades.filter((s) => s.kind === 'crawler').length).toBe(2);
    for (const s of w.shades) if (s.kind === 'crawler') s.state = 'dead';
    // the next strike sends waves both ways
    m.cd = 0;
    let waved = false;
    for (let i = 0; i < 60; i++) {
      w.step(NO_INPUT);
      if (w.events.some((e) => e.type === 'wave')) waved = true;
    }
    expect(waved).toBe(true);
  });

  it('a wave passes under a jumping knight', () => {
    const w = at('cathedral');
    w.knight.x = 80;
    w.knight.y = 1.5;
    w.knight.vy = 0;
    w.knight.onGround = false;
    w.waves.push({ x: 79, dir: 1, life: 1, hit: false });
    w.step(NO_INPUT);
    w.step(NO_INPUT);
    expect(w.knight.hp).toBe(CFG.knight.maxHp);
  });
});
