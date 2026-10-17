// Record a full played run of the Still City: launches Chrome (tab capture auto-accepted, no background
// throttling so it runs at full speed even when the window is covered), opens the game with the script bot and the
// recorder on, starts it with a real click (sound needs one), and waits until the recording is written.
//   node scripts/record-run.mjs [url] [name]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5178/';
const name = process.argv[3] ?? 'still-city-gameplay';
const maxMin = Number(process.env.MAX_MIN ?? 30);
// The window must really be the size of the page it shows: tab capture records the surface that exists, so an
// emulated viewport taller than the window is cut off (and the captions live at the bottom). A 1440x810 page fits
// a 1512x982 screen; it is captured at the screen's Retina resolution and scaled to 1920x1080.
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 810);
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
// fit the window so the page inside is exactly W x H
const cdp = await context.newCDPSession(page);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
for (let i = 0; i < 3; i++) {
  const inner = await page.evaluate(() => [innerWidth, innerHeight]);
  const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
  if (inner[0] === W && inner[1] === H) break;
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + W - inner[0], height: bounds.height + H - inner[1] } });
  await page.waitForTimeout(300);
}
console.log('page size', await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]));
page.on('console', (m) => {
  const t = m.text();
  if (/\[rec\]|error|Error|\[still\]/.test(t)) console.log('[page]', t);
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}?bot=1&rec=1&name=${name}${process.env.EXTRA ?? ''}`);
await page.waitForTimeout(5000);
await page.mouse.click(W / 2, H / 2);
const t0 = Date.now();
for (;;) {
  await page.waitForTimeout(15000);
  const st = await page.evaluate(() => {
    const s = window.__still;
    return { done: window.__recDone ?? null, info: window.__recInfo ?? null, mode: s.mode, d: s.city.d.id, t: s.city.s.t.toFixed(0), x: s.city.s.body.x.toFixed(1), z: s.city.s.body.z.toFixed(1), flags: Object.keys(s.city.s.flags).length, deaths: s.city.s.deaths };
  });
  console.log(`${((Date.now() - t0) / 60000).toFixed(1)} min`, JSON.stringify(st));
  if (st.done) break;
  if (Date.now() - t0 > maxMin * 60000) {
    console.log('timed out: stopping the recording where it is');
    console.log(await page.evaluate(() => window.__recStop?.()));
    break;
  }
}
await browser.close();
