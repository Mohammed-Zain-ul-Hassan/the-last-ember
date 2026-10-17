# Level Attribution

## `ember_climb.glb`

**Ashen Cloister** — gothic-industrial ring district (south gate → cloister courtyard → cathedral narthex → west street / east roof / undercroft → north court → hearth plaza).

Art direction: `docs/environment-art-direction.md`. Layout: `docs/level_design.md` §8. Modular kits: `docs/modular-environment-assets.md`.

### Courtyard architecture (modular)

- **SigilsVault Modular Cathedral Kit** — CC0  
  https://sigilsvault.itch.io/modular-cathedral-kit  
  Assembled by `scripts/assemble-ashen-courtyard.py` → `ashen_courtyard.glb`, merged by `scripts/build-ember-level.py`.

### Outer ring (still cube blockout this pass)

Solid-color / Poly Haven materials when present in the Blender session at export time. Prefer Poly Haven CC0: https://polyhaven.com

## `ashen_courtyard.glb`

Intermediate courtyard-only export (kit VIS + COL AABBs + `Enemy_03`–`09`).

## `demo_course.glb`

Linear verb curriculum. Metrics: `docs/level-pipeline.md`.

## loafbrr — Gothic-Like Structures (CC0 1.0)

https://loafbrr.itch.io/gothic-like-structures · Local: `vendor/kits/loafbrr-gothic/`

Used for the **west tower-side gallery only** (`VIS_BalW`, `VIS_GalW_*`, `VIS_LeanLand`, `VIS_LeanToBal`,
`VIS_LeanJoin_*`): Floor_6x6_B / Floor_3x3_B / Floor_6x3_B, Wall_F_B (pointed-arch arcade), Wall_F_A (blind
door niche), Buttress_A, Post_B_6m + Post_B_Cap, GuardRail_A/B, GuardRail_C_CornerPost_B.
Textures: 1K diffuse only, pre-graded (`scripts/grade-loafbrr-textures.py`). Details: `docs/review/west-gallery-asset-swap.md`.

## Supplement kit (vendored, not used in courtyard mesh)

- **Quaternius Medieval Village MegaKit (Standard)** — CC0  
  https://opengameart.org/content/medieval-village-megakit  
  Local: `vendor/kits/quaternius-medieval-village/`

## Rebuild

1. `scripts/assemble-ashen-courtyard.py` (requires SigilsVault under `vendor/kits/modular-cathedral/`)
2. `scripts/build-ember-level.py`
3. Demo: `scripts/build-demo-course.py`
