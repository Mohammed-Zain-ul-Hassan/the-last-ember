# Merge plan: The Still City + the hearth defence

## Status (2026-10-18, ~02:00): built on branch `merged-game` (Vercel preview); production (`3D_Branch`) untouched
- Done: one knight (Ahnaf's, from combat-3d) in both acts, with the flame-carry IK, walk/sprint gait and no sword in
  Act I; the two-page handoff (Act I's Heart -> "Carry it out" -> dark -> `classic.html?from=still` -> the bridge
  -> 7 PM); The Last Ember title with Easy / Medium / Hard and a chapter list of both acts (Act II hours open
  `classic.html?from=chapters&chapter=n`); Act II difficulty (Hard = Ahnaf's tuning) in both menus; "quit to title"
  from Act II returns to the shared title; the lock prompt never shows over a cutscene.
- Cut (per the cut order): the single-page switch (the fade handoff is used); the secret "Hold the door" in the
  merged flow (still reachable with `?endings=1`, the Still City alone); the Last Words payoff in Act II.
- Open: the dawn choice keeps Act II's own two endings (they already echo the city: "Somewhere, a shadow moved").

## One game, two acts
**Title:** The Last Ember. One title screen, one menu, one save, one settings page (captions, sensitivity, volume).
- **Act I, The Still City** (night, time frozen): gate ward -> market -> temple -> library -> heart. Puzzles and the
  Wrong Shadow. Ends at the heart.
- **Bridge** (one short in-engine shot, ~25 s): time starts again.
- **Act II, The Hearth** (sunset to dawn, time running): 7 PM ... midnight torch ... 3 AM Marshal ... 5 AM, then the
  dawn choice.
- **Chapter select:** lists both acts (Act I districts, then Act II hours) so judges can jump in anywhere.

The themes become a single arc: in Act I time is **held** by fire, in Act II time **eats** the fire, and shadow is
the cost of both. That gives the trailer a clean multi-theme story.

## How the stories grow into each other
Facts that are already in both docs:
- Moeez: the Wrong Shadow is the one who lit the flame to hold the flood's last second.
- Ahnaf's bible: the knight once let the fire die, and his kingdom fell.

These are the same man. The knight lit the flame and froze his city, and the night of Act II is his penance.

1. **Act I's ending choice moves to dawn.**
   - At the heart, the Wrong Shadow puts its hand on the fire and he recognises it as himself.
   - Instead of choosing there, he takes the flame **out of the city**, to the old hearth on the plaza outside the
     walls.
   - The freeze has to be carried somewhere, and the city's held second now lives in the hearth.
2. **Sunset falls the moment he sets it down.** The first time the sun has moved in four thousand years.
   - The shades that come for it are the city's unfinished shadows, wanting their second back.
   - Midnight still kills the hearth; he lights the torch from it as before.
3. **Ahnaf's memories change meaning, not content.** The fragments the shades drop are Still City Last Words, so
   the 36 lines pay off in Act II.
4. **The dawn choice keeps Ahnaf's two options and inherits Moeez's endings:**
   - Step into the dawn: he lets it go out, and the flood comes.
   - Stay in shadow: he keeps the flame, and the city stays still forever.
   - All 36 Last Words found: "Hold the door", the secret third option. The people walk out in the one second.

**Bridge lines** (draft, in the doc's voice: short, mournful, second person sparingly):
- At the heart: "It has your hands." / "You lit this. You have been lighting it for four thousand years."
- Leaving the gate: "Carry it out. A held breath has to be held somewhere."
- At the hearth: "Set it down." / "And for the first time since, the sun moves."
- 7 PM card line (Ahnaf's card, prefixed): "They will come for the second you stole. Keep it until morning."

## One shared knight
- Ahnaf's new knight (mesh, swings, materials) becomes the only `KnightView`.
- Still City keeps only two additions, ported onto his file:
  - the carry IK that puts the flame on the palm;
  - the optional `gait` hook (walk, sprint, idle), from `src/still/render/gait.ts`.
- My `dressKnight` armour and tabard is dropped if his new look covers it; it is kept only if he wants it.
- In Act I he carries the flame in his left hand and no sword is drawn. In Act II he takes up the sword, with
  Ahnaf's swings.

## Difficulty, both acts (Ahnaf asked for it; do it at merge time, not before)
- The Still City already has Easy (default) / Medium / Hard: `src/config.ts` `DIFFICULTY`, and the shared
  setting `src/difficulty.ts` (key `lastember.difficulty`, `getDifficulty` / `onDifficulty`).
- At the merge, Act II (the hearth defence, /classic today) reads the same setting. Add a `hearth` section beside
  `still` in `DIFFICULTY`. **Ahnaf's current tuning is Hard** (his correction); Medium and Easy are gentler. Candidates for the multipliers:
  - shade HP and damage, spawn interval and max shades;
  - hearth HP drain, lives and i-frames;
  - lantern-eater bolt speed, Marshal wave speed.
- One choice on the shared title screen. It shows in both pause menus and carries from Act I into Act II.
- Tests: the demo bot clears every hour on all three levels, as the Still City scripts do now.
- No work on combat-3d until Ahnaf says go.

## Controls, unified
| Action | Act I | Act II |
|---|---|---|
| Move | WASD | WASD |
| Look | mouse with pointer lock (`src/ui/cursor.ts`) | same |
| Shift | sprint (Act I has no dash) | dash |
| Left click | strike | strike |
| E | act | act |
| Q / right click | Flame Lock | lock-on, if it exists |
| J / K | — | attacks, as Ahnaf's |

In Act I the left click wakes or acts only when not aimed at the Wrong Shadow. A quick tap stays "act" as it is
now, and there is no combat in Act I.

## Tech approach
**Preferred: one page, two act modules sharing renderer, stage, cursor, input, captions and audio bus.**
- Act I is `src/still/main.ts`; Act II is Ahnaf's `src/main.ts` as a module.
- The switch: fade to black, dispose Act I's scene and resources, build Act II.
- **Fallback if that fights us:** two pages and a seamless handoff. Fade to black, then
  `location = classic.html?from=still`, then Act II opens on a fade-in from the same black with the bridge line on
  screen. It looks continuous and carries almost no risk. Choose this if the deadline is under ~5 h when we start.
- The save carries `lastWords` and settings across the acts.

## Risks
1. **Time.** It is Day 3; the 09:30 submission is ~9 h away and feature freeze is past. The merge must ship as a
   preview by ~06:00 or we submit the acts as they are.
2. **`knightView.ts` conflict.** Ahnaf's rewrite against my carry IK and gait hook. Port them by hand onto his
   file; don't textually merge.
3. **Diverged shared files.** `input.ts`, `cameraRig.ts`, `stage.ts`, `cursor.ts`, `rain.ts` have diverged.
   - Pick one per file; Act-specific behaviour goes behind options.
   - Ahnaf's input says "never capture the cursor", but the group asked for pointer lock. Confirm which one wins.
4. **Performance.** Both at 60 fps. Dispose fully on the switch, with one renderer and one composer.
5. **The tone gap.** Act I is a quiet puzzle game and Act II is action. The bridge shot and the shared voice in
   cards and captions must carry it. Keep the rain and the palette continuous across the cut.

## Cut order if short
1. The secret "Hold the door" option (keep the two dawn endings).
2. The Last Words payoff in Act II (memories stay Ahnaf's text).
3. The single-page switch (use the two-page fade handoff).
4. Act I trimmed to gate ward -> market -> heart, with the other districts still in chapter select.
5. Act II's 11 PM and 1 AM merged into fewer hours.

Never cut: the bridge shot and its lines, the shared title and menu, and the shared knight.
