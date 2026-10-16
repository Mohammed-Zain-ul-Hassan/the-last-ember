import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Static batching. A level is hundreds of separate stones, columns and pews, and every one is a draw call in the main
 * pass and again in each of the six faces of the hearth's shadow cube. Merge every fixed mesh that shares a material
 * (and shadow flags) inside the same slice of the level into one mesh: a few dozen draws instead of hundreds. Slices
 * keep frustum culling working along the lane.
 *
 * Left alone: anything under `keep` (moving parts), transparent or shader materials, multi-material meshes, and
 * mirrored transforms (baking a negative scale would flip their faces inside out).
 */
export function batchStatic(root: THREE.Object3D, keep: Iterable<THREE.Object3D> = [], slice = 12): { before: number; after: number } {
  const skip = new Set<THREE.Object3D>();
  for (const k of keep) k.traverse((o) => skip.add(o));
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; items: { mesh: THREE.Mesh; m: THREE.Matrix4 }[] }>();
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  let before = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || skip.has(mesh) || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    const mat = mesh.material as THREE.Material;
    if (mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial || mesh.customDistanceMaterial || mesh.customDepthMaterial) return;
    const m = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    if (m.determinant() <= 0) return;
    before++;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!).applyMatrix4(m).getCenter(centre);
    const key = `${mat.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}|${Math.floor(centre.x / slice)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: mesh.castShadow, receive: mesh.receiveShadow, items: [] }));
    b.items.push({ mesh, m });
  });

  let merged = 0;
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    // only the attributes every piece has, all indexed or all not
    const names = Object.keys(b.items[0].mesh.geometry.attributes).filter((n) => b.items.every((it) => it.mesh.geometry.attributes[n]?.itemSize === b.items[0].mesh.geometry.attributes[n].itemSize));
    const indexed = b.items.every((it) => it.mesh.geometry.index);
    const geos = b.items.map(({ mesh, m }) => {
      let g = mesh.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
      g.morphAttributes = {};
      if (!indexed && g.index) g = g.toNonIndexed();
      return g.applyMatrix4(m);
    });
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue; // incompatible pieces: leave them as they are
    const out = new THREE.Mesh(geo, b.mat);
    out.castShadow = b.cast;
    out.receiveShadow = b.receive;
    out.renderOrder = b.items[0].mesh.renderOrder;
    out.matrixAutoUpdate = false; // it never moves
    root.add(out);
    // the originals were never drawn (batching runs at build time), so there is nothing on the GPU to free
    for (const { mesh } of b.items) mesh.removeFromParent();
    merged += b.items.length - 1;
  }
  return { before, after: before - merged };
}
