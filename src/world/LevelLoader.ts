import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LEVEL } from '../config';

export interface LevelSpawns {
  player: THREE.Vector3;
  enemies: THREE.Vector3[];
  wife: THREE.Vector3;
  waveSpawns: THREE.Vector3[];
  bossArena: THREE.Vector3 | null;
}

export interface LoadedLevel {
  root: THREE.Group;
  colliders: THREE.Box3[];
  spawns: LevelSpawns;
}

const DEFAULT_SPAWNS: LevelSpawns = {
  player: new THREE.Vector3(0, 0.05, 8),
  enemies: [],
  wife: new THREE.Vector3(0, 23, -95),
  waveSpawns: [
    new THREE.Vector3(-8, 22.5, -88),
    new THREE.Vector3(8, 22.5, -88),
    new THREE.Vector3(0, 22.5, -102),
  ],
  bossArena: new THREE.Vector3(0, 22.5, -95),
};

/**
 * Loads the Blender-authored ember climb GLB. Meshes named COL_* become invisible
 * AABB colliders; empties (PlayerSpawn, Enemy_*, WifeAnchor, WaveSpawn_*, BossArena)
 * become spawn points.
 */
export async function loadLevel(url: string = LEVEL.url): Promise<LoadedLevel | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const colliders: THREE.Box3[] = [];
    const enemyNamed: Array<{ name: string; pos: THREE.Vector3 }> = [];
    const spawns: LevelSpawns = {
      player: DEFAULT_SPAWNS.player.clone(),
      enemies: [],
      wife: DEFAULT_SPAWNS.wife.clone(),
      waveSpawns: [],
      bossArena: null,
    };

    root.traverse((obj) => {
      const name = obj.name;
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (name.startsWith('COL_')) {
          obj.visible = false;
          obj.castShadow = false;
          const box = new THREE.Box3().setFromObject(obj);
          if (!box.isEmpty()) colliders.push(box);
        }
        // Runtime FireWife replaces the blocky Blender silhouette.
        if (name.startsWith('VIS_Wife')) obj.visible = false;
      }
      // Empties and Object3D markers from Blender.
      if (name === 'PlayerSpawn') spawns.player.copy(worldPos(obj));
      else if (name === 'WifeAnchor') spawns.wife.copy(worldPos(obj));
      else if (name === 'BossArena') spawns.bossArena = worldPos(obj);
      else if (name.startsWith('Enemy_')) enemyNamed.push({ name, pos: worldPos(obj) });
      else if (name.startsWith('WaveSpawn_')) spawns.waveSpawns.push(worldPos(obj));
    });

    // Stable order so WaveDirector even=static / odd=rusher matches Enemy_01, Enemy_02, …
    enemyNamed.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    spawns.enemies = enemyNamed.map((e) => e.pos);

    if (!spawns.waveSpawns.length) spawns.waveSpawns = DEFAULT_SPAWNS.waveSpawns.map((v) => v.clone());
    if (!spawns.bossArena) spawns.bossArena = DEFAULT_SPAWNS.bossArena!.clone();

    return { root, colliders, spawns };
  } catch (err) {
    console.warn('[LevelLoader] failed to load level, using fallback arena:', err);
    return null;
  }
}

function worldPos(obj: THREE.Object3D): THREE.Vector3 {
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  return v;
}
