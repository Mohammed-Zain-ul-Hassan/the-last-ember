// The Still City: the story the game tells (from "The Still City: Game Design & Narration", Moeez Abid, 2026-10-17;
// docs/still-city-design.md). Every line's text lives in src/still/narrative/lines.json, keyed by id: edit the words
// there, never here. This module only gives the lines the shape the code reaches for (NARRATOR.gate.opens...), and
// voice-ready ids: a recorded file named after an id can replace its caption later.
//
// The truth (only said at the end): the city was not cursed. A flood was one second away from drowning everyone.
// Someone lit the flame to stop time and hold that second. The Wrong Shadow is the player, the one who lit it,
// looping in search of a way to break the freeze without letting the flood arrive.

import LINES_JSON from '../still/narrative/lines.json';

export type Voice = 'narrator' | 'flame' | 'wrong' | 'word' | 'cue' | 'inscription';
export interface Line {
  id: string;
  voice: Voice;
  text: string;
  who?: string;
}

const RAW = LINES_JSON as Record<string, { voice: Voice; text: string; who?: string; clue?: boolean }>;
/** Every line by id (the narrative engine and the captions read this). */
export const LINES: Record<string, Line> = Object.fromEntries(Object.entries(RAW).map(([id, l]) => [id, { id, voice: l.voice, text: l.text, who: l.who }]));
const L = (id: string): Line => {
  const l = LINES[id];
  if (!l) throw new Error(`lines.json has no line "${id}"`);
  return l;
};

/** The narrator: a quiet, ageless voice; the city remembering itself. Short sentences; never explains too much. */
export const NARRATOR = {
  opening: [L('open.1'), L('open.2')],
  gate: { firstLit: L('gate.firstLit'), replayEnds: L('gate.replayEnds'), stepIn: L('gate.stepIn'), opens: L('gate.opens'), wrongSeen: L('gate.wrongSeen') },
  market: { enter: L('market.enter'), balanced: L('market.balanced'), bridge: L('market.bridge'), collapse: L('market.collapse'), brazier: L('market.brazier') },
  temple: { enter: L('temple.enter'), priest: L('temple.priest'), vault: L('temple.vault'), nearFalse: L('temple.nearFalse'), fellFalse: L('temple.fellFalse') },
  library: { enter: L('library.enter'), side: L('library.side'), above: L('library.above'), face: L('library.face') },
  heart: { enter: L('heart.enter'), plate: L('heart.plate'), fifth: L('heart.fifth'), rumble: L('heart.rumble') },
  death: [L('death.1'), L('death.2'), L('death.3'), L('death.4')],
};

/** The flame's whispers: low, crackling, close to the ear. */
export const FLAME = { low: L('flame.low'), out: L('flame.out'), relit: L('flame.relit') };

export type HintTrigger = 'stuck' | 'failed' | 'ash' | 'caught' | 'word' | 'riddle';
/** Hint whispers: one line per trigger per tier (1 nudge, 2 guide, 3 reveal). Never name the answer before tier 3. */
export const HINTS: Record<HintTrigger, [Line, Line, Line]> = Object.fromEntries(
  (['stuck', 'failed', 'ash', 'caught', 'word', 'riddle'] as HintTrigger[]).map((t) => [t, [L(`hint.${t}.1`), L(`hint.${t}.2`), L(`hint.${t}.3`)]]),
) as Record<HintTrigger, [Line, Line, Line]>;

/** Per-district puzzle whispers (the flame, when a puzzle there has you stuck). */
export const PUZZLE_WHISPERS: Record<string, Line[]> = Object.fromEntries(
  ['gate', 'market', 'temple', 'library', 'heart'].map((d) => [d, Object.keys(LINES).filter((k) => k.startsWith(`pz.${d}.`)).map(L)]),
);

/** The Wrong Shadow: silent at first, then a footstep half a beat late, then words, then a voice like yours. */
export const WRONG = { notYet: L('wrong.notYet'), face: L('wrong.face'), kinder: L('wrong.kinder'), knows: L('wrong.knows'), door: L('wrong.door') };

/** The riddles, carved where the doc puts them. */
const R = (k: string) => ({ where: L(`riddle.${k}`).who ?? '', text: L(`riddle.${k}`).text });
export const RIDDLES = { gate: R('gate'), market: R('market'), temple: R('temple'), library: R('library'), heart: R('heart') };

/** The 36 Last Words, numbered as in the doc (index = number - 1). Five are route clues (the hidden stair). */
export const LAST_WORDS: { who: string; line: string; clue?: boolean }[] = Array.from({ length: 36 }, (_, i) => {
  const w = RAW[`word.${i + 1}`];
  return { who: w.who ?? '', line: w.text, clue: w.clue };
});
/** Words 1-35 belong to the people; the 36th is heard only from the Wrong Shadow itself, at the Heart, after the rest. */
export const PEOPLE_WORDS = 35;
/** How the Last Words split across the five districts (5, 7, 7, 7, 10), as index ranges [from, to). */
export const WORDS_BY_DISTRICT: [number, number][] = [
  [0, 5],
  [5, 12],
  [12, 19],
  [19, 26],
  [26, 36],
];
export function wordLine(i: number): Line {
  return L(`word.${i + 1}`);
}

export const ENDINGS = {
  keep: [L('end.keep.1'), L('end.keep.2'), L('end.keep.3')],
  letGo: [L('end.letGo.1'), L('end.letGo.2'), L('end.letGo.3')],
  door: [L('end.door.1'), L('end.door.2'), L('end.door.3'), L('end.door.4')],
  /** The Last Ember: no choice here; he carries the flame out to the hearth (Act II), and the choice waits for dawn. */
  carry: [L('end.carry.1'), L('end.carry.2'), L('end.carry.3'), L('end.carry.4')],
};
