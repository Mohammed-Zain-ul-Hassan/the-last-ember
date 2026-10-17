import * as THREE from 'three';
import { SHADOW } from '../config';

export interface ShadowUniforms {
  uTime: THREE.IUniform<number>;
  uEye: THREE.IUniform<THREE.Vector3>;
  uRimColor: THREE.IUniform<THREE.Color>;
  uRimStrength: THREE.IUniform<number>;
  uErosion: THREE.IUniform<number>;
  /** 0 = whole body, 1 = fully dissolved (form transitions). */
  uDissolve: THREE.IUniform<number>;
}

/**
 * Fragment snippet shared by both bodies: the near-eye dither dissolve (so the camera never
 * sees a hard cut through the body) and the form-transition dissolve. Needs `vWorldPos`,
 * `uEye`, `uDissolve`, `uTime` and NOISE_GLSL; defines `dsEdge` (0..1 glow at the burn edge).
 */
export const DISSOLVE_GLSL = /* glsl */ `
  float dsDist = length(uEye - vWorldPos);
  float dsInk = sh_fbm(vWorldPos * ${SHADOW.noiseScale.toFixed(2)} + vec3(0.0, -uTime * ${SHADOW.noiseSpeed.toFixed(2)}, uTime * 0.31));
  float dsNear = smoothstep(${SHADOW.nearFadeStart.toFixed(3)}, ${SHADOW.nearFadeEnd.toFixed(3)}, dsDist);
  float dsDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dsNear < mix(dsDither, dsInk, 0.5)) discard;
  float dsBurn = sh_fbm(vWorldPos * 7.0 + 11.3);
  if (uDissolve > 0.0 && dsBurn < uDissolve * 1.08) discard;
  float dsEdge = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.07, dsBurn - uDissolve * 1.08) : 0.0;
`;

export const NOISE_GLSL = /* glsl */ `
  // Value noise + fbm, cheap enough for a full-body pass.
  float sh_hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float sh_noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sh_hash(i + vec3(0, 0, 0)), sh_hash(i + vec3(1, 0, 0)), f.x),
                   mix(sh_hash(i + vec3(0, 1, 0)), sh_hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sh_hash(i + vec3(0, 0, 1)), sh_hash(i + vec3(1, 0, 1)), f.x),
                   mix(sh_hash(i + vec3(0, 1, 1)), sh_hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float sh_fbm(vec3 p) {
    return 0.55 * sh_noise(p) + 0.3 * sh_noise(p * 2.03 + 7.1) + 0.15 * sh_noise(p * 4.1 + 3.7);
  }
`;

/**
 * Ink body: near-black, unlit, with a noise-eroded silhouette, a faint ember rim, and a
 * dithered dissolve close to the eye so the camera never sees a hard cut through the body.
 * Built on MeshBasicMaterial so skinning and fog keep working.
 */
export function createShadowMaterial(): { material: THREE.MeshBasicMaterial; uniforms: ShadowUniforms } {
  const uniforms: ShadowUniforms = {
    uTime: { value: 0 },
    uEye: { value: new THREE.Vector3() },
    uRimColor: { value: new THREE.Color(SHADOW.rimColor) },
    uRimStrength: { value: SHADOW.rimStrength },
    uErosion: { value: SHADOW.erosion },
    uDissolve: { value: 0 },
  };
  // Double-sided so the trimmed neck opening never shows a hollow shell: the inside is ink too.
  const material = new THREE.MeshBasicMaterial({ color: SHADOW.baseColor, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vShWorld;
        varying vec3 vShNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vShWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef USE_SKINNING
          vShNormal = normalize(mat3(modelMatrix) * objectNormal);
        #else
          vShNormal = normalize(mat3(modelMatrix) * normal);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uEye;
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uErosion;
        uniform float uDissolve;
        varying vec3 vShWorld;
        varying vec3 vShNormal;
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Rim from the render camera; the dissolve from the player's eye (they differ in debug views).
        vec3 shV = normalize(cameraPosition - vShWorld);
        float shDist = length(uEye - vShWorld);
        vec3 shN = normalize(vShNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float shFres = 1.0 - clamp(abs(dot(shN, shV)), 0.0, 1.0);
        float shInk = sh_fbm(vShWorld * ${SHADOW.noiseScale.toFixed(2)} + vec3(0.0, -uTime * ${SHADOW.noiseSpeed.toFixed(2)}, uTime * 0.31));

        // Ink edge: the silhouette is eaten away by drifting noise, more so close to the eye
        // so your own hands fray into mist.
        float shErode = uErosion * mix(${SHADOW.nearErosionBoost.toFixed(2)}, 1.0, smoothstep(0.35, 1.0, shDist));
        if (pow(shFres, 2.2) * shErode > shInk * 0.75) discard;

        // Near the eye the body breaks up into smoke instead of clipping; form shifts burn it away.
        vec3 vWorldPos = vShWorld;
        ${DISSOLVE_GLSL}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// A soft, drifting haze towards the silhouette instead of a hard lit rim, so the body
        // reads as smoke. Limbs right under the camera are seen edge-on; keep theirs fainter.
        float shRimNear = mix(0.35, 1.0, smoothstep(0.3, 1.5, shDist));
        float shMist = pow(shFres, 2.5) * smoothstep(0.25, 0.85, shInk);
        vec3 shRim = uRimColor * uRimStrength * shRimNear * shMist;
        outgoingLight = diffuseColor.rgb + shRim + vec3(0.55, 0.28, 1.0) * dsEdge * 1.6;
        gl_FragColor = vec4(outgoingLight, 1.0);`,
      );
  };
  return { material, uniforms };
}
