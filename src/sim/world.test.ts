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

  // ------------------------------------------------------------- moves
  const arena = (chapter = 0) => {
    const w = new World(chapter, 3);
    w.knight.x = -14;
    w.knight.facing = 1;
    w.knight.iframes = 1e9;
    w.spawnT = 1e9; // no random spawns
    return w;
  };
  const dummy = (w: World, x: number, hp = 50) => {
    const s = w.spawnShade(x);
    s.state = 'walk';
    s.cd = 1e9;
    s.hp = s.maxHp = hp;
    s.speed = 0;
    return s;
  };
  const run = (w: World, frames: number, inp: Partial<Input> = {}) => {
    for (let i = 0; i < frames; i++) w.step(press(i === 0 ? inp : { left: inp.left, right: inp.right, jumpHeld: inp.jumpHeld }));
  };

  it('light attacks hit a single target, even with two shades in reach', () => {
    const w = arena();
    const a = dummy(w, -12.8);
    const b = dummy(w, -12.4);
    run(w, 30, { attack: true });
    const hit = [a, b].filter((s) => s.hp < 50);
    expect(hit.length).toBe(1);
    expect(hit[0]).toBe(a); // the nearest one
  });

  it('heavy attacks are area of effect, front and behind', () => {
    const w = arena();
    const front1 = dummy(w, -12.6);
    const front2 = dummy(w, -11.6);
    const behind = dummy(w, -15);
    run(w, 60, { heavy: true });
    expect([front1, front2, behind].every((s) => s.hp < 50)).toBe(true);
    expect(w.events.length >= 0).toBe(true);
  });

  it('attacking in the air is an aerial strike; heavy in the air is a plunge that slams on landing', () => {
    const w = arena();
    run(w, 1, { jump: true, jumpHeld: true });
    run(w, 12, { jumpHeld: true });
    expect(w.knight.onGround).toBe(false);
    run(w, 1, { attack: true });
    expect(w.knight.move).toBe('air');
    const w2 = arena();
    const l = dummy(w2, -16);
    const r = dummy(w2, -11.5);
    run(w2, 1, { jump: true, jumpHeld: true });
    run(w2, 14, { jumpHeld: true });
    let slam = false;
    w2.step(press({ heavy: true }));
    expect(w2.knight.move).toBe('plunge');
    for (let i = 0; i < 120; i++) {
      w2.step(NO_INPUT);
      if (w2.events.some((e) => e.type === 'slam')) slam = true;
    }
    expect(slam).toBe(true);
    expect(l.hp).toBeLessThan(50);
    expect(r.hp).toBeLessThan(50);
  });

  it('attacking out of a dash pierces every shade in the line', () => {
    const w = arena();
    const a = dummy(w, -12.5);
    const b = dummy(w, -11);
    const c = dummy(w, -9.5);
    w.step(press({ dash: true, right: true }));
    run(w, 3, { right: true });
    w.step(press({ attack: true }));
    expect(w.knight.move).toBe('dashStrike');
    run(w, 40);
    expect([a, b, c].filter((s) => s.hp < 50).length).toBeGreaterThanOrEqual(2);
  });

  it('attacking at full run is a lunge', () => {
    const w = arena();
    w.knight.x = -10.3; // open ground between two walls
    run(w, 12, { right: true });
    w.step(press({ right: true, attack: true }));
    expect(w.knight.move).toBe('lunge');
  });

  it('double jump: one extra leap in the air, restored on landing', () => {
    const w = arena();
    run(w, 1, { jump: true, jumpHeld: true });
    run(w, 20, { jumpHeld: true });
    const y0 = w.knight.y;
    w.step(press({ jump: true, jumpHeld: true }));
    expect(w.events.some((e) => e.type === 'jump' && e.double)).toBe(true);
    expect(w.knight.vy).toBeGreaterThan(CFG.knight.airJumpV * 0.9);
    run(w, 10, { jumpHeld: true });
    expect(w.knight.y).toBeGreaterThan(y0);
    // no third jump
    w.step(press({ jump: true, jumpHeld: true }));
    expect(w.events.some((e) => e.type === 'jump')).toBe(false);
    run(w, 200);
    expect(w.knight.onGround).toBe(true);
    expect(w.knight.airJumps).toBe(CFG.knight.airJumps);
  });

  it('a jump pressed during the tail of a swing is not swallowed', () => {
    const w = arena();
    w.step(press({ attack: true }));
    const sp = CFG.combo[0];
    run(w, Math.ceil((sp.windup + sp.active) / CFG.dt) + 1);
    expect(w.knight.state).toBe('attack');
    w.step(press({ jump: true, jumpHeld: true }));
    run(w, 2, { jumpHeld: true });
    expect(w.knight.onGround).toBe(false);
  });

  it('a heavy tap still cleaves; holding heavy plants his feet and charges, and a full charge out-hits everything, to every shade in reach', () => {
    const w = arena();
    w.step(press({ heavy: true }));
    run(w, 40);
    expect(w.knight.move).toBe('heavy');
    expect(w.knight.state).not.toBe('charge');

    const w2 = arena();
    const a = dummy(w2, -12.6);
    const b = dummy(w2, -12.0);
    w2.step(press({ heavy: true, heavyHeld: true }));
    let full = false;
    const x0 = w2.knight.x;
    for (let i = 0; i < 90; i++) {
      w2.step(press({ heavyHeld: true, right: true })); // pushing right does not move him while he charges
      if (w2.events.some((e) => e.type === 'chargeFull')) full = true;
    }
    expect(w2.knight.state).toBe('charge');
    expect(Math.abs(w2.knight.x - x0)).toBeLessThan(0.05);
    expect(full).toBe(true);
    const before = [a.hp, b.hp];
    run(w2, 40); // release
    expect(w2.knight.move).toBe('charged');
    const dealt = [before[0] - a.hp, before[1] - b.hp];
    expect(Math.min(...dealt)).toBe(CFG.charge.maxDmg); // both shades, full damage
    expect(CFG.charge.maxDmg).toBeGreaterThan(Math.max(...CFG.combo.map((c) => c.dmg), CFG.heavy.dmg));
  });

  it('a short charge deals less than a full one, never less than a cleave', () => {
    const w = arena();
    const a = dummy(w, -12.6);
    w.step(press({ heavy: true, heavyHeld: true }));
    for (let i = 0; i < Math.ceil(CFG.charge.holdToCharge / CFG.dt) + 2; i++) w.step(press({ heavyHeld: true }));
    expect(w.knight.state).toBe('charge');
    const hp = a.hp;
    run(w, 40);
    const dealt = hp - a.hp;
    expect(dealt).toBeGreaterThanOrEqual(CFG.heavy.dmg);
    expect(dealt).toBeLessThan(CFG.charge.maxDmg);
  });

  it('health runs out -> a life breaks and he rises at full health; the last life is death', () => {
    const w = arena();
    const k = w.knight;
    const dummyShade = dummy(w, -10);
    expect(k.lives).toBe(CFG.knight.lives);
    const strike = () => {
      k.iframes = 0;
      (w as unknown as { hurtKnight: (x: number, d: number) => void }).hurtKnight(dummyShade.x, 30);
      w.step(NO_INPUT);
    };
    for (let i = 0; i < 3; i++) strike();
    expect(k.hp).toBe(CFG.knight.maxHp - 90);
    expect(k.lives).toBe(CFG.knight.lives);
    strike(); // 10 left, 30 dealt: the shard breaks
    expect(k.lives).toBe(CFG.knight.lives - 1);
    expect(k.hp).toBe(CFG.knight.maxHp);
    expect(k.state).not.toBe('dead');
    for (let n = 0; n < 50 && k.state !== 'dead'; n++) strike();
    expect(k.state).toBe('dead');
    expect(k.lives).toBe(0);
  });
});