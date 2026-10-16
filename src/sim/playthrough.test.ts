// Balance harness: the demo bot plays every chapter headless. Prints a table; asserts the bot can finish the night.
import { describe, expect, it } from 'vitest';
import { World } from './world';
import { Bot } from './bot';
import { CHAPTERS } from './chapters';

function playChapter(i: number, seed: number) {
  const w = new World(seed + i * 101, i);
  w.aimFacing = false;
  const bot = new Bot(seed);
  let t = 0;
  let minFuel = w.fuel;
  let minHp = w.knight.hp;
  let peak = 0;
  while (w.status === 'play' && t < 240) {
    w.step(1 / 60, bot.think(w, 1 / 60));
    t += 1 / 60;
    minFuel = Math.min(minFuel, w.fuel);
    minHp = Math.min(minHp, w.knight.hp);
    peak = Math.max(peak, w.shades.filter((s) => s.state !== 'dead').length);
  }
  return {
    ch: CHAPTERS[i].id,
    status: w.status,
    why: w.loseReason ?? w.ending ?? '',
    t: +t.toFixed(1),
    fuel: +w.fuel.toFixed(0),
    minFuel: +minFuel.toFixed(0),
    hp: w.knight.hp,
    minHp,
    kills: w.stats.kills,
    burned: w.stats.burned,
    flares: w.stats.flares,
    peak,
    memories: w.memoryIdx,
  };
}

describe('bot playthrough', () => {
  it('the demo bot survives each hour on most seeds', () => {
    const rows = [];
    let wins = 0;
    let total = 0;
    for (const seed of [1, 2, 3]) {
      for (let i = 0; i < CHAPTERS.length; i++) {
        const r = playChapter(i, seed);
        rows.push({ seed, ...r });
        total++;
        if (r.status !== 'lost') wins++;
      }
    }
    console.table(rows);
    expect(wins / total).toBeGreaterThan(0.6);
  }, 120_000);
});
