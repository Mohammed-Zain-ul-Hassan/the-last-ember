import * as THREE from 'three';
import { Flame } from './flame';
import type { Particles } from './particles';
import { rimify } from './rim';
import { surface } from './surface';
import { stoneBox } from './shapes';
import { glowTexture } from './textures';

const BOWL_TOP = 1.15;

/** The ancient hearth: a great brazier on a stepped plinth. Its fire is the one light the world has left. */
export class Hearth {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private halo: THREE.Sprite;
  private flame: Flame;
  private coals: THREE.MeshBasicMaterial;
  strength = 1; // 0..1; 0 = dead
  flameTop = 2.7; // sim light height
  lit = true; // false after midnight

  constructor(x: number) {
    const stone = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x2a232c, roughness: 0.85 }), 0.7, 'hearthstone'), 'stone');
    const plinth1 = new THREE.Mesh(stoneBox(3.2, 0.35, 2.3, 41, 0.04), stone);
    plinth1.position.y = 0.175;
    const plinth2 = new THREE.Mesh(stoneBox(2.3, 0.3, 1.8, 42, 0.035), stone);
    plinth2.position.y = 0.5;
    const pts = [
      new THREE.Vector2(0.0, 0),
      new THREE.Vector2(0.38, 0),
      new THREE.Vector2(0.3, 0.12),
      new THREE.Vector2(0.45, 0.3),
      new THREE.Vector2(0.98, 0.42),
      new THREE.Vector2(1.15, 0.52),
      new THREE.Vector2(1.08, 0.54),
      new THREE.Vector2(0.0, 0.44),
    ];
    const iron = surface(rimify(new THREE.MeshStandardMaterial({ color: 0x1a1518, roughness: 0.5, metalness: 0.6 }), 1, 'brazier'), 'iron');
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), iron);
    bowl.position.y = 0.65;
    // four claw feet gripping the bowl
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 12), iron);
      claw.position.set(Math.cos(a) * 1.05, 1.0, Math.sin(a) * 1.05);
      claw.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      claw.castShadow = true;
      this.group.add(claw);
    }
    this.coals = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.5, 0.12) });
    const coals = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), this.coals);
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = BOWL_TOP - 0.02;
    for (const m of [plinth1, plinth2, bowl]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.group.add(coals);

    this.flame = new Flame(2.6, 3.4, 3);
    this.flame.group.position.y = BOWL_TOP - 0.1;
    this.group.add(this.flame.group);

    this.light = new THREE.PointLight(0xff8a3d, 90, 0, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.far = 40;
    this.light.shadow.bias = -0.004;
    this.light.shadow.radius = 3;
    this.group.add(this.light);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.0, 0.42, 0.15), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.halo.scale.set(7, 7, 1);
    this.group.add(this.halo);
    this.group.position.x = x;
  }

  setLit(on: boolean): void {
    this.lit = on;
    this.light.castShadow = on;
  }

  update(dt: number, t: number, glow: Particles, smoke: Particles, camera: THREE.Camera): void {
    const s = this.lit ? this.strength : 0;
    const x = this.group.position.x;
    const fl = 0.86 + 0.08 * Math.sin(t * 17.3) + 0.06 * Math.sin(t * 7.1 + 1.3) + 0.05 * Math.sin(t * 31.7);
    const top = this.flameTop;
    this.light.position.set(Math.sin(t * 9.1) * 0.08, Math.max(BOWL_TOP + 0.4, top - 0.25) + Math.sin(t * 13) * 0.05, 0.25);
    this.light.intensity = s > 0.01 ? (30 + 120 * s) * fl : 0;
    this.light.visible = s > 0.01;
    this.halo.position.set(0, BOWL_TOP + (top - BOWL_TOP) * 0.45, -0.6); // behind the lane: never washes over figures
    const hs = (3 + 5.5 * s) * fl;
    this.halo.scale.set(hs, hs * 1.15, 1);
    (this.halo.material as THREE.SpriteMaterial).opacity = s > 0.01 ? 0.18 + 0.14 * s : 0;
    this.coals.color.setRGB(0.2 + 1.6 * Math.max(s, 0.05), 0.04 + 0.46 * s, 0.01 + 0.11 * s);

    // shader flame scales with the fire's height
    this.flame.strength = s * Math.min(1.25, (top - BOWL_TOP) / 1.55) * fl;
    this.flame.update(t, camera);

    if (s > 0.02) {
      // sparks off the flame body and embers lifting into the night
      if (Math.random() < 0.5 + 0.5 * s) {
        glow.emit({
          x: x + (Math.random() - 0.5) * 1.2, y: BOWL_TOP + 0.4 + Math.random() * (top - BOWL_TOP), z: (Math.random() - 0.5) * 0.8,
          vx: (Math.random() - 0.5) * 1.4, vy: 1.8 + Math.random() * 2.4, spread: 0.2,
          life: 2.2, size: 0.08, sizeEnd: 0.02, r: 5, g: 2.0, b: 0.45, gravity: -0.5, drag: 0.4, wobble: 0.8,
        });
      }
      // a dark smoke column rising out of the fire into the sky
      if (Math.random() < dt * 14 * s) {
        smoke.emit({
          x: x + (Math.random() - 0.5) * 0.5, y: top + 0.8, z: (Math.random() - 0.5) * 0.5,
          vx: 0.25, vy: 1.4, spread: 0.2, life: 4, size: 1.2, sizeEnd: 3.4, r: 0.05, g: 0.04, b: 0.06, alpha: 0.32, drag: 0.15,
        });
      }
    } else if (Math.random() < dt * 6) {
      // dead hearth: thin grey smoke from the ashes
      smoke.emit({ x: x + (Math.random() - 0.5) * 1.2, y: BOWL_TOP + 0.1, vy: 0.5, spread: 0.15, life: 3, size: 0.5, sizeEnd: 1.4, r: 0.05, g: 0.045, b: 0.055, alpha: 0.3, drag: 0.2, wobble: 0.2 });
    }
  }
}
