import * as THREE from 'three';

// The knight is living shadow, not armour: silhouette edges erode into drifting smoke (noise discard on the
// fresnel edge), an inner violet glow breathes at the rim, and a flickering aura shell wraps every part.
export const SHADOW = {
  uTime: { value: 0 },
  uAura: { value: new THREE.Color(0.34, 0.1, 1.05) },
  uAuraStrength: { value: 1 },
  uFade: { value: 1 },
  uExposure: { value: 0 }, // 0..1: how lit the ground he stands on is (the sim's light model, wall shadows included)
  uLit: { value: 0.11 }, // how strongly real lights paint his edges
};

const NOISE = /* glsl */ `
  float sh_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float sh_noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sh_hash(i + vec3(0, 0, 0)), sh_hash(i + vec3(1, 0, 0)), f.x), mix(sh_hash(i + vec3(0, 1, 0)), sh_hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sh_hash(i + vec3(0, 0, 1)), sh_hash(i + vec3(1, 0, 1)), f.x), mix(sh_hash(i + vec3(0, 1, 1)), sh_hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;

/** Turn a standard material into living shadow. erosion 0..1: how much of the silhouette edge smokes away. */
export function shadowify<T extends THREE.MeshStandardMaterial>(mat: T, erosion = 0.35, key = 'shadow'): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SHADOW.uTime;
    sh.uniforms.uAura = SHADOW.uAura;
    sh.uniforms.uAuraStrength = SHADOW.uAuraStrength;
    sh.uniforms.uFade = SHADOW.uFade;
    sh.uniforms.uExposure = SHADOW.uExposure;
    sh.uniforms.uLit = SHADOW.uLit;
    sh.uniforms.uErosion = { value: erosion };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vShW; uniform float uTime; uniform vec3 uAura; uniform float uAuraStrength; uniform float uErosion; uniform float uFade;
        uniform float uExposure; uniform float uLit;
        ${NOISE}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize(vViewPosition);
          float fres = 1.0 - clamp(abs(dot(normalize(normal), vdir)), 0.0, 1.0);
          float n = sh_noise(vShW * 4.0 + vec3(0.0, -uTime * 1.8, uTime * 0.3));
          float n2 = sh_noise(vShW * 11.0 + vec3(0.0, -uTime * 3.1, 0.0));
          float edge = fres + uErosion * (n * 0.7 + n2 * 0.3) * 0.9;
          // the dawn ending dissolves him from the edges inward; strong light eats a little more of his edges
          if (edge > 1.05 - uErosion * (0.25 + 0.12 * uExposure) || n * 0.6 + n2 * 0.4 > uFade * 1.1) discard;
          totalEmissiveRadiance += uAura * pow(fres, 7.0) * (0.3 + 1.0 * n) * uAuraStrength * 0.55 * (1.0 - 0.45 * uExposure);
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // real light catching a living shadow: every light paints the edges that face it, in its own colour.
          // Black has no diffuse to light, so this is the only way the fire, the torch or the moon can touch him.
          vec3 lit = vec3(0.0);
          float fr = 1.0 - clamp(abs(dot(geometryNormal, geometryViewDir)), 0.0, 1.0);
          // only on his edges: he stays a black shadow with a lit rim, never a lit statue (the fire is very bright
          // at arm's length, so even a small share on surfaces facing the camera reads as a tan fill)
          float edgeW = pow(fr, 3.0);
          #if NUM_POINT_LIGHTS > 0
            for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
              IncidentLight il;
              getPointLightInfo(pointLights[i], geometryPosition, il);
              lit += il.color * smoothstep(-0.15, 0.7, dot(geometryNormal, il.direction)) * edgeW * (0.2 + 0.8 * uExposure);
            }
          #endif
          #if NUM_DIR_LIGHTS > 0
            for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
              IncidentLight il;
              getDirectionalLightInfo(directionalLights[i], il);
              lit += il.color * smoothstep(0.0, 0.7, dot(geometryNormal, il.direction)) * fr * fr * 1.6;
            }
          #endif
          // soft-compress so a light at arm's length warms him instead of blowing him out
          lit = lit / (1.0 + lit * 0.6);
          totalEmissiveRadiance += lit * uLit * uFade;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${key}-${erosion}`;
  return mat;
}

const SHELL_VERT = /* glsl */ `
  uniform float uTime; uniform float uPush;
  varying float vFres; varying float vN;
  ${NOISE}
  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    float n = sh_noise(wp * 3.2 + vec3(0.0, -uTime * 2.4, 0.0));
    vec3 p = position + normal * uPush * (0.45 + 1.1 * n);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 nv = normalize(normalMatrix * normal);
    vFres = 1.0 - abs(dot(nv, normalize(-mv.xyz)));
    vN = n;
    gl_Position = projectionMatrix * mv;
  }`;
const SHELL_FRAG = /* glsl */ `
  uniform vec3 uAura; uniform float uAuraStrength; uniform float uFade;
  varying float vFres; varying float vN;
  void main() {
    float a = pow(vFres, 2.6) * (0.2 + 0.8 * vN) * uAuraStrength * uFade;
    gl_FragColor = vec4(uAura * a * 0.4, 1.0);
  }`;

/** Additive back-face shell: the violet aura flickering around each body part. */
export function auraShellMaterial(push = 0.05): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    uniforms: { uTime: SHADOW.uTime, uPush: { value: push }, uAura: SHADOW.uAura, uAuraStrength: SHADOW.uAuraStrength, uFade: SHADOW.uFade },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
