import * as THREE from 'three';
import { glowTexture } from './textures';

// Contact shadows: a soft dark pool on whatever surface is under each body. The fire's real shadows fall away
// from the light; these keep feet on the ground everywhere, even in the torch's own glare. They shrink and fade as
// the body rises off the ground.

export interface BlobSpec {
  x: number;
  y: number; // body height (feet)
  z: number;
  floor: number; // surface height under it
  r: number; // radius on the ground
  a?: number; // 0..1 opacity scale
}

const MAT = new THREE.MeshBasicMaterial({
  color: 0x000000,
  alphaMap: glowTexture(),
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

export class Blobs {
  readonly group = new THREE.Group();
  private pool: THREE.Mesh[] = [];
  private geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  update(items: readonly BlobSpec[]): void {
    while (this.pool.length < items.length) {
      const m = new THREE.Mesh(this.geo, MAT.clone());
      m.renderOrder = 1;
      this.pool.push(m);
      this.group.add(m);
    }
    this.pool.forEach((m, i) => {
      const it = items[i];
      m.visible = !!it;
      if (!it) return;
      const lift = Math.max(0, it.y - it.floor);
      const k = 1 / (1 + lift * 0.6);
      m.position.set(it.x, it.floor + 0.02, it.z);
      m.scale.setScalar(it.r * 2.6 * (0.6 + 0.4 * k));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.75 * k * (it.a ?? 1);
    });
  }
}
