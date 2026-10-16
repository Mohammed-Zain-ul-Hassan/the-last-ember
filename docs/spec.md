# SUNDIAL (working title)

**Pitch:** You are the last shadow in a sun-baked town, and sunlight sets you on fire. You can't stop the sun, but you
can turn back the clock. Scrub the hour, swing every shadow in town, and run the dark to safety.

## Where each theme lives
| Theme | Mechanic | Art | Audio | UI |
|---|---|---|---|---|
| Shadow | You can only stand in shadow. Shadows are your floor and your path. | Ink-silhouette hero, long violet shadows | Low hum while safe in shade | Ink-blot HUD frame |
| Fire | The sun is a fire. Sunlight ignites you: a burn meter gives ~0.5 s of grace, then you burn up. Later: braziers and torches as point lights. | Flames and smoke on the hero, burning-gold sky, heat shimmer | Crackle that rises with burn, ignition whoosh | Burn ring around the hero |
| Time | The time of day is your controller. Hold Q/E to rewind or fast-forward the sun, which spends hourglass sand. The sun also drifts forward on its own. | Sky gradient from dawn to noon to dusk; sundial gnomon in each level | Clock ticks; a scrub whoosh pitched to scrub speed; hour chimes | Sundial clock and an hourglass meter |
| **Fusion** | **One input (time) moves the fire (sun), which moves the shadows (the ground).** | | | |

## Core loop
1. A level opens at a set hour. You sit in a shadow, and the exit (a cellar door) glows across town.
2. The sun creeps forward, so your shadow shrinks and shifts. You have to keep moving.
3. Hold Q/E to scrub the sun. Every shadow rotates and stretches like clock hands, opening shadow-bridges.
4. Dash from shade to shade. A short dash through sunlight is allowed (burn grace) and scores a "SCORCHED!" near-miss.
5. Reach the door, an hour chimes, and you get stars for sand left. Die: press R for an instant retry. Each level is
   closer to noon (shorter shadows = harder), and the finale is a sunset race.

**Shadow geometry:** buildings are convex footprints with a height. Under a directional sun, each shadow is the
convex hull of the footprint plus the footprint shifted by `height / tan(elevation)` away from the sun's azimuth.
"In shade" means a point-in-polygon test against any shadow. It's analytic, cheap and robust.

## Wow moment
The first long scrub. The whole town's shadows sweep around like clock hands in one smooth motion while the sky
burns from dawn pink to white noon to blood-orange dusk. Second beat: the hero catching fire and snuffing out in a
burst of embers.

## Art direction (3 constraints)
1. **Palette (5):** ink `#1b1426`, shadow violet `#3d2c5e`, sandstone `#d9a066`, ember `#ff7b2e`, sun cream `#f6e7c1`.
2. **Shape language:** chunky geometric desert town (flat roofs, pillars, arches, obelisks, awnings), 1-px ink outline,
   3-tone shading. The hero is a soft blob silhouette with two glowing eyes.
3. **Camera:** top-down, fixed single screen per level at 1280x720, slight vignette, bloom on sunlit sand.
Shadows are runtime geometry (a lighting effect, the one allowed code-drawn element), filled with a tiled shadow
texture from the manifest.

## Audio direction
Procedural WebAudio: desert wind bed; percussion that intensifies as the sun climbs toward noon (adaptive); clock tick
on the beat; scrub whoosh with pitch = scrub speed; crackle layer that scales with burn; ignition/death boom; door
chime per hour. Mute on M, and audio starts on first input.

## Risks and fallbacks
1. **Too slow / puzzly in 30 s.** Fallback: the sun drifts faster, levels stay 20-40 s, burn-grace dashes reward
   daring, and there's chase pressure from a "noon line" that bleaches shadows.
2. **Shadow math bugs** (overlaps, edge flicker at the boundary). Fallback: convex footprints only, a small
   hysteresis on the in-shade test, unit tests on the geometry.
3. **Level design time.** Fallback: levels are JSON, a `?debug=1` editor lets a teammate place buildings, and the
   minimum is 5 levels.

## 2D vs 3D
2D top-down. The 3D feel comes from heights driving shadow length. No engine change is needed.
