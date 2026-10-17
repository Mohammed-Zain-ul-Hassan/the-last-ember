import { describe, expect, it } from 'vitest';
import { City, DT, NO_INPUT } from './sim/city';
import { Bot, quickScript, type Goal } from './bot';
import { GATE_WARD } from './data/gateWard';
import { MARKET } from './data/market';
import { TEMPLE } from './data/temple';
import { LIBRARY } from './data/library';
import { GATE_SCRIPT } from './scripts/gateWard';
import { MARKET_SCRIPT } from './scripts/market';
import { TEMPLE_SCRIPT } from './scripts/temple';
import { LIBRARY_SCRIPT } from './scripts/library';
import { HEART_D } from './data/heart';
import { HEART_SCRIPT } from './scripts/heart';
import { WORDS_BY_DISTRICT } from '../data/stillCity';
import type { District } from './sim/types';

/** Play a district by script through the sim; report where it got to. */
export function play(d: District, script: Goal[], maxS = 600, words = new Array(36).fill(false)): { city: City; bot: Bot; t: number } {
  const city = new City(d, words);
  const bot = new Bot(script, d.start.yaw);
  let t = 0;
  while (t < maxS && city.s.status !== 'exit') {
    const o = bot.step(city, DT);
    city.step({ ...NO_INPUT, ...o.input, yaw: o.yaw, pitch: o.pitch, cam: [city.s.body.x, 4, city.s.body.z], frustum: [] });
    t += DT;
    if (bot.done && (city.s.status as string) !== 'exit') break;
  }
  return { city, bot, t };
}

const RUNS: [District, Goal[]][] = [
  [GATE_WARD, GATE_SCRIPT],
  [MARKET, MARKET_SCRIPT],
  [TEMPLE, TEMPLE_SCRIPT],
  [LIBRARY, LIBRARY_SCRIPT],
];

describe('every district, played start to finish by its script', () => {
  for (const [d, script] of RUNS)
    it(`${d.name}: reaches the way out with every Last Word heard, never dying`, () => {
      const { city, bot } = play(d, script);
      expect(bot.log).toEqual([]);
      expect(city.s.status).toBe('exit');
      expect(city.s.deaths).toBe(0);
      const [a, b] = WORDS_BY_DISTRICT[d.index];
      expect(city.s.words.slice(a, b).every(Boolean)).toBe(true);
    });

  it('The Heart: all five plates, the ring opens, he reaches the centre with every Last Word heard', () => {
    const { city, bot } = play(HEART_D, HEART_SCRIPT);
    expect(bot.log).toEqual([]);
    expect(city.flag('plates')).toBe(true);
    expect(city.flag('heart')).toBe(true);
    expect(city.s.deaths).toBe(0);
    expect(city.s.words.slice(26, 35).every(Boolean)).toBe(true);
  });

  it('the quick (main path) scripts still play every district through', () => {
    for (const [d, script] of [...RUNS, [HEART_D, HEART_SCRIPT] as [District, Goal[]]]) {
      const { city, bot } = play(d, quickScript(script, d.figures, ['old', 'dancer', 'twin']));
      expect(bot.log).toEqual([]);
      expect(city.s.status === 'exit' || city.flag('heart')).toBe(true);
    }
  });

  it('the maze will not let a low flame out', () => {
    const low = LIBRARY_SCRIPT.map((g) => ('go' in g && g.pitch === -0.3 ? { ...g, pitch: 0.5 } : g));
    const { city } = play(LIBRARY, low, 400);
    expect(city.s.status).not.toBe('exit');
    expect(city.s.body.x).toBeLessThan(62);
  });

  it('the canal cannot be walked into without a shadow under him', () => {
    const naive: Goal[] = [{ go: [37, 0] }, { go: [46, 0], pitch: 0.35 }];
    const { city } = play(MARKET, [{ rest: true }, { go: [31, 0] }, ...naive], 200);
    // the shutter is shut: he never even reaches the canal without the scales
    expect(city.s.body.x).toBeLessThan(32);
  });
});
