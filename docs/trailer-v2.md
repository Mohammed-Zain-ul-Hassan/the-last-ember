# The Last Ember: trailer v2 (both acts). Prep only.

**Status (2026-10-18, ~03:30):** planned, scored and wired. Nothing is recorded.
- Recording waits until the group says **"we are done, record now"**.
- Zain chooses which build to record: production, or the `merged-game` preview.
- An animatic renders now. Every shot not yet captured plays as a labelled slate, under the real cards, lines and score:
  `trailer/scripts/build_v2.sh preview` produces `trailer/out/v2_preview_540p.mp4` and `v2_contact_sheet.jpg`.
- Shape (Moeez): a stylised first minute, then two minutes of pure gameplay.

## Rules this cut is built to (docs/handbook.md, the jam-trailer skill, and Moeez's structure)
Moeez (2026-10-18): *"around 3 minutes, and the last 2 minutes should be of pure gameplay."* So the stylised and
teaser work all lives in the first minute, and the last two minutes are continuous raw play.

`plan_v2.py` asserts every rule below:

| Rule | This cut |
|---|---|
| About three minutes | **2:59** (179 s) |
| **0:00–0:59 teaser:** cold open, title, act cards, the three theme reveals (card + glimpse), the Heart, midnight | 59 s, of which 26 s is raw glimpses |
| **0:59–2:59 pure gameplay:** gameplay shots only, cut on the beat; no cards, no cutscenes, no lower-thirds; only small corner tags (a theme word with a few words on how, then the play link) | **120 s**, 19 shots |
| Raw, directly screen-recorded gameplay ≥ 2:00 | **146 s** (137 s even if no second under lettering counts) |
| Stylised ≤ 1:00 | 33 s |
| Each theme named verbatim | an explainer card and a lower-third in the teaser, a corner tag where it is played, title chips |
| Longest uninterrupted take | 21 s (the Marshal) |
| Loudness (animatic, score only) | −14.4 LUFS, true peak −2.0 dBTP |

The rule check also asserts:
- the gameplay block starts exactly on a cut;
- nothing but `gameplay` shots sit in it;
- every theme has a corner tag in it.

**There is no end card in this shape** (it would not be gameplay). The title carries the name, and the play link
rides in the corner of the last shot.

**Screen recording:** v1 used canvas captures. v2 records the **tab as seen and heard**, with the HUD, captions and the
game's own sound (`?rec=1` in both acts). So "directly screen-recorded" holds literally.

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

### Teaser, 0:00–0:59 (the stylised minute)
| Time | Type | Beat | Take @ anchor | Music cue |
|---|---|---|---|---|
| 0:00 | R 6 s | **Hook:** the flame swept down a frozen street; far off, a figure that is not frozen | A1_main @ wrongSeen (Gate Ward) −4.5 s | cold: braam + boom on frame 1, heartbeat, reverse swell |
| 0:06 | C 5 s | **THE LAST EMBER**, "Carry the last fire. Hold back the night.", FIRE · SHADOW · TIME | — | title: boom + bell |
| 0:11 | C 3 s | ACT I · **THE STILL CITY**, "Everyone stopped one second before the flood." | — | |
| 0:14 | C 4 s + R 4 s | **FIRE** card, then a glimpse: the flame swung, every shadow swinging (lower-third) | A1_main @ district (Gate Ward) +7 s | puzzle: drone, semitone pulse |
| 0:22 | C 4 s + R 4 s | **TIME** card, then a glimpse: a frozen figure wakes and replays (lower-third) | A1_main @ wake#2 | |
| 0:30 | C 4 s + R 4 s | **SHADOW** card, then a glimpse: look away, the shadow with his face is closer (lower-third) | A1_main @ wrongShift (Library) | stalk: heartbeat quickening |
| 0:38 | S 5 s | **The Heart:** "It has your hands." | A1_main @ ending +1 | reveal: choir, bells (stopdown) |
| 0:43 | C 4 s | ACT II · **THE HEARTH**, "Carry it out. Hold it until dawn." | — | act: **braam** |
| 0:47 | R 4×2 s | Glimpses, quickening: sunset sword cut, shades rising, the torch, the Marshal's wave | A2_7pm, A2_9pm, A2_1am, A2_3am | drive |
| 0:55 | S 4 s | **Midnight:** the hearth dies, the torch is lit | A2_midnight @ mode:midnight | midnight: bell, near silence (stopdown) |

### Pure gameplay, 0:59–2:59 (120 s: the story again, played)
| Time | Shot | Take @ anchor | Corner tag | Music cue (ducked under the game) |
|---|---|---|---|---|
| 0:59 | 20 s, **one take:** aim the flame, the ring, the shadow lines up, the figure wakes and replays | A1_main @ wake#1 −13 | FIRE · *the flame casts every shadow* | puzzle |
| 1:19 | 8 s: spend Ash, step into the replay as a ghost | A1_main @ stepIn#1 | TIME · *Ash is time: step in, rewind* | still |
| 1:27 | 8 s: the shadow bridge over the canal | A1_main @ bridge | SHADOW · *a lit shadow turns solid* | |
| 1:35 | 6 + 4 + 4 s: the Wrong Shadow with his face; lit, it stops dead; the Heart's first plate | A1_main @ wrongSeen / wrongLit (Library), plate#1 | — | stalk |
| 1:49 | 10 s: 7 PM, sunset at the hearth, the first shades | A2_7pm @ mode:play +1 | — | hearth |
| 1:59 | 6 + 3 + 3 s: 9 PM shades rise; 11 PM a crawler; an ember carried home | A2_9pm, A2_11pm | — | drive |
| 2:11 | 6, 4, then four 2 s cuts: the torch in the lower city, bolts on the wall, kills, the cathedral stirs | A2_1am, A2_5am, A2_9pm, A2_3am | — | escalate: Shepard riser, one silent beat |
| 2:29 | **21 s, one take:** the Hollow Marshal rises, his cry, the waves, the kill | A2_3am @ marshalCry#1 −3 | — | climax: **the drop** |
| 2:50 | 6 s: dawn, the choice, played | A2_dawn @ mode:choice | — | dawn: D major |
| 2:56 | 3 s: last look, a shadow with his face in the still city | A1_library @ wrongSeen#1 | the play link | after: drone, one bell |

**Score as rendered** (`music/score_v2.wav`, from this cut's cues): -14.4 LUFS integrated, LRA 14.3 LU. The mastered animatic is −14.4 LUFS, true peak −2.0 dBTP. Loudness by section:

| At | Cue | LUFS |
|---|---|---|
| 0:00.0 | cold | -14.9 |
| 0:06.0 | title | -16.7 |
| 0:14.0 | puzzle | -23.3 |
| 0:30.0 | stalk | -18.0 |
| 0:38.0 | reveal | -19.1 |
| 0:43.0 | act | -12.1 |
| 0:47.0 | drive | -16.2 |
| 0:55.0 | midnight | -16.8 |
| 0:59.0 | puzzle | -23.2 |
| 1:19.0 | still | -19.4 |
| 1:35.0 | stalk | -17.2 |
| 1:49.0 | hearth | -17.4 |
| 1:59.0 | drive | -16.2 |
| 2:11.0 | escalate | -11.8 |
| 2:29.0 | climax | -9.2 |
| 2:50.0 | dawn | -15.2 |
| 2:56.0 | after | -19.4 |

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
- **Corner tags (pure-gameplay block):** FIRE *the flame casts every shadow* · TIME *Ash is time: step in, rewind* · SHADOW *a lit shadow turns solid* · the play link on the last shot.
- No story lines over play and no end card in this shape (both would break "pure gameplay"). "Built in 3 days with Claude Code" can go in the Drive description.

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
| `wake#2` (TIME glimpse) | `wake#3` |
| `plate#1` | `district@heart` +10 s |
| `wrongLit@library` | `wrongSeen#2@library` |
| `bridge` | A1_market `bridge` |
| `marshalCry#1` | `mode:play` +25 s in A2_3am |

## Open decisions (for Zain in the morning)
1. **Which build to record:** production (the Still City alone; `/classic` is the old combat), or the `merged-game` preview (the two acts). The plan assumes merged-game. On production, Act II takes come from `/classic`, and the act handoff, Heart reveal and bridge shots are cut.
2. **The play link in the last shot's corner:** production URL (the default), or the preview once it's public.
3. **No end card** (Moeez's last-two-minutes rule). If the team wants one anyway, it costs 6 s of the gameplay block.

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
