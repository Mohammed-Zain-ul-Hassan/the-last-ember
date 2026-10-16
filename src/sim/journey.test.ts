import { describe, expect, it } from 'vitest';
import { CFG } from '../config';
import { CHAPTERS } from '../data/chapters';
import { LEVELS } from '../data/levels';
import { inArea, overlaps } from './geom';
import { botInput } from './bot';
import { NO_INPUT, World, type Input } from './world';

const press = (p: Partial<Input>): Input => ({ ...NO_INPUT, ...p });
const chapter = (level: string) => CHAPTERS.findIndex((c) => c.level === level);
const quiet = (w: World) => {
  w.spawning = false;
  w.knight.iframes = 1e9;
  return w;
};
const apex = (CFG.knight.jumpV * CFG.knight.jumpV) / (2 * -CFG.gravity);

describe('levels', () => {
  it('every hour has a level; every start is open ground inside the level', () => {
    for (const c of CHAPTERS) expect(LEVELS[c.level]).toBeDefined();
    for (const lv of Object.values(LEVELS)) {
      expect(inArea(lv.area, lv.start, lv.startZ, CFG.knight.r)).toBe(true);
      expect(lv.solids.some((s) => s.y0 < CFG.knight.h && overlaps(s, lv.start, lv.startZ, CFG.knight.r))).toBe(false);
    }
  });

  it('every raised walk can be reached: a step beneath it, or low enough to jump to', () => {
    for (const lv of Object.values(LEVELS)) {
      for (const s of lv.solids) {
        if (s.y1 <= apex) continue;
        if (s.y0 >= CFG.knight.h || s.tag === 'walk') {
          const reach = s.y1 <= apex || lv.solids.some((o) => o !== s && o.y0 === 0 && o.y1 < s.y1 && s.y1 - o.y1 < apex && Math.hypot(o.x - s.x, o.z - s.z) < Math.max(s.hw, s.hd) + 3);
          expect(reach, `${lv.id} solid at ${s.x},${s.z}`).toBe(true);
        }
      }
    }
  });

  it('the plaza: a jump from the step lands on the raised walk', () => {
    const w = quiet(new World(chapter('grounds'), 1));
    const step = w.solids.find((s) => s.tag === 'step' && s.x < 0)!;
    w.knight.x = step.x;
    w.knight.z = step.z;
    w.knight.y = step.y1;
    w.knight.onGround = true;
    w.step(press({ jump: true, jumpHeld: true, mx: -0.35 }));
    for (let i = 0; i < 60; i++) w.step(press({ jumpHeld: true, mx: -0.35 }));
    expect(w.knight.y).toBeCloseTo(2.7);
  });
});

describe('the road is passable', () => {
  it('every checkpoint is open ground on the centre line', () => {
    for (const lv of Object.values(LEVELS)) {
      for (const x of lv.checkpoints) expect(lv.solids.some((s) => s.y0 < CFG.knight.h && overlaps(s, x, 0, CFG.knight.r)), `${lv.id} @ ${x}`).toBe(false);
    }
  });

  for (const level of ['lowerCity', 'cathedral', 'cityWall']) {
    it(`the bot walks ${level} from start to end`, () => {
      const w = quiet(new World(chapter(level), 4));
      if (w.level.bossAt !== undefined) {
        w.spawning = true; // the Marshal must rise and fall
        w.spawnT = 1e9;
      }
      for (let i = 0; i < 60 * 150 && w.status === 'playing'; i++) {
        w.knight.iframes = 1e9;
        w.step(botInput(w));
      }
      expect(w.status, `${level}: stuck at x=${w.knight.x.toFixed(1)} z=${w.knight.z.toFixed(1)} y=${w.knight.y.toFixed(1)}`).toBe('cleared');
    });
  }
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
    w.knight.z = lit.z;
    w.step(NO_INPUT);
    expect(w.knight.ember).toBe(true);
    w.knight.x = w.hearthX;
    w.knight.z = w.hearthZ + 2;
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
    w.knight.z = 2.2;
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
    w.knight.z = 2;
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
    w.knight.z = boss.z;
    w.knight.y = boss.y;
    w.knight.yaw = 0;
    for (let i = 0; i < 40; i++) w.step(press({ heavy: i === 0, aim: 0 }));
    expect(w.bossDone).toBe(true);
    w.knight.x = (w.level.end as number) - 0.3;
    w.step(NO_INPUT);
    expect(w.status).toBe('cleared');
  });
});

describe('shades drift', () => {
  it('float up after the knight onto a raised walk, and over low ruins', () => {
    const w = quiet(new World(chapter('grounds'), 1));
    const walk = w.solids.find((s) => s.tag === 'walk')!;
    w.knight.x = walk.x;
    w.knight.z = walk.z;
    w.knight.y = walk.y1;
    w.knight.onGround = true;
    const s = w.spawnShade(walk.x + 2.5, walk.z);
    s.state = 'walk';
    s.cd = 1e9;
    for (let i = 0; i < 120; i++) w.step(NO_INPUT);
    expect(s.y).toBeGreaterThan(walk.y1 - 0.2);
  });
});
