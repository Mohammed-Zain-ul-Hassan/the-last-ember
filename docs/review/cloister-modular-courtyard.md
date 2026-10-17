# Ashen Cloister — Modular Courtyard Review

**Stop here for approval before modularizing the rest of the ring.**

## Validation (Playwright `?autotest`)

| Check | Result |
|-------|--------|
| Court / balcony / bridge / narthex standing | Pass |
| East roof / west street / north court | Pass |
| Climb enemies mid-route | 9 |
| Plaza arm (`Defend her — wave 1/3`) | 4 rushers |
| North court → wife distance | 34.2 m (>28) |

## Assets used (courtyard)

| Source | License | URL |
|--------|---------|-----|
| SigilsVault Modular Cathedral Kit | CC0 | https://sigilsvault.itch.io/modular-cathedral-kit |

Local: `vendor/kits/modular-cathedral/`. Assembler: `scripts/assemble-ashen-courtyard.py`.

Modules include: `wall_*`, `wall_window_*`, `wall_rose_window_01`, `flying_buttress_01`, `column_*`, `vault_*`, `platform_*`, `railing_*`, `doorway_01`, `sanctum_*`, `spire_01`, `tower_*`, `floor_*`, `rooftop_01`.

Quaternius Medieval Village MegaKit (CC0) is vendored as a documented supplement but **not** instanced in this courtyard mesh.

## Geometry delta (`ember_climb.glb`)

| | Before (cube pass) | After (modular court) |
|--|--------------------|------------------------|
| Approx file size | ~14.2 MB (PH textures on all cubes) | ~3.1 MB |
| Meshes | 597, **all 24 verts** | 492 total: **103 detailed** kit VIS + **389** boxish (mostly `COL_*` + outer cube ring) |
| Courtyard VIS | Cubes | Authored kit meshes |

Outer-ring materials this export used solid fallbacks (Poly Haven not loaded in Blender session). Courtyard uses kit trim sheets / window atlases.

## Screenshots

| Shot | Path |
|------|------|
| Before overview | `docs/review/cloister-before-01-courtyard.png` |
| After overview | `docs/review/cloister-after-01-courtyard.png` |
| After narthex / buttresses | `docs/review/cloister-after-03-narthex.png` |
| After balcony/bridge | `docs/review/cloister-after-04-balcony.png` |

## Cube placeholders still remaining

Gate/approach, lean stairs (except modular `LeanJoin`), undercroft, west street, east roofs, north court, plaza/hearth, outer terrain — still from `build-ember-level.py` cubes.

## Unresolved / notes

- Kit scale `0.35` — walls ~5.6 m; sanctum is large and dominant (intentional landmark).
- Some balcony/stairs kit mesh orientation may need art polish on a follow-up pass; **COL AABBs** match prior playable footprints and pass standing tests.
- Re-export with Poly Haven loaded in Blender if outer-ring PBR is required before the next modular section.

## Approval gate

Do **not** modularize west street / east roofs / plaza until this courtyard look is approved.
