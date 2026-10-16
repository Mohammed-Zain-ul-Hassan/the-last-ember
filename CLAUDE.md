# Game jam project

3-day vibe-coding game jam, team of 4. Judged first on a 3-minute trailer (>=2:00 raw gameplay), then top 5 are played.
Themes are revealed at 10:00 on Day 1; use >=1 (fusing several in one mechanic scores more).
Full rules, rubric and schedule: @docs/handbook.md

## Stack
Three.js r186 (`three@0.186.1`, WebGLRenderer, not WebGPU/TSL) + `postprocessing@6.39.5` + TypeScript + Vite.
Switched from Phaser on Day 1 (2.5D side-view with camera swings and fire-cast shadows needs real 3D; see docs/spec.md).
Gameplay runs as a pure 2D sim in `src/sim/` (no three imports, unit-tested); `src/render/` draws it in 3D.
Deployed to Vercel; Vite `base: './'`. Look up Three.js / postprocessing APIs with the context7 MCP, not memory.

## Commands
- `python run.py`: one command to play locally (checks Node, installs deps when needed, starts Vite, opens the
  browser). `--prod` serves the production build, `--debug` opens with `?debug=1`, `--port N`, `--no-browser`.
- `npm run dev` (use `preview_start game` in Claude Browser; do not start servers with Bash)
- `npm run build`, `npm run check` (typecheck + tests + assets check)

## Skills (in .claude/skills)
- `jam-build`: the entry point. Brief in, then plan -> build -> test -> push -> Vercel deploy. Start here.
- `jam-plan`: concept, spec, scope/cut list, placeholder art contract. Run first and at checkpoints.
- `jam-playtest`: end-to-end test loop + juice checklist. Run after every implemented feature.
- `jam-trailer`: builds the trailer from clips in `trailer/`.

## Rules
- All art and audio load through `public/assets/manifest.json`. Placeholders must look decent and match final size,
  frame grid and anchor so a teammate's PNG drops in by filename. Missing assets fall back, never crash.
- Log every real asset (source + licence) in `ASSETS.md` when it lands. CC0, own-made or AI-generated only.
- Tunables live in `src/config.ts`; effects go through `src/fx.ts`; sound through `sfx(name)`.
- Debug hooks behind `?debug=1` (`window.__game`), `?seed=n`, `?demo=1`, `?capture=1`.
- Small files, small commits (every 20-40 min), tag `playable-N` when the build runs. Revert to a tag after 2 failed fixes.
- Feature freeze is Day 2 evening. After that: bug fixes, balance, capture only.
- Never claim something works without evidence from this run (console, screenshot, test).

## Team workflow
Zain commits to `main`. Others work on a branch and open a PR. Keep file ownership disjoint
(gameplay / UI+HUD / audio+VFX / assets) to avoid conflicts.

## Out of scope for Claude
Whether the game is fun. Humans playtest and give numeric feedback.
