"""
Build The Last Ember dusk-city level in Blender (Z-up) and export ember_climb.glb.
Run via Blender MCP execute_blender_code by loading this file, or:
  blender --background --python scripts/build-ember-level.py
"""
import bpy
import math
import os

OUT = r"D:\Projects\the-last-ember\public\models\levels\ember_climb.glb"

# --- clear ---
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for b in list(bpy.data.meshes):
    bpy.data.meshes.remove(b)


def ensure_mat(name, color, emit=0.0, emit_color=None, rough=0.85):
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


# Prefer Poly Haven materials if already imported; else procedural stand-ins.
STONE = bpy.data.materials.get("stone_brick_wall_001") or ensure_mat("StoneProc", (0.12, 0.1, 0.11))
COBBLE = bpy.data.materials.get("cobblestone_floor_08") or ensure_mat("CobbleProc", (0.18, 0.16, 0.15))
ROOF = bpy.data.materials.get("grey_roof_01") or ensure_mat("RoofProc", (0.08, 0.08, 0.09))
WOOD = bpy.data.materials.get("wood_planks") or ensure_mat("WoodProc", (0.2, 0.12, 0.07))
EMBER = ensure_mat("EmberTrim", (0.05, 0.02, 0.01), emit=6.0, emit_color=(1.0, 0.48, 0.18))
GOLD = ensure_mat("GoldTrim", (0.08, 0.06, 0.02), emit=2.5, emit_color=(1.0, 0.82, 0.48))
INK = ensure_mat("InkDark", (0.04, 0.035, 0.05), rough=0.92)


def box(name, loc, scale, mat, coll=False):
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
        obj["collision"] = 1
    return obj


def both(base, loc, scale, mat):
    box("VIS_" + base, loc, scale, mat, False)
    box("COL_" + base, loc, scale, mat, True)


def empty(name, loc):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    o = bpy.context.active_object
    o.name = name
    o.empty_display_size = 0.55
    return o


def trim(name, loc, scale):
    box("VIS_" + name, loc, scale, EMBER, False)


# ===== 1 Courtyard =====
both("CourtFloor", (0, 0, -0.4), (26, 22, 0.8), COBBLE)
both("CourtWall_N", (0, 11.2, 2.2), (26, 0.7, 4.4), STONE)
both("CourtWall_S", (0, -11.2, 2.2), (26, 0.7, 4.4), STONE)
both("CourtWall_W", (-13.2, 0, 2.2), (0.7, 22, 4.4), STONE)
both("CourtWall_E", (13.2, 0, 2.2), (0.7, 22, 4.4), STONE)
both("GatePost_L", (-3.2, 11.2, 1.5), (1.2, 0.8, 3.0), STONE)
both("GatePost_R", (3.2, 11.2, 1.5), (1.2, 0.8, 3.0), STONE)
both("GateBar", (0, 11.2, 1.2), (5.0, 1.0, 0.35), WOOD)
for x in (-8, 8):
    box(f"VIS_Brazier_{x}", (x, -6, 0.6), (0.7, 0.7, 1.2), INK, False)
    trim(f"BrazierGlow_{x}", (x, -6, 1.35), (0.45, 0.45, 0.25))
empty("PlayerSpawn", (0, -6, 0.05))

# ===== 2 Streets =====
both("StreetFloor", (0, 28, -0.35), (14, 30, 0.7), COBBLE)
both("StreetWall_W", (-7.5, 28, 2.5), (1.0, 30, 5.0), STONE)
both("StreetWall_E", (7.5, 28, 2.5), (1.0, 30, 5.0), STONE)
both("House_W", (-12, 22, 3.5), (8, 12, 7), STONE)
both("House_E", (12, 30, 3.5), (8, 14, 7), STONE)
box("VIS_House_W_roof", (-12, 22, 7.4), (8.5, 12.5, 0.4), ROOF, False)
box("VIS_House_E_roof", (12, 30, 7.4), (8.5, 14.5, 0.4), ROOF, False)
both("AlleyFloor", (14, 18, -0.35), (10, 8, 0.7), COBBLE)
both("AlleyStair", (14, 24, 1.0), (4, 3, 2.0), STONE)
trim("StreetTrim", (0, 20, 0.04), (3.5, 0.2, 0.08))
both("StreetToRamp", (0, 40, 0.5), (8, 5, 1.0), STONE)
for i, (x, y) in enumerate([(-3, 26), (3, 32), (-2, 36)]):
    both(f"Crate_{i}", (x, y, 0.55), (1.2, 1.2, 1.1), WOOD)

for i, y in enumerate(range(10, 45, 6)):
    h = 5 + (i % 3) * 2
    both(f"Facade_W_{i}", (-11, y, h / 2), (4, 5, h), STONE)
    box(f"VIS_Facade_W_roof_{i}", (-11, y, h + 0.3), (4.5, 5.5, 0.4), ROOF, False)
    both(f"Facade_E_{i}", (11, y + 2, h / 2 + 0.5), (4, 5, h + 1), STONE)
    box(f"VIS_Facade_E_roof_{i}", (11, y + 2, h + 1.3), (4.5, 5.5, 0.4), ROOF, False)

# ===== 3 Market =====
both("MarketFloor", (0, 52, 2.5), (18, 18, 1.0), COBBLE)
both("MarketRamp", (0, 42, 1.0), (6, 6, 2.0), STONE)
both("MarketWall_N", (0, 61.2, 5.0), (18, 0.8, 5.0), STONE)
both("MarketWall_W", (-9.2, 52, 5.0), (0.8, 18, 5.0), STONE)
both("MarketWall_E", (9.2, 52, 5.0), (0.8, 18, 5.0), STONE)
for i, (x, y) in enumerate([(-5, 48), (5, 48), (-6, 56), (6, 56), (0, 58)]):
    both(f"Stall_{i}", (x, y, 3.7), (2.0, 1.4, 1.4), WOOD)
both("Gallery", (-9.5, 52, 6.5), (2.5, 14, 0.4), WOOD)
trim("GalleryTrim", (-9.5, 52, 6.75), (1.8, 12, 0.08))
for i, (x, y, h) in enumerate([(-14, 52, 8), (14, 52, 9), (-14, 60, 7), (14, 60, 8)]):
    both(f"MarketBldg_{i}", (x, y, h / 2 + 3), (5, 6, h), STONE)
    box(f"VIS_MarketBldg_roof_{i}", (x, y, 3 + h + 0.3), (5.5, 6.5, 0.4), ROOF, False)
empty("Enemy_01", (-3, 52, 3.05))
empty("Enemy_02", (4, 55, 3.05))

# ===== 4 Rooftops =====
both("Roof_A", (8, 58, 7.2), (8, 6, 0.5), ROOF)
both("Roof_B", (10, 65, 7.8), (6, 6, 0.5), ROOF)
both("Roof_C", (6, 72, 8.4), (7, 6, 0.5), ROOF)
both("RoofStep", (9, 61.5, 7.5), (4, 2.5, 0.45), WOOD)
both("Pipe", (4, 72, 8.7), (1.0, 5, 0.5), INK)
both("Roof_D", (0, 78, 8.6), (6, 5, 0.5), ROOF)
for n, loc, sc in [
    ("RoofTrim_A", (8, 58, 7.5), (5, 0.25, 0.08)),
    ("RoofTrim_B", (10, 65, 8.1), (4, 0.25, 0.08)),
    ("RoofTrim_C", (6, 72, 8.7), (4, 0.25, 0.08)),
    ("RoofTrim_D", (0, 78, 8.9), (3.5, 0.25, 0.08)),
]:
    trim(n, loc, sc)
empty("Enemy_03", (6, 72, 8.7))
empty("Enemy_04", (0, 78, 8.9))

# ===== 5 Aqueduct =====
both("AqPier_S", (0, 82, 4.0), (3, 3, 8.0), STONE)
both("AqPier_N", (0, 102, 4.0), (3, 3, 8.0), STONE)
both("AqDeck", (0, 92, 8.8), (5, 22, 0.7), STONE)
trim("AqTrim", (0, 92, 9.2), (2.5, 18, 0.1))
both("ArchL", (-4, 92, 12), (1.5, 2, 6), STONE)
both("ArchR", (4, 92, 12), (1.5, 2, 6), STONE)
box("VIS_ArchTop", (0, 92, 15.5), (9, 2, 1.2), STONE, False)
for y in (86, 92, 98):
    box(f"VIS_Lantern_{y}", (2.2, y, 10.2), (0.35, 0.35, 0.6), INK, False)
    trim(f"LanternGlow_{y}", (2.2, y, 10.55), (0.25, 0.25, 0.2))
both("AqToCrypt", (0, 105, 8.5), (5, 6, 0.6), STONE)
empty("Enemy_05", (0, 92, 9.2))

# ===== 6 Crypt =====
both("CryptEntry", (0, 108, 7.5), (5, 6, 0.6), STONE)
both("CryptCorridor", (0, 114, 6.5), (4, 10, 0.6), STONE)
both("CryptCeil", (0, 114, 9.5), (4.5, 10, 0.5), STONE)
both("CryptWall_W", (-2.5, 114, 8.0), (0.5, 10, 3.0), STONE)
both("CryptWall_E", (2.5, 114, 8.0), (0.5, 10, 3.0), STONE)
both("CryptChamber", (0, 124, 6.5), (10, 10, 0.6), STONE)
both("CryptChamberCeil", (0, 124, 10.5), (10.5, 10.5, 0.5), STONE)
for x in (-3, 3):
    for y in (121, 127):
        both(f"Col_{x}_{y}", (x, y, 8.5), (0.8, 0.8, 3.5), STONE)
box("VIS_RitualRing", (0, 124, 6.85), (3.5, 3.5, 0.1), GOLD, False)
trim("CryptTrim", (0, 124, 6.9), (2.0, 0.2, 0.08))
both("CryptExit", (0, 132, 7.0), (5, 5, 0.6), STONE)
both("CryptToStair", (0, 134, 7.2), (5, 4, 0.6), STONE)
empty("Enemy_06", (0, 124, 6.85))

# ===== 7 Stairs (end ~ y=170, z=22) =====
zy, yy = 7.5, 136
for i in range(14):
    zy += 1.05
    yy += 2.4
    xoff = -3 if i % 2 == 0 else 3
    both(f"Stair_{i}", (xoff, yy, zy - 0.25), (5, 2.6, 0.5), STONE)
    if i % 2 == 0:
        both(f"Landing_{i}", (0, yy + 1.5, zy - 0.2), (8, 2.0, 0.45), STONE)
both("StairToPlaza", (0, 172, 22.0), (8, 6, 0.6), STONE)

# ===== 8 Plaza @ y=175, z=22.5 =====
plaza_z, plaza_y = 22.5, 175
both("PlazaFloor", (0, plaza_y, plaza_z - 0.5), (24, 24, 1.0), COBBLE)
both("PlazaRim_N", (0, plaza_y + 12.2, plaza_z + 0.8), (24, 0.7, 1.6), STONE)
both("PlazaRim_W", (-12.2, plaza_y, plaza_z + 0.8), (0.7, 22, 1.6), STONE)
both("PlazaRim_E", (12.2, plaza_y, plaza_z + 0.8), (0.7, 22, 1.6), STONE)
for i, (x, y) in enumerate([(-7, plaza_y - 4), (7, plaza_y - 4), (-8, plaza_y + 5), (8, plaza_y + 5)]):
    both(f"PlazaCover_{i}", (x, y, plaza_z + 0.7), (2.4, 2.0, 1.4), STONE)
both("Plinth", (0, plaza_y, plaza_z + 0.4), (4, 4, 0.8), STONE)
trim("PlinthGlow", (0, plaza_y, plaza_z + 0.85), (3.6, 3.6, 0.1))
for a in range(16):
    ang = a * math.pi * 2 / 16
    trim(f"PlazaRing_{a}", (math.cos(ang) * 10, plaza_y + math.sin(ang) * 10, plaza_z + 0.05), (0.7, 0.35, 0.1))
both("PlazaApproach", (0, plaza_y - 14, plaza_z - 0.4), (8, 6, 0.8), STONE)

# Hearth landmark behind plaza
both("HearthBase", (0, 195, 8), (10, 10, 16), STONE)
box("VIS_HearthDome", (0, 195, 20), (12, 12, 8), INK, False)
trim("HearthGlow", (0, 195, 18), (6, 6, 1.5))

empty("WifeAnchor", (0, plaza_y, plaza_z + 0.9))
empty("BossArena", (0, plaza_y, plaza_z + 0.05))
empty("WaveSpawn_A", (-9, plaza_y - 6, plaza_z + 0.05))
empty("WaveSpawn_B", (9, plaza_y - 6, plaza_z + 0.05))
empty("WaveSpawn_C", (0, plaza_y + 9, plaza_z + 0.05))

# Terrain fill
both("Terrain_Main", (0, 90, -1.5), (70, 220, 2.0), INK)
both("Terrain_W", (-28, 90, 1.0), (20, 200, 6.0), STONE)
both("Terrain_E", (28, 90, 1.0), (20, 200, 6.0), STONE)

for i, y in enumerate([15, 28, 50, 90, 150]):
    box(f"VIS_Pole_{i}", (-6.5, y, 3), (0.2, 0.2, 6), INK, False)
    box(f"VIS_Banner_{i}", (-5.5, y, 4.5), (1.5, 0.1, 2.2), INK, False)
    box(f"VIS_BannerGlow_{i}", (-5.5, y, 4.5), (0.15, 0.12, 2.0), EMBER, False)

# UV pass (batch)
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
print("BUILT", len(bpy.data.objects), "bytes", os.path.getsize(OUT))
for n in sorted(o.name for o in bpy.data.objects if o.type == "EMPTY"):
    x, y, z = bpy.data.objects[n].location
    print(n, "gltf~", (round(x, 2), round(z, 2), round(-y, 2)))
