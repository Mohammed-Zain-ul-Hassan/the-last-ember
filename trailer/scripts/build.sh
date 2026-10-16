#!/usr/bin/env bash
# The Last Ember trailer build (captures in trailer/raw/ from scripts/drive.mjs):
#   scripts/build.sh preview   -> out/preview_540p.mp4 + out/contact_sheet.jpg
#   scripts/build.sh final     -> out/the-last-ember-trailer.mp4 (1080p60 H.264 + AAC, -14 LUFS / -1 dBTP, +faststart)
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=${1:-preview}
PY=/Users/zain/Videos/.venv/bin/python
mkdir -p out work public/clips
python3 scripts/plan.py > work/plan.txt && tail -1 work/plan.txt
for c in $(python3 -c "import json;print(' '.join(sorted({s['src'] for s in json.load(open('shotlist.json'))['shots'] if s.get('src')})))"); do
  [ -e "public/$c" ] || ln "raw/$(basename "$c")" "public/$c"  # hard link: Remotion does not follow symlinks
done
[ -f music/score.wav ] && [ music/score.wav -nt shotlist.json ] || $PY scripts/score.py
# glue + peak control so the -14 LUFS / -1 dBTP master stays linear (the score's booms peak far above its loudness)
ffmpeg -v error -y -i music/score.wav -af "afade=t=in:d=0.02,alimiter=level_in=1:limit=0.5:attack=1:release=60:level=false" -c:a pcm_s16le work/score_glued.wav
# master: measured gain to -14 LUFS, then a 4x-oversampled limiter at -1.5 dBFS so the decoded AAC stays under -1 dBTP
I=$(ffmpeg -v info -i work/score_glued.wav -af ebur128 -f null - 2>&1 | awk '/^ +I:/{print $2}' | tail -1)
G=$(python3 -c "print(round(-14 - ($I), 2))")
ffmpeg -v error -y -i work/score_glued.wav -af "volume=${G}dB,aresample=192000,alimiter=limit=0.6:attack=1:release=80:level=false,aresample=48000" -c:a pcm_s16le work/score_master.wav

if [ "$MODE" = preview ]; then
  caffeinate -is npx remotion render src/index.ts Trailer work/preview_video.mp4 --scale=0.5 --muted --codec=h264 --crf=22 --concurrency=8
  ffmpeg -v error -y -i work/preview_video.mp4 -i work/score_master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/preview_540p.mp4
  ffmpeg -v error -y -i out/preview_540p.mp4 -vf "fps=1/3,scale=320:-1,tile=8x8" -frames:v 1 out/contact_sheet.jpg
  echo "preview: out/preview_540p.mp4, out/contact_sheet.jpg"
else
  caffeinate -is npx remotion render src/index.ts Trailer work/final_video.mp4 --muted --codec=h264 --crf=15 --x264-preset=slow --pixel-format=yuv420p --concurrency=8
  # Remotion's JPEG frames are full-range: convert to broadcast-range yuv420p for every player
  caffeinate -is ffmpeg -v error -y -i work/final_video.mp4 -vf "scale=in_range=pc:out_range=tv:flags=lanczos,format=yuv420p" -color_range tv -c:v libx264 -preset slow -crf 15 -g 120 -an work/final_video_tv.mp4
  ffmpeg -v error -y -i work/final_video_tv.mp4 -i work/score_master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/the-last-ember-trailer.mp4
  ffmpeg -v info -i out/the-last-ember-trailer.mp4 -vn -af ebur128=peak=true -f null - 2>&1 | grep -E "^ +(I|LRA|Peak):"
  echo "final: out/the-last-ember-trailer.mp4"
fi
