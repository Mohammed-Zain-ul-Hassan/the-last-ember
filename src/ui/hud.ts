import { CFG } from '../config';
import type { World } from '../sim/world';
import { HealthBar } from './healthBar';

const $ = (id: string) => document.getElementById(id)!;

// The HUD is refreshed every frame, but the DOM is only touched when something changed: rewriting identical text or
// styles still invalidates style (and widths re-lay out the page), which is wasted work at 60-120 Hz.
const shown = new WeakMap<HTMLElement, Record<string, string>>();
function put(el: HTMLElement, key: string, value: string, write: (v: string) => void): void {
  let rec = shown.get(el);
  if (!rec) shown.set(el, (rec = {}));
  if (rec[key] === value) return;
  rec[key] = value;
  write(value);
}
const text = (el: HTMLElement, v: string) => put(el, 'text', v, (x) => (el.textContent = x));
const style = (el: HTMLElement, prop: 'transform' | 'opacity', v: string) => put(el, prop, v, (x) => (el.style[prop] = x));
const cls = (el: HTMLElement, name: string, on: boolean) => put(el, 'c:' + name, on ? '1' : '', () => el.classList.toggle(name, on));
/** Restart a CSS animation without forcing a synchronous layout (no `void el.offsetWidth`). */
export function replay(el: HTMLElement, name: string): void {
  el.classList.remove(name);
  for (const a of el.getAnimations()) a.cancel();
  requestAnimationFrame(() => el.classList.add(name));
}

export interface CardOpts {
  eyebrow?: string; // small line above the roman numeral (may hold <b>)
  stats?: [string, string | number][]; // label, value
  level?: number; // index of the current level, for the progress diamonds
  levels?: number;
}

export class Hud {
  /** Highest combo since the last reset (the level-complete card shows it). */
  bestCombo = 0;
  private hpPips: HTMLElement[] = [];
  private flashEl = $('flash');
  private flashA = 0;
  private lastLives: number = CFG.knight.lives;
  private lastHp: number = CFG.knight.maxHp;
  private bar = new HealthBar($('vit-bar') as HTMLDivElement);
  private combo = 0;
  private comboT = 0;

  constructor() {
    const hp = $('hp');
    for (let i = 0; i < CFG.knight.lives; i++) {
      const p = document.createElement('i');
      hp.appendChild(p);
      this.hpPips.push(p);
    }
  }

  show(on: boolean): void {
    $('hud').classList.toggle('hidden', !on);
  }

  /** A strike landed: build the combo counter. */
  hit(): void {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboT = 1.6;
    const el = $('combo');
    text($('combo-n'), String(this.combo));
    cls(el, 'on', this.combo >= 2);
    replay(el, 'pulse');
    cls(el, 'hot', this.combo >= 8);
  }

  update(w: World, dt: number): void {
    const k = w.knight;
    const hp = Math.max(0, k.hp);
    const lives = Math.max(0, k.lives);
    if (lives < this.lastLives || (lives > this.lastLives && hp >= this.lastHp)) {
      // a shard cracks and falls away; the bar empties, then refills as he rises
      for (let i = lives; i < this.lastLives; i++) {
        const p = this.hpPips[i];
        if (p) replay(p, 'shatter');
      }
      if (lives < this.lastLives && lives > 0) this.bar.reset(1, 0);
      else this.bar.reset(hp / CFG.knight.maxHp);
    }
    if (hp < this.lastHp || lives < this.lastLives) replay($('vitals'), 'hurt');
    this.lastHp = hp;
    this.lastLives = lives;
    this.bar.set(hp / CFG.knight.maxHp, dt);
    this.hpPips.forEach((p, i) => cls(p, 'gone', i >= lives));
    text($('hp-num'), String(Math.ceil(this.bar.shownFrac * CFG.knight.maxHp)));
    cls($('vitals'), 'low', hp <= CFG.knight.maxHp * 0.25 && hp > 0);
    cls($('vitals'), 'lastlife', lives === 1);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) cls($('toast'), 'on', false);
    }
    cls($('ember-tag'), 'on', w.knight.ember);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) cls($('combo'), 'on', false);
    }
    text($('clock-roman'), w.chapter.roman);
    text($('clock-label'), `Level ${w.chapterIndex + 1}  ·  ${w.chapter.clock}`);
    style($('clock-bar').firstElementChild as HTMLElement, 'transform', `scaleX(${w.progress.toFixed(3)})`);
    const hf = Math.max(0, w.hearthHp / CFG.hearth.maxHp);
    style($('hearth-bar').firstElementChild as HTMLElement, 'transform', `scaleX(${hf.toFixed(3)})`);
    cls($('hearth'), 'low', hf < 0.3);
    style($('hearth'), 'opacity', w.torch ? '0' : '1');
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * 2.5);
      this.flashEl.style.opacity = String(this.flashA);
    }
  }

  flash(strength: number, color = '#ffffff'): void {
    // light flashes add onto the frame; a black one is a fade, which only shows blended normally
    this.flashEl.style.mixBlendMode = color === '#000' || color === '#000000' ? 'normal' : 'screen';
    this.flashEl.style.background = color;
    this.flashA = Math.max(this.flashA, strength);
    this.flashEl.style.opacity = String(this.flashA);
  }

  card(roman: string, title: string, line: string, hint = '', opts: CardOpts = {}): void {
    $('card-eyebrow').innerHTML = opts.eyebrow ?? '';
    $('card-stats').innerHTML = (opts.stats ?? []).map(([label, value]) => `<div><b>${value}</b><span>${label}</span></div>`).join('');
    $('card-levels').innerHTML =
      opts.level === undefined ? '' : Array.from({ length: opts.levels ?? 0 }, (_, i) => `<i class="${i < opts.level! ? 'done' : i === opts.level ? 'now' : ''}"></i>`).join('');
    $('card-roman').textContent = roman;
    $('card-title').textContent = title;
    $('card-line').textContent = line;
    $('card-hint').textContent = hint;
    $('card').classList.remove('hidden');
  }

  hideCard(): void {
    $('card').classList.add('hidden');
  }

  private toastT = 0;
  /** A short line under the clock: embers, braziers, doors. */
  toast(msg: string): void {
    const el = $('toast');
    el.textContent = msg;
    shown.delete(el);
    replay(el, 'on');
    this.toastT = 3;
  }

  /** A line that stays while it still applies: call it every frame (it does not replay its entrance). */
  keep(msg: string): void {
    const el = $('toast');
    if (el.textContent !== msg || this.toastT <= 0) this.toast(msg);
    this.toastT = Math.max(this.toastT, 0.6);
  }

  /** The name of a place, the first time he reaches it. */
  place(name: string, sub: string): void {
    $('place-name').textContent = name;
    $('place-sub').textContent = sub;
    replay($('place'), 'on');
  }

  choice(on: boolean): void {
    $('choice').classList.toggle('hidden', !on);
  }

  title(on: boolean): void {
    $('title').classList.toggle('hidden', !on);
  }

  fps(text: string): void {
    $('fps').textContent = text;
  }
}
