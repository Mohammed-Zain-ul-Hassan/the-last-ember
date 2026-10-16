# Scope: THE LAST EMBER

Work strictly top-down. Estimates are in 30-min units (u). Day 1 is 2026-10-16.

## TIER 0: vertical slice (target Day 1 ~16:00)
- [x] Three.js boot: renderer, side camera (12° yaw), fog, sky gradient, bloom + vignette, resize, DPR cap (2u)
- [x] Hearth: point light with shadows, flicker, flame + ember particles, HP (2u)
- [x] Knight (primitive silhouette + cape): move, jump, 3-hit combo, dash, hurt, death (3u)
- [x] Shade: spawns in a shadow interval, walks to the hearth, attacks it, takes light + sword damage, dies (2u)
- [x] One hour of play, hearth lose, knight lose, R retry, hour-cleared screen (1u)

## TIER 1: theme proof + story spine (target Day 1 evening)
- [ ] Chapter data 7/9/11 PM: sky, hearth strength, waves, hour-card text; the clock HUD (2u)
- [ ] Midnight cutscene: hearth dies, torch lit, camera orbit (2u)
- [ ] Torch phase 1/3/5 AM: torch light follows the knight; a scrolling road east (2u)
- [ ] Dawn and the choice: two endings with text cards (2u)
- [x] `?debug=1`, `?seed=n`, `?demo=1` bot, `?capture=1` (2u)

## TIER 2: feel (target Day 2 midday)
- [ ] Juice: hit-stop, shake, sparks, shade death smoke, memory wisps, camera punch, low-hearth heartbeat (3u)
- [ ] Procedural audio + adaptive drums, mute (3u)
- [ ] Title screen (camera orbit around the hearth), pause, settings, end screens (2u)
- [ ] CC0 KayKit models and animations swapped in (knight, shades, ruins) (3u)

## TIER 3: content
- [ ] 3 AM boss (2u) · flying shade (1u) · memory-fragment vignettes between chapters (2u) · more ruin set dressing (1u)

## TIER 4: stretch
- Voice-over, a photo mode, extra endings.

## Team split (names TBD)
- **Gameplay core + render** (Zain + Claude, `main`): `src/sim/*`, `src/render/*`.
- **UI/HUD + story text** (teammate B, branch): `src/ui/*`, `src/data/chapters.ts` text.
- **Audio** (teammate C, branch): `src/audio/*`.
- **Art/assets** (teammate D, branch): download and prepare the KayKit packs into `public/assets/models/`, log them in
  `ASSETS.md`, sky colour keys per hour.

## CUT LOG
- 2026-10-16: Sundial concept dropped (user picked Last Light). Past-selves mechanic cut (user). Torch-burns-knight
  mechanic cut to story-only (user). Engine Phaser to Three.js (research agent recommendation).

## NOW / NEXT / DONE
- NOW: Tier 1: midnight cutscene, torch phase (1/3/5 AM), dawn choice.
- NEXT: Vercel deploy; juice pass; KayKit models once downloaded.
- DONE: Tier 0 slice (7/9/11 PM hearth chapters play end to end, demo bot, debug hooks), tagged playable-1. Preflight, themes Q&A (4 rounds), orientation deck read, engine research, spec/story/scope.
