"""
Inventory loafbrr Gothic-Like Structures FBX parts (CC0): tris, bounds, materials.

Run inside Blender (MCP or CLI). Writes docs/review/loafbrr-inventory.json and prints a table.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import bpy

ROOT = Path(r"D:\Projects\the-last-ember")
FBX = ROOT / "vendor" / "kits" / "loafbrr-gothic" / "extracted" / "fbx"
OUT = ROOT / "docs" / "review" / "loafbrr-inventory.json"

WANT = re.compile(
    r"^(GuardRail_|Buttress_|Post_[ABC]_|Floor_6x3|Floor_3x3|Floor_6x6|Ambulatory_(Inner|Outer)_[A-F]_[A-F]\.|"
    r"Ambulatory_Buttress|Ambulatory_(Inner|Outer)_Post|Ambulatory_(Inner|Outer)_Floor|Ambulatory_(Inner|Outer)_Wall_3m|"
    r"Ambulatory_Outer_Ceiling|Ambulatory_Ceiling|Wall_D_|Wall_E_|Wall_F_|Stair_Post|Ceiling_Vaulted_[A-D]\.)"
)


def clear() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for b in list(bpy.data.meshes):
        bpy.data.meshes.remove(b)


rows = []
for path in sorted(FBX.rglob("*.fbx")):
    if not WANT.match(path.name):
        continue
    clear()
    bpy.ops.import_scene.fbx(filepath=str(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        continue
    tris = sum(sum(max(len(p.vertices) - 2, 0) for p in o.data.polygons) for o in meshes)
    bpy.context.view_layer.update()
    xs, ys, zs = [], [], []
    for o in meshes:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    dims = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    mats = sorted({s.material.name for o in meshes for s in o.material_slots if s.material})
    rows.append(
        {
            "file": str(path.relative_to(FBX)).replace("\\", "/"),
            "tris": tris,
            "dims": [round(d, 3) for d in dims],
            "min": [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
            "mats": mats,
            "objs": len(meshes),
        }
    )

OUT.write_text(json.dumps(rows, indent=1), encoding="utf-8")
for r in rows:
    print(f"{r['file']:52s} tris={r['tris']:5d} dims={r['dims']} mats={r['mats']}")
