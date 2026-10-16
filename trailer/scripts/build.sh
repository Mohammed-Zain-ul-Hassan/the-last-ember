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

if [ "$MODE" = preview ]; then
  caffeinate -is npx remotion render src/index.ts Trailer work/preview_video.mp4 --scale=0.5 --muted --codec=h264 --crf=22 --concurrency=8
  ffmpeg -v error -y -i work/preview_video.mp4 -i music/score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/preview_540p.mp4
  ffmpeg -v error -y -i out/preview_540p.mp4 -vf "fps=1/3,scale=320:-1,tile=8x8" -frames:v 1 out/contact_sheet.jpg
  echo "preview: out/preview_540p.mp4, out/contact_sheet.jpg"
else
  caffeinate -is npx remotion render src/index.ts Trailer work/final_video.mp4 --muted --codec=h264 --crf=15 --x264-preset=slow --pixel-format=yuv420p --concurrency=8
  # Remotion's JPEG frames are full-range: convert to broadcast-range yuv420p for every player
  caffeinate -is ffmpeg -v error -y -i work/final_video.mp4 -vf "scale=in_range=pc:out_range=tv:flags=lanczos,format=yuv420p" -color_range tv -c:v libx264 -preset slow -crf 15 -g 120 -an work/final_video_tv.mp4
  ffmpeg -v error -y -i work/final_video_tv.mp4 -i music/score.wav -map 0:v -map 1:a -c:v copy -c:a pcm_s16le -shortest work/final_premaster.mov
  $PY /Users/zain/Videos/scripts/audio_master.py work/final_premaster.mov --out work/final_mastered.mp4 --lufs -14 --tp -1 --denoise false --sweeten false
  ffmpeg -v error -y -i work/final_mastered.mp4 -c copy -movflags +faststart out/the-last-ember-trailer.mp4
  echo "final: out/the-last-ember-trailer.mp4"
fi
