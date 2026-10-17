import * as THREE from 'three';
import { FROZEN, FROZEN_GLSL } from './frozenShadows';

// Surface detail for the whole world, computed in the shader from world position, so it never stretches however a
// block is sized and costs no texture memory:
//   - albedo variation (stone is never one flat colour), streaked rain stains down vertical faces
//   - fine bump: pitting on stone, grain on timber, a little on plaster
//   - wet: everything a bit glossier; on upward faces, puddles that go mirror-smooth and catch the sky and the fire,
//     with rain ripples ringing across them while it rains
// It chains onto whatever onBeforeCompile a material already has (the rim light).

export type SurfaceKind = 'stone' | 'paving' | 'plaster' | 'timber' | 'earth' | 'iron';

/**
 * Noise from a small tiling 3D texture of random values: one filtered read per octave instead of eight hashes.
 * The lookup coordinate is bent through smoothstep first, so the hardware's linear filter gives the same smooth
 * value noise (no faceting in the bump).
 */
function noiseTexture(): THREE.Data3DTexture {
  const n = 32;
  const data = new Uint8Array(n * n * n);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** Shared by every patched material: the stage drives them per frame. */
export const SURFACE = {
  uNoise: { value: noiseTexture() },
  uTime: { value: 0 },
  uWet: { value: 0.6 }, // 0 dry .. 1 soaked (puddles grow with it)
  uRain: { value: 0 }, // 0..1 ripple strength
  uDetail: { value: 1 }, // 0 turns the bump off (low quality)
};

const KIND: Record<SurfaceKind, { scale: number; vary: number; bump: number; puddle: number; stain: number; grain: number }> = {
  stone: { scale: 1.7, vary: 0.55, bump: 0.9, puddle: 0.6, stain: 0.5, grain: 0 },
  paving: { scale: 2.2, vary: 0.5, bump: 0.6, puddle: 1, stain: 0, grain: 0 },
  plaster: { scale: 0.9, vary: 0.45, bump: 0.35, puddle: 0.2, stain: 1, grain: 0 },
  timber: { scale: 1.2, vary: 0.5, bump: 0.7, puddle: 0.3, stain: 0.3, grain: 1 },
  earth: { scale: 0.6, vary: 0.6, bump: 0.5, puddle: 1.3, stain: 0, grain: 0 },
  iron: { scale: 3, vary: 0.35, bump: 0.25, puddle: 0, stain: 0.6, grain: 0 },
};

const NOISE = /* glsl */ `
  float sfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float sfNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return texture(uSfNoise, (i + f + 0.5) / 32.0).r;
  }
  float sfFbm(vec3 p) { return sfNoise(p) * 0.55 + sfNoise(p * 2.03) * 0.3 + sfNoise(p * 4.11) * 0.15; }
  float sfLow(vec3 p) { return sfNoise(p) * 0.65 + sfNoise(p * 2.1) * 0.35; }
  // rain rings: a grid of cells, each with its own drop landing on its own beat
  float sfRipple(vec2 p, float t) {
    vec2 c = floor(p); vec2 f = fract(p);
    float h = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      float r = sfHash(vec3(c + o, 7.0));
      vec2 at = o + vec2(sfHash(vec3(c + o, 1.0)), sfHash(vec3(c + o, 2.0)));
      float ph = fract(t * 1.3 + r);
      float d = length(f - at);
      float ring = d - ph * 0.9;
      h += sin(clamp(ring * 28.0, -6.2832, 6.2832)) * smoothstep(0.16, 0.0, abs(ring)) * (1.0 - ph) * (1.0 - ph);
    }
    return h;
  }`;

export function surface<T extends THREE.MeshStandardMaterial>(mat: T, kind: SurfaceKind): T {
  const k = KIND[kind];
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.uSfTime = SURFACE.uTime;
    shader.uniforms.uSfNoise = SURFACE.uNoise;
    shader.uniforms.uSfWet = SURFACE.uWet;
    shader.uniforms.uSfRain = SURFACE.uRain;
    shader.uniforms.uSfDetail = SURFACE.uDetail;
    shader.uniforms.uFzMap = FROZEN.uFzMap;
    shader.uniforms.uFzOwner = FROZEN.uFzOwner;
    shader.uniforms.uFzOwnerMat = FROZEN.uFzOwnerMat;
    shader.uniforms.uFzMat = FROZEN.uFzMat;
    shader.uniforms.uFzK = FROZEN.uFzK;
    shader.uniforms.uFzDebug = FROZEN.uFzDebug;
    shader.uniforms.uFzLight = FROZEN.uFzLight;
    shader.uniforms.uFzDir = FROZEN.uFzDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSfPos;\nvarying vec3 vSfNrm;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          mat4 sfM = modelMatrix;
          #ifdef USE_INSTANCING
            sfM = modelMatrix * instanceMatrix;
          #endif
          vSfPos = (sfM * vec4(transformed, 1.0)).xyz;
          vSfNrm = normalize(mat3(sfM) * objectNormal);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSfPos;
        varying vec3 vSfNrm;
        uniform float uSfTime; uniform float uSfWet; uniform float uSfRain; uniform float uSfDetail;
        uniform highp sampler3D uSfNoise;
        ${NOISE}
        ${FROZEN_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 sfP = vSfPos * ${k.scale.toFixed(3)};
        float sfN = sfFbm(sfP);
        float sfUp = clamp(vSfNrm.y, 0.0, 1.0);
        // puddles: low, broad patches on upward faces; they grow as the world gets wetter
        float sfPud = sfUp > 0.8 ? smoothstep(0.62 - uSfWet * 0.12, 0.66 - uSfWet * 0.12, sfLow(vSfPos * 0.28 + 3.7)) * ${k.puddle.toFixed(3)} * uSfWet : 0.0;
        sfPud = clamp(sfPud, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0 - ${k.vary.toFixed(3)} * 0.6, 1.0 + ${k.vary.toFixed(3)} * 0.5, sfN);
        // rain stains: dark streaks running down vertical faces
        float sfStain = (1.0 - sfUp) * ${k.stain.toFixed(3)} * smoothstep(0.45, 0.8, sfNoise(vec3(vSfPos.x * 2.3 + vSfPos.z * 2.3, vSfPos.y * 0.35, 1.0)));
        diffuseColor.rgb *= 1.0 - sfStain * 0.45;
        diffuseColor.rgb *= mix(1.0, 0.55, sfPud);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor *= mix(1.0, 0.72, uSfWet * (0.4 + 0.6 * sfUp));
        roughnessFactor = mix(roughnessFactor, 0.05, sfPud);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bump from a height field in world space (screen-space derivatives, as three's bump map does)
          float sfH = (sfLow(vSfPos * ${(k.scale * 4.0).toFixed(3)}) - 0.5) * ${k.bump.toFixed(3)} * (1.0 - sfPud) * uSfDetail;
          ${k.grain > 0 ? 'sfH += sin(dot(vSfPos, vec3(0.0, 18.0, 0.0)) + sfNoise(vSfPos * vec3(0.6, 9.0, 0.6)) * 6.0) * 0.12 * uSfDetail;' : ''}
          if (sfPud * uSfRain > 0.01) sfH += sfRipple(vSfPos.xz * 2.2, uSfTime) * sfPud * uSfRain * 0.6;
          vec3 sfDx = dFdx(-vViewPosition);
          vec3 sfDy = dFdy(-vViewPosition);
          vec3 sfR1 = cross(sfDy, normal);
          vec3 sfR2 = cross(normal, sfDx);
          float sfDet = dot(sfDx, sfR1);
          // fade the bump out with distance: far off the detail is smaller than a pixel and only sparkles
          sfH *= 1.0 - smoothstep(12.0, 32.0, length(vViewPosition));
          vec3 sfGrad = sign(sfDet) * (dFdx(sfH) * sfR1 + dFdy(sfH) * sfR2);
          normal = normalize(abs(sfDet) * normal - sfGrad * 0.06);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // the still shadow of the dawn that never came: it darkens even the firelight it lies in
          vec3 fzN = normalize(vSfNrm);
          float fz = fzShadow(vSfPos, fzN);
          // the frozen dawn's sheen where its light falls (a cold glaze, so its shadows read even off the fire's ground)...
          float fzL = max(dot(fzN, uFzDir), 0.0) * (1.0 - fz) * uFzK;
          outgoingLight += (diffuseColor.rgb * 4.0 + 0.06) * uFzLight * fzL;
          // ...and its shadow, which even the fire cannot lift
          outgoingLight = mix(outgoingLight, outgoingLight * 0.18 + vec3(0.004, 0.006, 0.016), fz);
          // the one with no owner: ink black, and at its edge the violet of his own aura
          float fo = fzOwner(vSfPos, fzN);
          outgoingLight = mix(outgoingLight, vec3(0.0), fo * 0.95);
          outgoingLight += vec3(0.42, 0.2, 1.1) * clamp(fo * (1.0 - fo) * 4.0, 0.0, 1.0) * 0.55 * uFzK;
          if (uFzDebug > 0.5) outgoingLight = mix(outgoingLight, vec3(0.0, 2.0, 0.0), fo);
          if (uFzDebug > 0.5) outgoingLight = mix(outgoingLight, vec3(2.0, 0.0, 0.0), fz);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|sf-${kind}`;
  mat.envMapIntensity = kind === 'iron' ? 0.8 : 0.45;
  return mat;
}
