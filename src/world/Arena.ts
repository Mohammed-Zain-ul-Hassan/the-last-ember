import * as THREE from 'three';
import { COLORS, WRAITH } from '../config';
import { buildDemoCourse, type DemoCourse } from './DemoCourse';
import { loadLevel, type LevelSpawns, type LoadedLevel } from './LevelLoader';

export type ArenaMode = 'story' | 'demo';

/**
 * World container: story ember_climb GLB (or fallback courtyard) plus a separate
 * procedural Demo Course. `setMode` swaps which geometry / colliders / spawns are live.
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
  mode: ArenaMode = 'story';

  private readonly edgeMaterials = new Map<number, THREE.LineBasicMaterial>();
  private storyRoot: THREE.Object3D | null = null;
  private storyColliders: THREE.Box3[] = [];
  private storySpawns!: LevelSpawns;
  private demo!: DemoCourse;
  private plinthLight: THREE.PointLight | null = null;

  private constructor(private readonly scene: THREE.Scene) {}

  static async create(scene: THREE.Scene, _renderer: THREE.WebGLRenderer): Promise<Arena> {
    const arena = new Arena(scene);
    arena.buildLights();

    const loaded = await loadLevel();
    if (loaded) arena.applyLoaded(loaded);
    else arena.buildFallback();

    arena.demo = buildDemoCourse();
    arena.demo.root.visible = false;
    scene.add(arena.demo.root);

    arena.setMode('story');
    return arena;
  }

  /**
   * Activate story climb or the linear demo course. Mutates `colliders` and `spawns`
   * in place so PlayerController / OrbitCamera / WaveDirector keep working.
   */
  setMode(mode: ArenaMode): void {
    this.mode = mode;
    if (this.storyRoot) this.storyRoot.visible = mode === 'story';
    this.demo.root.visible = mode === 'demo';
    if (this.plinthLight) this.plinthLight.visible = mode === 'story';

    const srcColliders = mode === 'demo' ? this.demo.colliders : this.storyColliders;
    const srcSpawns = mode === 'demo' ? this.demo.spawns : this.storySpawns;

    this.colliders.length = 0;
    this.colliders.push(...srcColliders);

    this.spawns.player.copy(srcSpawns.player);
    this.spawns.enemies = srcSpawns.enemies.map((v) => v.clone());
    this.spawns.wife.copy(srcSpawns.wife);
    this.spawns.waveSpawns = srcSpawns.waveSpawns.map((v) => v.clone());
    this.spawns.bossArena = srcSpawns.bossArena ? srcSpawns.bossArena.clone() : null;
  }

  /** Demo HUD line from course checkpoints (empty string outside demo). */
  demoObjective(feet: THREE.Vector3): string {
    if (this.mode !== 'demo') return '';
    return this.demo.objectiveFor(feet);
  }

  private applyLoaded(level: LoadedLevel): void {
    this.storyRoot = level.root;
    this.scene.add(level.root);
    this.storyColliders = level.colliders.slice();
    this.storySpawns = cloneSpawns(level.spawns);
    const wife = level.spawns.wife;
    this.plinthLight = new THREE.PointLight(COLORS.ember, 60, 28, 1.4);
    this.plinthLight.position.set(wife.x, wife.y + 3, wife.z);
    this.scene.add(this.plinthLight);
  }

  private buildFallback(): void {
    const group = new THREE.Group();
    group.name = 'StoryFallback';
    this.storyRoot = group;
    this.scene.add(group);

    const floorMat = new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      roughness: 0.9,
      metalness: 0.1,
    });
    const stone = new THREE.MeshStandardMaterial({ color: COLORS.panel, roughness: 0.7, metalness: 0.25 });
    this.addBox(group, 28, 1, 24, 0, -1, 6, { material: floorMat, edgeColor: null, castShadow: false });
    this.addBox(group, 16, 1, 40, 0, -1, -30, { material: floorMat, edgeColor: null, castShadow: false });
    this.addBox(group, 20, 1, 20, 0, 2, -55, { material: stone, edgeColor: COLORS.ember });
    this.addBox(group, 8, 0.4, 18, 0, 4, -72, { material: stone, edgeColor: COLORS.ember });
    this.addBox(group, 24, 1.2, 24, 0, 21, -95, { material: stone, edgeColor: COLORS.ember });
    for (let i = 0; i < 10; i++) {
      this.addBox(group, 4, 0.35, 2.2, 0, 5 + i * 1.6, -78 - i * 1.6, { material: stone, edgeColor: null });
    }
    this.storySpawns = {
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
    this.storyColliders = this.colliders.slice();
    this.colliders.length = 0;
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x6a5a9a, 0x0a0810, 0.55));
    this.scene.add(new THREE.AmbientLight(0x1a1528, 0.45));

    const moon = new THREE.DirectionalLight(0x9fb0ff, 1.15);
    moon.position.set(-18, 55, 30);
    moon.castShadow = true;
    moon.shadow.camera.layers.enable(WRAITH.bodyLayer);
    moon.shadow.mapSize.set(2048, 2048);
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
    parent: THREE.Object3D,
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
    parent.add(mesh);
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

function cloneSpawns(s: LevelSpawns): LevelSpawns {
  return {
    player: s.player.clone(),
    enemies: s.enemies.map((v) => v.clone()),
    wife: s.wife.clone(),
    waveSpawns: s.waveSpawns.map((v) => v.clone()),
    bossArena: s.bossArena ? s.bossArena.clone() : null,
  };
}
