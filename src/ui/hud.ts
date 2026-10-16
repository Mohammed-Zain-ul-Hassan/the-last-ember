import { CFG } from '../config';
import type { World } from '../sim/world';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private hpPips: HTMLElement[] = [];
  private flashEl = $('flash');
  private flashA = 0;
  private lastHp: number = CFG.knight.maxHp;
  private combo = 0;
  private comboT = 0;

  constructor() {
    const hp = $('hp');
    for (let i = 0; i < CFG.knight.maxHp; i++) {
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
    const hp = Math.max(0, w.knight.hp);
    if (hp < this.lastHp) {
      // the lost shard cracks and falls away
      for (let i = hp; i < this.lastHp; i++) {
        const p = this.hpPips[i];
        if (!p) continue;
        p.classList.remove('shatter');
        void p.offsetWidth;
        p.classList.add('shatter');
      }
      $('vitals').classList.remove('hurt');
      void $('vitals').offsetWidth;
      $('vitals').classList.add('hurt');
    }
    this.lastHp = hp;
    this.hpPips.forEach((p, i) => p.classList.toggle('gone', i >= hp));
    $('hp-num').textContent = `${hp} / ${CFG.knight.maxHp}`;
    $('vitals').classList.toggle('low', hp <= 2 && hp > 0);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) $('combo').classList.remove('on');
    }
    $('clock-roman').textContent = w.chapter.roman;
    $('clock-label').textContent = w.chapter.clock;
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

  card(roman: string, title: string, line: string, hint = ''): void {
    $('card-roman').textContent = roman;
    $('card-title').textContent = title;
    $('card-line').textContent = line;
    $('card-hint').textContent = hint;
    $('card').classList.remove('hidden');
  }

  hideCard(): void {
    $('card').classList.add('hidden');
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
