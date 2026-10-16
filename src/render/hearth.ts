import * as THREE from 'three';
import type { Particles } from './particles';

/** Radial-gradient texture for halos (generated once). */
export function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BOWL_TOP = 1.15;

export class Hearth {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private halo: THREE.Sprite;
  private flicker = 0;
  strength = 1; // 0..1, from hearth hp
  flameTop = 2.7; // sim light height

  constructor(x: number) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x241e26, roughness: 0.85 });
    const plinth1 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.35, 2.2), stone);
    plinth1.position.y = 0.175;
    const plinth2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.7), stone);
    plinth2.position.y = 0.5;
    const pts = [
      new THREE.Vector2(0.0, 0),
      new THREE.Vector2(0.35, 0),
      new THREE.Vector2(0.3, 0.12),
      new THREE.Vector2(0.45, 0.3),
      new THREE.Vector2(0.95, 0.42),
      new THREE.Vector2(1.1, 0.5),
      new THREE.Vector2(1.05, 0.52),
      new THREE.Vector2(0.0, 0.42),
    ];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: 0x1a1518, roughness: 0.6, metalness: 0.4 }));
    bowl.position.y = 0.65;
    // glowing coals
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.5, 0.12) }));
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = BOWL_TOP - 0.02;
    for (const m of [plinth1, plinth2, bowl]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.group.add(coals);

    this.light = new THREE.PointLight(0xff8a3d, 90, 0, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
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

  update(dt: number, t: number, p: Particles, embers: Particles): void {
    const s = this.strength;
    const x = this.group.position.x;
    this.flicker += dt;
    const fl = 0.86 + 0.08 * Math.sin(t * 17.3) + 0.06 * Math.sin(t * 7.1 + 1.3) + 0.05 * Math.sin(t * 31.7);
    const top = this.flameTop;
    this.light.position.set(Math.sin(t * 9.1) * 0.08, top - 0.25 + Math.sin(t * 13) * 0.05, 0.25);
    this.light.intensity = (35 + 110 * s) * fl;
    this.halo.position.set(0, BOWL_TOP + (top - BOWL_TOP) * 0.45, 0.3);
    const hs = (4.5 + 4 * s) * fl;
    this.halo.scale.set(hs, hs * 1.15, 1);
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.22 + 0.12 * s;

    // flame body: many short-lived additive puffs rising and narrowing
    const h = top - BOWL_TOP;
    const n = Math.round((4 + 7 * s) * Math.min(2, dt * 60));
    for (let i = 0; i < n; i++) {
      const r = (Math.random() - 0.5) * 1.5 * (0.6 + 0.4 * s);
      const hot = Math.random();
      p.emit({
        x: x + r, y: BOWL_TOP + 0.05, z: (Math.random() - 0.5) * 0.9,
        vx: -r * 0.9, vy: (2.2 + 2.2 * s) * (0.7 + h * 0.25), spread: 0.25,
        life: 0.42 + 0.3 * s, size: 0.7 + 0.5 * s, sizeEnd: 0.1,
        r: 1.5 + hot * 0.9, g: 0.42 + hot * 0.55, b: 0.08 + hot * 0.1, alpha: 0.55, gravity: -1.5, drag: 0.8,
      });
    }
    if (Math.random() < 0.35 + 0.4 * s) {
      embers.emit({
        x: x + (Math.random() - 0.5) * 1.2, y: top - 0.2, z: (Math.random() - 0.5),
        vx: (Math.random() - 0.5) * 1.2, vy: 1.6 + Math.random() * 2, spread: 0.2,
        life: 2.4, size: 0.09, sizeEnd: 0.03, r: 5, g: 2.2, b: 0.5, gravity: -0.4, drag: 0.4, wobble: 0.7,
      });
    }
  }
}
