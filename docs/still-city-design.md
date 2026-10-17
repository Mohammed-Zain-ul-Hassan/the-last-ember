<!-- Transcribed from "The Still City: Game Design & Narration" (Moeez Abid, 2026-10-17, PDF). Source of truth for
story, tone, mechanics, puzzles, hints and lines. Tables keep the PDF's column layout. How it is built, and every
place the build had to decide something the doc leaves open: docs/still-city-build.md and docs/still-city-plan.md. -->

The Still City: Game Design & Narration

  ​Oct 17, 2026        · ​@Moeez Abid

Overview
The Still City is a 3D puzzle-adventure in which you carry the only fire left in a city that
froze mid-breath four thousand years ago. Your flame wakes the dead for ten seconds at a
time, and something that moves only when unseen follows you.

Tone: eerie, mournful, tense. Quiet exploration broken by short, sharp chases.

Design pillars

     Light is your only verb. Every action, from solving to surviving, is done by aiming the
     flame.
     Every shadow is a person. Puzzles are never abstract; each one is someone's last ten
     seconds.
     Time is spent, not given. Ash limits how much of the past you can touch, so each replay
     is a decision.

Core loop: find a frozen shadow, find its true angle, replay it, learn the route or
mechanism, spend Ash to use it, then reach the next brazier before the Wrong Shadow
closes in.

The hidden truth (spoiler): The city was not cursed. A flood was one second away from
drowning everyone. Someone lit the flame to stop time and hold that second. The Wrong
Shadow is the player, the one who lit it, looping in search of a way to break the freeze
without letting the flood arrive.

Core mechanics
The flame is a real-time light, so every shadow in the world responds to where you hold it.
Seven systems carry the game.

  Mechanic                         What it does                        Design note

  Flame carry                      Raise, lower and swing the flame;   Height and distance change a
                                   all shadows reshape live            shadow's size, angle changes its
                                                                       shape

  Shadow                           A lit shadow on a wall or floor     Vanishes instantly if the flame
  solidity                         becomes solid and walkable          moves or goes out

  Mechanic                         What it does                          Design note

  True-angle                       A frozen figure replays its last 10   Finding the angle is the main puzzle
  replay                           seconds when lit from its true        loop
                                   angle

  Step into                        Spend Ash to enter the replay as a    Ends when the replay ends
  replay                           ghost and trigger what the figure
                                   triggered

  Ash and rewind                   Ash is the time resource; a 5-        Refills only at braziers, which are
                                   second rewind also costs Ash          checkpoints

  The Wrong                        Stalks you and moves only when        Freezes while lit by the flame
  Shadow                           unseen

  Last Words                       36 hidden figures each hold one       Found by odd angles and dark
                                   final sentence                        corners; unlock the secret ending

Ash economy: A replay costs 1 Ash, stepping in costs 2, and a rewind costs 1. The player
starts with 5 Ash and each district adds one brazier chamber, so Ash is always tight
enough to force choices but never blocks progress for good.

Flame handling: The flame has three states, steady, low and out. Low flame shrinks the lit
radius and makes the Wrong Shadow faster. Out means darkness, solid shadows vanish,
and the player must relight at a wall torch.

Camera note: The game is third-person. The flame sits in the character's raised hand and
is aimed with the camera, so looking up lifts the flame and swinging the camera sweeps it
sideways. A Flame Lock button snaps the camera toward the Wrong Shadow so the player
can keep it lit without losing control of the flame.

Action and suspense
Quiet puzzle-solving is broken up by six pressure systems so the player is never fully safe.

     Chase sequences: With the flame low, the Wrong Shadow sprints. The player must
     reach the next brazier while keeping it lit from behind, which means running and aiming
     at the same time.
     Collapse set pieces: Each district ends with a crumbling escape. Shadow-bridges exist
     only where the flame points, so the player aims ahead while moving.
     Flame under pressure: Wind gusts and falling debris can snuff the flame. Wall torches
     relight it, but each relight costs a few seconds of darkness.
     The Rumble: A distant sound of water grows louder with each district. At the Heart it is
     constant, and the floor trembles.

     Silence cues: When the music cuts out, the Wrong Shadow is close. The player has
     about three seconds to find and light it.
     False braziers: From the Temple onward, some braziers are lit by the Wrong Shadow.
     They cost Ash instead of refilling it. Tell: the flame burns a slightly cold blue.

Pacing rule: In each district, a calm puzzle phase of 8 to 12 minutes is followed by one
chase or collapse of 60 to 90 seconds. Never place two action beats back to back.

The five districts
Each district teaches one lesson about light, ends with an action beat, and ends at a
brazier. The 36 Last Words are split 5, 7, 7, 7, 10 across the districts.

1. The Gate Ward (tutorial)
Teaches: carrying the flame, true angle, stepping into a replay.

     Puzzle A, the lever guard: A guard's shadow on the wall reaches for a lever hidden
     behind a pillar. Light him from low and to the left, his true angle, and he replays pulling
     it. Step in and pull it yourself to raise the first portcullis.
     Puzzle B, the gate: Two guards hold the gate shut in their last moment. Wake both, in
     either order, and step into the second replay to lift the bar.
     Riddle (carved above the gate): "What follows the light, yet leads the way?" Answer:
     your own shadow. Walking behind the guard's shadow along the wall shows the route
     to the lever.
     Action beat: None. The Wrong Shadow appears once at the far end of a corridor and
     does not move.
     Last Words: 5, all near the path so the player learns to look.

2. The Market of Weights
Teaches: flame height changes shadow size; shadows can be bridges.

     Puzzle A, the scales: Three merchants hold scales as shadows. Lowering the flame
     shrinks a shadow, raising it enlarges it. Balance each scale to unlock its shutter.
     Puzzle B, the canal: A dry canal is crossed by stretching a beggar's shadow into a
     bridge. Hold the flame low and steady while walking across.
     Riddle (on a coin-stall sign): "The poor man's shadow is longer at dusk than the king's
     at noon." Answer: a low flame, which is dusk, stretches any shadow past a high one,
     which is noon.
     Action beat: A stall-row collapse. Race through while aiming the flame ahead to keep
     shadow-bridges alive over falling gaps.

     Wrong Shadow: It shifts position the first time the player looks away.
     Last Words: 7.

3. The Temple of Hours
Teaches: order of replays matters; Ash is scarce.

     Puzzle A, the four priests: Four priests froze in a circle at different moments. Replay
     them in the order the riddle gives to open the vault. This costs 4 of the player's 5 Ash,
     so it must be solved with care.
     Puzzle B, the sundial floor: The roof is broken, so a shaft of real light crosses the floor.
     Align the flame's shadow with the shaft to reveal the false brazier.
     Riddle (on the vault): "One hour wasted, one feared, one begged for, one never seen."
     Answer: replay in order of their last gestures: idle, fleeing, praying, looking up.
     Action beat: The Wrong Shadow hunts among the pillars while wind gusts threaten the
     flame.
     New threat: False braziers appear here for the first time.
     Last Words: 7.

4. The Library of Whispers
Teaches: angle changes meaning, not just shape.

     Puzzle A, shadow-writing: Carved reliefs read as text only from one angle. Lit from the
     side they show a false line; lit from directly above they show the truth. Read all seven
     pages to learn which way the Wrong Shadow comes from.
     Puzzle B, the shelf maze: Shelf shadows form a maze that rearranges as the flame
     moves. The exit exists only when the flame is held high.
     Riddle (above the door): "Read me from the side and I'm a lie, from above and I'm the
     end." Answer: hold the flame directly above each page.
     Action beat: A ladder-and-shelf chase. The Wrong Shadow now wears the player's
     face.
     Last Words: 7, one hidden on each page.

5. The Heart
Teaches: nothing new; it tests everything.

     Puzzle, five plates: Five stone plates ring an empty spot that every shadow in the city
     reaches toward. Each plate wants one lesson: true angle (Gate), low and long (Market),
     correct order (Temple), from above (Library), and from within, holding the flame at
     your chest so your own shadow falls on the plate.

     Riddle (on the center floor): "I am the one who is missing, and the one who stayed."
     Answer: the player's own shadow, the fifth plate.
     Action beat: A full chase while the Rumble peaks and walls shake. The Wrong Shadow
     reaches the flame at the same moment the player does.
     Last Words: 10, including the ones that reveal the hidden route.

Conditional hint system
The flame gives every hint, as a whisper plus a small visual cue, and hints escalate in three
tiers only while the player is stuck. Hints cost no Ash and no score.

Tiers

 1. Nudge: a visual cue only, such as a faint glow or a flicker toward the right place.
 2. Guide: the flame trembles toward the correct angle or object and whispers a direction.
 3. Reveal: a ghost replay shows the solution from a distance. The player still has to
    perform it.

  Trigger                                 Tier 1, Nudge       Tier 2, Guide          Tier 3, Reveal

  In one room for 3                       Nearest unlit       Flame leans toward     Ghost replay shows
  minutes with no                         shadow glows        the puzzle's key       the full sequence
  progress                                faintly             shadow

  Same puzzle failed 3                    Key shadow          Flame trembles         Angle marker
  times                                   pulses once         toward the true        appears on the wall
                                                              angle                  for 5 seconds

  Ash at 1 or less                        Brazier glints in   Flame whispers the     Faint path of embers
                                          the distance        brazier's direction    leads to the brazier

  Wrong Shadow                            Cold breeze from    Flame flares at the    Wrong Shadow's
  catches the player                      its direction       player's back          outline glows for 3
  twice in a row                                                                     seconds

  Last Word within 10                     Soft hum rises      Hum pulses faster as   Last Word's shadow
  metres, still unfound                   when facing it      the player turns       shimmers once
                                                              toward it

  Riddle failed twice                     Inscription         Flame whispers a key   Flame whispers the
                                          brightens           word from the riddle   plain answer

Rules

     Hints trigger only after the player has stopped making progress, never during a chase.

     A 90-second cooldown separates tiers so the player can try again between them.
     Progress on a puzzle resets its hint tier.
     Settings: Off, Gentle (Tier 1 only), or Guided (all tiers). The default is Guided, and the
     player can change it at any time.

Narration script
The narrator is a quiet, ageless voice that speaks in short sentences and never explains
too much. It should sound like the city remembering itself. Lines are triggered by
gameplay events and play once unless marked as variants.

Opening
     "The fire has burned since the day everything stopped. No one remembers who lit it."
     "Carry it carefully. It is all the time that is left."

The Gate Ward
     First shadow lit: "He is still reaching for the lever. He has been reaching for four
     thousand years."
     Replay ends: "The light moves on. So does he, back into the wall."
     Step into replay: "Do what he did. Only what he did."
     Gate opens: "The city lets you in. It is not sure why."
     Wrong Shadow first seen: "That one was not here before."

The Market of Weights
     Entering: "They were haggling when it happened. Listen. You can almost hear it."
     Scale balanced: "A fair weight, at last."
     Bridge formed: "A poor man's shadow, carrying you. He would have liked that."
     Collapse begins: "Run. The city remembers how to fall."
     Brazier reached: "Rest. The fire needs it more than you."

The Temple of Hours
     Entering: "They prayed for more time. They were given exactly this."
     Each priest replayed: "One begged. One ran. One only waited."
     Vault opens: "The hours were never lost. Only held."
     Near a false brazier: "The flame looks warm. Look closer."
     Fell for a false brazier: "Not all fires are kind."

The Library of Whispers
     Entering: "They wrote it down so no one would forget. Then everyone forgot to read."
     Page read from the side: "A comfortable lie."
     Page read from above: "There it is. Plainly. Someone lit this fire on purpose."
     Wrong Shadow shows the player's face: "You have seen that face before. In every still
     water."

The Heart
     Entering: "Every shadow in the city is looking at you. Not at the fire. At you."
     Each plate lit: "One lesson remembered."
     Fifth plate: "The last angle is the one you cast yourself."
     Rumble peaks: "Do you hear it? It has been waiting a very long time."

Death and retry
     "The flame returns to the wall. The wall remembers you now."
     Variant 2: "Again. The city is patient."
     Variant 3: "You are not the first to try."
     Variant 4, after many deaths: "You are the first to try this long."

Whisper lines (hints)
The flame speaks in a low, crackling whisper, close to the player's ear. Whispers are short
and never name the answer until Tier 3. Each trigger has one line per tier.

  Trigger                                 Tier 1, Nudge          Tier 2, Guide              Tier 3, Reveal

  Stuck in one room                       "Something here is     "Turn the light. Slowly.   "Watch. I will show
                                          waiting to be seen."   Let it tell you."          you once."

  Same puzzle failed                      "Not quite. Close,     "Lower me. Or higher.      "There. That angle.
  3 times                                 though."               Feel where I want to       Hold me there."
                                                                 go."

  Ash at 1 or less                        "I am running thin.    "There is a brazier        "Follow the
                                          We should rest."       ahead. I can feel its      embers. They lead
                                                                 warmth."                   home."

  Wrong Shadow                            "Cold air. Something   "It moves when you         "There. That is
  caught the player                       is behind us."         stop looking. Look         where it stands."
  twice                                                          back."

  Trigger                                 Tier 1, Nudge      Tier 2, Guide             Tier 3, Reveal

  Last Word nearby                        "Someone left      "Closer. Do you hear it   "Right there. In the
                                          something here."   humming?"                 corner. A last
                                                                                       word."

  Riddle failed twice                     "Read it again.    "The answer is in the     "The answer is
                                          Slowly."           words, not the wall."     what follows you."

Per-district puzzle whispers
Gate Ward

     "The guard faces away from where the light should fall. Try the other side."
     "He reaches for something behind the pillar."

Market of Weights

     "A low sun makes long shadows. Remember that."
     "The scale only needs a smaller shadow on one side."

Temple of Hours

     "The priests did not die together. Who was first?"
     "One of them is not praying. He is only looking up."

Library of Whispers

     "Read from the side, it lies. Try from above."
     "Seven pages. Seven small truths."

The Heart

     "Four plates, four lessons. The fifth is missing, and it is closer than you think."
     "Hold me close. Let your own shadow fall."

Flame state whispers
     Flame low: "I am fading. Be quick."
     Flame out: "Dark. Find a torch. Please."
     Relit: "Thank you. I was afraid."

The Wrong Shadow: behavior, lines and sound
The Wrong Shadow is the game's tension engine and its secret. It grows from a distant
silhouette into a mirror of the player, and its dialogue turns from silence into confession. It
never kills outright in the first two districts; being caught only costs Ash and teleports the
player back a few metres.

  District                          Behavior                                Its voice

  Gate Ward                         Appears once far away; stands still     Silent

  Market of                         Moves only when unseen; first           A single footstep, half a beat late
  Weights                           position shift

  Temple of Hours                   Hunts among pillars; sprints when       A whisper: "Not yet."
                                    the flame is low

  Library of                        Wears the player's face; lights false   Repeats the narrator's last line,
  Whispers                          braziers                                slightly late

  The Heart                         Reaches the flame as the player         Speaks plainly, in a voice like the
                                    does                                    player's

Its lines
     Market, first shift: (no words, only the late footstep)
     Temple, when caught: "Not yet. Not yet. Not yet."
     Library, face reveal: "You have always known my face."
     Library, after the player lights it: "It is kinder to look away."
     Heart, final approach: "I know where it goes. I have always known."
     Heart, at the flame: "Hold the door. Please. Just a little longer."

Sound cues

  Cue                                                   Meaning

  Music cuts to silence                                 Wrong Shadow is within a few metres

  Water drip, faint                                     The Rumble is growing; next action beat is close

  Low breath behind the player                          Wrong Shadow is behind and unseen

  Footstep a half beat late                             Wrong Shadow is mirroring the player

  Cold blue flicker with a hollow hum                   False brazier

  Cue                                                    Meaning

  Warm gold flicker with a soft crackle                  Real brazier

Endings
After the fifth plate, the Heart opens and the player reaches the empty spot where the
flame was first lit. The Wrong Shadow stands there with its hand on the fire. The player
chooses, and the Last Words collected decide which choices exist.

  Ending                                  Condition              Outcome

  Keep the flame                          Always available       The city is preserved forever, frozen and safe

  Let it go out                           Always available       The people move again, and the flood hits

  Hold the door                           All 36 Last Words      The people walk out in the one second
  (secret)                                found                  before the flood

Keep the flame
The player returns the flame to the wall.

     "The fire settles. The city goes quiet again."
     "Safe. Whole. Still. This is a kind of mercy."
     "Somewhere, a shadow reaches for a door, and does not reach it."

Let it go out
The player drops the flame and it dies.

     "The dark arrives. Then, for the first time in four thousand years, footsteps."
     "They are alive. They are looking at you. They are smiling."
     "Then the sound of water. It does not stop."

Hold the door (secret)
With all 36 Last Words, the player sees a hidden route the Wrong Shadow cannot: a stair
behind the Heart, built by the city's last hands. The player lights the way and the Wrong
Shadow steps aside to hold the door.

     "They heard you. Every last word, all of them, at once."
     "For one second the city moves, and one second is enough."

       "The door holds. The shadow holds it. It knew it would."
       "The fire has burned for four thousand years. Now it can finally go out."

A final shot shows the city empty, a single shadow still standing in the doorway, and then
the sound of water.

The 36 Last Words
Each Last Word is a figure's final sentence, spoken when the player finds and lights its
shadow. Most are small, human and ordinary. Five of them, marked below, together reveal
the hidden stair used in the secret ending.

  #           District               Figure             Last Word

  1           Gate                   Lever guard        "Tell my wife the gate is open."
              Ward

  2           Gate                   Second guard       "Did you hear that? Like rain, but under the
              Ward                                      floor."

  3           Gate                   Gate boy           "I only wanted to see the market."
              Ward

  4           Gate                   Watch captain      "Close it behind us. Close it now."
              Ward

  5           Gate                   Old gatekeeper     "I have never once been late."
              Ward

  6           Market                 Fishmonger         "Fresh this morning. Ask anyone."

  7           Market                 Beggar             "A coin for the road. Or for the river."

  8           Market                 Baker              "The bread will be warm. Wait for me."

  9           Market                 Child with a toy   "Mama, the ground is wet."

  10          Market                 Scale merchant     "A fair weight. I swear it on my name."

  11          Market                 Coin changer       "Count it twice. Count it again."

  12          Market                 Water-seller       "The wells are rising. Has anyone noticed?"

  13          Temple                 Idle priest        "There is still time. There is always time."

  14          Temple                 Fleeing priest     "Run. Leave the bells, leave everything."

  15          Temple                 Praying priest     "Give us one more hour. Just one."

  #           District               Figure                   Last Word

  16          Temple                 Priest looking up        "The light is changing. Something is lighting the
                                                              sky."

  17          Temple                 Bell-ringer              "I rang it as loud as I could."

  18          Temple                 Acolyte                  "Who is that, standing in the doorway?"

  19          Temple                 High priest              "If someone lights a fire, let it burn."

  20          Library                Scribe                   "I wrote it all down, in case we forgot."

  21          Library                Archivist (route clue)   "The east stair is the only way up."

  22          Library                Student                  "We were warned. We thought it was a story."

  23          Library                Librarian                "Take the book. Leave me the lamp."

  24          Library                Mapmaker (route          "The water comes from the west. Draw it."
                                     clue)

  25          Library                Poet                     "Someone will read this, one day."

  26          Library                Child reader             "Is that you? Why do you look so tired?"

  27          Heart                  Mother with child        "Hold my hand. Don't let go this time."

  28          Heart                  Soldier (route clue)     "I will hold the door."

  29          Heart                  Old man                  "We were saved once, before. By someone
                                                              stubborn."

  30          Heart                  Dancer                   "Stay with me. Just one more song."

  31          Heart                  Twin                     "Look. The fire is the same shape as you."

  32          Heart                  Carpenter (route         "I built the stairs. Nobody ever used them."
                                     clue)

  33          Heart                  Baker's wife             "Did you save the bread?"

  34          Heart                  Beggar's friend          "He said a river was coming. Nobody listened."

  35          Heart                  Priest (route clue)      "The hour is one second long. Use it."

  36          Heart                  The Wrong Shadow         "I lit it. Forgive me. I would do it again."

Placement rules

      Last Words 1 to 5 sit on the main path. The rest sit one detour away, behind an odd
      angle or in a dark corner.

     Each Library page hides one Last Word, so reading the page from above both advances
     the story and reveals the figure.
     Last Word 36 can be found only after the other 35, and only by lighting the Wrong
     Shadow itself at the Heart.

Build decisions and next steps
Four decisions are now fixed: third-person camera, Ash built from scratch, three.js as the
engine, and a 3 to 4 hour target. Two items are still open.

     Camera: third-person, with the flame in the character's hand and a Flame Lock button
     for the Wrong Shadow.
     Ash and rewind: no existing resource, so the values in Core mechanics stand as the
     starting design.
     Engine: three.js, with the implementation notes below.
     Play time: about 40 minutes per district, roughly 3 hours 20 minutes on the main path,
     rising toward 4 hours with Last Word hunting.
     Is voice acting planned? The narration and whisper lines assume a recorded narrator
     and a separate flame voice.
     Should the hint settings (Off, Gentle, Guided) appear at game start or only in the pause
     menu?

Three.js implementation notes
     Flame light: One PointLight with castShadow on, a flicker driven by noise on intensity,
     and a sprite or particle system for the visible fire. Point-light shadows render six cube
     faces per frame, so keep it to the single flame and limit the number of shadow casters
     per room.
     Shadow-bridges are not read from the shadow map. three.js gives no gameplay
     access to shadows, so generate them: when the flame moves, cast rays from the flame
     through each caster's silhouette points onto the receiving surface, build a flat mesh
     from the hits, and use it as an invisible walkable collider (for example with three-mesh-
     bvh or Rapier). Rebuild only while the flame moves, and throttle the update.
     True-angle detection: Store a target direction, tolerance of about 12 degrees and
     distance range per figure. Each frame, compare the flame-to-figure direction against it,
     and trigger the replay after 0.4 seconds of holding the angle.
     Replays: Bake each 10-second replay as an animation clip played through
     AnimationMixer. The ghost version reuses the clip with a translucent material, and clip
     event markers fire switches and doors.

     Wrong Shadow: Move it only when it is outside the camera frustum and outside the
     flame's light radius. Freeze it when it is visible and lit.
     Hints: One small state machine per puzzle, tracking time in room, failed attempts and
     current tier, with the 90-second cooldown between tiers.

Suggested next steps

 1. Prototype the shadow-bridge collider generation first, since it is the riskiest piece in
     three.js.
 2. Map each puzzle to the existing level geometry and confirm every true angle is
     physically reachable.
 3. Record placeholder audio for the whisper lines to test timing against the cooldown
     rules.
 4. Playtest the Temple of Hours first, since its Ash cost is the tightest balance point.
