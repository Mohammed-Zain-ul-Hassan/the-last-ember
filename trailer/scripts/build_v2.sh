#!/usr/bin/env bash
# The Last Ember trailer v2 (both acts). Captures: scripts/capture-v2.mjs -> raw/<take>.mp4 + raw/<take>-moments.json.
#   scripts/build_v2.sh preview   -> out/v2_preview_540p.mp4 + out/v2_contact_sheet.jpg   (works with no footage: slates)
#   scripts/build_v2.sh final     -> out/the-last-ember-trailer-v2.mp4 (1080p60 H.264 + AAC, -14 LUFS / -1 dBTP)
# Sound: the game's own audio (from the screen recordings, per-shot volume in the shotlist) over the original score,
# the score ducked under it (sidechain: 10 ms attack, 400 ms release), then mastered as v1.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=${1:-preview}
PY=/Users/zain/Videos/.venv/bin/python
mkdir -p out work public/clips
python3 scripts/plan_v2.py > work/plan_v2.txt && tail -4 work/plan_v2.txt
# captures in (hard links: Remotion does not follow symlinks); a take not captured yet renders as a slate
for c in $(python3 -c "import json;print(' '.join(sorted({s['src'] for s in json.load(open('shotlist.json'))['shots'] if s.get('src') and not s.get('missing')})))"); do
  # tab recordings are VFR, and Chrome's sharing bar shortens the page (1920x1004): crop to 16:9 (never stretch),
  # then 1080p60 CFR H.264 + AAC 48 kHz (trims and Remotion need CFR)
  n=$(basename "$c" .mp4)
  if [ ! -e "work/$n.cfr.mp4" ]; then
    echo "normalising $n"
    caffeinate -is ffmpeg -v error -y -i "raw/$n.mp4" -vf "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1920:1080:flags=lanczos,fps=60,format=yuv420p" -c:v libx264 -preset veryfast -crf 14 -c:a aac -ar 48000 -b:a 256k "work/$n.tmp.mp4"
    mv "work/$n.tmp.mp4" "work/$n.cfr.mp4"  # (written under another name first: a killed run never leaves half a file)
  fi
  [ -e "public/$c" ] || ln "work/$n.cfr.mp4" "public/$c"
done
[ -f music/score_v2.wav ] && [ music/score_v2.wav -nt shotlist.json ] || $PY scripts/score_v2.py

if [ "$MODE" = preview ]; then SCALE="--scale=0.5 --crf=22"; OUT=work/v2_preview_video.mp4; else SCALE="--crf=15 --x264-preset=slow --pixel-format=yuv420p"; OUT=work/v2_final_video.mp4; fi
caffeinate -is npx remotion render src/index.ts Trailer "$OUT" --codec=h264 $SCALE --concurrency=8

# the mix: game audio (if the render has any) over the score, the score ducked under it
ffmpeg -v error -y -i music/score_v2.wav -af "afade=t=in:d=0.02" -ar 48000 -ac 2 -c:a pcm_s16le work/v2_score.wav
if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$OUT" | grep -q .; then
  ffmpeg -v error -y -i "$OUT" -vn -ar 48000 -ac 2 -c:a pcm_s16le work/v2_game.wav
  ffmpeg -v error -y -i work/v2_score.wav -i work/v2_game.wav -filter_complex \
    "[1:a]asplit=2[key][game];[0:a][key]sidechaincompress=threshold=0.03:ratio=4:attack=10:release=400:makeup=1[duck];[duck][game]amix=inputs=2:normalize=0:weights=1 0.9[m]" \
    -map "[m]" -c:a pcm_s16le work/v2_mix.wav
else
  cp work/v2_score.wav work/v2_mix.wav  # nothing captured yet: the score alone
fi
# master: a 30 Hz high-pass (the booms' infrasonic tail made the AAC encoder overshoot to -0.2 dBTP), glue,
# measured gain to -14 LUFS, a 4x-oversampled limiter so the AAC stays under -1 dBTP
ffmpeg -v error -y -i work/v2_mix.wav -af "highpass=f=30:poles=2,alimiter=level_in=1:limit=0.5:attack=1:release=60:level=false" -c:a pcm_s16le work/v2_glued.wav
I=$(ffmpeg -v info -i work/v2_glued.wav -af ebur128 -f null - 2>&1 | awk '/^ +I:/{print $2}' | tail -1)
G=$(python3 -c "print(round(-14 - ($I), 2))")
ffmpeg -v error -y -i work/v2_glued.wav -af "volume=${G}dB,aresample=192000,alimiter=limit=0.6:attack=1:release=80:level=false,aresample=48000" -c:a pcm_s16le work/v2_master.wav

if [ "$MODE" = preview ]; then
  ffmpeg -v error -y -i "$OUT" -i work/v2_master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/v2_preview_540p.mp4
  ffmpeg -v error -y -i out/v2_preview_540p.mp4 -vf "fps=1/3,scale=320:-1,tile=8x8" -frames:v 1 out/v2_contact_sheet.jpg
  echo "preview: out/v2_preview_540p.mp4, out/v2_contact_sheet.jpg"
else
  caffeinate -is ffmpeg -v error -y -i "$OUT" -vf "scale=in_range=pc:out_range=tv:flags=lanczos,format=yuv420p" -color_range tv -c:v libx264 -preset slow -crf 15 -g 120 -an work/v2_final_tv.mp4
  ffmpeg -v error -y -i work/v2_final_tv.mp4 -i work/v2_master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/the-last-ember-trailer-v2.mp4
  ffmpeg -v info -i out/the-last-ember-trailer-v2.mp4 -vn -af ebur128=peak=true -f null - 2>&1 | grep -E "^ +(I|LRA|Peak):"
  echo "final: out/the-last-ember-trailer-v2.mp4"
fi
