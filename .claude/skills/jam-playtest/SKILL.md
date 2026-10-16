---
name: jam-playtest
description: Hardcore end-to-end test loop for the browser game. Use after implementing anything, before declaring a feature done, when the user says "test it", "playtest", "something is broken", "is it ready", or before any submit candidate. Runs static checks, scripted scenarios, input fuzzing, asset-swap and performance checks in loops, fixes by severity, and only stops when nothing blocking is left. Also holds the juice (game-feel) checklist.
---

# jam-playtest

Never claim "works" without evidence from THIS run (console output, a screenshot, a test result). Claude cannot judge
"fun", so you test correctness, robustness and polish, and you surface feel questions for the humans.
Use the Claude Browser pane (`mcp__Claude_Browser__*`) with `preview_start game`; never start dev servers with Bash.
Playwright MCP is available for headless runs and multi-viewport passes.

## Prerequisites (create if missing, tell the user)
- `window.__game` behind `?debug=1`: `state`, `restart()`, `skipTo(level)`, `godMode`, `spawn(type)`, `setSeed(n)`,
  `snapshot()` (JSON of score/entities/scene). `?seed=n` makes runs reproducible. `?demo=1` runs an autoplay bot.
- `npm run check` = typecheck + lint + unit tests (vitest for pure logic) + `npm run assets:check`.

## The loop (up to 5 iterations per invocation, then report; repeat invocation if blockers remain)
**Phase 1 - Static gate.** `npm run check` and `npm run build`. Any failure is a blocker. Build must work from a fresh
clone (`rm -rf node_modules dist && npm ci && npm run build`) at least once per submit candidate.

**Phase 2 - Boot.** Load the game, read console. Zero errors and zero warnings except known ones. Check network:
no 404 assets, total payload size, time-to-interactive under 3 s on localhost.

**Phase 3 - Scenario matrix.** Drive each with `__game` and screenshot every state:
boot, title, start, core action, score change, each enemy/obstacle/pickup type, each theme mechanic, pause/resume,
lose, win, restart, restart x10 (no leaks: entity/listener/texture counts return to baseline), level skip, final state.
Compare each screenshot to `docs/spec.md` intent: unreadable text, overlap, off-screen entities, missing feedback,
clipping, z-order, wrong scale, dead time >5 s, unexplained rules.

**Phase 4 - Input and environment fuzz.** Mash keys, hold keys, two keys at once, opposing keys, click spam,
touch/mouse if supported, blur/focus (tab away 10 s and back; game must pause or stay consistent), resize through
1280x720, 1366x768, 1920x1080, 2560x1440 and a narrow window, devicePixelRatio 1 and 2, mute/unmute, fullscreen.
Soft-lock audit: from every state, can the player always make progress or restart? Any "no" is a blocker.

**Phase 5 - Asset swap test.** Replace one sprite with a different-size PNG, delete one file, corrupt one file:
game must not crash and must log the fallback. Confirm `manifest.json` statuses match the files on disk.

**Phase 6 - Performance.** Sample FPS and frame time after 60 s of heavy play (and 5 min soak once per candidate).
Flag <55 fps, growing memory, growing entity counts, long frames >50 ms, GC hitches. Test with `?demo=1` on the
worst scene. Particle and sprite counts get caps if they spike.

**Phase 7 - Fix.** Severity order: crash > soft-lock > data/score bug > feel > cosmetic. One fix at a time; rerun only the
affected phase, then rerun Phase 1. If a bug survives 2 fixes, stop, revert to the last tag, and propose cutting
the feature (see jam-plan). Add a vitest or a scripted scenario for every bug fixed so it cannot regress.

**Phase 8 - Log.** Append to `docs/playtest-log.md`: build/commit, phases run, issues found/fixed/open, evidence
paths (screenshots in `docs/shots/`), and a "needs a human" list (feel, difficulty, humour, clarity).

Exit only when Phases 1-6 pass with zero blockers, or after 5 iterations with a clear open-issues list.

## Human feedback request (end of every run)
Ask the teammates for numbers, not vibes: "jump height/gravity too floaty by how much?", "first death at what second?",
"what was confusing in the first 30 s?", "which moment did you want to show a friend?".

## Juice checklist (run after Tier 0/1 pass; stop after the time budget, default 90 min)
1. Feedback on every action: input response <100 ms; squash/stretch ~80 ms; hit-stop 40-80 ms; screen shake with
   decaying amplitude (150-250 ms) and an off switch; white flash on hit; floating numbers.
2. Motion: ease everything (no pop-in); scene fades 200-300 ms; camera lerp with lookahead and zoom punch; parallax or
   ambient motion so no frame is static.
3. Particles and light: spawn/death/pickup bursts, trails on fast things, dust on landing, one consistent glow/vignette.
4. Readability: player and threats highest contrast, background desaturated, <=5-6 colours; HUD big and animated on
   change; the THEME visibly shown on screen so the trailer can capture it.
5. Flow: title to play in <2 s, one-line controls, restart <1 s on one key, difficulty ramps over 60 s, fail screen with
   score/best/"again".
6. Audio hook for every event via one `sfx(name)` call; a music bed with a state change on escalation.
Centralise effects in one `fx.ts` with constants at the top (tuning beats rewriting). Re-run phases 3 and 6 after
each batch; check a screenshot at peak chaos for readability.
