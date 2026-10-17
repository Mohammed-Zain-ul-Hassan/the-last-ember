# Modular Environment Assets — Ashen Cloister Courtyard

Authority for kit provenance and courtyard bill of materials. Gameplay / empties: [`level_design.md`](level_design.md) §8. Look: [`environment-art-direction.md`](environment-art-direction.md).

## Pipeline

1. Vendor kits under `vendor/kits/` (do not invent meshes).
2. Assemble courtyard with [`scripts/assemble-ashen-courtyard.py`](../scripts/assemble-ashen-courtyard.py) → `public/models/levels/ashen_courtyard.glb`.
3. Merge into story level via [`scripts/build-ember-level.py`](../scripts/build-ember-level.py) (courtyard cube section skipped).
4. Runtime unchanged: [`LevelLoader.ts`](../src/world/LevelLoader.ts) `VIS_*` / `COL_*` / empties.

**Scale:** SigilsVault modules are authored large (~8 unit floor tiles, ~16 unit wall height). Assembler applies `KIT_SCALE = 0.35` so wall height ≈ 5.6 m (matches prior graybox court walls).

---

## Courtyard bill of materials

| Role | Requirement | Kit module(s) used |
|------|-------------|-------------------|
| True arched / vaulted openings | Not cube stacks | `vault_large_01`, `vault_small_front_01`, `doorway_01` |
| Stone pillars / columns | Base + shaft silhouette | `column_01`, `column_small_01` |
| Buttresses | Flying / structural | `flying_buttress_01` |
| Wall panels + window recesses | Authored windows | `wall_01`, `wall_window_01`, `wall_window_large_01`, `wall_rose_window_01`, `wall_trim_01` |
| Corners | Continuous façade | `wall_corner_01`, `wall_corner_02`, `wall_corner_inner_01` |
| Staircases | Authored stair mesh | `platform_stairs_01`, `sanctum_stairs_01` |
| Supported balconies / platforms | Deck + rails | `platform_01`, `railing_01`, `railing_corner_01`, `railing_outside_01` |
| Stone bridge | Vaulted span language | `vault_large_01` + `platform_01` deck + railings |
| Roof modules | Landmark silhouette | `rooftop_01`, `rooftop_02`, `sanctum_roof_01` |
| Parapets / trim | Edge read | `railing_*`, `wall_trim_01` |
| Focal narthex / sanctum | North landmark | `sanctum_base_01`, `sanctum_doorway_01`, `sanctum_upper_01`, `sanctum_floor_*`, `spire_01`, `tower_*` |
| Floors | Walkable court | `floor_01`, `floor_02`, `floor_03` |
| Cover / combat props | Kite blockers (VIS) | `column_small_01` (cover posts) |

Collision remains separate `COL_*` AABBs (floors, walls, stair volumes) — not kit mesh collision.

---

## Researched kits (verified URLs only)

| Kit | URL | License | Formats | Perf notes | Status |
|-----|-----|---------|---------|------------|--------|
| **SigilsVault Modular Cathedral Kit** | https://sigilsvault.itch.io/modular-cathedral-kit | CC0 | GLB, FBX; 256–1024 trim textures; 1 m author grid (large piece extents) | ~40+ pieces; most &lt;1k tris, max ~1.9k per page claim | **Primary — vendored** |
| Quaternius Medieval Village MegaKit (Standard) | https://opengameart.org/content/medieval-village-megakit · https://quaternius.com/packs/medievalvillagemegakit.html | CC0 | glTF, FBX, OBJ; 176 models in Standard | Village modular; includes `Wall_Arch`, balconies, stairs | **Supplement — vendored** |
| **loafbrr Gothic-Like Structures** | https://loafbrr.itch.io/gothic-like-structures | CC0 1.0 | FBX + PBR PNG (1K–4K) | Pointed-arch walls, flying buttresses, carved guard rails, piers/caps; 4–944 tris per part | **West gallery only — vendored** (`vendor/kits/loafbrr-gothic/`, see `docs/review/west-gallery-asset-swap.md`) |
| Poly Haven materials | https://polyhaven.com | CC0 | PBR maps | Materials only (already on outer ring cubes) | Materials, not architecture |
| OGA Modular Medieval Building Pack (Daniel Andersson) | https://opengameart.org/content/modular-medieval-building-pack | CC0 | `.blend` zips | House modular; not used this pass | Research only |
| Nodex3D Medieval Dungeon Modular Base Kit | https://nodex3d.itch.io/medieval-dungeon-modular-base-kit · OGA CC-BY 4.0 listing | CC-BY 4.0 | GLB | 8 dungeon pieces; underground look | Out of scope for courtyard |

---

## Performance budget (courtyard)

| Metric | Graybox court (approx) | Modular target |
|--------|------------------------|----------------|
| Visual mesh style | 24-vert cubes | Authored kit GLBs |
| Instance count | Dozens of cubes for court alone | ~80–150 kit instances (court zone) |
| Tris | Negligible geo, heavy texture weight on whole level | Kit pieces low-poly; expect tens of thousands of tris for court |
| Collision | AABB `COL_*` | Same — keep box count modest |

Whole-level `ember_climb.glb` still carries cube geometry **outside** the courtyard until a later pass.

---

## Rebuild commands

```text
blender --background --python scripts/assemble-ashen-courtyard.py
blender --background --python scripts/build-ember-level.py
```

Or run both via Blender MCP `execute_blender_code` / open-and-run.

---

## Placeholder cubes remaining after Phase 4

Gate/approach, lean stairs (except join), undercroft volumes, west street, east roofs, north court, plaza/hearth, outer terrain — still from [`build-ember-level.py`](../scripts/build-ember-level.py) cubes until approved for modular expansion.
