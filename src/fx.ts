// All game-feel feedback in one place: sim events -> particles, camera, sound.
import { sfx } from './audio/sfx';
import type { CameraRig } from './render/cameraRig';
import type { Particles } from './render/particles';
import type { GameEvent } from './sim/world';

export interface FxTargets {
  rig: CameraRig;
  glow: Particles; // additive
  smoke: Particles; // dark, normal blend
  flash: (strength: number, color?: string) => void;
}

export function playEvents(events: readonly GameEvent[], fx: FxTargets): void {
  for (const e of events) {
    switch (e.type) {
      case 'swing':
        sfx(e.heavy ? 'swingHeavy' : 'swing', e.combo);
        break;
      case 'hit': {
        sfx(e.heavy ? 'hitHeavy' : 'hit');
        fx.rig.shake(e.heavy ? 0.45 : 0.18);
        fx.rig.kick(e.heavy ? 0.8 : 0.3);
        const n = e.heavy ? 26 : 14;
        for (let i = 0; i < n; i++) {
          fx.glow.emit({
            x: e.x, y: e.y, z: 0.2, vx: e.facing * (3 + Math.random() * 6), vy: Math.random() * 5 - 1, spread: 2.2,
            life: 0.35, size: 0.14, sizeEnd: 0.02, r: 3.5, g: 2.6, b: 4.5, gravity: 9, drag: 2,
          });
        }
        for (let i = 0; i < 8; i++)
          fx.smoke.emit({ x: e.x, y: e.y, vx: e.facing * 2, spread: 1.5, life: 0.6, size: 0.8, sizeEnd: 1.4, r: 0.02, g: 0.02, b: 0.04, alpha: 0.8, drag: 3 });
        break;
      }
      case 'kill':
        sfx(e.burned ? 'burn' : 'kill');
        fx.rig.shake(e.burned ? 0.1 : 0.3);
        for (let i = 0; i < 40; i++)
          fx.smoke.emit({ x: e.x, y: e.y, z: -0.2, spread: 3, vy: 1.2, life: 1.1, size: 1, sizeEnd: 2.2, r: 0.02, g: 0.015, b: 0.035, alpha: 0.9, drag: 2.2 });
        for (let i = 0; i < 18; i++)
          fx.glow.emit({ x: e.x, y: e.y, spread: 2.5, vy: 1, life: 0.9, size: 0.09, sizeEnd: 0.02, r: 5, g: 1.4, b: 0.3, gravity: -0.8, drag: 1.5, wobble: 0.6 });
        // memory wisp: a pale light that drifts up and away
        for (let i = 0; i < 6; i++)
          fx.glow.emit({ x: e.x, y: e.y + 0.3, vy: 1.6 + i * 0.15, spread: 0.15, life: 2.2, size: 0.35 - i * 0.04, sizeEnd: 0.05, r: 2.2, g: 2.4, b: 3.6, gravity: -0.3, wobble: 1.2 });
        break;
      case 'spawn':
        sfx('spawn');
        break;
      case 'dash':
        sfx('dash');
        fx.rig.kick(0.25);
        break;
      case 'jump':
        sfx('jump');
        break;
      case 'land':
        sfx('land');
        for (let i = 0; i < 8; i++)
          fx.smoke.emit({ x: e.x, y: e.y + 0.05, vx: (i % 2 ? 1 : -1) * 2, spread: 0.6, life: 0.45, size: 0.5, sizeEnd: 0.9, r: 0.1, g: 0.08, b: 0.1, alpha: 0.5, drag: 4 });
        break;
      case 'knightHurt':
        sfx('hurt');
        fx.rig.shake(0.6);
        fx.flash(0.35, '#5a0a10');
        break;
      case 'hearthHurt':
        sfx('hearthHurt');
        fx.rig.shake(0.12);
        break;
      case 'shadeWindup':
        break;
      case 'cleared':
        sfx('bell');
        fx.flash(0.25, '#ffd8a8');
        break;
      case 'lost':
        sfx('lose');
        fx.rig.shake(0.8);
        break;
    }
  }
}
