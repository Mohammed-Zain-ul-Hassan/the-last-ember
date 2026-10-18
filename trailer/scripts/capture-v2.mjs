// Trailer v2 captures: real screen recordings of the tab (canvas + HUD + captions + the game's own sound), one per take,
// each with a <take>-moments.json of every game event on the recording's clock (src/still/main.ts, src/main.ts ?rec=1).
// The shotlist (scripts/plan_v2.py) cuts to those events, so re-recording a take never means re-timing the edit.
//
// ON HOLD until the team says "we are done, record now" (and Zain picks the build). Needs the dev server of the build
// being recorded (the capture sink is a Vite dev middleware), e.g. preview_start {name: "merged"} -> port 5181.
//
//   node trailer/scripts/capture-v2.mjs list
//   node trailer/scripts/capture-v2.mjs <take...|all>        GAME_URL=http://localhost:5181/ by default
//
// Files land in trailer/raw/<take>.mp4 (+ -moments.json). The window is sized so the page is exactly 1440x810 (tab
// capture records the real surface; it is captured at Retina resolution and scaled to 1920x1080 in the edit).
import { chromium } from 'playwright';

const BASE = (process.env.GAME_URL ?? 'http://localhost:5181/').replace(/\/?$/, '/');
const W = 1440;
const H = 810;

// act: 'I' runs until the run's own end (the bot plays Act I through to "Carry it out"); 'II' records `secs` seconds.
// setup (Act II) runs in the page after the click that starts the recording: G = window.__game.
const TAKES = {
  // ---- Act I: the Still City, played by the script bot (real time, HUD and captions, its own score)
  A1_main: { act: 'I', q: 'bot=1&quick=1', maxMin: 40, note: 'Act I main path, every district, to the Heart and "Carry it out" (the source of most Act I shots)' },
  A1_full: { act: 'I', q: 'bot=1', maxMin: 60, note: 'Act I with every Last Word (more wakes, replays and ghost step-ins to choose from)' },
  A1_market: { act: 'I', q: 'bot=1&d=1', maxMin: 15, note: 'The Market alone: the scales, the canal, the shadow bridge (a cleaner second angle)' },
  A1_library: { act: 'I', q: 'bot=1&d=3', maxMin: 15, note: 'The Library alone: the maze, pages read from above, the Wrong Shadow wearing his face' },
  A1_heart_hard: { act: 'I', q: 'bot=1&d=4&quick=1', diff: 'hard', maxMin: 15, note: 'The Heart on Hard: no ember trail, a cleaner frame for the plates and the ending' },
  // ---- Act II: the hearth, autoplayed by the demo bot from the chapter list (godMode keeps a take alive). On Hard:
  // that is Ahnaf's own tuning (Easy thins the shades and the Marshal falls in seconds)
  A2_bridge: { act: 'II', q: 'from=still', secs: 30, setup: '', note: 'The bridge: "Act II · The Hearth", the lines, the plaza at sunset, into 7 PM' },
  A2_7pm: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=0&demo=1&seed=4', secs: 40, setup: 'G.godMode = true', note: '7 PM: sunset, the first shades, the moveset at the hearth' },
  A2_9pm: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=1&demo=1&seed=5', secs: 40, setup: 'G.godMode = true', note: '9 PM: shades rise from the shadows the fire throws' },
  A2_11pm: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=2&demo=1&seed=6', secs: 40, setup: 'G.godMode = true', note: '11 PM: the hearth falters, crawlers, embers carried home' },
  A2_midnight: { act: 'II', q: 'from=chapters&chapter=2&seed=7', secs: 14, setup: 'G.midnight()', note: 'Midnight: the hearth dies, the torch is lit from its last flame' },
  A2_1am: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=3&demo=1&seed=8', secs: 40, setup: 'G.godMode = true', note: '1 AM: the lower city, the torch swings every shadow' },
  A2_3am: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=4&demo=1&seed=9', secs: 60, setup: 'G.godMode = true', note: '3 AM: the cathedral nave (escalation shots)' },
  // the Marshal waits at the apse, far down the road: start the knight near it (v1's drive.mjs did the same)
  A2_marshal: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=4&demo=1&seed=9', secs: 55, setup: 'G.godMode = true; setTimeout(() => { G.world.knight.x = 62; }, 4000)', note: '3 AM: the apse, the Hollow Marshal rises, his cry, the waves, the kill (the 21 s climax take)' },
  A2_marshal2: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=4&demo=1&seed=21', secs: 40, setup: 'G.godMode = true; setTimeout(() => { G.world.knight.x = 62; }, 4000)', note: '3 AM: the Marshal again, another seed (a cleaner camera on his fall)' },
  A2_marshal3: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=4&demo=1&seed=33', secs: 40, setup: 'G.godMode = true; setTimeout(() => { G.world.knight.x = 62; }, 4000)', note: '3 AM: the Marshal, a third seed' },
  A2_5am: { act: 'II', diff: 'hard', q: 'from=chapters&chapter=5&demo=1&seed=55', secs: 40, setup: 'G.godMode = true', note: '5 AM: the wall walk, lantern-eaters, the climb to the Dawn Gate' },
  A2_dawn: { act: 'II', q: 'from=chapters&chapter=5&seed=10', secs: 45, setup: 'G.dawn()', note: 'Dawn: the reveal ("It was you"), the choice, into the light' },
};

const args = process.argv.slice(2);
if (!args.length || args[0] === 'list') {
  for (const [k, v] of Object.entries(TAKES)) console.log(`${k.padEnd(14)} act ${v.act.padEnd(2)} ${String(v.secs ?? `<=${v.maxMin}m`).padStart(5)}  ${v.note}`);
  process.exit(0);
}
const names = args[0] === 'all' ? Object.keys(TAKES) : args;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required',
    '--auto-accept-this-tab-capture',
    '--window-position=0,0',
    `--window-size=${W},${H + 90}`,
  ],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.goto('about:blank');
const cdp = await context.newCDPSession(page);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
for (let i = 0; i < 3; i++) {
  const inner = await page.evaluate(() => [innerWidth, innerHeight]);
  const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
  if (inner[0] === W && inner[1] === H) break;
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + W - inner[0], height: bounds.height + H - inner[1] } });
  await page.waitForTimeout(300);
}
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => /\[rec\]|error/i.test(m.text()) && console.log('[page]', m.text()));

for (const name of names) {
  const take = TAKES[name];
  if (!take) {
    console.error(`unknown take ${name}`);
    continue;
  }
  const t0 = Date.now();
  // the difficulty is a saved setting (src/difficulty.ts): Easy unless the take asks for another
  await page.goto(BASE);
  await page.evaluate((d) => localStorage.setItem('lastember.difficulty', d), take.diff ?? 'easy');
  if (take.act === 'I') {
    await page.goto(`${BASE}?debug=1&rec=1&name=${name}&${take.q}`);
    // the district must be built (the Library is heavy) before the click that starts the recording
    await page.waitForFunction(() => window.__still?.mode === 'title', null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.mouse.click(W / 2, H / 2); // starts the recording; the run begins 5 s later
    await page.waitForTimeout(9000);
    if ((await page.evaluate(() => window.__still?.mode)) === 'title') console.log(`${name}: the run did not begin (still on the title)`);
    for (;;) {
      await page.waitForTimeout(15000);
      const st = await page.evaluate(() => ({ done: window.__recDone ?? null, mode: window.__still?.mode, d: window.__still?.city.d.id }));
      console.log(`${name} ${((Date.now() - t0) / 60000).toFixed(1)} min`, JSON.stringify(st));
      if (st.done) break;
      if (Date.now() - t0 > take.maxMin * 60000) {
        console.log(`${name}: timed out, stopping where it is`);
        await page.evaluate(() => window.__recStop?.());
        break;
      }
    }
  } else {
    await page.goto(`${BASE}classic.html?debug=1&rec=1&name=${name}&${take.q}`);
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.mouse.click(W / 2, H / 2); // starts the recording (and the sound)
    await page.waitForTimeout(500);
    await page.evaluate((setup) => {
      const G = window.__game;
      if (G.mode === 'title') G.start();
      new Function('G', setup)(G);
    }, take.setup);
    await page.waitForTimeout(take.secs * 1000);
    const out = await page.evaluate(() => window.__recStop?.());
    console.log(`${name}: ${out}`);
  }
}
await browser.close();
