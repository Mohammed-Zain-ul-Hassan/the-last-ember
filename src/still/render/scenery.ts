import * as THREE from 'three';
import { Rng } from '../../sim/rng';
import type { District } from '../sim/types';

// What tells the story without a word: carved reliefs on the walls (who came through the gate, the market, the water
// rising, the priests, a fire held up, the wave, the door), rain falling that glints where the flame touches it,
// birds stopped mid-wingbeat, and the dark of the frozen city beyond the walls.

/** The flame's position for the rain's glint, and the clock that moves it (main sets both every frame). */
export const SCENERY = { uFlame: { value: new THREE.Vector3() }, uLight: { value: 1 }, uTime: { value: 0 } };

// ------------------------------------------------------------------ carvings
type Scene = 'crowd' | 'market' | 'water' | 'priests' | 'fire' | 'wave' | 'door';

function figure(g: CanvasRenderingContext2D, x: number, y: number, h: number, robe = false, arm = 0): void {
  const r = h * 0.11;
  g.beginPath();
  g.arc(x, y - h + r, r, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  if (robe) {
    g.moveTo(x - h * 0.08, y - h * 0.78);
    g.lineTo(x + h * 0.08, y - h * 0.78);
    g.lineTo(x + h * 0.2, y);
    g.lineTo(x - h * 0.2, y);
  } else {
    g.moveTo(x - h * 0.09, y - h * 0.78);
    g.lineTo(x + h * 0.09, y - h * 0.78);
    g.lineTo(x + h * 0.07, y - h * 0.38);
    g.lineTo(x + h * 0.1, y);
    g.lineTo(x + h * 0.03, y);
    g.lineTo(x, y - h * 0.32);
    g.lineTo(x - h * 0.03, y);
    g.lineTo(x - h * 0.1, y);
    g.lineTo(x - h * 0.07, y - h * 0.38);
  }
  g.closePath();
  g.fill();
  if (arm) {
    g.lineWidth = h * 0.05;
    g.beginPath();
    g.moveTo(x, y - h * 0.72);
    g.lineTo(x + Math.cos(arm) * h * 0.35, y - h * 0.72 - Math.sin(arm) * h * 0.35);
    g.stroke();
  }
}

function wave(g: CanvasRenderingContext2D, w: number, y: number, amp: number, k: number): void {
  g.beginPath();
  g.moveTo(0, 512);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * k) * amp);
  g.lineTo(w, 512);
  g.closePath();
  g.fill();
}

function draw(scene: Scene, rng: Rng): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a7078';
  g.fillRect(0, 0, 1024, 512);
  // the stone's grain
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${rng.next() < 0.5 ? '40,34,40' : '150,140,145'},${rng.range(0.03, 0.09)})`;
    g.fillRect(rng.range(0, 1024), rng.range(0, 512), rng.range(2, 14), rng.range(1, 4));
  }
  g.strokeStyle = 'rgba(40,32,38,0.6)';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 484);
  // incised: a light edge, then the dark cut a few pixels off it (the relief catches the flame)
  const carve = (fn: () => void) => {
    g.save();
    g.translate(-3, -3);
    g.fillStyle = 'rgba(205,195,190,0.55)';
    g.strokeStyle = 'rgba(205,195,190,0.55)';
    fn();
    g.restore();
    g.fillStyle = '#2b2328';
    g.strokeStyle = '#2b2328';
    fn();
  };
  const ground = 430;
  switch (scene) {
    case 'crowd':
      carve(() => {
        g.lineWidth = 14;
        g.beginPath();
        g.arc(860, ground, 120, Math.PI, 0);
        g.stroke();
        for (let i = 0; i < 9; i++) figure(g, 90 + i * 78, ground, rng.range(120, 160), i % 3 === 1, i % 4 === 0 ? 0.5 : 0);
      });
      break;
    case 'market':
      carve(() => {
        for (let i = 0; i < 3; i++) {
          const x = 140 + i * 300;
          g.fillRect(x - 80, ground - 70, 160, 70);
          g.beginPath();
          g.moveTo(x - 100, ground - 150);
          g.lineTo(x + 100, ground - 150);
          g.lineTo(x + 80, ground - 110);
          g.lineTo(x - 80, ground - 110);
          g.fill();
          // a balance
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(x + 110, ground - 40);
          g.lineTo(x + 110, ground - 140);
          g.moveTo(x + 70, ground - 140);
          g.lineTo(x + 150, ground - 140);
          g.stroke();
          figure(g, x - 120, ground, 140, i === 1, 0.3);
        }
      });
      break;
    case 'water':
      carve(() => {
        for (let i = 0; i < 8; i++) {
          const x = 70 + i * 120;
          const h = rng.range(140, 260);
          g.fillRect(x - 40, ground - h, 80, h);
          g.beginPath();
          g.moveTo(x - 50, ground - h);
          g.lineTo(x, ground - h - 50);
          g.lineTo(x + 50, ground - h);
          g.fill();
        }
      });
      // and the water, risen to their doors
      g.fillStyle = 'rgba(35,30,40,0.95)';
      wave(g, 1024, ground - 70, 14, 0.035);
      g.fillStyle = 'rgba(205,195,190,0.35)';
      for (let x = 20; x < 1000; x += 60) g.fillRect(x, ground - 76 + Math.sin(x * 0.035) * 14, 34, 3);
      break;
    case 'priests':
      carve(() => {
        g.beginPath();
        g.arc(512, 210, 70, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 8;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.beginPath();
          g.moveTo(512 + Math.cos(a) * 90, 210 + Math.sin(a) * 90);
          g.lineTo(512 + Math.cos(a) * 125, 210 + Math.sin(a) * 125);
          g.stroke();
        }
        figure(g, 170, ground, 150, true, 2.2);
        figure(g, 330, ground, 150, true, 0);
        figure(g, 700, ground, 150, true, 1.2);
        figure(g, 860, ground, 150, true, 2.6);
      });
      break;
    case 'fire':
      carve(() => {
        figure(g, 512, ground, 230, false, 1.45);
        for (let i = 0; i < 6; i++) {
          const x = i < 3 ? 120 + i * 100 : 640 + (i - 3) * 110;
          g.fillRect(x - 50, ground - 26, 100, 26); // the still ones, lying where they stopped
          g.beginPath();
          g.arc(x - 60, ground - 14, 16, 0, Math.PI * 2);
          g.fill();
        }
      });
      // the fire in the raised hand: a flame cut deeper than anything else on the stone
      g.fillStyle = '#1a1216';
      g.beginPath();
      g.moveTo(600, 130);
      g.quadraticCurveTo(570, 175, 596, 205);
      g.quadraticCurveTo(625, 175, 600, 130);
      g.fill();
      break;
    case 'wave':
      carve(() => {
        for (let i = 0; i < 7; i++) g.fillRect(500 + i * 70, ground - rng.range(60, 120), 50, 200);
        g.beginPath();
        g.moveTo(40, ground);
        g.quadraticCurveTo(120, 60, 460, 70);
        g.quadraticCurveTo(620, 80, 560, 190);
        g.quadraticCurveTo(470, 120, 380, 200);
        g.quadraticCurveTo(300, 330, 420, ground);
        g.closePath();
        g.fill();
      });
      break;
    case 'door':
      carve(() => {
        g.fillRect(420, 90, 30, 340);
        g.fillRect(600, 90, 30, 340);
        g.fillRect(400, 70, 250, 34);
        for (let k = 0; k < 5; k++) g.fillRect(450 + k * 6, 420 - k * 24, 150 - k * 12, 12);
        figure(g, 380, ground, 200, false, 1.0); // the one holding the door
        for (let i = 0; i < 5; i++) figure(g, 700 + i * 60, ground, rng.range(110, 150), i % 2 === 0, 0);
      });
      break;
  }
  return c;
}

export function carving(scene: Scene, seed: number): THREE.Mesh {
  const tex = new THREE.CanvasTexture(draw(scene, new Rng(seed)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, bumpMap: tex, bumpScale: 2.5 }));
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ the rain
// Each streak falls on the GPU: its top wraps through the column of air (0.4 .. 8 m) at its own speed, and its tail
// trails behind it (aTail 0 at the head, 1 at the tail), so a streak never stretches across a wrap.
const RAIN_TOP = 8;
const RAIN_BOTTOM = 0.4;
const RAIN_VERT = /* glsl */ `
  uniform vec3 uFlame;
  uniform float uTime;
  attribute float aTail;
  attribute float aSpeed;
  varying float vGlint;
  varying float vFar;
  void main() {
    float h = ${(RAIN_TOP - RAIN_BOTTOM).toFixed(2)};
    float y = ${RAIN_BOTTOM.toFixed(2)} + mod(position.y - ${RAIN_BOTTOM.toFixed(2)} - uTime * aSpeed, h);
    // a slight slant: the tail a little upwind of the head
    vec3 p = vec3(position.x - aTail * 0.04, y + aTail * 0.24, position.z);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    float d = distance(wp.xyz, uFlame);
    vGlint = smoothstep(5.0, 0.4, d);
    vec4 mv = viewMatrix * wp;
    vFar = smoothstep(30.0, 6.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const RAIN_FRAG = /* glsl */ `
  uniform float uLight;
  varying float vGlint;
  varying float vFar;
  void main() {
    vec3 cold = vec3(0.32, 0.38, 0.55) * 0.35;
    vec3 warm = vec3(2.2, 1.1, 0.45) * vGlint * uLight;
    gl_FragColor = vec4((cold + warm) * vFar, 1.0);
  }`;

export function fallingRain(d: District, count = 3600): THREE.LineSegments {
  const rng = new Rng(d.index * 71 + 9);
  const a = d.area.kind === 'band' ? d.area : { x0: d.area.cx - d.area.r, x1: d.area.cx + d.area.r, z0: d.area.cz - d.area.r, z1: d.area.cz + d.area.r };
  const covered = d.decor.filter((dc) => dc.kind === 'vault' || dc.kind === 'roof') as { x0: number; x1: number; z0: number; z1: number }[];
  const pos: number[] = [];
  const tail: number[] = [];
  const spd: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = rng.range(a.x0 - 2, a.x1 + 2);
    const z = rng.range(a.z0 - 2, a.z1 + 2);
    if (covered.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
    const y = rng.range(RAIN_BOTTOM, RAIN_TOP);
    const speed = rng.range(8.5, 11);
    // the head and the tail of one streak share their place and speed; the tail sits above the head
    pos.push(x, y, z, x, y, z);
    tail.push(0, 1);
    spd.push(speed, speed);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTail', new THREE.Float32BufferAttribute(tail, 1));
  g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(spd, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: SCENERY, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.userData.dynamic = true;
  return lines;
}

// ------------------------------------------------------------------ birds, and the city beyond the walls
export function frozenBirds(d: District, n = 14): THREE.Group {
  const rng = new Rng(d.index * 13 + 3);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x08070b, side: THREE.DoubleSide });
  const a = d.area.kind === 'band' ? d.area : { x0: d.area.cx - d.area.r, x1: d.area.cx + d.area.r, z0: d.area.cz - d.area.r, z1: d.area.cz + d.area.r };
  const cx = rng.range(a.x0 + 8, a.x1 - 8);
  const cz = (a.z0 + a.z1) / 2;
  for (let i = 0; i < n; i++) {
    const wing = rng.range(-0.6, 0.9); // caught mid-beat
    const shape = new THREE.BufferGeometry();
    const s = rng.range(0.35, 0.55);
    shape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -s, wing * s, s * 0.6, s * 0.2, 0, 0, 0, 0, 0, -s, wing * s, -s * 0.6, s * 0.2, 0, 0], 3));
    const m = new THREE.Mesh(shape, mat);
    m.position.set(cx + rng.range(-9, 9), rng.range(9, 15), cz + rng.range(-6, 6));
    m.rotation.y = rng.range(-0.4, 0.4);
    g.add(m);
  }
  return g;
}

export function skyline(d: District): THREE.Group {
  const rng = new Rng(d.index * 5 + 77);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b0a12 });
  const a = d.area.kind === 'band' ? d.area : { x0: d.area.cx - d.area.r, x1: d.area.cx + d.area.r, z0: d.area.cz - d.area.r, z1: d.area.cz + d.area.r };
  const cx = (a.x0 + a.x1) / 2;
  const cz = (a.z0 + a.z1) / 2;
  const rx = (a.x1 - a.x0) / 2 + 14;
  const rz = (a.z1 - a.z0) / 2 + 14;
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const far = rng.range(1, 2.2);
    const x = cx + Math.cos(t) * rx * far;
    const z = cz + Math.sin(t) * rz * far;
    const h = rng.range(9, 26);
    const kind = rng.next();
    const geo = kind < 0.6 ? new THREE.BoxGeometry(rng.range(4, 9), h, rng.range(4, 9)) : kind < 0.85 ? new THREE.CylinderGeometry(rng.range(1.5, 3), rng.range(2, 3.5), h, 8) : new THREE.ConeGeometry(rng.range(2, 4), h * 1.3, 6);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h / 2 - 2, z);
    g.add(m);
    if (kind < 0.25) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(rng.range(2, 4), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.position.set(x, h - 2, z);
      g.add(dome);
    }
  }
  return g;
}
