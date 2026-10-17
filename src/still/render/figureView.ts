import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Figure, type FigureLook, type Kind } from '../../render/memory';
import { rimify } from '../../render/rim';
import { surface } from '../../render/surface';
import { glowTexture } from '../../render/textures';
import { placeAt, poseAt, run, STAND, type Pose } from '../../sim/pose';
import type { City } from '../sim/city';
import type { District, FigureDef, Plane } from '../sim/types';

// The frozen people. Each is three things:
//   a statue: the figure in the pose it froze in, baked into one mesh (one draw, and one per shadow face)
//   its ink: the shadow the fire threw at that instant, painted flat on the wall or floor it fell on. It is the
//     figure's own geometry projected from its true light onto that plane, so when the flame stands where that
//     light stood, the live shadow lands exactly on the ink (that is the puzzle, and its answer)
//   its replay: a jointed copy, warm as a coal, that lives its last ten seconds when it is woken (and that the
//     player wears when stepping in)

const STATUE: FigureLook = {
  baseY: 0,
  mat: surface(rimify(new THREE.MeshStandardMaterial({ color: 0x4c4752, roughness: 0.92, metalness: 0.02 }), 0.55, 'scstatue'), 'stone'),
  matDouble: surface(rimify(new THREE.MeshStandardMaterial({ color: 0x4c4752, roughness: 0.92, side: THREE.DoubleSide }), 0.55, 'scstatue2'), 'stone'),
};
const EMBER = new THREE.Color(1.6, 0.55, 0.18);
/** The tier-3 hint's ghost replay: the solution shown once, from a distance, pale and cold. */
const GHOST_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.55, 1.4), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
const GHOST: FigureLook = { baseY: 0, mat: GHOST_MAT, matDouble: GHOST_MAT };
const REPLAY: FigureLook = {
  baseY: 0,
  mat: rimify(new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: EMBER, emissiveIntensity: 0.55, roughness: 0.7 }), 1.3, 'screplay'),
  matDouble: rimify(new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: EMBER, emissiveIntensity: 0.55, roughness: 0.7, side: THREE.DoubleSide }), 1.3, 'screplay2'),
};

/** The planar shadow matrix: projects points from a point light onto a plane (offset a hair toward the light). */
export function shadowMatrix(L: [number, number, number], pl: Plane, lift = 0.015): THREE.Matrix4 {
  const [nx, ny, nz] = pl.n;
  const px = pl.p[0] + nx * lift;
  const py = pl.p[1] + ny * lift;
  const pz = pl.p[2] + nz * lift;
  const c = -(nx * px + ny * py + nz * pz);
  const [lx, ly, lz] = L;
  const dot = nx * lx + ny * ly + nz * lz + c;
  const l = [lx, ly, lz, 1];
  const p = [nx, ny, nz, c];
  const m = new THREE.Matrix4();
  const e = m.elements; // column-major: e[col * 4 + row]
  for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) e[col * 4 + r] = (r === col ? dot : 0) - l[r] * p[col];
  return m;
}

/** Bake a figure's meshes (as posed now) into one geometry, optionally through a matrix applied after their own. */
function bake(f: Figure, post?: THREE.Matrix4): THREE.BufferGeometry {
  f.root.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  const mw = new THREE.Matrix4();
  f.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    mw.copy(m.matrixWorld);
    if (post) mw.premultiply(post);
    g = g.applyMatrix4(mw);
    geos.push(g);
  });
  const out = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  return out;
}

interface Item {
  def: FigureDef;
  statue: THREE.Mesh;
  ink: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  live: Figure; // the jointed one, for replays
  glow: THREE.Sprite; // a coal-glow at its chest while it lives again
  inkK: number;
  liveK: number;
  phase: number;
}

const _v = new THREE.Vector3();

export class FigureViews {
  readonly group = new THREE.Group();
  readonly items: Item[] = [];
  private hintT: number[] = [];
  private woken = 0;

  /** A hint: this figure glows faintly for a while. */
  hint(i: number, seconds: number): void {
    this.hintT[i] = Math.max(this.hintT[i] ?? 0, seconds);
  }

  private ghost: { fig: Figure; i: number; t: number } | null = null;
  /** A hint (tier 3): the figure's last ten seconds played once as a pale ghost, free, changing nothing. */
  ghostReplay(i: number): void {
    const it = this.items[i];
    if (!it?.def.clip) return;
    if (this.ghost) this.ghost.fig.root.removeFromParent();
    const fig = new Figure(it.def.kind as Kind, 0, 1, it.def.h ?? 1.8, GHOST);
    fig.root.userData.dynamic = true;
    this.group.add(fig.root);
    this.ghost = { fig, i, t: 0 };
  }

  /** The let-go ending: every statue lives again (k 0..1). */
  wakeAll(k: number): void {
    this.woken = k;
  }

  constructor(d: District) {
    for (const def of d.figures) {
      const kind = def.kind as Kind;
      const h = def.h ?? 1.8;
      // the statue, baked from a posed figure
      const shape = new Figure(kind, 0, 1, h, STATUE);
      if (def.holds) shape.hold(def.holds);
      this.place(shape, def.x, def.z, def.yaw);
      shape.apply(def.frozen);
      const statue = new THREE.Mesh(bake(shape), STATUE.mat);
      statue.castShadow = true;
      statue.receiveShadow = true;
      statue.matrixAutoUpdate = false;
      // its ink, from the same pose through its true light onto its plane
      const inkMat = new THREE.MeshBasicMaterial({ color: 0x030206, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, fog: true });
      const ink = new THREE.Mesh(bake(shape, shadowMatrix(def.light, def.ink)), inkMat);
      ink.matrixAutoUpdate = false;
      ink.renderOrder = 2;
      ink.frustumCulled = false;
      // the one that lives again
      const live = new Figure(kind, 0, 1, h, REPLAY);
      if (def.holds) live.hold(def.holds);
      live.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      live.root.visible = false;
      live.root.userData.dynamic = true;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.2, 0.45, 0.15), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      glow.scale.setScalar(1.6);
      this.group.add(statue, ink, live.root, glow);
      this.items.push({ def, statue, ink, live, glow, inkK: 1, liveK: 0, phase: 0 });
    }
  }

  private place(f: Figure, x: number, z: number, yaw: number): void {
    f.root.position.x = x;
    f.root.position.z = z;
    f.root.rotation.y = -yaw;
  }

  update(dt: number, t: number, city: City): void {
    const s = city.s;
    if (this.ghost) {
      const g = this.ghost;
      const def = this.items[g.i].def;
      g.t += dt;
      if (!def.clip || g.t > def.clip.len) {
        g.fig.root.removeFromParent();
        this.ghost = null;
      } else {
        const at = city.placeOf(g.i);
        const p = def.clip.path ? placeAt(def.clip, g.t, { x: def.x, z: def.z, yaw: def.yaw }) : at;
        this.place(g.fig, p.x, p.z, p.yaw);
        g.fig.apply(poseAt(def.clip, g.t));
      }
    }
    this.items.forEach((it, i) => {
      const rt = s.figs[i];
      const def = it.def;
      if (!city.present(i)) {
        it.statue.visible = it.ink.visible = it.live.root.visible = false;
        it.glow.material.opacity = 0;
        return;
      }
      const living = rt.state !== 'frozen' || this.woken > 0.5;
      this.hintT[i] = Math.max(0, (this.hintT[i] ?? 0) - dt);
      // the ink leaves the wall while he lives again ("so does he, back into the wall"); it comes back after
      const inkWant = living || (def.inkGone && city.flag(def.inkGone)) ? 0 : 1;
      it.inkK += (inkWant - it.inkK) * Math.min(1, dt * (inkWant ? 1.2 : 4));
      it.ink.material.opacity = it.inkK;
      it.ink.visible = it.inkK > 0.01;
      // as the flame nears his true angle, his ink warms at the edges: the silhouettes are about to meet
      const a = rt.align * rt.align;
      it.ink.material.color.setRGB(0.012 + a * 0.12, 0.008 + a * 0.03, 0.024 + a * 0.005);
      it.liveK += ((living ? 1 : 0) - it.liveK) * Math.min(1, dt * 6);
      it.statue.visible = !living;
      it.live.root.visible = living;
      it.glow.material.opacity = Math.max(it.liveK * 0.5, Math.min(1, this.hintT[i]) * (0.35 + 0.25 * Math.sin(t * 5)));
      if (!living) {
        it.glow.position.set(def.x, (def.h ?? 1.8) * 0.6, def.z);
        return;
      }
      const at = city.placeOf(i);
      this.place(it.live, at.x, at.z, at.yaw);
      let pose: Pose;
      if (rt.state === 'ghost' && s.ghost) {
        // stepped in: the player walks him; the clip shows only when he acts
        const g = s.ghost;
        const sp = Math.hypot(g.vx, g.vz);
        it.phase += dt * (2 + sp * 1.6);
        if (g.acting > 0 && def.clip) {
          const trig = def.clip.triggers?.[0]?.t ?? def.clip.len / 2;
          pose = poseAt(def.clip, trig - 0.9 + (0.9 - g.acting) * 1.4);
        } else pose = sp > 0.4 ? { ...STAND, ...run(it.phase / 9, 9), lean: 0.2 } : { ...STAND, lean: 0.05, head: Math.sin(t * 0.7) * 0.05 };
      } else if (this.woken > 0.5 && rt.state === 'frozen') {
        // alive: they breathe, they turn their heads toward the one who let it go out
        pose = { ...STAND, ...def.frozen, y: 0, lF: 0.05, kF: -0.05, lB: -0.05, kB: -0.05, lean: 0.05 + Math.sin(t * 1.3 + i) * 0.03, head: -0.1 + Math.sin(t * 0.7 + i) * 0.1, aF: 0.2, aB: -0.1 };
      } else pose = def.clip ? poseAt(def.clip, rt.t) : { ...STAND, ...def.frozen };
      it.live.apply(pose);
      it.live.root.updateMatrixWorld(true);
      it.glow.position.copy(it.live.root.position).setY((def.h ?? 1.8) * 0.65);
      _v.set(0, 0, 0);
    });
  }
}
