# THE LAST EMBER

**Pitch:** The sun is gone. One ancient hearth still burns, and one shadow knight swore to guard it. Hold the night
from sunset to dawn, and when the light finally returns, choose whether to step into it.

Story, chapters and theme decisions: [story.md](story.md). Engine research: Three.js (summary below).

## Where each theme lives
| Theme | Gameplay | Story | Atmosphere |
|---|---|---|---|
| **Fire** | Before midnight, the hearth is the objective (it has HP) and the only light. After midnight, the torch is your light and adds fire to your attacks. Light damages shades. | Guard it, carry it, and at dawn decide whether to walk into the light that ends you | Fire is the only colour in a black-and-ink world; bloom, embers, flicker |
| **Shadow** | You are a shadow. Shades can only spawn and move in darkness, **including the real shadows the fire casts behind ruins and pillars**. Where the light falls decides where they come from. | Shades are his fallen people; freed shades return memories of the night he let the fire die | Silhouette art, fog layers, cast shadows that sway with the flame |
| **Time** | Sunset to dawn as hour chapters. Each hour, the hearth dims, its light shrinks and shadows (spawn zones) grow. A clock HUD shows the hour. | Midnight is the turning point; dawn is the choice | The sky moves through dusk, night and dawn; stars wheel; hour cards |
| **Fusion** | **Fire makes the light, the light makes the shadows, the shadows are where the enemy comes from, and time eats the fire.** | | |

## Core loop
1. An hour card fades in ("9 PM. The first shades.") and the camera swings from a 3/4 view down to the side view.
2. The hearth burns at the centre of the ruins. Shades rise out of the shadows its light casts and creep toward it.
3. You cut them down: A/D move, Space jump, J or click for a 3-hit combo, K heavy, Shift for a shadow-step dash
   (passes through enemies, with invulnerability frames).
4. Light weakens shades; each kill gives a hit-stop, a shadow burst and a memory wisp. The hearth dims with each hour,
   so the shadows grow and the pressure ramps.
5. Survive the hour, and the clock ticks forward to the next card. If the hearth dies before midnight or the knight
   falls, press R to instantly retry the hour.

After midnight: the torch is your light and goes wherever you go, so the shadows move with you. The 1 AM–5 AM stages
scroll east through the fallen kingdom. 3 AM is the boss (the biggest shadow). At 5 AM the dawn line advances and
the player makes **the choice**: step into the light (memories return, he dissolves, the ember lives) or stay in
shadow (he endures, alone).

## Wow moments
1. **Midnight:** the hearth gutters out in slow motion, he thrusts the torch into the last flame, and the camera
   orbits as the world goes black except for one torch.
2. **Dawn:** the sunrise sweeps across the screen and every shadow retreats. The knight stands at the edge of the
   light, and the choice is his.

## Art direction (3 constraints)
1. **Palette:** black silhouettes (`#07060a`), ink fog (`#1a1730`), dusk violet (`#4b2d5c`), ember orange
   (`#ff7a2f`), flame gold (`#ffd27a`). Dawn adds a pale rose (`#f2b8a8`) for the ending only.
2. **Shapes:** the knight is tall and narrow, with a horned helm, a long tattered cape and a long sword. Shades are
   smoky, hunched, with ember-red eyes. The ruins are broken arches, pillars and a fallen kingdom's skyline.
   Originality rule: no Igris colours or helm crest.
3. **Camera:** perspective side view yawed ~12°, so depth reads like an isometric lean. It swings to a 3/4 view on
   chapter cards and cutscenes. Fog stacks 3–4 depth layers.

## Audio direction
Procedural WebAudio for every effect, plus a music bed:
- **Music:** a low drone and choir pad bed; drums layer in as shades close on the hearth.
- **Effects:**
  - **Fire:** crackle whose volume follows the flame's size; a whoosh on dash.
  - **Combat:** sword swish (with pitch variation) and a shade death hiss.
  - **Story:** a heartbeat when the hearth is low; a deep bell on each hour; silence before dawn.
- **Controls:** mute with M; audio starts on first input.

## Engine and tech
Three.js r186 WebGLRenderer + pmndrs postprocessing:
- **Effects:** bloom on fire only (`luminanceThreshold` around 0.8), vignette, ACES tone mapping in the composer.
- **Shadows:** **one** shadow-casting light at a time, the hearth before midnight and the torch after.
- **Gameplay:** a pure 2D sim on the x/y plane with AABB hitboxes and no physics engine, kept deterministic for
  `?seed=n` and the demo bot.
- **Shadow zones:** in the sim, each pillar casts a 1D ground interval away from the light; shades spawn there or
  beyond the light radius.
- **Models:** start as primitive silhouettes (silhouette art hides the low detail), then CC0 KayKit rigged models
  (Adventurers knight + Character Animations, Skeletons as shades, Dungeon and Forest kits). A missing model falls
  back to a primitive and never crashes.
- **Hooks:** `?debug=1` (`window.__game`, FPS), `?seed=n`, `?demo=1`, `?capture=1` (hides the HUD).
- **Performance:** DPR capped at 1.5 for venue laptops.

## Risks and fallbacks
1. **3D stalls.** Trigger: by Day 1 20:00 we don't have the knight fighting a shade lit by a shadow-casting light at
   60 fps. Fallback: a fixed side camera with silhouette card layers. If that still fails, go back to Phaser and
   reuse `src/sim` unchanged.
2. **Performance on integrated GPUs.** Use one shadow light with a 512 map and mipmap bloom, and test on a laptop on
   Day 1.
3. **Scope** (7 chapters and 2 cutscenes). Chapters are data (sky, light, enemy mix, text) over two level modules
   (the hearth arena and the torch road). Cutscenes are camera keyframes plus tweens. Cut order if behind: the boss,
   then the torch-road scrolling (keep the arena with the torch), then the choice becomes a single ending.
