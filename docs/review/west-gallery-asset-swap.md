# West gallery — asset-driven replacement

Scope: **west tower-side gallery only**. East gallery, bridge, stairs, and the rest of the court are untouched.

## Asset

loafbrr **Gothic-Like Structures** — https://loafbrr.itch.io/gothic-like-structures — **CC0 1.0**
(`vendor/kits/loafbrr-gothic/ATTRIBUTION.md`). FBX imports at `global_scale=100` (metres).

## Audit that motivated the swap

- Visible gallery was already SigilsVault meshes, but those are very low poly (floor_* 20 tris, railing_* 60, wall_01 36).
- The only pure cubes were `VIS_LeanLand` / `VIS_LeanToBal` (now collider-only in `build-ember-level.py`).

## Parts used (tris)

| Role | Object(s) | Part | Tris |
|------|-----------|------|------|
| Deck slab (vaulted underside) | `VIS_BalW` | Floor_6x6_B | 16 |
| Pointed-arch arcade (court side) | `VIS_GalW_Arcade` | Wall_F_B | 296 |
| Blind door niche | `VIS_GalW_Door` | Wall_F_A | 314 |
| Flying-buttress slabs | `VIS_GalW_ButtS/N` | Buttress_A | 128 |
| Piers + caps | `VIS_GalW_PierS/N`, `…PierCapS/N`, `VIS_LeanJoin_Pier(Cap)` | Post_B_6m / Post_B_Cap | 56 / 332 |
| Carved balustrade | `VIS_GalW_RailN/S`, `VIS_LeanJoin_Rail` | GuardRail_A / GuardRail_B | 944 / 488 |
| Corner posts | `VIS_GalW_PostNE/NW/SE` | GuardRail_C_CornerPost_B | 234 |
| Lean landing / ramp / join floors | `VIS_LeanLand`, `VIS_LeanToBal`, `VIS_LeanJoin_Floor` | Floor_3x3_B / Floor_6x3_B | 4 / 8 |

Parts are stretched per-axis to the existing collider footprints (`loafbrr_kit.place_fit`), so `VIS_BalW`'s origin
stays at the footprint centre (needed by `Arena.attachGalleryFillLights`).

## Materials

Four 1K diffuse maps only (wall, trim, floor, roof), pre-graded to the courtyard's cool charcoal palette by
`scripts/grade-loafbrr-textures.py`. The grade is baked into the PNGs because the glTF exporter ignores
Hue/Saturation nodes (node tints silently never reached the game).

## Validation

- `ember_climb.glb`: 7.08 MB (HEAD was 18.2 MB; courtyard intermediate 6.59 MB). Loads in game.
- `arena.colliders.length` = **211** (unchanged). `COL_BalW`, `COL_LeanJoin`, `COL_BalWStairs_*`, `COL_LeanLand`,
  `COL_LeanToBal` and `Enemy_07` are untouched.
- Standing checks (feet y after teleport + settle): balW centre 5.40, balW SE corner 5.40, balW NW corner 5.75,
  lean landing 4.80, lean-to-bal 5.75, lean join 5.75. Same collider geometry as before; all grounded.
- Review camera is deterministic (`scripts/review-freecam.js`): forced camera position/target, character hidden.

## Before / after (identical poses)

| Pose | Before | After |
|------|--------|-------|
| 01 overview from above | `asset-gallery-before-01-overview.png` | `asset-gallery-after-01-overview.png` |
| 02 over the deck | `asset-gallery-before-02-deck.png` | `asset-gallery-after-02-deck.png` |
| 03 elevation from court floor | `asset-gallery-before-03-elevation.png` | `asset-gallery-after-03-elevation.png` |

## Known gaps

- Buttress_A slabs and the SE corner post/rail stub still read blocky at close range; the arcade's pointed arch is the
  strongest improvement. No further tuning done pending approval.
- Pose 03 is lit mostly by a brazier (warm); the underside shows the vaulted brick soffit.

## Rebuild

1. `python scripts/grade-loafbrr-textures.py`
2. `scripts/assemble-ashen-courtyard.py` (Blender)
3. `scripts/build-ember-level.py` (Blender)
