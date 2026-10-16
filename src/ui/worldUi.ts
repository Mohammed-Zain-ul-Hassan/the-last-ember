import * as THREE from 'three';
import type { GameEvent, World } from '../sim/world';

// World-anchored UI drawn as crisp DOM over the canvas: a health bar over every shade (with a trailing "chip" that
// shows the damage just dealt), damage numbers bursting from their heads, the name of the person each shade once
// was when it falls, and a boss bar for the great shade.

const $ = (id: string) => document.getElementById(id)!;

// "They were your people once." Every shade freed gives one of them back.
const NAMES = [
  'Mira', 'Old Tobin', 'Sister Wren', 'Corin the smith', 'Little Hale', 'Ysolde', 'Brannoc', "the baker's girl",
  'Ser Edric', 'Maud', 'Osric', 'the bell-ringer', 'Tamsin', 'Garet', 'the ferryman', 'Elowen', 'Hob', 'Aldith',
  'the twins', 'Rook', 'Bertrand', 'the miller', 'Agnes', 'Wat', 'Isolde', 'the lamplighter', 'Piers', 'Nell',
];

interface Bar {
  el: HTMLDivElement;
  fill: HTMLDivElement;
  chip: HTMLDivElement;
  chipHp: number;
  lastHit: number;
  shown: number;
}

export class WorldUi {
  private root = $('worldui') as HTMLDivElement;
  private bars = new Map<number, Bar>();
  private v = new THREE.Vector3();
  private t = 0;
  private nameIdx = 0;
  private bossFill = $('boss-fill') as HTMLDivElement;
  private bossChip = $('boss-chip') as HTMLDivElement;
  private bossChipHp = 1;
  private bossLastHit = 0;
  private camera: THREE.Camera;
  hidden = false;
  private stack = 0;
  private stackT = -9;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.nameIdx = Math.floor(Math.random() * NAMES.length);
  }

  private project(x: number, y: number, z: number): { x: number; y: number; on: boolean } {
    this.v.set(x, y, z).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * window.innerWidth, y: (-this.v.y * 0.5 + 0.5) * window.innerHeight, on: this.v.z < 1 };
  }

  private headY(big: boolean): number {
    return (big ? 1.65 : 1) * 2.2 + 0.25;
  }

  /** Floating text at a world position. kind sets the style. */
  pop(text: string, x: number, y: number, kind: string, z = 0): void {
    if (this.hidden) return;
    const p = this.project(x, y, z);
    if (!p.on) return;
    const el = document.createElement('div');
    el.className = `pop ${kind}`;
    el.textContent = text;
    // stagger stacked numbers so rapid hits never print on top of each other
    this.stack = this.t - this.stackT < 0.35 ? this.stack + 1 : 0;
    this.stackT = this.t;
    el.style.left = `${p.x + (Math.random() - 0.5) * 50 + (this.stack % 3 - 1) * 22}px`;
    el.style.top = `${p.y - (this.stack % 4) * 16}px`;
    el.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  events(events: readonly GameEvent[], w: World): void {
    for (const e of events) {
      if (e.type === 'hit') {
        const s = w.shades.find((q) => q.id === e.id);
        const big = !!s?.big;
        const bar = this.bars.get(e.id);
        if (bar) bar.lastHit = this.t;
        if (big) this.bossLastHit = this.t;
        const kind = w.torch && e.heavy ? 'fire' : e.heavy ? 'heavy' : 'light';
        this.pop(e.heavy ? `${e.dmg}!` : `${e.dmg}`, e.x, (s ? s.y : 0) + this.headY(big) + 0.1, kind, -0.2);
      } else if (e.type === 'kill') {
        const name = NAMES[this.nameIdx++ % NAMES.length];
        this.pop(e.big ? 'the Hollow Marshal is free' : name, e.x, e.y + 1.9, e.big ? 'soul big' : 'soul', -0.2);
        if (e.burned && !e.big) this.pop('burned away', e.x, e.y + 1.4, 'burn', -0.2);
      } else if (e.type === 'knightHurt') {
        this.pop('-1', e.x, e.y + 2.9, 'hurt', 0);
      }
    }
  }

  update(w: World, dt: number, live: boolean): void {
    this.t += dt;
    const seen = new Set<number>();
    let boss = null;
    if (live && !this.hidden) {
      for (const s of w.shades) {
        if (s.big && s.state !== 'dead') boss = s;
        if (s.state === 'dead' || s.big) continue;
        seen.add(s.id);
        let b = this.bars.get(s.id);
        if (!b) {
          const el = document.createElement('div');
          el.className = 'ebar';
          el.innerHTML = '<div class="chip"></div><div class="fill"></div>';
          this.root.appendChild(el);
          b = { el, fill: el.querySelector('.fill') as HTMLDivElement, chip: el.querySelector('.chip') as HTMLDivElement, chipHp: s.hp, lastHit: -9, shown: 0 };
          this.bars.set(s.id, b);
        }
        const frac = Math.max(0, s.hp / s.maxHp);
        // the chip holds briefly, then drains down to the real value
        if (this.t - b.lastHit > 0.35) b.chipHp += (s.hp - b.chipHp) * Math.min(1, dt * 5);
        b.chipHp = Math.max(b.chipHp, s.hp);
        const target = s.state === 'rise' ? 0 : 1;
        b.shown += (target - b.shown) * Math.min(1, dt * 6);
        const p = this.project(s.x, s.y + this.headY(false), -0.2);
        b.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
        b.el.style.opacity = p.on ? (b.shown * (s.light > 0.05 ? 1 : 0.85)).toFixed(2) : '0';
        b.el.classList.toggle('burning', s.light > 0.05);
        b.el.classList.toggle('struck', this.t - b.lastHit < 0.15);
        b.fill.style.width = `${(frac * 100).toFixed(1)}%`;
        b.chip.style.width = `${(Math.max(0, b.chipHp / s.maxHp) * 100).toFixed(1)}%`;
      }
    }
    for (const [id, b] of this.bars) {
      if (seen.has(id)) continue;
      b.el.remove();
      this.bars.delete(id);
    }
    // boss bar for the great shade
    const bossEl = $('bossbar');
    bossEl.classList.toggle('on', !!boss && live && !this.hidden);
    if (boss) {
      const frac = Math.max(0, boss.hp / boss.maxHp);
      if (this.t - this.bossLastHit > 0.45) this.bossChipHp += (frac - this.bossChipHp) * Math.min(1, dt * 3);
      this.bossChipHp = Math.max(this.bossChipHp, frac);
      this.bossFill.style.width = `${(frac * 100).toFixed(2)}%`;
      this.bossChip.style.width = `${(this.bossChipHp * 100).toFixed(2)}%`;
      bossEl.classList.toggle('struck', this.t - this.bossLastHit < 0.12);
    } else this.bossChipHp = 1;
  }

  clear(): void {
    for (const b of this.bars.values()) b.el.remove();
    this.bars.clear();
    for (const el of Array.from(this.root.querySelectorAll('.pop'))) el.remove();
  }
}
