import * as THREE from 'three';
import type { Wall } from '../data/chapters';
import type { Level, Platform, RegionKind } from '../data/levels';
import { Rng } from '../sim/rng';
import { batchStatic } from './batch';
import { Flame } from './flame';
import { rimify } from './rim';
import { column, stoneBox } from './shapes';
import { glowTexture, tatterTexture } from './textures';

// Builds a level's 3D set from its data: the walls the sim collides with (masonry, pews, merlons, stairs), the
// platforms (stone walks, timber floors, balconies, rampart), the place itself (houses, market, nave, apse, wall,
// gatehouse), and the interactive props (ember shrines, checkpoint braziers, the far gate).

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

const STONE = rimify(new THREE.MeshStandardMaterial({ color: 0x17141b, roughness: 0.9, metalness: 0.05 }), 0.5, 'lvstone');
const DARK_STONE = rimify(new THREE.MeshStandardMaterial({ color: 0x0e0c12, roughness: 0.95 }), 0.4, 'lvdark');
const TIMBER = rimify(new THREE.MeshStandardMaterial({ color: 0x1a120e, roughness: 0.85 }), 0.45, 'lvtimber');
const FLAG = new THREE.MeshStandardMaterial({ color: 0x241f28, roughness: 0.9 });
const IRON = rimify(new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.5, metalness: 0.6 }), 0.9, 'lviron');
const FACADE = new THREE.MeshStandardMaterial({ color: 0x0b0a0f, roughness: 1 });
const FG = new THREE.MeshBasicMaterial({ color: 0x020203 }); // foreground silhouettes: pure black
const WARM_WINDOW = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.42, 0.12), fog: false });

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

  constructor(level: Level) {
    this.level = level;
    this.id = level.id;
    this.rng = new Rng(level.id.length * 131 + 7);
    this.buildFloor();
    for (const w of level.walls) this.buildWall(w);
    for (const p of level.platforms) this.buildPlatform(p);
    for (const r of level.regions) {
      this.dressRegion(r.kind, r.x0, r.x1);
      this.foreground(r.kind, r.x0, r.x1);
    }
    if (level.id === 'grounds') {
      this.groundsRuins();
      this.groundsStatues();
      this.groundsBanners();
    }
    for (const s of level.shrines) this.buildShrine(s.x, s.y);
    for (const x of level.checkpoints) this.buildBrazier(x);
    if (level.end !== undefined) this.buildGate(level.end, level.bossAt !== undefined);
    // hundreds of fixed stones become a few dozen draws (main pass and every face of the hearth's shadow cube)
    batchStatic(this.group, [...(this.gate ? [this.gate] : []), ...this.shrines.map((s) => s.root), ...this.banners.map((b) => b.mesh)]);
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rz = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private regionAt(x: number): RegionKind {
    return this.level.regions.find((r) => x >= r.x0 && x < r.x1)?.kind ?? 'grounds';
  }

  // ------------------------------------------------------------- floor
  private buildFloor(): void {
    const [x0, x1] = this.level.bounds;
    const rng = this.rng;
    for (let x = x0 - 4; x < x1 + 4; ) {
      const kind = this.regionAt(x);
      const big = kind === 'nave' || kind === 'apse';
      const w = big ? rng.range(1.6, 2.2) : rng.range(0.9, 1.7);
      for (const z of big ? [-1.0, 1.0] : [-1.2, 0, 1.2]) {
        if (rng.next() < (kind === 'rampart' || kind === 'gatehouse' ? 0.04 : 0.12)) continue;
        const s = new THREE.Mesh(stoneBox(w - 0.06, 0.12, big ? 1.94 : 1.14, x * 7 + z, 0.012), FLAG);
        s.position.set(x + w / 2, -0.05 + rng.range(-0.02, 0.02), z + rng.range(-0.05, 0.05));
        s.rotation.y = rng.range(-0.03, 0.03);
        s.receiveShadow = true;
        this.group.add(s);
      }
      x += w;
    }
  }

  // ------------------------------------------------------------- walls (sim collision boxes)
  private buildWall(w: Wall): void {
    const kind = this.regionAt(w.x);
    const rng = this.rng;
    if ((kind === 'nave' || kind === 'apse') && w.h < 1) {
      // a pew: seat, back, and carved ends
      this.add(stoneBox(w.w, 0.12, 0.7, w.x, 0.01), TIMBER, w.x, 0.48, 0.1);
      this.add(stoneBox(w.w, w.h, 0.1, w.x + 1, 0.01), TIMBER, w.x, w.h / 2, -0.35);
      for (const s of [-1, 1]) this.add(stoneBox(0.1, w.h + 0.12, 0.8, w.x + s, 0.01), TIMBER, w.x + (s * w.w) / 2, (w.h + 0.12) / 2, 0);
      return;
    }
    if (kind === 'rampart' || kind === 'gatehouse' || w.h >= 2) {
      // a single dressed block: merlon or stair
      this.add(stoneBox(w.w, w.h, 1.7, w.x * 3 + w.h, 0.04), STONE, w.x, w.h / 2, 0);
      return;
    }
    // coursed masonry, broken along the top
    const courses = Math.max(2, Math.round(w.h / 0.34));
    const ch = w.h / courses;
    let seed = Math.round(w.x * 13);
    for (let c = 0; c < courses; c++) {
      let x = w.x - w.w / 2;
      const end = w.x + w.w / 2;
      let first = c % 2 ? rng.range(0.2, 0.35) : 0;
      while (x < end - 0.05) {
        const len = Math.min(end - x, first || rng.range(0.42, 0.7));
        first = 0;
        if (c === courses - 1 && rng.next() < 0.3) {
          x += len;
          continue;
        }
        const askew = c === courses - 1 ? rng.range(-0.08, 0.08) : rng.range(-0.015, 0.015);
        this.add(stoneBox(len - 0.03, ch - 0.025, 1.55 + rng.range(-0.08, 0.04), seed++, 0.03), STONE, x + len / 2, ch * c + ch / 2, rng.range(-0.03, 0.03), rng.range(-0.04, 0.04), askew);
        x += len;
      }
    }
  }

  // ------------------------------------------------------------- platforms (one-way)
  private buildPlatform(p: Platform): void {
    const len = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    const rng = this.rng;
    switch (p.kind ?? 'stone') {
      case 'timber': {
        // a floor of planks on beams, a broken roof slope behind it
        for (let x = p.x0; x < p.x1 - 0.1; ) {
          const pw = rng.range(0.22, 0.32);
          if (rng.next() > 0.08) this.add(stoneBox(pw - 0.02, 0.08, 1.7, x * 9, 0.006), TIMBER, x + pw / 2, p.y - 0.04 + rng.range(-0.015, 0.015), 0, 0, rng.range(-0.02, 0.02));
          x += pw;
        }
        this.add(stoneBox(len, 0.16, 0.16, cx, 0.01), TIMBER, cx, p.y - 0.16, 0.7);
        this.add(stoneBox(len, 0.16, 0.16, cx + 1, 0.01), TIMBER, cx, p.y - 0.16, -0.7);
        for (const x of [p.x0 + 0.3, p.x1 - 0.3]) this.add(new THREE.CylinderGeometry(0.1, 0.12, p.y, 10), TIMBER, x, p.y / 2, -0.75);
        const roof = this.add(stoneBox(len + 1.5, 0.12, 3.2, cx + 2, 0.02), TIMBER, cx, p.y + 2.2, -2.2);
        roof.rotation.x = 0.75;
        break;
      }
      case 'balcony':
      case 'stone':
      case 'rampart': {
        this.add(stoneBox(len, 0.36, 1.8, cx * 3, 0.03), STONE, cx, p.y - 0.18, 0);
        if (p.kind === 'balcony') {
          // a balustrade along the back edge
          for (let x = p.x0 + 0.3; x < p.x1; x += 0.42) this.add(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 12), STONE, x, p.y + 0.37, -0.78);
          this.add(stoneBox(len, 0.1, 0.24, cx + 3, 0.01), STONE, cx, p.y + 0.8, -0.78);
          // corbels underneath
          for (let x = p.x0 + 0.8; x < p.x1; x += 2.4) this.add(stoneBox(0.35, 0.6, 1.4, x, 0.03), STONE, x, p.y - 0.6, -0.1);
        } else if (p.kind === 'rampart') {
          for (let x = p.x0 + 0.6; x < p.x1; x += 1.6) this.add(stoneBox(0.8, 0.9, 0.5, x * 5, 0.04), STONE, x, p.y + 0.45, -0.75);
          // the wall below the walk
          this.add(stoneBox(len, p.y, 1.6, cx * 5 + 1, 0.06), DARK_STONE, cx, p.y / 2 - 0.2, -1.4);
        } else {
          // piers carry the walk down to the ground
          for (const x of [p.x0 + 0.5, p.x1 - 0.5]) this.add(column(0.32, 0.38, p.y, x * 7), STONE, x, p.y / 2 - 0.2, -0.3);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------- places
  private dressRegion(kind: RegionKind, x0: number, x1: number): void {
    const rng = this.rng;
    switch (kind) {
      case 'street':
        for (let x = x0 + 2; x < x1 - 2; ) {
          const w = rng.range(5, 8.5);
          this.house(x + w / 2, w, rng.range(5, 8.5), rng.range(-6.2, -3.6), rng.next() < 0.35);
          x += w + rng.range(0.4, 2.5);
        }
        for (let x = x0 + 6; x < x1; x += rng.range(11, 16)) this.lamp(x, -1.7);
        break;
      case 'market':
        for (let x = x0 + 2; x < x1 - 2; x += rng.range(4.5, 6.5)) this.stall(x, rng.range(-3.2, -2.4));
        this.fountain((x0 + x1) / 2, -5.5);
        for (let x = x0; x < x1; x += 9) this.house(x + 4, 8, rng.range(6, 9), -8, false);
        break;
      case 'nave':
        for (let x = x0 + 3; x < x1; x += 6) this.pillar(x, -3.6, 11.5);
        for (let x = x0 + 3; x < x1 - 6; x += 6) this.pointedArch(x + 3, -3.6, 6, 8.2);
        this.naveWall(x0, x1, -9);
        for (let x = x0 + 6; x < x1 - 3; x += 12) this.chandelier(x, 7.6, -1.2);
        for (let x = x0 + 6; x < x1 - 3; x += 6) this.saint(x, -8.2);
        for (let x = x0 + 9; x < x1; x += 18) this.hangingBanner(x, -3.0, 10.8, 4.2);
        break;
      case 'apse':
        for (let x = x0 + 3; x < x1; x += 7) this.pillar(x, -3.8, 12.5);
        this.roseWindow((x0 + x1) / 2 + 4, 10.5, -11);
        this.naveWall(x0, x1, -11.6);
        this.add(stoneBox(3.2, 1.0, 1.6, 77, 0.03), STONE, (x0 + x1) / 2 - 2, 0.5, -2.6); // the altar
        this.organ((x0 + x1) / 2 + 4 - 8, -10.4);
        this.organ((x0 + x1) / 2 + 4 + 8, -10.4);
        for (let i = 0; i < 5; i++) this.candle((x0 + x1) / 2 - 3.2 + i * 0.6, 1.0, -2.4 - (i % 2) * 0.3);
        break;
      case 'rampart':
        // the wall walk: a low parapet in front, towers behind, the sheer drop beyond
        for (let x = x0; x < x1; x += 1.4) this.add(stoneBox(0.9, 0.55, 0.45, x * 3, 0.04), STONE, x, 0.27, 2.1);
        for (let x = x0 + 8; x < x1; x += 28) {
          this.tower(x, -4.5, 10);
          this.hangingBanner(x, -4.5, 15.5, 3.2, true);
        }
        break;
      case 'gatehouse':
        this.tower(x0 + 4, -4.2, 13);
        this.tower(x1 - 4, -4.2, 14);
        this.add(stoneBox(x1 - x0, 7, 1.6, x0, 0.05), DARK_STONE, (x0 + x1) / 2, 3.5, -3.6);
        this.bell((x0 + x1) / 2 + 2, 10.5, -4.2);
        this.portcullis((x0 + x1) / 2 - 6, -2.7);
        break;
      case 'grounds':
        break;
    }
  }

  private house(cx: number, w: number, h: number, z: number, broken: boolean): void {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h);
    if (broken) {
      s.lineTo(w * 0.15, h + 1.2);
      s.lineTo(w * 0.05, h + 0.4);
      s.lineTo(-w * 0.2, h + 1.9);
    } else s.lineTo(0, h + w * 0.45);
    s.lineTo(-w / 2, h);
    s.closePath();
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
      if (rng.next() > 0.18) continue;
      const pts = hole.getPoints();
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), WARM_WINDOW);
      pane.position.set(cx + (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, z - 0.35);
      this.group.add(pane);
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
  private foreground(kind: RegionKind, x0: number, x1: number): void {
    const rng = this.rng;
    const fg = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
      const m = new THREE.Mesh(geo, FG);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      this.group.add(m);
    };
    for (let x = x0 + rng.range(4, 12); x < x1; x += rng.range(16, 26)) {
      const z = rng.range(5.2, 6.5);
      switch (kind) {
        case 'nave':
        case 'apse':
          fg(new THREE.CylinderGeometry(0.85, 0.95, 26, 24), x, 9, z); // a great pillar right in front of the lens
          break;
        case 'rampart':
        case 'gatehouse':
          fg(stoneBox(1.0, 1.3, 0.8, x, 0.03), x, 0.4, z - 1.2);
          fg(stoneBox(1.0, 1.3, 0.8, x + 1, 0.03), x + 1.7, 0.4, z - 1.2);
          break;
        default:
          if (rng.next() < 0.5) {
            // a hanging chain with a broken lantern
            fg(new THREE.CylinderGeometry(0.03, 0.03, 6, 6), x, 9.5, z);
            fg(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8), x, 6.3, z);
          } else {
            // a leaning broken post
            fg(new THREE.CylinderGeometry(0.16, 0.22, 4.6, 10), x, 1.6, z, rng.range(-0.3, 0.3));
          }
      }
    }
  }

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
    this.group.add(m);
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
    this.group.add(f.group);
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
    this.group.add(cloth);
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

  private naveWall(x0: number, x1: number, z: number): void {
    const s = new THREE.Shape();
    s.moveTo(x0, 0);
    s.lineTo(x1, 0);
    s.lineTo(x1, 16);
    s.lineTo(x0, 16);
    s.closePath();
    // tall lancet windows
    for (let x = x0 + 3; x < x1 - 2; x += 6) {
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
    const m = this.add(g, DARK_STONE, 0, 0, z);
    m.castShadow = false;
    // cold moonlight behind the glass: the lancets glow and the pillars stand out against them
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.13, 0.15, 0.34), fog: false }),
    );
    glow.position.set((x0 + x1) / 2, 8, z - 0.4);
    this.group.add(glow);
  }

  /** The rose window: radial stone tracery over faint stained light. */
  private roseWindow(x: number, y: number, z: number): void {
    const R = 4.2;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(R, 64),
      new THREE.MeshBasicMaterial({ map: roseTexture(), color: new THREE.Color(1.6, 1.1, 1.5), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    glass.position.set(x, y, z + 0.2);
    this.group.add(glass);
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

  private tower(x: number, z: number, h: number): void {
    this.add(column(1.8, 2.0, h, x * 2, 6), DARK_STONE, x, h / 2, z);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (i % 2) continue;
      this.add(stoneBox(0.9, 0.9, 0.6, x + i, 0.03), DARK_STONE, x + Math.cos(a) * 1.75, h + 0.45, z + Math.sin(a) * 1.75, -a);
    }
  }

  // ------------------------------------------------------------- props
  private buildShrine(x: number, y: number): void {
    const root = new THREE.Group();
    root.position.set(x, y, -0.6);
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
    this.group.add(root);
    this.shrines.push({ root, ember, flame, on: 0 });
  }

  private buildBrazier(x: number): void {
    const pts = [[0, 0], [0.25, 0], [0.12, 0.7], [0.45, 0.95], [0.5, 1.05], [0, 0.98]].map(([a, b]) => new THREE.Vector2(a, b));
    this.add(new THREE.LatheGeometry(pts, 28), IRON, x, 0, -1.1);
    const flame = new Flame(0.7, 1.1, 2);
    flame.group.position.set(x, 1.0, -1.1);
    flame.strength = 0;
    this.group.add(flame.group);
    const light = new THREE.PointLight(0xff8a3d, 0, 14, 2);
    light.position.set(x, 1.7, -0.6);
    this.group.add(light);
    this.braziers.push({ x, flame, light, lit: 0 });
  }

  private buildGate(x: number, doors: boolean): void {
    const g = new THREE.Group();
    g.position.set(x, 0, -0.2);
    const ph = 5.5;
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(stoneBox(1.1, ph, 1.6, x + s, 0.05), STONE);
      pier.position.set(s * 2.0, ph / 2, -0.2);
      pier.castShadow = true;
      g.add(pier);
    }
    const lintel = new THREE.Mesh(stoneBox(5.2, 1.0, 1.7, x + 3, 0.05), STONE);
    lintel.position.set(0, ph + 0.5, -0.2);
    g.add(lintel);
    if (doors) {
      for (const s of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(s * 1.45, 0, -0.6);
        const door = new THREE.Mesh(stoneBox(1.45, ph - 0.1, 0.18, x + s * 7, 0.01), TIMBER);
        door.position.set(-s * 0.72, (ph - 0.1) / 2, 0);
        door.castShadow = true;
        hinge.add(door);
        hinge.userData.side = s;
        g.add(hinge);
      }
    }
    this.gate = g;
    this.gateOpen = doors ? 0 : 1;
    this.gateTarget = doors ? 0 : 1; // cathedral doors stay shut until the Marshal falls
    this.group.add(g);
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
      for (const c of this.gate.children) if (c.userData.side) c.rotation.y = c.userData.side * this.gateOpen * 1.5;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.group.removeFromParent();
  }

  // ------------------------------------------------------------- the hearth grounds (Level 1's ruins)
  /** Lit 3D ruins near the lane: they catch firelight and cast the shadows you see. */
  private groundsRuins(): void {
    const stone = STONE;
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, stone);
      m.position.set(x, y, z);
      m.rotation.set(0, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const rng = new Rng(21);
    let seed = 1;
    // the hearth's great broken arch: stacked piers and a ring of wedge stones, the right side collapsed
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
    // fallen voussoirs on the ground
    for (let i = 0; i < 4; i++) {
      const m = add(stoneBox(0.85, 0.62, 1.05, seed++, 0.06), 4.6 + i * 0.8 + rng.range(-0.2, 0.2), 0.3, -2.4 + rng.range(-0.8, 0.6));
      m.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.5, 0.5));
    }
    // colonnade further back: fluted columns with capitals and bases
    for (let i = 0; i < 14; i++) {
      const x = -26 + i * 4 + rng.range(-0.8, 0.8);
      if (Math.abs(x) < 5) continue;
      const h = rng.range(1.5, 6.5);
      const z = rng.range(-5.5, -4.2);
      add(column(0.4, 0.46, h, seed++), x, h / 2 + 0.25, z);
      add(stoneBox(1.05, 0.25, 1.05, seed++, 0.03), x, 0.125, z);
      if (rng.next() < 0.4) add(stoneBox(1.15, 0.38, 1.15, seed++, 0.05), x, h + 0.44, z, rng.range(0, 1));
    }
  }

  /** Stone knights of his fallen order, kneeling forever behind the hearth. */
  private groundsStatues(): void {
    const stone = rimify(new THREE.MeshStandardMaterial({ color: 0x1b1820, roughness: 0.95 }), 0.6, 'statue');
    const rng = new Rng(31);
    const spots = [-15, -9.5, 8.5, 14.5, 20];
    for (const sx of spots) {
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
        const m = new THREE.Mesh(geo, stone);
        m.position.set(x, y, z);
        m.rotation.z = rz;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      };
      add(stoneBox(1.6, 0.5, 1.4, sx * 3, 0.05), 0, 0.25, 0); // plinth
      add(new THREE.CapsuleGeometry(0.2, 0.35, 6, 16), 0.2, 0.78, 0.2, 1.3); // thigh, knee forward
      add(new THREE.CapsuleGeometry(0.17, 0.3, 6, 16), 0.42, 0.72, 0.2); // shin
      add(new THREE.CapsuleGeometry(0.17, 0.42, 6, 16), -0.15, 0.62, -0.2, 1.4); // kneeling leg
      add(new THREE.CylinderGeometry(0.42, 0.26, 0.92, 24), 0, 1.35, 0, -0.25); // torso, bowed
      if (rng.next() > 0.3) add(new THREE.SphereGeometry(0.22, 20, 14), 0.27, 1.95, 0); // head (some lost)
      add(stoneBox(0.09, 1.8, 0.04, sx, 0.004), 0.55, 1.0, 0.25); // planted sword
      add(stoneBox(0.42, 0.07, 0.09, sx + 1, 0.004), 0.55, 1.6, 0.25);
      for (const z of [0.38, -0.38]) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), stone);
        p.position.set(-0.05, 1.72, z);
        p.scale.set(1.2, 0.9, 1);
        p.castShadow = true;
        g.add(p);
      }
      const s = rng.range(1.35, 1.8);
      g.scale.setScalar(s);
      g.position.set(sx, 0, rng.range(-7.5, -6.2));
      g.rotation.y = sx < 0 ? 0.35 : -0.35 + Math.PI; // all face the hearth
      if (sx > 0) g.scale.x *= 1;
      this.group.add(g);
    }
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
      this.group.add(p);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 10), pole);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(s.x + 0.55, s.h - 0.15, s.z);
      this.group.add(bar);
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
      this.group.add(m);
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
