"""
Assemble Ashen Cloister courtyard from SigilsVault Modular Cathedral Kit (CC0).

Polish pass: cool-retint kit mats (kill chalk white), structural VIS under
elevated walks, mid-scale dress, distant silhouette husks (no new routes).

Outputs: public/models/levels/ashen_courtyard.glb
  - VIS_*  authored kit meshes
  - COL_*  simple AABB boxes for LevelLoader
  - Enemy_03..09 empties

  blender --background --python scripts/assemble-ashen-courtyard.py
"""
from __future__ import annotations

import importlib
import math
import sys
from pathlib import Path

import bpy

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:  # exec() from Blender MCP
    ROOT = Path(r"D:\Projects\the-last-ember")
sys.path.insert(0, str(ROOT / "scripts"))
import loafbrr_kit as lf  # noqa: E402  (loafbrr Gothic-Like Structures, CC0 — west gallery only)

importlib.reload(lf)
KIT_GLB = (
    ROOT
    / "vendor"
    / "kits"
    / "modular-cathedral"
    / "extracted"
    / "Modular Cathedral Kit"
    / "Modular Cathedral Pieces"
    / "GLB Format"
)
OUT = ROOT / "public" / "models" / "levels" / "ashen_courtyard.glb"

KIT_SCALE = 0.35
U = 8.0 * KIT_SCALE  # ~2.8 m
CY = 26.0
BAL_Z = 5.2


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for b in list(bpy.data.meshes):
        bpy.data.meshes.remove(b)
    for b in list(bpy.data.materials):
        bpy.data.materials.remove(b)
    for b in list(bpy.data.images):
        bpy.data.images.remove(b)
    for c in list(bpy.data.collections):
        if c.name != "Scene Collection":
            bpy.data.collections.remove(c)


def ensure_coll(name: str) -> bpy.types.Collection:
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def import_glb(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def join_selected(name: str) -> bpy.types.Object:
    objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    if not objs:
        raise RuntimeError(f"no mesh to join for {name}")
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def cool_retint_all_materials() -> None:
    """Crush chalky kit albedo / window glow toward cool charcoal slate."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        name_l = mat.name.lower()
        is_window = "window" in name_l
        is_col = mat.name.startswith("COL_") or mat.name == "COL_Hidden"
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        base = bsdf.inputs.get("Base Color")
        if base and not base.is_linked:
            r, g, b, a = base.default_value
            # Cool bias + value crush
            v = (r + g + b) / 3.0
            if is_col:
                base.default_value = (0.04, 0.045, 0.05, 1.0)
            elif is_window:
                # Moonlit glass — cool, not white
                base.default_value = (0.22, 0.28, 0.34, a)
            else:
                nr = min(0.42, max(0.08, v * 0.55 + 0.06))
                ng = min(0.44, max(0.09, v * 0.58 + 0.07))
                nb = min(0.48, max(0.11, v * 0.62 + 0.09))
                base.default_value = (nr, ng, nb, a)
        # Linked base color: multiply via Mix / HueSat if present; else mute emission
        emit = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        emit_str = bsdf.inputs.get("Emission Strength")
        if is_window:
            if emit and not emit.is_linked:
                emit.default_value = (0.45, 0.55, 0.65, 1.0)
            if emit_str is not None:
                emit_str.default_value = min(float(emit_str.default_value), 0.35)
        else:
            if emit_str is not None and float(emit_str.default_value) > 0.05:
                emit_str.default_value = min(float(emit_str.default_value), 0.08)
        # Darken image textures via HueSat node after Base Color texture
        tree = mat.node_tree
        for link in list(tree.links):
            if link.to_socket == base and link.from_node.type == "TEX_IMAGE":
                tex = link.from_node
                hs = tree.nodes.new("ShaderNodeHueSaturation")
                hs.location = (tex.location.x + 180, tex.location.y)
                hs.inputs["Value"].default_value = 0.55 if not is_window else 0.42
                hs.inputs["Saturation"].default_value = 0.65 if not is_window else 0.4
                tree.links.remove(link)
                tree.links.new(tex.outputs["Color"], hs.inputs["Color"])
                tree.links.new(hs.outputs["Color"], base)


def load_template(stem: str, lib: bpy.types.Collection) -> bpy.types.Object:
    path = KIT_GLB / f"{stem}.glb"
    if not path.is_file():
        raise FileNotFoundError(path)
    imported = import_glb(path)
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in imported if o.type == "MESH"]
    others = [o for o in imported if o.type != "MESH"]
    for o in others:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        o.select_set(True)
    tmpl = join_selected(f"_T_{stem}")
    tmpl.scale = (KIT_SCALE, KIT_SCALE, KIT_SCALE)
    bpy.context.view_layer.objects.active = tmpl
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    bpy.context.view_layer.update()
    corners = [tmpl.matrix_world @ v.co for v in tmpl.data.vertices]
    min_z = min(c.z for c in corners)
    cx = 0.5 * (min(c.x for c in corners) + max(c.x for c in corners))
    cy = 0.5 * (min(c.y for c in corners) + max(c.y for c in corners))
    tmpl.location.x -= cx
    tmpl.location.y -= cy
    tmpl.location.z -= min_z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    for coll in list(tmpl.users_collection):
        coll.objects.unlink(tmpl)
    lib.objects.link(tmpl)
    tmpl.hide_set(True)
    tmpl.hide_render = True
    return tmpl


def place(
    tmpl: bpy.types.Object,
    name: str,
    loc: tuple[float, float, float],
    rot_z_deg: float = 0.0,
    dest: bpy.types.Collection | None = None,
) -> bpy.types.Object:
    obj = tmpl.copy()
    obj.data = tmpl.data.copy()
    obj.name = name
    obj.hide_set(False)
    obj.hide_render = False
    obj.location = loc
    obj.rotation_euler = (0.0, 0.0, math.radians(rot_z_deg))
    (dest or bpy.context.scene.collection).objects.link(obj)
    return obj


def col_box(name: str, loc: tuple[float, float, float], scale: tuple[float, float, float], dest) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Do not hide_render / hide_viewport — Blender glTF skips those even if selected.
    # LevelLoader hides COL_* at runtime by name.
    obj["collision"] = 1
    mat = bpy.data.materials.get("COL_Hidden") or bpy.data.materials.new("COL_Hidden")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.03, 0.03, 0.035, 1.0)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    dest.objects.link(obj)


def empty(name: str, loc: tuple[float, float, float], dest) -> None:
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    o = bpy.context.active_object
    o.name = name
    o.empty_display_size = 0.55
    for coll in list(o.users_collection):
        coll.objects.unlink(o)
    dest.objects.link(o)


def main() -> None:
    if not KIT_GLB.is_dir():
        raise SystemExit(f"Missing kit GLBs at {KIT_GLB}")

    clear_scene()
    lib = ensure_coll("KitLibrary")
    vis = ensure_coll("CourtyardVIS")
    col = ensure_coll("CourtyardCOL")
    markers = ensure_coll("CourtyardMarkers")

    needed = [
        "floor_01", "floor_02", "floor_03",
        "sanctum_floor_01", "sanctum_floor_02",
        "wall_01", "wall_window_01", "wall_window_large_01", "wall_rose_window_01",
        "wall_corner_01", "wall_trim_01", "facade_wall_01",
        "column_01", "column_small_01", "flying_buttress_01", "doorway_01", "doorway_inner_01",
        "platform_stairs_01",
        "railing_01", "railing_outside_01", "railing_corner_01", "railing_outside_corner_01",
        "vault_large_01", "vault_small_front_01", "vault_cross_junction_01",
        "rooftop_01", "tower_base_01", "tower_small_01", "tower_cap_01", "tower_cap_02",
        "sanctum_base_01", "sanctum_doorway_01", "sanctum_upper_01", "sanctum_stairs_01",
        "sanctum_roof_01", "spire_01",
    ]
    tmpls: dict[str, bpy.types.Object] = {}
    for stem in needed:
        print("LOAD", stem)
        tmpls[stem] = load_template(stem, lib)

    cool_retint_all_materials()

    def mark_walk_bright(obj: bpy.types.Object) -> None:
        """Gallery walk surfaces: lift albedo so ledges read without chalk-white walls."""
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf:
                continue
            base = bsdf.inputs.get("Base Color")
            if base and not base.is_linked:
                r, g, b, a = base.default_value
                base.default_value = (min(0.55, r * 1.55 + 0.08), min(0.56, g * 1.5 + 0.08), min(0.58, b * 1.45 + 0.1), a)
            for node in mat.node_tree.nodes:
                if node.type == "HUE_SAT":
                    node.inputs["Value"].default_value = max(0.72, float(node.inputs["Value"].default_value))

    # ---- Floors ----
    floor_names = ["floor_01", "floor_02", "floor_03"]
    n = 0
    for ix in range(-3, 4):
        for iy in range(-2, 3):
            # Tiles are 0.35 thick; lift them so the paving top meets COL_CourtFloor (0.7).
            place(tmpls[floor_names[n % 3]], f"VIS_CourtFloor_{n}", (ix * U, CY + iy * U, 0.35), dest=vis)
            n += 1
    col_box("COL_CourtFloor", (0, CY, 0.35), (18, 14, 0.7), col)

    # ---- Perimeter walls ----
    wall_i = 0
    for iy, stem in [(-2, "wall_window_01"), (-1, "wall_01"), (0, "wall_window_large_01"), (1, "wall_01"), (2, "wall_rose_window_01")]:
        y = CY + iy * U
        place(tmpls[stem], f"VIS_CourtWallW_{wall_i}", (-9.0, y, 0.0), rot_z_deg=90, dest=vis)
        place(tmpls["wall_window_01" if stem == "wall_rose_window_01" else stem], f"VIS_CourtWallE_{wall_i}", (9.0, y, 0.0), rot_z_deg=-90, dest=vis)
        # Trim bands for mid-scale dress
        place(tmpls["wall_trim_01"], f"VIS_CourtTrimW_{wall_i}", (-9.0, y, 5.2), rot_z_deg=90, dest=vis)
        place(tmpls["wall_trim_01"], f"VIS_CourtTrimE_{wall_i}", (9.0, y, 5.2), rot_z_deg=-90, dest=vis)
        wall_i += 1
    place(tmpls["wall_window_01"], "VIS_CourtWallNL_0", (-5.5, CY + 7.0, 0.0), dest=vis)
    place(tmpls["wall_window_01"], "VIS_CourtWallNR_0", (5.5, CY + 7.0, 0.0), dest=vis)
    place(tmpls["wall_01"], "VIS_CourtWallSL_0", (-5.5, CY - 7.0, 0.0), rot_z_deg=180, dest=vis)
    place(tmpls["wall_01"], "VIS_CourtWallSR_0", (5.5, CY - 7.0, 0.0), rot_z_deg=180, dest=vis)
    place(tmpls["doorway_01"], "VIS_CourtSouthDoor", (0.0, CY - 7.0, 0.0), rot_z_deg=180, dest=vis)
    place(tmpls["facade_wall_01"], "VIS_CourtNorthFacade", (0.0, CY + 7.4, 0.0), dest=vis)

    place(tmpls["wall_corner_01"], "VIS_CourtCorner_SW", (-9.0, CY - 7.0, 0.0), rot_z_deg=180, dest=vis)
    place(tmpls["wall_corner_01"], "VIS_CourtCorner_SE", (9.0, CY - 7.0, 0.0), rot_z_deg=-90, dest=vis)
    place(tmpls["wall_corner_01"], "VIS_CourtCorner_NW", (-9.0, CY + 7.0, 0.0), rot_z_deg=90, dest=vis)
    place(tmpls["wall_corner_01"], "VIS_CourtCorner_NE", (9.0, CY + 7.0, 0.0), dest=vis)

    col_box("COL_CourtWall_SL", (-6, CY - 7.2, 3.0), (6, 0.75, 5.5), col)
    col_box("COL_CourtWall_SR", (6, CY - 7.2, 3.0), (6, 0.75, 5.5), col)
    col_box("COL_CourtWall_NL", (-6, CY + 7.2, 3.0), (6, 0.75, 5.5), col)
    col_box("COL_CourtWall_NR", (6, CY + 7.2, 3.0), (6, 0.75, 5.5), col)
    col_box("COL_CourtWall_WS", (-9.2, CY - 3, 3.0), (0.75, 7, 5.5), col)
    # North-west doorway (y 29.1..31.2) in the open bay between wall pieces 3 and 4 → west street.
    col_box("COL_CourtWall_WN", (-9.2, CY + 1.3, 3.0), (0.75, 3.6, 5.5), col)
    col_box("COL_CourtWall_WNN", (-9.2, CY + 5.85, 3.0), (0.75, 1.3, 5.5), col)
    col_box("COL_CourtWall_ES", (9.2, CY - 3, 3.0), (0.75, 7, 5.5), col)
    col_box("COL_CourtWall_EN", (9.2, CY + 3, 3.0), (0.75, 7, 5.5), col)

    # ---- Buttresses + arcade ----
    for i, y in enumerate((CY - 4, CY, CY + 4)):
        place(tmpls["flying_buttress_01"], f"VIS_ButtW_{i}", (-10.5, y, 0.0), rot_z_deg=90, dest=vis)
        place(tmpls["flying_buttress_01"], f"VIS_ButtE_{i}", (10.5, y, 0.0), rot_z_deg=-90, dest=vis)
    for i, y in enumerate((CY - 3, CY + 2)):
        place(tmpls["vault_small_front_01"], f"VIS_ArcadeW_{i}", (-7.2, y, 0.2), rot_z_deg=90, dest=vis)
        place(tmpls["vault_small_front_01"], f"VIS_ArcadeE_{i}", (7.2, y, 0.2), rot_z_deg=-90, dest=vis)

    # ---- Cover + pillars ----
    for i, (x, y) in enumerate([(-4, 22), (4, 22), (-5, 28), (5, 29), (0, 30)]):
        place(tmpls["column_small_01"], f"VIS_CourtCover_{i}", (x, y, 0.0), dest=vis)
        col_box(f"COL_CourtCover_{i}", (x, y, 1.4), (1.2, 1.2, 1.5), col)
    COURT_TOP = 0.7

    def dress_column(name: str, x: float, y: float, base_rel: str, cap_rel: str) -> None:
        """West encounter columns: moulded plinth (inside the 0.9 m collider) + impost band level
        with the gallery pier caps, so court columns and gallery piers read as one order."""
        lf.place_fit(base_rel, f"{name}_Base", (x, y), COURT_TOP, dims=(0.9, 0.9, 0.38), flip=True, dest=vis)
        lf.place_fit(cap_rel, f"{name}_Capital", (x, y), DECK_TOP - 0.95, dims=(0.86, 0.86, 0.42), dest=vis)

    DECK_TOP = BAL_Z + 0.2
    pa = place(tmpls["column_01"], "VIS_CourtPillar_A", (-2.5, 25, 0.0), dest=vis)
    lf.set_material(pa, "LF_Trim")
    dress_column("VIS_CourtPillar_A", -2.5, 25.0, "posts/Post_B_Cap.fbx", "posts/Post_C_Cap.fbx")
    place(tmpls["column_01"], "VIS_CourtPillar_B", (2.5, 27, 0.0), dest=vis)
    col_box("COL_CourtPillar_A", (-2.5, 25, 2.5), (0.9, 0.9, 4.5), col)
    col_box("COL_CourtPillar_B", (2.5, 27, 2.5), (0.9, 0.9, 4.5), col)

    # ---- Tower shells (gallery parents — compact, not ink-blot roofs) ----
    # West / east towers flush behind court walls at gallery mid-span
    place(tmpls["tower_base_01"], "VIS_ShellBase_W", (-12.0, CY, 0.0), rot_z_deg=90, dest=vis)
    place(tmpls["tower_small_01"], "VIS_Shell_W", (-12.0, CY, 3.5), rot_z_deg=90, dest=vis)
    place(tmpls["tower_cap_01"], "VIS_ShellCap_W", (-12.0, CY, 8.0), rot_z_deg=90, dest=vis)
    place(tmpls["tower_base_01"], "VIS_ShellBase_E", (12.0, CY, 0.0), rot_z_deg=-90, dest=vis)
    place(tmpls["tower_small_01"], "VIS_Shell_E", (12.0, CY, 3.5), rot_z_deg=-90, dest=vis)
    place(tmpls["tower_cap_01"], "VIS_ShellCap_E", (12.0, CY, 8.0), rot_z_deg=-90, dest=vis)
    # Secondary corner towers (lighter — no stacked roofs)
    place(tmpls["tower_base_01"], "VIS_ShellBase_SW", (-12.0, 22.0, 0.0), rot_z_deg=90, dest=vis)
    place(tmpls["tower_small_01"], "VIS_Shell_SW", (-12.0, 22.0, 3.5), rot_z_deg=90, dest=vis)
    place(tmpls["tower_base_01"], "VIS_ShellBase_SE", (12.0, 22.0, 0.0), rot_z_deg=-90, dest=vis)
    place(tmpls["tower_small_01"], "VIS_Shell_SE", (12.0, 22.0, 3.5), rot_z_deg=-90, dest=vis)
    col_box("COL_Shell_W", (-12.0, CY, 3.5), (4.0, 4.5, 6.5), col)
    col_box("COL_Shell_E", (12.0, CY, 3.5), (4.0, 4.5, 6.5), col)
    col_box("COL_Shell_SW", (-12.0, 22.0, 3.5), (4.0, 4.5, 6.5), col)
    col_box("COL_Shell_SE", (12.0, 22.0, 3.5), (4.0, 4.5, 6.5), col)

    # ---- WEST GALLERY: loafbrr "Gothic-Like Structures" (CC0) — asset-driven replacement ----
    # Footprint == COL_BalW (x -9.75..-5.25, y 23.25..28.75, walk top z 5.4); nothing here is a primitive.
    GX0, GX1, GY0, GY1 = -9.75, -5.25, CY - 2.75, CY + 2.75
    # Deck slab (paved top, vaulted-brick underside): VIS_BalW anchors the gallery fill light.
    lf.place_fit("floors/Floor_6x6_B.fbx", "VIS_BalW", ((GX0 + GX1) / 2, CY), DECK_TOP - 0.4,
                 dims=(GX1 - GX0, GY1 - GY0, 0.4), dest=vis)
    # Pointed-arch arcade wall under the deck, anchored on the tower side (real arched opening).
    lf.place_fit("wall/Wall_F_B.fbx", "VIS_GalW_Arcade", (GX0 + 0.45, CY), 0.0,
                 dims=(0.6, GY1 - GY0, DECK_TOP - 0.4), rot_z_deg=90, dest=vis)
    # Flying-buttress struts carrying the deck from the wall down to court-edge piers.
    for tag, y in (("S", GY0 + 0.7), ("N", GY1 - 0.7)):
        # Buttress_B: thinner chamfered profile than Buttress_A (read as a slab at close range).
        lf.place_fit("posts/Buttress_B.fbx", f"VIS_GalW_Butt{tag}", ((GX0 + GX1) / 2 - 0.2, y), 0.05,
                     dims=(GX1 - GX0 - 0.9, 0.4, DECK_TOP - 0.5), rot_z_deg=90, dest=vis)
        lf.place_fit("posts/Post_B_6m.fbx", f"VIS_GalW_Pier{tag}", (GX1 - 0.45, y), 0.0,
                     dims=(0.9, 0.9, DECK_TOP - 0.95), dest=vis)
        lf.place_fit("posts/Post_C_Cap.fbx", f"VIS_GalW_PierBase{tag}", (GX1 - 0.45, y), COURT_TOP,
                     dims=(1.1, 1.1, 0.38), flip=True, dest=vis)
        lf.place_fit("posts/Post_B_Cap.fbx", f"VIS_GalW_PierCap{tag}", (GX1 - 0.45, y), DECK_TOP - 0.95,
                     dims=(1.15, 1.15, 0.55), dest=vis)
    # Deck-edge cornice under the north lip (the only open edge that is not a route: east meets the
    # bridge, south is the lean-route hop). Below the walk surface, so it never obstructs.
    lf.place_fit("roof/Roof_Ledge_6m.fbx", "VIS_GalW_EdgeTrimN", ((GX0 + GX1) / 2, GY1 + 0.05), DECK_TOP - 0.75,
                 dims=(GX1 - GX0, 0.4, 0.35), dest=vis)
    # Plinth course along the arcade foot: shallow wall depth where the arcade meets the court floor.
    lf.place_fit("floors/Stair_Ledge_6m.fbx", "VIS_GalW_PlinthCourse", (GX0 + 0.85, CY), COURT_TOP,
                 dims=(0.22, GY1 - GY0, 0.3), dest=vis)
    # Stone parapets (balustrade): north end, and the court edge south of the bridge mouth.
    lf.place_fit("floors/GuardRail_A.fbx", "VIS_GalW_RailN", ((GX0 + GX1) / 2, GY1 - 0.2), DECK_TOP,
                 dims=(GX1 - GX0 - 0.6, 0.35, 1.1), dest=vis)
    # No south rail/post: the old GuardRail_B stub sat across the stair head (foreground slab in
    # review shot 02) and the south edge is the lean-route hop, so both stay open.
    for tag, (x, y) in {"NE": (GX1 - 0.2, GY1 - 0.2), "NW": (GX0 + 0.35, GY1 - 0.2)}.items():
        lf.place_fit("floors/GuardRail_C_CornerPost_B.fbx", f"VIS_GalW_Post{tag}", (x, y), DECK_TOP,
                     dims=(0.55, 0.55, 1.3), dest=vis)
    # Pointed-arch doorway into the shell tower (blind niche proud of the court wall).
    lf.place_fit("wall/Wall_F_A.fbx", "VIS_GalW_Door", (GX0 + 0.9, CY), DECK_TOP,
                 dims=(0.35, 3.0, 3.4), rot_z_deg=90, dest=vis)
    # Coping on the niche wall so it reads as built masonry, not a free-standing panel.
    lf.place_fit("roof/Roof_Ledge_3m.fbx", "VIS_GalW_DoorCoping", (GX0 + 0.9, CY), DECK_TOP + 3.4,
                 dims=(0.55, 3.25, 0.3), rot_z_deg=90, dest=vis)
    # Two wall lanterns flanking the niche, above head height (deck top + 2.3 m). The glow mesh
    # name drives Arena.attachBrazierLights; the bracket is a small inverted post cap.
    for tag, y in (("S", CY - 1.15), ("N", CY + 1.15)):
        lx = GX0 + 1.2
        lf.place_fit("posts/Post_C_Cap.fbx", f"VIS_GalW_LanternBracket{tag}", (lx, y), DECK_TOP + 2.1,
                     dims=(0.34, 0.34, 0.2), flip=True, dest=vis)
        glow = lf.place_fit("posts/Post_C_Cap.fbx", f"VIS_GalW_LanternGlow{tag}", (lx, y), DECK_TOP + 2.3,
                            dims=(0.2, 0.2, 0.28), dest=vis)
        lf.set_material(glow, lf.ember_material())
    col_box("COL_BalW", (-7.5, CY, BAL_Z), (4.5, 5.5, 0.4), col)

    # ---- EAST GALLERY (mirror) ----
    place(tmpls["doorway_01"], "VIS_GalE_Door", (9.0, CY, BAL_Z - 0.05), rot_z_deg=-90, dest=vis)
    place(tmpls["wall_trim_01"], "VIS_GalE_Trim", (9.0, CY, BAL_Z + 0.15), rot_z_deg=-90, dest=vis)
    for i, oy in enumerate((-2.2, 0.0, 2.2)):
        name = "VIS_BalE" if i == 1 else f"VIS_GalE_Floor_{i}"
        fe = place(tmpls["sanctum_floor_02" if i % 2 == 0 else "floor_03"], name, (7.2, CY + oy, BAL_Z), rot_z_deg=-90, dest=vis)
        mark_walk_bright(fe)
    place(tmpls["railing_outside_01"], "VIS_GalE_Rail", (5.6, CY, BAL_Z + 0.05), rot_z_deg=-90, dest=vis)
    place(tmpls["railing_outside_corner_01"], "VIS_GalE_RailN", (5.8, CY + 2.4, BAL_Z + 0.05), rot_z_deg=0, dest=vis)
    place(tmpls["railing_outside_corner_01"], "VIS_GalE_RailS", (5.8, CY - 2.4, BAL_Z + 0.05), rot_z_deg=-90, dest=vis)
    place(tmpls["vault_small_front_01"], "VIS_GalE_Vault", (8.0, CY, 0.15), rot_z_deg=-90, dest=vis)
    place(tmpls["flying_buttress_01"], "VIS_GalE_ButtN", (10.0, CY + 2.0, 0.0), rot_z_deg=-90, dest=vis)
    place(tmpls["flying_buttress_01"], "VIS_GalE_ButtS", (10.0, CY - 2.0, 0.0), rot_z_deg=-90, dest=vis)
    place(tmpls["column_01"], "VIS_GalE_PierN", (7.0, CY + 2.0, 0.0), dest=vis)
    place(tmpls["column_01"], "VIS_GalE_PierS", (7.0, CY - 2.0, 0.0), dest=vis)
    col_box("COL_BalE", (7.5, CY, BAL_Z), (4.5, 5.5, 0.4), col)

    # Stairs into galleries (kit stairs + vault under — keep COL footprints)
    place(tmpls["platform_stairs_01"], "VIS_BalWStairs", (-5.5, 22.5, 0.0), dest=vis)
    place(tmpls["platform_stairs_01"], "VIS_BalEStairs", (5.5, 22.5, 0.0), dest=vis)
    place(tmpls["vault_small_front_01"], "VIS_BalWStairsVault", (-5.5, 22.0, 0.1), dest=vis)
    place(tmpls["vault_small_front_01"], "VIS_BalEStairsVault", (5.5, 22.0, 0.1), dest=vis)
    def vis_tread(name: str, loc: tuple[float, float, float], scale: tuple[float, float, float]) -> None:
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        obj = bpy.context.active_object
        obj.name = name
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj["blockout"] = 1  # build-ember-level box-maps blockout UVs
        lf.set_material(obj, "LF_Floor")
        for coll in list(obj.users_collection):
            coll.objects.unlink(obj)
        vis.objects.link(obj)

    # The kit stair mesh stops at 1.46 m; the visible treads match the collision steps up to the deck.
    steps = 14
    for i in range(steps):
        t = (i + 0.5) / steps
        y = 20 + t * 5
        z = 0.5 + t * (BAL_Z - 0.5)
        for side, x in (("W", -5.5), ("E", 5.5)):
            col_box(f"COL_Bal{side}Stairs_{i}", (x, y, z), (2.4, 0.55, 0.35), col)
            vis_tread(f"VIS_Bal{side}StairsTread_{i}", (x, y, z), (2.4, 0.55, 0.35))

    # Lean route into the west gallery — loafbrr slabs replace the build-ember-level cubes
    # VIS_LeanLand / VIS_LeanToBal (their COL_* boxes stay in build-ember-level.py).
    lf.place_fit("floors/Floor_3x3_B.fbx", "VIS_LeanLand", (-10.0, 17.0), 4.4, dims=(3.5, 2.5, 0.4), dest=vis)
    lf.place_fit("floors/Floor_6x3_B.fbx", "VIS_LeanToBal", (-9.0, 20.0), 4.4, dims=(3.0, 4.0, 0.4), rot_z_deg=90, dest=vis)
    # Lean-join: paved spur into the west tower
    lf.place_fit("floors/Floor_3x3_B.fbx", "VIS_LeanJoin_Floor", (-8.5, 19.0), BAL_Z - 0.2, dims=(2.5, 2.5, 0.4), dest=vis)
    lf.place_fit("floors/GuardRail_B.fbx", "VIS_LeanJoin_Rail", (-7.5, 19.0), BAL_Z + 0.2, dims=(2.4, 0.35, 1.1), rot_z_deg=90, dest=vis)
    lf.place_fit("posts/Post_B_6m.fbx", "VIS_LeanJoin_Pier", (-7.75, 18.1), 0.0, dims=(0.8, 0.8, BAL_Z - 0.65), dest=vis)
    lf.place_fit("posts/Post_B_Cap.fbx", "VIS_LeanJoin_PierCap", (-7.75, 18.1), BAL_Z - 0.65, dims=(1.05, 1.05, 0.45), dest=vis)
    col_box("COL_LeanJoin", (-8.5, 19, BAL_Z), (2.5, 2.5, 0.4), col)

    # ---- CLOISTER BRIDGE: pier–arch–paving (deck rides vaults; no platform_01) ----
    for i, ax in enumerate((-3.5, 0.0, 3.5)):
        place(tmpls["vault_large_01"], f"VIS_CloisterBridge_A{i}", (ax, CY + 0.5, 0.15), rot_z_deg=90, dest=vis)
    # End piers only — land into gallery columns
    pw = place(tmpls["column_01"], "VIS_CloisterBridge_PierW", (-5.0, CY + 0.5, 0.0), dest=vis)
    lf.set_material(pw, "LF_Trim")
    dress_column("VIS_CloisterBridge_PierW", -5.0, CY + 0.5, "posts/Post_C_Cap.fbx", "posts/Post_B_Cap.fbx")
    place(tmpls["column_01"], "VIS_CloisterBridge_PierE", (5.0, CY + 0.5, 0.0), dest=vis)
    place(tmpls["vault_cross_junction_01"], "VIS_CloisterBridge_X", (0.0, CY + 0.5, 0.25), rot_z_deg=90, dest=vis)
    for i, ax in enumerate((-4.2, -1.4, 1.4, 4.2)):
        bd = place(tmpls["sanctum_floor_01" if i % 2 == 0 else "floor_02"], f"VIS_CloisterBridge_Floor_{i}", (ax, CY + 0.5, BAL_Z), rot_z_deg=90, dest=vis)
        mark_walk_bright(bd)
    place(tmpls["railing_outside_01"], "VIS_CloisterBridge_RailN", (0.0, CY + 1.9, BAL_Z + 0.05), rot_z_deg=90, dest=vis)
    place(tmpls["railing_outside_01"], "VIS_CloisterBridge_RailS", (0.0, CY - 0.9, BAL_Z + 0.05), rot_z_deg=90, dest=vis)
    place(tmpls["railing_corner_01"], "VIS_CloisterBridge_RailCN", (-4.8, CY + 1.9, BAL_Z + 0.05), rot_z_deg=90, dest=vis)
    place(tmpls["railing_corner_01"], "VIS_CloisterBridge_RailCS", (4.8, CY - 0.9, BAL_Z + 0.05), rot_z_deg=90, dest=vis)
    col_box("COL_CloisterBridge_Deck", (0.0, CY + 0.5, BAL_Z), (10.0, 3.2, 0.4), col)

    # ---- Narthex ----
    place(tmpls["sanctum_base_01"], "VIS_CathSanctum", (0.0, CY + 12.0, 0.0), dest=vis)
    place(tmpls["sanctum_doorway_01"], "VIS_CathDoor", (0.0, CY + 9.5, 0.0), dest=vis)
    place(tmpls["sanctum_upper_01"], "VIS_CathUpper", (0.0, CY + 12.0, 6.0), dest=vis)
    place(tmpls["sanctum_roof_01"], "VIS_CathRoof", (0.0, CY + 12.0, 10.0), dest=vis)
    place(tmpls["sanctum_stairs_01"], "VIS_CathStepsMesh", (0.0, CY + 8.0, 0.0), dest=vis)
    # Supports under elevated narthex approach
    for i, x in enumerate((-3.0, 0.0, 3.0)):
        place(tmpls["column_01"], f"VIS_CathStepPier_{i}", (x, CY + 9.0, 0.0), dest=vis)
    for i, x in enumerate((-4.0, 0.0, 4.0)):
        place(tmpls["spire_01"], f"VIS_Spire_{i}", (x, CY + 10.0, 8.0), dest=vis)
        place(tmpls["tower_cap_02"], f"VIS_SpireTip_{i}", (x, CY + 10.0, 14.0), dest=vis)

    # Court top (0.7) up to the narthex top (4.225), last tread ending at the narthex edge (CY + 10.5).
    cath_steps = 12
    narthex_top = 4.0 + 0.225
    for i in range(cath_steps):
        y = (CY + 6.5) + (i + 0.5) * (4.0 / cath_steps)
        top = COURT_TOP + (i + 1) * (narthex_top - COURT_TOP) / cath_steps
        col_box(f"COL_CathSteps_{i}", (0.0, y, top - 0.175), (6.0, 0.55, 0.35), col)
    col_box("COL_NarthexFloor", (0.0, CY + 12.5, 4.0), (8, 4, 0.45), col)
    col_box("COL_NarthexDoor", (0.0, CY + 14.2, 5.5), (3.5, 0.6, 3.5), col)

    # Distant silhouettes: only far background (kept out of gallery frustum)
    place(tmpls["tower_base_01"], "VIS_SilFar_0", (0.0, 72.0, 0.0), dest=vis)
    place(tmpls["tower_small_01"], "VIS_SilFar_0t", (0.0, 72.0, 4.0), dest=vis)
    place(tmpls["tower_base_01"], "VIS_SilFar_1", (-26.0, 58.0, 0.0), rot_z_deg=20, dest=vis)
    place(tmpls["tower_small_01"], "VIS_SilFar_1t", (-26.0, 58.0, 4.0), rot_z_deg=20, dest=vis)

    # ---- Empties ----
    empty("Enemy_03", (-3, 23, 0.8), markers)
    empty("Enemy_04", (3, 25, 0.8), markers)
    empty("Enemy_05", (0, 29, 0.8), markers)
    empty("Enemy_06", (-2, 27, 0.8), markers)
    empty("Enemy_07", (-7.5, CY, BAL_Z + 0.35), markers)
    empty("Enemy_08", (7.5, CY + 1, BAL_Z + 0.35), markers)
    empty("Enemy_09", (0, CY + 0.5, BAL_Z + 0.35), markers)

    for o in lib.objects:
        o.hide_set(True)
        o.hide_render = True

    bpy.ops.object.select_all(action="DESELECT")
    for coll in (vis, col, markers):
        for o in coll.objects:
            o.hide_set(False)
            o.hide_render = False
            o.hide_viewport = False
            o.select_set(True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
    )
    print("BUILT", OUT, "bytes", OUT.stat().st_size)
    print("VIS", len(vis.objects), "COL", len(col.objects), "markers", len(markers.objects))


if __name__ == "__main__":
    main()
