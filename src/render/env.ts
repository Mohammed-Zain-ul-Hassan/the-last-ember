// The diorama: ground, the stone ring, the ruined hall, the far skyline, the sky.

import * as THREE from 'three';
import type { Prop } from '../sim/layout';

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A procedural paved plaza: concentric rings of flagstones, hour marks, cracks and grit. */
function groundTexture(sizeM: number, px: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const R = rand(7);
  const m = px / sizeM; // pixels per metre
  const cx = px / 2;
  g.fillStyle = '#3b3631';
  g.fillRect(0, 0, px, px);
  // earth blotches
  for (let i = 0; i < 2600; i++) {
    const x = R() * px;
    const y = R() * px;
    const r = (0.3 + R() * 2.2) * m;
    const v = 40 + R() * 26;
    g.fillStyle = `rgba(${v + 6},${v},${v - 6},${0.05 + R() * 0.12})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // paved plaza
  const plazaR = 11.5;
  g.save();
  g.translate(cx, cx);
  g.fillStyle = '#2a2622';
  g.beginPath();
  g.arc(0, 0, plazaR * m, 0, Math.PI * 2);
  g.fill();
  for (let r = 1.7; r < plazaR - 0.2; r += 0.95) {
    const segs = Math.max(6, Math.round((Math.PI * 2 * r) / 1.25));
    const off = R() * Math.PI;
    for (let s = 0; s < segs; s++) {
      if (R() < 0.05) continue; // a missing stone
      const a0 = off + (s / segs) * Math.PI * 2 + 0.012 * (4 / r);
      const a1 = off + ((s + 1) / segs) * Math.PI * 2 - 0.012 * (4 / r);
      const v = 70 + R() * 34;
      g.fillStyle = `rgb(${v + 4},${v},${v - 6})`;
      g.beginPath();
      g.arc(0, 0, (r + 0.84) * m, a0, a1);
      g.arc(0, 0, (r + 0.06) * m, a1, a0, true);
      g.closePath();
      g.fill();
      // wear
      g.fillStyle = `rgba(20,16,14,${R() * 0.35})`;
      g.fill();
    }
  }
  // hour marks: the plaza is a dial
  g.strokeStyle = 'rgba(14,11,10,0.85)';
  g.lineWidth = 0.14 * m;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r0 = i % 3 === 0 ? 4.2 : 5.0;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0 * m, Math.sin(a) * r0 * m);
    g.lineTo(Math.cos(a) * 6.4 * m, Math.sin(a) * 6.4 * m);
    g.stroke();
  }
  g.lineWidth = 0.1 * m;
  g.beginPath();
  g.arc(0, 0, 6.7 * m, 0, Math.PI * 2);
  g.stroke();
  // soot around the hearth
  const soot = g.createRadialGradient(0, 0, 0.8 * m, 0, 0, 4.2 * m);
  soot.addColorStop(0, 'rgba(8,6,5,0.95)');
  soot.addColorStop(1, 'rgba(8,6,5,0)');
  g.fillStyle = soot;
  g.beginPath();
  g.arc(0, 0, 4.2 * m, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // cracks
  g.strokeStyle = 'rgba(12,10,9,0.7)';
  for (let i = 0; i < 140; i++) {
    let x = R() * px;
    let y = R() * px;
    g.lineWidth = (0.03 + R() * 0.06) * m;
    g.beginPath();
    g.moveTo(x, y);
    let a = R() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      a += (R() - 0.5) * 1.2;
      x += Math.cos(a) * (0.3 + R()) * m;
      y += Math.sin(a) * (0.3 + R()) * m;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // grit
  for (let i = 0; i < 9000; i++) {
    const v = R() < 0.5 ? 20 : 120;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + R() * 0.1})`;
    g.fillRect(R() * px, R() * px, 1 + R() * 2, 1 + R() * 2);
  }
  // fade the square's edge to the outer ground colour
  const edge = g.createRadialGradient(cx, cx, px * 0.36, cx, cx, px * 0.5);
  edge.addColorStop(0, 'rgba(36,32,29,0)');
  edge.addColorStop(1, 'rgba(36,32,29,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, px, px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function stoneGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 5, 1);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = rand(3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const taper = 1 - 0.22 * y;
    let x = p.getX(i) * taper;
    let z = p.getZ(i) * (1 - 0.12 * y);
    let yy = y;
    if (y > 0.99) yy = 1 - (Math.abs(p.getX(i)) < 0.1 ? 0 : 0.06) - R() * 0.05; // a weathered crown
    x += (R() - 0.5) * 0.04;
    z += (R() - 0.5) * 0.04;
    p.setXYZ(i, x, yy, z);
  }
  g.computeVertexNormals();
  return g;
}

function pillarGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.9, 1, 1, 12, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = rand(11);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.99) p.setY(i, 1 - R() * 0.12); // broken top
    // fluting
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const f = 1 + Math.cos(a * 12) * 0.03;
    p.setX(i, p.getX(i) * f);
    p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

function wallGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 8, 1, 1);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = rand(5);
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0.99) p.setY(i, 0.8 + R() * 0.2); // ragged top
  }
  g.computeVertexNormals();
  return g;
}

export const stoneMaterial = () =>
  new THREE.MeshStandardMaterial({ color: '#5a524a', roughness: 0.92, metalness: 0.0 });

export interface Env {
  group: THREE.Group;
  sky: THREE.Mesh;
  skyUniforms: {
    uTop: { value: THREE.Color };
    uHorizon: { value: THREE.Color };
    uBottom: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunGlow: { value: number };
    uStars: { value: number };
    uTime: { value: number };
  };
  coals: THREE.Mesh;
  coalMat: THREE.MeshBasicMaterial;
}

export function buildEnv(props: Prop[]): Env {
  const group = new THREE.Group();

  // ground
  const plazaSize = 76;
  const groundTex = groundTexture(plazaSize, 2048);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(plazaSize, plazaSize),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(plazaSize * 0.49, 420, 64, 1),
    new THREE.MeshStandardMaterial({ color: '#24201d', roughness: 1 }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.01;
  outer.receiveShadow = true;
  group.add(outer);

  // instanced props
  const mat = stoneMaterial();
  const byKind = {
    stone: props.filter((p) => p.kind === 'stone'),
    pillar: props.filter((p) => p.kind === 'pillar'),
    wall: props.filter((p) => p.kind === 'wall'),
  };
  const dummy = new THREE.Object3D();
  const make = (geo: THREE.BufferGeometry, list: Prop[], f: (p: Prop) => void) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      f(p);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  make(stoneGeometry(), byKind.stone, (p) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, -p.rot, 0);
    dummy.scale.set(p.w, p.h, p.d);
  });
  make(pillarGeometry(), byKind.pillar, (p) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.x * 3.1, 0);
    dummy.scale.set(p.w / 2, p.h, p.w / 2);
  });
  make(wallGeometry(), byKind.wall, (p) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.set(p.w, p.h, p.d);
  });

  // fallen drums and rubble: decoration, no gameplay shadow (kept low so it barely casts)
  const R = rand(21);
  const rubbleGeo = new THREE.DodecahedronGeometry(1, 0);
  const rubble = new THREE.InstancedMesh(rubbleGeo, mat, 90);
  for (let i = 0; i < 90; i++) {
    const a = R() * Math.PI * 2;
    const r = 12 + R() * 17;
    dummy.position.set(Math.sin(a) * r, 0.05, -Math.cos(a) * r);
    const s = 0.15 + R() * 0.35;
    dummy.scale.set(s * (1 + R()), s * 0.6, s);
    dummy.rotation.set(R(), R() * 6, R());
    dummy.updateMatrix();
    rubble.setMatrixAt(i, dummy.matrix);
  }
  rubble.receiveShadow = true;
  group.add(rubble);

  // far skyline: ruined towers and dead trees, only seen in low shots, swallowed by fog
  const farMat = new THREE.MeshStandardMaterial({ color: '#141216', roughness: 1 });
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  towerGeo.translate(0, 0.5, 0);
  const towers = new THREE.InstancedMesh(towerGeo, farMat, 46);
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2;
    const r = 48 + R() * 60;
    dummy.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
    const w = 2 + R() * 5;
    dummy.scale.set(w, 4 + R() * (R() < 0.2 ? 26 : 10), w * (0.6 + R() * 0.6));
    dummy.rotation.set(0, R() * 3, (R() - 0.5) * 0.12);
    dummy.updateMatrix();
    towers.setMatrixAt(i, dummy.matrix);
  }
  group.add(towers);
  const treeGeo = new THREE.ConeGeometry(0.5, 1, 5);
  treeGeo.translate(0, 0.5, 0);
  const trees = new THREE.InstancedMesh(treeGeo, farMat, 60);
  for (let i = 0; i < 60; i++) {
    const a = R() * Math.PI * 2;
    const r = 34 + R() * 30;
    dummy.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
    const h = 3 + R() * 6;
    dummy.scale.set(0.5 + R() * 0.5, h, 0.5 + R() * 0.5);
    dummy.rotation.set((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
  }
  group.add(trees);

  // hearth: a stone bowl with a bed of coals
  const bowlProfile = [
    [0.0, 0.32],
    [0.95, 0.32],
    [1.0, 0.55],
    [1.22, 0.62],
    [1.38, 0.42],
    [1.42, 0.05],
    [1.5, 0.0],
  ]
    .reverse()
    .map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile, 24), mat);
  bowl.castShadow = false;
  bowl.receiveShadow = true;
  group.add(bowl);
  const coalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 0.2) });
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.98, 20), coalMat);
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = 0.36;
  group.add(coals);

  // sky dome
  const skyUniforms = {
    uTop: { value: new THREE.Color('#0c0a1c') },
    uHorizon: { value: new THREE.Color('#2a1a3c') },
    uBottom: { value: new THREE.Color('#050408') },
    uSunDir: { value: new THREE.Vector3(-1, 0.05, 0).normalize() },
    uSunGlow: { value: 0 },
    uStars: { value: 0.5 },
    uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir;
        uniform float uSunGlow; uniform float uStars; uniform float uTime;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 6.0, 0.0, 1.0));
          float s = max(0.0, dot(d, normalize(uSunDir)));
          col += vec3(1.6, 0.55, 0.22) * uSunGlow * (pow(s, 8.0) * 0.8 + pow(s, 400.0) * 6.0);
          vec3 cell = floor(d * 260.0);
          float st = hash(cell);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0);
          col += vec3(0.9, 0.85, 1.0) * step(0.9965, st) * uStars * smoothstep(0.02, 0.3, h) * tw * 1.5;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;

  return { group, sky, skyUniforms, coals, coalMat };
}
