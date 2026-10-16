import * as THREE from 'three';
import { HUT, type Level, type RegionKind } from '../data/levels';
import type { Solid } from '../sim/geom';
import { Rng } from '../sim/rng';
import { Flame } from './flame';
import { rimify } from './rim';
import { surface } from './surface';
import { column, stoneBox } from './shapes';
import { glowTexture, shaftTexture, tatterTexture } from './textures';

// Builds a level's 3D set from its data. Every sim solid is dressed by its tag (masonry, columns, houses, pews,
// pillars, walks, galleries, steps...), so what you see is what you hit. Around them each region adds what you
// cannot touch (arcades, vaults, the rose window, towers, the city far below the wall), then the interactive props
// (ember shrines, checkpoint braziers, the far gate).

interface Banner {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  base: Float32Array;
  seed: number;
}

interface ShrineView {
  root: THREE.Group;
  ember: THREE.Sprite;
  flame: Flame;
  on: number;
}

interface Brazier {
  x: number;
  flame: Flame;
  light: THREE.PointLight;
  lit: number;
}

// Every world material carries the surface-detail shader (variation, bump, rain stains, puddles): see surface.ts.
const STONE = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: 0.8, metalness: 0.04 }), 0.5, 'lvstone'), 'stone');
const DARK_STONE = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x131118, roughness: 0.9 }), 0.4, 'lvdark'), 'stone');
const TIMBER = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.8 }), 0.45, 'lvtimber'), 'timber');
const FLAG = surface(new THREE.MeshStandardMaterial({ color: 0x252029, roughness: 0.62, metalness: 0.06 }), 'paving');
const IRON = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.5, metalness: 0.6 }), 0.9, 'lviron'), 'iron');
// house walls: dark wet plaster that still catches a passing torch
const FACADE = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x2a232c, roughness: 0.85, metalness: 0.02 }), 0.45, 'lvfacade'), 'plaster');
const ROOF = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 0.6, metalness: 0.05 }), 0.55, 'lvroof'), 'timber');
const STATUE = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x221e27, roughness: 0.9 }), 0.6, 'statue'), 'stone');
const WARM_WINDOW = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.95, 0.3), fog: false }); // bright enough to bloom
const WINDOW_SPILL = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0.75, 0.32, 0.1), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const MOONBEAM = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: new THREE.Color(0.2, 0.25, 0.55), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class LevelView {
  readonly group = new THREE.Group();
  private banners: Banner[] = [];
  private shrines: ShrineView[] = [];
  private braziers: Brazier[] = [];
  private smallFlames: Flame[] = [];
  private gate: THREE.Group | null = null;
  private gateOpen = 0;
  gateTarget = 1;
  private level: Level;
  private rng: Rng;
  readonly id: string;
  private target: THREE.Group; // where builders add meshes (the level group, or a rotated sub-group)

  constructor(level: Level) {
    this.level = level;
    this.id = level.id;
    this.rng = new Rng(level.id.length * 131 + 7);
    this.target = this.group;
    if (level.area.kind === 'disc') {
      this.plazaFloor(level.area.r);
      for (const s of level.solids) this.buildSolid(s);
      this.groundsArch();
      this.groundsBanners();
    } else {
      this.roadFloor(level.area);
      for (const s of level.solids) this.buildSolid(s);
      for (const r of level.regions) this.dressRegion(r.kind, r.x0, r.x1);
    }
    for (const s of level.shrines) this.buildShrine(s.x, s.y, s.z);
    const side = level.area.kind === 'band' ? level.area.z0 + (level.id === 'cityWall' ? 0.6 : level.id === 'cathedral' ? 5.6 : 5.2) : 0;
    for (const x of level.checkpoints) this.buildBrazier(x, side);
    if (level.id === 'lowerCity' && level.end !== undefined) this.cityGate(level.end, 3.9);
    if (level.bossAt !== undefined && level.end !== undefined) this.cathedralDoors(level.end - 2.5, 2.0);
  }

  /** Build into a sub-group placed at (x, y, z) and turned by ry, then return to the level group. */
  private within(x: number, y: number, z: number, ry: number, fn: () => void): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const prev = this.target;
    this.target = g;
    fn();
    this.target = prev;
    prev.add(g);
    return g;
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rz = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    this.target.add(m);
    return m;
  }

  private regionAt(x: number): RegionKind {
    return this.level.regions.find((r) => x >= r.x0 && x < r.x1)?.kind ?? 'grounds';
  }

  /** A house front facing +z at z (dark windows, a candle in one or two), with a body `depth` deep behind it. */
  private house(cx: number, w: number, h: number, z: number, broken: boolean, depth = 0): void {
    const outline = () => {
      const o = new THREE.Shape();
      o.moveTo(-w / 2, 0);
      o.lineTo(w / 2, 0);
      o.lineTo(w / 2, h);
      if (broken) {
        o.lineTo(w * 0.15, h + 1.2);
        o.lineTo(w * 0.05, h + 0.4);
        o.lineTo(-w * 0.2, h + 1.9);
      } else o.lineTo(0, h + w * 0.45);
      o.lineTo(-w / 2, h);
      o.closePath();
      return o;
    };
    const s = outline();
    if (depth > 0.8) {
      // the house itself: the gable outline carried back, its roof line and all
      const body = new THREE.ExtrudeGeometry(outline(), { depth: depth - 0.6, bevelEnabled: false });
      this.add(body, FACADE, cx, 0, z - 0.3 - (depth - 0.6)).receiveShadow = true;
    }
    // dark windows: holes that show the fog behind
    const rng = this.rng;
    for (let fy = 1.6; fy < h - 1; fy += 2.3) {
      for (let fx = -w / 2 + 1; fx < w / 2 - 1; fx += 1.8) {
        if (rng.next() < 0.3) continue;
        const win = new THREE.Path();
        win.moveTo(fx, fy);
        win.lineTo(fx + 0.7, fy);
        win.lineTo(fx + 0.7, fy + 1.1);
        win.absarc(fx + 0.35, fy + 1.1, 0.35, 0, Math.PI, false);
        win.lineTo(fx, fy);
        s.holes.push(win);
      }
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    const m = this.add(g, FACADE, cx, 0, z - 0.3);
    m.receiveShadow = true;
    // a candle someone left: one or two windows still glow
    for (const hole of s.holes.slice(0, 6)) {
      if (rng.next() > 0.26) continue;
      const pts = hole.getPoints();
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), WARM_WINDOW);
      const wx = cx + (Math.max(...xs) + Math.min(...xs)) / 2;
      const wy = (Math.max(...ys) + Math.min(...ys)) / 2;
      pane.position.set(wx, wy, z - 0.35);
      this.target.add(pane);
      // its light spills out onto the wet street below
      const spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), WINDOW_SPILL);
      spill.rotation.x = -Math.PI / 2;
      spill.position.set(wx, 0.035, z + 0.9 + wy * 0.35);
      spill.scale.set(2.6, 1.6 + wy * 0.5, 1);
      this.target.add(spill);
    }
    if (!broken && rng.next() < 0.7) this.add(stoneBox(0.6, 1.6, 0.6, cx, 0.02), FACADE, cx + w * rng.range(-0.3, 0.3), h + w * 0.25, z);
    if (rng.next() < 0.4) {
      // a shop sign on an iron bracket
      const sx = cx + w * rng.range(-0.35, 0.35);
      this.add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), IRON, sx + 0.5, 3.2, z + 0.5, 0, Math.PI / 2).castShadow = false;
      this.add(stoneBox(0.7, 0.5, 0.06, sx, 0.004), TIMBER, sx + 0.8, 2.85, z + 0.5);
    }
  }

  /** Dark shapes between the camera and the lane: depth, parallax, a sense of being somewhere. */
  private chandelier(x: number, y: number, z: number): void {
    this.add(new THREE.CylinderGeometry(0.03, 0.03, 16 - y, 6), IRON, x, y + (16 - y) / 2, z).castShadow = false;
    const ring = this.add(new THREE.TorusGeometry(1.0, 0.05, 8, 40), IRON, x, y, z);
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.add(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6), STONE, x + Math.cos(a), y + 0.1, z + Math.sin(a)).castShadow = false;
    }
  }

  /** A saint in a niche between the windows: a hooded figure, hands folded. */
  private saint(x: number, z: number): void {
    this.add(stoneBox(0.9, 0.5, 0.7, x, 0.03), STONE, x, 2.7, z);
    this.add(new THREE.CylinderGeometry(0.22, 0.42, 2.2, 20), STONE, x, 4.05, z);
    this.add(new THREE.SphereGeometry(0.2, 18, 12), STONE, x, 5.35, z);
    this.add(new THREE.ConeGeometry(0.28, 0.6, 18, 1, true), STONE, x, 5.5, z);
  }

  private hangingBanner(x: number, z: number, top: number, len: number, onPole = false): void {
    const tat = tatterTexture(Math.round(x * 3));
    if (onPole) this.add(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 10), IRON, x, top - 1.6, z);
    const geo = new THREE.PlaneGeometry(1.2, len, 4, 12);
    geo.translate(onPole ? 0.6 : 0, -len / 2, 0);
    const mat = rimify(new THREE.MeshStandardMaterial({ color: onPole ? 0x2a0c10 : 0x16080c, roughness: 1, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }), 0.7, 'lvbanner');
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + (onPole ? 0.05 : 0), onPole ? top - 0.1 : top, z + 0.5);
    m.castShadow = true;
    m.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: tat, alphaTest: 0.5 });
    this.target.add(m);
    this.banners.push({ mesh: m, base: Float32Array.from(geo.attributes.position.array as Float32Array), seed: x });
  }

  private organ(x: number, z: number): void {
    for (let i = 0; i < 9; i++) {
      const h = 3 + Math.abs(4 - i) * -0.5 + 5;
      this.add(new THREE.CylinderGeometry(0.16, 0.16, h, 16), IRON, x + (i - 4) * 0.42, h / 2 + 1.2, z).castShadow = false;
    }
    this.add(stoneBox(4.4, 1.2, 1.0, x, 0.02), TIMBER, x, 0.6, z);
  }

  private candle(x: number, y: number, z: number): void {
    this.add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 10), STONE, x, y + 0.2, z).castShadow = false;
    const f = new Flame(0.1, 0.18, 1);
    f.group.position.set(x, y + 0.42, z);
    this.target.add(f.group);
    this.smallFlames.push(f);
  }

  private bell(x: number, y: number, z: number): void {
    const pts = [[0, 0], [1.0, 0], [0.95, 0.15], [0.7, 0.5], [0.55, 1.3], [0.45, 1.5], [0, 1.55]].map(([a, b]) => new THREE.Vector2(a, b));
    this.add(new THREE.LatheGeometry(pts, 36), IRON, x, y - 1.55, z);
    this.add(stoneBox(3.2, 0.4, 0.5, x, 0.02), TIMBER, x, y + 0.2, z);
  }

  private portcullis(x: number, z: number): void {
    for (let i = 0; i < 7; i++) this.add(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 8), IRON, x - 1.5 + i * 0.5, 2.6, z).castShadow = false;
    for (let j = 0; j < 4; j++) {
      const bar = this.add(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 8), IRON, x, 1.0 + j * 1.2, z);
      bar.rotation.z = Math.PI / 2;
      bar.castShadow = false;
    }
  }

  private lamp(x: number, z: number): void {
    this.add(new THREE.CylinderGeometry(0.06, 0.09, 3.6, 12), IRON, x, 1.8, z);
    const arm = this.add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), IRON, x + 0.35, 3.5, z, 0, Math.PI / 2);
    arm.castShadow = false;
    this.add(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 8, 1, true), IRON, x + 0.75, 3.25, z);
  }

  private stall(x: number, z: number): void {
    const tat = tatterTexture(Math.round(x));
    for (const dx of [-1.1, 1.1]) this.add(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 10), TIMBER, x + dx, 1.3, z);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.6, 6, 4),
      rimify(new THREE.MeshStandardMaterial({ color: 0x2a0f12, roughness: 1, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }), 0.6, 'lvcloth'),
    );
    cloth.position.set(x, 2.45, z + 0.3);
    cloth.rotation.x = -1.15;
    cloth.castShadow = true;
    this.target.add(cloth);
    for (let i = 0; i < 3; i++) {
      const r = this.rng.range(0.25, 0.4);
      this.add(new THREE.CylinderGeometry(r, r * 0.9, r * 2, 14), TIMBER, x + this.rng.range(-1.5, 1.5), r, z + this.rng.range(0.4, 1.0));
    }
  }

  private fountain(x: number, z: number): void {
    const pts = [[0, 0], [1.8, 0], [1.9, 0.6], [1.7, 0.65], [0.3, 0.6], [0.25, 1.6], [0.7, 1.7], [0.6, 1.8], [0.15, 1.9], [0, 2.6]].map(([a, b]) => new THREE.Vector2(a, b));
    this.add(new THREE.LatheGeometry(pts, 40), STONE, x, 0, z);
  }

  private pillar(x: number, z: number, h: number): void {
    this.add(column(0.55, 0.62, h, x), STONE, x, h / 2 + 0.4, z);
    this.add(stoneBox(1.5, 0.4, 1.5, x + 2, 0.03), STONE, x, 0.2, z);
    this.add(stoneBox(1.4, 0.5, 1.4, x + 3, 0.03), STONE, x, h + 0.65, z);
  }

  /** A gothic pointed arch between two pillars: two arcs, each centred on the opposite side, meeting at the apex. */
  private pointedArch(cx: number, z: number, span: number, springY: number): void {
    const h = span / 2;
    const r = span * 0.85;
    const thA = Math.acos((h - r) / r); // angle at the apex for the left arc (centre at -h + r)
    const apex = r * Math.sin(thA);
    const t = 0.55;
    const s = new THREE.Shape();
    s.moveTo(-h - t, springY - 0.5);
    s.lineTo(h + t, springY - 0.5);
    s.lineTo(h + t, springY + apex + 1.0);
    s.lineTo(-h - t, springY + apex + 1.0);
    s.closePath();
    const hole = new THREE.Path();
    const n = 20;
    hole.moveTo(-h, springY);
    for (let i = 1; i <= n; i++) {
      const th = Math.PI - (i / n) * (Math.PI - thA);
      hole.lineTo(-h + r + r * Math.cos(th), springY + r * Math.sin(th));
    }
    for (let i = n - 1; i >= 0; i--) {
      const th = Math.PI - (i / n) * (Math.PI - thA);
      hole.lineTo(h - r - r * Math.cos(th), springY + r * Math.sin(th));
    }
    hole.lineTo(-h, springY);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
    this.add(g, STONE, cx, 0, z - 0.45);
  }

  /**
   * A tall cathedral wall with lancet windows and cold moonlight behind the glass. Built along local x from x0 to x1
   * with its inner face toward local +z at z = 0, then placed at (px, pz) and turned by ry.
   */
  private naveWall(x0: number, x1: number, px: number, pz: number, ry: number): void {
    this.within(px, 0, pz, ry, () => {
      const s = new THREE.Shape();
      s.moveTo(x0, 0);
      s.lineTo(x1, 0);
      s.lineTo(x1, 16);
      s.lineTo(x0, 16);
      s.closePath();
      for (let x = x0 + 3; x < x1 - 2; x += 6) {
        // a moonbeam slanting in through the lancet to the floor of the nave (two crossed sheets, seen from anywhere)
        const slope = Math.atan2(-5.5, 9);
        for (const cross of [0, 1]) {
          const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.5, Math.hypot(5.5, 9)), MOONBEAM);
          beam.position.set(x, 4.5, 2.75);
          beam.rotation.set(slope, cross ? 0 : Math.PI / 2, 0);
          beam.renderOrder = 4;
          this.target.add(beam);
        }
        const w = new THREE.Path();
        w.moveTo(x - 0.8, 4);
        w.lineTo(x + 0.8, 4);
        w.lineTo(x + 0.8, 11);
        w.quadraticCurveTo(x + 0.8, 12.6, x, 13.4);
        w.quadraticCurveTo(x - 0.8, 12.6, x - 0.8, 11);
        w.lineTo(x - 0.8, 4);
        s.holes.push(w);
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false, curveSegments: 12 });
      const m = this.add(g, DARK_STONE, 0, 0, -0.8);
      m.castShadow = false;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.34, 0.75), fog: false }));
      glow.position.set((x0 + x1) / 2, 8, -1.2);
      this.target.add(glow);
    });
  }

  /** The rose window: radial stone tracery over faint stained light. */
  private roseWindow(x: number, y: number, z: number): void {
    const R = 4.2;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(R, 64),
      new THREE.MeshBasicMaterial({ map: roseTexture(), color: new THREE.Color(1.6, 1.1, 1.5), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    glass.position.set(x, y, z + 0.2);
    this.target.add(glass);
    const ring = this.add(new THREE.TorusGeometry(R, 0.28, 12, 72), STONE, x, y, z + 0.5);
    ring.castShadow = false;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const spoke = this.add(stoneBox(0.14, R * 2, 0.2, i, 0.004), STONE, x, y, z + 0.45);
      spoke.rotation.z = a;
      spoke.castShadow = false;
    }
    this.add(new THREE.TorusGeometry(R * 0.38, 0.16, 10, 48), STONE, x, y, z + 0.5).castShadow = false;
  }

  /** A round tower from y0 up to h, crenellated. */
  private tower(x: number, z: number, h: number, y0 = 0): void {
    this.add(column(1.8, 2.0, h - y0, x * 2, 6), DARK_STONE, x, (h + y0) / 2, z);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (i % 2) continue;
      this.add(stoneBox(0.9, 0.9, 0.6, x + i, 0.03), DARK_STONE, x + Math.cos(a) * 1.75, h + 0.45, z + Math.sin(a) * 1.75, -a);
    }
  }

  // ------------------------------------------------------------- props
  private buildShrine(x: number, y: number, z: number): void {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const plinth = new THREE.Mesh(stoneBox(0.8, 0.5, 0.8, x, 0.03), STONE);
    plinth.position.y = 0.25;
    plinth.castShadow = true;
    const cupPts = [[0, 0], [0.12, 0], [0.1, 0.25], [0.36, 0.42], [0.4, 0.5], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupPts, 24), IRON);
    cup.position.y = 0.5;
    const ember = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3, 1.2, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ember.position.y = 1.1;
    const flame = new Flame(0.4, 0.6, 2);
    flame.group.position.y = 0.9;
    root.add(plinth, cup, ember, flame.group);
    this.target.add(root);
    this.shrines.push({ root, ember, flame, on: 0 });
  }

  private buildBrazier(x: number, z: number): void {
    const pts = [[0, 0], [0.25, 0], [0.12, 0.7], [0.45, 0.95], [0.5, 1.05], [0, 0.98]].map(([a, b]) => new THREE.Vector2(a, b));
    this.add(new THREE.LatheGeometry(pts, 28), IRON, x, 0, z);
    const flame = new Flame(0.7, 1.1, 2);
    flame.group.position.set(x, 1.0, z);
    flame.strength = 0;
    this.target.add(flame.group);
    const light = new THREE.PointLight(0xff8a3d, 0, 14, 2);
    light.position.set(x, 1.7, z + 0.4);
    this.target.add(light);
    this.braziers.push({ x, flame, light, lit: 0 });
  }

  /** The city gate: a lintel and a broken crest over the two piers (the piers are sim solids). */
  private cityGate(x: number, half: number): void {
    this.add(stoneBox(1.4, 1.1, half * 2 + 1.4, x + 3, 0.05), STONE, x, 6.5, 0);
    for (let i = 0; i < 5; i++) this.add(stoneBox(0.8, 0.7, 0.7, x + i, 0.05), STONE, x + this.rng.range(-0.1, 0.1), 7.4, -half + 0.4 + i * (half * 0.45));
  }

  /** The cathedral doors under the rose window: two leaves on hinges, shut until the Marshal falls. */
  private cathedralDoors(x: number, half: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    const ph = 5.6;
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(0, 0, s * half);
      const door = new THREE.Mesh(stoneBox(0.18, ph, half, x + s * 7, 0.01), TIMBER);
      door.position.set(0, ph / 2, -s * half / 2);
      door.castShadow = true;
      hinge.add(door);
      for (let y = 1; y < ph; y += 1.6) {
        const band = new THREE.Mesh(stoneBox(0.22, 0.12, half * 0.96, y + s, 0.004), IRON);
        band.position.set(0, y, -s * half / 2);
        hinge.add(band);
      }
      hinge.userData.side = s;
      g.add(hinge);
    }
    this.gate = g;
    this.gateOpen = 0;
    this.gateTarget = 0;
    this.target.add(g);
  }

  /** Per frame: banners, shrine embers, braziers, the gate. */
  update(dt: number, t: number, camera: THREE.Camera, shrinesActive: boolean[], checkpointsLit: number): void {
    for (const b of this.banners) {
      const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = b.base[i * 3];
        const y = b.base[i * 3 + 1];
        const f = Math.max(0, -y / 3);
        pos.setX(i, x + Math.sin(t * 1.6 + b.seed - f * 3) * 0.25 * f + f * f * 0.5);
        pos.setZ(i, Math.sin(t * 2.3 + b.seed + x * 2 - f * 4) * 0.18 * f);
      }
      pos.needsUpdate = true;
      b.mesh.geometry.computeVertexNormals();
    }
    this.shrines.forEach((s, i) => {
      s.on += ((shrinesActive[i] ? 1 : 0) - s.on) * Math.min(1, dt * 3);
      const pulse = 0.85 + 0.15 * Math.sin(t * 4 + i);
      s.ember.material.opacity = s.on * pulse;
      s.ember.scale.setScalar(1.2 + 0.4 * s.on * pulse);
      s.flame.strength = s.on * 0.9;
      s.flame.update(t, camera);
    });
    for (const f of this.smallFlames) f.update(t, camera);
    this.braziers.forEach((b, i) => {
      b.lit += ((i < checkpointsLit ? 1 : 0) - b.lit) * Math.min(1, dt * 2);
      b.flame.strength = b.lit;
      b.flame.update(t, camera);
      b.light.intensity = b.lit * 22 * (0.9 + 0.1 * Math.sin(t * 13 + i));
    });
    if (this.gate) {
      this.gateOpen += (this.gateTarget - this.gateOpen) * Math.min(1, dt * 1.2);
      for (const c of this.gate.children) if (c.userData.side) c.rotation.y = -c.userData.side * this.gateOpen * 1.5;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }

  // ------------------------------------------------------------- the road east
  /** Paving across the road, instanced: cobbles in the streets, great slabs in the cathedral, blocks on the wall. */
  private roadFloor(a: { x0: number; x1: number; z0: number; z1: number }): void {
    const rng = new Rng(77);
    const variants = [0, 1, 2, 3].map((v) => stoneBox(1, 0.12, 1, 400 + v, 0.012));
    const mats: THREE.Matrix4[][] = variants.map(() => []);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let x = a.x0 - 2; x < a.x1 + 2; ) {
      const kind = this.regionAt(x);
      const big = kind === 'nave' || kind === 'apse';
      const wall = kind === 'rampart' || kind === 'gatehouse';
      const sx = big ? 1.95 : wall ? 1.3 : rng.range(0.85, 1.35);
      const sz = big ? 1.95 : 1.1;
      const skip = big || wall ? 0.03 : 0.1;
      for (let z = a.z0 - (wall ? 0.6 : 0); z < a.z1 + (wall ? 0.6 : 0); z += sz) {
        if (rng.next() < skip) continue;
        e.set(0, rng.range(-0.03, 0.03), 0);
        q.setFromEuler(e);
        mats[Math.floor(rng.next() * variants.length)].push(
          new THREE.Matrix4().compose(new THREE.Vector3(x + sx / 2, -0.05 + rng.range(-0.02, 0.02), z + sz / 2), q, new THREE.Vector3(sx - 0.06, 1, sz - 0.06)),
        );
      }
      x += sx;
    }
    variants.forEach((g, v) => {
      const inst = new THREE.InstancedMesh(g, FLAG, mats[v].length);
      mats[v].forEach((m, i) => inst.setMatrixAt(i, m));
      inst.receiveShadow = true;
      this.target.add(inst);
    });
  }

  /** A house solid: its front faces the street (z = 0), its body fills the solid. */
  private houseSolid(s: Solid): void {
    const side = Math.sign(s.z) || 1;
    const front = s.z - side * s.hd;
    const h = s.y1 - s.y0;
    const broken = this.rng.next() < 0.35;
    // a house on the +z side is the same house turned to face -z
    this.within(s.x, 0, front, side > 0 ? Math.PI : 0, () => this.house(0, s.hw * 2 - 0.1, h, 0.3, broken, s.hd * 2));
  }

  /** A timber floor of planks on beams, on posts at its street edge. */
  private timberWalk(s: Solid): void {
    const rng = this.rng;
    const x0 = s.x - s.hw;
    const x1 = s.x + s.hw;
    const top = s.y1;
    for (let x = x0; x < x1 - 0.1; ) {
      const pw = rng.range(0.22, 0.32);
      if (rng.next() > 0.08) this.add(stoneBox(pw - 0.02, 0.08, s.hd * 2, x * 9, 0.006), TIMBER, x + pw / 2, top - 0.04 + rng.range(-0.015, 0.015), s.z, 0, rng.range(-0.02, 0.02));
      x += pw;
    }
    for (const dz of [-1, 1]) this.add(stoneBox(x1 - x0, 0.16, 0.16, s.x + dz, 0.01), TIMBER, s.x, top - 0.16, s.z + dz * (s.hd - 0.1));
    const street = s.z - Math.sign(s.z) * (s.hd - 0.12);
    for (let x = x0 + 0.3; x <= x1 - 0.2; x += 3.2) this.add(new THREE.CylinderGeometry(0.1, 0.12, top - 0.2, 10), TIMBER, x, (top - 0.2) / 2, street);
  }

  /** A pew facing the altar (+x): seat, back, carved ends. */
  private pew(s: Solid): void {
    const h = s.y1 - s.y0;
    const len = s.hd * 2;
    this.add(stoneBox(0.6, 0.12, len, s.x + s.z, 0.01), TIMBER, s.x + 0.05, 0.48, s.z);
    this.add(stoneBox(0.1, h, len, s.x + s.z + 1, 0.01), TIMBER, s.x - 0.22, h / 2, s.z);
    for (const e of [-1, 1]) this.add(stoneBox(0.7, h + 0.12, 0.1, s.x + e, 0.01), TIMBER, s.x, (h + 0.12) / 2, s.z + (e * len) / 2);
  }

  /** Everything a region has that you cannot walk into: arcades, vaults, windows, towers, the city below. */
  private dressRegion(kind: RegionKind, x0: number, x1: number): void {
    const rng = this.rng;
    switch (kind) {
      case 'street':
      case 'market':
        // washing lines and chains strung between the house fronts, dripping in the rain
        for (let x = x0 + 5; x < x1 - 3; x += rng.range(9, 15)) {
          const z = kind === 'market' ? 10 : 5;
          const line = this.add(new THREE.CylinderGeometry(0.015, 0.015, z * 2, 5), IRON, x, rng.range(4.6, 6.2), 0, 0, 0);
          line.rotation.x = Math.PI / 2;
          line.castShadow = false;
          if (rng.next() < 0.6) this.hangingBanner(x - 0.6, rng.range(-z * 0.5, z * 0.5) - 0.5, line.position.y, rng.range(1.2, 2.2));
        }
        break;
      case 'nave':
      case 'apse': {
        const apse = kind === 'apse';
        const pz = apse ? 6.4 : 4.6;
        const px0 = apse ? 72 : -9;
        const px1 = apse ? 96 : 63;
        // arcades between the pillars, and transverse ribs across the vault
        for (let x = px0; x < px1; x += 6) for (const side of [-1, 1]) this.pointedArch(x + 3, side * pz, 6, apse ? 8.7 : 8.2);
        for (let x = px0; x <= px1; x += 6) this.within(x, 0, 0, Math.PI / 2, () => this.pointedArch(0, 0, pz * 2, 12.4));
        // the vault: broken, so the rain finds its way in
        for (let x = x0; x < x1; x += 6) if (rng.next() > 0.3) this.add(stoneBox(6, 0.6, 19.6, x * 3, 0.05), DARK_STONE, x + 3, 16.6, 0).castShadow = false;
        for (let x = x0 + 6; x < x1 - 3; x += 12) this.chandelier(x, 7.6, 0);
        for (let x = x0 + 6; x < x1 - 3; x += 6) for (const side of [-1, 1]) this.saint(x, side * 8.4);
        for (let x = px0 + 6; x < px1; x += 18) for (const side of [-1, 1]) this.hangingBanner(x, side * pz - 0.5, 10.8, 4.2);
        if (apse) {
          // the door wall: the rose window above the doors, organ pipes either side, all facing down the nave
          this.add(stoneBox(1.2, 10.4, 4.4, 101, 0.04), DARK_STONE, 100.5, 10.8, 0).castShadow = false;
          this.within(99.85, 0, 0, -Math.PI / 2, () => {
            this.roseWindow(0, 10.6, 0);
            for (const side of [-1, 1]) this.organ(side * 5.6, 0.1);
          });
        }
        break;
      }
      case 'rampart':
      case 'gatehouse': {
        const gate = kind === 'gatehouse';
        // the wall itself, falling away into the dark below the walk; the city sleeps far beneath
        this.add(stoneBox(x1 - x0, 24, 7.4, x0 * 3, 0.05), DARK_STONE, (x0 + x1) / 2, -12.06, 0).castShadow = false;
        if (!gate) {
          for (let x = x0 + 0.5; x < x1; x += 1.6) this.add(stoneBox(0.9, 0.9, 0.5, x * 3, 0.04), STONE, x, 0.6, 3.35);
          this.add(stoneBox(x1 - x0, 0.6, 0.5, x0 + 1, 0.03), STONE, (x0 + x1) / 2, 0.3, 3.35);
          this.add(stoneBox(x1 - x0, 0.7, 0.5, x0 + 2, 0.03), STONE, (x0 + x1) / 2, 0.35, -3.35);
          for (let x = x0 + 8; x < x1; x += 26) {
            this.tower(x, -7.6, 12, -24);
            this.hangingBanner(x, -7.6 + 2.1, 11.5, 3.4, true);
          }
          for (let x = x0; x < x1; ) {
            const w = rng.range(5, 8);
            this.within(x + w / 2, -24, -rng.range(14, 30), 0, () => this.house(0, w, rng.range(5, 9), 0, rng.next() < 0.3, 4));
            x += w + rng.range(0.5, 4);
          }
        } else {
          for (const [tx, tz] of [[65, -6.6], [65, 6.6], [95, -6.6], [95, 6.6]] as const) this.tower(tx, tz, 16, -24);
          // the Dawn Gate: an arch over the rampart's end, its portcullis raised, the great bell hanging in it
          for (const side of [-1, 1]) this.add(stoneBox(1.2, 7.5, 1.2, side + 9, 0.05), STONE, 94.4, 3.5 + 3.75, side * 3.7);
          this.add(stoneBox(1.4, 1.3, 8.6, 93, 0.05), STONE, 94.4, 11.6, 0);
          this.bell(94.4, 11, 0);
          this.within(94.4, 6.2, 0, Math.PI / 2, () => this.portcullis(0, 0)); // raised into the arch
          for (const side of [-1, 1]) this.hangingBanner(65 + 0.6, side * 6.6 + 2, 15, 3.4, true);
        }
        break;
      }
      case 'grounds':
        break;
    }
  }

  // ------------------------------------------------------------- the hearth grounds: a round ruined plaza
  /** Paving in rings around the hearth, whole near the fire and broken further out (instanced: few draw calls). */
  private plazaFloor(radius: number): void {
    const rng = new Rng(57);
    const variants = [0, 1, 2, 3].map((v) => stoneBox(1, 0.12, 1, 300 + v, 0.012));
    const mats: THREE.Matrix4[][] = variants.map(() => []);
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let r = 2.1; r < radius - 2; r += 1.08) {
      const n = Math.floor((Math.PI * 2 * r) / 1.12);
      const skip = r < 13 ? 0.08 : 0.55;
      const off = rng.range(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        if (rng.next() < skip) continue;
        const a = off + (i / n) * Math.PI * 2;
        q.setFromAxisAngle(up, -a + rng.range(-0.03, 0.03));
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(Math.cos(a) * r, -0.05 + rng.range(-0.02, 0.02), Math.sin(a) * r),
          q,
          new THREE.Vector3(1.0 + rng.range(-0.06, 0.06), 1, ((Math.PI * 2 * r) / n) * 0.94),
        );
        mats[Math.floor(rng.next() * variants.length)].push(m);
      }
    }
    variants.forEach((g, v) => {
      const inst = new THREE.InstancedMesh(g, FLAG, mats[v].length);
      mats[v].forEach((m, i) => inst.setMatrixAt(i, m));
      inst.receiveShadow = true;
      this.target.add(inst);
    });
  }

  /** One sim solid, dressed by its tag. */
  private buildSolid(s: Solid): void {
    const h = s.y1 - s.y0;
    switch (s.tag) {
      case 'hearth':
        return; // the Hearth draws itself
      case 'pier':
        if (s.kind === 'box') return; // the great arch's piers are part of the arch
        this.add(column(s.hw * 0.9, s.hw, h, s.x * 7 + s.z), STONE, s.x, s.y0 + h / 2, s.z);
        return;
      case 'column':
        return this.plazaColumn(s);
      case 'statue':
        return this.statue(s.x, s.z);
      case 'hut':
        // a timber post on a stone footing
        this.add(stoneBox(0.6, 0.35, 0.6, s.x * 9 + s.z, 0.03), STONE, s.x, 0.175, s.z);
        this.add(new THREE.CylinderGeometry(s.hw * 0.85, s.hw, h - 0.35, 10), TIMBER, s.x, 0.35 + (h - 0.35) / 2, s.z);
        return;
      case 'roof':
        return this.hutRoof(s);
      case 'house':
        return this.houseSolid(s);
      case 'timber':
        return this.timberWalk(s);
      case 'stone':
      case 'gallery':
        return this.raisedWalk(s, s.tag === 'gallery' ? -(Math.sign(s.z) || 1) : Math.sign(s.z) || 1);
      case 'crate': {
        const m = this.add(stoneBox(s.hw * 2, h, s.hd * 2, s.x * 3 + s.z, 0.02), TIMBER, s.x, s.y0 + h / 2, s.z);
        m.rotation.y = s.ry;
        return;
      }
      case 'lamp':
        return this.lamp(s.x, s.z);
      case 'stall':
        this.within(s.x, 0, s.z, s.z > 0 ? Math.PI : 0, () => this.stall(0, 0));
        return;
      case 'fountain':
        return this.fountain(s.x, s.z);
      case 'gatepier':
      case 'doorwall':
        this.add(stoneBox(s.hw * 2, h, s.hd * 2, s.x + s.z, 0.04), s.tag === 'doorwall' ? DARK_STONE : STONE, s.x, s.y0 + h / 2, s.z);
        return;
      case 'navewall':
        if (s.hw > s.hd) this.naveWall(s.x - s.hw, s.x + s.hw, s.z > 0 ? 2 * s.x : 0, s.z - Math.sign(s.z) * s.hd + (s.z > 0 ? 0 : 0), s.z > 0 ? Math.PI : 0);
        else this.naveWall(-s.hd, s.hd, s.x + s.hw, 0, Math.PI / 2);
        return;
      case 'pillar':
        return this.pillar(s.x, s.z, s.y1 - 0.9);
      case 'pew':
        return this.pew(s);
      case 'dais':
        this.add(stoneBox(s.hw * 2, h, s.hd * 2, 91, 0.02), STONE, s.x, s.y0 + h / 2, s.z);
        return;
      case 'altar':
        this.add(stoneBox(s.hw * 2, h, s.hd * 2, 77, 0.03), STONE, s.x, s.y0 + h / 2, s.z);
        for (let i = 0; i < 5; i++) this.candle(s.x - 0.3 + (i % 2) * 0.5, s.y1, s.z - 1.2 + i * 0.6);
        return;
      case 'merlon': {
        const m = this.add(stoneBox(s.hw * 2, h, s.hd * 2, s.x * 5, 0.05), STONE, s.x, s.y0 + h / 2, s.z);
        m.rotation.set(this.rng.range(-0.04, 0.04), this.rng.range(-0.15, 0.15), this.rng.range(-0.05, 0.05));
        return;
      }
      case 'rampart':
        // the gatehouse block: its face runs down the whole height of the wall
        this.add(stoneBox(s.hw * 2, h + 24, s.hd * 2 + 0.4, 55, 0.05), DARK_STONE, s.x, s.y1 - (h + 24) / 2, s.z);
        for (let x = s.x - s.hw + 0.5; x < s.x + s.hw; x += 1.6) for (const side of [-1, 1]) this.add(stoneBox(0.9, 0.9, 0.5, x * 5 + side, 0.04), STONE, x, s.y1 + 0.45, side * (s.hd + 0.3));
        return;
      case 'walk':
        return this.raisedWalk(s, Math.sign(s.x) || 1); // the outer edge faces away from the hearth
      case 'step': {
        const m = this.add(stoneBox(s.hw * 2, h, s.hd * 2, s.x * 5 + s.z, 0.05), STONE, s.x, s.y0 + h / 2, s.z);
        m.rotation.y = s.ry;
        return;
      }
      default:
        if (s.kind === 'box') this.masonry(s);
        else this.add(column(s.hw * 0.95, s.hw, h, s.x * 3), STONE, s.x, s.y0 + h / 2, s.z);
    }
  }

  /**
   * The hearth's hut roof: tie beams on the posts, two shingled slopes up to a ridge, gable ends, and a louvre on
   * the ridge so the fire's smoke can get out while the rain cannot get in.
   */
  private hutRoof(s: Solid): void {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.ry;
    const W = HUT.w;
    const D = HUT.d;
    const eave = HUT.eave;
    const rise = HUT.ridge - eave;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // tie beams around the top of the posts
    for (const z of [-D / 2 + 0.35, D / 2 - 0.35]) add(stoneBox(W - 0.3, 0.22, 0.24, z * 5, 0.01), TIMBER, 0, eave - 0.1, z);
    for (const x of [-2.55, 2.55]) add(stoneBox(0.24, 0.22, D - 0.6, x * 5, 0.01), TIMBER, x, eave - 0.1, 0);
    // two slopes of overlapping shingle rows (eaves overhang the posts)
    const half = D / 2 + 0.25;
    const slope = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const rows = 8;
    for (const side of [-1, 1]) {
      for (let i = 0; i < rows; i++) {
        const f = (i + 0.5) / rows;
        const z = side * half * (1 - f);
        const y = eave + rise * f + 0.05;
        const m = add(stoneBox(W + 0.5, 0.07, slope / rows + 0.18, i * 13 + side, 0.008), ROOF, this.rng.range(-0.04, 0.04), y, z, side * ang);
        m.rotation.z = this.rng.range(-0.012, 0.012);
      }
      // rafters under each slope, lit by the fire from below
      for (let x = -W / 2 + 0.3; x <= W / 2 - 0.2; x += 0.95) {
        add(stoneBox(0.12, 0.14, slope, x * 3 + side, 0.004), TIMBER, x, eave + rise / 2 - 0.12, (side * half) / 2, side * ang);
      }
    }
    add(stoneBox(W + 0.6, 0.2, 0.22, 7, 0.01), TIMBER, 0, HUT.ridge + 0.05, 0); // ridge beam
    // gable ends: timber triangles, open below the beam
    const tri = new THREE.Shape();
    tri.moveTo(-half, 0);
    tri.lineTo(half, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
      const m = add(new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false }), TIMBER, x, eave, 0);
      m.rotation.y = Math.PI / 2;
      m.position.x = x - 0.04;
    }
    // the smoke louvre: a little roof over a gap in the ridge
    for (const side of [-1, 1]) add(stoneBox(1.4, 0.06, 0.55, side * 3, 0.006), ROOF, 0, HUT.ridge + 0.42, side * 0.22, side * 0.5);
    for (const x of [-0.6, 0.6]) add(stoneBox(0.08, 0.38, 0.08, x * 9, 0.004), TIMBER, x, HUT.ridge + 0.22, 0);
    this.target.add(g);
  }

  /** Coursed masonry, broken along the top, laid along a (rotated) wall. */
  private masonry(s: Solid): void {
    const rng = this.rng;
    const g = new THREE.Group();
    g.position.set(s.x, s.y0, s.z);
    g.rotation.y = s.ry;
    const len = s.hw * 2;
    const depth = s.hd * 2;
    const H = s.y1 - s.y0;
    const courses = Math.max(2, Math.round(H / 0.36));
    const ch = H / courses;
    let seed = Math.round(s.x * 13 + s.z * 7);
    for (let c = 0; c < courses; c++) {
      let x = -len / 2;
      let first = c % 2 ? rng.range(0.2, 0.35) : 0;
      while (x < len / 2 - 0.05) {
        const bl = Math.min(len / 2 - x, first || rng.range(0.45, 0.8));
        first = 0;
        if (c === courses - 1 && rng.next() < 0.3) {
          x += bl;
          continue;
        }
        const m = new THREE.Mesh(stoneBox(bl - 0.03, ch - 0.025, depth + rng.range(-0.08, 0.04), seed++, 0.03), STONE);
        m.position.set(x + bl / 2, ch * c + ch / 2, rng.range(-0.03, 0.03));
        m.rotation.set(0, rng.range(-0.04, 0.04), c === courses - 1 ? rng.range(-0.08, 0.08) : rng.range(-0.015, 0.015));
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
        x += bl;
      }
    }
    // rubble at its foot
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(stoneBox(0.5, 0.35, 0.45, seed++, 0.06), STONE);
      m.position.set(rng.range(-len / 2, len / 2), 0.15, (rng.next() < 0.5 ? -1 : 1) * (depth / 2 + rng.range(0.2, 0.6)));
      m.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4));
      m.castShadow = true;
      g.add(m);
    }
    this.target.add(g);
  }

  /** A fluted column: tall ones keep a capital, short ones are broken with a fallen drum beside them. */
  private plazaColumn(s: Solid): void {
    const h = s.y1 - s.y0;
    const r = s.hw;
    const seed = Math.round(s.x * 11 + s.z * 5);
    this.add(stoneBox(r * 2.4, 0.25, r * 2.4, seed, 0.03), STONE, s.x, 0.125, s.z);
    this.add(column(r * 0.9, r, h - 0.25, seed + 1), STONE, s.x, 0.25 + (h - 0.25) / 2, s.z);
    if (h > 3) this.add(stoneBox(r * 2.6, 0.4, r * 2.6, seed + 2, 0.05), STONE, s.x, h + 0.2, s.z, s.x);
    else {
      const a = s.x * 1.7 + s.z;
      const drum = this.add(column(r * 0.9, r * 0.9, 0.9, seed + 3), STONE, s.x + Math.cos(a) * 1.4, r * 0.9, s.z + Math.sin(a) * 1.4);
      drum.rotation.set(Math.PI / 2, a, 0);
    }
  }

  /**
   * A raised stone walk: slab, a balustrade along its long open edge, corbels beneath. `out` (+1/-1) says which side
   * of its short axis the balustrade runs on.
   */
  private raisedWalk(s: Solid, out: number): void {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    // build with the long side along local z; turn it when the walk runs along x
    const alongX = s.hw > s.hd;
    g.rotation.y = s.ry + (alongX ? Math.PI / 2 : 0);
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, STONE);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    const W = (alongX ? s.hd : s.hw) * 2;
    const D = (alongX ? s.hw : s.hd) * 2;
    add(stoneBox(W, s.y1 - s.y0, D, s.x * 3, 0.03), 0, s.y0 + (s.y1 - s.y0) / 2, 0);
    if (alongX) out = -out; // local x is world -z after the quarter turn
    for (let z = -D / 2 + 0.3; z < D / 2; z += 0.42) add(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 12), out * (W / 2 - 0.15), s.y1 + 0.37, z);
    add(stoneBox(0.24, 0.1, D, s.x + 3, 0.01), out * (W / 2 - 0.15), s.y1 + 0.8, 0);
    for (let z = -D / 2 + 1.2; z < D / 2; z += 2.4) add(stoneBox(1.4, 0.6, 0.35, z + s.x, 0.03), 0, s.y0 - 0.3, z);
    this.target.add(g);
  }

  /** The hearth's great broken arch (its piers are sim solids), and fallen voussoirs. */
  private groundsArch(): void {
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rz = 0) => this.add(geo, STONE, x, y, z, ry, rz);
    const rng = new Rng(21);
    let seed = 1;
    const pier = (px: number, blocks: number) => {
      for (let i = 0; i < blocks; i++) add(stoneBox(1.15, 0.95, 1.15, seed++, 0.05), px + rng.range(-0.04, 0.04), 0.6 + i * 0.97 + 0.475, -3.2, rng.range(-0.05, 0.05));
      add(stoneBox(1.7, 0.6, 1.7, seed++, 0.05), px, 0.3, -3.2);
    };
    pier(-3.6, 6);
    pier(3.6, 4);
    const R = 3.6;
    const cy = 6.4;
    for (let i = 0; i <= 9; i++) {
      const a = Math.PI - (i / 12) * Math.PI; // left springing round to just past the crown
      const m = add(stoneBox(0.85, 0.62, 1.05, seed++, 0.05), Math.cos(a) * R, cy + Math.sin(a) * R, -3.2);
      m.rotation.z = a - Math.PI / 2;
    }
    for (let i = 0; i < 4; i++) {
      const m = add(stoneBox(0.85, 0.62, 1.05, seed++, 0.06), 4.6 + i * 0.8 + rng.range(-0.2, 0.2), 0.3, -2.4 + rng.range(-0.8, 0.6));
      m.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.5, 0.5));
    }
  }

  /** A stone knight of his fallen order, kneeling forever, facing the hearth. */
  private statue(x: number, z: number): void {
    const stone = STATUE;
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, px: number, py: number, pz: number, rz = 0) => {
      const m = new THREE.Mesh(geo, stone);
      m.position.set(px, py, pz);
      m.rotation.z = rz;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    add(stoneBox(1.6, 0.5, 1.4, x * 3, 0.05), 0, 0.25, 0); // plinth
    add(new THREE.CapsuleGeometry(0.2, 0.35, 6, 16), 0.2, 0.78, 0.2, 1.3); // thigh, knee forward
    add(new THREE.CapsuleGeometry(0.17, 0.3, 6, 16), 0.42, 0.72, 0.2); // shin
    add(new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), -0.15, 0.62, -0.2, 1.4); // kneeling leg
    add(new THREE.CylinderGeometry(0.42, 0.26, 0.92, 24), 0, 1.35, 0, -0.25); // torso, bowed
    if ((Math.round(x * 7 + z) & 3) !== 0) add(new THREE.SphereGeometry(0.22, 20, 14), 0.27, 1.95, 0); // head (some lost)
    add(stoneBox(0.09, 1.8, 0.04, x, 0.004), 0.55, 1.0, 0.25); // planted sword
    add(stoneBox(0.42, 0.07, 0.09, x + 1, 0.004), 0.55, 1.6, 0.25);
    for (const pz of [0.38, -0.38]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), stone);
      p.position.set(-0.05, 1.72, pz);
      p.scale.set(1.2, 0.9, 1);
      p.castShadow = true;
      g.add(p);
    }
    g.scale.setScalar(1.25);
    g.position.set(x, 0, z);
    g.rotation.y = -Math.atan2(-z, -x); // local +x (its face) toward the hearth
    this.target.add(g);
  }

  private groundsBanners(): void {
    const tat = tatterTexture(19);
    const pole = rimify(new THREE.MeshStandardMaterial({ color: 0x0c0a10, roughness: 0.6, metalness: 0.4 }), 0.8, 'pole');
    const spots = [
      { x: -7.8, z: -2.6, h: 6.5 },
      { x: 6.4, z: -2.8, h: 5.5 },
      { x: -18, z: -5, h: 8 },
      { x: 17, z: -4.6, h: 7 },
    ];
    for (const [i, s] of spots.entries()) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, s.h, 14), pole);
      p.position.set(s.x, s.h / 2, s.z);
      p.castShadow = true;
      this.target.add(p);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 10), pole);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(s.x + 0.55, s.h - 0.15, s.z);
      this.target.add(bar);
      const geo = new THREE.PlaneGeometry(1.1, 3, 4, 12);
      geo.translate(0.55, -1.5, 0);
      const mat = rimify(
        new THREE.MeshStandardMaterial({ color: 0x1a0c10, roughness: 1, side: THREE.DoubleSide, alphaMap: tat, alphaTest: 0.5 }),
        0.7,
        'banner',
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x + 0.05, s.h - 0.2, s.z);
      m.castShadow = true;
      m.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaMap: tat, alphaTest: 0.5 });
      this.target.add(m);
      this.banners.push({ mesh: m, base: Float32Array.from(geo.attributes.position.array as Float32Array), seed: i * 2.3 });
    }
  }

}

/** Stained glass for the rose window: radial petals in dim ember and violet. */
function roseTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const cx = 128;
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 1) / 24) * Math.PI * 2;
    g.fillStyle = i % 3 === 0 ? 'rgba(170,60,40,0.9)' : i % 3 === 1 ? 'rgba(70,40,120,0.9)' : 'rgba(150,110,60,0.9)';
    g.beginPath();
    g.moveTo(cx, cx);
    g.arc(cx, cx, 126, a0, a1);
    g.closePath();
    g.fill();
  }
  const grd = g.createRadialGradient(cx, cx, 0, cx, cx, 128);
  grd.addColorStop(0, 'rgba(255,220,180,0.9)');
  grd.addColorStop(0.35, 'rgba(255,200,150,0.1)');
  grd.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
