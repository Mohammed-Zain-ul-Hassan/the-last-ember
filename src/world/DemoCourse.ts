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

/** Frozen graybox metrics — keep in sync with docs/level-pipeline.md. */
export const DEMO_METRICS = {
  jumpGap: 3.2,
  dashGap: 6.5,
  hopRise: 1.0,
  slideRunway: 12,
  slideCeilAboveFloor: 2.0,
  slideLen: 7,
  stairRiser: 0.35,
  stairTread: 1.35,
  comboJumpGap: 2.8,
  comboDashGap: 6.0,
  width: 8,
} as const;

/**
 * Linear verb curriculum graybox for Demo Level.
 * Walk → jump → chrono-dash → hop → slide → still → stairs → combo → finish.
 * Flat blockout materials only; shipped look may come from demo_course.glb.
 */
export function buildDemoCourse(): DemoCourse {
  const root = new THREE.Group();
  root.name = 'DemoCourse';
  const colliders: THREE.Box3[] = [];
  const M = DEMO_METRICS;
  const W = M.width;

  const ink = new THREE.MeshStandardMaterial({
    color: COLORS.floor,
    roughness: 0.95,
    metalness: 0.05,
  });
  const panel = new THREE.MeshStandardMaterial({
    color: COLORS.panel,
    roughness: 0.85,
    metalness: 0.15,
  });
  /** Hazard / teach accent (chrono green) — not decorative art. */
  const hazard = new THREE.MeshStandardMaterial({
    color: 0x0a120e,
    emissive: 0x3cff6a,
    emissiveIntensity: 0.25,
    roughness: 0.7,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x3cff6a, transparent: true, opacity: 0.35 });

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

  /** Platform whose top is at `topY`, spanning z ∈ [z0, z1] (z0 > z1 toward finish). */
  const pad = (z0: number, z1: number, topY: number, mat: THREE.Material = ink): void => {
    const d = Math.abs(z0 - z1);
    const z = (z0 + z1) / 2;
    addBox(W, 1, d, 0, topY - 1, z, mat, { edges: false });
  };

  const addSign = (text: string, x: number, y: number, z: number): void => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#3cff6a';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#c8d0c8';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    board.position.set(x, y, z);
    root.add(board);
    addBox(0.1, Math.max(0.4, y - 0.2), 0.1, x, 0, z + 0.04, panel, { edges: false, collider: false });
  };

  // ----- Band A: floor top y = 0 -----
  // 1 Walk  z 18..28
  pad(28, 18, 0);
  addSign('1  WALK', 0, 2.2, 25);

  // 2 Jump takeoff 15.5..18, gap 3.2 → landing 8.3..12.3
  pad(18, 15.5, 0);
  addSign('2  JUMP', 0, 2.2, 16.5);
  const jumpFar = 15.5 - M.jumpGap; // 12.3
  pad(jumpFar, jumpFar - 4, 0);

  // 3 Chrono-dash: takeoff ends at jumpFar-4 (=8.3); short approach then takeoff lip
  const dashTake0 = jumpFar - 4; // 8.3
  const dashTake1 = dashTake0 - 3; // 5.3
  pad(dashTake0, dashTake1, 0, panel);
  addSign('3  CHRONO DASH', 0, 2.2, dashTake0 - 0.5);
  const dashLand0 = dashTake1 - M.dashGap; // -1.2
  pad(dashLand0, dashLand0 - 5, 0); // -1.2 .. -6.2

  // ----- Band B: hop to y = 1 -----
  // Small air before hop face at z = -7.2
  const hopZ0 = dashLand0 - 5; // -6.2
  const hopZ1 = hopZ0 - 10; // -16.2
  pad(hopZ0 - 0.8, hopZ1, M.hopRise, panel); // top y=1
  addSign('4  HOP UP', 0, 3.2, hopZ0 - 1.5);

  // 5 Sprint runway + slide (floor top y=1)
  const run0 = hopZ1; // -16.2
  const run1 = run0 - M.slideRunway; // -28.2
  pad(run0, run1, M.hopRise);
  addSign('5  SPRINT + SLIDE', 0, 3.2, run0 - 2);
  const tunZ = run1 - M.slideLen / 2; // tunnel center
  const floorTop = M.hopRise;
  addBox(W, 0.4, M.slideLen, 0, floorTop + M.slideCeilAboveFloor, tunZ, hazard);
  addBox(0.4, M.slideCeilAboveFloor, M.slideLen, -W / 2 + 0.2, floorTop, tunZ, panel, { edges: false });
  addBox(0.4, M.slideCeilAboveFloor, M.slideLen, W / 2 - 0.2, floorTop, tunZ, panel, { edges: false });
  const afterSlide = run1 - M.slideLen; // -35.2

  // 6 Still enemy pad
  pad(afterSlide, afterSlide - 8, M.hopRise, panel);
  addSign('6  STILL ENEMY', 0, 3.2, afterSlide - 1);
  const enemyStill = new THREE.Vector3(0, M.hopRise, afterSlide - 4);

  // 7 Stairs (risers 0.35)
  const stairZ0 = afterSlide - 8; // -43.2
  const stairCount = 6;
  for (let i = 0; i < stairCount; i++) {
    addBox(
      W - 1,
      M.stairRiser,
      M.stairTread - 0.1,
      0,
      M.hopRise + i * M.stairRiser,
      stairZ0 - i * M.stairTread,
      panel,
      { edges: false },
    );
  }
  addSign('7  STAIRS', 0, 4.2, stairZ0 - 1);
  const finishTop = M.hopRise + stairCount * M.stairRiser; // 3.1
  const stairEnd = stairZ0 - stairCount * M.stairTread; // ~-51.3

  // 8 Combo: jump 2.8 → dash 6.0 → still
  const combo0 = stairEnd - 1;
  pad(stairEnd, combo0 - 3, finishTop, panel);
  addSign('8  COMBO', 0, finishTop + 2.2, stairEnd - 0.5);
  const comboJumpFar = combo0 - 3 - M.comboJumpGap;
  pad(comboJumpFar, comboJumpFar - 2.5, finishTop);
  const comboDashFar = comboJumpFar - 2.5 - M.comboDashGap;
  pad(comboDashFar, comboDashFar - 6, finishTop, panel);
  const enemyCombo = new THREE.Vector3(0, finishTop, comboDashFar - 3);
  addSign('STILL', 0, finishTop + 2.2, comboDashFar - 1);

  // 9 Finish plaza
  const fin0 = comboDashFar - 6;
  pad(fin0, fin0 - 10, finishTop, hazard);
  addSign('9  FINISH', 0, finishTop + 2.4, fin0 - 2);

  // Side rails (whole course)
  const zMid = (28 + (fin0 - 10)) / 2;
  const zLen = 28 - (fin0 - 10) + 4;
  for (const x of [-W / 2 - 0.25, W / 2 + 0.25]) {
    addBox(0.5, 1.5, zLen, x, 0, zMid, panel, { edges: false });
  }

  const spawns: LevelSpawns = {
    player: new THREE.Vector3(0, 0.05, 26),
    enemies: [enemyStill, enemyCombo],
    wife: new THREE.Vector3(0, -80, 0),
    waveSpawns: [],
    bossArena: null,
  };

  root.updateMatrixWorld(true);

  return {
    root,
    colliders,
    spawns,
    objectiveFor: demoObjectiveFor,
  };
}

/** Shared HUD bands for graybox and demo_course.glb. */
export function demoObjectiveFor(feet: THREE.Vector3): string {
  const stations: Station[] = [
    { zMin: 18, label: 'Demo — walk forward' },
    { zMin: 12, label: 'Demo — jump the gap' },
    { zMin: 0, label: 'Demo — chrono-dash (Space in air)' },
    { zMin: -14, label: 'Demo — hop onto the ledge' },
    { zMin: -27, label: 'Demo — sprint, then slide under' },
    { zMin: -40, label: 'Demo — defeat the still enemy' },
    { zMin: -48, label: 'Demo — climb the stairs' },
    { zMin: -58, label: 'Demo — jump, dash, still enemy' },
    { zMin: -70, label: 'Demo — finish plaza' },
    { zMin: -999, label: 'Demo complete — Esc for menu' },
  ];
  for (const s of stations) {
    if (feet.z >= s.zMin) return s.label;
  }
  return stations[stations.length - 1].label;
}
