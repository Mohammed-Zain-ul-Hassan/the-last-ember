# Plan: beyond the arena (for approval, not built yet)

**Problem:** every hour is played on one 34 m stretch of ruins around the hearth. The knight can't go anywhere, so
the night feels small and the trailer shows the same backdrop for two minutes.

**Constraints:**
- Feature freeze is Day 2 evening (about 29 h from Day 1 15:00).
- The 2D sim must stay simple and testable.
- The hearth-defence core (fire, shadow, time) is our theme score, so it must stay.
- 60 fps on venue laptops.

## Options considered
| | Idea | What it adds | Cost | Risk |
|---|---|---|---|---|
| A | **Wider hearth grounds**: ~90 m around the hearth instead of 34 m, camera follows | Room to move; shades arrive from far off | low | low |
| B | **The torch road**: after midnight he carries the fire *east* through the fallen city to meet the dawn: streets → cathedral nave → city wall | A journey and a story arc; every hour looks different | medium | medium |
| C | **Verticality**: one-way platforms (broken stairs, wall walks, balconies, rooftops) | Jumping matters; plunges from height; varied fights | medium | low (the sim already lands on wall tops) |
| D | **Depth lanes**: step between foreground and background lanes at doorways (true 2.5D) | Uses the 3D camera | high | high (collision, camera, bot, readability) |
| E | **Ember shrines**: fallen embers scattered across wide grounds; carry them back to feed the hearth | A *reason* to leave the hearth: risk vs reward, and fire ties to time | medium | low |

## Recommendation: A + E before midnight, B + C after midnight, skip D
**Before midnight (7, 9, 11 PM) are the hearth grounds:**
- The arena widens to ~90 m with the hearth at the centre.
- Each hour, 2–3 **ember shrines** light up somewhere in the ruins. Carrying an ember back (it lights the knight
  and slows him a little) feeds the hearth: its flame rises, its light grows, and the shadow zones shrink.
- Leaving the hearth unguarded lets shades reach it, and that tension is the gameplay.
- An edge-of-screen marker shows the hearth's direction and pulses when it is under attack.

**After midnight (1, 3, 5 AM) is the torch road:**
- Three hand-built side-scrolling segments eastward, each ~120 m:
  - **1 AM, the lower city:** streets, collapsed houses, a market under a broken roof, rooftop and stair platforms.
  - **3 AM, the cathedral:** the nave, pillars throwing long torch shadows, balconies, and the Hollow Marshal under
    the rose window.
  - **5 AM, the city wall:** ramparts and a climb up the wall walk to the gate, where the dawn rises. The ending
    choice happens on the wall.
- Shades rise from the shadows the torch throws off ruins as he passes. Holding still lets them gather, so the
  road keeps him moving.
- Checkpoint braziers along the road can be lit with the torch. They're instant-retry points and they light the
  way behind him.
- This is what the spec originally promised ("1–5 AM stages scroll east through the fallen kingdom").

## Technical plan
- **Sim (`src/sim`):**
  - Level data replaces the single `WALLS` list: `walls` (solid, cast shadows), `platforms` (one-way, drop through
    with down + jump), `bounds`, `shrines`, `checkpoints`, `spawnRules`.
  - Shadow intervals already work for any wall list. Platforms join the solid list.
  - Spawn picks shadow pockets near the knight (±25 m), not across the whole level.
  - New unit tests: one-way platforms, ember carry/feed, checkpoint respawn, spawn locality.
- **Data (`src/data/levels.ts`):** one level per hour as plain data. A teammate can author it.
- **Render (`src/render`):**
  - A level builder turns the data into the existing smooth kit (stone walls, columns, arches, stairs, roofs),
    with instanced bricks.
  - Chunk visibility culls beyond ±45 m.
  - The skyline, fog and sky are already infinite-width.
- **Camera:** follow with look-ahead in the facing direction, a vertical dead zone for platforms, and authored
  "reveal" shots at segment entrances (the nave, the wall). This is where the 2.5D camera swings pay off.
- **UI:** a hearth-direction marker, an ember-carry indicator, and a checkpoint "lit" toast.
- **Demo bot:** follow the road waypoints, jump gaps and walls, fetch embers when the hearth is healthy.
- **Performance:**
  - One shadow-casting light (the torch) as now; checkpoint braziers are unshadowed lights.
  - Distance culling; profile with `bench()`.

## Estimate (30-min units)
| Work | u |
|---|---|
| Level data model, wider bounds, spawn locality, tests | 3 |
| Follow camera (look-ahead, platforms, reveal shots) + hearth marker | 3 |
| Ember shrines (carry, feed, UI, tests) | 3 |
| One-way platforms + jump/plunge tuning | 2 |
| Level builder (kit pieces, instancing, culling) | 4 |
| Three road segments, authored and dressed | 6 |
| Bot pathing for the road and shrines | 3 |
| Test, balance, perf pass, re-capture trailer clips | 3 |
| **Total** | **27 u ≈ 13.5 h** |

## Cut order if time runs short
1. 5 AM road segment: dawn stays at the hearth arena, as now.
2. Ember shrines: keep the wider grounds only.
3. Reveal camera shots.

The 1 AM and 3 AM road segments are the trailer's backbone, so they are cut last.

## Questions for you
1. Approve **A + E before midnight, B + C after**? Or pick a different mix.
2. Should the dawn and the ending move to the city wall (end of the road), or stay at the hearth?
3. Road length: ~120 m per hour (about 60–90 s of travel and fights), or shorter?
