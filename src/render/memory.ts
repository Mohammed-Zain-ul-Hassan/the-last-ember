import * as THREE from 'three';
import { Flame } from './flame';
import type { Particles } from './particles';
import { glowTexture } from './textures';

// Memories, played between the hours as shadow-puppet theatre: black silhouettes against the warm light the past
// was lit by. One small stage far below the world (nothing else is in frame), jointed figures, a real flame,
// and a short script per memory. The camera is driven from here while a memory plays.

const Y0 = -400; // the stage floor, far under the level
export const MEMORY_TIME = 7.5;

const INK = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });

// ---------------------------------------------------------------- figures
type Kind = 'knight' | 'man' | 'woman' | 'child' | 'elder' | 'king' | 'guard' | 'shade';

interface Pose {
  y: number; // root drop (kneel, sit)
  lean: number; // body forward (+) / back (-)
  head: number; // nod down (+)
  aF: number; // front shoulder: + raises forward
  eF: number;
  aB: number; // back shoulder
  eB: number;
  lF: number; // front hip: + swings the thigh forward
  kF: number; // front knee: - bends the shin back
  lB: number;
  kB: number;
}
const STAND: Pose = { y: 0, lean: 0, head: 0, aF: 0.1, eF: 0.2, aB: -0.1, eB: 0.2, lF: 0.05, kF: -0.05, lB: -0.05, kB: -0.05 };

class Figure {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private headG = new THREE.Group();
  private arms: { sh: THREE.Group; el: THREE.Group }[] = [];
  private legs: { hip: THREE.Group; kn: THREE.Group }[] = [];
  readonly hand = new THREE.Group(); // front hand: swords, staffs
  pose: Pose = { ...STAND };
  readonly kind: Kind;

  constructor(kind: Kind, x: number, facing: 1 | -1, h = 1.8) {
    this.kind = kind;
    const s = h / 1.8;
    const robed = kind === 'woman' || kind === 'elder' || kind === 'king' || kind === 'shade';
    this.root.position.set(x, Y0, 0);
    this.root.scale.set(facing * s, s, s);
    this.hips.position.y = 0.92;
    this.root.add(this.hips);
    this.hips.add(this.chest);
    // torso: a lathed body, narrow at the waist, broad in the chest, rounding into the shoulders
    const female = kind === 'woman';
    const chestR = kind === 'child' ? 0.15 : female ? 0.15 : kind === 'shade' ? 0.17 : 0.19;
    const torso = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, -0.02], [0.14, 0], [0.155, 0.12], [0.13, 0.28], [chestR * 0.95, 0.44], [chestR, 0.52], [chestR * 0.8, 0.6], [0.06, 0.66], [0, 0.68]].map(
          ([r, y]) => new THREE.Vector2(r, y),
        ),
        20,
      ),
      INK,
    );
    torso.scale.z = 0.7;
    this.chest.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 8), INK);
    neck.position.y = 0.68;
    this.chest.add(neck);
    // head, in profile: a nose and a chin make it a face
    this.headG.position.y = 0.7;
    this.chest.add(this.headG);
    const hr = kind === 'child' ? 0.14 : 0.115;
    const head = new THREE.Mesh(new THREE.SphereGeometry(hr, 18, 14), INK);
    head.scale.set(1.05, 1.12, 1);
    head.position.y = hr * 0.9;
    this.headG.add(head);
    const armored = kind === 'knight' || kind === 'guard';
    if (!armored && kind !== 'shade') {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), INK);
      nose.rotation.z = -Math.PI / 2;
      nose.position.set(hr + 0.02, hr * 0.9, 0);
      this.headG.add(nose);
      const chin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), INK);
      chin.position.set(hr * 0.6, hr * 0.25, 0);
      this.headG.add(chin);
    }
    if (female) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), INK);
      hair.scale.set(1, 1.6, 0.9);
      hair.position.set(-0.08, 0.04, 0);
      this.headG.add(hair);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), INK);
      bun.position.set(-0.13, 0.2, 0);
      this.headG.add(bun);
    }
    if (kind === 'elder') {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), INK);
      beard.rotation.z = Math.PI + 0.3;
      beard.position.set(0.07, -0.02, 0);
      this.headG.add(beard);
    }
    if (armored) {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), INK);
      helm.scale.set(1.1, 1.15, 1);
      helm.position.y = hr * 0.95;
      this.headG.add(helm);
      const visor = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), INK);
      visor.rotation.z = -Math.PI / 2;
      visor.position.set(0.17, hr * 0.8, 0);
      this.headG.add(visor);
      // a plume that sweeps back off the crown
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.02, 0.27, 0), new THREE.Vector3(-0.12, 0.36, 0), new THREE.Vector3(-0.3, 0.3, 0), new THREE.Vector3(-0.42, 0.12, 0), new THREE.Vector3(-0.46, -0.05, 0),
      ]);
      const plume = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, kind === 'knight' ? 0.035 : 0.025, 6), INK);
      this.headG.add(plume);
    }
    if (kind === 'king') {
      for (let i = -1; i <= 1; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 6), INK);
        spike.position.set(i * 0.07, hr * 1.9 + 0.04, 0);
        this.headG.add(spike);
      }
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 14), INK);
      band.position.y = hr * 1.75;
      this.headG.add(band);
    }
    if (kind === 'shade') {
      // a cowl that droops forward over a face that is not there
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), INK);
      hood.scale.set(1.2, 1.3, 1);
      hood.position.set(0.0, 0.1, 0);
      this.headG.add(hood);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 8), INK);
      peak.rotation.z = -1.25;
      peak.position.set(0.19, 0.16, 0);
      this.headG.add(peak);
    }
    // arms: rounded shoulders, tapering limbs, hands
    const limb = (len: number, r: number) => {
      const g = new THREE.CapsuleGeometry(r, len, 4, 10);
      g.translate(0, -len / 2, 0);
      return new THREE.Mesh(g, INK);
    };
    for (const side of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(0.0, 0.56, 0.13 * side);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(armored ? 0.13 : 0.075, 12, 10), INK);
      if (armored) shoulder.scale.set(1, 0.75, 1); // pauldrons
      sh.add(shoulder);
      sh.add(limb(0.28, kind === 'child' ? 0.04 : 0.05));
      const el = new THREE.Group();
      el.position.y = -0.3;
      const fore = kind === 'shade' ? 0.5 : 0.26;
      el.add(limb(fore, kind === 'child' ? 0.035 : 0.042));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), INK);
      hand.position.y = -fore - 0.04;
      el.add(hand);
      if (kind === 'shade') {
        for (let c = -1; c <= 1; c++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.24, 5), INK);
          claw.position.set(c * 0.035, -0.64, 0);
          claw.rotation.z = Math.PI + c * 0.35;
          el.add(claw);
        }
      }
      sh.add(el);
      this.chest.add(sh);
      this.arms.push({ sh, el });
    }
    this.hand.position.y = -0.3;
    this.arms[0].el.add(this.hand);
    // legs, or a robe
    if (robed) {
      const g = new THREE.CylinderGeometry(0.15, kind === 'shade' ? 0.5 : kind === 'king' ? 0.46 : 0.38, 1.0, 20, 3, true);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > -0.45) continue;
        // a hem that flares; the shade's is torn into tatters
        p.setY(i, p.getY(i) - (kind === 'shade' ? (i % 3) * 0.13 : Math.sin(i * 1.7) * 0.02));
      }
      g.translate(0, -0.42, 0);
      const robe = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide }));
      robe.scale.z = 0.7;
      this.hips.add(robe);
    } else {
      if (armored) {
        // a short armoured skirt over the hips
        const tasset = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 14), INK);
        tasset.position.y = -0.06;
        tasset.scale.z = 0.7;
        this.hips.add(tasset);
      }
      for (const side of [1, -1]) {
        const hip = new THREE.Group();
        hip.position.z = 0.08 * side;
        hip.add(limb(0.42, kind === 'child' ? 0.05 : 0.068));
        const kn = new THREE.Group();
        kn.position.y = -0.46;
        kn.add(limb(0.4, kind === 'child' ? 0.042 : 0.055));
        const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.14, 4, 8), INK);
        foot.rotation.z = Math.PI / 2;
        foot.position.set(0.06, -0.47, 0);
        kn.add(foot);
        hip.add(kn);
        this.hips.add(hip);
        this.legs.push({ hip, kn });
      }
    }
    if (kind === 'knight') {
      // the cape: wide at the hem, torn at the end
      const shape = new THREE.Shape();
      shape.moveTo(-0.12, 0);
      shape.lineTo(0.12, 0);
      shape.lineTo(0.3, -1.05);
      for (let i = 0; i <= 6; i++) shape.lineTo(0.3 - (i / 6) * 0.68, -1.05 - (i % 2 ? 0.1 : 0));
      shape.lineTo(-0.12, 0);
      const cape = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide }));
      cape.rotation.z = -0.22;
      cape.position.set(-0.12, 0.62, -0.05);
      this.chest.add(cape);
      this.cape = cape;
    }
  }

  private cape: THREE.Mesh | null = null;

  /** A blade or a staff in the front hand. */
  hold(kind: 'sword' | 'staff' | 'spear'): THREE.Group {
    const g = new THREE.Group();
    if (kind === 'sword') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.02), INK);
      blade.position.y = -0.58;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), INK);
      guard.position.y = -0.06;
      g.add(blade, guard);
    } else {
      const len = kind === 'spear' ? 2.3 : 1.7;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), INK);
      pole.position.y = kind === 'spear' ? 0.55 : 0.2;
      g.add(pole);
      if (kind === 'spear') {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), INK);
        tip.position.y = 0.55 + len / 2 + 0.1;
        g.add(tip);
      }
    }
    this.hand.add(g);
    return g;
  }

  apply(p: Partial<Pose> = {}): void {
    const q = { ...STAND, ...p };
    this.pose = q;
    this.root.position.y = Y0 + q.y * this.root.scale.y;
    this.chest.rotation.z = -q.lean;
    if (this.cape) this.cape.rotation.z = -0.22 - Math.max(0, q.lean) * 0.6 - (q.lF !== STAND.lF && q.y === 0 ? 0.3 : 0);
    this.headG.rotation.z = -q.head;
    const [f, b] = this.arms;
    f.sh.rotation.z = q.aF;
    f.el.rotation.z = q.eF;
    b.sh.rotation.z = q.aB;
    b.el.rotation.z = q.eB;
    if (this.legs.length) {
      this.legs[0].hip.rotation.z = q.lF;
      this.legs[0].kn.rotation.z = q.kF;
      this.legs[1].hip.rotation.z = q.lB;
      this.legs[1].kn.rotation.z = q.kB;
    }
  }
}

const KNEEL: Partial<Pose> = { y: -0.42, lF: 1.45, kF: -1.45, lB: 0.05, kB: -1.5, lean: 0.05 };
const SIT: Partial<Pose> = { y: -0.5, lF: 1.5, kF: -1.2, lB: 1.4, kB: -1.0, lean: 0.1 };
function run(t: number, speed = 9): Partial<Pose> {
  const s = Math.sin(t * speed);
  return { lean: 0.35, lF: s * 0.9, kF: -0.3 - Math.max(0, -s) * 1.2, lB: -s * 0.9, kB: -0.3 - Math.max(0, s) * 1.2, aF: -s * 0.8, aB: s * 0.8, eF: 0.9, eB: 0.9, y: Math.abs(Math.cos(t * speed)) * 0.05 };
}

// ---------------------------------------------------------------- props
function box(w: number, h: number, x: number, y: number, z = 0.4): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), INK);
  m.position.set(x, Y0 + y, z);
  return m;
}
function columnAt(x: number, h = 5.5, z = -0.9): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.3, x, 0.15, z), box(0.55, h - 0.6, x, h / 2, z), box(0.8, 0.3, x, h - 0.15, z));
  return g;
}
function archBetween(x0: number, x1: number, y: number, z = -0.9): THREE.Mesh {
  const r = (x1 - x0) / 2;
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 8, 40, Math.PI), INK);
  m.position.set((x0 + x1) / 2, Y0 + y, z);
  return m;
}
function brazier(x: number): THREE.Group {
  const g = new THREE.Group();
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.75, 0.1), new THREE.Vector2(0.9, 0.42), new THREE.Vector2(0, 0.36)];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), INK);
  bowl.position.y = 0.75;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.8, 10), INK);
  stem.position.y = 0.4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.9), INK);
  base.position.y = 0.09;
  g.add(bowl, stem, base);
  g.position.set(x, Y0, 0.2);
  return g;
}

function backdropTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(256, 170, 6, 256, 170, 300);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.18, '#d8d8d8');
  grd.addColorStop(0.5, '#5a5a5a');
  grd.addColorStop(1, '#141414');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  // paper grain, like a lit screen in a shadow theatre
  const img = g.getImageData(0, 0, 512, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- the five memories
const AMBER = new THREE.Color(1.35, 0.72, 0.32);
const EMBER = new THREE.Color(0.75, 0.22, 0.1);
const COLD = new THREE.Color(0.16, 0.2, 0.42);
const VIOLET = new THREE.Color(0.55, 0.3, 1.25);

interface Script {
  fireX: number;
  cam: (k: number) => { x: number; y: number; dist: number; lookX: number; lookY: number };
  update: (t: number, k: number) => { fire: number; sky: THREE.Color };
}

export class Memories {
  readonly group = new THREE.Group();
  active = -1;
  private t = 0;
  private sets: THREE.Group[] = [];
  private scripts: Script[] = [];
  private backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private flame = new Flame(1.6, 2.4, 3);
  private halo: THREE.Sprite;
  private eyes: THREE.Sprite[] = [];
  private sky = new THREE.Color();

  constructor() {
    this.group.visible = false;
    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 26),
      new THREE.MeshBasicMaterial({ map: backdropTexture(), fog: false, depthWrite: false, toneMapped: true }),
    );
    this.backdrop.position.set(0, Y0 + 5, -5);
    this.backdrop.renderOrder = -5;
    this.group.add(this.backdrop);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 6, 2.4), INK);
    floor.position.set(0, Y0 - 3, 0);
    this.group.add(floor);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.4, 0.6, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.scale.set(5, 5, 1);
    this.group.add(this.halo, this.flame.group);
    for (let i = 0; i < 1; i++) {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(2.4, 2.0, 5), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      e.scale.set(0.15, 0.035, 1);
      e.visible = false;
      this.eyes.push(e);
      this.group.add(e);
    }
    this.build();
  }

  has(i: number): boolean {
    return i >= 0 && i < this.scripts.length;
  }

  show(i: number): void {
    if (!this.has(i)) return;
    this.active = i;
    this.t = 0;
    this.group.visible = true;
    this.sets.forEach((s, j) => (s.visible = j === i));
    const sc = this.scripts[i];
    this.flame.group.position.set(sc.fireX, Y0 + 1.1, 0.25);
    this.halo.position.set(sc.fireX, Y0 + 1.6, -0.5);
    this.backdrop.position.x = sc.fireX;
    for (const e of this.eyes) e.visible = false;
  }

  hide(): void {
    this.active = -1;
    this.group.visible = false;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, glow: Particles, smoke: Particles): void {
    if (this.active < 0) return;
    this.t += dt;
    const sc = this.scripts[this.active];
    const k = Math.min(1, this.t / MEMORY_TIME);
    const { fire, sky } = sc.update(this.t, k);
    this.sky.copy(sky);
    this.backdrop.material.color.copy(this.sky);
    const fl = 0.88 + 0.07 * Math.sin(this.t * 17) + 0.05 * Math.sin(this.t * 7.3);
    this.flame.strength = fire * fl;
    this.flame.update(this.t, camera);
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.5 * fire;
    if (fire > 0.05 && Math.random() < 0.6 * fire)
      glow.emit({ x: sc.fireX + (Math.random() - 0.5) * 0.8, y: Y0 + 1.4 + Math.random() * 1.2, z: 0.3, vx: (Math.random() - 0.5) * 0.8, vy: 1.4 + Math.random() * 1.6, spread: 0.1, life: 2.4, size: 0.06, sizeEnd: 0.015, r: 5, g: 2, b: 0.45, gravity: -0.4, drag: 0.4, wobble: 0.8 });
    // dust drifting through the light
    if (Math.random() < dt * 10)
      glow.emit({ x: sc.fireX + (Math.random() - 0.5) * 12, y: Y0 + Math.random() * 5, z: 1.5, vx: 0.15, vy: 0.05, spread: 0.05, life: 4, size: 0.035, sizeEnd: 0.03, r: 1.2 * this.sky.r, g: 1.2 * this.sky.g, b: 1.2 * this.sky.b, drag: 0, wobble: 0.3 });
    if (this.active === 4 && k > 0.35 && Math.random() < dt * 30 * k)
      smoke.emit({ x: this.eyesX + (Math.random() - 0.5) * 1.6, y: Y0 + Math.random() * 0.4, z: -0.4, vx: (Math.random() - 0.5) * 0.4, vy: 1.6, spread: 0.15, life: 1.4, size: 0.18, sizeEnd: 0.6, r: 0.04, g: 0.01, b: 0.1, alpha: 0.7, drag: 0.4 });
    const c = sc.cam(k);
    camera.position.set(c.x, Y0 + c.y, c.dist);
    camera.lookAt(c.lookX, Y0 + c.lookY, 0);
    if (Math.abs(camera.fov - 34) > 0.01) {
      camera.fov = 34;
      camera.updateProjectionMatrix();
    }
  }

  private eyesX = 0;

  private build(): void {
    const ease = (k: number) => k * k * (3 - 2 * k);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const mix = (a: THREE.Color, b: THREE.Color, k: number) => new THREE.Color().copy(a).lerp(b, Math.max(0, Math.min(1, k)));
    const hall = (set: THREE.Group) => {
      for (const x of [-6.5, -3.6, 3.6, 6.5]) set.add(columnAt(x));
      set.add(archBetween(-6.5, -3.6, 5.2), archBetween(3.6, 6.5, 5.2));
      for (const x of [-5.05, 5.05]) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.8), INK);
        banner.position.set(x, Y0 + 3.6, -0.85);
        set.add(banner);
      }
    };

    // 0 — the oath: a hall full of warm light, the knight kneels, the king's blade touches his shoulder
    {
      const set = new THREE.Group();
      hall(set);
      set.add(brazier(-2.2));
      const knight = new Figure('knight', 0.1, 1);
      const king = new Figure('king', 1.25, -1, 1.85);
      const sword = king.hold('sword');
      sword.rotation.z = 0;
      const guards = [new Figure('guard', -5.2, 1), new Figure('guard', 5.2, -1)];
      for (const g of guards) g.hold('spear').rotation.z = -0.1;
      set.add(knight.root, king.root, ...guards.map((g) => g.root));
      this.sets.push(set);
      this.scripts.push({
        fireX: -2.2,
        cam: (k) => ({ x: lerp(-0.6, 0.2, ease(k)), y: 1.7 - 0.45, dist: lerp(10.5, 8, ease(k)), lookX: lerp(-0.4, 0.4, ease(k)), lookY: 1.45 }),
        update: (t, k) => {
          knight.apply({ ...KNEEL, head: 0.5, aF: 0.2, eF: 0.9, aB: -0.2, lean: 0.12 });
          // the blade rises, then comes down to rest on his shoulder
          const r = ease(Math.min(1, Math.max(0, (k - 0.15) / 0.35)));
          const d = ease(Math.min(1, Math.max(0, (k - 0.55) / 0.3)));
          king.apply({ aF: lerp(0.2, 2.6, r) - d * 1.25, eF: 0.1, aB: -0.1, lean: -0.05 + d * 0.12, head: 0.2 * d });
          for (const g of guards) g.apply({ aF: 0.9, eF: -0.9, head: Math.sin(t * 0.5) * 0.02 });
          return { fire: 1, sky: AMBER };
        },
      });
    }

    // 1 — their faces: the people at the hearth, the knight on guard at the door
    {
      const set = new THREE.Group();
      hall(set);
      set.add(brazier(0));
      set.add(box(0.4, 3.2, 4.4, 1.6, -0.6), box(2.0, 0.4, 5.2, 3.3, -0.6)); // the doorway he keeps
      const people = [
        { f: new Figure('woman', -1.6, 1), p: { ...SIT, aF: 1.1, eF: 1.2 } },
        { f: new Figure('child', -1.0, 1, 1.05), p: { ...SIT, aF: 1.4, eF: 0.4, aB: 1.2, eB: 0.4 } },
        { f: new Figure('man', -2.6, 1), p: { aF: 0.6, eF: 1.4, lean: 0.05 } },
        { f: new Figure('child', 1.0, -1, 0.95), p: { aF: 1.5, eF: 0.3, aB: 1.3, eB: 0.4 } },
        { f: new Figure('elder', 1.85, -1, 1.65), p: { lean: 0.3, head: 0.15, aF: 0.6, eF: -0.4 } },
      ];
      people[4].f.hold('staff');
      const knight = new Figure('knight', 4.0, 1);
      knight.hold('sword');
      set.add(...people.map((q) => q.f.root), knight.root);
      this.sets.push(set);
      this.scripts.push({
        fireX: 0,
        cam: (k) => ({ x: lerp(-1.8, 2.2, ease(k)), y: 1.4 - 0.45, dist: 8.5, lookX: lerp(-1.6, 2.4, ease(k)), lookY: 1.2 }),
        update: (t) => {
          people.forEach((q, i) => q.f.apply({ ...q.p, head: (q.p as Partial<Pose>).head ?? Math.sin(t * 1.3 + i) * 0.06, y: ((q.p as Partial<Pose>).y ?? 0) + Math.sin(t * 2 + i * 1.7) * 0.01 }));
          knight.apply({ aF: 0.15, eF: 0.1, head: -0.05 });
          return { fire: 1, sky: AMBER };
        },
      });
    }

    // 2 — the night the fire went out: he sleeps at his post, the flame sinks, the shadows lean in
    {
      const set = new THREE.Group();
      hall(set);
      set.add(brazier(-1.2), box(0.6, 4.5, 2.4, 2.25, -0.5));
      const knight = new Figure('knight', 1.75, -1);
      const shades = [new Figure('shade', -6.2, 1, 2.0), new Figure('shade', -7.4, 1, 2.2), new Figure('shade', 7.2, -1, 2.1)];
      set.add(knight.root, ...shades.map((s) => s.root));
      this.sets.push(set);
      this.scripts.push({
        fireX: -1.2,
        cam: (k) => ({ x: lerp(0.4, 1.2, ease(k)), y: 1.3 - 0.45, dist: lerp(9, 6.8, ease(k)), lookX: lerp(0.2, 1.0, ease(k)), lookY: 1.0 }),
        update: (t, k) => {
          const nod = ease(Math.min(1, k / 0.45));
          knight.apply({ ...SIT, lean: -0.15 + nod * 0.25, head: 0.15 + nod * 0.55 + Math.sin(t * 0.8) * 0.03, aF: 0.4, eF: 0.8, aB: 0.2, eB: 0.6 });
          const creep = ease(Math.max(0, (k - 0.45) / 0.55));
          shades[0].root.position.x = lerp(-6.2, -3.4, creep);
          shades[1].root.position.x = lerp(-7.4, -4.6, creep);
          shades[2].root.position.x = lerp(7.2, 4.6, creep);
          for (const s of shades) s.apply({ lean: 0.4, aF: 1.0 + Math.sin(t * 3) * 0.15, eF: 0.4, aB: 0.6, head: 0.2 });
          const fire = Math.max(0, 1 - ease(Math.min(1, k / 0.7)));
          return { fire, sky: mix(mix(AMBER, EMBER, k / 0.5), COLD, (k - 0.5) / 0.4) };
        },
      });
    }

    // 3 — the dark came in: the doors give, the people run, he runs too, too late
    {
      const set = new THREE.Group();
      set.add(box(0.7, 5, 1.6, 2.5, -0.9), box(0.7, 5, 4.6, 2.5, -0.9), box(3.7, 0.7, 3.1, 4.8, -0.9));
      const doorL = new THREE.Group();
      doorL.position.set(1.95, Y0, -0.9);
      const dl = box(1.15, 4.2, 0, 2.1, 0);
      dl.position.set(0.575, 2.1, 0);
      doorL.add(dl);
      const doorR = new THREE.Group();
      doorR.position.set(4.25, Y0, -0.9);
      const dr = box(1.15, 4.2, 0, 2.1, 0);
      dr.position.set(-0.575, 2.1, 0);
      doorR.add(dr);
      set.add(doorL, doorR);
      const shades = [0, 1, 2, 3].map((i) => new Figure('shade', 3.1, -1, 1.9 + (i % 2) * 0.3));
      const folk = [new Figure('woman', 0.5, -1), new Figure('child', 0.0, -1, 1.0), new Figure('man', -0.6, -1)];
      const knight = new Figure('knight', -6, 1);
      knight.hold('sword');
      set.add(...shades.map((s) => s.root), ...folk.map((f) => f.root), knight.root);
      this.sets.push(set);
      this.scripts.push({
        fireX: 3.1,
        cam: (k) => ({ x: lerp(-1.5, 0.5, ease(k)), y: 1.6 - 0.45, dist: 10, lookX: lerp(-1.2, 0.8, ease(k)), lookY: 1.5 }),
        update: (t, k) => {
          const open = ease(Math.min(1, k / 0.2));
          doorL.rotation.y = open * 1.35; // they swing inward, away from us
          doorR.rotation.y = -open * 1.35;
          shades.forEach((s, i) => {
            const go = Math.max(0, k - 0.12 - i * 0.08);
            s.root.position.x = 3.1 - go * 7.5;
            s.root.position.z = (i % 2 ? -0.4 : 0.15) + 0;
            s.apply({ lean: 0.5, aF: 1.4 + Math.sin(t * 4 + i) * 0.2, eF: 0.2, aB: 1.0, head: 0.3 });
          });
          folk.forEach((f, i) => {
            f.root.position.x = [0.5, 0.0, -0.6][i] - Math.max(0, k - 0.15) * 7;
            f.apply(f.kind === 'woman' || f.kind === 'elder' ? { lean: 0.3, aF: 1.5, aB: -0.8 } : run(t + i, 11));
          });
          const arrive = Math.min(1, k / 0.55);
          knight.root.position.x = -6.5 + ease(arrive) * 3.2;
          knight.root.position.z = 0.35;
          knight.apply(arrive < 1 ? { ...run(t, 10), aF: 1.3, eF: 0.4 } : { aF: 2.2, eF: 0.3, lF: 0.5, kF: -0.4, lB: -0.4, kB: -0.2, lean: 0.15 });
          return { fire: 0.55 * (1 - k * 0.6), sky: mix(EMBER, COLD, k * 0.7) };
        },
      });
    }

    // 4 — you became what took them: alone in the ruin, the shadow takes him
    {
      const set = new THREE.Group();
      set.add(columnAt(-4.8, 3.5), columnAt(4.4, 2.2), box(1.4, 0.6, -2.5, 0.3, -0.6), box(0.9, 0.4, 2.6, 0.2, -0.6));
      const knight = new Figure('knight', 0, 1);
      knight.hold('sword');
      set.add(knight.root);
      this.eyesX = 0;
      this.sets.push(set);
      this.scripts.push({
        fireX: -3.4,
        cam: (k) => ({ x: lerp(0.6, 0.15, ease(k)), y: lerp(1.6, 1.75, k) - 0.45, dist: lerp(8.5, 4.6, ease(k)), lookX: 0.1, lookY: lerp(1.3, 1.55, k) }),
        update: (t, k) => {
          const rise = ease(Math.max(0, (k - 0.3) / 0.6));
          knight.apply({ lean: 0.35 - rise * 0.4, head: 0.7 - rise * 0.75, aF: 0.05 + rise * 0.1, eF: 0.1, aB: -0.1, y: Math.sin(t * 1.5) * 0.01 });
          // his eyes open, cold and pale
          const on = k > 0.72;
          this.eyes.forEach((e, i) => {
            e.visible = on;
            e.position.set(0.11 + i * 0.012, Y0 + 1.68 - (1 - rise) * 0.3, 0.3 - i * 0.02);
            (e.material as THREE.SpriteMaterial).opacity = Math.min(1, (k - 0.72) * 8);
          });
          return { fire: Math.max(0, 0.4 - k * 0.5), sky: mix(EMBER, VIOLET, ease(Math.max(0, (k - 0.25) / 0.6))) };
        },
      });
    }
    for (const s of this.sets) this.group.add(s);
  }
}
