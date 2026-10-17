import * as THREE from 'three';
import { COLORS } from '../config';
import type { LevelSpawns } from './LevelLoader';

export interface DemoCourse {
  root: THREE.Group;
  colliders: THREE.Box3[];
  spawns: LevelSpawns;
  /** HUD line for the station the player is nearest / approaching. */
  objectiveFor(feet: THREE.Vector3): string;
}

interface Station {
  /** While feet.z >= zMin (course runs toward -Z), show this label. */
  zMin: number;
  label: string;
}

/**
 * Linear movement / combat proving ground for the Demo Level menu entry.
 * Walk → jump gap → hop ledge → slide tunnel → still enemy → stairs → finish.
 */
export function buildDemoCourse(): DemoCourse {
  const root = new THREE.Group();
  root.name = 'DemoCourse';
  const colliders: THREE.Box3[] = [];
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.ember, transparent: true, opacity: 0.65 });
  const floorMat = new THREE.MeshStandardMaterial({
    color: COLORS.floor,
    roughness: 0.92,
    metalness: 0.08,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: COLORS.panel,
    roughness: 0.75,
    metalness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x1a1210,
    emissive: COLORS.ember,
    emissiveIntensity: 0.35,
    roughness: 0.6,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x100c08,
    emissive: COLORS.gold,
    emissiveIntensity: 0.45,
    roughness: 0.5,
  });

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    yMin: number,
    z: number,
    mat: THREE.Material,
    opts?: { collider?: boolean; edges?: boolean },
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yMin + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (opts?.edges !== false) {
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
    }
    if (opts?.collider !== false) {
      mesh.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  };

  const addSign = (text: string, x: number, y: number, z: number): void => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#ff7a2f';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#e9dfd0';
    ctx.font = 'bold 42px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    board.position.set(x, y, z);
    root.add(board);
    // Post
    addBox(0.12, y - 0.1, 0.12, x, 0, z + 0.05, stoneMat, { edges: false });
  };

  // --- Corridor (runs toward -Z). Floor tops: walk/gap at y=0, raised course at y=1+. ---
  const W = 8;
  // 1 Walk — z 10..22
  addBox(W, 1, 12, 0, -1, 16, floorMat, { edges: false });
  addSign('1  WALK', 0, 2.2, 20);

  // 2 Jump takeoff — z 6.5..9.5, then ~3.5 m air gap, landing z -1.5..2.5
  addBox(W, 1, 3, 0, -1, 8, floorMat, { edges: false });
  addSign('2  JUMP', 0, 2.2, 9);
  addBox(W, 1, 4, 0, -1, 0.5, floorMat, { edges: false });

  // 3 Hop ledge (+1 m above landing floor)
  addBox(W, 1, 10, 0, 0, -8, stoneMat);
  addSign('3  HOP UP', 0, 3.2, -4);

  // 4 Sprint approach (continuous with hop top at y=1)
  addBox(W, 1, 12, 0, 0, -19, floorMat, { edges: false });
  addSign('4  SPRINT + SLIDE', 0, 3.2, -14);

  // Slide tunnel — ceiling underside y=2.0 (crouch fits, stand does not)
  addBox(W, 0.4, 7, 0, 2.0, -28, accentMat);
  addBox(0.4, 2.0, 7, -W / 2 + 0.2, 1, -28, stoneMat, { edges: false });
  addBox(0.4, 2.0, 7, W / 2 - 0.2, 1, -28, stoneMat, { edges: false });

  // 5 Still-enemy pad
  addBox(W, 1, 10, 0, 0, -36.5, stoneMat);
  addSign('5  STILL ENEMY', 0, 3.2, -32);

  // 6 Stairs (risers 0.35 ≤ stepUp 0.4)
  const stairZ0 = -43;
  for (let i = 0; i < 6; i++) {
    addBox(W - 1, 0.35, 1.4, 0, 1 + i * 0.35, stairZ0 - i * 1.35, stoneMat, { edges: false });
  }
  addSign('6  STAIRS', 0, 4.2, -42);

  // 7 Finish plaza (flush with top stair)
  const finishTop = 1 + 6 * 0.35;
  addBox(W + 2, 1, 12, 0, finishTop - 1, -54, trimMat);
  addSign('7  FINISH', 0, finishTop + 2.4, -49);

  // Side rails
  for (const x of [-W / 2 - 0.25, W / 2 + 0.25]) {
    addBox(0.5, 1.4, 80, x, 0, -16, stoneMat, { edges: false });
  }

  const enemyStill = new THREE.Vector3(0, 1.0, -37);
  const enemyFinish = new THREE.Vector3(2.2, finishTop, -54);

  const stations: Station[] = [
    { zMin: 11, label: 'Demo — walk forward' },
    { zMin: 1, label: 'Demo — jump the gap' },
    { zMin: -12, label: 'Demo — hop onto the ledge' },
    { zMin: -25, label: 'Demo — sprint, then slide under' },
    { zMin: -40, label: 'Demo — defeat the still enemy' },
    { zMin: -48, label: 'Demo — climb the stairs' },
    { zMin: -56, label: 'Demo — finish plaza' },
    { zMin: -999, label: 'Demo complete — Esc for menu' },
  ];

  const spawns: LevelSpawns = {
    player: new THREE.Vector3(0, 0.05, 20),
    enemies: [enemyStill, enemyFinish],
    wife: new THREE.Vector3(0, -50, 0),
    waveSpawns: [],
    bossArena: null,
  };

  root.updateMatrixWorld(true);

  return {
    root,
    colliders,
    spawns,
    objectiveFor(feet: THREE.Vector3): string {
      for (const s of stations) {
        if (feet.z >= s.zMin) return s.label;
      }
      return stations[stations.length - 1].label;
    },
  };
}
