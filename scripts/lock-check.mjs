// Pointer-lock check in a real (Playwright) Chromium window: both acts lock on the click that starts play, Esc
// pauses with the cursor back, and Resume locks again. The window must be frontmost (a background window is refused
// every lock), so it is brought forward with osascript ("Google Chrome for Testing" is Playwright's own browser).
//   node scripts/lock-check.mjs [base url]
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5181';
const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,800'] });
const page = await browser.newPage({ viewport: null });
const front = () => {
  try {
    execSync(`osascript -e 'tell application "System Events" to set frontmost of (first process whose name is "Google Chrome for Testing") to true'`);
  } catch (e) {
    console.error('front failed:', String(e.stderr ?? e).slice(0, 300)); // not on macOS, or no permission
  }
};
const wait = (ms) => page.waitForTimeout(ms);
const locked = () => page.evaluate(() => !!document.pointerLockElement);
const out = {};
page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
await page.exposeFunction('__lockErr', (e) => console.error('lock error:', e));
await page.addInitScript(() => document.addEventListener('pointerlockerror', () => window.__lockErr?.('pointerlockerror')));

// Act I: the shared title; the click that begins takes the lock
await page.goto(`${BASE}/?debug=1`);
await wait(3500);
front();
await wait(1000);
await page.mouse.click(640, 200);
await wait(1200);
out.actI_afterBegin = await locked();
await page.keyboard.press('Escape');
await wait(800);
out.actI_afterEsc = { locked: await locked(), menu: await page.evaluate(() => document.getElementById('sc-menu')?.classList.contains('on')) };
out.actI_mode = await page.evaluate(() => window.__still?.mode);
console.log(JSON.stringify(out));
const resume = page.getByRole('button', { name: 'Resume' });
if (await resume.count()) {
  await resume.click();
  await wait(1000);
  out.actI_afterResume = await locked();
} else out.actI_afterResume = 'no Resume button';

// Act II: an hour from the chapter list; the click prompt, then the lock
await page.goto(`${BASE}/classic.html?from=chapters&chapter=0&debug=1`);
await wait(5000);
front();
await wait(1000);
out.actII_prompt = await page.evaluate(() => document.getElementById('lock-prompt')?.classList.contains('on'));
await page.mouse.click(640, 450);
await wait(1200);
out.actII_afterClick = await locked();
await page.keyboard.press('Escape');
await wait(800);
out.actII_afterEsc = { locked: await locked(), mode: await page.evaluate(() => window.__game?.mode) };
await page.getByText('Resume', { exact: false }).first().click();
await wait(1000);
out.actII_afterResume = { locked: await locked(), mode: await page.evaluate(() => window.__game?.mode) };

console.log(JSON.stringify(out, null, 1));
await browser.close();
