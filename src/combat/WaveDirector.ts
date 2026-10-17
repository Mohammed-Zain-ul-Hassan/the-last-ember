import * as THREE from 'three';
import { LEVEL } from '../config';
import type { Enemies } from './Enemies';
import type { FireWife } from '../world/FireWife';
import type { LevelSpawns } from '../world/LevelLoader';

export type StoryPhase = 'idle' | 'climb' | 'defense' | 'boss' | 'win' | 'demo';

/**
 * Drives climb → defense waves → boss → win. Sets music intensity and HUD objectives
 * via callbacks so UI/audio stay decoupled. Demo mode is a free combat sandbox.
 */
export class WaveDirector {
  phase: StoryPhase = 'idle';
  private waveIndex = 0;
  private waveSpawned = false;
  private defenseStarted = false;

  onPhase: ((phase: StoryPhase) => void) | null = null;
  onObjective: ((text: string) => void) | null = null;
  onIntensity: ((n: number) => void) | null = null;

  constructor(
    private readonly enemies: Enemies,
    private readonly wife: FireWife,
    private readonly spawns: LevelSpawns,
  ) {
    this.onObjective?.('Ascend');
    this.onIntensity?.(0);
  }

  /** Clear enemies and story flags so Play / Demo can restart cleanly. */
  reset(): void {
    this.phase = 'idle';
    this.waveIndex = 0;
    this.waveSpawned = false;
    this.defenseStarted = false;
    this.enemies.clear();
    this.wife.setMode('sleep');
    this.onIntensity?.(0);
  }

  /** Call once after systems exist — spawns climb landing enemies. */
  begin(): void {
    this.reset();
    this.phase = 'climb';
    const spots = this.spawns.enemies;
    spots.forEach((p, i) => {
      if (i % 2 === 0) this.enemies.spawnStatic(p);
      else this.enemies.spawnRusher(p);
    });
    this.wife.setMode('sleep');
    this.onObjective?.('Ascend');
    this.onPhase?.('climb');
    this.onIntensity?.(0);
  }

  /**
   * Sandbox for testing: spawn a ring of enemies near the player start,
   * no plaza defense / boss progression. Respawns when the ring is cleared.
   */
  beginDemo(): void {
    this.reset();
    this.phase = 'demo';
    this.wife.setMode('sleep');
    this.spawnDemoRing();
    this.onObjective?.('Demo — test combat & movement');
    this.onPhase?.('demo');
    this.onIntensity?.(0);
  }

  update(_dt: number, playerFeet: THREE.Vector3): void {
    if (this.phase === 'demo') {
      if (this.enemies.aliveCount() === 0) this.spawnDemoRing();
      this.onIntensity?.(this.enemies.aliveCount() > 0 ? 1 : 0);
      return;
    }

    if (this.phase === 'climb') {
      // Arm defense when the player reaches the hearth plaza (near wife empty), not a magic Y.
      const wife = this.spawns.wife;
      const dx = playerFeet.x - wife.x;
      const dz = playerFeet.z - wife.z;
      const nearPlaza = Math.hypot(dx, dz) < 28 && playerFeet.y >= wife.y - 3;
      if (nearPlaza && !this.defenseStarted) {
        this.enterDefense();
      } else {
        // Full combat bed while climb enemies are alive (exclusive with ambient).
        const living = this.enemies.aliveCount();
        this.onIntensity?.(living > 0 ? 1 : 0);
      }
      return;
    }

    if (this.phase === 'defense') {
      this.onIntensity?.(1);
      if (!this.waveSpawned) {
        this.spawnWave();
        this.waveSpawned = true;
      } else if (this.enemies.aliveCount() === 0) {
        this.waveIndex++;
        if (this.waveIndex >= LEVEL.defenseWaves) {
          this.enterBoss();
        } else {
          this.waveSpawned = false;
          this.onObjective?.(`Defend her — wave ${this.waveIndex + 1}/${LEVEL.defenseWaves}`);
        }
      }
      return;
    }

    if (this.phase === 'boss') {
      this.onIntensity?.(1);
      if (this.wife.mode === 'dead') this.enterWin();
    }
  }

  private spawnDemoRing(): void {
    const origin = this.spawns.player;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = new THREE.Vector3(
        origin.x + Math.cos(a) * 7,
        origin.y,
        origin.z + Math.sin(a) * 7 - 2,
      );
      if (i % 2 === 0) this.enemies.spawnStatic(p, a + Math.PI);
      else this.enemies.spawnRusher(p, origin.clone());
    }
  }

  private enterDefense(): void {
    this.defenseStarted = true;
    this.phase = 'defense';
    this.waveIndex = 0;
    this.waveSpawned = false;
    this.enemies.clear();
    this.wife.setMode('defense');
    this.wife.hp = LEVEL.wifeMaxHp;
    this.wife.maxHp = LEVEL.wifeMaxHp;
    this.onPhase?.('defense');
    this.onObjective?.(`Defend her — wave 1/${LEVEL.defenseWaves}`);
    this.onIntensity?.(1);
  }

  private spawnWave(): void {
    const points = this.spawns.waveSpawns;
    const n = LEVEL.defensePerWave;
    for (let i = 0; i < n; i++) {
      const p = points[i % points.length].clone();
      p.x += (Math.random() - 0.5) * 1.5;
      p.z += (Math.random() - 0.5) * 1.5;
      this.enemies.spawnRusher(p, this.wife.root.position);
    }
  }

  private enterBoss(): void {
    this.phase = 'boss';
    this.enemies.clear();
    this.wife.setMode('boss');
    this.onPhase?.('boss');
    this.onObjective?.('Put her to rest');
    this.onIntensity?.(1);
  }

  private enterWin(): void {
    this.phase = 'win';
    this.onPhase?.('win');
    this.onObjective?.('The ember sleeps');
    this.onIntensity?.(0);
  }
}
