import * as THREE from 'three';
import type { GameEvent, Move, World } from '../sim/world';
import { HealthBar } from './healthBar';

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

const TAGS: Record<Move, string> = { light: 'light', heavy: 'heavy', air: 'aerial', plunge: 'plunge', dashStrike: 'pierce', lunge: 'lunge', charged: 'charged' };

interface Bar {
  hb: HealthBar;
  lastHit: number;
  shown: number;
}

export class WorldUi {
  private root = $('worldui') as HTMLDivElement;
  private bars = new Map<number, Bar>();
  private v = new THREE.Vector3();
  private t = 0;
  private nameIdx = 0;
  private bossBar = new HealthBar($('boss-track') as HTMLDivElement);
  private bossLastHit = 0;
  private bossOn = false;
  private camera: THREE.Camera;
  hidden = false;
  numbers = true; // damage numbers (a setting)
  private stack = 0;
  private stackT = -9;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.nameIdx = Math.floor(Math.random() * NAMES.length);
  }

  /** Screen position of a world point; `on` is false behind the camera; `side` is -1/1 for left/right of view. */
  private project(x: number, y: number, z: number): { x: number; y: number; on: boolean; side: number } {
    this.v.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
    const ahead = this.v.z < -0.1;
    const side = Math.sign(this.v.x) || 1;
    this.v.set(x, y, z).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * window.innerWidth, y: (-this.v.y * 0.5 + 0.5) * window.innerHeight, on: ahead && this.v.z < 1, side };
  }

  private headY(big: boolean, kind: string = 'shade'): number {
    if (kind === 'crawler') return 1.45;
    if (kind === 'lantern') return 2.3;
    return (big ? 1.65 : 1) * 2.2 + 0.25;
  }

  /** Floating text at a world position. kind sets the style; tag adds a small label under it. */
  pop(text: string, x: number, y: number, kind: string, z = 0, tag = ''): void {
    if (this.hidden) return;
    const p = this.project(x, y, z);
    if (!p.on) return;
    const el = document.createElement('div');
    el.className = `pop ${kind}`;
    el.textContent = text;
    if (tag) {
      const t = document.createElement('i');
      t.textContent = tag;
      el.appendChild(t);
    }
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
        const kind = w.torch && e.heavy ? 'fire' : e.heavy ? 'heavy' : e.move === 'light' ? 'light' : 'skill';
        if (this.numbers) this.pop(e.heavy ? `${e.dmg}!` : `${e.dmg}`, e.x, (s ? s.y : 0) + this.headY(big, s?.kind) + 0.1, kind, e.z, TAGS[e.move]);
      } else if (e.type === 'kill') {
        const name = NAMES[this.nameIdx++ % NAMES.length];
        this.pop(e.big ? 'the Hollow Marshal is free' : name, e.x, e.y + 1.9, e.big ? 'soul big' : 'soul', e.z);
        if (e.burned && !e.big) this.pop('burned away', e.x, e.y + 1.4, 'burn', e.z);
      } else if (e.type === 'move') {
        for (const old of Array.from(this.root.querySelectorAll('.pop.callout'))) old.remove(); // one callout at a time
        this.pop(e.count >= 2 ? `${e.name} ×${e.count}` : e.name, e.x, e.y + 0.4, 'callout', e.z);
      } else if (e.type === 'marshalCry') {
        this.pop('the Marshal remembers his oath, and hates you for keeping yours', e.x, e.y + 0.6, 'soul big', e.z);
      } else if (e.type === 'knightHurt') {
        if (this.numbers) this.pop(`-${e.dmg}`, e.x, e.y + 2.9, 'hurt', e.z);
      } else if (e.type === 'lifeLost') {
        this.pop(e.lives === 1 ? 'the last shard' : 'a shard breaks', e.x, e.y + 3.3, 'soul big', e.z);
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
          const hb = new HealthBar('ebar');
          hb.reset(Math.max(0, s.hp / s.maxHp));
          this.root.appendChild(hb.el);
          b = { hb, lastHit: -9, shown: 0 };
          this.bars.set(s.id, b);
        }
        b.hb.set(s.hp / s.maxHp, dt);
        const el = b.hb.el;
        const target = s.state === 'rise' ? 0 : 1;
        b.shown += (target - b.shown) * Math.min(1, dt * 6);
        const p = this.project(s.x, s.y + this.headY(false, s.kind), s.z);
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
        el.style.opacity = p.on ? (b.shown * (s.light > 0.05 ? 1 : 0.85)).toFixed(2) : '0';
        el.classList.toggle('burning', s.light > 0.05);
        el.classList.toggle('struck', this.t - b.lastHit < 0.15);
      }
    }
    for (const [id, b] of this.bars) {
      if (seen.has(id)) continue;
      b.hb.el.remove();
      this.bars.delete(id);
    }
    // boss bar for the great shade
    const bossEl = $('bossbar');
    bossEl.classList.toggle('on', !!boss && live && !this.hidden);
    if (boss) {
      if (!this.bossOn) this.bossBar.reset(boss.hp / boss.maxHp);
      this.bossOn = true;
      this.bossBar.set(boss.hp / boss.maxHp, dt);
      bossEl.classList.toggle('struck', this.t - this.bossLastHit < 0.12);
    } else this.bossOn = false;
  }

  private hearthHitT = -9;
  /** Points home when the hearth is off-screen; pulses when it is struck. */
  hearthMarker(w: World, show: boolean): void {
    const el = $('hearth-marker');
    const p = this.project(w.hearthX, 1.4, w.hearthZ);
    const off = p.x < 40 || p.x > window.innerWidth - 40 || !p.on;
    const on = show && w.level.hearthX !== undefined && !w.torch && off;
    el.classList.toggle('on', on);
    if (!on) return;
    const left = p.on ? p.x < window.innerWidth / 2 : p.side < 0;
    el.classList.toggle('left', left);
    el.classList.toggle('right', !left);
    (el.querySelector('.hp') as HTMLElement).textContent = `${Math.round(w.hearthHp)}%`;
    if (w.events.some((e) => e.type === 'hearthHurt')) {
      if (this.t - this.hearthHitT > 1.5) {
        el.classList.remove('struck');
        void el.offsetWidth;
        el.classList.add('struck');
      }
      this.hearthHitT = this.t;
    }
  }

  clear(): void {
    for (const b of this.bars.values()) b.hb.el.remove();
    this.bars.clear();
    for (const el of Array.from(this.root.querySelectorAll('.pop'))) el.remove();
  }
}
