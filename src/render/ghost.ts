import * as THREE from 'three';
import { FROZEN_LAYER, OWNER_LAYER } from './frozenShadows';

/** A tube along a curve that tapers to a point: horns. */
function horn(points: THREE.Vector3[], r: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const tub = 24;
  const rad = 12;
  const g = new THREE.TubeGeometry(curve, tub, r, rad, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    curve.getPointAt(i / tub, c);
    const s = 1 - (i / tub) * 0.95;
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      p.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(s).add(c);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  g.computeVertexNormals();
  return g;
}


// The ownerless shadow. Nothing in the world is ever seen standing here: this figure lives only on the still-shadow
// layer, so all anyone sees is its shadow, cast west by the dawn that never came. It has his horns, his pauldrons,
// his cape. It stands where he is going to stand: in the heart of the hearth, at the brazier he has not lit yet,
// in the gate at dawn. Its pose is what he will be doing there.

export type GhostPose = 'stand' | 'reach' | 'open' | 'light';

const MAT = new THREE.MeshBasicMaterial({ color: 0x000000 });

function part(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, MAT);
  m.position.set(x, y, z);
  return m;
}

export class Ghost {
  readonly root = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private chest = new THREE.Group();

  constructor() {
    // legs, hips, a cape that falls to the knees
    for (const z of [0.16, -0.16]) this.root.add(part(new THREE.CapsuleGeometry(0.11, 0.8, 4, 8), 0, 0.5, z));
    this.root.add(part(new THREE.CylinderGeometry(0.3, 0.38, 0.4, 12), 0, 1.05, 0));
    const cape = part(new THREE.BoxGeometry(0.06, 1.3, 0.86), -0.28, 0.95, 0);
    cape.rotation.z = -0.12;
    this.root.add(cape);
    // chest, pauldrons, head with the long swept horns
    this.chest.position.y = 1.2;
    this.root.add(this.chest);
    const torso = part(new THREE.CapsuleGeometry(0.3, 0.42, 4, 10), 0, 0.32, 0);
    torso.scale.z = 1.25;
    this.chest.add(torso);
    for (const z of [0.38, -0.38]) {
      const p = part(new THREE.SphereGeometry(0.25, 12, 8), -0.03, 0.66, z);
      p.scale.set(1.2, 0.85, 1);
      this.chest.add(p);
    }
    const head = new THREE.Group();
    head.position.set(0.03, 0.9, 0);
    this.chest.add(head);
    head.add(part(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 14), 0, 0.12, 0));
    head.add(part(new THREE.ConeGeometry(0.155, 0.22, 14), 0, 0.44, 0));
    for (const s of [1, -1])
      head.add(
        part(
          horn([new THREE.Vector3(0, 0.25, 0.12 * s), new THREE.Vector3(-0.12, 0.45, 0.22 * s), new THREE.Vector3(-0.42, 0.62, 0.26 * s), new THREE.Vector3(-0.78, 0.58, 0.2 * s), new THREE.Vector3(-1.02, 0.72, 0.14 * s)], 0.065),
        ),
      );
    // arms: pivots at the shoulders; they hang along -y and swing out sideways (about x) or forward (about z)
    for (const [arm, z] of [[this.armL, 0.46], [this.armR, -0.46]] as const) {
      arm.position.set(0, 0.62, z);
      const limb = part(new THREE.CapsuleGeometry(0.08, 0.78, 4, 8), 0, -0.47, 0);
      arm.add(limb);
      arm.add(part(new THREE.SphereGeometry(0.1, 8, 6), 0, -0.92, 0));
      this.chest.add(arm);
    }
    this.root.traverse((o) => {
      o.layers.set(FROZEN_LAYER); // only the still-shadow bakes ever see it
      o.layers.enable(OWNER_LAYER);
      (o as THREE.Mesh).castShadow = false;
    });
    this.root.visible = false;
    this.pose('stand');
  }

  /** Where it stands (feet), which way it faces (yaw: 0 = +x), and whether it is there at all. */
  place(x: number, y: number, z: number, yaw: number, pose: GhostPose): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = -yaw;
    this.pose(pose);
    this.root.visible = true;
    this.root.updateMatrixWorld(true);
  }

  hide(): void {
    this.root.visible = false;
  }

  private pose(p: GhostPose): void {
    // sideways spread is a rotation about the facing axis (x); a forward reach is about z
    const set = (a: THREE.Group, side: number, out: number, fwd: number) => {
      a.rotation.set(side * out, 0, fwd);
    };
    this.chest.rotation.set(0, 0, 0);
    if (p === 'stand') {
      set(this.armL, -1, 0.12, 0);
      set(this.armR, 1, 0.12, 0);
    } else if (p === 'reach') {
      set(this.armL, -1, 0.15, 0);
      set(this.armR, 1, 0.25, 1.9); // one hand up and forward, toward the fire
    } else if (p === 'open') {
      // arms wide and lifted, head back: standing in the fire
      set(this.armL, -1, 2.0, 0);
      set(this.armR, 1, 2.0, 0);
      this.chest.rotation.z = 0.12;
    } else {
      // 'light': leaning in, the torch hand held out low toward a brazier
      set(this.armL, -1, 0.2, 0);
      set(this.armR, 1, 0.2, 1.15);
      this.chest.rotation.z = -0.18;
    }
  }
}
