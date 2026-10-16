// Records deterministic trailer clips into trailer/raw/ (needs the dev server: preview_start {name: "game"}).
//
//   node trailer/scripts/drive.mjs list              show the clip list
//   node trailer/scripts/drive.mjs <clip...|all>     record clips (canvas only: no HUD or cards, 1920x1080 @ 60 fps)
//
// Each clip = a URL + an in-page setup script + a duration. The game is stepped exactly 1/60 s per frame
// (window.__trailer.take), so the same clip re-records identically and quality never depends on machine speed.
import { chromium } from 'playwright';

const BASE = process.env.GAME_URL ?? 'http://localhost:5173/';

// setup runs in the page before recording; `T` is window.__trailer, `G` is window.__game
const CLIPS = {
  '01_title_oath': { q: 'seed=3', secs: 14, setup: 'T.skip(1.5)', note: 'Title: knight kneeling at the hearth, slow camera drift' },
  '02_7pm_sunset_combat': { q: 'demo=1&seed=4&chapter=0', secs: 34, setup: 'T.skip(1.4); G.godMode = true', note: '7 PM: card camera swing into first combat at sunset' },
  '03_9pm_shades_rise': { q: 'demo=1&seed=5&chapter=1', secs: 32, setup: 'T.skip(1.4); G.godMode = true', note: '9 PM: shades rising from cast shadows, ink mist, moonlit skyline' },
  '04_11pm_hearth_falters': { q: 'demo=1&seed=6&chapter=2', secs: 28, setup: 'T.skip(1.4); G.godMode = true; T.skip(6); G.world.time = 30', note: '11 PM: low hearth, long shadows, heavy pressure' },
  '05_midnight_torch': { q: 'seed=7', secs: 11, setup: 'T.skip(0.5); G.midnight()', note: 'Midnight cutscene: hearth dies, torch lit from its last flame' },
  '06_1am_carrying_flame': { q: 'demo=1&seed=8&chapter=3', secs: 32, setup: 'T.skip(4.5); G.godMode = true', note: '1 AM: the lower city road: torch light swings every shadow, rooftops, crawlers, braziers' },
  '07_3am_great_shade': { q: 'demo=1&seed=9&chapter=4', secs: 38, setup: 'T.skip(4.5); G.godMode = true; G.world.knight.x = 62; T.skip(0.5)', note: '3 AM: the apse, the Hollow Marshal rises, his cry and second phase, slow-mo kill' },
  '08_dawn_light_ending': { q: 'demo=1&seed=10', secs: 34, setup: 'T.skip(0.5); G.dawn()', note: 'Dawn sweep, the choice, stepping into the light, dissolve ending' },
  '09_dawn_shadow_ending': { q: 'seed=11', secs: 26, setup: 'T.skip(0.5); G.dawn(); T.skip(6.2); T.key("KeyA", true)', note: 'Dawn choice: remaining in the shadow of the arch' },
  '10_memory_oath': { q: 'demo=1&seed=50&chapter=0', secs: 8, setup: 'T.skip(4.5); G.godMode = true; G.world.status = "cleared"; T.skip(0.05)', note: 'Memory: the oath, shadow theatre in the hall' },
  '11_memory_faces': { q: 'demo=1&seed=51&chapter=1', secs: 8, setup: 'T.skip(4.5); G.godMode = true; G.world.status = "cleared"; T.skip(0.05)', note: 'Memory: their faces at the hearth' },
  '12_memory_fire_out': { q: 'demo=1&seed=52&chapter=2', secs: 8, setup: 'T.skip(4.5); G.godMode = true; G.world.status = "cleared"; T.skip(0.05)', note: 'Memory: he sleeps, the fire goes out, the light goes cold' },
  '13_memory_doors': { q: 'demo=1&seed=53&chapter=3', secs: 8, setup: 'T.skip(4.5); G.godMode = true; G.world.status = "cleared"; T.skip(0.05)', note: 'Memory: the doors give, the people run, too late' },
  '14_memory_shadow': { q: 'demo=1&seed=54&chapter=4', secs: 8, setup: 'T.skip(4.5); G.godMode = true; G.world.status = "cleared"; T.skip(0.05)', note: 'Memory: he becomes the shadow, his eye opens' },
  '15_5am_city_wall': { q: 'demo=1&seed=55&chapter=5', secs: 30, setup: 'T.skip(4.5); G.godMode = true', note: '5 AM: the wall walk, lantern-eaters and bolts, the climb to the dawn gate' },
  '16_11pm_embers_charge': { q: 'demo=1&seed=56&chapter=2', secs: 30, setup: 'T.skip(4.5); G.godMode = true; T.skip(8)', note: '11 PM grounds: embers, crawlers, double jumps, charged rends, the hearth marker' },
};

const args = process.argv.slice(2);
if (!args.length || args[0] === 'list') {
  for (const [k, v] of Object.entries(CLIPS)) console.log(`${k.padEnd(26)} ${String(v.secs).padStart(3)}s  ${v.note}`);
  process.exit(0);
}
const names = args[0] === 'all' ? Object.keys(CLIPS) : args;

const browser = await chromium.launch({
  headless: true,
  // new headless: real GPU compositor. Windows uses installed Chrome (Playwright's Chromium can fail to start there)
  channel: process.env.TRAILER_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : 'chromium'),
  args: ['--enable-gpu', '--ignore-gpu-blocklist', `--use-angle=${process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'gl'}`, '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const name of names) {
  const clip = CLIPS[name];
  if (!clip) {
    console.error(`unknown clip ${name}`);
    continue;
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const t0 = Date.now();
  await page.goto(`${BASE}?debug=1&trailer=1&capture=1&${clip.q}`, { timeout: 120000 }); // dev-server loads can take ~20 s
  await page.waitForFunction(() => window.__trailer?.ready && window.__game, null, { timeout: 60000 });
  const r = await page.evaluate(
    async ({ setup, secs, name }) => {
      const T = window.__trailer;
      const G = window.__game;
      G.manual = true;
      if (G.mode === 'title' && !location.search.includes('demo=1') && !setup.includes('midnight') && !setup.includes('dawn')) {
        // title clip: stay on the title
      } else if (G.mode === 'title') G.start();
      new Function('T', 'G', setup)(T, G);
      const out = await T.take(name, secs);
      return { ...out, end: G.state };
    },
    { setup: clip.setup, secs: clip.secs, name },
  );
  console.log(JSON.stringify({ name, frames: r.frames, size: r.close.size, code: r.close.code, encodeErrors: r.encodeErrors, end: r.end, wall: (Date.now() - t0) / 1000, pageErrors: errors.slice(0, 5) }));
  await page.close();
}
await browser.close();
