import * as THREE from 'three';
import { COLORS, LEVEL, WRAITH } from '../config';
import { buildDemoCourse, demoObjectiveFor, type DemoCourse } from './DemoCourse';
import { loadLevel, type LevelSpawns, type LoadedLevel } from './LevelLoader';

export type ArenaMode = 'story' | 'demo';

/**
 * World container: story ember_climb GLB (or fallback courtyard) plus demo course
 * (demo_course.glb when present, else procedural graybox). `setMode` swaps live colliders/spawns.
 */
export class Arena {
  readonly colliders: THREE.Box3[] = [];
  spawns: LevelSpawns = {
    player: new THREE.Vector3(0, 0.05, 8),
    enemies: [],
    wife: new THREE.Vector3(0, 23, -95),
    waveSpawns: [],
    bossArena: new THREE.Vector3(0, 22.5, -95),
    playerEntry: null,
  };
  mode: ArenaMode = 'story';

  private readonly edgeMaterials = new Map<number, THREE.LineBasicMaterial>();
  private storyRoot: THREE.Object3D | null = null;
  private storyColliders: THREE.Box3[] = [];
  private storySpawns!: LevelSpawns;
  private demo!: DemoCourse;
  private plinthLight: THREE.PointLight | null = null;
  private readonly brazierLights: THREE.PointLight[] = [];

  private constructor(private readonly scene: THREE.Scene) {}

  static async create(scene: THREE.Scene, _renderer: THREE.WebGLRenderer): Promise<Arena> {
    const arena = new Arena(scene);
    arena.buildLights();

    const loaded = await loadLevel(LEVEL.url);
    if (loaded) arena.applyLoaded(loaded);
    else arena.buildFallback();

    const demoGlb = await loadLevel(LEVEL.demoUrl);
    if (demoGlb) {
      arena.demo = {
        root: demoGlb.root,
        colliders: demoGlb.colliders,
        spawns: demoGlb.spawns,
        objectiveFor: demoObjectiveFor,
      };
      console.info('[Arena] demo_course.glb loaded');
    } else {
      arena.demo = buildDemoCourse();
      console.info('[Arena] demo graybox fallback');
    }
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
    for (const light of this.brazierLights) light.visible = mode === 'story';

    const srcColliders = mode === 'demo' ? this.demo.colliders : this.storyColliders;
    const srcSpawns = mode === 'demo' ? this.demo.spawns : this.storySpawns;

    this.colliders.length = 0;
    this.colliders.push(...srcColliders);

    this.spawns.player.copy(srcSpawns.player);
    this.spawns.enemies = srcSpawns.enemies.map((v) => v.clone());
    this.spawns.wife.copy(srcSpawns.wife);
    this.spawns.waveSpawns = srcSpawns.waveSpawns.map((v) => v.clone());
    this.spawns.bossArena = srcSpawns.bossArena ? srcSpawns.bossArena.clone() : null;
    this.spawns.playerEntry = srcSpawns.playerEntry ? srcSpawns.playerEntry.clone() : null;
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
    // Softer hearth accent — fire is local, not a global key.
    this.plinthLight = new THREE.PointLight(COLORS.ember, 28, 22, 1.6);
    this.plinthLight.position.set(wife.x, wife.y + 3, wife.z);
    this.scene.add(this.plinthLight);
    this.muteChalkyMaterials(level.root);
    this.attachBrazierLights(level.root);
    this.attachGalleryFillLights(level.root);
    this.attachEncounterAccents(level.root);
  }

  /**
   * Runtime safety net: crush blown-out kit albedo / emissive so windows and
   * trim sheets don't read as chalk white under moonlight.
   */
  private muteChalkyMaterials(root: THREE.Object3D): void {
    const seen = new Set<THREE.Material>();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        // Lantern cores are meant to glow; muting them leaves a tan "cardboard" block.
        if (/EmberGlow/.test(mat.name)) continue;
        const std = mat as THREE.MeshStandardMaterial;
        if (!('color' in std) || !std.color) continue;
        const c = std.color;
        const maxCh = Math.max(c.r, c.g, c.b);
        if (maxCh > 0.72) {
          c.multiplyScalar(0.45 / maxCh);
          c.r *= 0.92;
          c.b = Math.min(1, c.b * 1.08);
        }
        if (std.emissive) {
          const eMax = Math.max(std.emissive.r, std.emissive.g, std.emissive.b);
          if (eMax > 0.55) std.emissive.multiplyScalar(0.35 / eMax);
          if (std.emissiveIntensity != null && std.emissiveIntensity > 0.5) {
            std.emissiveIntensity = Math.min(std.emissiveIntensity, 0.4);
          }
        }
      }
    });
  }

  /** Local warm pools on VIS_*Brazier* / VIS_*Lamp* meshes (GLB has no lights). */
  private attachBrazierLights(root: THREE.Object3D): void {
    for (const light of this.brazierLights) {
      light.parent?.remove(light);
      light.dispose();
    }
    this.brazierLights.length = 0;
    const pos = new THREE.Vector3();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const n = obj.name;
      if (!/Brazier|LampGlow|LanternGlow/i.test(n)) return;
      if (!n.startsWith('VIS_')) return;
      obj.getWorldPosition(pos);
      // Wall lanterns on the west gallery are close to the walk: keep their pool small.
      const lantern = /GalW_LanternGlow/.test(n);
      const light = new THREE.PointLight(COLORS.ember, lantern ? 5 : 18, lantern ? 6 : 14, 1.8);
      light.position.copy(pos).add(new THREE.Vector3(0, 0.35, 0));
      light.castShadow = false;
      this.scene.add(light);
      this.brazierLights.push(light);
    });
  }

  /**
   * Cool fill only on tower-side gallery decks (VIS_BalW / VIS_BalE) so walk
   * edges read without a global atmosphere redo.
   */
  private attachGalleryFillLights(root: THREE.Object3D): void {
    const pos = new THREE.Vector3();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name !== 'VIS_BalW' && obj.name !== 'VIS_BalE') return;
      obj.getWorldPosition(pos);
      const light = new THREE.PointLight(COLORS.moonlight, 10, 12, 1.6);
      light.position.copy(pos).add(new THREE.Vector3(0, 2.2, 0));
      light.castShadow = false;
      this.scene.add(light);
      this.brazierLights.push(light);
    });
  }

  /**
   * West encounter only: a cool rim grazing the gallery arcade and a low fill on the court floor
   * between the two west columns. Local (short range, no shadows) so the mood stays dark.
   */
  private attachEncounterAccents(root: THREE.Object3D): void {
    const arcade = root.getObjectByName('VIS_GalW_Arcade');
    const pillar = root.getObjectByName('VIS_CourtPillar_A');
    const pier = root.getObjectByName('VIS_CloisterBridge_PierW');
    const pos = new THREE.Vector3();
    const add = (p: THREE.Vector3, intensity: number, range: number): void => {
      const light = new THREE.PointLight(COLORS.moonlight, intensity, range, 1.6);
      light.position.copy(p);
      light.castShadow = false;
      this.scene.add(light);
      this.brazierLights.push(light);
    };
    if (arcade) {
      arcade.getWorldPosition(pos);
      add(pos.clone().add(new THREE.Vector3(2.4, 3.0, 0)), 7, 8);
    }
    if (pillar && pier) {
      const mid = pillar.getWorldPosition(new THREE.Vector3()).add(pier.getWorldPosition(pos)).multiplyScalar(0.5);
      // Court side of the pair (+x), so the column fronts and the floor between them catch it.
      add(mid.add(new THREE.Vector3(1.6, 3.0, 0)), 36, 9);
    }
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
      playerEntry: null,
    };
    this.storyColliders = this.colliders.slice();
    this.colliders.length = 0;
  }

  private buildLights(): void {
    // Cool, low fill so moonlight carries form (art direction).
    this.scene.add(new THREE.HemisphereLight(0x8a9aac, 0x0e1014, 0.32));
    this.scene.add(new THREE.AmbientLight(0x161a20, 0.14));

    const moon = new THREE.DirectionalLight(COLORS.moonlight, 1.15);
    moon.position.set(-28, 55, 18);
    moon.castShadow = true;
    moon.shadow.camera.layers.enable(WRAITH.bodyLayer);
    moon.shadow.mapSize.set(2048, 2048);
    const s = 80;
    moon.shadow.camera.left = -s;
    moon.shadow.camera.right = s;
    moon.shadow.camera.top = s;
    moon.shadow.camera.bottom = -s;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 220;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    this.scene.add(moon);
    // No global ember directional — warmth is local braziers / wife only.
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
    playerEntry: s.playerEntry ? s.playerEntry.clone() : null,
  };
}
