// The Still City: the story the game tells (from "The Still City: Game Design & Narration", Moeez Abid, 2026-10-17).
// Plain data, no imports. main.ts decides when each line plays; every line plays once unless it is a variant list.
//
// The truth (only said at the end): the city was not cursed. A flood was one second away from drowning everyone.
// Someone lit the flame to stop time and hold that second. The Wrong Shadow is the player, the one who lit it,
// looping in search of a way to break the freeze without letting the flood arrive.

/** The narrator: a quiet, ageless voice; the city remembering itself. */
export const NARRATOR = {
  opening: ['The fire has burned since the day everything stopped. No one remembers who lit it.', 'Carry it carefully. It is all the time that is left.'],
  heart: 'Every shadow in the city is looking at you. Not at the fire. At you.',
  market: 'They were haggling when it happened. Listen. You can almost hear it.',
  temple: 'They prayed for more time. They were given exactly this.',
  gate: 'The city lets you in. It is not sure why.',
  firstWord: 'Every shadow is a person. Light one, and it remembers.',
  wrongFirst: 'That one was not here before.',
  brazier: 'Rest. The fire needs it more than you.',
  collapse: 'Run. The city remembers how to fall.',
  rumble: 'Do you hear it? It has been waiting a very long time.',
  death: ['The flame returns to the wall. The wall remembers you now.', 'Again. The city is patient.', 'You are not the first to try.', 'You are the first to try this long.'],
};

/** The flame's own whispers: low, crackling, close to the ear. */
export const FLAME = {
  low: 'I am fading. Be quick.',
  out: 'Dark. Find a torch. Please.',
  relit: 'Thank you. I was afraid.',
  wordNear: 'Someone left something here.',
  caught: 'Cold air. Something is behind us.',
  look: 'It moves when you stop looking. Look back.',
};

/** The Wrong Shadow: silent at first, then a footstep half a beat late, then words, then a voice like yours. */
export const WRONG = {
  notYet: 'Not yet. Not yet. Not yet.',
  face: 'You have always known my face.',
  kinder: 'It is kinder to look away.',
  knows: 'I know where it goes. I have always known.',
  door: 'Hold the door. Please. Just a little longer.',
};

/** The 36 Last Words: a figure's final sentence, heard when its shadow is lit. Five are route clues (the hidden stair). */
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
/** Words 1-35 belong to the people; the 36th is heard only from the Wrong Shadow itself, at the end. */
export const PEOPLE_WORDS = 35;

/** Which Last Words each hour's shades carry (indices into LAST_WORDS), in the order they are heard. */
export const WORDS_BY_HOUR: number[][] = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23],
  [24, 25, 26, 27, 28, 29],
  [30, 31, 32, 33, 34],
];

export const ENDINGS = {
  keep: ['The fire settles. The city goes quiet again.', 'Safe. Whole. Still. This is a kind of mercy.', 'Somewhere, a shadow reaches for a door, and does not reach it.'],
  letGo: ['The dark arrives. Then, for the first time in four thousand years, footsteps.', 'They are alive. They are looking at you. They are smiling.', 'Then the sound of water. It does not stop.'],
  door: [
    'They heard you. Every last word, all of them, at once.',
    'For one second the city moves, and one second is enough.',
    'The door holds. The shadow holds it. It knew it would.',
    'The fire has burned for four thousand years. Now it can finally go out.',
  ],
};
