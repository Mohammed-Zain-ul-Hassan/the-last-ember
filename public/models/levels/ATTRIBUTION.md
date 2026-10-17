# Level Attribution

## `ember_climb.glb`

**Market Ash** — bounded ring district (hub → walled bowl → west alley / east roof / undercroft → north court → hearth plaza). Designed per `docs/level_design.md`: mid-fight mode swaps, multi-route nodes, stair/roof XY non-overlap.

Materials (Poly Haven CC0 + custom emissives):

| Set | Use |
|-----|-----|
| `stone_brick_wall_001` | Primary stone |
| `brick_wall_02` | Red brick walls |
| `cobblestone_floor_03` | Mossy cobble floors |
| `roof_slates_02` | Grey slate roofs |
| `weathered_planks` / `blue_painted_planks` | Wood + blue gallery rails |
| `plastered_wall_05` | Cool plaster walls |
| `wooden_rough_planks` | Mossy timber accents |
| `green_metal_rust` | Green copper/metal roofs & hearth |
| Custom | Ember, teal, violet, bone, chrono-green trims |

## `demo_course.glb`

Linear verb curriculum (walk → jump → chrono-dash → hop → slide → still → stairs → combo → finish).
Ash training yard with chronomancer green accents on dash/slide beats; ember trim on finish.
Metrics: `docs/level-pipeline.md` / `DEMO_METRICS` in `src/world/DemoCourse.ts`.

## Materials (Poly Haven, CC0)

Poly Haven: https://polyhaven.com — CC0.

## Rebuild

- Demo: `scripts/build-demo-course.py` (Blender MCP or `blender --background --python …`)
- Story: `scripts/build-ember-level.py` (import Poly Haven textures first, then run script)
- Design bible: `docs/level_design.md`
