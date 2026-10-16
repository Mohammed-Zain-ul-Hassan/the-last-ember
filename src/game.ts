// The night as a state machine: title -> hour card -> play -> (midnight) -> ... -> dawn -> ending.

import * as THREE from 'three';
import { CONFIG } from './config';
import { World, type GameEvent, type Input as SimInput } from './sim/world';
import { CHAPTERS, MIDNIGHT_LINES, ENDINGS, MEMORIES, clockText, chapterIndex } from './sim/chapters';
import { Bot } from './sim/bot';
import { View } from './render/view';
import { UI } from './ui';
import { Input } from './input';
import { createAudio, type GameAudio, type MusicPhase } from './audio/audio';

export type GameState = 'title' | 'card' | 'play' | 'hourEnd' | 'midnight' | 'lost' | 'ending' | 'paused' | 'final';

interface Carry {
  fuel: number;
  torchEmbers: number;
  memoryIdx: number;
  freed: number;
}

export interface Flags {
  debug: boolean;
  demo: boolean;
  capture: boolean;
  seed: number;
  skipTo: string | null;
}

function load<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem('ember3d:' + key);
    return v === null ? def : (JSON.parse(v) as T);
  } catch {
    return def;
  }
}
function save(key: string, v: unknown): void {
  try {
    localStorage.setItem('ember3d:' + key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Game {
  state: GameState = 'title';
  world: World;
  view: View;
  ui: UI;
  input: Input;
  audio: GameAudio;
  bot: Bot | null;
  flags: Flags;
  private carryAtStart: Carry;
  private stateT = 0;
  private acc = 0;
  private hitStop = 0;
  private timeScale = 1;
  private pausedFrom: GameState = 'play';
  private aim = new THREE.Vector3(0, 0, 1);
  private hintsDone = { move: false, attack: false, flare: false, dash: false };
  private moved = 0;
  private lastFrame = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsText = '';
  private seed: number;
  private midnightDone = false;
  shake = load('shake', true);
  godMode = false;

  constructor(host: HTMLElement, flags: Flags) {
    this.flags = flags;
    this.seed = flags.seed;
    this.carryAtStart = { fuel: CONFIG.hearth.fuelStart, torchEmbers: CONFIG.torch.embersStart, memoryIdx: 0, freed: 0 };
    this.world = new World(this.seed, 0, this.carryAtStart);
    this.world.aimFacing = false;
    this.view = new View(host, this.world);
    this.view.shakeScale = this.shake ? 1 : 0;
    this.ui = new UI();
    this.input = new Input(this.view.post.renderer.domElement);
    this.audio = createAudio();
    this.audio.setMuted(load('muted', false));
    this.bot = flags.demo ? new Bot(this.seed) : null;
    this.ui.onMenuMove = () => this.audio.play('uiMove');
    this.ui.onMenuSelect = () => this.audio.play('uiSelect');
    this.input.onFirstInput = () => {
      this.audio.unlock();
      this.audio.setPhase(this.musicFor());
    };
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });

    if (flags.skipTo) {
      if (flags.skipTo === 'midnight') {
        this.skipTo('midnight');
        return;
      }
      const i = chapterIndex(flags.skipTo);
      if (i >= 0) {
        this.beginChapter(i, true);
        return;
      }
    }
    this.enterTitle();
  }

  // ------------------------------------------------------------------ flow

  private musicFor(): MusicPhase {
    switch (this.state) {
      case 'title':
        return 'title';
      case 'ending':
      case 'final':
        return 'ending';
      case 'midnight':
        return 'silent';
      default:
        return this.world.chapter.music;
    }
  }

  private setState(s: GameState): void {
    this.state = s;
    this.stateT = 0;
    this.audio.setPhase(this.musicFor());
  }

  enterTitle(): void {
    this.world = new World(this.seed, 0, this.carryAtStart);
    this.world.aimFacing = false;
    this.world.scripted = true;
    this.world.knight.x = 0;
    this.world.knight.z = 2.4;
    this.world.knight.facing = Math.PI;
    this.view.torchLit = false;
    this.view.hearthLit = true;
    this.view.hearthPower = 1;
    this.view.dissolve = 0;
    this.ui.hideCard();
    this.ui.showHud(false);
    this.ui.fadeToWhite(false);
    this.ui.fadeToBlack(false);
    this.setState('title');
    this.ui.showScreen({
      title: 'THE LAST EMBER',
      big: true,
      sub: 'one fire · one night · one keeper',
      clear: true,
      menu: [
        { label: 'Begin the night', action: () => this.startNight() },
        { label: 'Settings', action: () => this.showSettings(() => this.enterTitle()) },
      ],
      foot: 'WASD move · click strike · E flare · Space shadow-step · M mute',
    });
  }

  startNight(): void {
    this.audio.unlock();
    this.carryAtStart = { fuel: CONFIG.hearth.fuelStart, torchEmbers: CONFIG.torch.embersStart, memoryIdx: 0, freed: 0 };
    this.midnightDone = false;
    this.beginChapter(0);
  }

  /** Build the world for chapter i and show its hour card. */
  beginChapter(i: number, instant = false): void {
    this.ui.hideScreen();
    this.ui.fadeToBlack(false);
    const ch = CHAPTERS[i];
    if (ch.mode !== 'hearth') this.midnightDone = true;
    this.world = new World(this.seed + i * 101, i, this.carryAtStart);
    this.world.aimFacing = false;
    this.world.godMode = this.godMode;
    this.view.torchLit = ch.mode !== 'hearth';
    this.view.hearthLit = ch.mode === 'hearth';
    this.view.hearthPower = 1;
    this.view.dissolve = 0;
    this.view.shot = null;
    this.ui.fadeToWhite(false);
    this.hitStop = 0;
    this.timeScale = 1;
    if (instant) {
      this.ui.showHud(!this.flags.capture);
      this.setState('play');
      return;
    }
    this.setState('card');
    this.audio.play('bell');
    this.audio.play('card');
    this.ui.showHud(false);
    this.ui.showCard(ch.label, ch.title, ch.lines);
  }

  retry(): void {
    this.audio.play('uiSelect');
    this.beginChapter(this.world.chIndex, true);
  }

  restart(): void {
    this.carryAtStart = { fuel: CONFIG.hearth.fuelStart, torchEmbers: CONFIG.torch.embersStart, memoryIdx: 0, freed: 0 };
    this.beginChapter(0);
  }

  skipTo(id: string | number): void {
    const i = id === 'midnight' ? chapterIndex('11pm') : typeof id === 'number' ? id : chapterIndex(id);
    if (i < 0) return;
    this.carryAtStart = {
      fuel: Math.max(60, this.world.fuel),
      torchEmbers: Math.max(50, this.world.torchEmbers),
      memoryIdx: Math.min(MEMORIES.length, i * 2),
      freed: i * 12,
    };
    if (id === 'midnight') return this.startMidnight();
    this.beginChapter(i, true);
  }

  private chapterCleared(): void {
    const w = this.world;
    // shades dissolve as the hour turns
    for (const s of w.shades) if (s.state !== 'dead') w.killShade(s, true);
    this.onEvents(w.events);
    w.events.length = 0;
    this.audio.play('bell');
    this.carryAtStart = {
      fuel: Math.max(48, w.fuel),
      torchEmbers: Math.max(40, w.torchEmbers),
      memoryIdx: w.memoryIdx,
      freed: w.freed,
    };
    this.setState('hourEnd');
  }

  private lose(): void {
    const w = this.world;
    this.setState('lost');
    const hearth = w.loseReason === 'hearth';
    setTimeout(() => {
      if (this.state !== 'lost') return;
      this.ui.showHud(false);
      this.ui.showScreen({
        title: hearth ? 'The last ember is out.' : 'The keeper falls.',
        lines: [hearth ? 'And with it, the night wins.' : 'The fire is alone in the dark.'],
        menu: [
          { label: 'Hold the hour again  [R]', action: () => this.retry() },
          { label: 'Return to the title', action: () => this.enterTitle() },
        ],
      });
    }, 1400);
  }

  private pause(): void {
    if (this.state !== 'play') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.audio.duck(0.5);
    this.ui.showScreen({
      title: 'Paused',
      menu: [
        { label: 'Resume', action: () => this.resume() },
        { label: 'Hold this hour again', action: () => this.retry() },
        { label: 'Settings', action: () => this.showSettings(() => this.pauseMenuAgain()) },
        { label: 'Return to the title', action: () => this.enterTitle() },
      ],
    });
  }
  private pauseMenuAgain(): void {
    this.state = 'play';
    this.pause();
  }
  private resume(): void {
    this.ui.hideScreen();
    this.state = this.pausedFrom;
  }

  private showSettings(back: () => void): void {
    const label = () => [
      `Sound: ${this.audio.muted ? 'off' : 'on'}`,
      `Screen shake: ${this.shake ? 'on' : 'off'}`,
    ];
    const items = [
      {
        label: label()[0],
        action: () => {
          this.audio.setMuted(!this.audio.muted);
          save('muted', this.audio.muted);
          this.ui.relabel(0, label()[0]);
        },
      },
      {
        label: label()[1],
        action: () => {
          this.shake = !this.shake;
          save('shake', this.shake);
          this.view.shakeScale = this.shake ? 1 : 0;
          this.ui.relabel(1, label()[1]);
        },
      },
      { label: 'Back', action: back },
    ];
    this.ui.showScreen({ title: 'Settings', menu: items });
  }

  // ------------------------------------------------------------------ midnight

  private startMidnight(): void {
    this.ui.hideScreen();
    this.ui.showHud(false);
    // rebuild the 11 PM courtyard if we jumped here
    if (this.world.chapter.id !== '11pm') {
      this.world = new World(this.seed, chapterIndex('11pm'), this.carryAtStart);
      this.world.aimFacing = false;
    }
    const w = this.world;
    w.scripted = true;
    w.status = 'play';
    for (const s of w.shades) if (s.state !== 'dead') w.killShade(s, true);
    w.events.length = 0;
    w.embers.length = 0;
    this.view.hearthLit = true;
    this.view.torchLit = false;
    this.setState('midnight');
    this.audio.setPhase('silent');
    this.ui.showCard('12 AM', 'Midnight', []);
  }

  private updateMidnight(dt: number): void {
    const w = this.world;
    const k = w.knight;
    const t = this.stateT;
    const H = CONFIG.hearth;
    // 0-2: the card, 2-6.5: the hearth gutters, shadows run to the horizon, 6.5-8.6: he kneels, 8.6: the torch catches
    if (t > 2 && t - dt <= 2) {
      this.ui.hideCard();
      this.audio.play('hearthDie');
    }
    const die = ease((t - 2) / 4.5);
    const startH = Math.max(H.heightMin, w.fire.h);
    if (t < 8.6) {
      const h = startH + (0.45 - startH) * die;
      const r = 16 - 10 * die;
      w.fireOverride = { x: 0, z: 0, h, r };
      this.view.hearthPower = Math.max(0.06, 1 - die * 0.94);
    }
    // the knight walks to the bowl and kneels
    const walk = ease((t - 2.5) / 3);
    const sx = k.x;
    const sz = k.z;
    const tx = 0;
    const tz = 1.85;
    if (t < 6.5) {
      k.state = 'scripted';
      k.x = sx + (tx - sx) * Math.min(1, walk * 0.12 + (t > 6 ? 1 : 0));
      k.z = sz + (tz - sz) * Math.min(1, walk * 0.12 + (t > 6 ? 1 : 0));
      k.facing = Math.atan2(-k.x, -k.z);
      k.moving = t > 2.5 && t < 6 ? 0.5 : 0;
    }
    if (t > 3.2 && t - dt <= 3.2) this.ui.showMemory(MIDNIGHT_LINES[1], 3);
    if (t > 6.4 && t - dt <= 6.4) this.ui.showMemory(MIDNIGHT_LINES[2], 2.6);
    if (t >= 8.6 && t - dt < 8.6) {
      // the torch catches
      this.view.torchLit = true;
      this.view.hearthLit = false;
      this.view.hearthPower = 0;
      this.audio.play('torchLight');
      this.view.addTrauma(0.6);
      this.view.fx.burst(0, 1.2, 1.2, 90, 9, 1.4, 0.2);
      this.view.rings.fire(0, 1.4, 0.5, 14, 1.2, new THREE.Color(5, 2, 0.5));
      this.audio.setPhase('torch');
    }
    if (t >= 8.6) {
      const grow = ease((t - 8.6) / 1.5);
      w.fireOverride = { x: k.x, z: k.z, h: CONFIG.torch.height, r: 3 + (CONFIG.torch.radius - 3) * grow };
    }
    // camera: low, close, orbiting
    const a = 0.4 + t * 0.09;
    const dist = 13 - Math.min(6, t * 0.5);
    this.view.shot = {
      pos: new THREE.Vector3(Math.sin(a) * dist, 4.5 + Math.max(0, 6 - t) * 0.5, Math.cos(a) * dist + 1),
      target: new THREE.Vector3(0, 1.2, 0.8),
      fov: 34,
    };
    this.view.shotBlend = Math.min(1, t / 1.5) * (t > 12.5 ? Math.max(0, 1 - (t - 12.5) / 1.5) : 1);
    if (t > 14) {
      w.fireOverride = null;
      this.view.shot = null;
      this.midnightDone = true;
      this.carryAtStart = { ...this.carryAtStart, memoryIdx: w.memoryIdx, freed: w.freed };
      this.beginChapter(chapterIndex('1am'));
    }
  }

  // ------------------------------------------------------------------ ending

  private updateEnding(dt: number): void {
    const w = this.world;
    const t = this.stateT;
    const k = w.knight;
    if (w.ending === 'light') {
      if (t - dt <= 0) {
        this.audio.play('dissolve');
        this.audio.play('dawn');
        this.ui.showHud(false);
      }
      this.view.dissolve = Math.min(1, t / 5);
      // his embers stream home into the cold hearth, and it catches
      if (Math.random() < dt * 40 * (1 - this.view.dissolve * 0.5)) {
        this.view.fx.add.spawn({
          x: k.x + (Math.random() - 0.5) * 0.6,
          y: 0.4 + Math.random() * 1.8,
          z: k.z + (Math.random() - 0.5) * 0.6,
          vx: -k.x * 0.18 + (Math.random() - 0.5),
          vy: 1.5 + Math.random() * 2,
          vz: -k.z * 0.18 + (Math.random() - 0.5),
          life: 2.5 + Math.random() * 2,
          size: 0.14,
          sizeEnd: 0.04,
          r: 9,
          g: 4,
          b: 1,
          r2: 3,
          g2: 0.6,
          b2: 0.1,
          drag: 0.2,
          curl: 3,
        });
      }
      if (t > 4 && t - dt <= 4) {
        this.view.hearthLit = true;
        this.view.hearthPower = 0.2;
      }
      if (t > 4) this.view.hearthPower = Math.min(1.1, 0.2 + (t - 4) * 0.3);
      const mi = Math.floor(t / 1.1);
      if (t > 1 && mi < MEMORIES.length && Math.floor((t - dt) / 1.1) !== mi && mi % 3 === 0) this.ui.showMemory(MEMORIES[mi], 1.8);
      if (t > 7.5 && t - dt <= 7.5) this.ui.fadeToWhite(true);
      if (t > 10.5) this.finalScreen('light');
    } else {
      if (t - dt <= 0) this.ui.showHud(false);
      k.state = 'scripted';
      const a = 0.6 + t * 0.05;
      this.view.shot = {
        pos: new THREE.Vector3(k.x + Math.sin(a) * (14 + t), 10 + t * 3, k.z + Math.cos(a) * (14 + t)),
        target: new THREE.Vector3(k.x, 1, k.z),
        fov: 30,
      };
      this.view.shotBlend = Math.min(1, t / 2);
      if (t > 7 && t - dt <= 7) this.ui.fadeToBlack(true);
      if (t > 9.5) this.finalScreen('shadow');
    }
  }

  private finalScreen(kind: 'light' | 'shadow'): void {
    if (this.state === 'final') return;
    this.setState('final');
    const e = ENDINGS[kind];
    const w = this.world;
    this.ui.fadeToBlack(false);
    this.ui.showScreen({
      title: e.title,
      lines: [...e.lines],
      sub: `${Math.floor(w.freed + 0.5)} shades freed · ${w.memoryIdx} of ${MEMORIES.length} memories`,
      menu: [
        { label: 'Play the night again', action: () => this.restart() },
        { label: 'Return to the title', action: () => this.enterTitle() },
      ],
    });
    if (kind === 'light') setTimeout(() => this.ui.fadeToWhite(false), 300);
  }

  // ------------------------------------------------------------------ frame

  private simInput(): SimInput {
    const w = this.world;
    const k = w.knight;
    if (this.bot) return this.bot.think(w, 1 / 60);
    const raw = this.input.poll();
    this.lastRaw = raw;
    const yaw = this.view.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const mx = rx * raw.moveX + fx * raw.moveY;
    const mz = rz * raw.moveX + fz * raw.moveY;
    let aimX = this.aim.x;
    let aimZ = this.aim.z;
    if (raw.usingPad) {
      const ax = rx * raw.padAimX + fx * raw.padAimY;
      const az = rz * raw.padAimX + fz * raw.padAimY;
      if (Math.hypot(ax, az) > 0.2) {
        aimX = k.x + ax * 4;
        aimZ = k.z + az * 4;
      } else if (Math.hypot(mx, mz) > 0.2) {
        aimX = k.x + mx * 4;
        aimZ = k.z + mz * 4;
      } else {
        aimX = k.x + Math.sin(k.facing) * 4;
        aimZ = k.z + Math.cos(k.facing) * 4;
      }
    } else if (this.view.groundPoint(raw.mouseNdcX, raw.mouseNdcY, this.aim)) {
      aimX = this.aim.x;
      aimZ = this.aim.z;
    }
    return { mx, mz, aimX, aimZ, attack: raw.attack, dash: raw.dash, flare: raw.flare };
  }
  private lastRaw: ReturnType<Input['poll']> | null = null;

  private onEvents(events: GameEvent[]): void {
    const w = this.world;
    this.view.onEvents(events, w);
    const A = this.audio;
    const F = CONFIG.feel;
    for (const e of events) {
      switch (e.type) {
        case 'swing':
          A.play('swing', { variant: e.step });
          break;
        case 'hit':
          A.play('hit', { heavy: e.heavy });
          this.hitStop = Math.max(this.hitStop, e.heavy ? F.hitStopHeavy : F.hitStopLight);
          break;
        case 'immune':
          A.play('hit', { heavy: false, volume: 0.4 });
          break;
        case 'shadeDie':
          A.play('shadeDie', { pan: this.pan(e.x) });
          if (e.kind === 'boss') {
            A.play('bossRoar');
            this.hitStop = 0.25;
          }
          break;
        case 'spawn':
          if (e.kind === 'boss') A.play('bossRoar');
          else A.play('shadeSpawn', { pan: this.pan(e.x) });
          break;
        case 'windup':
          A.play(e.boss ? 'bossRoar' : 'shadeWindup', { pan: this.pan(e.x), volume: e.boss ? 0.6 : 1 });
          break;
        case 'knightHurt':
          A.play('knightHurt');
          this.hitStop = Math.max(this.hitStop, 0.06);
          this.hintsDone.dash = this.hintsDone.dash || false;
          break;
        case 'knightDie':
          A.play('knightDie');
          break;
        case 'dash':
          A.play('dash');
          this.hintsDone.dash = true;
          break;
        case 'flare':
          A.play('flare');
          this.hintsDone.flare = true;
          break;
        case 'ember':
          A.play('ember', { variant: Math.min(10, e.streak) });
          break;
        case 'memory':
          A.play('memory');
          A.duck(3);
          this.ui.showMemory(e.text);
          break;
        case 'hearthHit':
          A.play('hearthHit', { pan: this.pan(e.x) });
          break;
        case 'bossSummon':
          A.play('bossRoar');
          break;
        case 'sunrise':
          A.play('dawn');
          break;
        default:
          break;
      }
    }
  }

  private pan(x: number): number {
    const s = this.view.toScreen(x, 0, 0);
    return Math.max(-1, Math.min(1, (s.x / Math.max(1, window.innerWidth)) * 2 - 1));
  }

  private hints(): void {
    const w = this.world;
    const k = w.knight;
    if (this.flags.capture || this.flags.demo) return;
    const s = this.view.toScreen(k.x, 2.8, k.z);
    const first = w.chIndex === 0;
    const near = w.shades.some((q) => q.state !== 'dead' && Math.hypot(q.x - k.x, q.z - k.z) < 7);
    this.ui.hint('move', '<span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span>', s.x, s.y, first && !this.hintsDone.move && this.state === 'play');
    this.ui.hint('attack', '<span class="key">click</span> strike', s.x, s.y, first && this.hintsDone.move && !this.hintsDone.attack && near);
    const flareWanted = w.t > 22 && w.shades.filter((q) => q.state !== 'dead' && !q.lit).length > 2;
    this.ui.hint('flare', '<span class="key">E</span> flare · the fire leaps, the shadows shrink', s.x, s.y - 34, (w.chIndex <= 1) && this.hintsDone.attack && !this.hintsDone.flare && flareWanted);
    this.ui.hint('dash', '<span class="key">Space</span> shadow-step', s.x, s.y + 60, w.chIndex <= 1 && k.hp < CONFIG.knight.hp && !this.hintsDone.dash);
    if (Math.hypot(k.vx, k.vz) > 1) this.moved += 1 / 60;
    if (this.moved > 1.2) this.hintsDone.move = true;
  }

  frame(): void {
    const now = performance.now();
    const realDt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.stateT += realDt;
    this.ui.tick(realDt);

    // input that works in every state
    const raw = this.bot ? null : this.peekGlobal();
    if (raw?.mute) {
      this.audio.setMuted(!this.audio.muted);
      save('muted', this.audio.muted);
    }

    const w = this.world;
    switch (this.state) {
      case 'title': {
        // the diorama turns slowly at dusk while the menu waits
        const a = this.stateT * 0.06 + 0.6;
        this.view.shot = { pos: new THREE.Vector3(Math.sin(a) * 26, 7.5, Math.cos(a) * 26), target: new THREE.Vector3(0, 2.5, 0), fov: 38 };
        this.view.shotBlend = 1;
        w.t = 6 + this.stateT * 0.2; // hold the sunset
        if (raw) this.ui.navigate(raw.moveY !== 0 && this.navEdge(raw.moveY) ? raw.moveY : 0, raw.confirm);
        if (this.bot && this.stateT > 1.5) this.startNight();
        this.stepWorld(realDt, true);
        break;
      }
      case 'card': {
        const ch = w.chapter;
        const dur = 2.6 + ch.lines.length * 1.3;
        // camera swings from a low 3/4 view down to the diorama
        const p = ease(this.stateT / dur);
        const a = 0.9 - p * 0.9;
        const k = w.knight;
        this.view.shot = {
          pos: new THREE.Vector3(k.x * 0.4 + Math.sin(a) * 22, 6 + p * 14, k.z * 0.4 + Math.cos(a) * 22),
          target: new THREE.Vector3(k.x * 0.4, 1.5, k.z * 0.4),
          fov: 36,
        };
        this.view.shotBlend = 1 - ease((this.stateT - dur + 1.2) / 1.2);
        const skip = (raw?.skip || raw?.attack) && this.stateT > 0.6;
        if (this.stateT > dur || skip || (this.bot && this.stateT > 3)) {
          this.ui.hideCard();
          this.view.shot = null;
          this.ui.showHud(!this.flags.capture);
          this.setState('play');
        }
        this.stepWorld(realDt, true);
        break;
      }
      case 'play': {
        if (raw?.pause) {
          this.pause();
          break;
        }
        this.stepWorld(realDt, false);
        this.hints();
        if (w.status === 'cleared') this.chapterCleared();
        else if (w.status === 'lost') this.lose();
        else if (w.status === 'ending') {
          this.setState('ending');
        }
        break;
      }
      case 'hourEnd': {
        this.stepWorld(realDt, true);
        if (this.stateT > 2.4) {
          const next = w.chIndex + 1;
          if (CHAPTERS[next]?.mode === 'torch' && !this.midnightDone) this.startMidnight();
          else if (next < CHAPTERS.length) this.beginChapter(next);
        }
        break;
      }
      case 'midnight': {
        if (raw?.skip && this.stateT > 1 && this.stateT < 8) this.stateT = 8.4;
        this.updateMidnight(realDt);
        this.stepWorld(realDt, false);
        break;
      }
      case 'lost': {
        this.stepWorld(realDt, false);
        if (raw?.retry || (this.bot && this.stateT > 2.5)) this.retry();
        else if (raw && this.ui.screenOpen) this.ui.navigate(this.navEdge(raw.moveY) ? raw.moveY : 0, raw.confirm);
        break;
      }
      case 'ending': {
        this.stepWorld(realDt, false);
        this.updateEnding(realDt);
        break;
      }
      case 'final':
      case 'paused': {
        if (raw) {
          if (this.state === 'paused' && raw.pause && this.stateT > 0.2) this.resume();
          else this.ui.navigate(this.navEdge(raw.moveY) ? raw.moveY : 0, raw.confirm);
          if (raw.retry && this.state === 'paused') this.retry();
        }
        if (this.bot && this.state === 'final' && this.stateT > 6) this.restart();
        this.view.update(w, 0, realDt);
        break;
      }
    }

    // audio follows the world
    const fireLevel = w.mode === 'hearth' ? (this.view.hearthLit ? Math.min(1, w.fire.h / 3.4) * this.view.hearthPower : 0) : this.view.torchLit ? 0.45 : 0;
    this.audio.setFire(fireLevel + w.flareK() * 0.5);
    this.audio.setDanger(this.state === 'play' ? w.danger() : 0);
    let burning = 0;
    for (const s of w.shades) if (s.state !== 'dead' && s.lit) burning++;
    this.audio.setBurn(Math.min(1, burning / 6));

    if (this.state === 'play' || this.state === 'hourEnd') {
      const ch = w.chapter;
      const hearth = w.mode === 'hearth';
      const res = hearth ? w.fuel / CONFIG.hearth.fuelMax : w.torchEmbers / CONFIG.torch.embersMax;
      this.ui.updateHud({
        clock: clockText(ch, w.progress()),
        title: ch.title,
        flame: res,
        flameLabel: hearth ? 'the hearth' : 'the torch',
        hp: w.knight.hp,
        flareReady: w.flareCd <= 0 && res * 100 >= CONFIG.flare.cost * 0.5,
        flareCost: CONFIG.flare.cost / 100,
        choose: w.mode === 'dawn' ? w.chooseT / CONFIG.dawn.chooseTime : 0,
      });
    }

    // fps
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fpsText = `${Math.round(this.fpsFrames / this.fpsAcc)} fps`;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.ui.setFps(this.flags.debug ? `${this.fpsText} · ${this.state} · ${w.chapter.id} · shades ${w.shades.filter((s) => s.state !== 'dead').length}` : null);

    this.view.render();
  }

  private navLatch = 0;
  private navEdge(dy: number): boolean {
    if (dy === 0) {
      this.navLatch = 0;
      return false;
    }
    if (this.navLatch !== 0) return false;
    this.navLatch = dy;
    return true;
  }

  /** In non-play states, poll input once (in play the sim poll does it). */
  private peekGlobal(): ReturnType<Input['poll']> | null {
    if (this.state === 'play' || this.state === 'midnight' || this.state === 'ending') {
      // play: input is polled with the sim step; read the cached copy after
      return null;
    }
    return this.input.poll();
  }

  private stepWorld(realDt: number, frozen: boolean): void {
    const w = this.world;
    let dt = realDt * this.timeScale;
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      dt = 0;
    }
    if (!frozen && dt > 0) {
      this.acc += dt;
      const step = 1 / 60;
      let n = 0;
      while (this.acc >= step && n < 4) {
        this.acc -= step;
        n++;
        const inp = this.state === 'play' ? this.simInput() : { mx: 0, mz: 0, aimX: w.knight.x, aimZ: w.knight.z + 1, attack: false, dash: false, flare: false };
        if (this.state === 'play' && this.lastRaw) {
          const r = this.lastRaw;
          if (r.attack) this.hintsDone.attack = true;
          if (r.pause) {
            this.pause();
            break;
          }
          if (r.mute) {
            this.audio.setMuted(!this.audio.muted);
            save('muted', this.audio.muted);
          }
          if (r.retry) {
            this.retry();
            return;
          }
          this.lastRaw = null;
        }
        w.step(step, inp);
        if (w.events.length) this.onEvents(w.events);
        if (this.hitStop > 0) break;
      }
      if (n === 0 && this.state === 'play') {
        // keep presses from being lost on a frame with no sim step
      }
    } else if (frozen && this.state !== 'play') {
      // the world idles for cards and the title: keep the light and shadows alive
      w.step(0, { mx: 0, mz: 0, aimX: w.knight.x, aimZ: w.knight.z + 1, attack: false, dash: false, flare: false });
    }
    this.view.update(w, dt, realDt);
  }
}
