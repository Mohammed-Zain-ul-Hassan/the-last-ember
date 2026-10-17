// What to do next, district by district: one quiet line at a time, and where the flame's ember should lead.
// A step is done when its flag is set (the sim sets flags for resting `rest:<id>`, finding `found:<id>`, waking
// `woke:<id>`, reading `read:<id>`, and every puzzle's own). `at` is where the ember goes: a point, or a function of
// the city (the next merchant, the next page, the next plate). `via` are corners on the way, in walking order.

import type { City } from '../sim/city';
import { MERCHANTS } from './market';
import { PAGES } from './library';
import { HEART, PLATE_AT } from './heart';
import { standFor } from '../bot';

export type At = [number, number] | ((c: City) => [number, number] | null);
export interface Objective {
  text: string | ((c: City) => string);
  done: string | ((c: City) => boolean);
  at: At;
  via?: [number, number][];
}

/** Where to stand for a figure's true angle (the same spot the bot finds). */
const standAt = (c: City, id: string): [number, number] | null => {
  const f = c.d.figures.find((x) => x.id === id);
  if (!f) return null;
  const st = standFor(f.light, Math.atan2(f.z - f.light[2], f.x - f.light[0]), false);
  return [st.x, st.z];
};
const figAt = (c: City, id: string): [number, number] | null => {
  const i = c.d.figures.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const p = c.placeOf(i);
  return [p.x, p.z];
};
const replaying = (c: City, id: string): boolean => {
  const i = c.d.figures.findIndex((x) => x.id === id);
  return i >= 0 && c.s.figs[i].state === 'replay';
};
const brazier = (c: City, id: string): [number, number] | null => {
  const b = c.d.braziers.find((x) => x.id === id);
  return b ? [b.x, b.z] : null;
};

export const OBJECTIVES: Record<string, Objective[]> = {
  gate: [
    { text: 'Rest by the brazier. It keeps your Ash, and your place.', done: 'rest:ward', at: (c) => brazier(c, 'ward') },
    { text: 'Follow the passage. Look for a shadow on the wall, reaching for something.', done: 'found:lever', at: (c) => standAt(c, 'lever'), via: [[8, 0], [12, 0], [19, -0.5]] },
    { text: 'Wake his shadow: E (1 Ash). Watch what he does.', done: 'woke:lever', at: (c) => figAt(c, 'lever') },
    {
      text: (c) => (replaying(c, 'lever') ? 'Hold E now to step into his last ten seconds. Do what he did: the lever behind the pillar.' : 'Wake him again (E) from his true angle, and while he moves, hold E to step in.'),
      done: 'lever',
      at: (c) => (c.s.ghost ? [27.9, 3.0] : replaying(c, 'lever') ? figAt(c, 'lever') : standAt(c, 'lever')),
    },
    { text: 'The portcullis is up. Rest at the brazier in the court beyond.', done: 'rest:court', at: (c) => brazier(c, 'court'), via: [[31, 0], [35.5, 0]] },
    { text: 'Two guards held the gate shut. Find the angle each was lit from, and wake them both.', done: (c) => c.flag('woke:second') && c.flag('woke:watch'), at: (c) => (c.flag('woke:second') ? standAt(c, 'watch') : standAt(c, 'second')) },
    {
      text: (c) => (replaying(c, 'second') || replaying(c, 'watch') ? 'Hold E now: step into his replay and lift the bar.' : 'Wake one of them again (E), and while he moves, hold E to step in and lift the bar.'),
      done: 'bar',
      at: (c) => (c.s.ghost ? [56.6, 0] : replaying(c, 'second') ? figAt(c, 'second') : replaying(c, 'watch') ? figAt(c, 'watch') : standAt(c, 'watch')),
    },
    { text: 'Through the gate, into the city.', done: 'never', at: [62, 0] },
  ],
  market: [
    { text: 'Rest by the brazier.', done: 'rest:square', at: (c) => brazier(c, 'square') },
    {
      text: (c) => `Three merchants weigh their last goods (${MERCHANTS.filter((_, i) => c.flag(`scale${i + 1}`)).length} of 3 balanced). A pan balances when his shadow covers it just so: raise the flame (look up) to shorten it, lower it to lengthen it.`,
      done: 'weights',
      at: (c) => {
        const i = MERCHANTS.findIndex((_, k) => !c.flag(`scale${k + 1}`));
        if (i < 0) return null;
        const m = MERCHANTS[i];
        const st = standFor(m.light, 0, false);
        return [st.x, st.z];
      },
    },
    { text: 'The shutter is open. Go down to the dry canal.', done: 'found:beggar', at: (c) => standAt(c, 'beggar'), via: [[31, 0], [34, 0.5]] },
    { text: 'The beggar knew a way across. Wake him (E) and watch how he goes.', done: 'woke:beggar', at: (c) => figAt(c, 'beggar') },
    { text: 'Cross on your own shadow: hold Shift to draw the flame back, look down to stretch your shadow to the far bank, and walk on it.', done: 'crossed', at: [47, 0] },
    { text: 'Rest at the brazier on the far bank.', done: 'rest:bank', at: (c) => brazier(c, 'bank') },
    { text: 'The street ahead will fall. Run, and bridge each gap with your shadow (Shift, look down).', done: 'rest:end', at: (c) => brazier(c, 'end'), via: [[58, 0], [63.4, 0], [68, 0], [72.4, 0], [77, 0], [79.4, 0], [83.6, 0], [87.5, 0]] },
    { text: 'Onward.', done: 'never', at: [94.2, 0] },
  ],
  temple: [
    { text: 'Rest by the brazier in the porch.', done: 'rest:porch', at: (c) => brazier(c, 'porch') },
    { text: 'Read what is carved on the vault door.', done: 'read:temple', at: [38, 0.5], via: [[11, 0], [14, 0]] },
    {
      text: (c) => `Wake the priests in the order of their last hours: idle, fleeing, praying, looking up (${c.s.seq[0] ?? 0} of 4). It costs four of your five Ash.`,
      done: 'vault',
      at: (c) => standAt(c, ['idle', 'flee', 'pray', 'up'][c.s.seq[0] ?? 0] ?? 'idle'),
    },
    { text: 'In the court the roof is open. Throw the gnomon’s shadow along the shaft of light.', done: 'dial', at: [49.4, -0.3], via: [[41, 0], [46, 0]] },
    { text: 'One brazier burns a cold blue. Rest at the warm one.', done: 'rest:court', at: (c) => brazier(c, 'court') },
    { text: 'Through the pillars. Keep the flame lit; keep it on you.', done: 'never', at: [86, 0], via: [[61, 0], [64, 0], [70, 0], [77, 0]] },
  ],
  library: [
    { text: 'Rest by the brazier.', done: 'rest:door', at: (c) => brazier(c, 'door') },
    {
      text: (c) => `Seven pages, carved in relief (${PAGES.filter((p) => c.flag(p.id)).length} of 7 read). From the side they lie. Stand at a lectern and look up: hold the flame directly above the page.`,
      done: 'pages',
      at: (c) => {
        const p = PAGES.find((pg) => !c.flag(pg.id));
        return p ? [p.x - 0.75, p.z] : null;
      },
      via: [[10, 0]],
    },
    { text: 'The shelves’ shadows are walls here. Hold the flame high (look up) and the way out opens.', done: 'chase', at: [63.2, 0], via: [[42.5, 0], [45.6, 0], [46.5, 4], [49.6, 4], [50.5, -4], [53.6, -4], [54.5, 1.5], [57.6, 1.5], [58.5, -1], [60.6, -0.4]] },
    { text: 'Rest at the warm brazier. Not the other one.', done: 'rest:stacks', at: (c) => brazier(c, 'stacks') },
    { text: 'Climb the stacks. Do not let it reach you.', done: 'never', at: [88.5, 0], via: [[66.5, -6.4], [72.5, -6.4], [74.5, 6.4], [80.5, 6.4], [83, 0]] },
  ],
  heart: [
    { text: 'Rest by the brazier.', done: 'rest:gate', at: (c) => brazier(c, 'gate') },
    {
      text: (c) => {
        const n = ['p1', 'p2', 'p3', 'p4', 'p5'].filter((p) => c.flag(p)).length;
        const next = ['p1', 'p2', 'p3', 'p4', 'p5'].find((p) => !c.flag(p));
        const how: Record<string, string> = {
          p1: 'The soldier: find the angle he was lit from.',
          p2: 'The post: go beyond it and hold the flame low, so its shadow reaches the plate.',
          p3: 'The three: light them in order: the old first, then the one who danced, the child last.',
          p4: 'The page: read it from directly above.',
          p5: 'The last plate: draw the flame back (Shift) and let your own shadow fall on it.',
        };
        return `Five plates, five lessons (${n} of 5). ${next ? how[next] : ''}`;
      },
      done: 'plates',
      at: (c) => {
        const k = ['p1', 'p2', 'p3', 'p4', 'p5'].findIndex((p) => !c.flag(p));
        if (k < 0) return null;
        if (k === 0) return standAt(c, 'soldier');
        if (k === 1) {
          const a = (162 * Math.PI) / 180;
          return [HEART.x + Math.cos(a) * 14.2, Math.sin(a) * 14.2];
        }
        if (k === 2) return standAt(c, ['old', 'dancer', 'twin'][c.s.seq[0] ?? 0] ?? 'old');
        if (k === 3) return [PLATE_AT[3][0] - 0.6, PLATE_AT[3][1] - 0.9];
        return [HEART.x + 4.6, HEART.z + 2.3];
      },
    },
    {
      text: 'The stones part on the far side. Run round the Heart to its centre, where the flame was first lit. Keep the light on what follows you.',
      done: 'heart',
      at: [HEART.x, HEART.z + 1.1],
      via: [[HEART.x - 10.5, HEART.z - 2], [HEART.x - 9, HEART.z + 7], [HEART.x - 3, HEART.z + 9.5], [HEART.x, HEART.z + 5]],
    },
  ],
};
