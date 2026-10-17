// The game's menus: title, pause, settings, level select, controls. Plain DOM over the canvas.
// Mouse: click, drag sliders. Keyboard: up/down (W/S) to move, left/right (A/D) to change a value,
// Enter/Space to choose, Esc to go back. The game's own key handler forwards keys here while a menu is open.
import type { Quality, Settings } from '../settings';

export interface LevelInfo {
  roman: string;
  clock: string;
  title: string;
  place: string;
  best?: string;
  locked: boolean;
}

export interface MenuHooks {
  settings: Settings;
  levels(): LevelInfo[];
  canContinue(): string | null; // label of the level to continue, or null
  context(): string; // "Level 2 of 6 · The Hearth Grounds"
  begin(): void;
  continue(): void;
  level(i: number): void;
  resume(): void;
  restart(): void;
  quit(): void;
  changed(): void; // a setting moved: apply it now and save
  resetProgress(): void;
  sound(): void;
}

type Screen = 'title' | 'pause' | 'settings' | 'levels' | 'controls';

const QUALITY: Quality[] = ['auto', 'high', 'medium', 'low'];
const QUALITY_NAME: Record<Quality, string> = { auto: 'Auto', high: 'High', medium: 'Medium', low: 'Low' };

const CONTROLS: [string, string][] = [
  ['W  A  S  D', 'move  ·  relative to the camera  ·  or the arrows'],
  ['Mouse', 'move it to look around (no button needed)  ·  Esc shows the cursor'],
  ['Space', 'jump  ·  again in the air to double jump'],
  ['Click  /  J', 'strike  ·  in the air: aerial  ·  running: lunge  ·  turns toward the nearest shade'],
  ['Right click  /  K', 'heavy cleave  ·  hold K to charge, release to rend  ·  in the air: plunge'],
  ['L  /  Shift', 'shadow-step the way you move  ·  strike out of it to pierce'],
  ['Esc', 'pause and settings'],
  ['R (hold)', 'restart the level'],
  ['M', 'mute'],
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class Menu {
  private root = document.getElementById('menu') as HTMLDivElement;
  private stack: Screen[] = [];
  private eraseArmed = false;
  private hooks: MenuHooks;

  constructor(hooks: MenuHooks) {
    this.hooks = hooks;
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (el) this.act(el);
    });
    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.type === 'range') this.slide(el);
    });
    this.root.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest('button, input') as HTMLElement | null;
      if (el && document.activeElement !== el) el.focus({ preventScroll: true });
    });
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }
  get screen(): Screen | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  open(screen: Screen): void {
    this.stack = [screen];
    this.render();
  }

  push(screen: Screen): void {
    this.stack.push(screen);
    this.render();
  }

  /** Back one screen; returns false when there is nowhere to go back to. */
  back(): boolean {
    if (this.stack.length <= 1) return false;
    this.stack.pop();
    this.render();
    return true;
  }

  close(): void {
    this.stack = [];
    this.root.classList.remove('on');
    this.root.innerHTML = '';
  }

  /** Keys from the game while a menu is open. Returns true if the key was used. */
  key(code: string): boolean {
    if (!this.isOpen) return false;
    const items = this.items();
    const cur = document.activeElement as HTMLElement | null;
    const i = cur ? items.indexOf(cur) : -1;
    const move = (d: number) => {
      const n = items.length;
      if (!n) return;
      const next = items[i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n];
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest' }); // settings and levels can be taller than a short screen
      this.hooks.sound();
    };
    switch (code) {
      case 'ArrowDown':
      case 'KeyS':
        move(1);
        return true;
      case 'ArrowUp':
      case 'KeyW':
        move(-1);
        return true;
      case 'ArrowLeft':
      case 'KeyA':
      case 'ArrowRight':
      case 'KeyD': {
        const d = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
        if (this.screen === 'title') move(d); // the title menu is a row
        else if (cur instanceof HTMLInputElement && cur.type === 'range') {
          cur.value = String(Math.max(0, Math.min(100, Number(cur.value) + d * 5)));
          this.slide(cur);
        } else if (cur?.dataset.act === 'quality') this.cycleQuality(d);
        else if (cur?.dataset.act === 'numbers' || cur?.dataset.act === 'invertY') this.act(cur);
        return true;
      }
      case 'Enter':
      case 'Space':
      case 'KeyJ':
        if (cur && items.includes(cur)) this.act(cur);
        else move(1);
        return true;
      case 'Escape':
      case 'Backspace':
      case 'KeyK': // keyboard players live on W A S D, J and K: K backs out
        if (!this.back() && this.screen === 'pause') this.hooks.resume();
        else this.hooks.sound();
        return true;
    }
    return true; // everything else is swallowed while a menu is open
  }

  // -------------------------------------------------------------- internals
  private items(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input'));
  }

  private act(el: HTMLElement): void {
    const s = this.hooks.settings;
    const act = el.dataset.act;
    this.hooks.sound();
    switch (act) {
      case 'begin':
        return this.hooks.begin();
      case 'continue':
        return this.hooks.continue();
      case 'resume':
        return this.hooks.resume();
      case 'restart':
        return this.hooks.restart();
      case 'quit':
        return this.hooks.quit();
      case 'level':
        return this.hooks.level(Number(el.dataset.i));
      case 'levels':
      case 'settings':
      case 'controls':
        return this.push(act);
      case 'back':
        if (!this.back()) this.hooks.resume();
        return;
      case 'numbers':
        s.numbers = !s.numbers;
        this.hooks.changed();
        el.querySelector('b')!.textContent = s.numbers ? 'On' : 'Off';
        return;
      case 'invertY':
        s.invertY = !s.invertY;
        this.hooks.changed();
        el.querySelector('b')!.textContent = s.invertY ? 'On' : 'Off';
        return;
      case 'quality':
        return this.cycleQuality(1);
      case 'fullscreen':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
        setTimeout(() => {
          const b = this.root.querySelector('[data-act="fullscreen"] b');
          if (b) b.textContent = document.fullscreenElement ? 'On' : 'Off';
        }, 150);
        return;
      case 'erase':
        if (!this.eraseArmed) {
          this.eraseArmed = true;
          el.querySelector('b')!.textContent = 'Press again to erase';
          return;
        }
        this.eraseArmed = false;
        this.hooks.resetProgress();
        el.querySelector('b')!.textContent = 'Erased';
        return;
    }
  }

  private cycleQuality(d: number): void {
    const s = this.hooks.settings;
    s.quality = QUALITY[(QUALITY.indexOf(s.quality) + d + QUALITY.length) % QUALITY.length];
    this.hooks.changed();
    const b = this.root.querySelector('[data-act="quality"] b');
    if (b) b.textContent = QUALITY_NAME[s.quality];
  }

  private slide(el: HTMLInputElement): void {
    const key = el.dataset.key as 'volume' | 'music' | 'sfx' | 'shake' | 'flashes' | 'sens';
    const v = Number(el.value) / 100;
    this.hooks.settings[key] = v;
    el.style.setProperty('--v', `${el.value}%`);
    const out = el.parentElement?.querySelector('output');
    if (out) out.textContent = pct(v);
    this.hooks.changed();
  }

  private render(): void {
    const screen = this.screen;
    if (!screen) return this.close();
    this.eraseArmed = false;
    this.root.className = `on ${screen}`;
    const h = this.hooks;
    const s = h.settings;
    const btn = (act: string, label: string, extra = '') => `<button data-act="${act}" ${extra}>${label}</button>`;
    const slider = (key: string, label: string, v: number) =>
      `<label class="row"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${Math.round(v * 100)}" data-key="${key}" style="--v:${Math.round(v * 100)}%"><output>${pct(v)}</output></label>`;
    const toggle = (act: string, label: string, value: string) => `<button class="row" data-act="${act}"><span>${label}</span><b>${value}</b></button>`;
    let html = '';
    switch (screen) {
      case 'title': {
        const cont = h.canContinue();
        html = `<nav class="list">
          ${cont ? btn('continue', `Continue<small>${cont}</small>`) : ''}
          ${btn('begin', cont ? 'Begin the night again' : 'Begin the night')}
          ${btn('levels', 'Choose a level')}
          ${btn('settings', 'Settings')}
          ${btn('controls', 'Controls')}
        </nav>`;
        break;
      }
      case 'pause':
        html = `<h2>Paused</h2><p class="ctx">${h.context()}</p><nav class="list">
          ${btn('resume', 'Resume')}
          ${btn('restart', 'Restart the level')}
          ${btn('levels', 'Choose a level')}
          ${btn('settings', 'Settings')}
          ${btn('controls', 'Controls')}
          ${btn('quit', 'Quit to title')}
        </nav>`;
        break;
      case 'settings':
        html = `<h2>Settings</h2><div class="panel">
          <h3>Sound</h3>
          ${slider('volume', 'Master volume', s.volume)}
          ${slider('music', 'Music', s.music)}
          ${slider('sfx', 'Effects', s.sfx)}
          <h3>Camera</h3>
          ${slider('sens', 'Mouse sensitivity', s.sens)}
          ${toggle('invertY', 'Invert mouse Y', s.invertY ? 'On' : 'Off')}
          <h3>Screen</h3>
          ${slider('shake', 'Screenshake', s.shake)}
          ${slider('flashes', 'Screen flashes', s.flashes)}
          ${toggle('numbers', 'Damage numbers', s.numbers ? 'On' : 'Off')}
          ${toggle('quality', 'Graphics quality', QUALITY_NAME[s.quality])}
          ${toggle('fullscreen', 'Fullscreen', document.fullscreenElement ? 'On' : 'Off')}
          <h3>Progress</h3>
          ${toggle('erase', 'Erase grades and unlocked levels', '')}
        </div><nav class="list">${btn('back', 'Back')}</nav>`;
        break;
      case 'levels': {
        const rows = h
          .levels()
          .map(
            (l, i) => `<button class="level${l.locked ? ' locked' : ''}" data-act="level" data-i="${i}" ${l.locked ? 'disabled' : ''}>
              <span class="roman">${l.roman}</span>
              <span class="what"><b>Level ${i + 1}  ·  ${l.locked ? 'not yet reached' : l.title}</b><small>${l.clock}${l.locked ? '' : `  ·  ${l.place}`}</small></span>
              <span class="best">${l.locked ? '<i class="lock"></i>' : l.best ? `<em class="grade g${l.best}">${l.best}</em>` : '<small>not cleared</small>'}</span>
            </button>`,
          )
          .join('');
        html = `<h2>Choose a level</h2><p class="ctx">The night, hour by hour. Reach a level to unlock it.</p><div class="levels">${rows}</div><nav class="list">${btn('back', 'Back')}</nav>`;
        break;
      }
      case 'controls':
        html = `<h2>Controls</h2><div class="panel keys">${CONTROLS.map(([k, v]) => `<div class="row"><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div><nav class="list">${btn('back', 'Back')}</nav>`;
        break;
    }
    this.root.innerHTML = `<div class="box">${html}</div>`;
    const first = this.items()[0];
    first?.focus({ preventScroll: true });
  }
}
