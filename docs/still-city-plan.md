# The Still City: story through gameplay (plan, conflicts, status)

Brief: Moeez's prompt (2026-10-17): make the story part of how the game plays; minimal cutscenes; an event bus with
editable lines; per-puzzle hints; pacing; a full caption system. Source of truth: `docs/still-city-design.md`.
Zain asked for the work to go ahead without stopping for questions, so every conflict below records the call made;
each is easy to reverse.

## What already existed (before this pass)
- Five districts with the doc's puzzles; true-angle replays, step-in, Ash (start 5, wake 1, step in 2, rewind 1),
  braziers as checkpoints (false ones burn cold blue), wall torches, flame states (steady / low / out), gusts, the
  Wrong Shadow (moves only unseen and unlit; Flame Lock), Last Words 1-36, the three endings.
- Narration and whispers keyed by id in a TS module; captions in two slots; a global hint system.

## What this pass adds (in order)
1. **Playing style:** the flame shapes movement. Held low (looking down) he walks carefully; held high he walks; drawn
   back (Shift) he runs, the flame sheltered behind him (chases, bridges). Flame Lock is the only "combat": light
   freezes the Wrong Shadow. Each district keeps its lesson (angle, height, order, from above, from within).
2. **Environment storytelling:** frozen shadows (built), carvings on the walls that tell the flood and the lighting of
   the fire, the Rumble growing district by district (and the floor trembling at the Heart), brazier colours, rain
   frozen in the air, lighting and fog growing colder and closer by district. Beats fire on where he is, what he
   lights, and how he plays.
3. **Event-driven narrative:** a central event bus. Gameplay emits events (shadow lit, replay ended, riddle read, flame
   low, death and retry, Last Word found, Wrong Shadow seen...). `src/still/narrative/lines.json` holds every line;
   `src/still/narrative/beats.json` maps events to lines (once, variants, delays, conditions). Edit text there.
4. **Hints:** one state machine per puzzle (time in room, failed attempts, tier, 90 s cooldown, reset on progress),
   plus the global triggers (Ash at 1 or less, caught twice, a Last Word near). Off / Gentle / Guided.
5. **Pacing:** calm phase, one action beat per district, never two back to back; the Ash economy as in the doc.
6. **Captions:** speaker styles (narrator, flame, Wrong Shadow, Last Words), sound-cue captions ([music stops],
   [water rumbling], [footstep, half a beat late]...), a priority queue timed by text length, a readable band that
   never covers the flame or the Wrong Shadow, and settings: on/off, size, background opacity, sound cues on/off.
7. **Guidance:** a quiet objective line for every step, an ember that leaves the flame and leads the way, and a warmth
   ring that fills as the flame nears a shadow's true angle.

## Conflicts between the doc and the build, and the call made
1. **Shadow size and flame height.** The Market puzzle says lowering the flame shrinks a shadow; real light (and the
   doc's own riddle: "the poor man's shadow is longer at dusk") does the opposite. Built: a low flame makes a longer
   shadow, everywhere.
2. **The beggar's bridge.** A carried flame cannot hold another figure's shadow still while you walk across it. Built:
   you cross on your own shadow; the beggar's replay shows him doing exactly that.
3. **The shelf maze.** A light carried in the hand always lights the way its bearer faces, so shelf shadows cannot
   close a path on their own. Built: shelf shadows are walls, and the way out is a door of shadow that opens only
   while the flame is held high ("the exit exists only when the flame is held high").
4. **Cutscenes.** The brief asks for minimal ones. Kept: one short, skippable establishing shot per district (with its
   card), and the ending. Everything else plays in the game, under the player's control.
5. **Play time.** The doc targets 3-4 hours; the jam build is about 20-40 minutes for a first-time player.
6. **Voice.** The doc assumes recorded voice; captions carry it now, every line keyed by id for audio later.
7. **"Each district ends with a crumbling escape"** (pressure systems) vs the district table (Gate Ward: no action
   beat). Followed the district table: one action beat each, the Gate Ward none.
8. **"Each district adds one brazier chamber."** Read as: braziers refill Ash to its cap of 5 and are the checkpoints.
9. **Movement and the flame** (from the brief, not the doc): a low flame slows him to a careful walk; the flame drawn
   back is a run. Chases are run with the flame drawn back, as the doc's chase says ("keeping it lit from behind").

## Proposed, not built (needs a yes)
- More Last Words placed one detour away in each district once the levels are larger.
- Recorded voice for the narrator and the flame.

## Status (2026-10-17, commit on `3D_Branch` / live)

### Implemented
- **Playing style:** flame height sets his pace (low: careful; up: walk; drawn back: run). Flame Lock is the only
  "combat": light holds the Wrong Shadow (a cold halo shows it is held). Each district's lesson is its puzzles.
- **Environment storytelling:** frozen ink shadows; carved reliefs in every district (the crowd at the gate, the
  market, the water rising, the priests, the fire held up, the wave, the door); brazier colours (warm gold, cold blue,
  plainly blue once the sundial shows it); the Rumble louder each district and the floor trembling at the Heart; colder,
  closer light and fog by district; rain frozen mid-fall that glints in the flame; birds stopped mid-wingbeat.
- **Event-driven narrative:** `narrative/bus.ts` (central bus), `narrative/lines.json` (every line, the 36 Last Words,
  the riddles, sound-cue captions), `narrative/beats.json` (event to lines: once, variants, delays, cooldowns,
  priorities). Every doc trigger is wired, including the death variants and the Library's late echo.
- **Hints:** one state machine per puzzle (time on the step, failed attempts, riddle reads, tier, 90 s cooldown, reset
  on progress) plus the Ash, caught and Last-Word triggers; quiet during every chase; Off / Gentle / Guided.
- **Captions:** narrator, flame, Wrong Shadow, Last Words (their own row) and inscriptions styled apart; sound cues in
  brackets; priority lanes (an urgent line cuts a lesser one, which returns after); timed by length; low on the screen
  under the knight; settings: on/off, size, backing, sound cues. Default on.
- **Guidance:** an objective line for every step; an ember trail of chevrons on the floor to the next place; a ring of
  light where to stand for a true angle; the flame coaching in plain words once there (turn, lower, raise, hold); every
  shut way says what opens it; a warmth ring that fills as the angle nears.
- **Cutscenes:** one short, skippable establishing shot per district; the ending.
- **Tests:** a script bot plays every district through the sim (full and main-path), plus the maze and canal rules.
- **Critic loop:** two independent review passes against this brief and the doc; their findings fixed.

### Partial
- **Action beats are short** (about 5-15 s each, against the doc's 60-90 s): the districts are jam-sized. The Heart's
  run now goes round to a gap on the far side; longer chases need longer levels.
- **The Wrong Shadow in the Library** only appears for the stacks chase, so its late echo is heard there.
- **Play time** is about 20-40 minutes, not the doc's 3-4 hours.

### Next
1. Lengthen each action beat to the doc's 60-90 s (longer routes, staged openings).
2. Recorded voice for the narrator and the flame (lines are keyed by id).
3. More Last Words one detour away in larger districts.
