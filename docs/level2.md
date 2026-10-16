# THE LAST EMBER: Level 2

Level 1 (playable-7): one beautiful fight, in one ruin, six times. **Level 2: one night, one journey.** The knight
defends the hearth on wide grounds, then carries its last flame across a fallen city to the dawn. Every hour is a
new place, a new silhouette for the trailer, and a step in the story.

Decisions (taken by Claude on the user's "take it to level 2", Day 1 16:06): the plan in `plan-exploration.md` is
approved as recommended. Dawn and the ending move to the city wall. Road stages are ~110 m.

## The night, re-staged
| Hour | Place | Goal | New verbs |
|---|---|---|---|
| 7 PM | **Hearth grounds** (90 m of ruins, hearth at centre) | Survive the hour | Ember shrines: fetch embers, feed the hearth |
| 9 PM | Hearth grounds, the colonnade walk opens | Survive the hour | Platforms: the broken colonnade, the balcony |
| 11 PM | Hearth grounds, the flame is low | Survive; embers matter most | Defend vs roam tension |
| 12 AM | Cutscene: the torch is lit | | |
| 1 AM | **The lower city**: streets, rooftops, a dead market | Reach the city gate | Road: travel east, rooftops, checkpoint braziers |
| 3 AM | **The cathedral**: pews, a nave of pillars, balconies, the rose window | Cross the nave, defeat the Hollow Marshal | Boss gate: the doors open when he falls |
| 5 AM | **The city wall**: ramparts and stairs to the gatehouse | Climb to the top as the sky lightens | The dawn rises in front of you; the choice is made on the wall |

## Systems
- **Levels as data** (`src/data/levels.ts`): bounds, solid walls (stand on them, they cast the torch's shadows),
  one-way platforms (down + jump to drop), shrines, checkpoints, an end gate, region kinds for dressing.
- **Shades drift**: they are shadows, so they float toward the knight, up onto rooftops too. They rise from shadow
  pockets **near the knight** and, on the grounds, **near the hearth**, so the hearth is threatened while you roam.
- **Embers**: shrines light up during the hour. Carrying an ember slows the knight a little, and delivering it
  restores the hearth (its light grows, its shadows shrink).
- **Road**: the hour's bar shows distance. Checkpoint braziers are lit by the torch and are where you rise again.
- **Camera**: follows with look-ahead, rises with the knight onto rooftops, and is clamped to the level's ends.
- **UI**: an off-screen hearth marker (pulses when the hearth is struck), an ember indicator, and a "brazier lit"
  toast.

## Phases (strictly in order; each ends tested, committed, pushed)
1. **The journey.** Level data and sim (platforms, drifting shades, local spawns, embers, road goal, checkpoints,
   boss gate), level builder and kit, follow camera, markers, the bot on roads, tests. ← building now
2. **Places.** Dressing per region: house facades and roofs, the market, the cathedral nave and rose window, the
   wall and gatehouse with the sunrise beyond. Reveal camera shots at each entrance.
3. **Enemies with ideas.** The *Lantern-eater* (keeps its distance, spits shadow bolts that dim the flame); the
   *Crawler* (fast, low, comes in pairs). The Hollow Marshal gets two phases and a cry.
4. **Story beats.** Short silhouette memory vignettes between hours (the hall, the faces, the night the fire went
   out), using the in-engine renderer, not text walls.
5. **The finish.** Per-hour grade (time, wounds, embers, shades freed), best saved locally, chapter select after the
   first completion, settings (volume, screenshake), a full audio pass per place.

Feature freeze Day 2 evening. Cut from the bottom of this list.
