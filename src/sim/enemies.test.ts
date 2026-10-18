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
    const c = awake(w.spawnShade(23.5, 0.5, false, 'crawler'));
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
    const l = awake(w.spawnShade(24, 1, false, 'lantern'));
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
    expect(Math.hypot(l.x - w.knight.x, l.z - w.knight.z)).toBeGreaterThan(CFG.lantern.near - 1.5);
    expect(w.knight.hp).toBeLessThan(CFG.knight.maxHp);
  });

  it('cannot be burned by light (they eat it)', () => {
    const w = new World(CHAPTERS.findIndex((c) => c.id === '11pm'), 2);
    w.spawning = false;
    const l = awake(w.spawnShade(w.hearthX + 1.8, w.hearthZ + 1.5, false, 'lantern'));
    l.cd = 1e9;
    const hp = l.hp;
    for (let i = 0; i < 120; i++) w.step(NO_INPUT);
    expect(l.hp).toBe(hp);
  });

  it('a sword stroke cuts a bolt out of the air', () => {
    const w = at('lowerCity');
    w.knight.x = 20.5;
    w.knight.yaw = 0;
    w.bolts.push({ id: 999, x: 22.2, y: 1.2, z: 0, vx: -1, vy: 0, vz: 0, life: 3 });
    let cut = false;
    for (let i = 0; i < 20; i++) {
      w.step(press({ attack: i === 0, aim: 0 }));
      if (w.events.some((e) => e.type === 'boltCut')) cut = true;
    }
    expect(cut).toBe(true);
    expect(w.knight.hp).toBe(CFG.knight.maxHp);
  });
});

describe('lantern-eaters in their first hour (11 PM)', () => {
  const hourOf = (id: string) => {
    const w = new World(CHAPTERS.findIndex((c) => c.id === id), 3);
    w.spawning = false;
    return w;
  };

  it('hover at head height, where a blow from the ground reaches them, and break in two hits', () => {
    const w = hourOf('11pm');
    const k = w.knight;
    k.yaw = 0;
    const l = awake(w.spawnShade(k.x + 1.7, k.z, false, 'lantern'));
    l.cd = 1e9;
    l.y = k.y + w.lanternCfg.hover;
    expect(l.hp).toBe(2);
    let hit = false;
    for (let i = 0; i < 12; i++) {
      w.step(press({ attack: i === 0, aim: 0 }));
      if (w.events.some((e) => e.type === 'hit' && e.id === l.id)) hit = true;
    }
    expect(hit).toBe(true);
  });

  it('a struck lantern is knocked out of the sky and lies stunned on the ground', () => {
    const w = hourOf('11pm');
    const k = w.knight;
    k.yaw = 0;
    const l = awake(w.spawnShade(k.x + 1.7, k.z, false, 'lantern'));
    l.cd = 1e9;
    l.y = k.y + w.lanternCfg.hover;
    l.hp = 99;
    let landed = false;
    for (let i = 0; i < 40; i++) {
      w.step(press({ attack: i === 0, aim: 0 }));
      if (w.events.some((e) => e.type === 'shadeLand')) landed = true;
    }
    expect(landed).toBe(true);
    expect(l.y).toBeLessThan(0.1);
    expect(l.state).toBe('stagger');
  });

  it('later hours keep them above a grounded blow', () => {
    const w = at('lowerCity');
    const k = w.knight;
    k.x = 20.5;
    k.z = -1;
    k.yaw = 0;
    const l = awake(w.spawnShade(k.x + 1.7, k.z, false, 'lantern'));
    l.cd = 1e9;
    l.y = k.y + CFG.lantern.hover;
    let hit = false;
    for (let i = 0; i < 12; i++) {
      w.step(press({ attack: i === 0, aim: 0 }));
      if (w.events.some((e) => e.type === 'hit')) hit = true;
    }
    expect(hit).toBe(false);
  });
});

describe('bodies in the world', () => {
  it('a shadow bolt bursts on a wall instead of passing through it', () => {
    const w = at('lowerCity');
    w.knight.x = 20.5;
    // the low rubble wall at x 22 stands between: the bolt flies at it below its top
    w.bolts.push({ id: 999, x: 24, y: 0.7, z: 0, vx: -8.5, vy: 0, vz: 0, life: 3 });
    let splash: { x: number } | undefined;
    for (let i = 0; i < 40; i++) {
      w.step(NO_INPUT);
      splash ??= w.events.find((e) => e.type === 'boltSplash');
    }
    expect(splash).toBeDefined();
    expect(splash!.x).toBeGreaterThan(22.7);
    expect(w.knight.hp).toBe(CFG.knight.maxHp);
  });

  it('a lantern-eater holds its fire while a wall stands between them', () => {
    const w = at('lowerCity');
    const house = w.solids.find((o) => o.tag === 'house' && o.z > 0 && o.hw > 2.6)!;
    w.knight.x = house.x;
    w.knight.z = 1;
    // hovering behind the house, out of the street: it cannot see him
    const l = awake(w.spawnShade(house.x, house.z + house.hd + 1.2, false, 'lantern'));
    l.cd = 0;
    l.y = 0.5;
    w.step(NO_INPUT);
    expect(l.state).toBe('walk');
    expect(w.bolts.length).toBe(0);
  });

  it('a shade walks round a pillar, never through it', () => {
    const w = new World(CHAPTERS.findIndex((c) => c.id === '11pm'), 4);
    w.spawning = false;
    const col = w.solids.find((o) => o.tag === 'column' && o.y1 > 5)!;
    const d = Math.hypot(col.x, col.z);
    // straight out behind the pillar from the hearth: the beeline to the fire runs through it
    const s = awake(w.spawnShade(col.x * (1 + 2 / d), col.z * (1 + 2 / d)));
    s.hp = 1e9;
    w.knight.x = -col.x;
    w.knight.z = -col.z;
    let closest = Infinity;
    for (let i = 0; i < 60 * 8; i++) {
      w.step(NO_INPUT);
      closest = Math.min(closest, Math.hypot(s.x - col.x, s.z - col.z));
    }
    expect(closest).toBeGreaterThanOrEqual(col.hw + CFG.shade.r - 0.02);
    expect(Math.hypot(s.x - w.hearthX, s.z - w.hearthZ)).toBeLessThan(3.2);
  });

  it('a cleave launches a shade into a wall: it slams, bounces, takes a point and comes down', () => {
    const w = at('lowerCity');
    const house = w.solids.find((o) => o.tag === 'house' && o.z > 0 && o.hw > 2.6)!;
    const wallZ = house.z - house.hd;
    const k = w.knight;
    k.x = house.x;
    k.z = wallZ - 2.6;
    k.yaw = Math.PI / 2;
    const s = awake(w.spawnShade(k.x, wallZ - 1.2));
    s.cd = 1e9;
    s.hp = 50;
    let slam = false;
    let flew = false;
    let landed = false;
    for (let i = 0; i < 90; i++) {
      const hp = s.hp;
      w.step(press({ heavy: i === 0, aim: Math.PI / 2 }));
      if (s.air) flew = true;
      if (w.events.some((e) => e.type === 'wallSlam' && e.id === s.id)) {
        slam = true;
        expect(hp - s.hp).toBeGreaterThanOrEqual(CFG.body.slamDmg); // (the torch burns it a little too)
        expect(s.vz).toBeLessThan(0); // bounced back off the wall
      }
      if (w.events.some((e) => e.type === 'shadeLand')) landed = true;
      expect(s.z).toBeLessThanOrEqual(wallZ - CFG.shade.r + 0.02);
    }
    expect(flew).toBe(true);
    expect(slam).toBe(true);
    expect(landed).toBe(true);
  });

  it('a shade thrown into another bowls it over', () => {
    const w = at('lowerCity');
    w.knight.x = 0;
    // open street between the rubble at x 22 and x 31
    const a = awake(w.spawnShade(25.5, 0));
    const b = awake(w.spawnShade(26.7, 0));
    a.cd = b.cd = 1e9;
    a.state = 'stagger';
    a.stun = 1;
    a.vx = 10;
    let bumped = false;
    let farthest = b.x;
    for (let i = 0; i < 20; i++) {
      w.step(NO_INPUT);
      if (w.events.some((e) => e.type === 'bump')) bumped = true;
      farthest = Math.max(farthest, b.x);
    }
    expect(bumped).toBe(true);
    expect(b.state).toBe('stagger');
    expect(farthest).toBeGreaterThan(27.3);
  });
});

describe('the Hollow Marshal', () => {
  it('below half health cries out, calls crawlers, and strikes send a ground ring you must jump', () => {
    const w = at('cathedral');
    w.knight.x = 80;
    w.knight.iframes = 0;
    const m = awake(w.spawnShade(82, 0, true));
    m.cd = 1e9;
    m.hp = m.maxHp * 0.4;
    let cried = false;
    w.step(NO_INPUT);
    if (w.events.some((e) => e.type === 'marshalCry')) cried = true;
    expect(cried).toBe(true);
    expect(w.shades.filter((s) => s.kind === 'crawler').length).toBe(2);
    for (const s of w.shades) if (s.kind === 'crawler') s.state = 'dead';
    // the next strike sends a wave
    m.cd = 0;
    let waved = false;
    for (let i = 0; i < 60; i++) {
      w.step(NO_INPUT);
      if (w.events.some((e) => e.type === 'wave')) waved = true;
    }
    expect(waved).toBe(true);
  });

  it('a wave wounds a knight on the ground and passes under a jumping one', () => {
    const w = at('cathedral');
    w.knight.x = 80;
    w.waves.push({ x: 78, z: 0, r: 1.5, life: 1, hit: false });
    for (let i = 0; i < 10; i++) w.step(NO_INPUT);
    expect(w.knight.hp).toBeLessThan(CFG.knight.maxHp);

    const w2 = at('cathedral');
    w2.knight.x = 80;
    w2.knight.y = 1.5;
    w2.knight.vy = 0;
    w2.knight.onGround = false;
    w2.waves.push({ x: 79, z: 0, r: 0.6, life: 1, hit: false });
    w2.step(NO_INPUT);
    w2.step(NO_INPUT);
    expect(w2.knight.hp).toBe(CFG.knight.maxHp);
  });
});
