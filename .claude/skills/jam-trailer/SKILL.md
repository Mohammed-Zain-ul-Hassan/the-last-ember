---
name: jam-trailer
description: Assemble the competition's 3-minute trailer from raw gameplay clips, an optional facecam, a music folder and the theme list. Use when the user says "make the trailer", "edit the gameplay", "cut the video", "trailer v0/v1", or drops clips into trailer/raw. Gameplay-specific variant of the edit-video pipeline; enforces the rubric's 2:00-raw-gameplay rule.
---

# jam-trailer

Judging is trailer-first. Hard rules from the handbook: 3:00 max; >=2:00 is directly screen-recorded gameplay;
<=1:00 stylised editing/graphics, may be spread through the video; the trailer must state how each theme is
incorporated. Delivered as a Google Drive link. Full research: `research/05-trailer.md` if present in the checkout.

## Folder contract
```
trailer/
  raw/            human-played screen recordings + demo-mode captures, named NN_what_vN.mov, never edited in place
  facecam/        optional presenter clips (same timing as a raw clip, or free talking)
  music/          licensed/CC0/own tracks; licence noted in ASSETS.md
  sfx/            whooshes, risers, impacts (game SFX preferred)
  clips.md        one line per raw clip: what it shows, best timestamps, theme tag
  shotlist.json   generated plan (shown to the user before rendering)
  out/
```

## Capture (emphasis: the game records itself; humans add authenticity)
1. Primary: `?demo=1` autoplay with seeded RNG, scripted camera director, HUD toggle, fixed 1920x1080 window. Capture it
   as deterministic frames (`?capture=1` fixed timestep, frames to PNG, ffmpeg at 60 fps) when the game supports it,
   otherwise OBS ScreenCaptureKit 1080p60.
2. Secondary: human-played takes for the 20 s uninterrupted "this is real" climax and any reaction beats. Humans play
   like humans; keep these unedited-speed.
3. Facecam: record a presenter on one side while the game plays (picture-in-picture, <=25% of frame, never over the
   action). Use it for the intro line, theme explanations and a reaction moment. Gameplay must stay visible beside it.
4. Every finished feature gets a 20-40 s clip. No feature is "done" without a clip and a `clips.md` line.

## Procedure
1. Inventory: ffprobe every raw clip (fps, resolution, duration, audio). Normalise to H.264 yuv420p 60 fps CFR 1080p in
   `trailer/work/` (Remotion and ffmpeg trims break on VFR). Never touch `raw/`.
2. Ask the user (one call, <=4 questions): the 3 themes and one literal sentence each on how the game uses them;
   facecam yes/no and where; music track and BPM (or "pick for me"); tone (hype / eerie / funny / cinematic).
3. Write `shotlist.json` using this structure, show it as a table, and WAIT for approval before rendering:
   0:00-0:05 hook = single best gameplay moment, no logo, impact SFX on frame 1; 0:05-0:12 title card with game name,
   <=8-word logline and the 3 theme chips; then four gameplay beats (learn, mastery, escalation with cuts every 2-3 s,
   climax with a 20 s uninterrupted take); after each theme's first on-screen appearance add a 5-6 s explainer card
   plus a lower-third `THEME: <word> - <how>` over live gameplay; 2:30-2:42 aftermath/freeze; 2:42-2:52 theme montage;
   2:52-3:00 end card with name, repo/play link and "Built in 3 days with Claude Code", held 5 s.
4. Script assertions before render: total duration <=180 s; raw gameplay seconds >=120 (count only unobscured,
   unaccelerated or lightly retimed footage, and say how it was counted); no opaque card over gameplay; every theme
   has a callout naming the theme word verbatim; end card dwell >=5 s.
5. Assemble. If `/Users/zain/Videos` exists, reuse its Remotion kit, `music_bed.py` (ducked bed with a planned drop at
   the climax), `audio_master.py` and its qc-review gates instead of rewriting them; otherwise use Remotion with
   `<OffthreadVideo>` plus ffmpeg. Cuts snap to the music's beat grid and accelerate through escalation. Text >=48 px
   at 1080p, <=7 words per line, >=1.5 s dwell, one display font + one UI font, readable with sound off.
6. Preview first: render 960x540, extract a contact sheet (ffmpeg tile) and LOOK at it; check seams, text overlap,
   facecam position, first frame not black. Then render final, loudnorm to -14 LUFS / -1 dBTP, `+faststart`.
7. QC and report: ffprobe the output (duration, 1080p60, A/V present), measure loudness and peak, list each shot's
   source file and timestamps, list music/SFX licences. State plainly that a human watch-through is still required.
8. Delivery: upload to Drive, set "Anyone with the link: Viewer", open in an incognito window to test playback, keep a
   1080p30 backup. Never upload without the user's go-ahead.

## Lessons from the rehearsal (Abyssal Lumen, 2026-10-16: 72 min end to end, 2:40 trailer)
- A proven pipeline exists in `demo-phaser/trailer/` (if present): `scripts/drive.mjs` (sim seeds, real-time
  capture), `scripts/plan.py` (shotlist with rule assertions), `scripts/build.sh preview|final`, Remotion in `src/`.
  Copy and adapt it rather than rebuilding.
- Bot + `?trailer=1` director + seeded runs: simulate ~30 seeds, rank by chain/near-miss/crowd metrics, use the top 2.
- WebCodecs real-time capture in headless Chromium is fast and clean, but it is NOT an OS screen recording. For the
  real submission, screen-record the chosen seeds with the screen free (no fullscreen video, Focus mode on), and
  expect a one-time macOS screen-capture permission prompt that the user must answer.
- No voice track: do not use `music_bed.py` (it ducks under a voice). Duck music from the SFX instead; run
  `audio_master.py --denoise false --sweeten false`.
- Bot runs must not trigger "NEW BEST!" or save scores; check UI banners for overlaps in the contact sheet.

## Timeline
Rough cut v0 by Day 2 night using whatever clips exist; hard feature freeze before the final capture session;
final capture, assemble and export at least 6 hours before the deadline, with 4-6 h buffer for Drive processing.
