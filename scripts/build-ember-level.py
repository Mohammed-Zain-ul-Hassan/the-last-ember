"""
Build ember_climb.glb — Market Ash bounded RING district (level_design.md §8).

Blender Z-up, Y-forward. Export Y-up GLB for Three.js.

Ring (~60 m): hub → walled bowl → west alley / east roof / undercroft → north court
→ hearth plaza. No linear spine. Stair AABBs never overlap roof walk pads.
"""
import bpy
import math
import os

OUT = r"D:\Projects\the-last-ember\public\models\levels\ember_climb.glb"

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


def pick(*names, fallback_name, fallback_color, rough=0.85):
    for n in names:
        m = bpy.data.materials.get(n)
        if m:
            return m
    return ensure_mat(fallback_name, fallback_color, rough=rough)


STONE = pick(
    "stone_brick_wall_001", "stone_brick_wall_001.001", "medieval_blocks_06",
    fallback_name="StoneProc", fallback_color=(0.22, 0.2, 0.19),
)
BRICK = pick(
    "brick_wall_02", "brick_wall_13", "brick_wall_11",
    fallback_name="BrickProc", fallback_color=(0.45, 0.18, 0.12),
)
COBBLE = pick(
    "cobblestone_floor_03", "cobblestone_floor_03.001", "cobblestone_floor_08",
    fallback_name="CobbleProc", fallback_color=(0.28, 0.26, 0.24),
)
ROOF = pick(
    "roof_slates_02", "grey_roof_01", "grey_roof_tiles",
    fallback_name="RoofProc", fallback_color=(0.14, 0.16, 0.18),
)
WOOD = pick(
    "weathered_planks", "wood_plank_wall", "raw_plank_wall",
    fallback_name="WoodProc", fallback_color=(0.32, 0.2, 0.1),
)
BLUEWOOD = pick(
    "blue_painted_planks",
    fallback_name="BlueWoodProc", fallback_color=(0.15, 0.25, 0.45),
)
MOSS = pick(
    "wooden_rough_planks", "forest_leaves_03", "grass",
    fallback_name="MossProc", fallback_color=(0.12, 0.22, 0.1),
)
PLASTER = pick(
    "plastered_wall_05", "plastered_wall_02", "plastered_wall_04",
    fallback_name="PlasterProc", fallback_color=(0.55, 0.52, 0.48),
)
COPPER = pick(
    "green_metal_rust", "rusty_metal_05", "metal_plate_02",
    fallback_name="CopperProc", fallback_color=(0.25, 0.35, 0.32), rough=0.55,
)

EMBER = ensure_mat("EmberTrim", (0.05, 0.02, 0.01), emit=5.0, emit_color=(1.0, 0.48, 0.18))
GOLD = ensure_mat("GoldTrim", (0.08, 0.06, 0.02), emit=2.2, emit_color=(1.0, 0.82, 0.48))
INK = ensure_mat("InkDark", (0.04, 0.035, 0.05), rough=0.92)
TEAL = ensure_mat("TealAccent", (0.04, 0.1, 0.12), emit=2.4, emit_color=(0.25, 0.75, 0.7))
VIOLET = ensure_mat("VioletAccent", (0.08, 0.04, 0.14), emit=2.8, emit_color=(0.55, 0.35, 0.95))
BONE = ensure_mat("BoneLight", (0.55, 0.5, 0.42), emit=1.2, emit_color=(0.9, 0.85, 0.75))
CHRONO = ensure_mat("ChronoGreen", (0.04, 0.08, 0.05), emit=3.5, emit_color=(0.235, 1.0, 0.416))
SLATE = ensure_mat("SlateBlue", (0.12, 0.16, 0.22), rough=0.8)


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


def trim(name, loc, scale, mat=None):
    box("VIS_" + name, loc, scale, mat or EMBER, False)


def stairs_y(prefix, x, y0, z0, y1, rise, steps, width=3.0, mat=STONE):
    """Stairs along +Y. |riser| ≤0.35; tread from run length. rise may be negative (down)."""
    run = y1 - y0
    raw = rise / max(steps, 1)
    riser = max(-0.35, min(0.35, raw))
    # If clamped, stretch tread count conceptually via riser*steps ≈ rise
    tread = run / max(steps, 1)
    for i in range(steps):
        y = y0 + (i + 0.5) * tread
        z = z0 + (i + 0.5) * riser
        both(f"{prefix}_{i}", (x, y, z), (width, max(abs(tread) * 0.92, 0.55), abs(riser)), mat)


def stairs_x(prefix, x0, y, z0, x1, rise, steps, depth=3.0, mat=STONE):
    """Stairs along +X (or −X)."""
    run = x1 - x0
    riser = min(0.35, rise / max(steps, 1))
    tread = abs(run) / max(steps, 1)
    sign = 1 if run >= 0 else -1
    for i in range(steps):
        x = x0 + sign * (i + 0.5) * tread
        z = z0 + (i + 0.5) * riser
        both(f"{prefix}_{i}", (x, y, z), (max(tread * 0.92, 0.55), depth, riser), mat)


# =====================================================================
# 1) HUB — enclosed court, two ways into bowl
# =====================================================================
both("HubFloor", (0, 0, -0.35), (16, 14, 0.7), COBBLE)
both("HubWall_S", (0, -7.2, 2.5), (16, 0.6, 5.0), STONE)
both("HubWall_W", (-8.2, 0, 2.5), (0.6, 14, 5.0), BRICK)
both("HubWall_E", (8.2, 0, 2.5), (0.6, 14, 5.0), PLASTER)
# North wall with gate gap (open |x|<3)
both("HubWall_N_L", (-5.5, 7.2, 2.5), (5, 0.6, 5.0), STONE)
both("HubWall_N_R", (5.5, 7.2, 2.5), (5, 0.6, 5.0), STONE)
both("HubGateLint", (0, 7.2, 4.6), (6.5, 0.7, 0.8), WOOD)
trim("HubTeal", (0, 1, 0.05), (4, 0.15, 0.06), TEAL)
for x in (-5, 5):
    box(f"VIS_HubBrazier_{x}", (x, -4, 0.5), (0.55, 0.55, 1.0), INK, False)
    trim(f"HubGlow_{x}", (x, -4, 1.1), (0.35, 0.35, 0.2))
empty("PlayerSpawn", (0, -5, 0.05))
empty("Enemy_01", (-3, 2, 0.05))
empty("Enemy_02", (3, 3, 0.05))

# Short enclosed approach corridor (canyon, not open field)
both("ApproachFloor", (0, 12, 0.0), (7, 6, 0.6), COBBLE)
both("ApproachWall_W", (-3.8, 12, 2.4), (0.5, 6, 4.8), BRICK)
both("ApproachWall_E", (3.8, 12, 2.4), (0.5, 6, 4.8), PLASTER)
trim("ApproachViolet", (0, 12, 0.4), (4, 0.15, 0.06), VIOLET)

# Route B: west lean-to climb → west balcony of bowl
both("LeanFloor", (-11, 8, 0.0), (5, 8, 0.5), WOOD)
both("LeanWall_W", (-13.6, 8, 2.2), (0.5, 8, 4.4), BRICK)
stairs_y("LeanStairs", -11, 4, 0.2, 14, 3.8, 12, width=2.8, mat=WOOD)
both("LeanLanding", (-11, 16, 4.0), (4, 3, 0.4), WOOD)
trim("LeanChrono", (-11, 12, 2.0), (0.2, 4, 0.08), CHRONO)

# =====================================================================
# 2) MARKET BOWL — walled arena (~16×14), gated exits only
# =====================================================================
bowl_y, bowl_z = 26, 0.5
both("BowlFloor", (0, bowl_y, bowl_z - 0.35), (16, 14, 0.7), COBBLE)
# Four walls with gate gaps
both("BowlWall_S_L", (-5.5, bowl_y - 7.2, 2.8), (5, 0.55, 5.0), STONE)
both("BowlWall_S_R", (5.5, bowl_y - 7.2, 2.8), (5, 0.55, 5.0), STONE)
both("BowlWall_N_L", (-5.5, bowl_y + 7.2, 2.8), (5, 0.55, 5.0), STONE)
both("BowlWall_N_R", (5.5, bowl_y + 7.2, 2.8), (5, 0.55, 5.0), STONE)
both("BowlWall_W_S", (-8.2, bowl_y - 3.5, 2.8), (0.55, 6, 5.0), BRICK)
both("BowlWall_W_N", (-8.2, bowl_y + 3.5, 2.8), (0.55, 6, 5.0), BRICK)
both("BowlWall_E_S", (8.2, bowl_y - 3.5, 2.8), (0.55, 6, 5.0), PLASTER)
both("BowlWall_E_N", (8.2, bowl_y + 3.5, 2.8), (0.55, 6, 5.0), PLASTER)
both("BowlLint_S", (0, bowl_y - 7.2, 4.8), (6, 0.6, 0.7), WOOD)
both("BowlLint_N", (0, bowl_y + 7.2, 4.8), (6, 0.6, 0.7), WOOD)
both("BowlLint_W", (-8.2, bowl_y, 4.8), (0.6, 5, 0.7), WOOD)
both("BowlLint_E", (8.2, bowl_y, 4.8), (0.6, 5, 0.7), WOOD)

# Cover stalls (kite)
for i, (x, y) in enumerate([(-4, 22), (4, 22), (-5, 28), (5, 28), (0, 30)]):
    both(f"BowlStall_{i}", (x, y, 1.5), (1.8, 1.3, 1.4), WOOD)
    trim(f"BowlStallTrim_{i}", (x, y, 2.3), (1.1, 0.1, 0.05), TEAL if i % 2 == 0 else VIOLET)
both("BowlCover_A", (-5.5, 24, 1.3), (1.6, 2.0, 1.6), STONE)
both("BowlCover_B", (5.5, 29, 1.3), (1.6, 2.0, 1.6), STONE)

# Interior balconies (statics) — west linked from lean-to
both("Balcony_W", (-6.5, 26, 4.2), (2.5, 6, 0.4), STONE)
both("BalconyRail_W", (-5.4, 26, 4.85), (0.25, 5.5, 0.85), BLUEWOOD)
both("Balcony_E", (6.5, 26, 4.2), (2.5, 6, 0.4), STONE)
both("BalconyRail_E", (5.4, 26, 4.85), (0.25, 5.5, 0.85), BLUEWOOD)
# Link lean landing → west balcony
both("LeanToBal", (-9, 18, 4.0), (3, 4, 0.4), WOOD)

empty("Enemy_03", (-3, 23, 0.95))
empty("Enemy_04", (3, 25, 0.95))
empty("Enemy_05", (0, 29, 0.95))
empty("Enemy_06", (-2, 27, 0.95))
empty("Enemy_07", (-6.5, 26, 4.55))
empty("Enemy_08", (6.5, 28, 4.55))

# Building shells outside walls (canyon massing)
for i, (x, y, h, mat) in enumerate([
    (-13, 22, 6.5, BRICK), (13, 22, 7, PLASTER),
    (-13, 30, 6, STONE), (13, 30, 6.5, BRICK),
]):
    both(f"Shell_{i}", (x, y, h / 2 + 0.5), (4.5, 5, h), mat)
    box(f"VIS_ShellRoof_{i}", (x, y, 0.5 + h + 0.2), (5, 5.5, 0.35), ROOF if i % 2 == 0 else COPPER, False)
    box(f"VIS_ShellMoss_{i}", (x - 1, y, 2.5), (1, 2, 0.25), MOSS, False)

# =====================================================================
# 3) GALLERY NEST — stairs INSIDE west half of bowl (x≈-3), clear of east roofs
# =====================================================================
gal_z = 5.0
# Gallery on north rim looking south into bowl
both("GalleryFloor", (0, 34.5, gal_z), (12, 3.5, 0.4), WOOD)
both("GalleryRail", (0, 33.0, gal_z + 0.5), (10, 0.28, 0.85), BLUEWOOD)
box("VIS_GalleryNotch", (0, 33.0, gal_z + 0.65), (3.5, 0.12, 0.06), CHRONO, False)
# Stairs along west side of bowl floor → gallery (x=-4, away from east tower/roofs)
stairs_y("GalStairs", -4, 28, bowl_z + 0.1, 34, gal_z - bowl_z, 14, width=2.6, mat=STONE)
both("GalLink_W", (-6, 33, gal_z), (3, 2.5, 0.35), STONE)

# =====================================================================
# 4) EAST TOWER + NEST + BYPASS — stair XY never overlaps roof pads
#    Tower climb at x=16, y=20→32. Nest at x=10,y=34. Bypass at x=22.
# =====================================================================
nest_z = 8.0
# Ground east pocket outside bowl east gate
both("EastPocket", (12, 26, 0.1), (5, 8, 0.55), COBBLE)
both("EastPocketWall_E", (14.8, 26, 2.6), (0.5, 8, 5.0), PLASTER)
both("EastPocketWall_S", (12, 21.5, 2.6), (5, 0.5, 5.0), STONE)

# Tower stairs: x=16 only, y=20→31 — landing at (16, 32)
stairs_y("TowerStairs", 16, 20, 0.3, 31.5, nest_z - 0.3, 22, width=2.8, mat=STONE)
both("TowerLanding", (16, 32.5, nest_z), (3.5, 2.5, 0.4), STONE)
trim("TowerChrono", (16, 26, 4), (0.15, 6, 0.08), CHRONO)

# Bridge WEST from landing to nest (y=34 band) — no stair under nest
both("NestBridge", (13, 34, nest_z), (4, 2.2, 0.35), WOOD)
both("NestPad", (9, 34, nest_z), (4, 3.5, 0.4), ROOF)
both("NestParapet", (9, 32.4, nest_z + 0.5), (3.5, 0.3, 0.9), STONE)
trim("NestTeal", (9, 34, nest_z + 0.25), (2.5, 0.15, 0.06), TEAL)
empty("Enemy_09", (9, 34.5, nest_z + 0.35))

# Bypass pads along OUTER east wall (x=22) — clear of tower x=16
both("Bypass_A", (22, 34, nest_z), (3.5, 3.5, 0.35), ROOF)
# hop gap ~2.8 m clear between A and B
both("Bypass_B", (22, 42, nest_z + 0.2), (3.5, 3.5, 0.35), COPPER)
both("Bypass_C", (22, 50, nest_z + 0.4), (3.5, 4, 0.35), ROOF)
box("VIS_BypassChrono", (22, 38, nest_z + 0.5), (2, 0.2, 0.06), CHRONO, False)
# Link landing → Bypass_A (east from tower, same height, no stair under)
both("BypassLink", (19.5, 33, nest_z), (3, 2.0, 0.35), WOOD)

# Drop from Bypass_C into north court (pads clear of tower stairs at x=16)
both("BypassToDrop", (18, 50, nest_z + 0.4), (4, 3, 0.35), ROOF)
stairs_y("RoofDropStairs", 14, 50, nest_z + 0.4, 54, -(nest_z + 0.4 - 1.2), 18, width=3.0, mat=STONE)
both("RoofDropLand", (14, 54.5, 1.2), (4, 2.5, 0.4), STONE)

# =====================================================================
# 5) WEST ALLEY — canyon street to north / plaza
# =====================================================================
both("WestAlleyFloor", (-14, 30, 0.1), (6, 22, 0.55), COBBLE)
both("WestAlleyWall_W", (-17.2, 30, 2.8), (0.55, 22, 5.5), BRICK)
both("WestAlleyWall_E", (-10.8, 30, 2.8), (0.55, 14, 5.5), STONE)  # gap near bowl gate
# Alley continues north then doglegs toward plaza
both("WestAlleyN", (-14, 48, 0.4), (6, 10, 0.55), COBBLE)
both("WestAlleyWall_WN", (-17.2, 48, 3.0), (0.55, 10, 5.5), BRICK)
both("WestAlleyWall_EN", (-10.8, 50, 3.0), (0.55, 6, 5.5), PLASTER)
trim("WestViolet", (-14, 36, 0.45), (0.15, 8, 0.06), VIOLET)
box("VIS_WestBone", (-14, 42, 0.45), (3, 0.2, 0.05), BONE, False)
# Side alcove (second micro-choice inside alley)
both("WestAlcove", (-18, 36, 0.1), (4, 5, 0.5), WOOD)
both("WestAlcoveCeil", (-18, 36, 3.2), (3.8, 4.5, 0.3), WOOD)

# =====================================================================
# 6) UNDERCROFT — under bowl → north exit
# =====================================================================
uc_z = -1.4
both("UCFloor", (0, 26, uc_z), (8, 12, 0.45), STONE)
both("UCCeil", (0, 26, 0.35), (8, 12, 0.35), STONE)
both("UCMouth_S", (0, 18, -0.4), (4.5, 3, 0.45), STONE)
both("UCRamp_S", (0, 19.5, -0.6), (4, 3.5, 1.0), STONE)
both("UCMouth_N", (0, 34, -0.5), (4.5, 3, 0.5), STONE)
# Flat walk pads climbing out (no thick ramp embedding the capsule)
both("UCStep_N1", (0, 35.5, -0.1), (4, 2.5, 0.4), STONE)
both("UCStep_N2", (0, 37.5, 0.4), (4, 2.5, 0.4), STONE)
both("UCStep_N3", (0, 39.5, 0.85), (4, 2.5, 0.4), STONE)
both("UCPillar_A", (-2.5, 24, -0.2), (0.7, 0.7, 2.0), STONE)
both("UCPillar_B", (2.5, 28, -0.2), (0.7, 0.7, 2.0), STONE)
# Optional slide alcove (runner)
both("SlideFloor", (5, 26, uc_z), (4.5, 6, 0.45), STONE)
both("SlideCeil", (5, 26, uc_z + 2.0), (4, 5.5, 0.3), STONE)
box("VIS_SlideChrono", (5, 26, uc_z + 1.85), (3, 4, 0.06), CHRONO, False)
trim("UCTeal", (0, 26, uc_z + 0.3), (3, 0.15, 0.06), TEAL)

# =====================================================================
# 7) NORTH COURT — converge node (bounded)
# =====================================================================
nc_y = 48
both("NorthFloor", (0, nc_y, 1.0), (14, 10, 0.6), COBBLE)
both("NorthWall_N", (0, nc_y + 5.2, 3.2), (14, 0.55, 5.0), STONE)
both("NorthWall_W", (-7.2, nc_y, 3.2), (0.55, 8, 5.0), BRICK)
both("NorthWall_E", (7.2, nc_y, 3.2), (0.55, 8, 5.0), PLASTER)
# South: gaps from undercroft / bowl north gate already open
both("NorthArch", (0, nc_y + 5.2, 5.0), (5, 0.7, 1.0), WOOD)
trim("NorthChrono", (0, nc_y, 1.4), (5, 0.15, 0.06), CHRONO)
# Connect west alley into north court
both("WestToNorth", (-10, 48, 0.7), (5, 5, 0.55), COBBLE)

# =====================================================================
# 8) HEARTH PLAZA — NW of ring, outside 28 m arm radius from north court
# =====================================================================
plaza_x, plaza_y, plaza_z = -12, 74, 3.5
both("PlazaApproach", (-8, 66, 2.2), (10, 8, 0.55), COBBLE)
both("PlazaFloor", (plaza_x, plaza_y, plaza_z - 0.45), (18, 16, 0.9), COBBLE)
both("PlazaRim_N", (plaza_x, plaza_y + 8.2, plaza_z + 0.7), (18, 0.55, 1.5), STONE)
both("PlazaRim_W", (plaza_x - 9.2, plaza_y, plaza_z + 0.7), (0.55, 14, 1.5), BRICK)
both("PlazaRim_E", (plaza_x + 9.2, plaza_y, plaza_z + 0.7), (0.55, 14, 1.5), PLASTER)
both("PlazaRim_S_L", (plaza_x - 5.5, plaza_y - 8.2, plaza_z + 0.7), (6, 0.55, 1.5), STONE)
both("PlazaRim_S_R", (plaza_x + 5.5, plaza_y - 8.2, plaza_z + 0.7), (6, 0.55, 1.5), STONE)
for i, (x, y) in enumerate([
    (plaza_x - 5, plaza_y - 3), (plaza_x + 5, plaza_y - 3),
    (plaza_x - 6, plaza_y + 4), (plaza_x + 6, plaza_y + 4),
]):
    both(f"PlazaCover_{i}", (x, y, plaza_z + 0.65), (2.0, 1.8, 1.3), BLUEWOOD if i % 2 else WOOD)
both("Plinth", (plaza_x, plaza_y, plaza_z + 0.3), (3.5, 3.5, 0.65), STONE)
trim("PlinthGlow", (plaza_x, plaza_y, plaza_z + 0.7), (3, 3, 0.08))
for a in range(10):
    ang = a * math.pi * 2 / 10
    mat = TEAL if a % 3 == 0 else (VIOLET if a % 3 == 1 else EMBER)
    trim(
        f"PlazaRing_{a}",
        (plaza_x + math.cos(ang) * 7, plaza_y + math.sin(ang) * 7, plaza_z + 0.05),
        (0.5, 0.25, 0.08),
        mat,
    )
for i, (x, y) in enumerate([
    (plaza_x - 7, plaza_y - 5), (plaza_x + 7, plaza_y - 5),
    (plaza_x - 7, plaza_y + 5), (plaza_x + 7, plaza_y + 5),
]):
    box(f"VIS_PlazaLantern_{i}", (x, y, plaza_z + 1.8), (0.3, 0.3, 0.55), INK, False)
    trim(f"PlazaLanternGlow_{i}", (x, y, plaza_z + 2.15), (0.2, 0.2, 0.15), BONE)

both("HearthBase", (plaza_x, plaza_y + 10, 4), (7, 7, 10), STONE)
box("VIS_HearthDome", (plaza_x, plaza_y + 10, 12), (9, 9, 5), INK, False)
trim("HearthGlow", (plaza_x, plaza_y + 10, 10), (4, 4, 1.0))
box("VIS_HearthCopper", (plaza_x, plaza_y + 10, 8.5), (6, 6, 0.25), COPPER, False)

empty("WifeAnchor", (plaza_x, plaza_y, plaza_z + 0.75))
empty("BossArena", (plaza_x, plaza_y, plaza_z + 0.05))
empty("WaveSpawn_A", (plaza_x - 6, plaza_y - 4, plaza_z + 0.05))
empty("WaveSpawn_B", (plaza_x + 6, plaza_y - 4, plaza_z + 0.05))
empty("WaveSpawn_C", (plaza_x, plaza_y + 6, plaza_z + 0.05))

# West alley → plaza connector (extends past north court)
both("WestToPlaza", (-14, 60, 1.2), (5, 12, 0.55), COBBLE)
stairs_y("PlazaWestStairs", -14, 64, 1.0, 70, plaza_z - 1.0, 12, width=4.0, mat=STONE)

# East roof → north → plaza soft ramp
both("EastToNorth", (10, 52, 1.2), (6, 5, 0.5), COBBLE)
both("NorthToPlaza", (-4, 58, 1.5), (10, 10, 0.55), COBBLE)
both("NorthToPlaza2", (-8, 66, 2.2), (8, 6, 0.55), COBBLE)
stairs_y("PlazaEastStairs", -6, 68, 2.0, 72, plaza_z - 2.0, 10, width=5.0, mat=STONE)

# =====================================================================
# Outer bounding + terrain
# =====================================================================
both("Outer_W", (-22, 30, 3), (2, 55, 8), MOSS)
both("Outer_E", (26, 35, 3), (2, 50, 8), SLATE)
both("Outer_S", (0, -10, 2), (40, 2, 6), INK)
both("Outer_N", (-6, 84, 4), (40, 2, 8), STONE)
both("Terrain", (0, 40, -3), (55, 100, 2.5), INK)

for i, (x, y, mat) in enumerate([
    (-16, 0, VIOLET), (0, 26, TEAL), (16, 34, CHRONO), (-14, 48, BONE), (-12, 74, EMBER),
]):
    box(f"VIS_Pole_{i}", (x, y, 3), (0.18, 0.18, 5.5), INK, False)
    box(f"VIS_Banner_{i}", (x + 0.9, y, 4.2), (1.3, 0.08, 2.0), mat, False)

# UV unwrap
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
    print(n, "three~", (round(x, 2), round(z, 2), round(-y, 2)))
