"""
Helpers for the loafbrr "Gothic-Like Structures" kit (CC0) — used inside Blender.

  https://loafbrr.itch.io/gothic-like-structures   (CC0 1.0, see vendor/kits/loafbrr-gothic/ATTRIBUTION.md)

FBX parts import 100x too small (a 6 m wall reads 0.06), so imports use global_scale=100.
Only four 1K diffuse maps are used (pre-graded by scripts/grade-loafbrr-textures.py) to keep
ashen_courtyard.glb small; materials are shared (LF_Wall / LF_Trim / LF_Floor / LF_Roof / LF_Glass).
"""
from __future__ import annotations

import math
import re
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"D:\Projects\the-last-ember")
KIT = ROOT / "vendor" / "kits" / "loafbrr-gothic" / "extracted"
FBX = KIT / "fbx"
TEX = KIT / "textures"

GRADED = ROOT / "vendor" / "kits" / "loafbrr-gothic" / "graded"  # scripts/grade-loafbrr-textures.py

# original FBX material prefix -> (shared material, graded diffuse PNG, roughness)
# The grade is baked into the PNGs: the glTF exporter ignores Hue/Saturation nodes, so node tints
# never reach the game. Base Color is wired straight from the image.
_MAP = [
    (re.compile(r"^WallTrim"), "LF_Trim", GRADED / "LF_Trim.png", 0.88),
    (re.compile(r"^Wall"), "LF_Wall", GRADED / "LF_Wall.png", 0.92),
    (re.compile(r"^(Floor|Ceiling|ChurchCeiling)"), "LF_Floor", GRADED / "LF_Floor.png", 0.9),
    (re.compile(r"^Roof"), "LF_Roof", GRADED / "LF_Roof.png", 0.85),
    (re.compile(r"^StainedGlass"), "LF_Glass", None, 0.35),
]

_BUILT: set[str] = set()  # materials created during this run (a module reload resets it)


def shared_material(name: str, diffuse: Path | None, rough: float) -> bpy.types.Material:
    if name in _BUILT:
        return bpy.data.materials[name]
    stale = bpy.data.materials.get(name)  # live Blender session: never reuse a previous run's nodes
    if stale:
        bpy.data.materials.remove(stale)
    _BUILT.add(name)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if diffuse is not None and diffuse.is_file():
        tex = nt.nodes.new("ShaderNodeTexImage")
        img = bpy.data.images.load(str(diffuse), check_existing=True)
        img.reload()
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (0.10, 0.13, 0.18, 1.0)
    return mat


def ember_material() -> bpy.types.Material:
    """Dim lantern core; Arena.attachBrazierLights adds the actual light on *LanternGlow* meshes."""
    name = "LF_EmberGlow"
    if name in _BUILT:
        return bpy.data.materials[name]
    stale = bpy.data.materials.get(name)
    if stale:
        bpy.data.materials.remove(stale)
    _BUILT.add(name)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.20, 0.08, 0.03, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.6
    emit = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
    emit.default_value = (1.0, 0.45, 0.16, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.5
    return mat


def set_material(obj: bpy.types.Object, mat: bpy.types.Material | str) -> None:
    """Put one material on every slot (named LF_* materials are built on demand)."""
    if isinstance(mat, str):
        spec = next(m for m in _MAP if m[1] == mat)
        mat = shared_material(spec[1], spec[2], spec[3])
    if not obj.material_slots:
        obj.data.materials.append(mat)
    for slot in obj.material_slots:
        slot.material = mat


def _remap(obj: bpy.types.Object) -> None:
    for slot in obj.material_slots:
        old = slot.material.name if slot.material else ""
        for rx, nm, dif, rough in _MAP:
            if rx.match(old):
                slot.material = shared_material(nm, dif, rough)
                break


def _select_only(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def import_part(rel: str, name: str | None = None) -> bpy.types.Object:
    """Import FBX (relative to fbx/), return one joined mesh in metres, still at world origin."""
    p = FBX / rel
    if not p.is_file():
        raise FileNotFoundError(p)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(p), global_scale=100.0)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    if not meshes:
        raise RuntimeError(f"no mesh in {rel}")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.parent = None
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name or Path(rel).stem
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    _remap(obj)
    return obj


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    cs = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return (
        Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))),
        Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs))),
    )


def tri_count(obj: bpy.types.Object) -> int:
    return sum(max(len(p.vertices) - 2, 0) for p in obj.data.polygons)


def place_fit(
    rel: str,
    name: str,
    center_xy: tuple[float, float],
    base_z: float,
    dims: tuple[float | None, float | None, float | None] = (None, None, None),
    rot_z_deg: float = 0.0,
    dest: bpy.types.Collection | None = None,
    flip: bool = False,
) -> bpy.types.Object:
    """
    Import a part, rotate about Z, stretch each world axis to `dims` (None = keep),
    then put its bounding-box centre at `center_xy` with its underside at `base_z`.
    `flip` turns the part upside down first (a post cap becomes a moulded base).
    """
    obj = import_part(rel, name)
    obj.rotation_euler = (math.pi if flip else 0.0, 0.0, math.radians(rot_z_deg))
    _select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    mn, mx = bounds(obj)
    cur = mx - mn
    obj.scale = tuple((dims[i] / cur[i]) if dims[i] else 1.0 for i in range(3))
    _select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mn, mx = bounds(obj)
    # Origin at footprint centre / underside (same convention as the SigilsVault templates), so
    # Arena.attachGalleryFillLights reads a sensible world position from VIS_BalW.
    obj.data.transform(Matrix.Translation(Vector((-0.5 * (mn.x + mx.x), -0.5 * (mn.y + mx.y), -mn.z))))
    obj.location = Vector((center_xy[0], center_xy[1], base_z))
    if dest is not None:
        for coll in list(obj.users_collection):
            coll.objects.unlink(obj)
        dest.objects.link(obj)
    return obj
