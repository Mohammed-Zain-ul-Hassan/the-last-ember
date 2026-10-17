# Ashen Cloister — Courtyard Polish Pass

**Scope:** courtyard encounter only. Outer ring still cube blockout. Stop for approval before modularizing further.

## What changed

| Item | Change |
|------|--------|
| White / chalk geo | Kit materials cool-retinted in assembler; runtime `muteChalkyMaterials` safety net; banners darkened |
| Gray void | Night gradient sky dome (`COLORS.skyZenith` / `skyHorizon`) + tighter fog (`ATMOSPHERE` 28–110) |
| Distant masses | Kit tower/rooftop/spire husks outside playable court (VIS only) |
| Structural supports | Columns + vaults under balconies, stairs, bridge piers, narthex approach |
| Dress | Wall trim bands, facade, railing corners, denser bridge piers |
| Lighting | Milder moonlight, stronger local brazier pools |

## Validation

| Check | Result |
|-------|--------|
| Court / bal / bridge / narthex / lean | Pass |
| East roof / west / north | Pass |
| Mid enemies → plaza arm | 9 → 4 |
| Colliders | 211 |

## Screenshots

- `docs/review/cloister-polish-01-overview.png`
- `docs/review/cloister-polish-02-narthex.png`
- `docs/review/cloister-polish-03-balcony.png`

## Still cube placeholders (out of scope)

Gate/approach husk, undercroft, west street, east roofs, north court, plaza/hearth.

## Note

`COL_*` must stay **visible in Blender at export** (`hide_render`/`hide_viewport` drops them from glTF). Runtime hides by name in `LevelLoader`.
