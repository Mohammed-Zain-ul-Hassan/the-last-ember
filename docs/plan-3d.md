# THE LAST EMBER: third-person 3D

Decision (user, Day 1 23:30): the game becomes a **third-person 3D action game**, camera behind the knight's
shoulder. Same night, same places, same story. Built on `3D_Branch`; `main` stays the shipped 2.5D game as the
safety net for the Day 3 09:30 submission.

## What stays
- The night: 7 PM / 9 PM / 11 PM on the hearth grounds, midnight cutscene, 1 AM lower city, 3 AM cathedral +
  the Hollow Marshal, 5 AM city wall, dawn and the choice. Chapter data (`src/data/chapters.ts`) unchanged.
- The fusion: **fire makes light, light casts shadows, shades rise from the shadows, time eats the fire.**
  Now the shadows are real 2D pockets on the ground behind every pillar, wall and pew, not 1D intervals.
- Hearth HP and embers, torch after midnight, lantern-eaters dimming it, crawlers, checkpoints, boss gate, lives.
- Menus, settings, grades, audio, HUD, health bars, memory theatre, cutscenes (already third-person).
- Knight, shade, crawler, lantern, Marshal meshes and animations (they gain a yaw).

## What changes
| Area | 2.5D today | 3D |
|---|---|---|
| Sim space | x/y side plane | ground plane x/z + height y; knight and enemies have a yaw |
| Movement | A/D, jump, drop-through | WASD relative to the camera, jump + double jump, Shift dash in move direction |
| Camera | side follow + authored shots | mouse orbit (pointer lock) behind the shoulder, pulls in against walls; authored shots kept for cards, reveals, cutscenes |
| Combat | facing left/right, reach boxes | arcs in front of the knight (reach + angle); soft aim turns swings toward the nearest shade in the camera cone; lock-on (MMB/Tab) as Tier 2 |
| Moves | combo, heavy, charge, air, plunge, dash strike, lunge | keep combo, heavy cleave (360°), hold-charge, dash strike, lunge, air attack, plunge (slam ring) |
| Shadows | `shadowIntervals` (1D) | exact: a ground point is dark if the ray to the flame hits a solid (`inShadow`, `lightAt(x, z)`), the same shadow the shadow map draws |
| Levels | 1D strips of walls + one-way platforms | grounds: a round ruined plaza (r ~32 m) around the hearth; roads: the same x-length with a walkable width in z (street 12 m, market square 26 m, nave 16 m with pillar rows, rampart 6 m); platforms become solid boxes you jump onto, stairs as steps |
| Marshal waves | ground line to jump | expanding ring to jump |
| Lantern bolts | 2D projectiles | 3D projectiles aimed at the knight |
| Controls | keyboard + mouse | + mouse sensitivity / invert-Y settings; gamepad is stretch |

## Phases (each ends tested with `npm run check`, played in the browser, committed, tagged `3d-N`)
1. **Core (3d-1). DONE (Day 1 night).** 3D sim: knight move/jump/dash/attacks with collision against boxes and cylinders; shades seek,
   wind up and strike; hearth; shadow wedges and spawning in them. Pointer-lock orbit camera. The hearth grounds
   rebuilt as a plaza. 7 PM playable start to finish. Port the sim tests.
   Shipped: `sim/geom.ts` (rotated boxes + cylinders, push-out, segment hits), exact cast shadows (ground point ->
   flame ray), soft aim, WASD relative to the camera, pointer-lock mouse look (Q/E turn), wall-aware follow camera
   that drifts back behind him when the mouse is idle, sky dome + skyline rings, plaza built from the sim's solids.
   Road levels are auto-extruded from their side-view data (playable, not yet re-authored). 46 tests.
2. **The night (3d-2).** Roads (lower city, cathedral, city wall) widened; embers and shrines, checkpoints, boss
   gate, crawlers, lantern-eaters, the Marshal, dawn and the choice. Midnight and dawn cutscenes re-staged around
   the knight's 3D position. Demo bot walks the whole night.
3. **Feel (3d-3).** Soft aim and lock-on, camera shake and punches in 3D, hit-stop, damage numbers, reveal shots,
   off-screen markers (hearth, shades behind you), controls screen, sensitivity settings, performance on laptops.
4. **Ship.** jam-playtest loop, re-capture trailer clips (third-person footage), deploy a preview to Vercel; the
   team chooses which version to submit.

Rough size: phase 1 ~6 h, phase 2 ~5 h, phase 3 ~3 h, phase 4 ~2 h. This runs past the Day 2 evening feature
freeze, which is why `main` stays shippable. Cut order if behind: lock-on, then plunge/air moves, then the
lantern-eater, then the market square (street only).
