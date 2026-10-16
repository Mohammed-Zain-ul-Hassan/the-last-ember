import * as THREE from 'three';

// The knight is depth-tested as if he stood DEPTH.uDepthPull metres nearer the camera than he does. Only his depth
// moves, not his size or place on screen, so props he stands against or walks past (low walls, the hearth's steps,
// grass, rocks, enemies at his side) never cut into him, the way a 2D game keeps its hero on top of the playfield.
// The big foreground silhouettes, 5+ m in front of the lane, still pass in front of him.
export const DEPTH = { uDepthPull: { value: 3.5 } };

/** GLSL, after gl_Position is set: pull this vertex's depth toward the camera (never past the near plane). */
export const PULL_GLSL = /* glsl */ `
  {
    float pz = min(mvPosition.z + uDepthPull, -0.15);
    vec4 pp = projectionMatrix * vec4(mvPosition.xy, pz, 1.0);
    gl_Position.z = pp.z / pp.w * gl_Position.w;
  }`;

/** Pull a built-in material (mesh or sprite) forward. Chains any onBeforeCompile it already has. */
export function pullForward<T extends THREE.Material>(mat: T): T {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.uniforms.uDepthPull = DEPTH.uDepthPull;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uDepthPull;')
      .replace('#include <logdepthbuf_vertex>', `#include <logdepthbuf_vertex>\n${PULL_GLSL}`);
  };
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}|pull`;
  return mat;
}
