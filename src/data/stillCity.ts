// The Still City: the story the game tells (from "The Still City: Game Design & Narration", Moeez Abid, 2026-10-17).
// Plain data, no imports. Every line has an id (voice-ready: a recorded file named after the id can replace the
// caption later). Lines play once unless they are a variant list.
//
// The truth (only said at the end): the city was not cursed. A flood was one second away from drowning everyone.
// Someone lit the flame to stop time and hold that second. The Wrong Shadow is the player, the one who lit it,
// looping in search of a way to break the freeze without letting the flood arrive.

export type Voice = 'narrator' | 'flame' | 'wrong' | 'word';
export interface Line {
  id: string;
  voice: Voice;
  text: string;
  who?: string; // a Last Word's speaker
}

const N = (id: string, text: string): Line => ({ id, voice: 'narrator', text });
const F = (id: string, text: string): Line => ({ id, voice: 'flame', text });
const W = (id: string, text: string): Line => ({ id, voice: 'wrong', text });

/** The narrator: a quiet, ageless voice; the city remembering itself. Short sentences; never explains too much. */
export const NARRATOR = {
  opening: [N('open.1', 'The fire has burned since the day everything stopped. No one remembers who lit it.'), N('open.2', 'Carry it carefully. It is all the time that is left.')],
  gate: {
    firstLit: N('gate.firstLit', 'He is still reaching for the lever. He has been reaching for four thousand years.'),
    replayEnds: N('gate.replayEnds', 'The light moves on. So does he, back into the wall.'),
    stepIn: N('gate.stepIn', 'Do what he did. Only what he did.'),
    opens: N('gate.opens', 'The city lets you in. It is not sure why.'),
    wrongSeen: N('gate.wrongSeen', 'That one was not here before.'),
  },
  market: {
    enter: N('market.enter', 'They were haggling when it happened. Listen. You can almost hear it.'),
    balanced: N('market.balanced', 'A fair weight, at last.'),
    bridge: N('market.bridge', "A poor man's shadow, carrying you. He would have liked that."),
    collapse: N('market.collapse', 'Run. The city remembers how to fall.'),
    brazier: N('market.brazier', 'Rest. The fire needs it more than you.'),
  },
  temple: {
    enter: N('temple.enter', 'They prayed for more time. They were given exactly this.'),
    priest: N('temple.priest', 'One begged. One ran. One only waited.'),
    vault: N('temple.vault', 'The hours were never lost. Only held.'),
    nearFalse: N('temple.nearFalse', 'The flame looks warm. Look closer.'),
    fellFalse: N('temple.fellFalse', 'Not all fires are kind.'),
  },
  library: {
    enter: N('library.enter', 'They wrote it down so no one would forget. Then everyone forgot to read.'),
    side: N('library.side', 'A comfortable lie.'),
    above: N('library.above', 'There it is. Plainly. Someone lit this fire on purpose.'),
    face: N('library.face', 'You have seen that face before. In every still water.'),
  },
  heart: {
    enter: N('heart.enter', 'Every shadow in the city is looking at you. Not at the fire. At you.'),
    plate: N('heart.plate', 'One lesson remembered.'),
    fifth: N('heart.fifth', 'The last angle is the one you cast yourself.'),
    rumble: N('heart.rumble', 'Do you hear it? It has been waiting a very long time.'),
  },
  /** Death and retry: 1, 2, 3 in turn; the fourth after many deaths. */
  death: [
    N('death.1', 'The flame returns to the wall. The wall remembers you now.'),
    N('death.2', 'Again. The city is patient.'),
    N('death.3', 'You are not the first to try.'),
    N('death.4', 'You are the first to try this long.'),
  ],
};

/** The flame's whispers: low, crackling, close to the ear. */
export const FLAME = {
  low: F('flame.low', 'I am fading. Be quick.'),
  out: F('flame.out', 'Dark. Find a torch. Please.'),
  relit: F('flame.relit', 'Thank you. I was afraid.'),
};

/** Hint whispers: one line per trigger per tier (1 nudge, 2 guide, 3 reveal). Never name the answer before tier 3. */
export type HintTrigger = 'stuck' | 'failed' | 'ash' | 'caught' | 'word' | 'riddle';
export const HINTS: Record<HintTrigger, [Line, Line, Line]> = {
  stuck: [F('hint.stuck.1', 'Something here is waiting to be seen.'), F('hint.stuck.2', 'Turn the light. Slowly. Let it tell you.'), F('hint.stuck.3', 'Watch. I will show you once.')],
  failed: [F('hint.failed.1', 'Not quite. Close, though.'), F('hint.failed.2', 'Lower me. Or higher. Feel where I want to go.'), F('hint.failed.3', 'There. That angle. Hold me there.')],
  ash: [F('hint.ash.1', 'I am running thin. We should rest.'), F('hint.ash.2', 'There is a brazier ahead. I can feel its warmth.'), F('hint.ash.3', 'Follow the embers. They lead home.')],
  caught: [F('hint.caught.1', 'Cold air. Something is behind us.'), F('hint.caught.2', 'It moves when you stop looking. Look back.'), F('hint.caught.3', 'There. That is where it stands.')],
  word: [F('hint.word.1', 'Someone left something here.'), F('hint.word.2', 'Closer. Do you hear it humming?'), F('hint.word.3', 'Right there. In the corner. A last word.')],
  riddle: [F('hint.riddle.1', 'Read it again. Slowly.'), F('hint.riddle.2', 'The answer is in the words, not the wall.'), F('hint.riddle.3', 'The answer is what follows you.')],
};

/** Per-district puzzle whispers (the flame, when a puzzle there has you stuck). */
export const PUZZLE_WHISPERS: Record<string, Line[]> = {
  gate: [F('pz.gate.1', 'The guard faces away from where the light should fall. Try the other side.'), F('pz.gate.2', 'He reaches for something behind the pillar.')],
  market: [F('pz.market.1', 'A low sun makes long shadows. Remember that.'), F('pz.market.2', 'The scale only needs a smaller shadow on one side.')],
  temple: [F('pz.temple.1', 'The priests did not die together. Who was first?'), F('pz.temple.2', 'One of them is not praying. He is only looking up.')],
  library: [F('pz.library.1', 'Read from the side, it lies. Try from above.'), F('pz.library.2', 'Seven pages. Seven small truths.')],
  heart: [F('pz.heart.1', 'Four plates, four lessons. The fifth is missing, and it is closer than you think.'), F('pz.heart.2', 'Hold me close. Let your own shadow fall.')],
};

/** The Wrong Shadow: silent at first, then a footstep half a beat late, then words, then a voice like yours. */
export const WRONG = {
  notYet: W('wrong.notYet', 'Not yet. Not yet. Not yet.'),
  face: W('wrong.face', 'You have always known my face.'),
  kinder: W('wrong.kinder', 'It is kinder to look away.'),
  knows: W('wrong.knows', 'I know where it goes. I have always known.'),
  door: W('wrong.door', 'Hold the door. Please. Just a little longer.'),
};

/** The riddles, carved where the doc puts them. */
export const RIDDLES = {
  gate: { where: 'carved above the gate', text: 'What follows the light, yet leads the way?' },
  market: { where: 'on a coin-stall sign', text: "The poor man's shadow is longer at dusk than the king's at noon." },
  temple: { where: 'on the vault', text: 'One hour wasted, one feared, one begged for, one never seen.' },
  library: { where: 'above the door', text: "Read me from the side and I'm a lie, from above and I'm the end." },
  heart: { where: 'on the center floor', text: 'I am the one who is missing, and the one who stayed.' },
};

/** The 36 Last Words, numbered as in the doc (index = number - 1). Five are route clues (the hidden stair). */
export const LAST_WORDS: { who: string; line: string; clue?: boolean }[] = [
  { who: 'the lever guard', line: 'Tell my wife the gate is open.' },
  { who: 'the second guard', line: 'Did you hear that? Like rain, but under the floor.' },
  { who: 'the gate boy', line: 'I only wanted to see the market.' },
  { who: 'the watch captain', line: 'Close it behind us. Close it now.' },
  { who: 'the old gatekeeper', line: 'I have never once been late.' },
  { who: 'the fishmonger', line: 'Fresh this morning. Ask anyone.' },
  { who: 'the beggar', line: 'A coin for the road. Or for the river.' },
  { who: 'the baker', line: 'The bread will be warm. Wait for me.' },
  { who: 'a child with a toy', line: 'Mama, the ground is wet.' },
  { who: 'the scale merchant', line: 'A fair weight. I swear it on my name.' },
  { who: 'the coin changer', line: 'Count it twice. Count it again.' },
  { who: 'the water-seller', line: 'The wells are rising. Has anyone noticed?' },
  { who: 'the idle priest', line: 'There is still time. There is always time.' },
  { who: 'the fleeing priest', line: 'Run. Leave the bells, leave everything.' },
  { who: 'the praying priest', line: 'Give us one more hour. Just one.' },
  { who: 'the priest looking up', line: 'The light is changing. Something is lighting the sky.' },
  { who: 'the bell-ringer', line: 'I rang it as loud as I could.' },
  { who: 'the acolyte', line: 'Who is that, standing in the doorway?' },
  { who: 'the high priest', line: 'If someone lights a fire, let it burn.' },
  { who: 'the scribe', line: 'I wrote it all down, in case we forgot.' },
  { who: 'the archivist', line: 'The east stair is the only way up.', clue: true },
  { who: 'the student', line: 'We were warned. We thought it was a story.' },
  { who: 'the librarian', line: 'Take the book. Leave me the lamp.' },
  { who: 'the mapmaker', line: 'The water comes from the west. Draw it.', clue: true },
  { who: 'the poet', line: 'Someone will read this, one day.' },
  { who: 'a child reader', line: 'Is that you? Why do you look so tired?' },
  { who: 'a mother with a child', line: "Hold my hand. Don't let go this time." },
  { who: 'the soldier', line: 'I will hold the door.', clue: true },
  { who: 'the old man', line: 'We were saved once, before. By someone stubborn.' },
  { who: 'the dancer', line: 'Stay with me. Just one more song.' },
  { who: 'a twin', line: 'Look. The fire is the same shape as you.' },
  { who: 'the carpenter', line: 'I built the stairs. Nobody ever used them.', clue: true },
  { who: "the baker's wife", line: 'Did you save the bread?' },
  { who: "the beggar's friend", line: 'He said a river was coming. Nobody listened.' },
  { who: 'the priest', line: 'The hour is one second long. Use it.', clue: true },
  { who: 'the Wrong Shadow', line: 'I lit it. Forgive me. I would do it again.' },
];
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
  const w = LAST_WORDS[i];
  return { id: `word.${i + 1}`, voice: 'word', text: w.line, who: w.who };
}

export const ENDINGS = {
  keep: [N('end.keep.1', 'The fire settles. The city goes quiet again.'), N('end.keep.2', 'Safe. Whole. Still. This is a kind of mercy.'), N('end.keep.3', 'Somewhere, a shadow reaches for a door, and does not reach it.')],
  letGo: [N('end.letGo.1', 'The dark arrives. Then, for the first time in four thousand years, footsteps.'), N('end.letGo.2', 'They are alive. They are looking at you. They are smiling.'), N('end.letGo.3', 'Then the sound of water. It does not stop.')],
  door: [
    N('end.door.1', 'They heard you. Every last word, all of them, at once.'),
    N('end.door.2', 'For one second the city moves, and one second is enough.'),
    N('end.door.3', 'The door holds. The shadow holds it. It knew it would.'),
    N('end.door.4', 'The fire has burned for four thousand years. Now it can finally go out.'),
  ],
};
