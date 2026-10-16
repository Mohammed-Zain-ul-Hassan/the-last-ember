import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { CHAPTERS } from '../data/chapters';
import { LEVELS } from '../data/levels';
import { NO_INPUT, World, type Input } from './world';

const press = (p: Partial<Input>): Input => ({ ...NO_INPUT, ...p });
const chapter = (level: string) => CHAPTERS.findIndex((c) => c.level === level);
const quiet = (w: World) => {
  w.spawning = false;
  w.knight.iframes = 1e9;
  return w;
};

describe('levels', () => {
  it('every hour has a level, and every ground crossing is jumpable', () => {
    for (const c of CHAPTERS) expect(LEVELS[c.level]).toBeDefined();
    const apex = (CFG.knight.jumpV * CFG.knight.jumpV) / (2 * -CFG.gravity);
    for (const lv of Object.values(LEVELS)) {
      for (const w of lv.walls) {
        // tall steps must have a lower neighbour to climb from
        if (w.h > apex) expect(lv.walls.some((o) => o !== w && Math.abs(o.x - w.x) < 2 && o.h < w.h && w.h - o.h < apex)).toBe(true);
      }
    }
  });

  it('one-way platforms: land from above, drop through with down + jump', () => {
    const w = quiet(new World(chapter('grounds'), 1));
    const p = w.platforms[0];
    w.knight.x = (p.x0 + p.x1) / 2;
    w.knight.y = p.y + 1;
    for (let i = 0; i < 60; i++) w.step(NO_INPUT);
    expect(w.knight.y).toBeCloseTo(p.y);
    expect(w.knight.onGround).toBe(true);
    w.step(press({ down: true, jump: true, jumpHeld: true }));
    for (let i = 0; i < 90; i++) w.step(NO_INPUT);
    expect(w.knight.y).toBeLessThan(p.y);
  });

  it('every platform can be reached: low enough to jump to, or a wall step beneath it', () => {
    const apex = (CFG.knight.jumpV * CFG.knight.jumpV) / (2 * -CFG.gravity) - 0.2;
    for (const lv of Object.values(LEVELS)) {
      for (const p of lv.platforms) {
        const step = lv.walls.some((w) => w.x + w.w / 2 >= p.x0 - 1.5 && w.x - w.w / 2 <= p.x1 + 1.5 && p.y - w.h <= apex);
        expect(p.y <= apex || step, `${lv.id} platform ${p.x0}..${p.x1}`).toBe(true);
      }
    }
  });

  it('jumping up through a platform from a wall step lands on top', () => {
    const w = quiet(new World(chapter('grounds'), 1));
    const p = w.platforms[0];
    const step = w.walls.find((o) => o.x > p.x0 && o.x < p.x1)!;
    w.knight.x = step.x;
    w.knight.y = step.h;
    for (let i = 0; i < 5; i++) w.step(NO_INPUT);
    w.step(press({ jump: true, jumpHeld: true }));
    for (let i = 0; i < 90; i++) w.step(press({ jumpHeld: true }));
    expect(w.knight.y).toBeCloseTo(p.y);
  });
});

describe('embers', () => {
  it('a shrine lights during the hour; carrying its ember to the hearth feeds the fire', () => {
    const w = quiet(new World(chapter('grounds'), 4));
    w.hearthHp = 40;
    w.time = w.chapter.duration * 0.1;
    w.step(NO_INPUT);
    const lit = w.shrines.find((s) => s.active)!;
    expect(lit).toBeDefined();
    w.knight.x = lit.x;
    w.knight.y = lit.y;
    w.step(NO_INPUT);
    expect(w.knight.ember).toBe(true);
    w.knight.x = w.hearthX + 1;
    w.knight.y = 0;
    w.step(NO_INPUT);
    expect(w.knight.ember).toBe(false);
    expect(w.hearthHp).toBe(40 + CFG.hearth.emberHeal);
  });
});

describe('the road', () => {
  it('the hour is distance: reaching the gate clears it, and braziers are lit on the way', () => {
    const w = quiet(new World(chapter('lowerCity'), 2));
    expect(w.road).toBe(true);
    expect(w.progress).toBe(0);
    let lit = 0;
    w.knight.x = w.level.checkpoints[0] + 0.5;
    w.step(NO_INPUT);
    lit += w.events.filter((e) => e.type === 'checkpoint').length;
    expect(lit).toBe(1);
    expect(w.respawnX).toBe(w.level.checkpoints[0]);
    w.knight.x = (w.level.end as number) - 0.2;
    w.step(NO_INPUT);
    expect(w.status).toBe('cleared');
  });

  it('rising again at a checkpoint starts there', () => {
    const w = new World(chapter('lowerCity'), 2, { startX: 34, checkpointsLit: 1 });
    expect(w.knight.x).toBe(34);
    expect(w.respawnX).toBe(34);
  });

  it('the cathedral doors stay shut until the Hollow Marshal falls', () => {
    const w = quiet(new World(chapter('cathedral'), 3));
    w.spawning = true;
    w.spawnT = 1e9; // only the boss
    w.knight.x = (w.level.bossAt as number) + 0.5;
    w.step(NO_INPUT);
    const boss = w.shades.find((s) => s.big)!;
    expect(boss).toBeDefined();
    w.knight.x = (w.level.end as number) + 5;
    w.step(NO_INPUT);
    expect(w.knight.x).toBeLessThan((w.level.end as number) - 2);
    expect(w.status).toBe('playing');
    boss.hp = 0.1;
    boss.state = 'walk';
    boss.cd = 1e9;
    w.knight.x = boss.x - 1.5;
    w.knight.facing = 1;
    for (let i = 0; i < 40; i++) w.step(press({ heavy: i === 0 }));
    expect(w.bossDone).toBe(true);
    w.knight.x = (w.level.end as number) - 0.3;
    w.step(NO_INPUT);
    expect(w.status).toBe('cleared');
  });
});

describe('shades drift', () => {
  it('float up after the knight onto a ledge', () => {
    const w = quiet(new World(chapter('grounds'), 1));
    const p = w.platforms[0];
    w.knight.x = (p.x0 + p.x1) / 2;
    w.knight.y = p.y;
    w.knight.onGround = true;
    const s = w.spawnShade(w.knight.x + 2);
    s.state = 'walk';
    s.cd = 1e9;
    for (let i = 0; i < 120; i++) w.step(NO_INPUT);
    expect(s.y).toBeGreaterThan(p.y - 0.2);
  });
});
