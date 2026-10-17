# ASCEND — Tower-Side Gallery Corrective Pass

**Scope:** west & east gallery balconies + cloister bridge + wall/tower anchors only. No sky/fog redo, no plaza/chapel, no new routes.

## Checklist

| Criterion | Result | Notes |
|-----------|--------|-------|
| Placeholder geometry removed | Pass | No `platform_01` decks on `VIS_BalW` / `VIS_BalE` / bridge / lean-join; stone `floor_*` / `sanctum_floor_*` paving instead |
| Support logic improved | Pass | Arcade vaults + flying buttresses into wall plane; pier–arch–paving on bridge; doorway into shell towers |
| Readability improved | Pass | Walk-surface albedo lift (`mark_walk_bright`) + 2 cool gallery PointLights on `VIS_BalW`/`VIS_BalE`; near `VIS_Sil*` culled (far sils only) |
| Traversal embedded into architecture | Pass | Galleries flush to court walls with trim band + parapet; bridge lands on balcony height; lean-join is floor spur into west tower |
| Lighting improved without losing atmosphere | Pass | Local fills only (intensity 10, dist 12); braziers unchanged; no global ATMOSPHERE/sky pass |

## Standing (Playwright)

| Spot | Result | Feet Y |
|------|--------|--------|
| `balW` (−7.5, −26) | Pass | 5.60 |
| `balE` (7.5, −27) | Pass | 5.61 |
| bridge (0, −26.5) | Pass | 5.61 |
| lean (−8.5, −19) | Pass | 5.75 |

Colliders: **211** (unchanged footprints). Gallery fill lights: **2**.

## Screenshots (identical poses)

| Shot | Before | After |
|------|--------|-------|
| Overview (court → W balcony + bridge) | `gallery-before-01-overview.png` | `gallery-after-01-overview.png` |
| On-bridge looking along span | `gallery-before-02-bridge.png` | `gallery-after-02-bridge.png` |
| West balcony nest (`Enemy_07`) | `gallery-before-03-west-nest.png` | `gallery-after-03-west-nest.png` |

## Explicit non-goals (unchanged)

Sky/fog, plaza/wife chapel, west street, east roofs, new routes, district-wide lighting.

**Stop** — awaiting approval before further level expansion.
