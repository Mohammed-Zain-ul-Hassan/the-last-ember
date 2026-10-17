import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Static batching. A level is built from thousands of small meshes (every masonry block, plank and pew end), which
// is lovely to author and ruinous to draw: each is a draw call, again for every shadow pass. Once a level is built,
// every static mesh under `root` is baked into one geometry per (material, shadow flags, spatial cell). The cells
// keep frustum culling (and per-face culling of the point lights' shadow cubes) working. Anything flagged
// `userData.dynamic` (flames, banners, doors, shrines), and everything under it, is left alone.

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const _c = new THREE.Vector3();

/** Same attributes everywhere (position, normal, uv), non-indexed, so any two can be merged. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g.clone();
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  out.morphAttributes = {};
  out.clearGroups();
  if (out === g) out = g.clone();
  return out;
}

export function mergeStatic(root: THREE.Object3D, cell = 16): { before: number; after: number } {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; order: number; noStill: boolean; geos: THREE.BufferGeometry[] }>();
  const victims: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && m.visible) {
      _box.setFromObject(m).getCenter(_c);
      const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.userData.noStill ? 1 : 0}|${Math.floor(_c.x / cell)},${Math.floor(_c.z / cell)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, noStill: !!m.userData.noStill, geos: [] }));
      const g = normalise(m.geometry);
      g.applyMatrix4(_m.multiplyMatrices(_inv, m.matrixWorld));
      b.geos.push(g);
      victims.push(m);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  for (const v of victims) v.removeFromParent();
  let after = 0;
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    for (const g of b.geos) if (g !== merged) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    mesh.userData.noStill = b.noStill;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    after++;
  }
  return { before: victims.length, after };
}
