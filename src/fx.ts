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
  slowmo: (scale: number, seconds: number) => void;
}

export function playEvents(events: readonly GameEvent[], fx: FxTargets): void {
  for (const e of events) {
    switch (e.type) {
      case 'swing':
        if (e.move === 'dashStrike') sfx('dash');
        sfx(e.heavy ? 'swingHeavy' : 'swing', e.combo);
        break;
      case 'hit': {
        sfx(e.heavy ? 'hitHeavy' : 'hit');
        fx.rig.shake(e.heavy ? 0.45 : 0.18);
        fx.rig.kick(e.heavy ? 0.8 : 0.3);
        const n = e.heavy ? 26 : 14;
        for (let i = 0; i < n; i++) {
          fx.glow.emit({
            ...((v) => ({ x: e.x, y: e.y, z: e.z, vx: e.dx * v, vz: e.dz * v }))(3 + Math.random() * 6), vy: Math.random() * 5 - 1, spread: 2.2,
            life: 0.35, size: 0.14, sizeEnd: 0.02, r: 3.5, g: 2.6, b: 4.5, gravity: 9, drag: 2,
          });
        }
        for (let i = 0; i < 8; i++)
          fx.smoke.emit({ x: e.x, y: e.y, z: e.z, vx: e.dx * 2, vz: e.dz * 2, spread: 1.5, life: 0.6, size: 0.8, sizeEnd: 1.4, r: 0.02, g: 0.02, b: 0.04, alpha: 0.8, drag: 3 });
        break;
      }
      case 'kill':
        sfx(e.burned ? 'burn' : 'kill');
        if (e.big) {
          fx.slowmo(0.2, 1.4);
          fx.rig.kick(1.4);
          fx.flash(0.4, '#ffe0c0');
        }
        fx.rig.shake(e.burned ? 0.1 : 0.3);
        for (let i = 0; i < 40; i++)
          fx.smoke.emit({ x: e.x, y: e.y, z: e.z, spread: 3, vy: 1.2, life: 1.1, size: 1, sizeEnd: 2.2, r: 0.02, g: 0.015, b: 0.035, alpha: 0.9, drag: 2.2 });
        for (let i = 0; i < 18; i++)
          fx.glow.emit({ z: e.z, x: e.x, y: e.y, spread: 2.5, vy: 1, life: 0.9, size: 0.09, sizeEnd: 0.02, r: 5, g: 1.4, b: 0.3, gravity: -0.8, drag: 1.5, wobble: 0.6 });
        // memory wisp: a pale light that drifts up and away
        for (let i = 0; i < 5; i++)
          fx.glow.emit({ z: e.z, x: e.x, y: e.y + 0.3, vy: 1.4 + i * 0.2, spread: 0.12, life: 2.4, size: 0.16 - i * 0.02, sizeEnd: 0.03, r: 1.3, g: 1.6, b: 3.2, gravity: -0.3, wobble: 1.2 });
        break;
      case 'spawn':
        sfx('spawn');
        break;
      case 'dash':
        sfx('dash');
        fx.rig.kick(0.25);
        break;
      case 'jump':
        if (!e.double) {
          sfx('jump');
          break;
        }
        // double jump: a ring of shadow kicked off the air under his feet
        sfx('airJump');
        fx.rig.kick(0.2);
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          fx.smoke.emit({ x: e.x, y: e.y + 0.1, z: e.z, vx: Math.cos(a) * 3.2, vz: Math.sin(a) * 3.2, vy: -1.2, spread: 0.2, life: 0.45, size: 0.45, sizeEnd: 1, r: 0.03, g: 0.02, b: 0.06, alpha: 0.75, drag: 4 });
          if (i % 2) fx.glow.emit({ x: e.x, y: e.y + 0.1, vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, vy: -0.6, spread: 0.1, life: 0.3, size: 0.1, sizeEnd: 0.02, r: 1.6, g: 1.0, b: 4, drag: 4 });
        }
        break;
      case 'chargeFull':
        sfx('chargeFull');
        fx.flash(0.12, '#9a6bff');
        fx.rig.kick(0.3);
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2;
          fx.glow.emit({ z: e.z, x: e.x + Math.cos(a) * 0.3, y: e.y + Math.sin(a) * 0.3, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, spread: 0.1, life: 0.35, size: 0.12, sizeEnd: 0.02, r: 2.4, g: 1.6, b: 5, drag: 3 });
        }
        break;
      case 'land':
        sfx('land');
        for (let i = 0; i < 8; i++)
          fx.smoke.emit({ z: e.z, x: e.x, y: e.y + 0.05, vx: (i % 2 ? 1 : -1) * 2, spread: 0.6, life: 0.45, size: 0.5, sizeEnd: 0.9, r: 0.1, g: 0.08, b: 0.1, alpha: 0.5, drag: 4 });
        break;
      case 'lifeLost':
        sfx('shard');
        fx.slowmo(0.25, 0.9);
        fx.flash(0.55, '#c9b8ff');
        fx.rig.shake(0.8);
        fx.rig.kick(1.2);
        for (let i = 0; i < 80; i++) {
          const a = (i / 80) * Math.PI * 2;
          const v = 6 + Math.random() * 5;
          fx.glow.emit({ x: e.x, y: e.y + 1.1, vx: Math.cos(a) * v, vz: (Math.random() - 0.5) * v, vy: Math.sin(a) * v * 0.7 + 1, spread: 0.2, life: 0.7, size: 0.16, sizeEnd: 0.02, r: 2.2, g: 1.6, b: 5, drag: 2.5 });
        }
        for (let i = 0; i < 30; i++)
          fx.smoke.emit({ z: e.z, x: e.x, y: e.y + 0.4, spread: 1.4, vy: 1.5, life: 1.2, size: 1, sizeEnd: 2.4, r: 0.03, g: 0.02, b: 0.06, alpha: 0.8, drag: 2 });
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
      case 'fireburst':
        sfx('fireburst');
        fx.rig.shake(0.5);
        fx.rig.kick(0.9);
        fx.flash(0.18, '#ff7a2f');
        for (let i = 0; i < 70; i++) {
          const k = Math.random();
          fx.glow.emit({
            ...((v, side) => ({ x: e.x - e.dx * 0.6 - e.dz * side, z: e.z - e.dz * 0.6 + e.dx * side, vx: e.dx * v, vz: e.dz * v }))(6 + Math.random() * 9, (Math.random() - 0.5) * 0.8),
            y: e.y + (Math.random() - 0.5) * 1.4, vy: (Math.random() - 0.3) * 3, spread: 1.2,
            life: 0.55, size: 0.9 - k * 0.5, sizeEnd: 0.1, r: 3 + k * 1.5, g: 0.8 + k * 1.4, b: 0.15 + k * 0.3, alpha: 0.7, drag: 3.5, gravity: -3,
          });
        }
        for (let i = 0; i < 20; i++)
          fx.smoke.emit({ x: e.x + e.dx * 2, y: e.y, z: e.z + e.dz * 2, vx: e.dx * 3, vz: e.dz * 3, spread: 1.2, vy: 1, life: 1.3, size: 1.2, sizeEnd: 2.6, r: 0.05, g: 0.04, b: 0.04, alpha: 0.5, drag: 1.5 });
        break;
      case 'slam': {
        // shadow plunge: a shockwave ring racing out across the ground
        sfx('hitHeavy');
        if (e.fire) sfx('fireburst');
        fx.rig.shake(0.75);
        fx.rig.kick(1.1);
        fx.flash(0.15, e.fire ? '#ff7a2f' : '#9a6bff');
        const c = e.fire ? [4, 1.4, 0.3] : [1.4, 0.7, 3.6];
        for (let i = 0; i < 90; i++) {
          const a = (i / 90) * Math.PI * 2;
          const v = 7 + Math.random() * 3;
          fx.glow.emit({ x: e.x, y: e.y + 0.12, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 0.4, spread: 0.3, life: 0.45, size: 0.22, sizeEnd: 0.04, r: c[0], g: c[1], b: c[2], drag: 3 });
        }
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          fx.smoke.emit({ x: e.x + Math.cos(a) * 0.6, y: e.y + 0.15, z: e.z + Math.sin(a) * 0.6, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, vy: 1.2, spread: 0.5, life: 0.9, size: 1.1, sizeEnd: 2.4, r: 0.04, g: 0.03, b: 0.06, alpha: 0.7, drag: 3 });
        }
        break;
      }
      case 'bolt':
        sfx('bolt');
        break;
      case 'boltCut':
        sfx('cut');
        fx.rig.kick(0.25);
        for (let i = 0; i < 24; i++)
          fx.glow.emit({ z: e.z, x: e.x, y: e.y, spread: 3, life: 0.35, size: 0.1, sizeEnd: 0.02, r: 3.2, g: 2.6, b: 4.5, drag: 3 });
        break;
      case 'boltHit':
        fx.flash(0.3, '#3a1260');
        fx.rig.shake(0.35);
        for (let i = 0; i < 30; i++)
          fx.smoke.emit({ z: e.z, x: e.x, y: e.y, spread: 2, life: 0.8, size: 0.7, sizeEnd: 1.4, r: 0.04, g: 0.01, b: 0.08, alpha: 0.85, drag: 3 });
        break;
      case 'pounce':
        sfx('pounce');
        break;
      case 'marshalCry':
        sfx('cry');
        fx.rig.shake(1);
        fx.rig.kick(1.2);
        fx.flash(0.35, '#7a1010');
        fx.slowmo(0.45, 0.9);
        for (let i = 0; i < 80; i++) {
          const a = (i / 80) * Math.PI * 2;
          fx.smoke.emit({ z: e.z, x: e.x, y: e.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 4, spread: 0.5, life: 1.0, size: 1, sizeEnd: 2.4, r: 0.05, g: 0.0, b: 0.02, alpha: 0.8, drag: 2.5 });
        }
        break;
      case 'wave':
        sfx('hitHeavy');
        fx.rig.shake(0.45);
        break;
      case 'bigSpawn':
        sfx('bigSpawn');
        fx.rig.shake(0.7);
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
