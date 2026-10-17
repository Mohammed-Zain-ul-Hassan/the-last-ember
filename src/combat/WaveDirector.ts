import * as THREE from 'three';
import { LEVEL } from '../config';
import type { Enemies } from './Enemies';
import type { FireWife } from '../world/FireWife';
import type { LevelSpawns } from '../world/LevelLoader';

export type StoryPhase = 'climb' | 'defense' | 'boss' | 'win';

/**
 * Drives climb → defense waves → boss → win. Sets music intensity and HUD objectives
 * via callbacks so UI/audio stay decoupled.
 */
export class WaveDirector {
  phase: StoryPhase = 'climb';
  private waveIndex = 0;
  private waveSpawned = false;
  private defenseStarted = false;
  private climbSpawned = false;

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

  /** Call once after systems exist — spawns climb landing enemies. */
  begin(): void {
    if (this.climbSpawned) return;
    this.climbSpawned = true;
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

  update(_dt: number, playerFeet: THREE.Vector3): void {
    if (this.phase === 'climb') {
      // Arm defense when the player reaches the hearth plaza (near wife empty), not a magic Y.
      const wife = this.spawns.wife;
      const dx = playerFeet.x - wife.x;
      const dz = playerFeet.z - wife.z;
      const nearPlaza = Math.hypot(dx, dz) < 28 && playerFeet.y >= wife.y - 3;
      if (nearPlaza && !this.defenseStarted) {
        this.enterDefense();
      } else {
        // Partial combat bed only while climb rushers are alive.
        const living = this.enemies.aliveCount();
        this.onIntensity?.(living > 0 ? 0.55 : 0);
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
