// What to do next, district by district: one quiet line at a time, and where the flame's ember should lead.
// Each line is ONE short instruction (Moeez: "broken into parts and displayed where necessary"): a step with several
// actions shows them one by one, each as it applies (walk to the ring -> find his angle -> press E -> hold E -> do it).
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
  /** The figure whose true angle this step is about: a ring of light marks where to stand, and the flame coaches. */
  stand?: string | ((c: City) => string | null);
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
/** "Do this." + 1 of 2 -> "Do this (1 of 2)." */
const of = (step: string, n: number, m: number, unit = ''): string => `${step.replace(/[.!]$/, '')} (${unit}${n} of ${m}).`;
const near = (c: City, p: [number, number] | null, r: number): boolean => !!p && Math.hypot(c.s.body.x - p[0], c.s.body.z - p[1]) < r;
const figState = (c: City, id: string) => c.s.figs[c.d.figures.findIndex((x) => x.id === id)];
/** Rest at a brazier: walk to it, then press E. */
const rest = (where: string) => (c: City, id: string) => (near(c, brazier(c, id), 2.2) ? 'Press E to rest.' : where);
/** Toward a figure's true angle, one step at a time: the ring, the angle, the key. */
function wake(c: City, id: string, who: string, key = 'Press E to wake him.'): string {
  if (figState(c, id)?.locked) return key;
  if (near(c, standAt(c, id), 1.3)) return 'Move the flame until the ring glows.';
  return `Step into the ring of light by ${who}.`;
}
/** A replay to step into and an act to repeat in it. */
function stepIn(c: City, ids: string[], who: string, act: string): string {
  if (c.s.ghost) return act;
  if (ids.some((id) => replaying(c, id))) return 'Hold E to step into his replay.';
  const id = ids.find((x) => near(c, standAt(c, x), 1.3)) ?? ids[ids.length - 1];
  return wake(c, id, who, 'Press E to wake him again.');
}

export const OBJECTIVES: Record<string, Objective[]> = {
  gate: [
    { text: (c) => rest('Walk to the brazier.')(c, 'ward'), done: 'rest:ward', at: (c) => brazier(c, 'ward') },
    { text: (c) => (near(c, standAt(c, 'lever'), 5) ? wake(c, 'lever', 'the guard', 'Press E to wake his shadow.') : 'Follow the passage.'), done: 'found:lever', at: (c) => standAt(c, 'lever'), via: [[8, 0], [12, 0], [19, -0.5]], stand: 'lever' },
    { text: (c) => (replaying(c, 'lever') ? 'Watch what he does.' : 'Press E to wake his shadow (1 Ash).'), done: 'woke:lever', at: (c) => figAt(c, 'lever') },
    {
      text: (c) => stepIn(c, ['lever'], 'the guard', 'Pull the lever behind the pillar.'),
      done: 'lever',
      at: (c) => (c.s.ghost ? [27.9, 3.0] : replaying(c, 'lever') ? figAt(c, 'lever') : standAt(c, 'lever')),
      stand: (c) => (c.s.ghost || replaying(c, 'lever') ? null : 'lever'),
    },
    { text: (c) => rest('Go through to the next brazier.')(c, 'court'), done: 'rest:court', at: (c) => brazier(c, 'court'), via: [[31, 0], [35.5, 0]] },
    {
      text: (c) => {
        const id = c.flag('woke:second') ? 'watch' : 'second';
        const n = c.flag('woke:second') ? 2 : 1;
        return of(wake(c, id, n === 1 ? 'the first guard' : 'the second guard'), n, 2);
      },
      done: (c) => c.flag('woke:second') && c.flag('woke:watch'),
      at: (c) => (c.flag('woke:second') ? standAt(c, 'watch') : standAt(c, 'second')),
      stand: (c) => (c.flag('woke:second') ? 'watch' : 'second'),
    },
    {
      text: (c) => stepIn(c, ['second', 'watch'], 'a guard', 'Lift the bar.'),
      done: 'bar',
      at: (c) => (c.s.ghost ? [56.6, 0] : replaying(c, 'second') ? figAt(c, 'second') : replaying(c, 'watch') ? figAt(c, 'watch') : standAt(c, 'watch')),
      stand: (c) => (c.s.ghost || replaying(c, 'second') || replaying(c, 'watch') ? null : 'watch'),
    },
    { text: 'Go through the gate.', done: 'never', at: [62, 0] },
  ],
  market: [
    { text: (c) => rest('Walk to the brazier.')(c, 'square'), done: 'rest:square', at: (c) => brazier(c, 'square') },
    {
      text: (c) => {
        const i = MERCHANTS.findIndex((_, k) => !c.flag(`scale${k + 1}`));
        const m = MERCHANTS[i];
        if (!m) return '';
        const st = standFor(m.light, 0, false);
        const step = near(c, [st.x, st.z], 1.3) ? 'Look up or down until his pan balances.' : 'Step into the ring by the next merchant.';
        return of(step, i + 1, 3);
      },
      done: 'weights',
      at: (c) => {
        const i = MERCHANTS.findIndex((_, k) => !c.flag(`scale${k + 1}`));
        if (i < 0) return null;
        const m = MERCHANTS[i];
        const st = standFor(m.light, 0, false);
        return [st.x, st.z];
      },
      stand: (c) => MERCHANTS.find((_, k) => !c.flag(`scale${k + 1}`))?.id ?? null,
    },
    { text: (c) => (near(c, standAt(c, 'beggar'), 5) ? wake(c, 'beggar', 'the beggar') : 'Go down to the dry canal.'), done: 'found:beggar', at: (c) => standAt(c, 'beggar'), via: [[31, 0], [34, 0.5]], stand: 'beggar' },
    { text: (c) => (replaying(c, 'beggar') ? 'Watch how he crosses.' : 'Press E to wake the beggar.'), done: 'woke:beggar', at: (c) => figAt(c, 'beggar') },
    { text: (c) => (c.s.bridge.on ? 'Walk across on your shadow.' : c.s.flame.back ? 'Look down: stretch your shadow to the far bank.' : 'Hold Shift to draw the flame back.'), done: 'crossed', at: [47, 0] },
    { text: (c) => rest('Walk to the brazier on the far bank.')(c, 'bank'), done: 'rest:bank', at: (c) => brazier(c, 'bank') },
    {
      text: (c) => (near(c, brazier(c, 'end'), 2.2) ? 'Press E to rest.' : c.s.bridge.on ? 'Run across.' : c.s.flame.back ? 'Look down: bridge the gap.' : 'Run! Hold Shift at each gap.'),
      done: 'rest:end',
      at: (c) => brazier(c, 'end'),
      via: [[58, 0], [63.4, 0], [68, 0], [72.4, 0], [77, 0], [79.4, 0], [83.6, 0], [87.5, 0]],
    },
    { text: 'Go on.', done: 'never', at: [94.2, 0] },
  ],
  temple: [
    { text: (c) => rest('Walk to the brazier in the porch.')(c, 'porch'), done: 'rest:porch', at: (c) => brazier(c, 'porch') },
    { text: (c) => (near(c, [38, 0.5], 2.5) ? 'Press E to read the carving.' : 'Go to the vault door.'), done: 'read:temple', at: [38, 0.5], via: [[11, 0], [14, 0]] },
    {
      text: (c) => {
        const k = c.s.seq[0] ?? 0;
        const id = ['idle', 'flee', 'pray', 'up'][k] ?? 'idle';
        const who = ['the idle priest', 'the fleeing priest', 'the praying priest', 'the priest looking up'][k] ?? 'the idle priest';
        return of(wake(c, id, who), k + 1, 4);
      },
      done: 'vault',
      at: (c) => standAt(c, ['idle', 'flee', 'pray', 'up'][c.s.seq[0] ?? 0] ?? 'idle'),
      stand: (c) => ['idle', 'flee', 'pray', 'up'][c.s.seq[0] ?? 0] ?? null,
    },
    { text: (c) => (near(c, [49.4, -0.3], 3) ? 'Cast the gnomon’s shadow along the light.' : 'Go into the open court.'), done: 'dial', at: [49.4, -0.3], via: [[41, 0], [46, 0]] },
    { text: (c) => rest('Walk to the warm brazier, not the blue one.')(c, 'court'), done: 'rest:court', at: (c) => brazier(c, 'court') },
    { text: (c) => (c.s.wrong.on && !c.s.wrong.gone && c.s.wrong.dist < 8 ? 'Turn: keep the light on it.' : 'Go through the pillars.'), done: 'never', at: [86, 0], via: [[61, 0], [64, 0], [70, 0], [77, 0]] },
  ],
  library: [
    { text: (c) => rest('Walk to the brazier.')(c, 'door'), done: 'rest:door', at: (c) => brazier(c, 'door') },
    {
      text: (c) => {
        const n = PAGES.filter((p) => c.flag(p.id)).length;
        const p = PAGES.find((pg) => !c.flag(pg.id));
        const at = !!p && near(c, [p.x - 0.75, p.z], 1.4);
        return of(at ? 'Look up: hold the flame above the page.' : 'Walk to the next lectern.', n + 1, 7);
      },
      done: 'pages',
      at: (c) => {
        const p = PAGES.find((pg) => !c.flag(pg.id));
        return p ? [p.x - 0.75, p.z] : null;
      },
      via: [[10, 0]],
    },
    { text: 'Look up: high light opens the shelves.', done: 'chase', at: [63.2, 0], via: [[42.5, 0], [45.6, 0], [46.5, 4], [49.6, 4], [50.5, -4], [53.6, -4], [54.5, 1.5], [57.6, 1.5], [58.5, -1], [60.6, -0.4]] },
    { text: (c) => rest('Walk to the warm brazier.')(c, 'stacks'), done: 'rest:stacks', at: (c) => brazier(c, 'stacks') },
    { text: (c) => (c.s.wrong.on && !c.s.wrong.gone && c.s.wrong.dist < 8 ? 'Turn: keep the light on it.' : 'Climb the stacks.'), done: 'never', at: [88.5, 0], via: [[66.5, -6.4], [72.5, -6.4], [74.5, 6.4], [80.5, 6.4], [83, 0]] },
  ],
  heart: [
    { text: (c) => rest('Walk to the brazier.')(c, 'gate'), done: 'rest:gate', at: (c) => brazier(c, 'gate') },
    {
      text: (c) => {
        const k = ['p1', 'p2', 'p3', 'p4', 'p5'].findIndex((p) => !c.flag(p));
        if (k < 0) return '';
        const n = (t: string) => of(t, k + 1, 5, 'plate ');
        if (k === 0) return n(wake(c, 'soldier', 'the soldier', 'Hold the light there.'));
        if (k === 1) {
          const a = (162 * Math.PI) / 180;
          return n(near(c, [HEART.x + Math.cos(a) * 14.2, Math.sin(a) * 14.2], 2.5) ? 'Look down: let its shadow reach the plate.' : 'Go past the post.');
        }
        if (k === 2) {
          const i = c.s.seq[0] ?? 0;
          const id = ['old', 'dancer', 'twin'][i] ?? 'old';
          return n(wake(c, id, ['the old man', 'the dancer', 'the child'][i] ?? 'the old man', 'Hold the light there.')); // (the light alone: no E)
        }
        if (k === 3) return n(near(c, [PLATE_AT[3][0] - 0.6, PLATE_AT[3][1] - 0.9], 1.6) ? 'Look up: read the page from above.' : 'Walk to the page.');
        return n(c.s.flame.back ? 'Let your shadow fall on the plate.' : 'Hold Shift to draw the flame back.');
      },
      done: 'plates',
      stand: (c) => {
        const k = ['p1', 'p2', 'p3', 'p4', 'p5'].findIndex((p) => !c.flag(p));
        return k === 0 ? 'soldier' : k === 2 ? (['old', 'dancer', 'twin'][c.s.seq[0] ?? 0] ?? null) : null;
      },
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
      text: (c) => (c.s.wrong.on && !c.s.wrong.gone && c.s.wrong.dist < 6 ? 'Turn: keep the light on it.' : 'Run round to the centre.'),
      done: 'heart',
      at: [HEART.x, HEART.z + 1.1],
      via: [[HEART.x - 10.5, HEART.z - 2], [HEART.x - 9, HEART.z + 7], [HEART.x - 3, HEART.z + 9.5], [HEART.x, HEART.z + 5]],
    },
  ],
};
