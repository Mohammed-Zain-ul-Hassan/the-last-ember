import * as THREE from 'three';
import { COLORS, WRAITH } from '../config';
import { loadLevel, type LevelSpawns, type LoadedLevel } from './LevelLoader';

/**
 * World container: prefers the Blender ember_climb GLB; falls back to a flat courtyard
 * if the asset is missing. Exposes colliders + spawn markers for combat systems.
 */
export class Arena {
  readonly colliders: THREE.Box3[] = [];
  spawns: LevelSpawns = {
    player: new THREE.Vector3(0, 0.05, 8),
    enemies: [],
    wife: new THREE.Vector3(0, 23, -95),
    waveSpawns: [],
    bossArena: new THREE.Vector3(0, 22.5, -95),
  };
  private readonly edgeMaterials = new Map<number, THREE.LineBasicMaterial>();

  private constructor(private readonly scene: THREE.Scene) {}

  static async create(scene: THREE.Scene, _renderer: THREE.WebGLRenderer): Promise<Arena> {
    const arena = new Arena(scene);
    arena.buildLights();
    const loaded = await loadLevel();
    if (loaded) arena.applyLoaded(loaded);
    else arena.buildFallback();
    return arena;
  }

  private applyLoaded(level: LoadedLevel): void {
    this.scene.add(level.root);
    this.colliders.push(...level.colliders);
    this.spawns = level.spawns;
    // Ember fill light near the summit plinth.
    const wife = level.spawns.wife;
    const plinthLight = new THREE.PointLight(COLORS.ember, 60, 28, 1.4);
    plinthLight.position.set(wife.x, wife.y + 3, wife.z);
    this.scene.add(plinthLight);
  }

  private buildFallback(): void {
    const floorMat = new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      roughness: 0.9,
      metalness: 0.1,
    });
    const stone = new THREE.MeshStandardMaterial({ color: COLORS.panel, roughness: 0.7, metalness: 0.25 });
    // Courtyard + street + market + raised plaza (horizontal stub if GLB missing).
    this.addBox(28, 1, 24, 0, -1, 6, { material: floorMat, edgeColor: null, castShadow: false });
    this.addBox(16, 1, 40, 0, -1, -30, { material: floorMat, edgeColor: null, castShadow: false });
    this.addBox(20, 1, 20, 0, 2, -55, { material: stone, edgeColor: COLORS.ember });
    this.addBox(8, 0.4, 18, 0, 4, -72, { material: stone, edgeColor: COLORS.ember });
    this.addBox(24, 1.2, 24, 0, 21, -95, { material: stone, edgeColor: COLORS.ember });
    for (let i = 0; i < 10; i++) {
      this.addBox(4, 0.35, 2.2, 0, 5 + i * 1.6, -78 - i * 1.6, { material: stone, edgeColor: null });
    }
    this.spawns = {
      player: new THREE.Vector3(0, 0.05, 12),
      enemies: [new THREE.Vector3(-4, 2.6, -52), new THREE.Vector3(4, 2.6, -58)],
      wife: new THREE.Vector3(0, 23, -95),
      waveSpawns: [
        new THREE.Vector3(-7, 22.6, -88),
        new THREE.Vector3(7, 22.6, -88),
        new THREE.Vector3(0, 22.6, -103),
      ],
      bossArena: new THREE.Vector3(0, 22.6, -95),
    };
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x6a5a9a, 0x0a0810, 0.55));
    this.scene.add(new THREE.AmbientLight(0x1a1528, 0.45));

    const moon = new THREE.DirectionalLight(0x9fb0ff, 1.15);
    moon.position.set(-18, 55, 30);
    moon.castShadow = true;
    moon.shadow.camera.layers.enable(WRAITH.bodyLayer);
    moon.shadow.mapSize.set(2048, 2048);
    // Wide dusk city footprint (~90×120 m).
    const s = 100;
    moon.shadow.camera.left = -s;
    moon.shadow.camera.right = s;
    moon.shadow.camera.top = s;
    moon.shadow.camera.bottom = -s;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 280;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    this.scene.add(moon);

    const emberKey = new THREE.DirectionalLight(COLORS.ember, 0.6);
    emberKey.position.set(35, 40, -50);
    this.scene.add(emberKey);
  }

  private addBox(
    w: number,
    h: number,
    d: number,
    x: number,
    yMin: number,
    z: number,
    opts: { material: THREE.Material; collider?: boolean; edgeColor?: number | null; castShadow?: boolean },
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, opts.material);
    mesh.position.set(x, yMin + h / 2, z);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const edgeColor = opts.edgeColor === undefined ? COLORS.ember : opts.edgeColor;
    if (edgeColor !== null) {
      let mat = this.edgeMaterials.get(edgeColor);
      if (!mat) {
        mat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.7 });
        this.edgeMaterials.set(edgeColor, mat);
      }
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat));
    }
    if (opts.collider ?? true) {
      mesh.updateMatrixWorld(true);
      this.colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  }
}
