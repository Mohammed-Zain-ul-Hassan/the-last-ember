# West gallery encounter — polish pass

Scope: the west gallery deck, its arcade/door niche, the two court columns in frame (`VIS_CourtPillar_A`,
`VIS_CloisterBridge_PierW`) and the static enemy placeholder (`Enemy_07`). No collider, layout or global-light changes.

## Lighting
- Two wall lanterns flank the door niche (`VIS_GalW_LanternGlowN/S`, emissive `LF_EmberGlow`); `Arena.attachBrazierLights`
  gives each a small ember pool (intensity 5, range 6 — lower than the court braziers' 18/14).
- `Arena.attachEncounterAccents`: one cool rim under the deck grazing the arcade (7, 8 m) and one cool fill on the court
  side of the two west columns (36, 9 m). No shadows; ambient / hemisphere / moon untouched.
- `muteChalkyMaterials` skips `*EmberGlow*` so lantern cores glow instead of reading as tan blocks.
- Mean luminance per pose (before → after): 01 17.3 → 21.5, 02 20.6 → 30.9, 03 15.2 → 21.2, 04 25.7 → 34.8.

## Columns
- Court columns: moulded plinth (inverted loafbrr cap, sized to the 0.9 m collider) + impost capital at the gallery
  pier-cap height (z 4.45), alternating `Post_B_Cap` / `Post_C_Cap`; material switched to `LF_Trim` to match the gallery.
- Gallery piers: added `VIS_GalW_PierBaseN/S` plinths under the existing shafts and caps.

## Architecture
- `VIS_GalW_EdgeTrimN`: cornice under the deck's north lip (the only open edge that isn't a route).
- `VIS_GalW_PlinthCourse`: shallow plinth course along the arcade foot.
- `VIS_GalW_DoorCoping`: coping on the niche wall so it reads as built masonry.
- Buttress struts now use the thinner `Buttress_B`.
- Removed `VIS_GalW_RailS` / `VIS_GalW_PostSE`: the solid stub sat across the stair head (the foreground slab in shot 02).

## Placeholder cleanup
- Static enemies (`Enemies.spawn`, `kind === 'static'`) are now a hooded ash sentinel: lathe robe, peaked hood with a dark
  face and two small ember eye slits, faint ember hem, low stone plinth. The bright target rings are gone; the health bar
  is narrower with a fainter backing. Hit capsule, wobble pivot and death slump are unchanged. Rushers are untouched.

## Gameplay / readability
- `arena.colliders.length` = 211. Nothing new sits on the walk surface or the court floor beyond the column footprints;
  the lanterns are above head height (deck + 2.3 m).
- Standing: balW centre 5.40, SE 5.40, NW 5.75, lean landing 4.80, lean-to-bal 5.75, lean join 5.75 (same as last pass).
- Walk: across the deck south→north is unobstructed (walks off the north edge as before); deck→south drops onto the lean
  slab; under the deck along x −7.4 is clear. Between the two court columns the player stops at z −25 on a pre-existing
  raised dais collider (x −3.5..3.5, top y 1.38), not on anything added here.

## Shots (identical poses, `scripts/review-freecam.js`)
| Pose | Before | After |
|------|--------|-------|
| 01 overview | `chapel-polish-before-01-overview.png` | `chapel-polish-after-01-overview.png` |
| 02 deck | `chapel-polish-before-02-deck.png` | `chapel-polish-after-02-deck.png` |
| 03 court floor elevation | `chapel-polish-before-03-elevation.png` | `chapel-polish-after-03-elevation.png` |
| 04 player eye on deck | `chapel-polish-before-04-eye.png` | `chapel-polish-after-04-eye.png` |
