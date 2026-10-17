# The Still City: build notes (branch `still-city`)

Source of truth: *The Still City: Game Design & Narration* (Moeez Abid, 2026-10-17). This file records how it is
built on this engine, and the calls made where the doc left a choice, contradicted itself, or could not work as
written. Originals are kept: `3D_Branch` (the combat game, on the production link) and `story` (the loop story).
The combat game is still reachable here at `classic.html`; `index.html` is the Still City.

## Status
All five districts are built and play start to finish, with the endings. A script bot plays every district in the
tests (`src/still/bot.test.ts`) and plays the whole game in the browser (`?bot=1`).

| District | Teaches | Puzzles | Action beat | Last Words |
|---|---|---|---|---|
| The Gate Ward | carry, true angle, step in | the lever guard (step in, pull it); the two gate guards (wake both, lift the bar) | none: the Wrong Shadow appears once, far off | 1-5 |
| The Market of Weights | height changes size; shadows carry you | three scales (shadow on each pan, just so); the dry canal (your own shadow as a bridge) | the stall-row collapse | 6-12 |
| The Temple of Hours | order matters; Ash is scarce | four priests in the riddle's order (4 of 5 Ash); the sundial shows the false brazier | the pillar hall: gusts, the Wrong Shadow hunting | 13-19 |
| The Library of Whispers | angle changes meaning | seven pages: a lie from the side, the truth from above; the shelf maze and its shadow door | the stacks: ladders, the Wrong Shadow wearing his face | 20-26 |
| The Heart | everything | five plates: true angle, low and long, the right order, from above, from within | the ring sinks, the Rumble peaks, the run to the centre | 27-36 |

Endings at the Heart's centre: Keep the flame, Let it go out, and (all 36 Last Words) Hold the door. The 36th
is heard only by lighting the Wrong Shadow itself, after the other 35.

## Decisions
- **Hero:** the shadow knight, the sword gone; the flame sits on the palm of his raised off hand. His arm reaches it
  with two-bone IK, and the sim only puts the flame where that arm can reach (by his facing, which turns to the view),
  so the fire is never drawn apart from his hand.
- **Voice:** text captions, each line keyed by id (`data-line`) so recorded audio can drop in later; narrator, flame
  and Wrong Shadow styled apart.
- **Hints:** Off / Gentle / Guided in the pause menu, default Guided. Every trigger and tier from the doc, a 90 s
  cooldown, progress resets a puzzle's tier, never during a chase. H asks the flame directly.
- **Physics over prose:** a low flame makes longer shadows everywhere (the doc says both; its Market riddle and real
  light agree on this). The scales balance with the flame raised just so: lower and the pan drowns in shadow.
- **Bridges are shadows that span a gap:** a shadow over a pit holds him up while its far end rests on floor. Drawn
  back (Shift) it runs ahead of him (the beggar's replay shows it); held low in front it reaches back to the bank.
  "Vanishes instantly if the flame moves": raise it, swing it, or let it go out, and the far end drops into the pit.
- **The maze's exit:** a carried point light always lights the way its bearer faces, so shelf shadows (which are
  walls there) can never close a path on their own. The doc's "the exit exists only when the flame is held high" is
  built literally: the maze's way out is a door of shadow that is open only while the flame is held high by it.
- **Gameplay never reads the GPU:** shadows that matter (bridges, scales, plates, the maze, the sundial) are computed
  exactly from the sim's solids and the flame (point-light projection, convex hulls, point-in-polygon).
- **Frozen ink shadows:** each figure's last shadow is its own geometry projected from its true light onto the wall
  or floor it fell on. At the true angle the live shadow lands exactly on the ink: that is the puzzle and its answer.
- **The Wrong Shadow** follows the doc's rule (move only when outside the camera frustum and outside the light;
  freeze when seen or lit), walks a graph of shadowed nodes, and is never fatal in the first two districts.
- **Rewind:** whole-state snapshots (5 s, 1 Ash); Last Words heard are never lost to a rewind or a death.
- **Ash:** start 5, cap 5, carried between districts; braziers refill it and are the checkpoints.

## Controls (the camera moves only by the mouse; the cursor is never captured)
| Input | Action |
|---|---|
| W A S D / arrows | move, relative to the camera |
| mouse drag | look; the flame follows: looking up lifts it, turning turns him and it |
| wheel | fine flame height |
| Shift (hold) | draw the flame back: your shadow leads |
| E / click | wake a locked shadow (1 Ash), rest, relight, read |
| hold E | step into the replay (2 Ash) |
| hold R | rewind 5 s (1 Ash) |
| right click / Q | Flame Lock: turn the light on the Wrong Shadow |
| H | ask the flame; J the Last Words; Esc pause |

## Running, testing, recording
- `?d=N` starts in district N (0-4); `?skip=1` skips the title; `?debug=1` shows fps; `?bot=1` plays itself.
- `npx vitest run src/still` plays every district by script through the sim.
- Recording a full run: `node scripts/record-run.mjs http://localhost:5178/ <name>` (against a dev server) launches
  Chrome with tab capture auto-accepted and background throttling off; the page records its own tab (canvas,
  captions and sound) to `trailer/raw/<name>.mp4`.
