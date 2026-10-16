import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Weathered, smooth-edged geometry for the world: no raw boxes. Rounded edges catch the rim light, and a little
// noise along the normal breaks up the perfect CG surfaces so stone reads as carved and eroded.

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

/** Push vertices along their normals by fbm noise (amount in metres). */
function erode(g: THREE.BufferGeometry, amount: number, scale: number, seed: number): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise3(x * scale + seed, y * scale, z * scale) * 0.65 + noise3(x * scale * 3.1, y * scale * 3.1 + seed, z * scale * 3.1) * 0.35;
    const d = (n - 0.55) * amount;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

/** A carved stone block with rounded, chipped edges. */
export function stoneBox(w: number, h: number, d: number, seed = 1, chip = 0.035): THREE.BufferGeometry {
  const r = Math.min(0.09, Math.min(w, h, d) * 0.18);
  const g = new RoundedBoxGeometry(w, h, d, 3, r);
  return erode(g, chip, 2.2, seed);
}

/** A natural rock: subdivided icosahedron, squashed and eroded. */
export function rock(size: number, seed = 1): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(size, 3);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const g = mergeVertices(raw); // shared vertices -> smooth shading instead of facets
  g.scale(1, 0.62, 0.9);
  g.computeVertexNormals();
  return erode(g, size * 0.45, 1.6 / size, seed);
}

/** A column with shallow fluting and worn edges. */
export function column(rTop: number, rBottom: number, h: number, seed = 1, flutes = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 32, 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 - 0.045 * Math.pow(Math.abs(Math.cos((a * flutes) / 2)), 3);
    pos.setXYZ(i, (x / r) * r * k, y, (z / r) * r * k);
  }
  g.computeVertexNormals();
  return erode(g, 0.04, 2.5, seed);
}
