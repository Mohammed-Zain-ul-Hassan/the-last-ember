# Scope: THE LAST EMBER

Work strictly top-down. Estimates are in 30-min units (u). Day 1 is 2026-10-16.

## TIER 0: vertical slice (target Day 1 ~16:00)
- [x] Three.js boot: renderer, side camera (12° yaw), fog, sky gradient, bloom + vignette, resize, DPR cap (2u)
- [x] Hearth: point light with shadows, flicker, flame + ember particles, HP (2u)
- [x] Knight (primitive silhouette + cape): move, jump, 3-hit combo, dash, hurt, death (3u)
- [x] Shade: spawns in a shadow interval, walks to the hearth, attacks it, takes light + sword damage, dies (2u)
- [x] One hour of play, hearth lose, knight lose, R retry, hour-cleared screen (1u)

## TIER 1: theme proof + story spine (target Day 1 evening)
- [x] Chapter data 7/9/11 PM: sky, hearth strength, waves, hour-card text; the clock HUD (2u)
- [x] Midnight cutscene: hearth dies, torch lit, camera orbit (2u)
- [x] Torch phase 1/3/5 AM: torch light follows the knight; a scrolling road east (2u)
- [x] Dawn and the choice: two endings with text cards (2u)
- [x] `?debug=1`, `?seed=n`, `?demo=1` bot, `?capture=1` (2u)

## TIER 2: feel (target Day 2 midday)
- [x] Juice: hit-stop, shake, sparks, shade death smoke, memory wisps, camera punch, low-hearth heartbeat (3u)
- [x] Procedural audio + adaptive drums, mute (3u)
- [x] Title screen (camera orbit around the hearth), pause, settings, end screens (2u)
- [ ] CC0 KayKit models and animations swapped in (knight, shades, ruins) (3u)

## TIER 3: content
- [x] 3 AM boss (2u) · flying shade (1u) · memory-fragment vignettes between chapters (2u) · more ruin set dressing (1u)

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
- NOW: phase 5 polish (settings: volume, screenshake; best grade per level saved), then re-capture trailer clips:
  the five memories, the charged rend, levels and cards, enemies, the journey.
- NEXT: feature freeze Day 2 evening; then balance, bug fixes, trailer edit.
- DONE (playable-11): phase 4 memories, shadow-puppet theatre between levels (src/render/memory.ts).
- DONE (playable-10): every hour is a numbered level (Level n of 6 on the intro card and HUD, a Level complete card
  with stats and a level strip, any key continues). Heavy hold-to-charge (feet planted, 3-8 dmg). Lives + health:
  3 shards x 100 health; a broken shard throws the shades back and refills the bar. Shared health bar: instant fill,
  slow pale chip, green-yellow-red ramp, blink on hit (no blink for burning drain).
- DONE: Level 2 phases 2 + 3 (playable-9): places with reveal shots; Crawlers, Lantern-eaters, the Marshal's two
  phases. Controls: no dropped presses (input read per sim step), double jump, jumps cancel swing/dash tails,
  hold-to-charge strike (2-7 dmg AOE, "Shadow Rend" at full).
- DONE: Level 2 phase 1 (playable-8): the journey across four places, platforms, embers, road, braziers, boss gate,
  dawn on the wall. Combat moveset (playable-7). Live: https://the-last-ember-xi.vercel.app
