"""Pre-grade the loafbrr 1K diffuse maps to the courtyard's cool charcoal palette.

The glTF exporter ignores Hue/Saturation nodes between an image and Base Color, so node-based
tinting never reaches the game. Baking the grade into the PNGs does.

    python scripts/grade-loafbrr-textures.py
"""
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / "vendor" / "kits" / "loafbrr-gothic" / "extracted" / "textures"
OUT = ROOT / "vendor" / "kits" / "loafbrr-gothic" / "graded"

# source -> (saturation, brightness, cool RGB multiplier)
JOBS = {
    "Wall_Brick_A/Wall_Brick_A_Diffuse_1K.png": ("LF_Wall.png", 0.35, 0.58, (0.92, 0.98, 1.08)),
    "Wall_Trim_A/Wall_Trim_A_Diffuse_1K.png": ("LF_Trim.png", 0.30, 0.66, (0.92, 0.98, 1.08)),
    "FloorBricks_A/Floor_Brick_A_Diffuse_1K.png": ("LF_Floor.png", 0.45, 0.85, (0.92, 0.98, 1.06)),
    "roof/Roof_1_Diffuse_1K.png": ("LF_Roof.png", 0.45, 0.55, (0.92, 0.98, 1.06)),
}

OUT.mkdir(parents=True, exist_ok=True)
for src, (dst, sat, bright, tint) in JOBS.items():
    im = Image.open(TEX / src).convert("RGB")
    im = ImageEnhance.Color(im).enhance(sat)
    im = ImageEnhance.Brightness(im).enhance(bright)
    r, g, b = im.split()
    r = r.point(lambda v: min(255, int(v * tint[0])))
    g = g.point(lambda v: min(255, int(v * tint[1])))
    b = b.point(lambda v: min(255, int(v * tint[2])))
    Image.merge("RGB", (r, g, b)).save(OUT / dst, optimize=True)
    print("graded", dst)
