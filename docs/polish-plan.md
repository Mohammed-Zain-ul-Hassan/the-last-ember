# Polish plan: smooth, crisp, readable (3D_Branch)

A week of work, sized by improvements rather than days. Sources: a profiling pass in the browser (frame
breakdowns, a hitch survey across all six levels), three code audits (rendering, feel/camera, UI/audio), and a
friend's playtest: "too cluttered, nothing is apparent about what's going on."

Status: [x] done, [ ] to do. Ordered by impact within each pillar.

## Already landed (first pass)
- [x] Mid-fight freezes (up to 1.2 s): the hurt blink hid the torch light, the light count changed and every
      material recompiled; warmup compiled the wrong (sRGB) shader variants; Chrome/Metal only finished linking on
      first draw. Worst frame in a level-3 fight: 328 ms -> 27 ms.
- [x] Title screen: hundreds of dropped draws a second (sun/moon/torch shadow maps never drawn). Now 0.
- [x] Aura no longer sits on his back as a flame plume.
- [x] Keyboard play: A/D or arrows turn, W/S forward/backpedal, J/K strike, L/Shift dash (backstep when backing).

## A. Readability: you can tell what is happening from one screenshot
1. [x] Camera framing: pull back and up, smaller shoulder offset, so he sits in the lower third and the fight,
       the hearth and the light's edge are in view. No per-attack zoom pumping.
2. [x] One colour language: the knight is violet, every enemy carries an ember-red rim and bright eyes, the
       hearth is gold, the world is the quiet backdrop.
3. [x] Show the core rule: a soft ring on the ground where the firelight ends (shades rise in the dark beyond it).
4. [x] Telegraphs: a shade winding up to strike flares red so a dodge is readable.
5. [x] Declutter effects: a particle budget (ambient ink mist, sparks, motes), lighter rain that never streaks
       across the camera, no chromatic fringe, lighter grain, bloom only on what is meant to glow.
6. [x] Enemy bars only for shades that matter (hurt, struck, or near him), on whole pixels; damage numbers capped.
7. [x] HUD hierarchy: HUD above world labels, legible small text, toasts that wrap on narrow screens.

## B. Feel: movement, camera, combat
1. [x] Ground snap on small steps (no "air" pose, landing thud and air attacks off every 0.3 m step); land only
       while falling.
2. [x] Smooth vertical follow: step-ups ease instead of popping; the camera holds height through a jump.
3. [x] With the turn keys he stays locked to the camera (no visible lag on every turn); faster swing that ramps.
4. [x] Camera collision: snaps in at once (never inside a wall), eases out after a beat, ignores thin posts,
       three rays, never below the floor.
5. [x] Nothing swallowed: every attack buffers its follow-up, heavy stays heavy, dash buffers; the key that skips
       a card does not also jump or swing.
6. [x] Walls cut his velocity (no running on the spot, no wall lunges).
7. [x] A sidestep: dash with a turn key held and no W/S steps sideways (the shades' wind-ups are meant to be dodged).
8. [x] The camera is not taken away in a fight: reveal shots skip when shades are near, cancel on input, shorter.
9. [x] Pointer lock only on a click (keyboard players keep their cursor); R restarts on a hold, not a tap.
10. [x] 120 Hz smoothness: sword arm and bolts interpolate; particle size uses the real FOV.

## C. Smoothness: steady frame times on ordinary laptops
1. [x] Freezes (above). [x] Outline depth pass culled to occluders. [x] Hearth shadow reach trimmed.
2. [x] Shadow casters that cast nothing visible (floor paving, small props) stop drawing into shadow maps.
3. [ ] Adaptive quality that cuts what actually costs (moon shadow cadence, outline, particles), with hysteresis.
7. [x] Intermittent stalls, researched from source (ANGLE, Chromium, three r186) rather than guessed:
       - Chrome on Metal builds each GPU pipeline on a program's first real draw, per target and blend state, and
         keeps only 128 per context before evicting (ANGLE mtl_pipeline_cache). We had 134-187 programs.
       - Identical rim / shadow shaders were split by a per-material key: one key each now. 67-69 programs on every
         level (was up to 187).
       - Brazier lights are a fixed shared pair, so the light count (and every shader) is the same on every level.
       - Warm-up draws everything for two frames, culling off and hidden meshes shown (never lights), then leaves an
         ordinary frame; PMREM's shader compiled at boot; bolt sprites made up front.
       - Result on a fresh page, all six levels: no freezes, worst single frame 28 ms.
       - Measuring: gl.finish drains the GPU each frame and inflates numbers; compare runs, profile in DevTools.

## D. Correctness ("clearances")
- [x] Enter in a menu could press the next screen's first button too.
- [x] The black fade never showed (screen blend); flashes now respect the Screen flashes setting.
- [x] Saved settings validated; saved progress can no longer crash Continue.
- [x] Keyboard-only: K backs out of menus, J retries / leaves the credits, focused rows scroll into view.
- [x] Held keys cleared on Cmd and on tab switch (macOS sends no keyup).

## How it is verified
- `npm run check` (types + sim unit tests; new tests for every sim change).
- `__game.hitches(level)` under `?debug=1`: frame-time median / p95 / worst over a fight, per level.
  `__game.parts` exposes the live world, views and particle systems for profiling from the console.
- Before/after screenshots of the same fights.
