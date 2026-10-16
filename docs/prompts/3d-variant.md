# Prompt: THE LAST EMBER, full-3D variant (paste everything below the line into a fresh agent)

---

You are building a **full-3D variant** of our game-jam entry, *The Last Ember*, in **Three.js**. A parallel team is
building the 2.5D side-view version, so you don't need to match it. Your job is to show us a version we didn't think
of. **Keep the soul, reinvent the form, and surprise us.** Work autonomously; don't stop for approval until you have
a playable build.

## 1. The competition (facts, don't re-derive)
- A 3-day in-person vibe-coding game jam in Islamabad, team of 4, coding agents allowed. Day 1 is Fri 2026-10-16
  (themes revealed 10:00). **Feature freeze is Day 2 (Sat 17 Oct) evening.** Submission is Day 3 (Sun 18 Oct) around
  09:30; confirm with the user.
- **Rules (organisers' deck):** any engine, any assets, **no stealing**. Ripped assets, copied code, copied
  characters and cloned mechanics mean disqualification. CC0, properly licensed and AI-generated assets are fine;
  log every one with source and licence in `ASSETS.md`.
- **Organisers' suggested engines:** Phaser, Kaboom.js, Three.js, HTML5+JS. Web builds; we deploy to Vercel.
- **Judging:** first a **3-minute trailer**, which must contain **≥2:00 of raw, screen-recorded gameplay**, plus up to
  1:00 of stylised edit. It must show exactly how the themes are used. The **top 5** trailers get played by judges,
  probably in a browser on venue laptops with integrated GPUs.
- **Rubric:** theme adherence 30% (core integration 15, multi-theme synergy 10, atmospheric framing 5); then core
  gameplay and feel, visual polish, audio design, innovation and uniqueness, technical stability, scope and
  completeness, trailer quality.
- **Themes: FIRE, SHADOW, TIME.** We use all three, fused. The deck says "themes ≠ genres": themes must live in the
  **gameplay, storyline and atmosphere**. The team is going all-in on creativity.

## 2. The soul of the game (locked with the team; keep it)
- **Title:** The Last Ember.
- **Tone:** mythic and melancholic. References: Ori, Gris, Journey, Limbo, Inside, Shadow of the Colossus. A small
  light against a vast dark.
- **Hero:** a **shadow knight**, inspired by the loyal shadow-knight archetype (think Igris in Solo Leveling) but
  **wholly original**: no Igris name, colours (red plume, crimson armour) or likeness.
- **Fire arc:** the knight **guards** an ancient hearth, then **carries** its flame, and dawn is the light that
  **ends** him.
- **Story spine:** the sun has died, and one ancient hearth still burns. From **sunset to dawn**, told as **hour
  chapters** (7 PM … 5 AM), shades come for the fire.
  - **Midnight** is the midpoint cutscene: the hearth gutters out, but at the last moment he lights a **torch** from
    it and guards that flame until dawn.
  - The shades are his fallen people. Freed shades return **memories**, and these reveal that **as a living knight
    he once let the fire die** and his kingdom fell. This night is his penance.
  - **Ending: the player chooses.** Step into the dawn light (he dissolves, memories return, the ember lives) or stay
    in shadow (he endures, alone).
- **Narration:** a few lines of poetic text per hour card. No voice-over.
- **Things the team rejected (don't reintroduce):** a "past selves / echo clones" mechanic, and the torch draining
  his health as a mechanic (the torch smoking off his gauntlet is story-only).
- **Art direction the 2.5D team uses:** black silhouettes, with fire as the only colour. **You may depart from it**
  if your direction is stronger, but the fire-against-darkness contrast must stay central.

## 3. Your freedom (this is where we want the surprise)
Everything below is yours to reinvent. Don't take the obvious option just because it's listed first:
- **Camera and genre:** third-person over-the-shoulder, a fixed cinematic camera, a top-down 3D diorama, a
  tilt-shift miniature, first person, a circling arena, a slow-walk journey… anything that serves the soul.
- **How the three themes fuse into one mechanic.** The 2.5D team's fusion is: "fire makes light, light makes
  shadows, shades spawn only in shadow, time eats the fire." Find **your own** fusion. Ideas to beat, not copy:
  - shadows that are physically real in 3D (the cast-shadow volume as terrain or as a threat);
  - the time of night as something the player manipulates;
  - the hearth as a moving thing;
  - light radius as both shield and lure.
- **Combat or no combat**, the structure of the hours, how midnight and dawn are staged, and how the choice is
  presented.
- **Process:** before coding, spend ≤20 minutes writing `docs/3d-direction.md` with **three bold directions** (a
  one-paragraph pitch each, the fusion mechanic, the trailer money shot, and the biggest risk). Pick the one with
  the best mix of surprise and buildability in ~30 hours, justify it in 5 lines, then build it. Don't ask us to
  choose.

## 4. Hard constraints
- **Where you work:** **never touch the `main` branch or the 2.5D code.** The repo is
  `github.com/Mohammed-Zain-ul-Hassan/the-last-ember` (private), checked out at
  `/Users/zain/Development/gamedev/game` on Zain's Mac. Use a separate worktree on a new branch:
  `git worktree add ../the-last-ember-3d -b variant-3d`, and work only there. Alternatively, clone into a new folder
  and use branch `variant-3d`. Push only `variant-3d`. Never force-push. Don't make the repo public.
- **Stack:** Vite + TypeScript, `three@0.186.1` (WebGLRenderer, **not** WebGPU/TSL), `@types/three@0.186.0`,
  `postprocessing@6.39.5`. Pin exact versions. Physics is optional: `@dimforge/rapier3d-compat@0.21.0` if you truly
  need it, else hand-rolled collision. Look APIs up with the context7 MCP, not memory.
- **Known r186 gotchas:**
  - Lights use physical units since r155 (`decay=2`, point-light intensities in the tens to hundreds).
  - `PCFSoftShadowMap` is removed in r186; use `PCFShadowMap`.
  - With pmndrs postprocessing, set `renderer.toneMapping = NoToneMapping` and do ACES/AgX in a `ToneMappingEffect`;
    use a `HalfFloatType` frame buffer so fire above 1.0 blooms.
  - A shadow-casting `PointLight` costs 6 shadow renders, so allow at most one or two shadow-casting lights, 512–1024
    maps and a tight shadow camera.
- **Performance:** a steady 60 fps on an integrated-GPU laptop at 1280×720. Cap DPR at 1.5, pool particles, keep
  draw calls modest, and use instancing for repeated props. Payload is ideally < 25 MB, with gzip/Draco/meshopt where
  it helps. Time-to-play is < 5 s on a normal connection.
- **Robustness:**
  - A missing or broken model falls back to a primitive and logs a warning; it never crashes. Load assets through a
    manifest (`public/assets/manifest.json`).
  - Tunables live in one `src/config.ts`.
  - Keep gameplay logic testable without WebGL where practical, using vitest for pure logic.
- **Hooks:** `?debug=1` (exposes `window.__game` with `state`, `restart()`, `skipTo(chapter)`, `godMode`,
  `snapshot()` and an FPS readout), `?seed=n` (reproducible), `?demo=1` (an autoplay bot good enough to record
  trailer footage) and `?capture=1` (hides the HUD).
- **Audio:** procedural WebAudio for every event (layered envelopes, slight pitch variation), an adaptive music bed
  that intensifies with danger, a mute key, and audio that starts on first input. Licensed or CC0 music/SFX are
  allowed if logged.
- **UX:**
  - an animated title, playing within 2 s, onboarding by doing (no text walls);
  - pause, settings (mute, screenshake, invert-Y if relevant), win/lose screens and instant retry.
  - Controls: keyboard + mouse, gamepad if cheap.
- **Commits:** small and frequent (every 20–40 min), plain messages, tag `variant3d-playable-N` whenever it runs.
  After 2 failed fixes on something, revert to the last tag and cut the feature.
- **Evidence:** never claim something works without evidence from this run (console output, a screenshot, a test
  result). Verify in a real browser; if you're in Claude Code on Zain's Mac, use the Claude Browser pane.

## 5. The quality bar ("feels AAA in a jam")
Research distilled for you:
- **Scope:** one polished loop beats four rough ones. Pair a clear hook with finish.
- **Game feel:** layer picture + sound + motion on every event. Use small/medium/large feedback tiers: hit-stop of
  50–100 ms on heavy hits only, short screenshake, particles, squash/stretch, eased motion. Stop before it's noise.
  Aim for one satisfying verb every second, a difficulty ramp over the first 60 s, and near-miss feedback.
- **Lighting is the expensive look:**
  - a few coloured fire lights, bloom only on emitters (high luminance threshold);
  - one colour grade for the whole frame, exponential fog for depth layering, rim light on silhouettes;
  - sky gradients that move from dusk through deep night to dawn.
- **Music:** a calm bed plus a tension layer that fades in on the beat delivers most of an adaptive score.
- **Test:** would any random frame work as a trailer thumbnail? Run at least one visual-improvement pass with
  screenshots.

## 6. Assets you may use (CC0, verified; log each in `ASSETS.md`)
- **Characters and animation:**
  - KayKit Adventurers 2.0, CC0 rigged characters incl. a knight, glTF: https://kaylousberg.itch.io/kaykit-adventurers
  - KayKit Character Animations, CC0, 150+ clips for Rig_Medium (melee, block, run, jump, death):
    https://kaylousberg.itch.io/kaykit-character-animations
  - KayKit Skeletons, CC0, same rig; recolour as shades: https://kaylousberg.itch.io/kaykit-skeletons
  - Quaternius Ultimate Monsters, CC0 glTF: https://quaternius.com/packs/ultimatemonsters.html
  - Quaternius Universal Animation Library, CC0: https://quaternius.com/packs/universalanimationlibrary.html
- **Environment:**
  - KayKit Dungeon, CC0 walls, stairs, doors, banners: https://kaylousberg.itch.io/kaykit-dungeon-remastered
  - KayKit Forest, CC0: https://kaylousberg.itch.io/kaykit-forest
  - Quaternius Medieval Village MegaKit, CC0: https://quaternius.com/packs/medievalvillagemegakit.html
- **Effects:** Kenney Particle Pack, CC0 textures: https://kenney.nl/assets/particle-pack
- **Downloading:** itch packs are "name your price", so $0 works. If you can't download them yourself, ask Zain to
  drop the zips in `~/Downloads`, and keep building with primitives meanwhile. A silhouette or stylised look hides
  low detail, so primitives must look intentional, not like debug boxes.
- **Fire:** a custom additive particle system (camera-facing points, HDR colours above 1.0 so bloom catches them),
  plus embers and a soft halo sprite.

## 7. Milestones (be ruthless about order)
1. **Day 1 night:**
   - `docs/3d-direction.md` (the three directions and your pick);
   - a vertical slice: title → one hour of play → win/lose → instant retry;
   - your fusion mechanic visible in 10 seconds of footage;
   - committed, tagged and pushed on `variant-3d`.
2. **Day 2 midday:** the full night arc (sunset → midnight cutscene → dawn choice, both endings), plus juice and audio.
3. **Day 2 evening:** **feature freeze.** After that it's only bug fixes, balance, performance and `?demo=1` footage
   quality.
4. **Throughout:** keep `docs/3d-scope.md` with NOW/NEXT/DONE and a cut log.

## 8. Deploy
Vite `base: './'`, so `npm run build` outputs `dist/`. If the Vercel CLI is logged in, deploy a **preview**
(`vercel deploy`) of the `variant-3d` branch. Otherwise ask Zain to connect it. Don't change the team's existing
Vercel project settings. Verify the live URL: it loads, has zero console errors, assets return 200, audio starts on
input, and one full run is playable.

## 9. Report back (every time you stop)
- The direction you chose and why (5 lines).
- What's playable, with evidence (screenshot paths, test output).
- The live URL if deployed, open issues, and NOW/NEXT.
- The 3 best 10-second moments for the trailer and how to trigger them (`?demo=1&seed=…&skipTo=…`).
- What we should steal back into the 2.5D version.

Surprise us.
