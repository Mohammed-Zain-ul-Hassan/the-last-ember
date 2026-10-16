import * as THREE from 'three';

// Fresnel rim light injected into standard materials: silhouettes get a thin glowing edge tinted by the sky.
// One shared uniform set so the stage can retint every rim when the hour changes.
export const RIM = {
  uRimColor: { value: new THREE.Color('#ff9a5a') },
  uRimPower: { value: 3.6 },
  uRimStrength: { value: 0.85 },
};

export function rimify<T extends THREE.MeshStandardMaterial>(mat: T, strength = 1, key = 'rim'): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = RIM.uRimColor;
    shader.uniforms.uRimPower = RIM.uRimPower;
    shader.uniforms.uRimStrength = RIM.uRimStrength;
    shader.uniforms.uRimLocal = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength; uniform float uRimLocal;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize(vViewPosition);
          float rim = 1.0 - clamp(abs(dot(normalize(normal), vdir)), 0.0, 1.0);
          float up = 0.55 + 0.45 * clamp(normal.y, -1.0, 1.0);
          totalEmissiveRadiance += uRimColor * pow(rim, uRimPower) * uRimStrength * uRimLocal * up;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${key}-${strength}`;
  return mat;
}
