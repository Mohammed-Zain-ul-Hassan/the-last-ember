# Level freeze

The story level in `public/models/levels/ember_climb.glb` is frozen for enemy AI, boss mechanics, and UI work.

Do not change layout, traversal, major architecture, combat floors, the boss plaza, collision, or spawn markers unless a bug blocks that work.

## Contract (`LevelLoader`)

Empties, in Three.js space (x, height, z):

| Marker | Position | Use |
|--------|----------|-----|
| `PlayerSpawn` | (0, 0.05, 4) | Level start, south gate |
| `Enemy_01` … `Enemy_09` | see build log | Even index static, odd rusher |
| `WifeAnchor` | (−12, 4.25, −84) | Boss / wife, on the plaza plinth |
| `BossArena` | (−12, 3.55, −84) | Arena centre |
| `PlayerEntry` | (−12, 3.55, −77.8) | South entrance. `spawns.playerEntry` |
| `WaveSpawn_A/B/C` | west, east, north of the plaza | Defense waves |

`arena.colliders.length` is **209**. `COL_*` boxes are the collision. `VIS_*` is cosmetic.

## Connectivity pass (Oct 2026)

Walk slabs now reach down to the terrain (`ground()` in `build-ember-level.py`), and stairs are solid flights that end on their landings. Visible floors and their collision tops match. The court floor tiles are lifted to 0.7, and the gallery stairs have visible treads that match `COL_Bal*Stairs_*`. Arch infill above doorways is visual only, and the undercroft ceiling sits flush with the court (undercroft sealed).

Run `node scripts/audit-level-connectivity.mjs` after any change. It flood-fills from `PlayerSpawn` using the controller rules (0.4 step, 1.5 m jump) and must print `PASS`.

## Routes that were walked (runner and shadow form, Playwright)

- Main route: spawn → gate → approach → court (0.7) → cathedral steps → narthex (4.2), and court → north arch → north court (1.4) → north-to-plaza → plaza entry stairs → plaza (3.5) → `PlayerEntry`. No jumps needed.
- West: court north-west doorway → `CourtWestLink` → west street (0.425) → `WestToNorth` → `WestRise` → `PlazaWestStairs` → plaza. A side door also joins the north court.
- East: approach → `EastLane` → `EastTower` stairs → east landing → Roof A. Roof C → `RoofCToDrop` → `RoofDrop` stairs → `EastToNorth` → north court. The roof drop also climbs back up.
- Gate west opening → lean foot → `LeanStairs` → `LeanJoin` spur.
- Recall rewinds through the north-west doorway.

## Intentional gaps (runner jump only)

- `LeanJoin` → west gallery `BalW`: about 3 m, level.
- Roof A → B → C: about 4.25–4.5 m. Roof B is reachable only by jumping.
- The narthex door is a dead end (as designed), and the undercroft is sealed.

## Boss plaza

Open floor about 18×16 m, low rim walls, four existing cover blocks, central plinth, pointed-arch sanctuary on the north hearth. South gap is the way in. No new collision was added there.

## Still cube-built, on purpose

Gate, streets, roofs, north court, and plaza rims are the old boxes, now using the chapel stone/floor/trim textures. Their footprints only changed in the connectivity pass above. The east gallery and cloister bridge stay on the cathedral kit. Roof pads are about 4–4.5 m apart (a run jump, not a new gap).
