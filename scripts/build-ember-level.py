"""
Build ember_climb.glb — Ashen Cloister gothic ring district.

Blender Z-up, Y-forward → Y-up GLB.
Art: docs/environment-art-direction.md | Layout: docs/level_design.md §8
Courtyard: modular SigilsVault kit via scripts/assemble-ashen-courtyard.py
  → public/models/levels/ashen_courtyard.glb (required before this script).

Outer ring may still be cube blockout until a later modular pass.
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


# Chapel palette (graded loafbrr maps). Same stone as the approved west gallery, tiled in
# box() UVs. Outer-ring collision footprints are unchanged; only the cube materials move.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(OUT))))
GRADED = os.path.join(ROOT, "vendor", "kits", "loafbrr-gothic", "graded")


def image_mat(name, png, rough=0.9):
    stale = bpy.data.materials.get(name)
    if stale:
        bpy.data.materials.remove(stale)
    mat = ensure_mat(name, (0.30, 0.31, 0.33), rough=rough)
    img = bpy.data.images.load(png, check_existing=True)
    img.reload()
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


STONE = image_mat("BlockWall", os.path.join(GRADED, "LF_Wall.png"), 0.92)
SLATE = image_mat("BlockRoof", os.path.join(GRADED, "LF_Roof.png"), 0.85)
COBBLE = image_mat("BlockFloor", os.path.join(GRADED, "LF_Floor.png"), 0.9)
PLASTER = image_mat("BlockTrim", os.path.join(GRADED, "LF_Trim.png"), 0.88)
IRON = pick(
    "green_metal_rust", "metal_plate_02",
    fallback_name="DarkIron", fallback_color=(0.08, 0.08, 0.09), rough=0.55,
)
WOOD = PLASTER
BRICK = pick(
    "brick_wall_02",
    fallback_name="BrickAccent", fallback_color=(0.35, 0.18, 0.12),
)

EMBER = ensure_mat("EmberTrim", (0.05, 0.02, 0.01), emit=4.0, emit_color=(0.894, 0.420, 0.169))
MOON = ensure_mat("MoonGlow", (0.2, 0.22, 0.26), emit=1.8, emit_color=(0.66, 0.72, 0.78))
INK = ensure_mat("InkDark", (0.04, 0.04, 0.05), rough=0.92)
CHRONO = ensure_mat("ChronoGreen", (0.04, 0.08, 0.05), emit=2.5, emit_color=(0.235, 1.0, 0.416))
BONE = ensure_mat("BoneLight", (0.22, 0.20, 0.18), emit=0.15, emit_color=(0.35, 0.32, 0.28))
BRONZE = ensure_mat("AgedBronze", (0.28, 0.24, 0.18), rough=0.5)


def box(name, loc, scale, mat, coll=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.clear()
    if mat:
        obj.data.materials.append(mat)
    obj["blockout"] = 1  # cube graybox — safe for smart UV; kit meshes must not get this
    if coll:
        obj.hide_render = True
        obj["collision"] = 1
    return obj


def both(base, loc, scale, mat):
    box("VIS_" + base, loc, scale, mat, False)
    box("COL_" + base, loc, scale, mat, True)


TERRAIN_TOP = -1.75  # top of the Terrain slab below


def ground(base, x0, x1, y0, y1, top, mat, bottom=TERRAIN_TOP):
    """Walk slab built down to the terrain, so it reads as a plinth instead of a floating plate."""
    both(base, ((x0 + x1) / 2, (y0 + y1) / 2, (top + bottom) / 2), (x1 - x0, y1 - y0, top - bottom), mat)


def empty(name, loc):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    o = bpy.context.active_object
    o.name = name
    o.empty_display_size = 0.55
    return o


def trim(name, loc, scale, mat=None):
    box("VIS_" + name, loc, scale, mat or EMBER, False)


def stairs_y(prefix, x, y0, z0, y1, rise, steps, width=3.0, mat=STONE, base=TERRAIN_TOP):
    """Solid flight from floor top z0 at y0 to floor top z0 + rise at y1.

    Each riser must stay under PLAYER.stepUp (0.4) or the flight cannot be walked.
    """
    tread = (y1 - y0) / steps
    riser = rise / steps
    assert abs(riser) <= 0.37, (prefix, riser)
    for i in range(steps):
        top = z0 + (i + 1) * riser
        y = y0 + (i + 0.5) * tread
        both(f"{prefix}_{i}", (x, y, (top + base) / 2), (width, abs(tread), top - base), mat)


# ---- Modular gothic kit -------------------------------------------------


def pier(name, loc, h=5.0, w=1.0, d=1.0, mat=STONE):
    both(name, (loc[0], loc[1], loc[2] + h / 2), (w, d, h), mat)


def buttress(name, wall_x, y, z0, h=6.0, out=1.4, mat=STONE):
    """Diagonal-ish buttress as stepped boxes leaning out from wall."""
    both(f"{name}_a", (wall_x + out * 0.35, y, z0 + h * 0.35), (out * 0.7, 1.0, h * 0.7), mat)
    both(f"{name}_b", (wall_x + out * 0.7, y, z0 + h * 0.15), (out * 0.5, 0.8, h * 0.35), mat)


def arch_bay(name, cx, cy, z_floor, span=4.0, rise=3.2, depth=1.2, mat=STONE):
    """Two piers + lintel + stepped arch stones (readable gothic bay)."""
    half = span * 0.5
    pier(f"{name}_PL", (cx - half, cy, z_floor), h=rise, w=0.85, d=depth, mat=mat)
    pier(f"{name}_PR", (cx + half, cy, z_floor), h=rise, w=0.85, d=depth, mat=mat)
    both(f"{name}_Lint", (cx, cy, z_floor + rise + 0.25), (span + 0.6, depth + 0.15, 0.5), mat)
    # Stepped arch fill is visual only, so it never hangs into the walk opening.
    box(f"VIS_{name}_ArchM", (cx, cy, z_floor + rise * 0.72), (span * 0.55, depth * 0.7, rise * 0.35), mat)
    box(f"VIS_{name}_ArchT", (cx, cy, z_floor + rise * 0.95), (span * 0.35, depth * 0.55, 0.4), mat)


def balcony(name, loc, size=(5, 3, 0.4), mat=STONE, rail_mat=IRON):
    """Deck + iron rail on courtyard-facing edge (rail along −Y if looking into court)."""
    x, y, z = loc
    sx, sy, sz = size
    both(name, (x, y, z), (sx, sy, sz), mat)
    # Bracket supports under deck
    for i, ox in enumerate((-sx * 0.3, sx * 0.3)):
        both(f"{name}_Brack_{i}", (x + ox, y, z - 0.7), (0.55, sy * 0.7, 1.0), mat)
    both(f"{name}_Rail", (x, y - sy * 0.45, z + 0.55), (sx * 0.92, 0.22, 0.95), rail_mat)


def bridge_span(name, x0, x1, y, z, mat=STONE, rail_mat=IRON):
    """Walk deck between x0–x1 with supporting arches underneath."""
    cx = (x0 + x1) * 0.5
    span = abs(x1 - x0)
    both(f"{name}_Deck", (cx, y, z), (span, 3.2, 0.4), mat)
    both(f"{name}_RailN", (cx, y + 1.4, z + 0.55), (span * 0.95, 0.2, 0.9), rail_mat)
    both(f"{name}_RailS", (cx, y - 1.4, z + 0.55), (span * 0.95, 0.2, 0.9), rail_mat)
    # Three pier-arch supports under the span
    for i, t in enumerate((0.2, 0.5, 0.8)):
        ax = x0 + (x1 - x0) * t
        arch_bay(f"{name}_A{i}", ax, y, 0.2, span=3.2, rise=z - 0.6, depth=1.4, mat=mat)


def facade_bay(name, cx, cy, z0, w=5.0, h=8.0, mat=STONE):
    """Cathedral facade panel with recessed window niche + moon glow."""
    both(f"{name}_Wall", (cx, cy, z0 + h / 2), (w, 1.0, h), mat)
    both(f"{name}_Niche", (cx, cy - 0.35, z0 + h * 0.55), (w * 0.45, 0.4, h * 0.45), PLASTER)
    trim(f"{name}_Win", (cx, cy - 0.55, z0 + h * 0.58), (w * 0.28, 0.12, h * 0.32), MOON)
    both(f"{name}_Trim", (cx, cy, z0 + h + 0.2), (w + 0.4, 1.2, 0.4), mat)


# =====================================================================
# 1) SOUTH GATE — spawn court
# =====================================================================
ground("GateFloor", -7, 7, -6, 6, 0.0, COBBLE)
both("GateWall_S", (0, -6.2, 2.8), (14, 0.7, 5.5), STONE)
# West wall leaves y 1..4 open onto LeanFoot (lean-stairs route).
both("GateWall_WS", (-7.2, -2.5, 2.8), (0.7, 7, 5.5), STONE)
both("GateWall_WN", (-7.2, 5.0, 2.8), (0.7, 2, 5.5), STONE)
both("GateWall_E", (7.2, 0, 2.8), (0.7, 12, 5.5), PLASTER)
both("GateWall_NL", (-4.8, 6.2, 2.8), (4.5, 0.7, 5.5), STONE)
both("GateWall_NR", (4.8, 6.2, 2.8), (4.5, 0.7, 5.5), STONE)
arch_bay("GateArch", 0, 6.2, 0.0, span=5.5, rise=4.0, depth=0.9, mat=STONE)
for x in (-4.5, 4.5):
    box(f"VIS_GateBrazier_{x}", (x, -3, 0.5), (0.5, 0.5, 1.0), IRON, False)
    trim(f"GateBrazierGlow_{x}", (x, -3, 1.15), (0.32, 0.32, 0.2))
empty("PlayerSpawn", (0, -4, 0.05))
empty("Enemy_01", (-3, 2, 0.05))
empty("Enemy_02", (3, 2.5, 0.05))

# Gate arch (y 6) to the court's south wall (y 19); court collision top is 0.7.
ground("ApproachFloor", -3.5, 3.5, 6, 19, 0.35, COBBLE)
arch_bay("ApproachArch", 0, 15, 0.35, span=5.0, rise=3.8, depth=1.0, mat=STONE)

# West lean route → west balcony
ground("LeanFoot", -11.3, -6.9, 1, 4, 0.1, COBBLE)
stairs_y("LeanStairs", -10, 4, 0.1, 16, 4.7, 14, width=2.6, mat=STONE)
# Visuals for these two slabs now come from the loafbrr kit (VIS_LeanLand / VIS_LeanToBal in
# ashen_courtyard.glb); only the collision boxes stay here so traversal is unchanged.
box("COL_LeanLand", (-10, 17, 4.6), (3.5, 2.5, 0.4), STONE, True)
box("COL_LeanToBal", (-9, 20, 4.6), (3, 4, 0.4), STONE, True)

# =====================================================================
# 2–4) ASHEN CLOISTER COURTYARD — modular kit (see assemble-ashen-courtyard.py)
# =====================================================================
cy = 26
bal_z = 5.2
COURTYARD_GLB = os.path.join(os.path.dirname(OUT), "ashen_courtyard.glb")
USE_MODULAR_COURTYARD = os.path.isfile(COURTYARD_GLB)

if USE_MODULAR_COURTYARD:
    # Local ember accents only (not architecture) — PointLights attach by name in Arena.
    for x in (-6, 6):
        box(f"VIS_CourtBrazier_{x}", (x, 21, 0.55), (0.45, 0.45, 0.9), IRON, False)
        trim(f"CourtBrazierGlow_{x}", (x, 21, 1.1), (0.28, 0.28, 0.18))
    trim("BridgeChrono", (0, cy + 0.5, bal_z + 0.3), (2, 0.15, 0.06), CHRONO)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=COURTYARD_GLB)
    imported = [o for o in bpy.data.objects if o not in before]
    print("IMPORTED courtyard", len(imported), "from", COURTYARD_GLB)
else:
    raise SystemExit(
        f"Missing modular courtyard GLB at {COURTYARD_GLB}. "
        "Run scripts/assemble-ashen-courtyard.py first."
    )

# =====================================================================
# 5) UNDERCROFT under narthex
# =====================================================================
uc_z = -1.3
both("UCFloor", (0, cy + 4, uc_z), (7, 10, 0.45), STONE)
# Undercroft is closed: its ceiling sits under the court floor (top 0.0) instead of poking through.
both("UCCeil", (0, cy + 4, -0.175), (7, 10, 0.35), STONE)
both("UCMouth_S", (0, cy - 2, -0.3), (4, 3, 0.45), STONE)
both("UCStep1", (0, cy + 8, -0.2), (4, 2.5, 0.4), STONE)
both("UCStep2", (0, cy + 10, 0.5), (4, 2.5, 0.4), STONE)
both("UCStep3", (0, cy + 12, 1.2), (4, 2.5, 0.4), STONE)
both("UCExitW", (-6, cy + 8, 0.3), (5, 4, 0.45), STONE)
both("SlideFloor", (4, cy + 4, uc_z), (4, 5, 0.4), STONE)
both("SlideCeil", (4, cy + 4, -0.15), (3.5, 4.5, 0.3), STONE)
box("VIS_SlideChrono", (4, cy + 4, uc_z + 1.85), (2.5, 3.5, 0.06), CHRONO, False)
trim("UCLanternGlow_W", (-2.2, cy + 4, uc_z + 1.6), (0.25, 0.25, 0.3))
trim("UCLanternGlow_E", (2.2, cy + 4, uc_z + 1.6), (0.25, 0.25, 0.3))

# =====================================================================
# 6) WEST STREET + EAST ROOF (ring outlets)
# =====================================================================
ground("WestStreet", -17, -11, 22, 42, 0.425, COBBLE)
both("WestWall_W", (-17.2, 32, 3.0), (0.6, 20, 5.5), STONE)
# East wall leaves y 29.1..31.2 open, lined up with the court's north-west doorway.
both("WestWall_ES", (-10.8, 28.55, 3.0), (0.6, 1.1, 5.5), PLASTER)
both("WestWall_EN", (-10.8, 35.6, 3.0), (0.6, 8.8, 5.5), PLASTER)
ground("CourtWestLink", -11.1, -8.9, 29.1, 31.2, 0.55, COBBLE)
ground("WestToNorth", -17, -11, 42, 53, 0.775, COBBLE)
trim("WestStreetLanternGlow", (-14, 32, 2.4), (0.28, 0.28, 0.35))

# East tower climb (x=17) then roof pads at x=22 — no XY overlap
ground("EastPocket", 9.75, 14.25, 22, 30, 0.4, COBBLE)
# Ground lane from the approach's east edge to the tower foot, south of the court's SE corner.
ground("EastLane", 3.5, 18.6, 14, 17.3, 0.35, COBBLE)
ground("EastTowerFoot", 15.7, 18.3, 17.3, 20, 0.35, COBBLE)
stairs_y("EastTower", 17, 20, 0.35, 30, bal_z + 2.7 - 0.35, 22, width=2.6, mat=STONE)
both("EastLand", (17, 31, bal_z + 2.5), (3.2, 2.5, 0.4), STONE)
both("EastLink", (19.5, 32, bal_z + 2.5), (3, 2.2, 0.35), STONE)
both("RoofA", (22, 34, bal_z + 2.5), (3.5, 3.5, 0.35), SLATE)
both("RoofB", (22, 42, bal_z + 2.7), (3.5, 3.5, 0.35), SLATE)
both("RoofC", (22, 50, bal_z + 2.9), (3.5, 4, 0.35), SLATE)
box("VIS_RoofChrono", (22, 38, bal_z + 2.75), (2, 0.2, 0.06), CHRONO, False)
roof_c_top = bal_z + 2.9 + 0.175
# Head landing between RoofC and the top of the drop stairs.
both("RoofCToDrop", (16.5, 49, roof_c_top - 0.175), (8.0, 2.0, 0.35), SLATE)
stairs_y("RoofDrop", 14, 50, roof_c_top, 54, 1.4 - roof_c_top, 20, width=3.0, mat=STONE)
both("RoofDropLand", (14, 54.5, 1.2), (4, 2.5, 0.4), STONE)
# RoofDropLand → north court, through the shortened NorthWall_E.
ground("EastToNorth", 6.9, 12.2, 52.5, 55.5, 1.4, COBBLE)

# =====================================================================
# 7) NORTH COURT + PLAZA
# =====================================================================
nc = 52
ground("NorthFloor", -7, 7, nc - 5, nc + 5, 1.4, COBBLE)
# North wall is open under NorthArch; west wall open to WestJoinN; east wall open to EastToNorth.
both("NorthWall_NL", (-4.75, nc + 5.2, 3.2), (4.5, 0.6, 5.0), STONE)
both("NorthWall_NR", (4.75, nc + 5.2, 3.2), (4.5, 0.6, 5.0), STONE)
both("NorthWall_WS", (-7.2, nc - 3.25, 3.2), (0.6, 1.5, 5.0), STONE)
both("NorthWall_WN", (-7.2, nc + 3.25, 3.2), (0.6, 1.5, 5.0), STONE)
both("NorthWall_E", (7.2, nc - 1.75, 3.2), (0.6, 4.5, 5.0), PLASTER)
arch_bay("NorthArch", 0, nc + 5.2, 1.4, span=5.0, rise=3.8, depth=0.8, mat=STONE)
ground("WestJoinN", -12.5, -6.9, nc - 2.5, nc + 2.5, 1.05, COBBLE)

# Keep WifeAnchor >28 m from north court (0,52) so defense does not arm early
plaza_x, plaza_y, plaza_z = -12, 84, 3.5
ground("PlazaApproach", -16.5, -3, 67, 77, 2.475, COBBLE)
ground("PlazaFloor", plaza_x - 9, plaza_x + 9, plaza_y - 8, plaza_y + 8, plaza_z, COBBLE)
both("PlazaRim_N", (plaza_x, plaza_y + 8.2, plaza_z + 0.7), (18, 0.55, 1.5), STONE)
both("PlazaRim_W", (plaza_x - 9.2, plaza_y, plaza_z + 0.7), (0.55, 14, 1.5), STONE)
both("PlazaRim_E", (plaza_x + 9.2, plaza_y, plaza_z + 0.7), (0.55, 14, 1.5), PLASTER)
both("PlazaRim_SL", (plaza_x - 5.5, plaza_y - 8.2, plaza_z + 0.7), (6, 0.55, 1.5), STONE)
both("PlazaRim_SR", (plaza_x + 5.5, plaza_y - 8.2, plaza_z + 0.7), (6, 0.55, 1.5), STONE)
for i, (x, y) in enumerate([
    (plaza_x - 5, plaza_y - 3), (plaza_x + 5, plaza_y - 3),
    (plaza_x - 6, plaza_y + 4), (plaza_x + 6, plaza_y + 4),
]):
    both(f"PlazaCover_{i}", (x, y, plaza_z + 0.65), (2.0, 1.8, 1.3), WOOD if i % 2 else STONE)
both("Plinth", (plaza_x, plaza_y, plaza_z + 0.3), (3.5, 3.5, 0.65), STONE)
trim("PlinthGlow", (plaza_x, plaza_y, plaza_z + 0.7), (3, 3, 0.08))
for i, (x, y) in enumerate([
    (plaza_x - 7, plaza_y - 5), (plaza_x + 7, plaza_y - 5),
    (plaza_x - 7, plaza_y + 5), (plaza_x + 7, plaza_y + 5),
]):
    box(f"VIS_PlazaLantern_{i}", (x, y, plaza_z + 1.8), (0.3, 0.3, 0.55), IRON, False)
    trim(f"PlazaLanternGlow_{i}", (x, y, plaza_z + 2.15), (0.2, 0.2, 0.15))

both("HearthBase", (plaza_x, plaza_y + 10, 4), (7, 7, 10), STONE)
empty("WifeAnchor", (plaza_x, plaza_y, plaza_z + 0.75))
empty("BossArena", (plaza_x, plaza_y, plaza_z + 0.05))
# South gap between the plaza rims. Read by LevelLoader as spawns.playerEntry.
empty("PlayerEntry", (plaza_x, plaza_y - 6.2, plaza_z + 0.05))
empty("WaveSpawn_A", (plaza_x - 6, plaza_y - 4, plaza_z + 0.05))
empty("WaveSpawn_B", (plaza_x + 6, plaza_y - 4, plaza_z + 0.05))
empty("WaveSpawn_C", (plaza_x, plaza_y + 6, plaza_z + 0.05))

# West route: WestToNorth (0.775) → WestToPlaza (1.675) → PlazaApproach (2.475).
stairs_y("WestRise", -14, 53, 0.775, 59, 0.9, 4, width=5.0, mat=STONE)
ground("WestToPlaza", -16.5, -11.5, 59, 63, 1.675, COBBLE)
stairs_y("PlazaWestStairs", -14, 63, 1.675, 67, 0.8, 4, width=5.0, mat=STONE)
# North route: NorthFloor (1.4) → NorthToPlaza (1.75) → PlazaApproach.
ground("NorthToPlaza", -9, 1, 57, 67, 1.75, COBBLE)
stairs_y("NorthPlazaSteps", -6, 65, 1.75, 67, 0.725, 2, width=6.0, mat=STONE)
# Into the plaza through the south gap between PlazaRim_SL and PlazaRim_SR.
stairs_y("PlazaEntryStairs", plaza_x, 73, 2.475, plaza_y - 8, plaza_z - 2.475, 3, width=5.0, mat=STONE)

# Outer bound
both("Outer_W", (-22, 45, 3), (2, 80, 8), STONE)
both("Outer_E", (26, 45, 3), (2, 80, 8), SLATE)
both("Outer_S", (0, -10, 2), (40, 2, 6), INK)
both("Outer_N", (-6, 96, 4), (40, 2, 8), STONE)
both("Terrain", (0, 45, -3), (55, 110, 2.5), INK)

# Sanctuary face on the hearth's arena side. Sits inside the existing HearthBase collider,
# so the open plaza floor stays clear. No new collision.
import sys
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import importlib
import loafbrr_kit as lf
importlib.reload(lf)
lf.place_fit(
    "wall/Wall_F_B.fbx", "VIS_BossArch",
    (plaza_x, plaza_y + 6.4), plaza_z,
    dims=(6.0, 0.5, 6.2), rot_z_deg=0,
)
# Kit posts carrying the elevated east walk down to the terrain (VIS only; nothing walks under).
for name, xy, underside in (
    ("VIS_EastLinkPier", (19.5, 32.0), bal_z + 2.5 - 0.175),
    ("VIS_EastLandPier", (17.0, 31.4), bal_z + 2.5 - 0.2),
    ("VIS_RoofAPier", (22.0, 34.0), bal_z + 2.5 - 0.175),
    ("VIS_RoofBPier", (22.0, 42.0), bal_z + 2.7 - 0.175),
    ("VIS_RoofCPier", (22.0, 50.0), bal_z + 2.9 - 0.175),
    ("VIS_RoofCToDropPier", (17.5, 49.0), roof_c_top - 0.35),
):
    lf.place_fit("posts/Post_B_6m.fbx", name, xy, TERRAIN_TOP, dims=(0.7, 0.7, underside - TERRAIN_TOP))

# Box-map the cube blockout so the chapel textures tile. Kit meshes keep their own UVs.
def tile_uv(obj, tile=2.0):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active
    for poly in me.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                uv.data[li].uv = (v.x / tile, v.y / tile)
            elif ax >= ay:
                uv.data[li].uv = (v.y / tile, v.z / tile)
            else:
                uv.data[li].uv = (v.x / tile, v.z / tile)


for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.get("blockout"):
        tile_uv(obj)

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
