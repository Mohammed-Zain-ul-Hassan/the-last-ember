import './style.css';
import { Game, type Flags } from './game';
import { loadManifest } from './assets';

const qs = new URLSearchParams(location.search);
const flags: Flags = {
  debug: qs.get('debug') === '1',
  demo: qs.get('demo') === '1',
  capture: qs.get('capture') === '1',
  seed: Number(qs.get('seed') ?? '') || 1,
  skipTo: qs.get('skipTo'),
};

const host = document.getElementById('app')!;
void loadManifest();
const game = new Game(host, flags);

function loop() {
  try {
    game.frame();
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (flags.debug) {
  const api = {
    get state() {
      return game.state;
    },
    get world() {
      return game.world;
    },
    view: game.view,
    restart: () => game.restart(),
    skipTo: (ch: string | number) => game.skipTo(ch),
    get godMode() {
      return game.godMode;
    },
    set godMode(v: boolean) {
      game.godMode = v;
      game.world.godMode = v;
    },
    snapshot: () => ({ state: game.state, ...game.world.snapshot() }),
    renderInfo: () => game.view.post.renderer.info.render,
  };
  (window as unknown as { __game: typeof api }).__game = api;
  console.info('[debug] window.__game ready', api.snapshot());
}
