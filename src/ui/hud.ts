import { CFG } from '../config';
import type { World } from '../sim/world';
import { HealthBar } from './healthBar';

const $ = (id: string) => document.getElementById(id)!;

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
    $('combo-n').textContent = String(this.combo);
    el.classList.toggle('on', this.combo >= 2);
    el.classList.remove('pulse');
    void el.offsetWidth; // restart the pulse animation
    el.classList.add('pulse');
    el.classList.toggle('hot', this.combo >= 8);
  }

  update(w: World, dt: number): void {
    const k = w.knight;
    const hp = Math.max(0, k.hp);
    const lives = Math.max(0, k.lives);
    if (lives < this.lastLives || (lives > this.lastLives && hp >= this.lastHp)) {
      // a shard cracks and falls away; the bar empties, then refills as he rises
      for (let i = lives; i < this.lastLives; i++) {
        const p = this.hpPips[i];
        if (!p) continue;
        p.classList.remove('shatter');
        void p.offsetWidth;
        p.classList.add('shatter');
      }
      if (lives < this.lastLives && lives > 0) this.bar.reset(1, 0);
      else this.bar.reset(hp / CFG.knight.maxHp);
    }
    if (hp < this.lastHp || lives < this.lastLives) {
      $('vitals').classList.remove('hurt');
      void $('vitals').offsetWidth;
      $('vitals').classList.add('hurt');
    }
    this.lastHp = hp;
    this.lastLives = lives;
    this.bar.set(hp / CFG.knight.maxHp, dt);
    this.hpPips.forEach((p, i) => p.classList.toggle('gone', i >= lives));
    $('hp-num').textContent = String(Math.ceil(this.bar.shownFrac * CFG.knight.maxHp));
    $('vitals').classList.toggle('low', hp <= CFG.knight.maxHp * 0.25 && hp > 0);
    $('vitals').classList.toggle('lastlife', lives === 1);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').classList.remove('on');
    }
    $('ember-tag').classList.toggle('on', w.knight.ember);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) $('combo').classList.remove('on');
    }
    $('clock-roman').textContent = w.chapter.roman;
    $('clock-label').textContent = `Level ${w.chapterIndex + 1}  ·  ${w.chapter.clock}`;
    ($('clock-bar').firstElementChild as HTMLElement).style.width = `${(w.progress * 100).toFixed(1)}%`;
    const hf = Math.max(0, w.hearthHp / CFG.hearth.maxHp);
    ($('hearth-bar').firstElementChild as HTMLElement).style.width = `${(hf * 100).toFixed(1)}%`;
    $('hearth').classList.toggle('low', hf < 0.3);
    $('hearth').style.opacity = w.torch ? '0' : '1';
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - dt * 2.5);
      this.flashEl.style.opacity = String(this.flashA);
    }
  }

  flash(strength: number, color = '#ffffff'): void {
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
  toast(text: string): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.toastT = 3;
  }

  /** The name of a place, the first time he reaches it. */
  place(name: string, sub: string): void {
    const el = $('place');
    $('place-name').textContent = name;
    $('place-sub').textContent = sub;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
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
