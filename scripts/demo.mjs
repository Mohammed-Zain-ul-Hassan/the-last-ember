// The live demo for the judges: a real Chrome window where the bot plays The Last Ember, both acts.
//
//   node scripts/demo.mjs              play, on the local dev server (http://localhost:5174, started with
//                                      `python run.py` if it is not running; no internet needed); run it again after a
//                                      stop and it resumes where it was
//   node scripts/demo.mjs --live       the deployed site instead (https://the-last-ember-xi.vercel.app)
//   node scripts/demo.mjs --restart    from the very beginning
//   node scripts/demo.mjs --url <url>  any other build (a preview, another port)
//   (python demo.py ... does the same)
//
// Stopping is always safe: Ctrl+C, kill -9, closing the terminal. The game pauses where it stands (the page pauses
// itself as soon as this script's heartbeat stops) and the window stays open; a person can resume from the menu and
// play. Running the script again takes the window back: Act I returns to the exact moment the bot was at (district,
// puzzles, position) whatever was done in between; Act II's bot reads the fight as it is and plays on. If the window
// was closed, a new one opens at the saved district or hour. A bot that stops making progress is restarted at its
// district's brazier, then moved on to the next district or hour.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const LIVE = has('--live'); // local by default (Zain: the demo runs on the local link)
const RESTART = has('--restart');
const PORT = Number(args[args.indexOf('--port') + 1]) || 9333;
const URL_ARG = args.includes('--url') ? args[args.indexOf('--url') + 1] : null; // e.g. a preview, or another port
const BASE = (URL_ARG ?? (LIVE ? 'https://the-last-ember-xi.vercel.app/' : 'http://localhost:5174/')).replace(/\/?$/, '/');
const LOCAL = !URL_ARG && !LIVE;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(homedir(), '.last-ember-demo-chrome');
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find(existsSync);
const say = (m) => console.log(`[demo ${new Date().toTimeString().slice(0, 8)}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STALL_MS = Number(process.env.DEMO_STALL_S) * 1000 || null; // (tests: a shorter stall threshold)

async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Local (the default): the dev server must answer; start `python run.py --no-browser` (detached) if it does not. */
async function ensureServer() {
  if (!LOCAL || (await reachable(BASE))) return;
  say('starting the local dev server (python run.py) ...');
  const log = openSync(join(PROFILE, 'dev-server.log'), 'a');
  spawn('python3', ['run.py', '--no-browser'], { cwd: ROOT, detached: true, stdio: ['ignore', log, log] }).unref();
  for (let i = 0; i < 90; i++) {
    if (await reachable(BASE)) return say('dev server up');
    await sleep(1000);
  }
  throw new Error(`the dev server did not come up on ${BASE} (see ${join(PROFILE, 'dev-server.log')})`);
}

/** The demo's own Chrome (its own profile, never the user's), detached: stopping this script never closes it. */
async function browser() {
  try {
    return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 2500 });
  } catch {
    if (!CHROME) throw new Error('Google Chrome was not found in /Applications');
    say('opening Chrome ...');
    spawn(CHROME, [
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--window-size=1440,900', 'about:blank',
    ], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 2500 });
      } catch {
        /* still starting */
      }
    }
    throw new Error('could not reach the demo Chrome');
  }
}

mkdirSync(PROFILE, { recursive: true });
// one driver at a time: a second copy would fight the first for the knight
const LOCK = join(PROFILE, 'demo.pid');
try {
  const other = Number(readFileSync(LOCK, 'utf8'));
  if (other && other !== process.pid) {
    process.kill(other, 0); // throws if it is gone
    console.error(`[demo] another demo script is already running (pid ${other}). Stop it first (Ctrl+C in its terminal, or: kill ${other}).`);
    process.exit(1);
  }
} catch {
  /* no lock, or a stale one */
}
writeFileSync(LOCK, String(process.pid));
process.on('exit', () => {
  try {
    if (Number(readFileSync(LOCK, 'utf8')) === process.pid) unlinkSync(LOCK);
  } catch {
    /* gone already */
  }
});
await ensureServer();
const b = await browser();
const ctx = b.contexts()[0] ?? (await b.newContext());
let page = ctx.pages().find((p) => p.url().startsWith(BASE)) ?? ctx.pages()[0] ?? (await ctx.newPage());
await page.bringToFront().catch(() => {});

const onGame = () => page.url().startsWith(BASE) && /(\?|&)(bot|demo)=1/.test(page.url());
const api = (fn, arg) => page.evaluate(([f, a]) => (window.__demo ? window.__demo[f](a) : null), [fn, arg ?? null]);
const waitApi = async () => {
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => !!window.__demo).catch(() => false)) return true;
    await sleep(500);
  }
  return false;
};
const saved = async () => {
  if (!page.url().startsWith(BASE)) await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('lastember.demo') ?? 'null');
    } catch {
      return null;
    }
  });
};

// ---- where to start
if (RESTART) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('lastember.demo'));
  say('--restart: from the very beginning');
  await page.goto(`${BASE}?bot=1&quick=1`);
} else if (onGame() && (await waitApi())) {
  say(`taking the window back: ${await api('resume')}`);
} else {
  const s = await saved();
  if (s?.act === 2) {
    say(`resuming Act II at hour ${s.chapter}`);
    await page.goto(`${BASE}classic.html?demo=1&chapter=${s.chapter}`);
  } else if (s?.act === 1) {
    say(`resuming Act I in district ${s.di}`);
    await page.goto(`${BASE}?bot=1&quick=1&d=${s.di}`);
    if (await waitApi()) say(await api('resume', s));
  } else {
    say('no saved demo: from the beginning');
    await page.goto(`${BASE}?bot=1&quick=1`);
  }
}

// ---- stopping: pause the game in place, leave the window open
let stopping = false;
async function stop(sig) {
  if (stopping) process.exit(0);
  stopping = true;
  say(`${sig}: pausing the game where it stands (the window stays open; run again to resume)`);
  await Promise.race([api('pause', 'the script was stopped').catch(() => {}), sleep(1500)]);
  process.exit(0); // never b.close(): that would close the demo's Chrome
}
process.on('SIGINT', () => void stop('Ctrl+C'));
process.on('SIGTERM', () => void stop('stopped'));
process.on('SIGHUP', () => void stop('terminal closed'));
b.on('disconnected', () => {
  if (stopping) return;
  say('the Chrome window was closed: run the script again to reopen it where the demo was');
  process.exit(0);
});

// ---- the loop: heartbeat, status, stall watch
let last = '';
let progressKey = '';
let progressAt = Date.now();
let skips = 0;
for (;;) {
  await sleep(1000);
  let st = null;
  try {
    // a page that moved on (Act I -> Act II) or a reloaded one: find the game tab again
    if (stopping) continue; // (no heartbeat after a stop has begun: it would outlive the pause)
    if (page.isClosed()) page = ctx.pages().find((p) => p.url().startsWith(BASE)) ?? (await ctx.newPage());
    await api('beat');
    st = await api('status');
  } catch {
    continue; // mid-navigation
  }
  if (!st) {
    if (!onGame()) continue;
    await waitApi();
    continue;
  }
  const where = st.act === 1 ? `Act I · ${st.district} · step ${st.goal} · ${st.mode}${st.botOn ? '' : ' (a person is playing)'}` : `Act II · ${st.hour} · ${st.mode}${st.demoOn ? '' : ' (a person is playing)'}`;
  if (where !== last) {
    say(where);
    last = where;
  }
  // progress: anything that moves (step, place, position in 2 m cells, the hour's clock in 10 s)
  const key = st.act === 1 ? `${st.di}|${st.goal}|${Math.round(st.x / 2)}|${Math.round(st.z / 2)}|${st.ending}` : `${st.chapter}|${st.mode}|${Math.round(st.x / 2)}|${Math.round(st.z / 2)}|${Math.floor((st.time ?? 0) / 10)}`;
  // only real play can stall: a cutscene (the bridge, midnight, a memory, dawn) or a card is never 'stuck'
  const playing = (st.botOn ?? st.demoOn) && st.mode === 'play';
  if (key !== progressKey || !playing) {
    if (key !== progressKey) skips = 0; // it moved on: a later stall starts the ladder again
    progressKey = key;
    progressAt = Date.now();
  } else if (Date.now() - progressAt > (STALL_MS ?? (st.act === 1 ? 45000 : 60000))) {
    skips++;
    const r = st.act === 1 ? await api('skip', skips > 1) : await api('skip');
    say(`the bot stopped making progress: ${r}`);
    progressAt = Date.now();
  }
}
