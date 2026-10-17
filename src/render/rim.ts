import * as THREE from 'three';

// Fresnel rim light injected into standard materials: silhouettes get a thin glowing edge tinted by the sky.
// One shared uniform set so the stage can retint every rim when the hour changes.
export const RIM = {
  uRimColor: { value: new THREE.Color('#ff9a5a') },
  uRimPower: { value: 3.6 },
  uRimStrength: { value: 0.85 },
};
export type RimSet = typeof RIM;

/**
 * Every enemy's rim: a fixed ember red, not the sky's tint. Black wraiths against a night sky were invisible except
 * for their eyes; now anything that can hurt him reads at a glance (the knight is violet, the hearth gold).
 */
export const ENEMY_RIM: RimSet = {
  uRimColor: { value: new THREE.Color(1.0, 0.22, 0.07) },
  uRimPower: { value: 3.0 },
  uRimStrength: { value: 1.15 },
};

/** Per-material handles: uRimHot 0..1 turns the rim white-hot (a wind-up telegraph). */
export interface RimHandles {
  hot: { value: number };
}

/** `_key` names the material for readers only: every rim shares one program (see below). */
export function rimify<T extends THREE.MeshStandardMaterial>(mat: T, strength = 1, _key = 'rim', set: RimSet = RIM): T {
  const hot = { value: 0 };
  (mat.userData as { rim?: RimHandles }).rim = { hot };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = set.uRimColor;
    shader.uniforms.uRimPower = set.uRimPower;
    shader.uniforms.uRimStrength = set.uRimStrength;
    shader.uniforms.uRimLocal = { value: strength };
    shader.uniforms.uRimHot = hot;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength; uniform float uRimLocal; uniform float uRimHot;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize(vViewPosition);
          float rim = 1.0 - clamp(abs(dot(normalize(normal), vdir)), 0.0, 1.0);
          float up = 0.55 + 0.45 * clamp(normal.y, -1.0, 1.0);
          vec3 rc = mix(uRimColor, vec3(3.2, 1.7, 0.7), uRimHot);
          float pw = mix(uRimPower, 1.6, uRimHot);
          totalEmissiveRadiance += rc * pow(rim, pw) * uRimStrength * uRimLocal * (1.0 + 1.6 * uRimHot) * up;
        }`,
      );
  };
  // the rim's code is the same for every material (strength, colour and heat are uniforms): one program key for all of
  // them. A key per material and strength split identical shaders into dozens of programs, and Chrome on Metal keeps
  // only 128 GPU pipelines per context before it evicts and rebuilds them mid-play (ANGLE mtl_pipeline_cache).
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}

/** Drive a material's wind-up glow (0 = its normal rim, 1 = white-hot). */
export function setRimHot(mat: THREE.Material, v: number): void {
  const h = (mat.userData as { rim?: RimHandles }).rim;
  if (h) h.hot.value = v;
}

/**
 * Fade a material in or out. Turning `transparent` on or off picks a different shader, and three only notices when
 * told (without needsUpdate a shade compiled while alive stayed opaque and popped out instead of dissolving).
 */
export function setFade(mat: THREE.Material, opacity: number): void {
  const fading = opacity < 0.999;
  if (mat.transparent !== fading) {
    mat.transparent = fading;
    mat.needsUpdate = true;
  }
  mat.opacity = opacity;
}
