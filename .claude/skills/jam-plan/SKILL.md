---
name: jam-plan
description: Plan the game jam build. Use when the user pastes the 3 themes, says "themes are out", "pick a concept", "plan it", "what should we build/do next", wants to add a feature, or says we are behind. Produces scored concepts, a one-page spec, a tiered cut list, and decent-looking swappable placeholder art. Re-run at checkpoints to enforce scope.
---

# jam-plan

Competition facts (do not re-derive): 3-day event, ~2 days real build, team of 4, judged FIRST on a 3-minute
trailer (>=2:00 raw gameplay), then top 5 are played. Must use >=1 of 3 themes; using several in one mechanic earns
synergy points. Rubric: theme core integration 15, synergy 10, atmosphere 5; then gameplay/feel, visual polish,
audio, innovation, stability, scope/completeness, trailer. Copied assets/code/mechanics = disqualification.
Stack: Phaser 3 + TypeScript + Vite, deployed to GitHub Pages. 2D unless the themes truly demand 3D (decide by 10:30 Day 1).

## Mode A - kickoff (themes just revealed)
1. Ask the user for the 3 themes and any constraint they heard at the demo/QnA. Ask at most 3 questions.
2. For each theme list 5 literal and 5 metaphorical readings. Prefer readings that become a VERB the player does
   every second, not a backdrop.
3. Produce 6 concepts: hook, core verb, win/fail, which themes and HOW (mechanic, not setting). >=2 fuse 2+ themes in
   one mechanic; >=1 uses all 3.
4. Hard filters, drop if: needs networking/multiplayer, procedural worlds at scale, complex AI, >30 unique art assets;
   core loop not demonstrable in 10 s of footage; near-clone of a known game (name the closest, change the twist);
   theme is only a skin (swap the theme and nothing changes).
5. Score survivors 1-5: ThemeCore x3, Synergy x2, Atmosphere x1, FunIn30s x3, Originality x2, Buildable x3,
   TrailerFriendly x2. Show the weighted table. Recommend ONE, name the runner-up.
6. Write `docs/spec.md`: title, pitch, where each theme shows (mechanic / art / audio / UI), core loop in 5 steps,
   the single "wow moment", art direction in 3 constraints (<=5 colours, shape language, camera), audio direction,
   top 3 risks with fallbacks, and 2D-vs-3D decision.
7. Write `docs/scope.md` (see Mode B) and split work across the 4 people (ask who is who if unknown).
8. STOP and show the user. Do not implement until they approve the concept.

## Mode B - scope guard (any time)
Keep `docs/scope.md` current with: TIER 0 vertical slice (boots, title, core loop, win/lose, restart, no crashes);
TIER 1 theme proof (each theme visibly changes mechanics/visuals; trailer-able in 30 s; includes `?demo=1` autoplay mode);
TIER 2 feel (juice, audio, particles); TIER 3 content; TIER 4 stretch; CUT LOG; NOW/NEXT/DONE.
- Work strictly top-down. A new feature: classify tier, estimate in 30-min units, say what it displaces.
- Ask "can this be shown in the trailer?" If no and it is not stability, it is Tier 4.
- After 2 failed fixes, cut it rather than debug it.
- Checkpoints: end Day 1 = Tiers 0+1 done and committed; mid Day 2 = Tier 2; Day 2 evening = FEATURE FREEZE
  (bug fixes, balance, capture only). If a checkpoint is missed, auto-cut the lowest remaining tier and say so.
- Commit after each finished item; tag `playable-N`.

## Mode C - placeholder art (so swapping PNGs is a level-up, not a rewrite)
Placeholders must already look like a real game. The final PNGs only replace them.
1. Everything the game draws is a file loaded through `public/assets/manifest.json`; no art is drawn in code at runtime
   (shape-drawing in code is allowed only for debug overlays). Each entry:
   `{ key, file, w, h, frames, frameW, frameH, anchor:[x,y], status:"placeholder"|"final", license, source }`.
2. Generate placeholders with `scripts/gen-placeholders.mjs` (sharp + SVG templates; write it if missing). They must have:
   final-size dimensions, final frame counts and anchors, transparent background, a 5-colour palette from the spec,
   a 1-px dark outline, 2-3 tone shading (light/base/shadow), and a drop shadow where the style needs it.
   Backgrounds: layered parallax with a gradient sky and 2-3 depth layers, never flat colour.
3. Same filename, size, frame grid and anchor = drop-in swap. `npm run assets:check` (write it) compares each file in
   `public/assets/` with the manifest and fails on size/frame mismatch or missing files.
4. A missing or broken asset must fall back to a visible generated texture and log a warning; it must never crash.
5. Audio follows the same contract: `audio` entries in the manifest, procedural WebAudio placeholders first
   (jump/hit/pickup/UI blips with envelopes, a looping bed), real files swap by key.
6. Log every real asset's source and licence in `ASSETS.md` the moment it lands (plagiarism is a disqualifier).
   Only CC0, own-made or AI-generated-by-us assets; never ripped game art.

## Output of every run
Updated NOW/NEXT, one line of time remaining, and the next prompt the user should give Claude.
