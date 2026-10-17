import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { box, cyl } from './geom';
import { inShadow, lightAt } from './light';
import { NO_INPUT, World, type Input } from './world';

const press = (p: Partial<Input>): Input => ({ ...NO_INPUT, ...p });

describe('light', () => {
  const light = { x: 0, y: 2.6, z: 0, radius: 12 };
  /** Length of the shadow behind a 1 m wall at x = 5.5, measured along +x. */
  const shadowEnd = (y: number) => {
    const wall = [box(5.5, 0, 1.2, 1.6, 1.0)];
    let x = 6.2;
    while (x < 40 && inShadow(x, 0, { ...light, y }, wall)) x += 0.05;
    return x;
  };

  it('casts a finite shadow behind a ruin shorter than the flame, longer as the flame sinks', () => {
    const hi = shadowEnd(2.6);
    expect(hi).toBeCloseTo((6.1 * 2.6) / 1.6, 0);
    expect(shadowEnd(1.6)).toBeGreaterThan(hi + 2);
  });

  it('a column taller than the flame shadows everything behind it, and only behind it', () => {
    const col = [cyl(-4, 0, 0.5, 6)];
    expect(inShadow(-20, 0, light, col)).toBe(true);
    expect(inShadow(-20, 3, light, col)).toBe(false); // off to the side of the shadow
    expect(inShadow(4, 0, light, col)).toBe(false); // in front of it
  });

  it('is zero in shadow and beyond the radius, highest at the fire', () => {
    const solids = [box(5, 0, 1, 1, 1)];
    expect(lightAt(0, 0, light, solids)).toBe(1);
    expect(lightAt(6, 0, light, solids)).toBe(0);
    expect(lightAt(0, -13, light, solids)).toBe(0);
    expect(lightAt(-3, 2, light, solids)).toBeGreaterThan(0);
  });

  it('the hearth does not shadow its own light', () => {
    const w = new World(0, 1);
    expect(w.lightAt(w.hearthX + 1.8, w.hearthZ)).toBeGreaterThan(0);
  });
});

describe('world', () => {
  it('only spawns shades in darkness, never inside a ruin', () => {
    const w = new World(1, 42);
    for (let i = 0; i < 200; i++) {
      const [x, z] = w.pickSpawn();
      expect(w.lightAt(x, z)).toBe(0);
      expect(w.floorAt(x, z, 0.3, 0)).toBe(0);
    }
  });

  it('some shades rise in the shadows cast by ruins, inside the firelight', () => {
    const w = new World(0, 3);
    let pockets = 0;
    for (let i = 0; i < 200; i++) {
      const [x, z] = w.pickSpawn();
      if (Math.hypot(x - w.light.x, z - w.light.z) < w.light.radius) pockets++;
    }
    expect(pockets).toBeGreaterThan(20);
  });

  it('a 3-hit combo kills a 3 hp shade standing in front of the knight', () => {
    const w = new World(0, 1);
    w.knight.x = 0;
    w.knight.z = 9.5;
    w.knight.yaw = 0;
    const s = w.spawnShade(1.4, 9.5);
    s.state = 'walk';
    s.cd = 99; // never attacks
    for (let i = 0; i < 120 && (s.state as string) !== 'dead'; i++) w.step(press({ attack: i % 6 === 0 }));
    expect(s.state).toBe('dead');
    expect(w.kills).toBe(1);
  });

  it('dash gives invulnerability frames and goes where he runs', () => {
    const w = new World(0, 1);
    w.step(press({ dash: true, mx: 1, mz: 0 }));
    expect(w.knight.state).toBe('dash');
    expect(w.knight.iframes).toBeGreaterThan(0);
    expect(w.knight.vx).toBeGreaterThan(CFG.knight.speed);
    expect(Math.abs(w.knight.vz)).toBeLessThan(0.01);
  });

  it('runs where the input points and turns to face it', () => {
    const w = new World(0, 1);
    const z0 = w.knight.z;
    for (let i = 0; i < 30; i++) w.step(press({ mx: 0, mz: 1 }));
    expect(w.knight.z).toBeGreaterThan(z0 + 1.5);
    expect(Math.cos(w.knight.yaw - Math.PI / 2)).toBeGreaterThan(0.99);
  });

  it('backpedals: S steps him back along the camera, still facing forward, slower than a run', () => {
    const w = new World(0, 1);
    w.knight.yaw = 0;
    const x0 = w.knight.x;
    for (let i = 0; i < 20; i++) w.step(press({ mx: -1, mz: 0, aim: 0, backpedal: true }));
    expect(w.knight.x).toBeLessThan(x0 - 0.8);
    expect(Math.cos(w.knight.yaw)).toBeGreaterThan(0.99);
    expect(Math.hypot(w.knight.vx, w.knight.vz)).toBeLessThanOrEqual(CFG.knight.speed * CFG.knight.backpedal + 1e-6);
  });

  it('standing still, the turn keys turn him with the camera', () => {
    const w = new World(0, 1);
    w.knight.yaw = 0;
    for (let i = 0; i < 30; i++) w.step(press({ aim: 1.2, turning: true }));
    expect(Math.cos(w.knight.yaw - 1.2)).toBeGreaterThan(0.99);
    expect(Math.hypot(w.knight.vx, w.knight.vz)).toBeLessThan(0.01);
  });

  it('a shadow-step while backpedalling is a backstep: back, still facing forward', () => {
    const w = new World(0, 1);
    w.knight.yaw = 0;
    w.step(press({ dash: true, mx: -1, mz: 0, aim: 0, backpedal: true }));
    expect(w.knight.state).toBe('dash');
    expect(w.knight.vx).toBeLessThan(-CFG.knight.speed);
    expect(Math.cos(w.knight.yaw)).toBeGreaterThan(0.99);
    for (let i = 0; i < 30 && w.knight.state === 'dash'; i++) w.step(press({ mx: -1, mz: 0, aim: 0, backpedal: true }));
    expect(w.knight.vx).toBeLessThan(0); // comes out of it still moving back, not flung forward
  });

  it('a dash with a turn key and no W / S is a sidestep: sideways, still facing forward', () => {
    const w = new World(0, 1);
    w.knight.yaw = 0;
    w.step(press({ dash: true, aim: 0, dashSide: 1 }));
    expect(w.knight.state).toBe('dash');
    expect(w.knight.vz).toBeGreaterThan(CFG.knight.speed); // +z is his right when he faces +x
    expect(Math.abs(w.knight.vx)).toBeLessThan(0.01);
    expect(Math.cos(w.knight.yaw)).toBeGreaterThan(0.99);
  });

  it('loses when the hearth burns out', () => {
    const w = new World(0, 1);
    w.hearthHp = 1;
    const s = w.spawnShade(2.4, 0.5);
    s.state = 'walk';
    s.hp = 999;
    w.knight.x = -15;
    w.knight.z = 0;
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
      for (let i = 0; i < 1200; i++) w.step(press({ mx: i % 90 < 45 ? 1 : -1, mz: i % 70 < 35 ? 0.5 : -0.5, attack: i % 11 === 0 }));
      return JSON.stringify([w.knight.x, w.knight.z, w.hearthHp, w.kills, w.shades.map((s) => [s.id, s.x.toFixed(4), s.z.toFixed(4)])]);
    };
    expect(run()).toBe(run());
  });

  // ------------------------------------------------------------- moves (on open ground: no ruins, out of the light)
  const OX = -8; // shifts the side-view numbers below out of the hearth's reach
  const arena = (chapter = 0) => {
    const w = new World(chapter, 3);
    w.solids = [];
    w.knight.x = -14 + OX;
    w.knight.z = 0;
    w.knight.yaw = 0;
    w.knight.iframes = 1e9;
    w.spawnT = 1e9; // no random spawns
    return w;
  };
  const dummy = (w: World, x: number, z = 0, hp = 50) => {
    const s = w.spawnShade(x + OX, z);
    s.state = 'walk';
    s.cd = 1e9;
    s.hp = s.maxHp = hp;
    s.speed = 0;
    return s;
  };
  const run = (w: World, frames: number, inp: Partial<Input> = {}) => {
    for (let i = 0; i < frames; i++) w.step(press(i === 0 ? inp : { mx: inp.mx ?? 0, mz: inp.mz ?? 0, jumpHeld: !!inp.jumpHeld, aim: inp.aim }));
  };

  it('light attacks hit a single target, even with two shades in reach', () => {
    const w = arena();
    const a = dummy(w, -12.8);
    const b = dummy(w, -12.4, 0.3);
    run(w, 30, { attack: true, aim: 0 });
    const hit = [a, b].filter((s) => s.hp < 50);
    expect(hit.length).toBe(1);
    expect(hit[0]).toBe(a); // the nearest one
  });

  it('a light attack does not reach a shade behind him, but soft aim turns it toward one off to the side', () => {
    const w = arena();
    const behind = dummy(w, -15.6);
    run(w, 30, { attack: true, aim: 0 });
    expect(behind.hp).toBe(50);
    const w2 = arena();
    const side = dummy(w2, -13.2, 1.1); // ~54 degrees off where the camera looks
    run(w2, 30, { attack: true, aim: 0 });
    expect(side.hp).toBeLessThan(50);
  });

  it('heavy attacks are area of effect, front and behind', () => {
    const w = arena();
    const front1 = dummy(w, -12.6);
    const front2 = dummy(w, -11.6, 0.6);
    const behind = dummy(w, -15);
    run(w, 60, { heavy: true, aim: 0 });
    expect([front1, front2, behind].every((s) => s.hp < 50)).toBe(true);
  });

  it('attacking in the air is an aerial strike; heavy in the air is a plunge that slams a ring on landing', () => {
    const w = arena();
    run(w, 1, { jump: true, jumpHeld: true });
    run(w, 12, { jumpHeld: true });
    expect(w.knight.onGround).toBe(false);
    run(w, 1, { attack: true });
    expect(w.knight.move).toBe('air');
    const w2 = arena();
    const l = dummy(w2, -16);
    const r = dummy(w2, -14, 2.2);
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
    const b = dummy(w, -11, 0.4);
    const c = dummy(w, -9.5, -0.3);
    w.step(press({ dash: true, mx: 1 }));
    run(w, 3, { mx: 1 });
    w.step(press({ attack: true, mx: 1 }));
    expect(w.knight.move).toBe('dashStrike');
    run(w, 40);
    expect([a, b, c].filter((s) => s.hp < 50).length).toBeGreaterThanOrEqual(2);
  });

  it('attacking at full run is a lunge', () => {
    const w = arena();
    run(w, 12, { mx: 1 });
    w.step(press({ mx: 1, attack: true }));
    expect(w.knight.move).toBe('lunge');
  });

  it('walks off a low step without leaving the ground', () => {
    const w = arena();
    const k = w.knight;
    w.solids = [box(k.x, k.z, 3, 3, 0.3)];
    k.y = 0.3;
    k.onGround = true;
    const states = new Set<string>();
    for (let i = 0; i < 40; i++) {
      w.step(press({ mx: 1 }));
      states.add(k.state);
    }
    expect(k.y).toBe(0);
    expect(states.has('air')).toBe(false);
    expect(w.events.some((e) => e.type === 'land')).toBe(false);
  });

  it('a wall soaks up his speed instead of letting him run on the spot', () => {
    const w = arena();
    const k = w.knight;
    w.solids = [box(k.x + 1.2, k.z, 0.6, 6, 3)];
    run(w, 40, { mx: 1 });
    expect(Math.abs(k.vx)).toBeLessThan(0.5);
  });

  it('an attack pressed during a lunge is not swallowed: it swings once the lunge ends', () => {
    const w = arena();
    run(w, 12, { mx: 1 });
    w.step(press({ mx: 1, attack: true }));
    expect(w.knight.move).toBe('lunge');
    const id = w.knight.swingId;
    w.step(press({ mx: 1, attack: true }));
    for (let i = 0; i < 60 && w.knight.swingId === id; i++) w.step(press({ mx: 0 }));
    expect(w.knight.swingId).toBe(id + 1);
  });

  it('heavy pressed mid-combo comes out as a heavy, not another light', () => {
    const w = arena();
    w.step(press({ attack: true }));
    w.step(press({ heavy: true }));
    for (let i = 0; i < 60 && w.knight.move === 'light'; i++) w.step(press({}));
    expect(w.knight.move).toBe('heavy');
  });

  it('a dash pressed just before the cooldown ends still comes out', () => {
    const w = arena();
    w.step(press({ dash: true, mx: 1 }));
    expect(w.knight.state).toBe('dash');
    let i = 0;
    while (w.knight.dashCd > CFG.knight.dashBuffer * 0.5 && i++ < 200) w.step(press({}));
    w.step(press({ dash: true, mx: 1 }));
    expect(w.knight.state).not.toBe('dash');
    for (let j = 0; j < 12 && w.knight.state !== 'dash'; j++) w.step(press({ mx: 1 }));
    expect(w.knight.state).toBe('dash');
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

  it('a press during hit-stop is kept for the next real step, not swallowed', () => {
    const w = arena();
    w.hitstop = 5;
    w.step(press({ jump: true, jumpHeld: true }));
    for (let i = 0; i < 4; i++) w.step(press({ jumpHeld: true }));
    expect(w.knight.onGround).toBe(true); // still frozen
    run(w, 3, { jumpHeld: true });
    expect(w.knight.onGround).toBe(false);
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
    const b = dummy(w2, -12.0, 0.5);
    w2.step(press({ heavy: true, heavyHeld: true, aim: 0 }));
    let full = false;
    const x0 = w2.knight.x;
    const z0 = w2.knight.z;
    for (let i = 0; i < 90; i++) {
      w2.step(press({ heavyHeld: true, mx: 0.2, mz: 0.1, aim: 0 })); // pushing does not move him while he charges
      if (w2.events.some((e) => e.type === 'chargeFull')) full = true;
    }
    expect(w2.knight.state).toBe('charge');
    expect(Math.hypot(w2.knight.x - x0, w2.knight.z - z0)).toBeLessThan(0.05);
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
      (w as unknown as { hurtKnight: (x: number, z: number, d: number) => void }).hurtKnight(dummyShade.x, dummyShade.z, 30);
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

  it('a shade strikes what is in front of it: stepping around behind it dodges', () => {
    const w = arena();
    w.knight.iframes = 0;
    const s = dummy(w, -13);
    s.yaw = Math.PI; // facing him
    const strike = (w as unknown as { strikeLands: (s: unknown, r: number, h: number) => boolean }).strikeLands.bind(w);
    expect(strike(s, 1.8, 1.6)).toBe(true);
    s.yaw = 0; // facing away
    expect(strike(s, 1.8, 1.6)).toBe(false);
  });
});

describe('collision', () => {
  const open = () => {
    const w = new World(0, 1);
    w.spawning = false;
    w.knight.iframes = 1e9;
    w.knight.x = 0;
    w.knight.z = 0;
    return w;
  };

  it('a column stops him; he slides around it', () => {
    const w = open();
    w.solids = [cyl(3, 0, 0.5, 5)];
    for (let i = 0; i < 60; i++) w.step(press({ mx: 1 }));
    expect(w.knight.x).toBeLessThan(3 - 0.5 - CFG.knight.r + 0.01);
    const w2 = open();
    w2.solids = [cyl(3, 0.3, 0.5, 5)];
    for (let i = 0; i < 120; i++) w2.step(press({ mx: 1 }));
    expect(w2.knight.x).toBeGreaterThan(4); // slid past
  });

  it('a rotated wall stops him from either side', () => {
    const w = open();
    w.solids = [box(3, 0, 4, 0.8, 1.5, 0.7)];
    for (let i = 0; i < 90; i++) w.step(press({ mx: 1 }));
    expect(w.solids.some((s) => s.kind === 'box')).toBe(true);
    // never ends up inside the wall
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    const lx = (w.knight.x - 3) * c - w.knight.z * s;
    const lz = (w.knight.x - 3) * s + w.knight.z * c;
    expect(Math.abs(lx) > 2 + CFG.knight.r - 0.02 || Math.abs(lz) > 0.4 + CFG.knight.r - 0.02).toBe(true);
  });

  it('walks up a low step, jumps onto a high one, and lands on top', () => {
    const w = open();
    w.solids = [box(2, 0, 3, 3, 0.3)];
    for (let i = 0; i < 20; i++) w.step(press({ mx: 1 }));
    expect(w.knight.y).toBeCloseTo(0.3);
    const w2 = open();
    w2.solids = [box(2.5, 0, 2, 3, 1.3)];
    for (let i = 0; i < 20; i++) w2.step(press({ mx: 1 }));
    expect(w2.knight.y).toBe(0); // blocked at the foot
    w2.step(press({ mx: 1, jump: true, jumpHeld: true }));
    for (let i = 0; i < 60; i++) w2.step(press({ mx: 0.3, jumpHeld: true }));
    expect(w2.knight.y).toBeCloseTo(1.3);
    expect(w2.knight.onGround).toBe(true);
  });

  it('he can walk under a raised walk', () => {
    const w = open();
    w.solids = [box(3, 0, 3, 3, 0.36, 0, 2.34)];
    for (let i = 0; i < 50; i++) w.step(press({ mx: 1 }));
    expect(w.knight.x).toBeGreaterThan(4);
    expect(w.knight.y).toBe(0);
  });

  it('stays inside the plaza', () => {
    const w = open();
    w.solids = [];
    for (let i = 0; i < 60 * 8; i++) w.step(press({ mx: 1 }));
    expect(Math.hypot(w.knight.x, w.knight.z)).toBeLessThanOrEqual(29.5);
  });
});
