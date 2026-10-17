import * as THREE from 'three';
import { CHARACTER } from '../config';
import { DISSOLVE_GLSL, NOISE_GLSL } from './ShadowMaterial';

export interface VesselUniforms {
  uTime: THREE.IUniform<number>;
  uEye: THREE.IUniform<THREE.Vector3>;
  /** 0 = whole body, 1 = burnt away (the shadow leaving / entering the vessel). */
  uDissolve: THREE.IUniform<number>;
}

/**
 * The runner "vessel": lit dark-purple knight armour per GLB material slot.
 * Shares the near-eye dissolve with the shadow body, so first person never clips into it, and
 * burns away with a violet edge when the shadow entity takes over.
 */
export function createVesselMaterials(): { forSlot: (name: string) => THREE.MeshStandardMaterial; uniforms: VesselUniforms } {
  const uniforms: VesselUniforms = {
    uTime: { value: 0 },
    uEye: { value: new THREE.Vector3() },
    uDissolve: { value: 0 },
  };
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const fallback = Object.values(CHARACTER.vessel.colors)[0] ?? 0xdddddd;

  const forSlot = (name: string): THREE.MeshStandardMaterial => {
    const hit = cache.get(name);
    if (hit) return hit;
    // Black undersuit reads matte; purple plate stays metallic.
    const isJoint = name === 'M_Joints';
    const material = new THREE.MeshStandardMaterial({
      color: CHARACTER.vessel.colors[name] ?? fallback,
      roughness: isJoint ? 0.78 : CHARACTER.vessel.roughness,
      metalness: isJoint ? 0.12 : CHARACTER.vessel.metalness,
      // The trimmed neck opening must not show a hollow shell.
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vVsWorld;`)
        .replace('#include <project_vertex>', `#include <project_vertex>\nvVsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform vec3 uEye;
          uniform float uDissolve;
          varying vec3 vVsWorld;
          ${NOISE_GLSL}`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec3 vWorldPos = vVsWorld;
          ${DISSOLVE_GLSL}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.55, 0.28, 1.0) * dsEdge * 2.0;`,
        );
    };
    cache.set(name, material);
    return material;
  };
  return { forSlot, uniforms };
}
