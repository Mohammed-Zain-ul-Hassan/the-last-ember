// Full-resolution screenshots (canvas + DOM UI) of scripted moments, for visual review.
//   node trailer/scripts/shot.mjs <scene...|all>     -> docs/critique/<scene>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.GAME_URL ?? 'http://localhost:5173/';
mkdirSync('docs/critique', { recursive: true });

// Each scene runs in the page with G = window.__game (manual clock). key(code) taps a key.
const SCENES = {
  combat: {
    q: 'seed=5&chapter=1',
    js: `G.skipTo(1); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 150);
      const w = G.world; w.shades.length = 0; w.knight.x = -3.2; w.knight.facing = 1;
      const a = w.spawnShade(-1.5); a.state = 'walk'; a.cd = 99; a.hp = 9; a.maxHp = 9;
      const b = w.spawnShade(1.4); b.state = 'walk'; b.cd = 99;
      G.tick(16.67, 25);
      for (let i = 0; i < 4; i++) { key(i === 3 ? 'KeyK' : 'KeyJ'); G.tick(16.67, 9); }
      G.tick(16.67, 4);`,
  },
  shade_closeup: {
    q: 'seed=6&chapter=1',
    js: `G.skipTo(1); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 150);
      const w = G.world; w.shades.length = 0; w.knight.x = -6; w.knight.facing = 1;
      const a = w.spawnShade(-2.2); a.state = 'walk'; a.cd = 99; a.facing = -1;
      const b = w.spawnShade(-0.6); b.state = 'windup'; b.stateT = 0.3; b.cd = 99; b.facing = -1; b.target = 'knight';
      G.tick(16.67, 30);
      G.rig.fitSpan = false; G.rig.snap({ yaw: 0.35, height: 1.7, dist: 6.5, lookY: 1.5, fov: 34 }); G.rig.x = -1.6; G.tick(0);`,
  },
  masonry: {
    q: 'seed=7&chapter=0',
    js: `G.skipTo(0); G.tick(16, 30); G.play(); G.tick(16.67, 150); G.world.shades.length = 0; G.world.knight.x = -9;
      G.rig.fitSpan = false; G.rig.snap({ yaw: 0.5, height: 2.4, dist: 11, lookY: 2.2, fov: 36 }); G.rig.x = -4; G.tick(0);`,
  },
  plunge: {
    q: 'seed=9&chapter=1',
    js: `G.skipTo(1); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 150);
      const w = G.world; w.shades.length = 0; w.knight.x = -4.2; w.knight.facing = 1;
      for (const x of [-5.6, -3.2, -2.6]) { const s = w.spawnShade(x); s.state = 'walk'; s.cd = 99; s.hp = s.maxHp = 9; s.speed = 0; }
      G.tick(16.67, 20);
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      G.tick(16.67, 16);
      key('KeyK');
      for (let i = 0; i < 60 && !w.events.some((e) => e.type === 'slam'); i++) G.tick(16.67);
      dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
      G.tick(16.67, 5);`,
  },
  grounds_wide: {
    q: 'seed=12&chapter=0',
    js: `G.skipTo(0); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 200);
      const w = G.world; w.time = w.chapter.duration * 0.4; G.tick(16.67, 2); w.knight.x = -24; w.knight.y = 2.7; w.knight.facing = -1; G.tick(16.67, 90);`,
  },
  lower_city: {
    q: 'seed=13&chapter=3&demo=1',
    js: `G.skipTo(3); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 40; G.world.knight.y = 3.1; G.tick(16.67, 200);`,
  },
  nave: {
    q: 'seed=14&chapter=4&demo=1',
    js: `G.skipTo(4); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 18; G.tick(16.67, 160);`,
  },
  apse_boss: {
    q: 'seed=15&chapter=4&demo=1',
    js: `G.skipTo(4); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 76; G.tick(16.67, 240);`,
  },
  city_wall: {
    q: 'seed=16&chapter=5&demo=1',
    js: `G.skipTo(5); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 60; G.tick(16.67, 200);`,
  },
  reveal_market: {
    q: 'seed=21&chapter=3&demo=1',
    js: `G.skipTo(3); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 47.5; G.world.knight.y = 0; G.tick(16.67, 100);`,
  },
  reveal_apse: {
    q: 'seed=22&chapter=4&demo=1',
    js: `G.skipTo(4); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 65.5; G.world.knight.y = 0; G.tick(16.67, 95);`,
  },
  reveal_gate: {
    q: 'seed=23&chapter=5&demo=1',
    js: `G.skipTo(5); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 63.5; G.world.knight.y = 0; G.tick(16.67, 100);`,
  },
  nave_dress: {
    q: 'seed=24&chapter=4&demo=1',
    js: `G.skipTo(4); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 60); G.world.knight.x = 44; G.tick(16.67, 260);`,
  },
  boss: {
    q: 'seed=8&chapter=4',
    js: `G.skipTo(4); G.tick(16, 30); G.play(); G.godMode = true; G.tick(16.67, 120);
      const w = G.world; w.shades.length = 0; w.knight.x = -2.5; w.knight.facing = 1;
      const s = w.spawnShade(0.6, true); s.state = 'walk'; s.cd = 99; G.tick(16.67, 30);
      for (let i = 0; i < 6; i++) { key(i % 3 === 2 ? 'KeyK' : 'KeyJ'); G.tick(16.67, 10); }
      G.tick(16.67, 3);`,
  },
};

const want = process.argv.slice(2);
const names = !want.length || want[0] === 'all' ? Object.keys(SCENES) : want;
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const name of names) {
  const sc = SCENES[name];
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?debug=1&${sc.q}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  await page.addStyleTag({ content: '#hud, #card, #title, #choice, #worldui .pop, #combo, #bossbar { transition: none !important; } #title { display: none !important; }' });
  const info = await page.evaluate((js) => {
    const G = window.__game;
    G.manual = true;
    const key = (c) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    new Function('G', 'key', js)(G, key);
    return { state: G.state, pops: [...document.querySelectorAll('.pop')].map((p) => p.textContent), bars: document.querySelectorAll('.ebar').length };
  }, sc.js);
  await page.screenshot({ path: `docs/critique/${name}.png` });
  console.log(JSON.stringify({ name, ...info, errors }));
  await page.close();
}
await browser.close();
