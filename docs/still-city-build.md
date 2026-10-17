# The Still City: build plan (branch `still-city`)

Source of truth: *The Still City: Game Design & Narration* (Moeez Abid, 2026-10-17). This file records how it is
built on this engine, and the calls made where the doc left a choice or contradicted itself. Originals are kept:
`3D_Branch` (the combat game, on the production link) and `story` (the loop story).

## Decisions
- **Hero:** the shadow knight, the sword gone; the flame held in a raised hand.
- **Voice:** text captions, each line keyed by id so recorded audio can drop in later (narrator, flame, Wrong
  Shadow each styled apart).
- **Hints:** Off / Gentle / Guided in the pause menu, default Guided.
- **World:** the five districts rebuilt as the doc describes, with the existing level toolkit (the cathedral
  becomes the Temple, the market the Market, the hearth plaza the Heart; the Gate Ward and Library are new).
- **Physics over prose:** a low flame makes longer shadows everywhere (the doc says both; its Market riddle and
  real light agree on this).
- **Bridges are your own shadow:** a carried flame cannot hold another figure's shadow still while you walk past it,
  so you cross gaps on your own shadow, thrown ahead by drawing the flame back. The beggar's replay teaches it. This
  is also the doc's riddles: "what follows the light, yet leads the way", "the poor man's shadow is longer at dusk",
  "the one who stayed" (the Heart's fifth plate).
- **Gameplay never reads the GPU:** shadows that matter (bridges, scales, plates, the maze) are computed exactly
  from the sim's solids and the flame (point-light projection, convex hulls, point-in-polygon), and drawn from the
  same polygons, so what you see is what you stand on. (Research: shipped shadow games do the same.)
- **The Wrong Shadow** follows SCP: Containment Breach's open-source rules: frozen while in view or lit, moves when
  neither, never moves inside the view; silence and a dragging sound are its tells.
- **Rewind:** a ring of whole-state snapshots (5 s); the sim is deterministic, so resuming is exact.

## Controls (the camera moves only by the mouse; the cursor is never captured)
| Input | Action |
|---|---|
| W A S D / arrows | move, relative to the camera |
| mouse drag | look; the flame follows the view: looking up lifts it, swinging the view sweeps every shadow |
| wheel | fine flame height |
| Shift (hold) | draw the flame back: your shadow leads (bridges, the fifth plate), you light what is behind you |
| E / click | wake a locked shadow (replay, 1 Ash) |
| hold E | step into the replay (2 Ash) |
| hold R | rewind 5 s (1 Ash) |
| right click | Flame Lock: snap the view (and the flame) to the Wrong Shadow |
| H | hint; Esc pause |

## Build order (each step ends playable and committed)
1. **Carry:** new sim (`src/still/`), the flame state machine, braziers, wall torches, Ash, the knight holding the
   flame; a Gate Ward blockout where shadows reshape as you look around.
2. **Figures:** jointed figures as frozen statues, their frozen ink shadows, true-angle alignment with feedback,
   Last Words, waking replays.
3. **Mechanisms and step-in:** levers, portcullis, the gate bar, riddle plaques; stepping into a replay.
   The Gate Ward plays start to finish.
4. **Pressure:** the Wrong Shadow, Flame Lock, silence cues, being caught, rewind, flame low/out, gusts.
5. **Market of Weights:** own-shadow bridges, the scales, the canal, the stall-row collapse.
6. **Temple of Hours:** the four priests in order, the sundial floor, false braziers, the pillar hunt.
7. **Library of Whispers:** reliefs read from above, the shelf maze, the ladder chase, the Wrong Shadow's face.
8. **The Heart and the endings:** five plates, the final chase, Keep the flame / Let it go out / Hold the door.
9. **The rest of the doc:** the hint system (three tiers, every trigger), all 36 Last Words placed, the Rumble,
   sound cues, the opening, district cards, the journal, settings, polish, tests.
