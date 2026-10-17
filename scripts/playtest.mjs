// Scripted in-browser playtest: drives the game through `window.__game` (?autotest),
// captures screenshots and worst-case clipping metrics per scenario.
//
//   npm run playtest [-- --out <dir>] [-- --only name1,name2] [-- --headed]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const outDir = path.resolve(opt('out', 'playtest-out'));
const only = opt('only', '')?.split(',').filter(Boolean) ?? [];
const headed = args.includes('--headed');
fs.mkdirSync(outDir, { recursive: true });

const DEG = Math.PI / 180;

/**
 * Each scenario: a start pose and a list of steps.
 *   { keys: [...], ms }      hold keys for ms (empty array = release all)
 *   { tap: 'Space' }         single press
 *   { look: [yawDeg, pitchDeg] }
 *   { shot: 'name' }         screenshot
 *   { mark: 'name' }         record current metrics under a name
 *   { view: [dist, yawDeg, height] | null }   third-person debug camera (null = first person)
 */
const scenarios = [
  {
    name: 'form-toggle',
    start: [0, 0, 18, 0, 0],
    steps: [
      { keys: [], ms: 500 },
      { shot: 'fp-runner' },
      { look: [0, -50] },
      { keys: [], ms: 200 },
      { shot: 'fp-runner-down' },
      { look: [0, 0] },
      { view: [3, 150, 1.4] },
      { keys: [], ms: 150 },
      { shot: 'tp-runner' },
      { tap: 'KeyQ' },
      { keys: [], ms: 150 },
      { shot: 'tp-mid-transition' },
      { mark: 'mid' },
      { tap: 'KeyQ' },
      { keys: [], ms: 600 },
      { mark: 'shadow' },
      { shot: 'tp-shadow' },
      { view: null },
      { keys: [], ms: 100 },
      { shot: 'fp-shadow' },
      { look: [0, -50] },
      { keys: [], ms: 200 },
      { shot: 'fp-shadow-down' },
      { look: [0, 0] },
      { tap: 'KeyQ' },
      { keys: [], ms: 800 },
      { mark: 'runner-again' },
    ],
  },
  {
    name: 'runner-no-spells',
    start: [-5, 0, 18, 0, -5],
    steps: [
      { keys: ['Mouse0'], ms: 800 },
      { keys: [], ms: 100 },
      { keys: ['Mouse2'], ms: 800 },
      { keys: [], ms: 400 },
      { mark: 'after' },
    ],
  },
  {
    name: 'shadow-move',
    form: 'shadow',
    start: [3.5, 0, 28, 0, 0],
    steps: [
      { keys: ['KeyW'], ms: 150 },
      { mark: 'accel-0.15' },
      { keys: ['KeyW'], ms: 350 },
      { mark: 'accel-0.5' },
      { keys: ['KeyW'], ms: 700 },
      { mark: 'run' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 1000 },
      { mark: 'sprint-1s' },
      { keys: ['KeyW', 'ShiftLeft', 'Mouse0'], ms: 700 },
      { mark: 'cast-while-sprint' },
      { shot: 'sprint-arms' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 3800 },
      { mark: 'exhausted' },
      { keys: ['KeyW', 'KeyC'], ms: 600 },
      { mark: 'sneak' },
      { shot: 'sneak' },
      { keys: [], ms: 600 },
      { hook: 'takeMaxY' },
      { tap: 'Space' },
      { keys: [], ms: 900 },
      { mark: 'jump' },
      { keys: [], ms: 2500 },
      { mark: 'stamina-regen' },
    ],
  },
  {
    name: 'runner-jump',
    start: [3.5, 0, 28, 0, 0],
    steps: [
      { keys: [], ms: 400 },
      { hook: 'takeMaxY' },
      { tap: 'Space' },
      { keys: [], ms: 1000 },
      { mark: 'jump' },
    ],
  },
  {
    name: 'spells',
    form: 'shadow',
    start: [-5, 0, 18, 0, -5],
    steps: [
      { keys: [], ms: 400 },
      { shot: 'idle-hands' },
      { keys: ['Mouse0'], ms: 300 },
      { keys: [], ms: 300 },
      { mark: 'fizzle' },
      { keys: ['Mouse0'], ms: 800 },
      { mark: 'left-ready' },
      { shot: 'left-ready' },
      { keys: [], ms: 70 },
      { shot: 'left-release' },
      { keys: [], ms: 600 },
      { mark: 'left' },
      { keys: ['Mouse2'], ms: 800 },
      { keys: [], ms: 700 },
      { mark: 'right' },
      { hook: 'refill' },
      { hook: 'resetDummies' },
      { keys: ['Mouse0', 'Mouse2'], ms: 800 },
      { mark: 'dual-ready' },
      { shot: 'dual-ready' },
      { keys: [], ms: 70 },
      { shot: 'dual-release' },
      { keys: [], ms: 700 },
      { mark: 'dual' },
      { hook: 'drain', arg: 10 },
      { keys: ['Mouse0'], ms: 800 },
      { keys: [], ms: 400 },
      { mark: 'refused' },
      { keys: [], ms: 3000 },
      { mark: 'regen' },
    ],
  },
  {
    name: 'shadow-wall',
    form: 'shadow',
    start: [0, 0, -26, 0, 0],
    steps: [
      { keys: ['KeyW'], ms: 1500 },
      { keys: ['KeyW', 'Mouse2'], ms: 800 },
      { shot: 'wall-ready' },
      { keys: ['KeyW'], ms: 600 },
      { mark: 'after' },
    ],
  },
  {
    name: 'shadow-splash',
    form: 'shadow',
    start: [-5, 0, 18, -5.2, -16.6],
    steps: [
      { keys: ['Mouse0'], ms: 800 },
      { keys: [], ms: 800 },
      { mark: 'after' },
      { shot: 'scorch' },
    ],
  },
  {
    name: 'dummy-reset',
    form: 'shadow',
    start: [7, 0, 20, 0, -5],
    steps: [
      { keys: ['Mouse0', 'Mouse2'], ms: 800 },
      { keys: [], ms: 900 },
      { hook: 'refill' },
      { keys: ['Mouse0', 'Mouse2'], ms: 800 },
      { keys: [], ms: 700 },
      { mark: 'down' },
      { keys: [], ms: 2700 },
      { mark: 'reset' },
    ],
  },
  {
    name: 'tp-shadow-cast',
    form: 'shadow',
    start: [-5, 0, 19, 0, -5],
    steps: [
      { view: [3.2, 30, 1.3] },
      { keys: [], ms: 500 },
      { shot: 'idle-front' },
      { view: [3.5, 95, 1.2] },
      { keys: ['KeyA', 'ShiftLeft'], ms: 1100 },
      { shot: 'glide-side' },
      { view: [2.4, 180, 1.6] },
      { keys: ['KeyA', 'ShiftLeft'], ms: 300 },
      { shot: 'glide-behind' },
      { keys: [], ms: 900 },
      { teleport: [-5, 0, 19, 0, -5] },
      { view: [2.6, 150, 1.5] },
      { keys: ['Mouse0', 'Mouse2'], ms: 900 },
      { shot: 'dual-ready' },
      { keys: [], ms: 60 },
      { shot: 'release' },
      { view: [2.6, 40, 1.5] },
      { keys: ['Mouse2'], ms: 900 },
      { shot: 'right-ready-front' },
      { keys: [], ms: 500 },
    ],
  },
  {
    name: 'audio',
    start: [3.5, 0, 28, 0, 0],
    steps: [
      { keys: [], ms: 600 },
      { mark: 'quiet' },
      { keys: ['KeyW', 'KeyV'], ms: 400 },
      { mark: 'walk-0' },
      { keys: ['KeyW', 'KeyV'], ms: 2000 },
      { mark: 'walk-1' },
      { keys: ['KeyW'], ms: 400 },
      { mark: 'jog-0' },
      { keys: ['KeyW'], ms: 2000 },
      { mark: 'jog-1' },
      { teleport: [3.5, 0, 28, 0, 0] },
      { keys: ['KeyW', 'ShiftLeft'], ms: 2000 },
      { mark: 'sprint-0' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 1000 },
      { mark: 'sprint-1' },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 120 },
      { mark: 'slide-0' },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 450 },
      { mark: 'slide-1' },
      { keys: [], ms: 900 },
      { mark: 'after-slide' },
      { teleport: [3.5, 0, 28, 0, 0] },
      { keys: ['KeyC'], ms: 300 },
      { keys: ['KeyC', 'KeyW'], ms: 400 },
      { mark: 'crouch-0' },
      { keys: ['KeyC', 'KeyW'], ms: 2000 },
      { mark: 'crouch-1' },
      { keys: [], ms: 300 },
      { tap: 'Space' },
      { keys: [], ms: 1200 },
      { mark: 'jumped' },
    ],
  },
  {
    name: 'third-person',
    start: [0, 0, 26, 0, 0],
    steps: [
      { view: [3, 0, 1.4] },
      { keys: [], ms: 800 },
      { shot: 'idle-front' },
      { view: [3.5, 90, 1.2] },
      { keys: [], ms: 100 },
      { shot: 'idle-side' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 1200 },
      { shot: 'sprint-side' },
      { view: [2.2, 160, 1.3] },
      { keys: ['KeyW', 'ShiftLeft'], ms: 120 },
      { shot: 'sprint-behind' },
      { view: [3.5, 90, 1.2] },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 250 },
      { shot: 'slide-start-side' },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 400 },
      { shot: 'slide-loop-side' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 900 },
      { tap: 'Space' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 300 },
      { shot: 'air-side' },
      { keys: [], ms: 1200 },
      { keys: ['KeyC'], ms: 600 },
      { shot: 'crouch-side' },
      { keys: [], ms: 400 },
    ],
  },
  {
    name: 'idle-look-down',
    start: [0, 0, 18, 0, 0],
    steps: [
      { keys: [], ms: 800 },
      { shot: 'ahead' },
      { look: [0, -60] },
      { keys: [], ms: 300 },
      { shot: 'down60' },
      { look: [0, -85] },
      { keys: [], ms: 300 },
      { shot: 'down85' },
    ],
  },
  {
    name: 'sprint-ramp',
    start: [3.5, 0, 28, 0, -10],
    steps: [
      { keys: ['KeyW', 'ShiftLeft'], ms: 500 },
      { mark: 't0.5' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 500 },
      { mark: 't1.0' },
      { shot: 'sprint' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 90 },
      { shot: 'sprint-b' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 90 },
      { shot: 'sprint-c' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 1000 },
      { mark: 't2.0' },
      { look: [0, -45] },
      { keys: ['KeyW', 'ShiftLeft'], ms: 400 },
      { shot: 'sprint-look-down' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 600 },
      { mark: 't3.0' },
      { keys: [], ms: 600 },
    ],
  },
  {
    name: 'strafe-backpedal',
    start: [0, 0, 18, 0, -20],
    steps: [
      { keys: ['KeyD'], ms: 700 },
      { shot: 'strafe-right' },
      { keys: ['KeyA', 'ShiftLeft'], ms: 700 },
      { shot: 'strafe-left-sprint' },
      { keys: ['KeyS'], ms: 700 },
      { shot: 'backpedal' },
      { keys: [], ms: 300 },
    ],
  },
  {
    name: 'jump-land',
    start: [0, 0, 18, 0, -15],
    steps: [
      { keys: ['KeyW', 'ShiftLeft'], ms: 700 },
      { tap: 'Space' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 250 },
      { shot: 'air-rising' },
      { look: [0, -50] },
      { keys: ['KeyW', 'ShiftLeft'], ms: 200 },
      { shot: 'air-look-down' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 500 },
      { shot: 'landed' },
      { keys: [], ms: 300 },
    ],
  },
  {
    name: 'wall-push',
    start: [0, 0, -26, 0, 0],
    steps: [
      { keys: ['KeyW'], ms: 1500 },
      { shot: 'wall-ahead' },
      { look: [0, -30] },
      { keys: ['KeyW', 'ShiftLeft'], ms: 600 },
      { shot: 'wall-down' },
      { look: [30, 0] },
      { keys: ['KeyW', 'KeyA'], ms: 600 },
      { shot: 'wall-angled' },
      { keys: [], ms: 200 },
    ],
  },
  {
    name: 'slide-under-bar',
    start: [0, 0, 26, 0, -10],
    steps: [
      { keys: ['KeyW', 'ShiftLeft'], ms: 1500 },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 250 },
      { shot: 'slide-start' },
      { mark: 'slide' },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 300 },
      { shot: 'slide-mid' },
      { look: [0, -45] },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 200 },
      { shot: 'slide-look-down' },
      { look: [0, -10] },
      { keys: ['KeyW', 'ShiftLeft'], ms: 900 },
      { mark: 'after-bar' },
      { shot: 'after-bar' },
      { keys: [], ms: 300 },
    ],
  },
  {
    name: 'crouch-under-gate',
    start: [0, 0, 13.5, 0, -15],
    steps: [
      { keys: ['KeyC'], ms: 400 },
      { keys: ['KeyC', 'KeyW'], ms: 1300 },
      { keys: [], ms: 600 },
      { mark: 'released-under' },
      { shot: 'under-gate' },
      { keys: ['KeyW'], ms: 1500 },
      { mark: 'cleared' },
    ],
  },
  {
    name: 'slide-jump',
    start: [3.5, 0, 28, 0, -10],
    steps: [
      { keys: ['KeyW', 'ShiftLeft'], ms: 1500 },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 300 },
      { mark: 'sliding' },
      { tap: 'Space' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 200 },
      { mark: 'slide-jump-air' },
      { shot: 'slide-jump' },
      { keys: ['KeyW', 'ShiftLeft'], ms: 700 },
      { keys: [], ms: 300 },
    ],
  },
  {
    name: 'recall-mid-slide',
    start: [0, 0, 26, 0, -10],
    steps: [
      { keys: ['KeyW', 'ShiftLeft'], ms: 1500 },
      { keys: ['KeyW', 'ShiftLeft', 'KeyC'], ms: 300 },
      { tap: 'KeyE' },
      { keys: [], ms: 400 },
      { shot: 'recalling' },
      { keys: [], ms: 700 },
      { mark: 'after-recall' },
      { shot: 'after-recall' },
    ],
  },
];

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const url = 'http://localhost:5199/?autotest';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()} ${m.location()?.url ?? ''}`);
});
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`[${r.status()}] ${r.url()}`);
});
page.on('pageerror', (e) => errors.push(String(e)));
const isNoise = (e) => /Failed to load resource.*404/.test(e) && !/\/(src|models)\//.test(e);

await page.goto(url);
await page.waitForFunction(() => window.__game?.character?.isLoaded, null, { timeout: 30000 });
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`GPU: ${renderer}`);
// Let startup work (shader compiles, texture uploads) settle so it doesn't count against scenario 1.
await page.waitForTimeout(1500);

const report = {};
for (const sc of scenarios) {
  if (only.length && !only.includes(sc.name)) continue;
  const [x, y, z, yaw, pitch] = sc.start;
  await page.evaluate(
    ([x, y, z, yaw, pitch]) => {
      const g = window.__game;
      g.setKeys([]);
      g.view(null);
      g.recall.clear();
      g.resetDummies();
      g.refill();
      g.teleport(x, y, z, yaw, pitch);
    },
    [x, y, z, yaw * DEG, pitch * DEG],
  );
  await page.evaluate((f) => window.__game.setForm(f), sc.form ?? 'runner');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.takeWorst());

  const r = { marks: {}, shots: [] };
  for (const st of sc.steps) {
    if (st.keys) {
      await page.evaluate((k) => window.__game.setKeys(k), st.keys);
      await page.waitForTimeout(st.ms);
    } else if (st.tap) {
      await page.evaluate((k) => window.__game.tap(k), st.tap);
    } else if (st.look) {
      await page.evaluate(([y, p]) => window.__game.look(y, p), [st.look[0] * DEG, st.look[1] * DEG]);
    } else if (st.shot) {
      const file = path.join(outDir, `${sc.name}--${st.shot}.png`);
      await page.screenshot({ path: file });
      r.shots.push(path.basename(file));
    } else if (st.hook) {
      await page.evaluate(([h, a]) => window.__game[h](a), [st.hook, st.arg]);
    } else if (st.teleport) {
      await page.evaluate(([x, y, z, yaw, pitch]) => window.__game.teleport(x, y, z, yaw, pitch), [
        st.teleport[0], st.teleport[1], st.teleport[2], st.teleport[3] * DEG, st.teleport[4] * DEG,
      ]);
    } else if ('view' in st) {
      await page.evaluate((v) => (v ? window.__game.view(...v) : window.__game.view(null)), st.view);
    } else if (st.mark) {
      r.marks[st.mark] = await page.evaluate(() => ({ ...window.__game.metrics(), peakRms: window.__game.takePeak(), maxY: window.__game.takeMaxY() }));
    }
  }
  r.worst = await page.evaluate(() => window.__game.takeWorst());
  report[sc.name] = r;
  const w = r.worst;
  console.log(
    `${sc.name.padEnd(18)} near10=${w.near10} near20=${w.near20} camClip=${w.camClip} handInWall=${w.handInWall} minFps=${w.fps.toFixed(0)}`,
  );
  for (const [k, m] of Object.entries(r.marks)) {
    console.log(
      `  ${k.padEnd(14)} speed=${m.speed.toFixed(2)} height=${m.height.toFixed(2)} state=${m.state} feet=${m.feet.map((v) => v.toFixed(2)).join(',')}` +
        ` | peakRms=${m.peakRms.toFixed(4)} steps=${m.footsteps} lands=${m.lands} slides=${m.slides}`,
    );
    console.log(
      `                 form=${m.form}${m.transitioning ? '*' : ''} hp=[${m.dummyHealth.join(',')}] thrown=${m.thrown} casts=${m.casts} dual=${m.dualCasts} fizzles=${m.spellFizzles} refused=${m.refused} magicka=${m.magicka.toFixed(0)} stamina=${m.stamina.toFixed(0)} charge=${m.charge.toFixed(2)} impacts=${m.impacts} maxY=${m.maxY.toFixed(2)} drift=${m.drift.toFixed(3)}`,
    );
  }
}

const realErrors = errors.filter((e) => !isNoise(e));
report.errors = realErrors;
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (realErrors.length) console.log('CONSOLE ERRORS:\n' + realErrors.join('\n'));
console.log(`Output: ${outDir}`);

await browser.close();
await server.close();
process.exit(realErrors.length ? 1 : 0);
