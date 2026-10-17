import { LAST_WORDS, WORDS_BY_DISTRICT } from '../../data/stillCity';
import { persist, save, type HintMode } from '../save';

// The pause menu: resume, the hint setting (Off / Gentle / Guided, default Guided, changeable at any time), the
// journal of Last Words, the controls, sound, and a way back to the last brazier.

const DISTRICTS = ['The Gate Ward', 'The Market of Weights', 'The Temple of Hours', 'The Library of Whispers', 'The Heart'];

export interface MenuHooks {
  resume(): void;
  lastBrazier(): void;
  mute(on: boolean): void;
  captions(): void;
}

export class StillMenu {
  private root: HTMLElement;
  open = false;
  private hooks: MenuHooks;

  constructor(hooks: MenuHooks) {
    this.hooks = hooks;
    this.root = document.createElement('div');
    this.root.id = 'sc-menu';
    document.body.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  show(page: 'main' | 'journal' | 'controls' = 'main'): void {
    this.open = true;
    this.root.classList.add('on');
    if (page === 'journal') this.journal();
    else if (page === 'controls') this.controls();
    else this.main();
  }

  hide(): void {
    this.open = false;
    this.root.classList.remove('on');
  }

  private button(parent: HTMLElement, text: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    parent.appendChild(b);
    return b;
  }

  private main(): void {
    this.root.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'panel';
    this.root.appendChild(p);
    p.insertAdjacentHTML('beforeend', '<h2>THE STILL CITY</h2>');
    this.button(p, 'Resume', () => this.hooks.resume()).focus();
    p.insertAdjacentHTML('beforeend', '<div class="label">HINTS</div><div class="note">The flame whispers when you are stuck. Gentle: only a glow or a flicker. Guided: all three tiers.</div>');
    const row = document.createElement('div');
    row.className = 'row';
    p.appendChild(row);
    for (const [mode, label] of [['off', 'Off'], ['gentle', 'Gentle'], ['guided', 'Guided']] as [HintMode, string][])
      this.button(row, label, () => {
        save.hints = mode;
        persist();
        this.main();
      }, save.hints === mode ? 'sel' : '');
    p.insertAdjacentHTML('beforeend', '<div class="label">CAPTIONS</div>');
    const c = save.captions;
    const set = (fn: () => void) => () => {
      fn();
      persist();
      this.hooks.captions();
      this.main();
    };
    const r1 = document.createElement('div');
    r1.className = 'row';
    p.appendChild(r1);
    this.button(r1, 'On', set(() => (c.on = true)), c.on ? 'sel' : '');
    this.button(r1, 'Off', set(() => (c.on = false)), !c.on ? 'sel' : '');
    this.button(r1, c.cues ? 'Sound cues: on' : 'Sound cues: off', set(() => (c.cues = !c.cues)));
    const r2 = document.createElement('div');
    r2.className = 'row';
    p.appendChild(r2);
    for (const [v, label] of [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] as const) this.button(r2, label, set(() => (c.size = v)), c.size === v ? 'sel' : '');
    const r3 = document.createElement('div');
    r3.className = 'row';
    p.appendChild(r3);
    for (const [v, label] of [[0, 'No backing'], [0.45, 'Soft backing'], [0.75, 'Dark backing']] as const) this.button(r3, label, set(() => (c.bg = v)), Math.abs(c.bg - v) < 0.01 ? 'sel' : '');
    p.insertAdjacentHTML('beforeend', '<div class="label">&nbsp;</div>');
    this.button(p, 'Last Words', () => this.journal());
    this.button(p, 'Controls', () => this.controls());
    this.button(p, save.muted ? 'Sound: off' : 'Sound: on', () => {
      save.muted = !save.muted;
      persist();
      this.hooks.mute(save.muted);
      this.main();
    });
    this.button(p, 'Return to the last brazier', () => this.hooks.lastBrazier());
  }

  private journal(): void {
    this.root.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'panel';
    this.root.appendChild(p);
    const n = save.words.filter(Boolean).length;
    p.insertAdjacentHTML('beforeend', `<h2>LAST WORDS &nbsp;${n} / 36</h2>`);
    const j = document.createElement('div');
    j.className = 'journal';
    p.appendChild(j);
    WORDS_BY_DISTRICT.forEach(([a, b], d) => {
      j.insertAdjacentHTML('beforeend', `<div class="d">${DISTRICTS[d].toUpperCase()}</div>`);
      for (let i = a; i < b; i++) {
        const w = LAST_WORDS[i];
        const known = save.words[i];
        j.insertAdjacentHTML(
          'beforeend',
          known ? `<div class="w"><span class="n">${i + 1}</span>&ldquo;${w.line}&rdquo; <span class="who">${w.who}</span></div>` : `<div class="w unk"><span class="n">${i + 1}</span>&mdash;</div>`,
        );
      }
    });
    this.button(p, 'Back', () => this.main()).focus();
  }

  private controls(): void {
    this.root.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'panel';
    this.root.appendChild(p);
    p.insertAdjacentHTML(
      'beforeend',
      `<h2>CONTROLS</h2><div class="keys">
      <div><b>W A S D</b>walk (relative to the view)</div>
      <div><b>MOVE THE MOUSE</b>look; the flame follows: look up to lift it, swing to sweep every shadow</div>
      <div><b>WHEEL</b>raise or lower the flame a little</div>
      <div><b>SHIFT (HOLD)</b>draw the flame back: your shadow runs ahead of you</div>
      <div><b>E / CLICK</b>wake a shadow at its true angle (1 Ash) &middot; rest, relight, read</div>
      <div><b>HOLD E</b>step into a replay (2 Ash)</div>
      <div><b>HOLD R</b>rewind five seconds (1 Ash)</div>
      <div><b>RIGHT CLICK</b>Flame Lock: turn the light on the Wrong Shadow</div>
      <div><b>H</b>ask the flame</div>
      <div><b>ESC</b>pause</div></div>`,
    );
    this.button(p, 'Back', () => this.main()).focus();
  }
}
