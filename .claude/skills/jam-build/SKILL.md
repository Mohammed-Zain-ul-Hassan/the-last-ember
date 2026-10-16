---
name: jam-build
description: End-to-end entry point for the game jam. Use when the user invokes /jam-build, says "let's build", "build the game", "here's what we're building", pastes the themes or a game brief and wants it planned, built, tested, pushed and deployed. Chains jam-plan, the build, jam-playtest, then commits, pushes to GitHub and deploys to Vercel.
---

# jam-build

One command from brief to a live, shareable build. It orchestrates; the detail lives in the other skills:
`jam-plan` (concept, spec, scope, placeholder art contract), `jam-playtest` (test loop + juice),
`jam-trailer` (video). Read `CLAUDE.md` first. Invoking this skill authorises: commits, pushing to the
team's PRIVATE GitHub repo, and deploying to Vercel. It does NOT authorise making the repo public,
force-pushing, or deleting anything; ask first for those.

## Input
Whatever the user gives: themes, a concept, a one-line brief, or "continue". If the brief is thin, ask at most
3 questions in one AskUserQuestion call (themes if known, 2D/3D if unclear, anything the organisers said).
If `docs/spec.md` and `docs/scope.md` already exist, resume from NOW/NEXT instead of starting over.

## Phase 0 - Preflight (2 min, report problems immediately)
- `git status` clean or committed; `npm ci` if node_modules missing; `npm run build` passes.
- GitHub: `gh auth status`. If no `origin`, create it: `gh repo create <name> --private --source . --push`.
- Docs lookup: use the context7 MCP if loaded; otherwise its HTTP API, pinned to Phaser 3.90:
  `curl -s "https://context7.com/api/v1/phaserjs/phaser/v3_90_0?type=txt&topic=<topic>&tokens=2000"`.
  Phaser's GitHub `skills/` folder is written for Phaser 4: ideas only, verify every API against 3.90.
- Dev server: `preview_start game` in the Claude Browser pane (never via Bash).
- Wrap anything longer than a minute in `caffeinate -is`.

## Phase 1 - Plan (run jam-plan Mode A)
Concept scoring, `docs/spec.md`, `docs/scope.md`, team split. STOP and get the user's approval of the concept
before writing game code. This is the only mandatory stop.

## Phase 2 - Build (vertical slice first, then widen)
Order: Tier 0 slice playable end to end -> theme proof -> feel -> content. Commit every finished item.
Quality bar (this is what separates us from other entries; do not ship below it):
- Feel: apply the juice checklist in jam-playtest as each mechanic lands, not at the end. One satisfying core
  verb every second; near-miss and combo feedback; flow-channel difficulty ramp over the first 60 s; instant
  one-key retry with best score shown (loss aversion + goal gradient). Ethical hooks only.
- Art: placeholders per jam-plan Mode C, generated as PNGs by script, cohesive <=6-colour palette, outline,
  shading, layered parallax background. Must look intentional in a screenshot. Use Phaser 3.60+ preFX/postFX
  (glow, bloom, vignette), particles, blend modes and camera effects where they serve readability.
- Audio: procedural WebAudio SFX for every event (layered envelopes, slight pitch variation), an adaptive music
  bed that intensifies with game state, mute key, audio starts on first input.
- UX: animated title, playing within 2 s, onboarding by doing (no text walls), pause, settings (mute,
  screenshake), fail/win screen.
- Hooks: `?debug=1` (`window.__game`), `?seed=n`, `?demo=1` bot that plays well enough for trailer footage,
  `?capture=1` if feasible. Steady 60 fps with particle caps and pools.
- Originality: no cloned mechanics, no third-party art except logged CC0; every real asset in `ASSETS.md`.
Parallelism: only for disjoint files (e.g. audio, UI/HUD, art generator) via subagents or a teammate's branch;
gameplay core stays in one session. Spawn build subagents with model opus and high effort when the user asks
for them.

## Phase 3 - Test (run jam-playtest in full)
All phases, looped until zero blockers. Look at the screenshots critically and do at least one visual
improvement round ("would this frame work as a trailer thumbnail?"). Record a 20-40 s clip of each new
feature into `trailer/raw/` and log it in `trailer/clips.md`.

## Phase 4 - Ship
1. `npm run check && npm run build` must pass. Commit with a plain message; tag `playable-N`.
2. `git push` (and `--tags`) to the private repo. Never force-push.
3. Vercel: if the repo is already linked, the push deploys automatically; wait for it and get the URL.
   First time only: in the browser signed in to Vercel (Claude in Chrome), Add New Project -> import the
   GitHub repo -> framework Vite, build `npm run build`, output `dist` -> Deploy. If Vercel asks for GitHub
   access, stop and let the user approve it. Do not change account or team settings.
   Finding the URL: `gh api repos/<owner>/<repo>/deployments` then `.../deployments/<id>/statuses` gives the
   deployment state without a browser. That per-deployment URL and the `-git-main-` URL are behind Vercel login
   (302), so never share them. The public production domain is NOT always `<project>.vercel.app` (that name can
   belong to someone else; Vercel may add a suffix like `-five`). Read it from the project page or by curling
   candidates, and confirm the page `<title>` is ours before sharing.
4. Verify the LIVE URL, not localhost: loads, zero console errors, assets 200, audio starts on input, one full
   run playable. Then report the URL.

## Phase 5 - Report (every invocation)
What changed, test evidence (paths to screenshots/logs), live URL, open issues, updated NOW/NEXT from
`docs/scope.md`, time remaining to feature freeze, and the exact next prompt the user should give.

## Rules
- Never claim done without evidence from this run. After 2 failed fixes, revert to the last tag and cut.
- Stay inside the feature freeze from jam-plan. After it: fixes, balance, capture, ship only.
- Making the repo public happens once, at submission, after the user confirms.
