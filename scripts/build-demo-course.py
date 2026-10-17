"""
Build demo_course.glb — ash training yard matching DEMO_METRICS / DemoCourse.ts.
Blender Z-up, Y-forward. Export Y-up GLB for Three.js (x, y_up, z) = (bx, bz, -by).

  blender --background --python scripts/build-demo-course.py
  # or execute via Blender MCP
"""
import bpy
import math
import os

OUT = r"D:\Projects\the-last-ember\public\models\levels\demo_course.glb"

# Frozen metrics (docs/level-pipeline.md)
W = 8.0
JUMP_GAP = 3.2
DASH_GAP = 6.5
HOP = 1.0
SLIDE_RUN = 12.0
SLIDE_CEIL = 2.0
SLIDE_LEN = 7.0
RISER = 0.35
TREAD = 1.35
COMBO_JUMP = 2.8
COMBO_DASH = 6.0

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for b in list(bpy.data.meshes):
    bpy.data.meshes.remove(b)


def ensure_mat(name, color, emit=0.0, emit_color=None, rough=0.88):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if emit > 0:
        ec = emit_color or color
        bsdf.inputs["Emission Color"].default_value = (*ec, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


STONE = bpy.data.materials.get("stone_brick_wall_001") or ensure_mat("DemoStone", (0.09, 0.08, 0.09))
COBBLE = bpy.data.materials.get("cobblestone_floor_08") or ensure_mat("DemoCobble", (0.12, 0.11, 0.12))
INK = ensure_mat("DemoInk", (0.04, 0.035, 0.045), rough=0.92)
GREEN = ensure_mat("ChronoGreen", (0.04, 0.08, 0.05), emit=4.0, emit_color=(0.235, 1.0, 0.416))
EMBER = ensure_mat("DemoEmber", (0.05, 0.02, 0.01), emit=5.0, emit_color=(1.0, 0.48, 0.18))


def box(name, loc, scale, mat, coll=False):
    """loc/scale in Blender (x, y_forward, z_up). scale = full extents."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.clear()
    if mat:
        obj.data.materials.append(mat)
    if coll:
        obj.hide_render = True
    return obj


def both(base, loc, scale, mat):
    box("VIS_" + base, loc, scale, mat, False)
    box("COL_" + base, loc, scale, mat, True)


def empty(name, loc):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    o = bpy.context.active_object
    o.name = name
    o.empty_display_size = 0.5
    return o


def t_from_b(bx, by, bz):
    """Blender → Three.js approximate for logging."""
    return (round(bx, 2), round(bz, 2), round(-by, 2))


def pad(name, z0, z1, top_y, mat):
    """Three.js z0..z1 (z0 > z1), floor top at top_y. Blender y = -z."""
    d = abs(z0 - z1)
    z = (z0 + z1) / 2
    loc = (0, -z, top_y - 0.5)
    scale = (W, d, 1.0)
    both(name, loc, scale, mat)


# --- Band A top y=0 ---
pad("Walk", 28, 18, 0, COBBLE)
pad("JumpTake", 18, 15.5, 0, COBBLE)
jump_far = 15.5 - JUMP_GAP
pad("JumpLand", jump_far, jump_far - 4, 0, COBBLE)

dash_take0 = jump_far - 4
dash_take1 = dash_take0 - 3
pad("DashTake", dash_take0, dash_take1, 0, STONE)
dash_land0 = dash_take1 - DASH_GAP
pad("DashLand", dash_land0, dash_land0 - 5, 0, COBBLE)
# Green edge strips on dash takeoff
box("VIS_DashTrim", (0, -(dash_take0 + dash_take1) / 2, 0.05), (W - 0.4, abs(dash_take0 - dash_take1) - 0.2, 0.08), GREEN, False)

# Hop band top y=1
hop_z0 = dash_land0 - 5
hop_z1 = hop_z0 - 10
pad("Hop", hop_z0 - 0.8, hop_z1, HOP, STONE)

run0 = hop_z1
run1 = run0 - SLIDE_RUN
pad("Runway", run0, run1, HOP, COBBLE)
tun_z = run1 - SLIDE_LEN / 2
# Ceiling + side walls
both("SlideCeil", (0, -tun_z, HOP + SLIDE_CEIL + 0.2), (W, SLIDE_LEN, 0.4), GREEN)
both("SlideWall_L", (-W / 2 + 0.2, -tun_z, HOP + SLIDE_CEIL / 2), (0.4, SLIDE_LEN, SLIDE_CEIL), STONE)
both("SlideWall_R", (W / 2 - 0.2, -tun_z, HOP + SLIDE_CEIL / 2), (0.4, SLIDE_LEN, SLIDE_CEIL), STONE)

after_slide = run1 - SLIDE_LEN
pad("StillPad", after_slide, after_slide - 8, HOP, STONE)

stair_z0 = after_slide - 8
for i in range(6):
    y_min = HOP + i * RISER
    z_c = stair_z0 - i * TREAD
    both(f"Stair_{i}", (0, -z_c, y_min + RISER / 2), (W - 1, TREAD - 0.1, RISER), STONE)

finish_top = HOP + 6 * RISER
stair_end = stair_z0 - 6 * TREAD

combo0 = stair_end - 1
pad("ComboTake", stair_end, combo0 - 3, finish_top, STONE)
combo_jump_far = combo0 - 3 - COMBO_JUMP
pad("ComboMid", combo_jump_far, combo_jump_far - 2.5, finish_top, COBBLE)
combo_dash_far = combo_jump_far - 2.5 - COMBO_DASH
pad("ComboFar", combo_dash_far, combo_dash_far - 6, finish_top, STONE)
box("VIS_ComboTrim", (0, -((combo_dash_far + combo_dash_far - 6) / 2), finish_top + 0.05), (W - 0.5, 5.5, 0.08), GREEN, False)

fin0 = combo_dash_far - 6
pad("Finish", fin0, fin0 - 10, finish_top, COBBLE)
box("VIS_FinishEmber", (0, -((fin0 + fin0 - 10) / 2), finish_top + 0.06), (4, 6, 0.1), EMBER, False)

# Rails
z_mid = (28 + (fin0 - 10)) / 2
z_len = 28 - (fin0 - 10) + 4
for side, sx in (("L", -W / 2 - 0.25), ("R", W / 2 + 0.25)):
    both(f"Rail_{side}", (sx, -z_mid, 0.75), (0.5, z_len, 1.5), STONE)

# Pit ink under gaps (visual only)
box("VIS_Pit", (0, -5, -1.2), (W + 4, 40, 0.4), INK, False)

# Empties (Blender y = -three.z, z = three.y)
empty("PlayerSpawn", (0, -26, 0.05))
empty("Enemy_Still", (0, -(after_slide - 4), HOP))
empty("Enemy_Combo", (0, -(combo_dash_far - 3), finish_top))
# LevelLoader expects Enemy_* → enemies[]; still + combo order
# Rename for loader:
bpy.data.objects["Enemy_Still"].name = "Enemy_01"
bpy.data.objects["Enemy_Combo"].name = "Enemy_02"
empty("WifeAnchor", (0, 80, -50))

for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.2217, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_extras=True,
    export_yup=True,
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_lights=False,
    export_cameras=False,
)
print("DEMO BUILT", OUT, "bytes", os.path.getsize(OUT))
for n in sorted(o.name for o in bpy.data.objects if o.type == "EMPTY"):
    x, y, z = bpy.data.objects[n].location
    print(n, "three~", t_from_b(x, y, z))
