#!/usr/bin/env python3
"""Shot audit before a render: every shot with footage, as a row of frames sampled across its range (labelled with its
id and source times), so a camera clip, a menu, a cutscene inside "gameplay" or a black frame is seen before it ships.

  /Users/zain/Videos/.venv/bin/python trailer/scripts/vet.py   ->  trailer/out/v2_shot_audit.jpg
(reads trailer/shotlist.json and the normalised takes in trailer/work/<take>.cfr.mp4)
"""
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
plan = json.loads((ROOT / "shotlist.json").read_text())
N, W, H = 6, 256, 144  # frames per shot, thumbnail size
rows = []
tmp = Path(tempfile.mkdtemp())
for s in plan["shots"]:
    if not s.get("src") or s.get("missing"):
        continue
    take = Path(s["src"]).stem
    src = ROOT / "work" / f"{take}.cfr.mp4"
    row = Image.new("RGB", (W * N + 300, H), (12, 10, 16))
    for k in range(N):
        t = s["in"] + 0.05 + (s["dur"] - 0.1) * k / (N - 1)
        f = tmp / f"{s['id']}_{k}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(src), "-frames:v", "1", "-vf", f"scale={W}:{H}", str(f)], check=True)
        row.paste(Image.open(f), (300 + W * k, 0))
    d = ImageDraw.Draw(row)
    m, sec = divmod(s["start"], 60)
    d.text((8, 10), f"{s['id']}  ({s['kind']})", fill=(255, 210, 150))
    d.text((8, 34), f"at {int(m)}:{sec:05.2f}  {s['dur']:.1f} s", fill=(220, 220, 220))
    d.text((8, 58), f"{take} {s['in']:.2f}-{s['in'] + s['dur']:.2f}", fill=(180, 180, 200))
    d.text((8, 82), s.get("anchor", ""), fill=(150, 150, 170))
    rows.append(row)
sheet = Image.new("RGB", (rows[0].width, H * len(rows)), (0, 0, 0))
for i, r in enumerate(rows):
    sheet.paste(r, (0, i * H))
out = ROOT / "out" / "v2_shot_audit.jpg"
sheet.save(out, quality=82)
print(f"{out} ({len(rows)} shots)")
