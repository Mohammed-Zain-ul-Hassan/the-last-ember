# The Last Ember: trailer v2 (both acts). Prep only.

**Status (2026-10-18, ~03:30):** planned, scored and wired. Nothing is recorded.
- Recording waits until the group says **"we are done, record now"**.
- Zain chooses which build to record: production, or the `merged-game` preview.
- An animatic renders now. Every shot not yet captured plays as a labelled slate, under the real cards, lines and score:
  `trailer/scripts/build_v2.sh preview` produces `trailer/out/v2_preview_540p.mp4` and `v2_contact_sheet.jpg`.

## Rules this cut is built to (docs/handbook.md, jam-trailer skill)
`plan_v2.py` asserts every rule below. Plan as of tonight:

| Rule | Limit | This cut |
|---|---|---|
| Total length | ≤ 3:00 | **2:56** (176 s) |
| Raw, directly screen-recorded gameplay at 1.0x | ≥ 2:00 | **125 s** |
| Stylised edit: cards, act cards, the Heart / midnight / dawn scenes, end card | ≤ 1:00 | **51 s** |
| Longest uninterrupted take | — | 21 s (the Marshal) |
| Each theme word shown verbatim | — | explainer card, lower-third over live play, montage tag, title and end chips |
| End card dwell | — | 6 s |

- **The strictest reading:** count no second that has lettering over it. Raw is then **100 s**.
  - If an organiser rules that way, drop the two story lines and two of the lower-thirds (the cards already name the themes). Raw then rises to 115 s.
  - Also extend the climax by 3 bars, from the dawn scene. That makes 121 s.
- **Screen recording:** v1 used canvas captures. v2 records the **tab as seen and heard**, with the HUD, captions and the game's own sound (`?rec=1` in both acts). So "directly screen-recorded" holds literally.

## What the research says (sources at the end)
- **Open on the verb, no logo.** The first 5 to 10 s decide whether people stay, and about 19% leave in the first 10 s.
  - The hook is the mechanic itself: the flame swept down a frozen street, every shadow swinging, something standing in the dark. (Lieu, Gartner)
- **Tell, show, repeat.** A card states one idea, then gameplay shows exactly that idea, then the next card. (Lieu)
  - When a mechanic is new, hold **one unhurried take** per idea, with cause and effect in the same frame (The Witness, the Sheepherds makeover). That is the 20 s true-angle take.
- **Each section is a mini trailer.** It rises and falls; cuts tighten toward a peak, then a breath. Never more than three similar shots in a row.
- **Stopdowns.** Cut the music so a moment lands in silence, then start the next section. This cut has four:
  1. the stalker into the Heart;
  2. the Act II card;
  3. midnight;
  4. the beat before the drop.
- **Peaks first.** Put the best, most kinetic shot on the biggest musical peak. Here that is the Marshal take on the drop.
- **Two genres, one arc.** Dredge opens calm, then shows the night's horror.
  - One motif carries both acts: an ambient drone and piano in Act I, percussion and choir in Act II. It ends the trailer the way it began (Hades II reprises its opening cue).
- **Game audio on.** A trailer with no game sound feels flat (Lieu, mistake #3).
  - Record with sound effects on. Duck the score 6 to 12 dB under key game sounds: 10 ms attack, 250 to 700 ms release.
  - In a silence, let one diegetic sound carry it: the flame's crackle, the Wrong Shadow's step.
- **Cards.**
  - Lines specific to this game ("could only describe your game").
  - About 3 words per second of dwell, never under 20 frames.
  - Cinzel at 64 to 96 px with +0.06 to 0.12 em tracking.
  - Inside the EBU graphics-safe area: 96 px left and right, 54 px top and bottom.
  - Slow pushes and ember particles. No bouncy easing, no typewriter effects.
- **Loudness.**
  - −14 LUFS integrated, ≤ −1 dBTP.
  - Keep the dynamics: Act I quiet (short-term −22 to −26), Act II not brick-walled. Drive does not normalise.

## Beat sheet (120 BPM, a bar = 2.0 s; `trailer/scripts/cut_v2.py` is the source of truth)
**Type:** **R** = raw gameplay, **S** = in-engine scene (counted as produced), **C** = card.

| Time | Type | Beat | Take @ anchor | Music cue |
|---|---|---|---|---|
| 0:00 | R 6 s | **Hook:** the flame swept down a frozen street; far off, a figure that is not frozen | A1_main @ wrongSeen (Gate Ward) −4.5 s | cold: braam + boom on frame 1, heartbeat, reverse swell |
| 0:06 | C 5 s | **THE LAST EMBER**, "Carry the last fire. Hold back the night.", FIRE · SHADOW · TIME | — | title: boom + bell, Phrygian pad |
| 0:11 | C 3 s | ACT I · **THE STILL CITY**, "Everyone stopped one second before the flood." | — | |
| 0:14 | R 8 s | Walking the frozen city (rain hanging, statues mid-step); line: *You carry the last flame.* | A1_main @ district (Gate Ward) +6.5 s | still: drone, half-time clock, the theme a note at a time |
| 0:22 | C 5 s | **FIRE** card | — | card: pad, bell, whoosh |
| 0:27 | R 20 s | **One take:** aim the flame, the coaching ring, the shadow lines up, the figure wakes and replays its last 10 s; lower-third FIRE | A1_main @ wake#1 −13 s | puzzle: drone, pulse with the Phrygian semitone, an "oo" choir |
| 0:47 | C 5 s | **TIME** card | — | |
| 0:52 | R 8+4 s | Spend Ash, step into the replay as a ghost; a second figure's last moment; lower-third TIME | A1_main @ stepIn#1 −1.5, @ wake#3 −1 | still |
| 1:04 | C 5 s | **SHADOW** card | — | |
| 1:09 | R 8 s | Draw the flame back: his own shadow becomes the bridge over the canal; lower-third SHADOW | A1_main @ bridge −3 | |
| 1:17 | R 6+3+3 s | **The Wrong Shadow** in the Library, wearing his face; look away, it is closer; light it, it stops dead | A1_main @ wrongSeen / wrongShift / wrongLit (Library) | stalk: heartbeat quickening, semitone pulses, reverse swell |
| 1:29 | S 6 s | **The Heart:** "It has your hands." | A1_main @ ending +1 | reveal: choir, bells (stopdown) |
| 1:35 | C 4 s | ACT II · **THE HEARTH**, "Carry it out. Hold it until dawn." | — | act: **braam**, boom, a single tick |
| 1:39 | R 10 s | 7 PM sunset, the first shades, sword cuts; line: *For the first time in four thousand years, the sun sets.* | A2_7pm @ mode:play +1 | hearth: Aeolian pad, pulse, light taiko, the motif |
| 1:49 | R 6+3+3 s | 9 PM shades rise from cast shadows; 11 PM a crawler pounces; an ember carried home | A2_9pm @ spawn#3, A2_11pm @ pounce#1, @ feed#1 | drive: taiko, choir, brass every 2 bars |
| 2:01 | S 6 s | **Midnight:** the hearth dies, the torch is lit from its last flame | A2_midnight @ mode:midnight +1 | midnight: deep bell, near silence (stopdown) |
| 2:07 | R 10 s | **Escalation:** cuts of 4 s, 2 s, then four of 1 s: torch in the lower city, bolts on the wall, kills, the cathedral stirs | A2_1am, A2_5am, A2_9pm, A2_3am @ kill / bolt / spawn | escalate: everything, Shepard riser, **one silent beat** |
| 2:17 | R 21 s | **Climax, one take:** the Hollow Marshal rises, his cry, the waves jumped, the kill | A2_3am @ marshalCry#1 −3 | climax: **the drop**: booms + braams on 1 and bar 5, double taiko, choir, brass, the motif an octave up |
| 2:38 | S 6 s | **Dawn:** the light reaches the gate; the choice | A2_dawn @ mode:choice −4 | dawn: D major (Dorian lift), piano |
| 2:44 | R 3 s | **Button:** back in the still city, a shadow with his face turns toward us | A1_library @ wrongSeen#1 | after: violet drone, one high bell |
| 2:47 | R 3 s | Montage: FIRE / TIME / SHADOW tags, one hit each | A2_7pm @ fireburst, A1_main @ rewind, A2_9pm @ spawn#8 | montage: three taiko + bell hits |
| 2:50 | C 6 s | End card: THE LAST EMBER, play link, FIRE · SHADOW · TIME, "Built in 3 days with Claude Code" | — | end: the motif, fading |

**Score as rendered tonight** (`music/score_v2.wav`): −14.4 LUFS integrated, LRA 15.3 LU. Loudness by section:

| Section | LUFS |
|---|---|
| cold | −14.7 |
| still | −19 to −21 |
| puzzle | −23 |
| stalk | −17 |
| act | −11 |
| hearth | −17.6 |
| drive | −16 |
| escalate | −11 |
| climax | **−9.3** |
| after | −20.6 |
| end | −16.8 |

## Card copy (`cut_v2.py` THEMES; the title and act cards are in the cut)
- **Title:** THE LAST EMBER. *Carry the last fire. Hold back the night.*
- **ACT I · THE STILL CITY:** *Everyone stopped one second before the flood.*
- **FIRE:** *Aim the flame: every shadow in the city swings with it.* / *At the hearth, the fire is your life.*
  - Lower-third: *the flame you carry casts every shadow.*
- **TIME:** *Light a frozen figure from its true angle: its last ten seconds return.* / *Ash is time. Spend it to step in, or rewind.*
  - Lower-third: *frozen in the city, running out at the hearth.*
- **SHADOW:** *A lit shadow turns solid: walk the bridge your body casts.* / *And one shadow moves only when you look away.*
  - Lower-third: *shadows hold you up, and one hunts you.*
- **ACT II · THE HEARTH:** *Carry it out. Hold it until dawn.*
- **Story lines over play:** *You carry the last flame.* · *For the first time in four thousand years, the sun sets.*
- **End:** the play link (production, or the preview once Zain chooses), the three theme chips, *Built in 3 days with Claude Code*.

## Sound (`trailer/scripts/score_v2.py`, original, numpy, no samples; logged in ASSETS.md)
- **One grid for both acts** at 120 BPM. Act I is in half time over it: D Phrygian (i, ♭II, i, ♭vii), with the semitone above the root for dread. Act II is in D Aeolian, turning D major at dawn.
- **The arrangement follows the cut:** `plan_v2.py` writes a `cues` list into `shotlist.json`, and the score renders each section by name. Re-timing the cut re-times the music.
- **New instruments, from the research recipes:**
  - **Braam:** detuned saws an octave apart, a filter that opens with the swell, tanh drive, a long tail.
  - **Shepard riser:** octave-spaced sines all gliding up under a bell curve over log-frequency (the Dunkirk device; it suits TIME).
  - **Heartbeat:** a lub-dub of falling sines, low-passed.
  - **Whoosh:** band-passed noise sweeping across the stereo field.
  - **Reverse swell:** ends one frame before its hit.
  - **Formant choir:** "ah" and "oo" formants.
- **Mix (`build_v2.sh`):** the game audio from the recordings at the per-shot volume in the shotlist, over the score.
  - The score is sidechain-ducked under the game: threshold 0.03, ratio 4, 10 ms attack, 400 ms release.
  - Then v1's master: glue limiter, measured gain to −14 LUFS, a 4x-oversampled limiter so the AAC stays under −1 dBTP.
- **Fallback sources** if synthesis isn't enough (none downloaded):
  - Kenney.nl (CC0).
  - Freesound with the CC0 filter (keep a screenshot of each page).
  - The Sonniss GDC bundles are royalty-free, not CC0: allowed, but log them.
  - Avoid Pixabay: some tracks carry Content ID claims.

## Capture plan, after "record now" (`trailer/scripts/capture-v2.mjs`)
Each take is a real recording of the tab, with HUD, captions and sound. A `<take>-moments.json` sits beside it: every game event on the recording's clock. The shotlist cuts to events, so re-recording a take never means re-timing the edit.

| Take | What | How long |
|---|---|---|
| A1_main | Act I main path, the bot, every district, to "Carry it out" | up to 40 min, real time |
| A1_full | Act I with every Last Word (more wakes, replays and step-ins) | up to 60 min |
| A1_market, A1_library | Single districts: cleaner second angles; the Library is the button | 15 min each |
| A1_heart_hard | The Heart on Hard (no ember trail, a cleaner frame) | 15 min |
| A2_bridge | The bridge into Act II | 30 s |
| A2_7pm, A2_9pm, A2_11pm, A2_1am, A2_5am | One hour each, demo bot, godMode | 40 s each |
| A2_midnight, A2_dawn | `G.midnight()`, `G.dawn()` | 14 s, 45 s |
| A2_3am | The cathedral and the Hollow Marshal | 60 s |

Steps:
1. Start the dev server of the chosen build: `preview_start merged` serves port 5181. The capture sink is a Vite dev middleware.
2. Have the Mac on power, awake, and the screen free.
3. Run `caffeinate -is node trailer/scripts/capture-v2.mjs all`. The first run asks once for macOS screen-capture permission.
4. Run `python3 trailer/scripts/plan_v2.py`. Any anchor the bot never produced is listed as a "note". Pick the alternative below, edit `cut_v2.py`, and re-run.
5. Run `trailer/scripts/build_v2.sh preview`, look at the contact sheet, adjust, then `build_v2.sh final`, then QC (jam-trailer step 7).
6. **A human watches it with sound.** Upload to Drive only with Zain's go-ahead.

**Anchors that may not occur on the main path, and their stand-ins:**

| Anchor | Stand-in |
|---|---|
| `stepIn#1` | the same event in A1_full |
| `rewind#1` (montage) | A1_full `rewind`, or swap the TIME tag to `wake#4` |
| `wrongLit@library` | `wrongSeen#2@library` |
| `bridge` | A1_market `bridge` |
| `fireburst#1` | `feed#2` |
| `marshalCry#1` | `mode:play` +25 s in A2_3am |

## Open decisions (for Zain in the morning)
1. **Which build to record:** production (the Still City alone; `/classic` is the old combat), or the `merged-game` preview (the two acts). The plan assumes merged-game. On production, Act II takes come from `/classic`, and the act handoff, Heart reveal and bridge shots are cut.
2. **The end-card link:** production URL (the default), or the preview once it's public.
3. **Whether to keep the two story lines and the lower-thirds** (see the strict count above).

## Sources
Trailer structure, pacing and cards:
- Derek Lieu, on the cold open, stopdowns, pacing, the line of rising action, production music and structure, writing title cards, Tell Show Repeat, trailers as tutorials (The Witness), cognitive load (Tunic), Hades II, Riven, Arranger, the Sheepherds makeover, and the 10 common mistakes: https://www.derek-lieu.com/start-here
- Derek Lieu, GDC 2019 talk: https://gdcvault.com/play/1025729/Trailer-Made-What-Makes-a
- Kert Gartner: https://www.kertgartner.com/making-entertaining-and-engaging-video-game-trailers
- GameDiscoverCo on hooks: https://newsletter.gamediscover.co/p/how-to-get-to-your-games-hook-quick
- Film Editing Pro, on the button and on copy cards
- PCGamesN and Xbox Wire on Dredge

Sound, loudness and typography:
- Violet Recording: https://violetrecording.com/sound-design-for-trailers/ and https://violetrecording.com/how-to-master-for-youtube/
- IRPR: https://sounddesign.irpr.agency/guides/sound-design-for-trailers-complete-guide/
- Krotos: https://www.krotosaudio.com/trailer-sound-design-tips-tricks/
- Hans Zimmer on Dunkirk (CBC): https://www.cbc.ca/radio/q/blog/hans-zimmer-explains-the-audio-trickery-that-made-dunkirk-audiences-nauseous-1.4311684
- VI-Control, on making braams: https://vi-control.net/community/threads/making-braams.121447/
- Formant tables: Peterson & Barney (1952), via SFU: https://www.sfu.ca/sonic-studio-webdav/handbook/Formant.html
- EBU R95 (safe areas): https://tech.ebu.ch/publications/r095
- Production Advice (loudness): https://productionadvice.co.uk/stats-for-nerds/
- MCV on Crytek's mixing: https://www.mcvuk.com/development-news/audio-loudness-for-gaming-the-battle-against-ear-fatigue/
- Freesound FAQ: https://freesound.org/help/faq/
- Sonniss bundle licence: https://sonniss.com/gdc-bundle-license/
- Pixabay terms: https://pixabay.com/service/terms/
