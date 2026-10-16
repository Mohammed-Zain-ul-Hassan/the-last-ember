import * as THREE from 'three';
import { pullForward } from './depth';
import { RIM } from './rim';
import { taperTube } from './shapes';

// The greatsword. A diamond-section blade: two lit facets meet at a raised spine, so the flat catches light on one
// side and falls dark on the other. Both cutting edges burn as razor lines, and a rune channel runs down the spine
// where fire pulses from the hilt to the point. The knight flares it on swings and charges through SWORD.
export const SWORD = {
  uTime: { value: 0 },
  uEdge: { value: new THREE.Color(4.0, 1.5, 0.35) },
  uRune: { value: new THREE.Color(3.4, 0.9, 0.15) },
  uFlare: { value: 0 },
};

/** One look for the blade: its steel, burning edges, runes, pommel stone, the light it casts, its aura and its slash. */
export interface SwordPalette {
  steel: number;
  edge: THREE.Color;
  rune: THREE.Color;
  gem: THREE.Color;
  light: number;
  auraIn: THREE.Color;
  auraOut: THREE.Color;
  trail: THREE.Color;
}
const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const EMBER_TORCH: SwordPalette = {
  steel: 0x17110f, edge: c(5.0, 2.6, 0.8), rune: c(4.6, 1.9, 0.4), gem: c(5.0, 2.4, 0.7), light: 0xff8a3a,
  auraIn: c(3.6, 1.9, 0.6), auraOut: c(1.3, 0.38, 0.06), trail: c(4.2, 2.0, 0.6),
};
/**
 * ember: blackened steel with molten edges, the last ember carried in a shadow's hand (the default).
 * moonsteel: pale steel with cold silver-blue edges. violet: the shadow-fire blade from the first pass.
 * In the torch phase every blade carries the fire.
 */
export const SWORD_PALETTES: Record<'ember' | 'moonsteel' | 'violet', { night: SwordPalette; torch: SwordPalette }> = {
  ember: {
    night: {
      steel: 0x15111a, edge: c(4.0, 1.5, 0.35), rune: c(3.4, 0.9, 0.15), gem: c(4.6, 1.8, 0.4), light: 0xff6a24,
      auraIn: c(3.0, 1.35, 0.4), auraOut: c(1.0, 0.24, 0.04), trail: c(3.4, 1.3, 0.35),
    },
    torch: EMBER_TORCH,
  },
  moonsteel: {
    night: {
      steel: 0x343a46, edge: c(2.3, 2.7, 3.6), rune: c(0.7, 1.4, 3.4), gem: c(1.8, 2.6, 4.6), light: 0x9ec8ff,
      auraIn: c(1.3, 1.7, 2.9), auraOut: c(0.22, 0.38, 0.9), trail: c(2.2, 2.6, 3.6),
    },
    torch: EMBER_TORCH,
  },
  violet: {
    night: {
      steel: 0x16151e, edge: c(1.5, 1.15, 3.6), rune: c(0.9, 0.32, 3.2), gem: c(2.2, 1.0, 4.6), light: 0x8a5cff,
      auraIn: c(1.25, 0.95, 3.1), auraOut: c(0.32, 0.12, 1.15), trail: c(1.6, 1.3, 3.4),
    },
    torch: EMBER_TORCH,
  },
};

/** Blade length, and where it leaves the guard in the sword's frame (the hand is the origin, the blade points -y). */
export const BLADE_LEN = 1.62;
export const BLADE_ROOT = -0.14;

/** Half-width and half-thickness along the blade (t = 0 at the guard, 1 at the point). */
function profile(t: number): { w: number; th: number } {
  let w = 0.064 - 0.014 * t;
  if (t < 0.05) w *= 0.86 + 0.14 * (t / 0.05); // a short ricasso under the guard
  if (t > 0.82) w *= Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)); // an ogive point
  const th = 0.017 * (1 - 0.4 * t) * Math.min(1, w / 0.03);
  return { w: Math.max(w, 0.0004), th: Math.max(th, 0.0003) };
}

/**
 * Four facet strips, one per quadrant of the diamond, with their own vertices so the spine and edges stay crisp.
 * aEdge runs 0 at the spine to 1 at the edge; aLen runs 0 at the guard to 1 at the point.
 */
function bladeGeometry(): THREE.BufferGeometry {
  const N = 44;
  const pos: number[] = [];
  const edge: number[] = [];
  const len: number[] = [];
  const idx: number[] = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const { w, th } = profile(t);
      const y = -t * BLADE_LEN;
      pos.push(0, y, sz * th, sx * w, y, 0);
      edge.push(0, 1);
      len.push(t, t);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      // outward winding flips with the quadrant
      if (sx * sz > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dark steel with burning edges, a pulsing rune channel and a sky-tinted rim. */
export function bladeMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0x16151e, roughness: 0.24, metalness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uSwTime: SWORD.uTime, uSwEdge: SWORD.uEdge, uSwRune: SWORD.uRune, uSwFlare: SWORD.uFlare,
      uRimColor: RIM.uRimColor, uRimStrength: RIM.uRimStrength,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge; attribute float aLen; varying float vEdge; varying float vLen;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge; vLen = aLen;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSwTime; uniform vec3 uSwEdge; uniform vec3 uSwRune; uniform float uSwFlare; uniform vec3 uRimColor; uniform float uRimStrength;
        varying float vEdge; varying float vLen;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // slow waves of shadow-fire run from the hilt to the point
          float wave = fract(vLen * 1.3 - uSwTime * 0.65);
          float band = exp(-wave * 8.0) + exp(-(1.0 - wave) * 28.0) * 0.6;
          float edge = smoothstep(0.8, 1.0, vEdge);
          edge *= edge;
          float spine = 1.0 - smoothstep(0.0, 0.16, vEdge);
          // runes: broken segments down the spine that flicker out of step
          float seg = fract(vLen * 17.0);
          float rune = step(0.2, seg) * step(seg, 0.74) * step(0.05, vLen) * step(vLen, 0.78);
          float flick = 0.7 + 0.3 * sin(uSwTime * 6.0 + floor(vLen * 17.0) * 2.3);
          float tip = smoothstep(0.88, 1.0, vLen);
          totalEmissiveRadiance += uSwEdge * edge * (0.7 + 0.7 * band + uSwFlare * 1.8 + tip * 1.4);
          totalEmissiveRadiance += uSwRune * spine * rune * flick * (0.3 + 1.2 * band + uSwFlare * 1.3);
          vec3 vdir = normalize(vViewPosition);
          float rim = 1.0 - clamp(abs(dot(normalize(normal), vdir)), 0.0, 1.0);
          totalEmissiveRadiance += uRimColor * pow(rim, 3.0) * uRimStrength * 1.3;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'sword-blade';
  return pullForward(mat);
}

export interface SwordParts {
  group: THREE.Group;
  /** Everything the sword's own aura wraps. */
  meshes: THREE.Mesh[];
  blade: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  gem: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
}

/** Build the sword in its hand frame. steel: guard and pommel; grip: the wrapped handle; gem: the pommel stone. */
export function buildSword(steel: THREE.Material, grip: THREE.Material): SwordParts {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const add = <T extends THREE.Mesh>(m: T, x = 0, y = 0, z = 0, shadow = false): T => {
    m.position.set(x, y, z);
    m.castShadow = shadow; // only the blade and guard are big enough to read in a shadow
    group.add(m);
    meshes.push(m);
    return m;
  };

  // grip, bound in three raised wraps
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.031, 0.27, 12), grip), 0, 0.03, 0);
  for (const y of [-0.06, 0.03, 0.12]) {
    const wrap = add(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.007, 6, 16), grip), 0, y, 0);
    wrap.rotation.x = Math.PI / 2;
  }
  // pommel: a cage of steel around a burning stone
  const cage = add(new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.011, 8, 20), steel), 0, 0.225, 0);
  cage.scale.y = 1.25;
  const gem = add(
    new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), pullForward(new THREE.MeshBasicMaterial({ color: new THREE.Color(4.6, 1.8, 0.4), toneMapped: false, transparent: true }))),
    0, 0.225, 0,
  );
  gem.scale.y = 1.35;
  // crossguard: a block with quillons that sweep down toward the blade, like the horns of his helm
  add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.075), steel), 0, -0.115, 0);
  for (const s of [1, -1]) {
    const pts = [[0.04, 0], [0.12, 0.012], [0.2, -0.01], [0.25, -0.06], [0.262, -0.125]].map(([x, y]) => new THREE.Vector3(x * s, y, 0));
    add(new THREE.Mesh(taperTube(pts, 0.026, 0.38, 20, 10), steel), 0, -0.115, 0, true);
  }
  // langet: a steel point that runs a little way down the blade over the ricasso
  const langet = add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.15, 4), steel), 0, -0.2, 0);
  langet.rotation.set(Math.PI, Math.PI / 4, 0);
  langet.scale.z = 0.45;

  const blade = add(new THREE.Mesh(bladeGeometry(), bladeMaterial()), 0, BLADE_ROOT, 0, true);

  // the blade lights the ground around him (and his own edges) in its own colour
  const light = new THREE.PointLight(0xff6a24, 0, 4.5, 2);
  light.position.y = BLADE_ROOT - BLADE_LEN * 0.55;
  group.add(light);
  return { group, meshes, blade, gem, light };
}

/** A point on the blade in the sword's frame: t along the blade (0 guard, 1 point), side -1/0/1 across it. */
export function bladePoint(t: number, side: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(side * profile(t).w, BLADE_ROOT - t * BLADE_LEN, 0);
}
