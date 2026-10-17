import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Solid } from '../../sim/geom';
import { Rng } from '../../sim/rng';
import { Flame } from '../../render/flame';
import { rimify } from '../../render/rim';
import { surface } from '../../render/surface';
import { mergeStatic } from '../../render/merge';
import { column, stoneBox } from '../../render/shapes';
import { glowTexture, tatterTexture } from '../../render/textures';
import { RIDDLES } from '../../data/stillCity';
import type { City } from '../sim/city';
import type { Decor, District, MechDef } from '../sim/types';

// A district's set, built from its data: paving with the pits left open, walls dressed in courses, pillars,
// vaults and arches; then what moves: braziers (warm, or the false ones' cold blue), wall torches, the portcullis,
// the gate and its bar, the frozen lever, the riddle plaques. Static pieces are merged into a few dozen meshes.

const STONE = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.82, metalness: 0.03 }), 0.45, 'scstone'), 'stone');
const DARK = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x17141c, roughness: 0.9 }), 0.35, 'scdark'), 'stone');
const PAVING = surface(new THREE.MeshStandardMaterial({ color: 0x2b2630, roughness: 0.6, metalness: 0.05 }), 'paving');
const TIMBER = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 }), 0.4, 'sctimber'), 'timber');
const IRON = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x18151c, roughness: 0.45, metalness: 0.65 }), 0.9, 'sciron'), 'iron');
const VAULT = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x141118, roughness: 0.92, side: THREE.DoubleSide }), 0.3, 'scvault'), 'stone');
const PIT = new THREE.MeshBasicMaterial({ color: 0x020103 });
const WOOD_DARK = surface(new THREE.MeshStandardMaterial({ color: 0x1a0f09, roughness: 0.85 }), 'timber');
const CLOTH_RED = new THREE.MeshStandardMaterial({ color: 0x4a1216, roughness: 0.95 });
const SHAFT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.36, 0.5), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const SHAFT_FLOOR = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.88, 1.1), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const BOOKS = new THREE.MeshStandardMaterial({ map: spines(512, 128, 3), roughness: 0.9 });
const BOOKS_TALL = new THREE.MeshStandardMaterial({ map: spines(1024, 512, 12), roughness: 0.9 });
const PLATE = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.55, metalness: 0.3 }), 0.6, 'scplate'), 'stone');

/** Rows of book spines, drawn once. */
function spines(w: number, h: number, rows: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#120c08';
  g.fillRect(0, 0, w, h);
  const rng = new Rng(w + h + rows);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let x = 2; x < w - 2; ) {
      const bw = rng.range(5, 13) * (w / 512);
      const bh = rh * rng.range(0.6, 0.92);
      const hue = [24, 12, 200, 340, 30, 90][Math.floor(rng.next() * 6)];
      g.fillStyle = `hsl(${hue}, ${rng.range(15, 40)}%, ${rng.range(7, 17)}%)`;
      g.fillRect(x, r * rh + rh - bh - 2, bw - 1, bh);
      if (rng.next() < 0.3) {
        g.fillStyle = 'rgba(190,150,90,0.35)';
        g.fillRect(x + 1, r * rh + rh - bh * 0.7, bw - 3, 2);
      }
      x += bw;
    }
    g.fillStyle = '#21140c';
    g.fillRect(0, r * rh + rh - 3, w, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CLOTH = new THREE.MeshStandardMaterial({ color: 0x3a1418, roughness: 0.9, side: THREE.DoubleSide, alphaMap: tatterTexture(11), alphaTest: 0.5 });

/** Shared torch lights: the nearest few torches borrow them (the light count, and so every shader, never changes). */
export const TORCH_LIGHTS: THREE.PointLight[] = [0, 1, 2].map(() => new THREE.PointLight(0xff9a4a, 0, 9, 2));
/** The braziers' lights, likewise shared. */
export const BRAZIER_POOL: THREE.PointLight[] = [0, 1].map(() => new THREE.PointLight(0xff8a3d, 0, 15, 2));

/** A flagstone seen from above: a flat top with bevelled edges falling to the joints (10 triangles, not 300). */
function slab(bevel = 0.06, drop = 0.05): THREE.BufferGeometry {
  const a = 0.5;
  const b = 0.5 - bevel;
  const y0 = 0.07 - drop;
  const y1 = 0.07;
  // top quad, then four sloped strips from the top's edge out and down to the joint
  const P = [
    [-b, y1, -b], [b, y1, -b], [b, y1, b], [-b, y1, b],
    [-a, y0, -a], [a, y0, -a], [a, y0, a], [-a, y0, a],
  ];
  const quads = [[0, 3, 2, 1], [4, 0, 1, 5], [5, 1, 2, 6], [6, 2, 3, 7], [7, 3, 0, 4]];
  const pos: number[] = [];
  for (const [i, j, k, l] of quads) for (const v of [i, j, k, i, k, l]) pos.push(...P[v]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const blockCache = new Map<string, THREE.BufferGeometry>();
/** A cut block with a small rounded edge (one segment: 108 triangles), shared by size. */
function block(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}`;
  let g = blockCache.get(key);
  if (!g) blockCache.set(key, (g = new RoundedBoxGeometry(w, h, d, 1, Math.min(0.05, Math.min(w, h, d) * 0.15))));
  return g;
}

interface BrazierView {
  x: number;
  z: number;
  flame: Flame;
  cold: boolean;
  lit: number;
  tint: THREE.Color;
}
interface PlateView {
  flag: string;
  glow: THREE.Sprite;
  inlay: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  k: number;
}
interface BalanceView {
  plate: number;
  beam: THREE.Group;
  tilt: number;
}
interface PageView {
  i: number;
  lie: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  truth: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  k: number;
}
interface TorchView {
  pos: THREE.Vector3;
  flame: Flame;
}
interface MechView {
  def: MechDef;
  root: THREE.Group;
  open: number;
}
interface BannerView {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;
  base: Float32Array;
  seed: number;
}

export class DistrictView {
  readonly group = new THREE.Group();
  private rng: Rng;
  private braziers: BrazierView[] = [];
  private torches: TorchView[] = [];
  private mechs: MechView[] = [];
  private banners: BannerView[] = [];
  private pitSlabs: { mesh: THREE.Mesh; pit: number; fall: number }[] = [];
  private plateViews: PlateView[] = [];
  private balances: BalanceView[] = [];
  private pageViews: PageView[] = [];
  readonly plaques: THREE.Mesh[] = [];
  readonly d: District;

  constructor(d: District) {
    this.d = d;
    this.rng = new Rng(d.index * 977 + 13);
    this.floor();
    for (const s of d.solids) this.solid(s);
    for (const dc of d.decor) this.decor(dc);
    d.braziers.forEach((b) => this.brazier(b.x, b.z, !!b.false));
    d.torches.forEach((t) => this.torch(t.x, t.y, t.z, t.ry));
    d.mechs.forEach((m) => this.mech(m));
    d.riddles.forEach((r) => this.plaque(r.text ?? RIDDLES[r.id as keyof typeof RIDDLES].text, r.x, r.y, r.z, r.ry));
    d.plates.forEach((pl, i) => {
      const r = pl.rect;
      this.plateInlay((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, pl.id);
      if (pl.casters.some((c) => typeof c === 'object' && 'fig' in c)) this.balance(i);
    });
    d.pages.forEach((pg, i) => this.page(i, pg.x, pg.y, pg.z, pg.lie, pg.truth));
    const m = mergeStatic(this.group);
    console.info(`[still] ${d.id}: ${m.before} static meshes merged into ${m.after}`);
  }

  // ------------------------------------------------------------------ build
  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Flagstones over the walkable band, instanced, with the pits left open (a pit that opens later gets loose slabs). */
  private floor(): void {
    const area = this.d.area;
    const disc = area.kind === 'disc' ? area : null;
    const a = area.kind === 'band' ? area : { x0: area.cx - area.r, x1: area.cx + area.r, z0: area.cz - area.r, z1: area.cz + area.r };
    const rng = new Rng(this.d.index * 31 + 5);
    const variants = [slab(0.05, 0.04), slab(0.07, 0.05), slab(0.04, 0.035), slab(0.08, 0.06)];
    const mats: THREE.Matrix4[][] = variants.map(() => []);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sz = 1.05;
    for (let x = a.x0 - 1; x < a.x1 + 1; ) {
      const sx = rng.range(0.8, 1.3);
      for (let z = a.z0 - 1; z < a.z1 + 1; z += sz) {
        const cx = x + sx / 2;
        const cz = z + sz / 2;
        if (disc && Math.hypot(cx - disc.cx, cz - disc.cz) > disc.r + 0.7) continue;
        const pit = this.d.pits.findIndex((p) => cx > p.x0 - 0.05 && cx < p.x1 + 0.05 && cz > p.z0 - 0.05 && cz < p.z1 + 0.05);
        if (pit >= 0) {
          // a pit that is floor until the city falls: loose slabs that drop when it opens
          if (this.d.pits[pit].when) {
            const m = this.add(stoneBox(sx - 0.06, 0.14, sz - 0.06, Math.round(cx * 7 + cz), 0.02), PAVING, cx, -0.07, cz, rng.range(-0.03, 0.03));
            m.userData.dynamic = true;
            this.pitSlabs.push({ mesh: m, pit, fall: 0 });
          }
          continue;
        }
        if (rng.next() < 0.06) continue;
        e.set(0, rng.range(-0.03, 0.03), 0);
        q.setFromEuler(e);
        mats[Math.floor(rng.next() * variants.length)].push(new THREE.Matrix4().compose(new THREE.Vector3(cx, -0.07 + rng.range(-0.012, 0.012), cz), q, new THREE.Vector3(sx - 0.02, 1, sz - 0.02)));
      }
      x += sx;
    }
    variants.forEach((g, v) => {
      const inst = new THREE.InstancedMesh(g, PAVING, mats[v].length);
      mats[v].forEach((m, i) => inst.setMatrixAt(i, m));
      inst.receiveShadow = true;
      this.group.add(inst);
    });
    // the ground under the paving, and the dark of every pit
    // (cut around the pits: x intervals between pit edges, and in each the z spans no pit covers)
    const xs = [a.x0 - 6, a.x1 + 6, ...this.d.pits.flatMap((p) => [p.x0, p.x1])].sort((u, v) => u - v);
    for (let k = 0; k < xs.length - 1; k++) {
      const x0 = xs[k];
      const x1 = xs[k + 1];
      if (x1 - x0 < 0.01) continue;
      const mid = (x0 + x1) / 2;
      const holes = this.d.pits.filter((p) => mid > p.x0 && mid < p.x1).map((p) => [p.z0, p.z1] as const).sort((u, v) => u[0] - v[0]);
      let z = a.z0 - 6;
      for (const [h0, h1] of [...holes, [a.z1 + 6, a.z1 + 6] as const]) {
        if (h0 - z > 0.01) {
          const under = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, h0 - z), DARK);
          under.rotation.x = -Math.PI / 2;
          under.position.set(mid, -0.06, (z + h0) / 2);
          under.receiveShadow = true;
          this.group.add(under);
        }
        z = Math.max(z, h1);
      }
    }
    for (const p of this.d.pits) {
      const w = p.x1 - p.x0;
      const dd = p.z1 - p.z0;
      // its walls (cut stone going down) and a black floor far below
      for (const [x, z, ww, d2] of [[p.x0, (p.z0 + p.z1) / 2, 0.3, dd], [p.x1, (p.z0 + p.z1) / 2, 0.3, dd], [(p.x0 + p.x1) / 2, p.z0, w, 0.3], [(p.x0 + p.x1) / 2, p.z1, w, 0.3]] as const)
        this.add(stoneBox(ww, p.depth, d2, Math.round(x * 3 + z), 0.03), DARK, x, -p.depth / 2 - 0.05, z).castShadow = false;
      const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, dd), PIT);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.set((p.x0 + p.x1) / 2, -p.depth, (p.z0 + p.z1) / 2);
      this.group.add(bottom);
    }
  }

  private solid(s: Solid): void {
    const h = s.y1 - s.y0;
    switch (s.tag) {
      case 'mech':
      case 'figure':
        return;
      case 'pillar':
        this.add(column(s.hw * 0.88, s.hw, h - 0.7, Math.round(s.x * 7 + s.z)), STONE, s.x, s.y0 + 0.35 + (h - 0.7) / 2, s.z);
        this.add(stoneBox(s.hw * 2.6, 0.35, s.hw * 2.6, Math.round(s.x * 3), 0.03), STONE, s.x, s.y0 + 0.175, s.z);
        this.add(stoneBox(s.hw * 2.7, 0.35, s.hw * 2.7, Math.round(s.z * 3), 0.03), STONE, s.x, s.y1 - 0.175, s.z);
        return;
      case 'crate': {
        const m = this.add(stoneBox(s.hw * 2, h, s.hd * 2, Math.round(s.x * 3 + s.z), 0.015), TIMBER, s.x, s.y0 + h / 2, s.z);
        m.rotation.y = s.ry;
        return;
      }
      case 'house':
        this.wall(s, false);
        return this.houseFront(s);
      case 'stall':
        return this.stall(s);
      case 'well':
        this.add(new THREE.CylinderGeometry(s.hw, s.hw * 1.05, h, 20, 1, true), STONE, s.x, h / 2, s.z).castShadow = true;
        this.add(new THREE.TorusGeometry(s.hw, 0.1, 8, 24), STONE, s.x, h, s.z).rotation.x = Math.PI / 2;
        this.add(new THREE.CircleGeometry(s.hw * 0.95, 20), PIT, s.x, h * 0.55, s.z).rotation.x = -Math.PI / 2;
        for (const sd of [-1, 1]) this.add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), TIMBER, s.x + sd * s.hw, h + 0.8, s.z);
        this.add(new THREE.CylinderGeometry(0.05, 0.05, s.hw * 2 + 0.3, 6), TIMBER, s.x, h + 1.55, s.z).rotation.z = Math.PI / 2;
        return;
      case 'altar':
        this.add(block(s.hw * 2, h, s.hd * 2), STONE, s.x, h / 2, s.z);
        this.add(new THREE.BoxGeometry(s.hw * 2 - 0.1, 0.02, s.hd * 2 + 0.06), CLOTH_RED, s.x, h + 0.01, s.z);
        return;
      case 'shelf':
      case 'tallshelf':
        return this.shelf(s);
      case 'gallery':
      case 'step': {
        const m = this.add(block(s.hw * 2, h, s.hd * 2), TIMBER, s.x, s.y0 + h / 2, s.z);
        m.castShadow = true;
        if (s.tag === 'gallery') for (const sd of [-1, 1]) this.add(new THREE.BoxGeometry(s.hw * 2, 0.08, 0.08), TIMBER, s.x, s.y1 + 0.9, s.z + sd * (s.hd - 0.05));
        return;
      }
      case 'bookwall':
        this.wall(s, false);
        return this.bookFace(s);
      case 'lectern': {
        this.add(new THREE.CylinderGeometry(0.1, 0.16, h - 0.1, 8), TIMBER, s.x, (h - 0.1) / 2, s.z);
        this.add(block(0.4, 0.08, 0.4), TIMBER, s.x, 0.04, s.z);
        const top = this.add(block(s.hw * 2, 0.08, s.hd * 2), TIMBER, s.x, h - 0.04, s.z);
        top.castShadow = true;
        return;
      }
      case 'pedestal':
        this.add(new THREE.CylinderGeometry(s.hw * 0.8, s.hw, h, 24), STONE, s.x, h / 2, s.z);
        this.add(new THREE.CylinderGeometry(s.hw * 0.95, s.hw * 0.6, 0.2, 24, 1, true), IRON, s.x, h + 0.1, s.z);
        return;
      case 'post':
        this.add(column(s.hw * 0.85, s.hw, h, 31, 8), STONE, s.x, h / 2, s.z);
        return;
      case 'gnomon':
        this.add(new THREE.CylinderGeometry(s.hw * 0.4, s.hw, h, 10), IRON, s.x, h / 2, s.z);
        this.add(new THREE.SphereGeometry(s.hw * 0.7, 10, 8), IRON, s.x, h, s.z);
        return;
      case 'gatepier':
        this.add(stoneBox(s.hw * 2, h, s.hd * 2, Math.round(s.x + s.z * 5), 0.04), STONE, s.x, s.y0 + h / 2, s.z);
        this.add(stoneBox(s.hw * 2 + 0.3, 0.45, s.hd * 2 + 0.3, Math.round(s.x * 2), 0.03), STONE, s.x, s.y1 + 0.2, s.z);
        return;
      default:
        return this.wall(s, s.tag === 'citywall');
    }
  }

  /** A wall laid in courses of cut stone, a plinth at its foot, a cornice (or merlons, on the city wall) on top. */
  private wall(s: Solid, crenel: boolean): void {
    const rng = this.rng;
    const g = new THREE.Group();
    g.position.set(s.x, s.y0, s.z);
    g.rotation.y = s.ry;
    const along = s.hw >= s.hd;
    const len = (along ? s.hw : s.hd) * 2;
    const depth = (along ? s.hd : s.hw) * 2;
    const H = s.y1 - s.y0;
    // big blocks low down, smaller above: a wall that has been rebuilt and patched for centuries
    let y = 0;
    let c = 0;
    const cast = crenel || s.tag === 'gatepier';
    while (y < H - 0.05) {
      const ch = Math.min(H - y, c < 2 ? 0.75 : rng.range(0.5, 0.66));
      let x = -len / 2;
      let first = c % 2 ? rng.range(0.4, 0.9) : 0;
      while (x < len / 2 - 0.05) {
        const bl = Math.min(len / 2 - x, first || rng.range(1.0, 2.0));
        first = 0;
        const m = new THREE.Mesh(block(Math.round((bl - 0.04) * 20) / 20, Math.round((ch - 0.035) * 20) / 20, depth), rng.next() < 0.12 ? DARK : STONE);
        if (along) m.position.set(x + bl / 2, y + ch / 2, rng.range(-0.015, 0.015));
        else {
          m.position.set(rng.range(-0.015, 0.015), y + ch / 2, x + bl / 2);
          m.rotation.y = Math.PI / 2;
        }
        m.castShadow = cast;
        m.receiveShadow = true;
        g.add(m);
        x += bl;
      }
      y += ch;
      c++;
    }
    // cornice or merlons
    if (crenel) {
      for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 1.5) {
        const m = new THREE.Mesh(block(0.9, 0.9, depth + 0.2), STONE);
        if (along) m.position.set(x + 0.45, H + 0.45, 0);
        else m.position.set(0, H + 0.45, x + 0.45);
        m.castShadow = true;
        g.add(m);
      }
    } else {
      const m = new THREE.Mesh(block(along ? len + 0.2 : depth + 0.3, 0.28, along ? depth + 0.3 : len + 0.2), STONE);
      m.position.set(0, H + 0.14, 0);
      m.castShadow = cast;
      g.add(m);
    }
    this.group.add(g);
  }

  /** A plate set into the floor: dark until its lesson is done, then it holds a warm light. */
  private plateInlay(x: number, z: number, w: number, d: number, flag: string): void {
    const mat = PLATE.clone();
    mat.emissive = new THREE.Color(1.4, 0.55, 0.15);
    mat.emissiveIntensity = 0;
    const inlay = new THREE.Mesh(block(w, 0.06, d), mat);
    inlay.position.set(x, 0.03, z);
    inlay.receiveShadow = true;
    inlay.userData.dynamic = true;
    this.group.add(inlay);
    const rim = this.add(new THREE.BoxGeometry(w + 0.16, 0.04, d + 0.16), IRON, x, 0.01, z);
    rim.castShadow = false;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.3, 0.6, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    glow.position.set(x, 0.5, z);
    glow.scale.setScalar(Math.max(w, d) * 2.2);
    glow.userData.dynamic = true;
    this.group.add(glow);
    this.plateViews.push({ flag, glow, inlay, k: 0 });
  }

  /** A merchant's balance beside his pan: it tips toward whichever side is heavier with shadow. */
  private balance(i: number): void {
    const r = this.d.plates[i].rect;
    const x = r.x1 + 0.7;
    const z = (r.z0 + r.z1) / 2;
    this.add(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), IRON, x, 0.75, z).castShadow = true;
    const beam = new THREE.Group();
    beam.position.set(x, 1.5, z);
    beam.userData.dynamic = true;
    this.add(new THREE.BoxGeometry(1.5, 0.05, 0.05), IRON, 0, 0, 0, 0, beam);
    for (const sd of [-1, 1]) {
      this.add(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), IRON, sd * 0.7, -0.25, 0, 0, beam);
      this.add(new THREE.CylinderGeometry(0.2, 0.14, 0.05, 14), IRON, sd * 0.7, -0.5, 0, 0, beam);
    }
    this.group.add(beam);
    this.balances.push({ plate: i, beam, tilt: 0 });
  }

  /** A page carved on a lectern: the lie, and over it the truth that only shows when it is read from above. */
  private page(i: number, x: number, y: number, z: number, lie: string, truth: string): void {
    const tex = (text: string, ink: string) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 384;
      const g = c.getContext('2d')!;
      g.fillStyle = '#8a7f72';
      g.fillRect(0, 0, 512, 384);
      g.font = 'italic 46px "Cormorant Garamond", Georgia, serif';
      g.textAlign = 'center';
      g.fillStyle = ink;
      const words = text.split(' ');
      let line = '';
      let yy = 110;
      for (const w of words) {
        if (g.measureText(line + ' ' + w).width > 440) {
          g.fillText(line, 256, yy);
          yy += 62;
          line = w;
        } else line = line ? line + ' ' + w : w;
      }
      g.fillText(line, 256, yy);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const mk = (map: THREE.Texture, lift: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ map, roughness: 0.9, transparent: true, emissive: new THREE.Color(1, 0.7, 0.4), emissiveIntensity: 0 }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.PI / 2;
      m.position.set(x, y + lift, z);
      m.receiveShadow = true;
      m.userData.dynamic = true;
      this.group.add(m);
      return m;
    };
    const lieM = mk(tex(lie, '#2a2118'), 0.012);
    const truthM = mk(tex(truth, '#3a0f06'), 0.016);
    truthM.material.opacity = 0;
    this.pageViews.push({ i, lie: lieM, truth: truthM, k: 0 });
  }

  /** A house front: windows dark as eye sockets, a timber eave, a door. */
  private houseFront(s: Solid): void {
    const along = s.hw >= s.hd;
    if (!along) return;
    const face = s.z > 0 ? s.z - s.hd - 0.02 : s.z + s.hd + 0.02;
    const H = s.y1 - s.y0;
    for (let x = s.x - s.hw + 1.6; x < s.x + s.hw - 1; x += this.rng.range(2.6, 3.6)) {
      for (const y of [2.6, 4.8]) if (y < H - 0.8 && this.rng.next() < 0.85) this.add(new THREE.BoxGeometry(0.8, 1.15, 0.1), PIT, x, y, face).castShadow = false;
      if (this.rng.next() < 0.3) this.add(new THREE.BoxGeometry(1.1, 2.1, 0.1), WOOD_DARK, x + 1.2, 1.05, face).castShadow = false;
    }
    const eave = this.add(new THREE.BoxGeometry(s.hw * 2, 0.16, 0.9), TIMBER, s.x, H - 0.2, face + (s.z > 0 ? -0.45 : 0.45));
    eave.castShadow = false;
  }

  /** A market stall: a counter, two posts and a torn awning. */
  private stall(s: Solid): void {
    const h = s.y1 - s.y0;
    const out = s.z > 0 ? -1 : 1; // the side that faces the street
    this.add(block(s.hw * 2, h, s.hd * 2), TIMBER, s.x, h / 2, s.z).castShadow = true;
    for (const sd of [-1, 1]) this.add(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), TIMBER, s.x + sd * (s.hw - 0.1), 1.2, s.z - out * (s.hd - 0.1)).castShadow = true;
    const aw = this.add(new THREE.PlaneGeometry(s.hw * 2 + 0.2, 1.7), CLOTH, s.x, 2.15, s.z + out * 0.15);
    aw.rotation.set(-Math.PI / 2 + out * 0.45, 0, 0);
    aw.castShadow = true;
    // its goods, frozen where they were set down: jars and baskets
    for (let i = 0; i < 4; i++) this.add(new THREE.CylinderGeometry(0.12, 0.09, 0.26, 8), this.rng.next() < 0.5 ? STONE : TIMBER, s.x - s.hw + 0.35 + i * (s.hw * 0.5), h + 0.13, s.z + this.rng.range(-0.2, 0.2)).castShadow = true;
  }

  /** A bookcase: a timber frame and rows of spines (a texture: every book a draw call would sink the frame rate). */
  private shelf(s: Solid): void {
    const h = s.y1 - s.y0;
    const along = s.hw >= s.hd;
    const len = (along ? s.hw : s.hd) * 2;
    const dep = (along ? s.hd : s.hw) * 2;
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    if (!along) g.rotation.y = Math.PI / 2;
    const frame = new THREE.Mesh(block(len, h, dep), TIMBER);
    frame.position.y = h / 2;
    frame.castShadow = true;
    frame.receiveShadow = true;
    g.add(frame);
    for (const sd of [-1, 1]) {
      const books = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.12, h - 0.14), BOOKS);
      books.position.set(0, h / 2, sd * (dep / 2 + 0.006));
      if (sd < 0) books.rotation.y = Math.PI;
      books.receiveShadow = true;
      g.add(books);
    }
    this.group.add(g);
  }

  /** The inner face of a library wall: books to the ceiling. */
  private bookFace(s: Solid): void {
    const H = s.y1 - s.y0;
    const face = s.z > 0 ? s.z - s.hd - 0.01 : s.z + s.hd + 0.01;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.hw * 2 - 0.4, H - 1.4), BOOKS_TALL);
    m.position.set(s.x, H / 2, face);
    if (s.z > 0) m.rotation.y = Math.PI;
    m.receiveShadow = true;
    this.group.add(m);
  }

  private decor(dc: Decor): void {
    const rng = this.rng;
    switch (dc.kind) {
      case 'vault': {
        // ribs every two metres and a barrel of dark stone between them (the passage is roofed: only the flame lights it)
        const span = dc.z1 - dc.z0;
        const cz = (dc.z0 + dc.z1) / 2;
        const barrel = new THREE.CylinderGeometry(span / 2 + 0.3, span / 2 + 0.3, dc.x1 - dc.x0, 24, 1, true, 0, Math.PI);
        barrel.rotateZ(Math.PI / 2); // axis along x, the half-shell over the top
        this.add(barrel, VAULT, (dc.x0 + dc.x1) / 2, dc.y, cz).castShadow = false;
        for (let x = dc.x0 + 1; x < dc.x1; x += 2.2) {
          const rib = new THREE.TorusGeometry(span / 2, 0.16, 6, 24, Math.PI);
          this.add(rib, STONE, x, dc.y, cz, Math.PI / 2).castShadow = false;
        }
        return;
      }
      case 'arch': {
        const span = dc.z1 - dc.z0;
        const cz = (dc.z0 + dc.z1) / 2;
        const ring = new THREE.TorusGeometry(span / 2 + 0.3, 0.45, 8, 28, Math.PI);
        ring.scale(1, 1, dc.thick / 0.9);
        this.add(ring, STONE, dc.x, dc.y, cz, Math.PI / 2).castShadow = false;
        this.add(block(dc.thick, 1.4, span + 2), STONE, dc.x, dc.y + span / 2 + 0.7, cz).castShadow = false;
        return;
      }
      case 'banner': {
        const geo = new THREE.PlaneGeometry(1.1, dc.len, 4, 12);
        geo.translate(0, -dc.len / 2, 0);
        const mesh = new THREE.Mesh(geo, CLOTH);
        mesh.position.set(dc.x, dc.y, dc.z);
        mesh.rotation.y = dc.ry;
        mesh.translateZ(0.12);
        mesh.castShadow = true;
        mesh.userData.dynamic = true;
        this.group.add(mesh);
        this.add(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), IRON, dc.x, dc.y + 0.02, dc.z, dc.ry).rotation.z = Math.PI / 2;
        this.banners.push({ mesh, base: Float32Array.from(geo.attributes.position.array), seed: rng.range(0, 10) });
        return;
      }
      case 'shaft': {
        // a shaft of real light through the broken roof: a pale column of dust and a bright bar on the floor
        const w = dc.x1 - dc.x0;
        const d = dc.z1 - dc.z0;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 14, d * 2.2), SHAFT);
        beam.position.set((dc.x0 + dc.x1) / 2 - 2.5, 7, (dc.z0 + dc.z1) / 2);
        beam.rotation.z = 0.35;
        beam.userData.dynamic = true;
        beam.renderOrder = 5;
        this.group.add(beam);
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, d), SHAFT_FLOOR);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set((dc.x0 + dc.x1) / 2, 0.02, (dc.z0 + dc.z1) / 2);
        bar.renderOrder = 4;
        this.group.add(bar);
        return;
      }
      case 'dial': {
        // a ring of hours inlaid in the floor
        const ring = this.add(new THREE.RingGeometry(dc.r - 0.18, dc.r, 64), IRON, dc.x, 0.015, dc.z);
        ring.rotation.x = -Math.PI / 2;
        ring.castShadow = false;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const m = this.add(new THREE.BoxGeometry(0.5, 0.03, 0.12), IRON, dc.x + Math.cos(a) * (dc.r - 0.6), 0.015, dc.z + Math.sin(a) * (dc.r - 0.6), -a);
          m.castShadow = false;
        }
        return;
      }
      case 'roof': {
        // a dark ceiling on beams: the place is indoors, and only fire lights it
        const m = this.add(new THREE.PlaneGeometry(dc.x1 - dc.x0, dc.z1 - dc.z0), VAULT, (dc.x0 + dc.x1) / 2, dc.y, (dc.z0 + dc.z1) / 2);
        m.rotation.x = Math.PI / 2;
        m.castShadow = false;
        for (let x = dc.x0 + 2; x < dc.x1; x += 4) this.add(new THREE.BoxGeometry(0.4, 0.5, dc.z1 - dc.z0), TIMBER, x, dc.y - 0.25, (dc.z0 + dc.z1) / 2).castShadow = false;
        return;
      }
      case 'plate':
        this.plateInlay(dc.x, dc.z, dc.s, dc.s, dc.flag);
        return;
      case 'rubble':
        for (let i = 0; i < dc.n; i++) {
          const s = rng.range(0.25, 0.6);
          const m = this.add(stoneBox(s, s * 0.7, s * 0.9, Math.round(dc.x * 11 + i), 0.08), STONE, dc.x + rng.range(-dc.r, dc.r), s * 0.3, dc.z + rng.range(-dc.r, dc.r));
          m.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4));
        }
        return;
    }
  }

  private brazier(x: number, z: number, cold: boolean): void {
    const pts = [[0, 0], [0.3, 0], [0.14, 0.75], [0.5, 1.0], [0.56, 1.1], [0, 1.03]].map(([a, b]) => new THREE.Vector2(a, b));
    this.add(new THREE.LatheGeometry(pts, 28), IRON, x, 0, z);
    this.add(stoneBox(1.3, 0.2, 1.3, Math.round(x * 3 + z), 0.03), STONE, x, 0.1, z);
    const tint = cold ? new THREE.Color(0.8, 0.95, 1.25) : new THREE.Color(1, 1, 1);
    const flame = new Flame(0.75, 1.15, 2, tint);
    flame.group.position.set(x, 1.05, z);
    flame.group.userData.dynamic = true;
    flame.strength = 0.35;
    this.group.add(flame.group);
    this.braziers.push({ x, z, flame, cold, lit: 0, tint });
  }

  private torch(x: number, y: number, z: number, ry: number): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    // an iron bracket out of the wall (+x local is out of the wall), a cup, the flame
    const arm = this.add(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), IRON, 0.2, -0.1, 0, 0, g);
    arm.rotation.z = Math.PI / 2 - 0.5;
    this.add(new THREE.CylinderGeometry(0.1, 0.05, 0.16, 10), IRON, 0.38, 0.05, 0, 0, g);
    this.add(stoneBox(0.25, 0.4, 0.25, Math.round(x * 3), 0.02), STONE, -0.02, -0.15, 0, 0, g);
    this.group.add(g);
    const flame = new Flame(0.32, 0.55, 2);
    g.updateMatrixWorld(true);
    const pos = new THREE.Vector3(0.38, 0.12, 0).applyMatrix4(g.matrixWorld);
    flame.group.position.copy(pos);
    flame.group.userData.dynamic = true;
    this.group.add(flame.group);
    this.torches.push({ pos: pos.clone().add(new THREE.Vector3(0, 0.35, 0)), flame });
  }

  private mech(def: MechDef): void {
    const root = new THREE.Group();
    root.position.set(def.x, 0, def.z);
    root.rotation.y = def.ry;
    root.userData.dynamic = true;
    switch (def.kind) {
      case 'portcullis': {
        // an iron grid across the way (local z spans it), sliding up into the vault
        for (let z = -def.w / 2 + 0.25; z < def.w / 2; z += 0.42) this.add(new THREE.BoxGeometry(0.1, def.h, 0.08), IRON, 0, def.h / 2, z, 0, root);
        for (let y = 0.5; y < def.h; y += 0.6) this.add(new THREE.BoxGeometry(0.08, 0.08, def.w), IRON, 0.02, y, 0, 0, root);
        for (let z = -def.w / 2 + 0.25; z < def.w / 2; z += 0.42) this.add(new THREE.ConeGeometry(0.06, 0.22, 6), IRON, 0, -0.08, z, 0, root).rotation.x = Math.PI;
        break;
      }
      case 'gate': {
        // two oak leaves, iron-banded, hinged at the piers; the bar across them in two brackets
        for (const s of [-1, 1]) {
          const hinge = new THREE.Group();
          hinge.position.set(0, 0, (s * def.w) / 2);
          hinge.userData.side = s;
          const leaf = this.add(stoneBox(0.22, def.h, def.w / 2 - 0.04, s * 17, 0.01), TIMBER, 0, def.h / 2, (-s * def.w) / 4, 0, hinge);
          leaf.castShadow = true;
          for (let y = 0.8; y < def.h; y += 1.4) this.add(new THREE.BoxGeometry(0.26, 0.12, def.w / 2 - 0.1), IRON, 0, y, (-s * def.w) / 4, 0, hinge);
          root.add(hinge);
        }
        const bar = this.add(stoneBox(0.26, 0.26, def.w + 0.5, 99, 0.015), TIMBER, -0.3, 1.45, 0, 0, root);
        bar.name = 'bar';
        for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(0.2, 0.42, 0.14), IRON, -0.22, 1.45, s * (def.w / 2 - 0.4), 0, root);
        break;
      }
      case 'ring':
        // the stones around the centre: they sink when the five plates are lit
        for (const b of def.blocks) {
          const m = this.add(block(b.hw * 2, b.y1 - b.y0, b.hd * 2), STONE, b.x - def.x, (b.y1 - b.y0) / 2, b.z - def.z, b.ry, root);
          m.castShadow = true;
        }
        break;
      case 'shadowdoor': {
        // a doorway of darkness: solid shadow until the flame is held high
        const m = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.h), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, side: THREE.DoubleSide }));
        m.rotation.y = Math.PI / 2;
        m.position.y = def.h / 2;
        m.name = 'dark';
        root.add(m);
        break;
      }
      case 'lever': {
        // a stone plate on the wall and an iron lever, thrown up: held in the same second as everything else
        this.add(stoneBox(0.5, 0.8, 0.12, 4, 0.02), DARK, 0, 1.3, 0.05, 0, root);
        const arm = new THREE.Group();
        arm.position.set(0, 1.3, -0.05);
        arm.name = 'arm';
        this.add(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), IRON, 0, 0.3, 0, 0, arm);
        this.add(new THREE.SphereGeometry(0.07, 10, 8), IRON, 0, 0.68, 0, 0, arm);
        arm.rotation.x = 0.5;
        root.add(arm);
        break;
      }
      default:
        break;
    }
    this.group.add(root);
    this.mechs.push({ def, root, open: 0 });
  }

  /** A riddle carved in a stone tablet: drawn once to a canvas, the letters lit only by the light that falls on them. */
  private plaque(text: string, x: number, y: number, z: number, ry: number): void {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#6b6470';
    g.fillRect(0, 0, 1024, 256);
    g.font = 'italic 52px "Cormorant Garamond", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > 920) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    lines.push(cur);
    lines.forEach((l, i) => {
      const yy = 128 + (i - (lines.length - 1) / 2) * 64;
      g.fillStyle = '#1a161e';
      g.fillText(l, 512, yy + 3);
      g.fillStyle = '#c9bfae';
      g.fillText(l, 512, yy);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: new THREE.Color(1, 0.75, 0.45), emissiveMap: tex, emissiveIntensity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    m.userData.dynamic = true;
    this.group.add(m);
    this.add(stoneBox(3.5, 1.05, 0.2, 77, 0.02), STONE, x, y, z, ry).translateZ(-0.12);
    this.plaques.push(m);
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, t: number, camera: THREE.Camera, city: City, focus: THREE.Vector3): void {
    const s = city.s;
    // banners stir
    for (const b of this.banners) {
      const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = b.base[i * 3];
        const y = b.base[i * 3 + 1];
        const f = Math.max(0, -y / 3);
        pos.setX(i, x + Math.sin(t * 1.3 + b.seed - f * 3) * 0.12 * f);
        pos.setZ(i, Math.sin(t * 1.9 + b.seed + x * 2 - f * 4) * 0.14 * f);
      }
      pos.needsUpdate = true;
      b.mesh.geometry.computeVertexNormals();
    }
    // braziers: embers until rested at, then a full fire; the false ones burn a cold blue from the start
    this.braziers.forEach((b, i) => {
      // a false one burns a slightly cold blue; once the dial has shown it, unmistakably
      if (b.cold) b.tint.lerp(city.flag('dial') ? new THREE.Color(0.4, 0.7, 1.9) : new THREE.Color(0.8, 0.95, 1.25), Math.min(1, dt * 2));
      const want = b.cold ? 0.85 : s.braziers[i] ? 1 : 0.32;
      b.lit += (want - b.lit) * Math.min(1, dt * 2);
      b.flame.strength = b.lit;
      b.flame.update(t, camera);
    });
    // the two nearest braziers take the shared lights
    const near = this.braziers.map((b, i) => ({ i, d: Math.hypot(b.x - focus.x, b.z - focus.z) })).sort((a, b) => a.d - b.d);
    BRAZIER_POOL.forEach((l, k) => {
      const n = near[k];
      if (!n) {
        l.intensity = 0;
        return;
      }
      const b = this.braziers[n.i];
      l.position.set(b.x, 1.8, b.z);
      l.color.set(b.cold ? 0x7fb4ff : 0xff8a3d);
      l.intensity = b.lit * (b.cold ? 10 : 24) * (0.9 + 0.1 * Math.sin(t * 13 + n.i));
    });
    for (const tc of this.torches) {
      tc.flame.strength = 0.9;
      tc.flame.update(t, camera);
    }
    const tn = this.torches.map((tc, i) => ({ i, d: tc.pos.distanceToSquared(focus) })).sort((a, b) => a.d - b.d);
    TORCH_LIGHTS.forEach((l, k) => {
      const n = tn[k];
      if (!n) {
        l.intensity = 0;
        return;
      }
      l.position.copy(this.torches[n.i].pos);
      l.intensity = 11 * (0.85 + 0.15 * Math.sin(t * 17 + n.i * 3) * Math.sin(t * 5.3 + n.i));
    });
    // mechanisms
    for (const m of this.mechs) {
      const want = city.mechOpen(m.def) ? 1 : 0;
      const rate = m.def.kind === 'portcullis' ? 0.9 : m.def.kind === 'shadowdoor' ? 6 : m.def.kind === 'ring' ? 0.5 : 1.2;
      m.open += (want - m.open) * Math.min(1, dt * rate);
      if (m.def.kind === 'ring') m.root.position.y = -m.open * 1.15;
      if (m.def.kind === 'shadowdoor') {
        const dark = m.root.getObjectByName('dark') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
        if (dark) {
          dark.material.opacity = 0.97 * (1 - m.open);
          dark.visible = dark.material.opacity > 0.01;
        }
      }
      if (m.def.kind === 'portcullis') m.root.position.y = m.open * (m.def.h - 0.6);
      if (m.def.kind === 'gate') {
        const bar = m.root.getObjectByName('bar');
        const k = Math.min(1, m.open * 3);
        if (bar) bar.position.y = 1.45 + k * 0.9;
        const swing = Math.max(0, (m.open - 0.25) / 0.75);
        for (const c of m.root.children) if (c.userData.side) c.rotation.y = -c.userData.side * swing * 1.45;
      }
      if (m.def.kind === 'lever') {
        const arm = m.root.getObjectByName('arm');
        if (arm) arm.rotation.x = 0.5 - m.open * 1.0;
      }
    }
    for (const pv of this.plateViews) {
      pv.k += ((city.flag(pv.flag) ? 1 : 0) - pv.k) * Math.min(1, dt * 1.5);
      pv.inlay.material.emissiveIntensity = pv.k * (0.6 + 0.1 * Math.sin(t * 3));
      pv.glow.material.opacity = pv.k * 0.45;
    }
    for (const bv of this.balances) {
      const pl = this.d.plates[bv.plate];
      const mid = (pl.min + pl.max) / 2;
      const want = city.flag(pl.id) ? 0 : Math.max(-0.45, Math.min(0.45, (city.plateCover(pl) - mid) * 1.6));
      bv.tilt += (want - bv.tilt) * Math.min(1, dt * 3);
      bv.beam.rotation.z = bv.tilt;
    }
    const f = s.flame;
    for (const pv of this.pageViews) {
      const pg = this.d.pages[pv.i];
      const read = city.flag(pg.id);
      const hd = Math.hypot(f.x - pg.x, f.z - pg.z);
      const elev = Math.atan2(f.y - pg.y, hd);
      const above = city.lit && hd < 1.2 && elev > 1.05 ? 1 : 0;
      pv.k += ((read ? 1 : above) - pv.k) * Math.min(1, dt * 4);
      pv.truth.material.opacity = pv.k;
      pv.lie.material.opacity = 1 - pv.k * 0.9;
      pv.truth.material.emissiveIntensity = read ? 0.25 + 0.1 * Math.sin(t * 2 + pv.i) : 0;
    }
    this.plaqueGlow = Math.max(0, this.plaqueGlow - dt);
    for (const pl of this.plaques) {
      const m = pl.material as THREE.MeshStandardMaterial;
      if (!m.emissive) continue;
      m.emissiveIntensity = Math.min(1, this.plaqueGlow) * (0.45 + 0.15 * Math.sin(t * 4));
    }
    // a pit that opens: its slabs fall
    for (const p of this.pitSlabs) {
      const pit = this.d.pits[p.pit];
      if (!city.pitOpen(pit)) continue;
      p.fall += dt;
      p.mesh.position.y = -0.07 - 0.5 * 18 * p.fall * p.fall;
      p.mesh.rotation.x += dt * 1.3;
      p.mesh.visible = p.mesh.position.y > -12;
    }
  }

  private plaqueGlow = 0;
  /** A hint: the inscriptions brighten for a while (the riddle's first tier). */
  brightenPlaques(seconds: number): void {
    this.plaqueGlow = Math.max(this.plaqueGlow, seconds);
  }

  dispose(): void {
    for (const l of [...TORCH_LIGHTS, ...BRAZIER_POOL]) l.intensity = 0;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
