"""Lay out selected loafbrr FBX parts in a row for a visual contact sheet (Blender, run via MCP).

Set SHEET_PARTS (list of fbx-relative paths) before exec. Optional: SHEET_GAP, SHEET_Y.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

import bpy

sys.path.insert(0, r"D:\Projects\the-last-ember\scripts")
import loafbrr_kit as lf  # noqa: E402

importlib.reload(lf)

SHEET = globals().get("SHEET_PARTS", [])
GAP = globals().get("SHEET_GAP", 2.0)
Y_ROW = globals().get("SHEET_Y", 0.0)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for b in list(bpy.data.meshes):
    bpy.data.meshes.remove(b)

x = 0.0
for rel in SHEET:
    o = lf.import_part(rel)
    mn, mx = lf.bounds(o)
    o.location.x += x - mn.x
    o.location.y += Y_ROW - 0.5 * (mn.y + mx.y)
    o.location.z += -mn.z
    x += (mx.x - mn.x) + GAP
    print(f"{rel:48s} dims={tuple(round(v, 2) for v in o.dimensions)} tris={lf.tri_count(o)}")

OUT_PNG = globals().get("SHEET_PNG")
if OUT_PNG:
    # Workbench render (textured) to a file the repo can keep.
    import math

    from mathutils import Vector

    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_WORKBENCH"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"
    sc.render.resolution_x, sc.render.resolution_y = 1800, 520
    sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new("W")
    sc.world.color = (0.18, 0.19, 0.22)
    cam_d = bpy.data.cameras.new("SheetCam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = x * 0.9
    cam = bpy.data.objects.new("SheetCam", cam_d)
    sc.collection.objects.link(cam)
    mid = Vector((x * 0.5, Y_ROW, 2.6))
    cam.location = mid + Vector((0.0, -60.0, 14.0))
    cam.rotation_euler = (math.radians(77), 0, 0)
    sc.camera = cam
    sc.render.filepath = OUT_PNG
    bpy.ops.render.render(write_still=True)
    print("WROTE", OUT_PNG)
