import type { Line } from '../../data/stillCity';
import { save } from '../save';

// Captions for everything the player hears. Each speaker has a look: the narrator (pale, italic), the flame (warm,
// with an ember mark, close by), the Wrong Shadow (cold, spaced capitals), Last Words (the speaker named above),
// inscriptions, and sound cues in brackets ([the music stops]). Three lanes: the story, the whispers, the sounds.
// Each lane is a queue ordered by priority (3 action beat, 2 story, 1 whisper, 0 sound): a higher line never waits
// behind a lower one, and cuts a lower one short. Shown for as long as it takes to read. The band sits low on the
// screen, under the knight and his flame, on a backing the player can darken; size, backing, sound cues and the
// captions themselves are settings (pause menu), on by default.

interface Item {
  html: string;
  cls: string;
  id: string;
  priority: number;
  dur: number;
  ttl: number; // seconds it may wait in the queue before it is no longer worth saying
}
interface Lane {
  box: HTMLElement;
  queue: Item[];
  cur: { el: HTMLElement; item: Item; left: number } | null;
}

const read = (text: string, voice: string) => Math.min(9, Math.max(2.3, 1.4 + text.length * 0.062 + (voice === 'word' ? 1 : 0)));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Captions {
  readonly root: HTMLElement;
  private story: Lane;
  private whisper: Lane;
  private sound: Lane;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'sc-caps';
    document.body.appendChild(this.root);
    const lane = (cls: string): Lane => {
      const box = document.createElement('div');
      box.className = 'lane ' + cls;
      this.root.appendChild(box);
      return { box, queue: [], cur: null };
    };
    this.sound = lane('sound');
    this.whisper = lane('whisper');
    this.story = lane('story');
    this.apply();
  }

  /** Apply the caption settings (size, backing). */
  apply(): void {
    const c = save.captions;
    this.root.style.setProperty('--cap-scale', String(c.size === 'small' ? 0.85 : c.size === 'large' ? 1.3 : 1));
    this.root.style.setProperty('--cap-bg', String(c.bg));
    this.root.classList.toggle('off', !c.on);
  }

  say(line: Line, priority = 2, laneName?: 'story' | 'whisper' | 'sound'): void {
    if (line.voice === 'cue' && !save.captions.cues) return;
    const lane = laneName ? this[laneName] : line.voice === 'cue' ? this.sound : line.voice === 'flame' ? this.whisper : this.story;
    const html =
      line.voice === 'word' || line.voice === 'inscription'
        ? `<span class="who">${esc(line.who ?? '')}</span>${line.voice === 'word' ? '&ldquo;' : ''}${esc(line.text)}${line.voice === 'word' ? '&rdquo;' : ''}`
        : esc(line.text);
    this.push(lane, { html, cls: line.voice, id: line.id, priority, dur: read(line.text, line.voice), ttl: line.voice === 'cue' ? 4 : priority >= 3 ? 20 : 14 });
  }

  /** A plain note (how to do something, why something failed): whisper lane, shown at once. */
  note(text: string, priority = 1): void {
    this.push(this.whisper, { html: esc(text), cls: 'note', id: 'note:' + text, priority, dur: read(text, 'note'), ttl: 10 });
  }

  private push(lane: Lane, item: Item): void {
    if (lane.cur?.item.id === item.id || lane.queue.some((q) => q.id === item.id)) return;
    lane.queue.push(item);
    // highest priority first; equal priorities keep their order
    lane.queue.sort((a, b) => b.priority - a.priority);
    // a more urgent line cuts the one on screen short (and that one comes back after it, for what it had left);
    // a Last Word is never cut: it is the one thing in the game that is only ever said once
    const cur = lane.cur;
    if (cur && item.priority > cur.item.priority && cur.item.cls !== 'word' && cur.left > 0.3) {
      lane.queue.push({ ...cur.item, dur: Math.max(1.4, cur.left + 0.6), priority: cur.item.priority, ttl: 12 });
      lane.queue.sort((a, b) => b.priority - a.priority);
      cur.left = 0.25;
    }
  }

  get speaking(): boolean {
    return !!this.story.cur || this.story.queue.length > 0;
  }

  clear(): void {
    for (const l of [this.story, this.whisper, this.sound]) {
      l.queue = [];
      if (l.cur) l.cur.left = Math.min(l.cur.left, 0.4);
    }
  }

  update(dt: number): void {
    for (const l of [this.story, this.whisper, this.sound]) {
      // lines that waited too long are no longer worth saying (a sound long gone, a moment passed)
      for (const q of l.queue) q.ttl -= dt;
      l.queue = l.queue.filter((q) => q.ttl > 0);
      if (l.cur) {
        l.cur.left -= dt;
        if (l.cur.left <= 0) {
          const el = l.cur.el;
          el.classList.remove('on');
          setTimeout(() => el.remove(), 450);
          l.cur = null;
        }
      }
      if (!l.cur && l.queue.length) {
        const item = l.queue.shift()!;
        const el = document.createElement('div');
        el.className = 'cap ' + item.cls;
        el.dataset.line = item.id;
        el.innerHTML = item.html;
        l.box.appendChild(el);
        requestAnimationFrame(() => el.classList.add('on'));
        l.cur = { el, item, left: item.dur };
      }
    }
  }
}
