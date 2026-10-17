import './still.css';
import type { Line } from '../../data/stillCity';

// The HUD. Captions are voice-ready: each carries its line id (data-line) so recorded audio can be matched later.
// Two caption slots: the main one (the narrator, Last Words, the Wrong Shadow) plays its queue in order; the side
// one (the flame's whispers, short notes) can speak over it.

const el = (tag: string, cls: string, parent: HTMLElement, html = ''): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
};

interface Slot {
  box: HTMLElement;
  queue: { line: Line | null; text: string; cls: string; dur: number }[];
  cur: HTMLElement | null;
  left: number;
}

export class StillHud {
  readonly root: HTMLElement;
  private vitals: HTMLElement;
  private flameIco: HTMLElement;
  private pips: HTMLElement[] = [];
  private words: HTMLElement;
  private promptEl: HTMLElement;
  private promptText: HTMLElement;
  private promptKey: HTMLElement;
  private promptFill: HTMLElement;
  private promptKeyLabel: Text;
  private promptCost: HTMLElement;
  private main: Slot;
  private side: Slot;
  private cardEl: HTMLElement;
  private cardT = 0;
  private riddleEl: HTMLElement;
  private riddleT = 0;
  private timerEl: HTMLElement;
  private timerFill: HTMLElement;
  private timerLabel: HTMLElement;
  private veilEl: HTMLElement;
  private cold: HTMLElement;
  private warmEl: HTMLElement;
  private lastAsh = -1;
  private objEl: HTMLElement;
  private objText = '';
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private ringLabel: HTMLElement;
  private bars: HTMLElement;
  private promptKeyText = '';

  constructor() {
    this.root = el('div', '', document.body);
    this.root.id = 'sc';
    this.cold = el('div', 'vignette', this.root);
    this.warmEl = el('div', 'warm', this.root);
    this.vitals = el('div', 'vitals', this.root);
    this.flameIco = el('div', 'flame-ico', this.vitals, '<i></i>');
    const ash = el('div', 'ash', this.vitals);
    el('div', 'ash-label', ash, 'ASH');
    const pips = el('div', 'pips', ash);
    for (let i = 0; i < 5; i++) this.pips.push(el('div', 'pip', pips));
    this.words = el('div', 'words', this.root);
    this.timerEl = el('div', 'timer', this.root);
    this.timerFill = el('i', '', this.timerEl);
    this.timerLabel = el('span', '', this.timerEl);
    const caps = el('div', 'captions', this.root);
    this.main = { box: el('div', '', caps), queue: [], cur: null, left: 0 };
    this.side = { box: el('div', '', caps), queue: [], cur: null, left: 0 };
    this.promptEl = el('div', 'prompt', this.root);
    this.promptKey = el('span', 'key', this.promptEl);
    this.promptFill = el('span', 'fill', this.promptKey);
    this.promptKeyLabel = document.createTextNode('E');
    this.promptKey.appendChild(this.promptKeyLabel);
    this.promptText = el('span', '', this.promptEl);
    this.promptCost = el('span', 'cost', this.promptEl);
    this.cardEl = el('div', 'card', this.root);
    this.riddleEl = el('div', 'riddle', this.root);
    this.veilEl = el('div', 'veil', this.root);
    this.objEl = el('div', 'objective', this.root);
    this.ring = el('div', 'align', this.root, '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg"/></svg><span></span>');
    this.ringArc = this.ring.querySelector('.fg') as SVGCircleElement;
    this.ringLabel = this.ring.querySelector('span')!;
    this.bars = el('div', 'bars', this.root, '<i></i><i></i>');
  }

  show(on: boolean): void {
    this.vitals.style.opacity = on ? '1' : '0';
    this.words.style.opacity = on ? '0.55' : '0';
  }

  setAsh(n: number): void {
    if (n === this.lastAsh) return;
    const was = this.lastAsh;
    this.lastAsh = n;
    this.pips.forEach((p, i) => {
      p.classList.toggle('on', i < n);
      // the pips just spent flare once as they go
      if (was > n && i >= n && i < was) {
        p.classList.add('spent');
        setTimeout(() => p.classList.remove('spent'), 450);
      }
    });
  }

  setFlame(state: 'steady' | 'low' | 'out', vigor: number): void {
    this.flameIco.className = 'flame-ico ' + state;
    (this.flameIco.firstElementChild as HTMLElement).style.scale = String(0.55 + 0.45 * Math.max(0, vigor));
  }

  setWords(n: number, total: number): void {
    const t = `LAST WORDS <b>${n}</b> / ${total}`;
    if (this.words.innerHTML !== t) this.words.innerHTML = t;
  }

  /** What E does here. hold: 0..1 progress of a held press (stepping in). */
  prompt(text: string | null, key = 'E', cost = '', hold = 0): void {
    this.promptEl.classList.toggle('on', !!text);
    if (!text) return;
    if (this.promptText.textContent !== text) this.promptText.textContent = text;
    if (this.promptKeyText !== key) {
      this.promptKeyText = key;
      this.promptKeyLabel.data = key;
    }
    if (this.promptCost.textContent !== cost) this.promptCost.textContent = cost;
    this.promptFill.style.transform = `scaleX(${hold})`;
  }

  /** A line spoken: queued in its slot, shown for as long as it takes to read. */
  say(line: Line): void {
    const cls = line.voice;
    const text = line.voice === 'word' && line.who ? `<span class="who">${line.who}</span>&ldquo;${line.text}&rdquo;` : line.voice === 'wrong' ? line.text : line.text;
    const slot = line.voice === 'flame' ? this.side : this.main;
    const dur = 2.2 + line.text.length * 0.055 + (line.voice === 'word' ? 1 : 0);
    if (slot.queue.some((q) => q.line?.id === line.id) || slot.cur?.dataset.line === line.id) return;
    slot.queue.push({ line, text, cls, dur });
  }

  /** A plain note (what something says when tried, or why it failed). */
  note(text: string): void {
    if (this.side.cur?.textContent === text) return;
    this.side.queue = this.side.queue.filter((q) => q.cls !== 'note');
    this.side.queue.unshift({ line: null, text, cls: 'note', dur: 2.6 + text.length * 0.04 });
    if (this.side.cur?.classList.contains('note')) this.side.left = 0;
  }

  /** Is the narrator (or anyone in the main slot) still speaking? */
  get speaking(): boolean {
    return !!this.main.cur || this.main.queue.length > 0;
  }

  clearCaptions(): void {
    for (const s of [this.main, this.side]) {
      s.queue = [];
      s.left = 0;
    }
  }

  card(num: string, title: string, sub: string, dur = 5.5): void {
    this.cardEl.innerHTML = `<div class="num">${num}</div><div class="title">${title}</div><div class="sub">${sub}</div>`;
    this.cardEl.classList.add('on');
    this.cardT = dur;
  }

  riddle(where: string, text: string): void {
    this.riddleEl.innerHTML = `<div class="where">${where}</div><div class="text">&ldquo;${text}&rdquo;</div>`;
    this.riddleEl.classList.add('on');
    this.riddleT = 6.5;
  }

  hideRiddle(): void {
    this.riddleT = Math.min(this.riddleT, 0.01);
  }

  timer(k: number | null, label = ''): void {
    this.timerEl.classList.toggle('on', k !== null);
    if (k === null) return;
    this.timerFill.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
    if (this.timerLabel.textContent !== label) this.timerLabel.textContent = label;
  }

  /** The quiet line that says what to do next (empty hides it). */
  objective(text: string): void {
    if (text === this.objText) return;
    this.objText = text;
    this.objEl.classList.remove('on');
    setTimeout(() => {
      if (this.objText !== text) return;
      this.objEl.textContent = text;
      if (text) this.objEl.classList.add('on');
    }, 500);
  }

  /** The warmth ring: how near the flame is to a shadow's true angle (null hides it). */
  align(k: number | null): void {
    this.ring.classList.toggle('on', k !== null);
    if (k === null) return;
    const c = 2 * Math.PI * 18;
    this.ringArc.style.strokeDasharray = `${c * k} ${c}`;
    const label = k > 0.93 ? 'there' : k > 0.75 ? 'almost' : k > 0.45 ? 'closer' : 'his shadow stirs';
    if (this.ringLabel.textContent !== label) this.ringLabel.textContent = label;
    this.ring.style.setProperty('--warm', String(k));
  }

  /** Letterbox bars for the director's shots. */
  letterbox(on: boolean): void {
    this.bars.classList.toggle('on', on);
  }

  /** A pale flash (a rewind). */
  flash(): void {
    this.veilEl.style.transition = 'none';
    this.veilEl.style.background = '#cfd6ff';
    this.veilEl.style.opacity = '0.35';
    requestAnimationFrame(() => {
      this.veilEl.style.transition = 'opacity 0.7s';
      this.veilEl.style.opacity = '';
      setTimeout(() => (this.veilEl.style.background = ''), 750);
    });
  }

  veil(on: boolean): void {
    this.veilEl.classList.toggle('on', on);
  }

  /** The cold at the edges (the Wrong Shadow near), the warmth at the edges (a true angle near). */
  mood(cold: number, warm: number): void {
    this.cold.style.opacity = String(Math.max(0, Math.min(1, cold)));
    this.warmEl.style.opacity = String(Math.max(0, Math.min(1, warm)));
  }

  update(dt: number): void {
    for (const s of [this.main, this.side]) {
      if (s.cur) {
        s.left -= dt;
        if (s.left <= 0) {
          const c = s.cur;
          c.classList.remove('on');
          setTimeout(() => c.remove(), 900);
          s.cur = null;
        }
      }
      if (!s.cur && s.queue.length) {
        const q = s.queue.shift()!;
        const c = el('div', 'cap ' + q.cls, s.box, q.text);
        if (q.line) c.dataset.line = q.line.id;
        requestAnimationFrame(() => c.classList.add('on'));
        s.cur = c;
        s.left = q.dur;
      }
    }
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.cardEl.classList.remove('on');
    }
    if (this.riddleT > 0) {
      this.riddleT -= dt;
      if (this.riddleT <= 0) this.riddleEl.classList.remove('on');
    }
  }
}
