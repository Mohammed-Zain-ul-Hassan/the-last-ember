import { it } from 'vitest';
import { play } from './bot.test';
import { MARKET } from './data/market';
import { MARKET_SCRIPT } from './scripts/market';
it('r', () => { const { city, bot } = play(MARKET, MARKET_SCRIPT); console.log(JSON.stringify({ st: city.s.status, deaths: city.s.deaths, x: city.s.body.x.toFixed(1), vigor: city.s.flame.vigor.toFixed(2), log: bot.log })); });
