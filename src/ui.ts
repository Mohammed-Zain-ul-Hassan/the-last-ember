// DOM overlay: HUD, hour cards, memories, menus. No game logic here.

import { CONFIG } from './config';

const h = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface MenuItem {
  label: string;
  action: () => void;
}

export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private time: HTMLElement;
  private chTitle: HTMLElement;
  private flameFill: HTMLElement;
  private flameMeter: HTMLElement;
  private flameLabel: HTMLElement;
  private flameCost: HTMLElement;
  private pips: HTMLElement;
  private flareReady: HTMLElement;
  private memory: HTMLElement;
  private choose: HTMLElement;
  private chooseFill: HTMLElement;
  private fps: HTMLElement;
  private hints = new Map<string, HTMLElement>();
  private card: HTMLElement;
  private screen: HTMLElement;
  private fadeBlack: HTMLElement;
  private fadeWhite: HTMLElement;
  private menuItems: { el: HTMLButtonElement; item: MenuItem }[] = [];
  private menuSel = 0;
  private memTimer = 0;
  onMenuMove: (() => void) | null = null;
  onMenuSelect: (() => void) | null = null;

  constructor() {
    this.root = h('div', 'layer');
    document.body.appendChild(this.root);
    this.hud = h('div', 'layer off');
    this.hud.id = 'hud';
    const clock = h('div', 'clock');
    this.time = h('div', 'time', '7:00 PM');
    this.chTitle = h('div', 'title', 'Sunset');
    clock.append(this.time, this.chTitle);
    const meters = h('div', 'meters');
    this.flameMeter = h('div', 'flame-meter');
    this.flameFill = h('div', 'fill');
    this.flameCost = h('div', 'cost');
    this.flameMeter.append(this.flameFill, this.flameCost);
    this.flameLabel = h('div', 'flame-label', 'the hearth');
    const row = h('div', 'row');
    this.pips = h('div', 'pips');
    this.flareReady = h('div', 'flare-ready', '<span class="key">E</span> flare');
    row.append(this.pips, this.flareReady);
    meters.append(this.flameLabel, this.flameMeter, row);
    this.memory = h('div', 'memory');
    this.choose = h('div', 'choose');
    this.chooseFill = h('div', 'fill');
    this.choose.append(this.chooseFill);
    this.fps = h('div', 'fps hidden');
    this.hud.append(clock, meters, this.memory, this.choose, this.fps);
    this.root.append(this.hud);

    this.card = h('div', 'card');
    this.screen = h('div', 'screen');
    this.screen.style.display = 'none';
    this.fadeBlack = h('div', 'fade-black');
    this.fadeWhite = h('div', 'fade-white');
    document.body.append(this.card, this.screen, this.fadeWhite, this.fadeBlack);
  }

  showHud(on: boolean): void {
    this.hud.classList.toggle('off', !on);
  }

  setFps(text: string | null): void {
    this.fps.classList.toggle('hidden', text === null);
    if (text) this.fps.textContent = text;
  }

  updateHud(o: {
    clock: string;
    title: string;
    flame: number; // 0..1
    flameLabel: string;
    hp: number;
    flareReady: boolean;
    flareCost: number; // 0..1 of the meter
    choose: number; // 0..1 (dawn)
  }): void {
    this.time.textContent = o.clock;
    this.chTitle.textContent = o.title;
    this.flameFill.style.width = `${Math.max(0, Math.min(1, o.flame)) * 100}%`;
    this.flameMeter.classList.toggle('low', o.flame < 0.25);
    this.flameLabel.textContent = o.flameLabel;
    this.flameCost.style.left = `${Math.min(1, o.flareCost) * 100}%`;
    if (this.pips.childElementCount !== CONFIG.knight.hp) {
      this.pips.innerHTML = '';
      for (let i = 0; i < CONFIG.knight.hp; i++) this.pips.append(h('div', 'pip'));
    }
    Array.from(this.pips.children).forEach((p, i) => p.classList.toggle('gone', i >= o.hp));
    this.flareReady.classList.toggle('cool', !o.flareReady);
    this.choose.style.opacity = o.choose > 0.01 ? '1' : '0';
    this.chooseFill.style.width = `${Math.min(1, o.choose) * 100}%`;
  }

  /** A diegetic prompt that floats above the knight until `done`. */
  hint(id: string, html: string, x: number, y: number, visible: boolean): void {
    let el = this.hints.get(id);
    if (!el) {
      el = h('div', 'hint', html);
      el.style.opacity = '0';
      this.hud.append(el);
      this.hints.set(id, el);
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = visible ? '1' : '0';
  }

  hideHints(): void {
    for (const el of this.hints.values()) el.style.opacity = '0';
  }

  showMemory(text: string, seconds = 5.5): void {
    this.memory.innerHTML = `<small>a memory returns</small>${text}`;
    this.memory.classList.add('on');
    this.memTimer = seconds;
  }

  tick(dt: number): void {
    if (this.memTimer > 0) {
      this.memTimer -= dt;
      if (this.memTimer <= 0) this.memory.classList.remove('on');
    }
  }

  /** Hour card: big hour, name, lines revealed one by one. */
  showCard(hour: string, name: string, lines: string[]): void {
    this.card.innerHTML = '';
    this.card.append(h('div', 'hour', hour), h('div', 'name', name));
    const ls = lines.map((l) => h('div', 'line', l));
    this.card.append(...ls);
    requestAnimationFrame(() => this.card.classList.add('on'));
    ls.forEach((l, i) => setTimeout(() => l.classList.add('on'), 900 + i * 1300));
  }

  hideCard(): void {
    this.card.classList.remove('on');
  }

  fadeToBlack(on: boolean): void {
    this.fadeBlack.classList.toggle('on', on);
  }
  fadeToWhite(on: boolean): void {
    this.fadeWhite.classList.toggle('on', on);
  }

  /** Full screen with optional title, lines and a keyboard/mouse/pad menu. */
  showScreen(o: { title?: string; big?: boolean; sub?: string; lines?: string[]; menu?: MenuItem[]; foot?: string; clear?: boolean }): void {
    const s = this.screen;
    s.innerHTML = '';
    s.className = 'screen' + (o.clear ? ' clear' : '');
    if (o.title) s.append(h(o.big ? 'h1' : 'h2', '', o.title));
    if (o.sub) s.append(h('div', 'sub', o.sub));
    if (o.lines) {
      const box = h('div', 'lines');
      for (const l of o.lines) box.append(h('p', '', l));
      s.append(box);
    }
    this.menuItems = [];
    if (o.menu) {
      const m = h('div', 'menu');
      o.menu.forEach((item, i) => {
        const b = document.createElement('button');
        b.textContent = item.label;
        b.addEventListener('mouseenter', () => this.select(i));
        b.addEventListener('click', () => {
          this.onMenuSelect?.();
          item.action();
        });
        m.append(b);
        this.menuItems.push({ el: b, item });
      });
      s.append(m);
      this.menuSel = 0;
      this.select(0, true);
    }
    if (o.foot) s.append(h('div', 'foot', o.foot));
    s.style.display = 'flex';
    requestAnimationFrame(() => s.classList.add('on'));
  }

  hideScreen(): void {
    this.screen.classList.remove('on');
    this.screen.style.display = 'none';
    this.menuItems = [];
  }

  get screenOpen(): boolean {
    return this.screen.style.display !== 'none';
  }

  private select(i: number, silent = false): void {
    if (!this.menuItems.length) return;
    this.menuSel = (i + this.menuItems.length) % this.menuItems.length;
    this.menuItems.forEach((m, j) => m.el.classList.toggle('sel', j === this.menuSel));
    if (!silent) this.onMenuMove?.();
  }

  /** Keyboard/pad navigation; returns true if the menu consumed input. */
  navigate(dy: number, confirm: boolean): boolean {
    if (!this.menuItems.length) return false;
    if (dy !== 0) this.select(this.menuSel + (dy > 0 ? -1 : 1));
    if (confirm) {
      this.onMenuSelect?.();
      this.menuItems[this.menuSel].item.action();
    }
    return true;
  }

  relabel(index: number, label: string): void {
    const m = this.menuItems[index];
    if (m) m.el.textContent = label;
  }
}
