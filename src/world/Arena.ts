import * as THREE from 'three';
import { COLORS, WRAITH } from '../config';

interface BoxOptions {
  material: THREE.Material;
  collider?: boolean;
  edgeColor?: number | null;
  castShadow?: boolean;
}

/**
 * Procedural sci-fi test arena: grid floor, perimeter walls, Platform A (3.5m) with staircase,
 * a catwalk + second staircase up to High Dive Platform B (7.5m) with a diving-board ledge.
 */
export class Arena {
  readonly colliders: THREE.Box3[] = [];
  private readonly edgeMaterials = new Map<number, THREE.LineBasicMaterial>();

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.buildLights();
    this.buildFloorAndWalls();
    this.buildPlatformA();
    this.buildCatwalkAndPlatformB();
    this.buildProps();
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private buildFloorAndWalls(): void {
    const floorTex = this.makeGridTexture();
    floorTex.repeat.set(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.15,
    });
    // 60m x 60m, top surface at y = 0.
    this.addBox(60, 1, 60, 0, -1, 0, { material: floorMat, edgeColor: null, castShadow: false });

    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.panelDark, roughness: 0.7, metalness: 0.4 });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x002a30,
      emissive: COLORS.cyan,
      emissiveIntensity: 1.2,
    });
    const h = 6;
    const half = 30;
    const t = 1;
    const walls: Array<[number, number, number, number]> = [
      // [w, d, x, z]
      [60 + 2 * t, t, 0, -half - t / 2],
      [60 + 2 * t, t, 0, half + t / 2],
      [t, 60, -half - t / 2, 0],
      [t, 60, half + t / 2, 0],
    ];
    for (const [w, d, x, z] of walls) {
      this.addBox(w, h, d, x, 0, z, { material: wallMat, edgeColor: null });
      // Glowing trim strip, inset slightly toward the arena so it's visible.
      const tw = w === t ? 0.08 : w;
      const td = d === t ? 0.08 : d;
      const tx = w === t ? x - Math.sign(x) * (t / 2 + 0.04) : x;
      const tz = d === t ? z - Math.sign(z) * (t / 2 + 0.04) : z;
      this.addBox(tw, 0.12, td, tx, 1.2, tz, { material: trimMat, collider: false, edgeColor: null, castShadow: false });
      this.addBox(tw, 0.06, td, tx, h - 0.4, tz, { material: trimMat, collider: false, edgeColor: null, castShadow: false });
    }
  }

  private buildPlatformA(): void {
    const panel = this.panelMaterial(COLORS.panel);
    const stepMat = this.panelMaterial(0x202c3d);

    // Platform A: 8x8, top at y = 3.5, spans x[-18,-10], z[-16,-8].
    this.addBox(8, 3.5, 8, -14, 0, -12, { material: panel, edgeColor: COLORS.cyan });

    // Staircase 1: 10 solid steps of 0.35m, descending toward +Z from A's front edge (z = -8).
    const stepH = 0.35;
    const stepD = 0.7;
    for (let i = 0; i < 10; i++) {
      const top = 3.5 - i * stepH;
      const zMin = -8 + i * stepD;
      this.addBox(3, top, stepD, -14, 0, zMin + stepD / 2, { material: stepMat, edgeColor: COLORS.amber });
    }
  }

  private buildCatwalkAndPlatformB(): void {
    const panel = this.panelMaterial(COLORS.panel);
    const stepMat = this.panelMaterial(0x202c3d);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0b2a33, emissive: COLORS.cyan, emissiveIntensity: 0.6 });

    // Catwalk: y-top 3.5, 2.5m wide, from A's east edge (x = -10) to x = 0, centered z = -12.
    const cwThick = 0.3;
    this.addBox(10, cwThick, 2.5, -5, 3.5 - cwThick, -12, { material: panel, edgeColor: COLORS.cyan });
    // Support pillars.
    for (const x of [-6, -1]) {
      this.addBox(0.4, 3.5 - cwThick, 0.4, x, 0, -12, { material: panel, edgeColor: null });
    }
    // Visual-only railings along the catwalk.
    for (const z of [-13.2, -10.8]) {
      this.addBox(10, 0.05, 0.05, -5, 4.45, z, { material: railMat, collider: false, edgeColor: null, castShadow: false });
      for (let x = -9.5; x <= -0.5; x += 3) {
        this.addBox(0.05, 0.95, 0.05, x, 3.5, z, { material: railMat, collider: false, edgeColor: null, castShadow: false });
      }
    }

    // Staircase 2: 12 slab steps rising east from x = 0 (y 3.5) to x = 8.4 (y 7.5).
    const steps = 12;
    const stepH = 4 / steps;
    const stepD = 0.7;
    const slab = 0.35;
    for (let i = 0; i < steps; i++) {
      const top = 3.5 + (i + 1) * stepH;
      const xMin = i * stepD;
      this.addBox(stepD, slab, 2.5, xMin + stepD / 2, top - slab, -12, { material: stepMat, edgeColor: COLORS.amber });
    }

    // High Dive Platform B: 6x6, top at y = 7.5, spans x[8.4,14.4], z[-15,-9].
    const bx = 11.4;
    this.addBox(6, 7.5, 6, bx, 0, -12, { material: panel, edgeColor: COLORS.cyan });

    // Diving board: 1.2m wide, 0.2m thick, extends 6m toward +Z from B's front edge into open air.
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.5, metalness: 0.6 });
    this.addBox(1.2, 0.2, 6, bx, 7.3, -6, { material: boardMat, edgeColor: COLORS.amber });
    // Amber tip marker + light.
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: COLORS.amber, emissiveIntensity: 2 });
    this.addBox(1.2, 0.06, 0.1, bx, 7.5, -3.05, { material: tipMat, collider: false, edgeColor: null, castShadow: false });
    const tipLight = new THREE.PointLight(COLORS.amber, 12, 14, 1.5);
    tipLight.position.set(bx, 8.2, -3.2);
    this.scene.add(tipLight);

    // Landing target ring on the ground below the board.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.6, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(bx, 0.01, -2);
    this.scene.add(ring);
  }

  private buildProps(): void {
    // A handful of crates/blocks for parkour hops around the spawn area.
    const crate = this.panelMaterial(0x1d2a38);
    const blocks: Array<[number, number, number, number, number]> = [
      // [w, h, d, x, z]
      [2, 0.8, 2, -4, 8],
      [2, 1.2, 2, -7, 5],
      [2, 1.2, 2, 6, 6],
      [1.5, 0.6, 1.5, 8.5, 9],
      [3, 0.4, 3, 18, 14],
      [3, 0.8, 3, 21, 11],
      [3, 1.2, 3, 24, 8],
    ];
    for (const [w, h, d, x, z] of blocks) {
      this.addBox(w, h, d, x, 0, z, { material: crate, edgeColor: COLORS.cyan });
    }

    // Slide gate on the spawn sprint lane (x = 0): a 2m-deep slab 1.05m above the floor,
    // too low to run under, high enough to slide under.
    const gate = this.panelMaterial(0x202c3d);
    this.addBox(4, 0.3, 2, 0, 1.05, 10.5, { material: gate, edgeColor: COLORS.amber });
    for (const x of [-2.1, 2.1]) {
      this.addBox(0.2, 1.35, 2, x, 0, 10.5, { material: gate, edgeColor: COLORS.amber });
    }
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x6f86ff, 0x0a0a14, 0.7));
    this.scene.add(new THREE.AmbientLight(0x1a2440, 0.6));

    const sun = new THREE.DirectionalLight(0xdfe8ff, 1.8);
    sun.position.set(18, 40, 22);
    sun.castShadow = true;
    // The shadow wraith's cloak is hidden from the first-person camera but still casts a shadow.
    sun.shadow.camera.layers.enable(WRAITH.bodyLayer);
    sun.shadow.mapSize.set(2048, 2048);
    const s = 36;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    const points: Array<[number, number, number, number]> = [
      [COLORS.cyan, -14, 6, -12],
      [COLORS.cyan, 0, 4, 12],
      [COLORS.amber, 11.4, 10, -12],
      [COLORS.amber, 20, 4, 10],
    ];
    for (const [color, x, y, z] of points) {
      const light = new THREE.PointLight(color, 40, 28, 1.6);
      light.position.set(x, y, z);
      this.scene.add(light);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Adds a box whose footprint is centered at (x, z) with its bottom at yMin. */
  private addBox(w: number, h: number, d: number, x: number, yMin: number, z: number, opts: BoxOptions): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, opts.material);
    mesh.position.set(x, yMin + h / 2, z);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const edgeColor = opts.edgeColor === undefined ? COLORS.cyan : opts.edgeColor;
    if (edgeColor !== null) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMaterial(edgeColor));
      mesh.add(edges);
    }

    if (opts.collider ?? true) {
      mesh.updateMatrixWorld(true);
      this.colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  }

  private edgeMaterial(color: number): THREE.LineBasicMaterial {
    let mat = this.edgeMaterials.get(color);
    if (!mat) {
      mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
      this.edgeMaterials.set(color, mat);
    }
    return mat;
  }

  private panelMaterial(color: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.55 });
  }

  private makeGridTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d')!;

    c.fillStyle = '#0a1220';
    c.fillRect(0, 0, size, size);

    // Subtle inner sub-grid.
    c.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (i * size) / 4 + 0.5;
      c.beginPath();
      c.moveTo(p, 0);
      c.lineTo(p, size);
      c.moveTo(0, p);
      c.lineTo(size, p);
      c.stroke();
    }

    // Main cell border.
    c.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, size - 3, size - 3);

    // Corner ticks.
    c.fillStyle = 'rgba(0, 240, 255, 0.8)';
    for (const [x, y] of [[0, 0], [size - 8, 0], [0, size - 8], [size - 8, size - 8]]) {
      c.fillRect(x, y, 8, 8);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
}
