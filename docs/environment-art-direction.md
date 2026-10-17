# Environment Art Direction — ASCEND / The Last Ember

Authority for world look and lighting. Gameplay grammar stays in [`level_design.md`](level_design.md).

---

## 1. Audit summary (current build)

| Issue | Cause |
|-------|--------|
| Boxy, disconnected district | `build-ember-level.py` is almost all scaled cubes; no arches, piers, buttresses, brackets |
| Warm wash over whole map | Ember **directional** key + purple fog (`COLORS.fog` 0x1b1730) + high ambient |
| Floating decks | Thin roof/gallery slabs without visible supports |
| Weak landmark | No cathedral/citadel silhouette for orientation |
| Texture tiling | Smart UV on huge quads; warm red brick as primary walls |
| Character > world | Vessel/VFX richer than environment; world reads as graybox |

**Assembly:** Blender `VIS_*` / `COL_*` GLB → [`LevelLoader.ts`](../src/world/LevelLoader.ts). Lights are code-only (`Arena.buildLights`); GLB exports without lights.

**Preserve:** runner/shadow, Recall, chrono-dash, empty spawn contract, WaveDirector, demo course.

---

## 2. Theme

A **fallen gothic-industrial city** consumed by cold darkness. Supernatural fire is rare and meaningful—braziers, hearth, fire-touched enemies—not the sky color.

Influences (original world only; do not copy named locations):

- **Dark Souls III** — monumental stone, arches, battlements, supported bridges
- **Bloodborne** — desaturated moonlight, fog depth, cathedral silhouettes, ironwork
- **Dishonored 2** — balconies, vertical layers, multiple routes, industrial brackets on traditional masonry

---

## 3. Palette

| Role | Hex | Three / notes |
|------|-----|----------------|
| Charcoal stone | `#292C32` | Primary walls |
| Slate blue-gray | `#414B56` | Secondary masonry, fog bias |
| Weathered stone | `#63656A` | Floors, worn trim |
| Dark iron | `#242529` | Railings, lamps, brackets |
| Aged bronze | `#71604C` | Sparse metal accents |
| Ember orange | `#E46B2B` | Brazier / enemy accent only |
| Dying fire | `#B9381D` | Deep fire core |
| Pale moonlight | `#A8B8C8` | Key light / window glow |

Runtime [`COLORS`](../src/config.ts): cool fog/floor/panel; keep `ember` / `gold` for fire accents and enemies.

---

## 4. Lighting strategy

1. **One motivated moonlight** directional (pale `#A8B8C8` / cool blue-white), shadow-casting.
2. **Low** hemisphere + ambient so stone form reads (avoid flattening).
3. **No global ember directional.**
4. **Local warm PointLights** only at braziers / hearth / fire enemies.
5. Fog = cool slate, near/far tuned for depth—not to hide missing geometry.
6. ACES tone mapping; skip bloom/AO unless screenshots prove need.

Readable: floors, ledges, enemies (warm silhouette), exits.

---

## 5. Architectural language

- Wall thickness **0.6–0.9 m**; consistent trim bands.
- Elevated walks sit on **piers + arches** or **brackets** into facades.
- Balconies anchored to building masses; parapets ~0.9–1.1 m with firing notches.
- Bridges: pier-and-arch spans (never unsupported slabs).
- Ruins may be broken but still read as former buildings.
- Walkable surfaces always `both(VIS+COL)`; decorative `VIS_`-only never as sole footing.

### Modular kit (Blender)

`pier`, `arch`, `buttress`, `balcony`, `rail`, `bridge_span`, `facade_bay`, `iron_lamp` / brazier.

---

## 6. Reference notes (`docs/reference_pictures/`)

| Image | Takeaway |
|-------|----------|
| Dark_Souls_Structural_Cohesion | Heavy arches under walks; blind arcades; fog under bridge |
| Dark Souls - Structural Support | Layered city; bridges between masses; campfire as local warm only |
| Bloodborne - Atmosphere & Materials | Cool moonlit cathedral landmark; iron lamps; desaturated stone |
| Dark Souls 3 - Lightning and Contrast | Moon key; snow/highlights on stone; clear bridge path |
| Dishonoured 2 - Traversible / Vertical / Interiors | Balconies + stairs + multiple heights; brackets under decks |

---

## 7. First test section — Ashen Cloister

Gothic courtyard, accessible E/W balconies, pier-supported arch bridge, ruined shells, elevated cathedral entrance (north). See [`level_design.md`](level_design.md) §8.

Fire elementals / wife keep existing systems; warm emissives contrast cool stone.

---

## 8. Materials workflow

Prefer Poly Haven **cool** stone, slate roof, plaster, iron over warm red brick as the default wall. Reuse materials; instancing later if draw calls hurt. Collision stays simple AABBs.
