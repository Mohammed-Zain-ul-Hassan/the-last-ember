# Scope: SUNDIAL

Work strictly top-down. Estimates are in 30-min units (u).

## TIER 0: vertical slice (target Day 1 14:00)
- [ ] Phaser boot, manifest loader with fallback textures, scenes: Boot/Title/Game/End (2u)
- [ ] One level from JSON: buildings with footprint and height (1u)
- [ ] Sun from hour (azimuth/elevation) and shadow polygons drawn each frame (2u)
- [ ] Hero movement, in-shade test, burn meter, death (2u)
- [ ] Exit door, win, R to retry, no crashes (1u)

## TIER 1: theme proof (target Day 1 evening)
- [ ] Q/E time scrub with hourglass sand budget; sun auto-drift (2u)
- [ ] Sky colour and light tint driven by the hour; sundial + hourglass HUD (2u)
- [ ] 3 levels at dawn / mid-morning / sunset (2u)
- [ ] `?debug=1` (`window.__game`), `?seed=n`, `?demo=1` (recorded-input playback per level) (2u)

## TIER 2: feel (target Day 2 midday)
- [ ] Juice: ignition flames/smoke particles, ember death burst, shake, hit-stop, SCORCHED near-miss, door chime (3u)
- [ ] Procedural audio: wind bed, adaptive percussion, tick, scrub whoosh, crackle, chimes, mute (3u)
- [ ] Animated title (sun sweeping the logo's shadow), pause, settings (mute, shake), stars + best time (2u)
- [ ] postFX: bloom on sun, vignette, heat shimmer (1u)

## TIER 3: content
- [ ] Levels 4-8 (2u)
- [ ] Clouds drifting = moving global shade patches (1u)
- [ ] Birds/windmill blades = moving shadows (2u)
- [ ] Braziers/torches as point lights (fire hazards that also cast shadows) (2u)
- [ ] Sand pickups (1u)

## TIER 4: stretch
- Level editor UI, night level with moon, story vignettes, leaderboard.

## Team split (names TBD)
- **Gameplay core** (Zain + Claude, `main`): `src/game/*`, shadows, hero, levels.
- **UI/HUD + level design** (teammate B, branch): `src/ui/*`, `public/levels/*.json`.
- **Audio + VFX** (teammate C, branch): `src/audio/*`, `src/fx.ts`.
- **Art** (teammate D, branch): final PNGs into `public/assets/` by filename, logged in `ASSETS.md`.

## CUT LOG
- (none yet)

## NOW / NEXT / DONE
- NOW: concept approval.
- NEXT: Tier 0 slice.
- DONE: preflight, git init, concepts + spec + scope.
