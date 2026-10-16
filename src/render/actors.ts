// The knight (primitive silhouette with a live cape) and the shades (instanced, smoke-bodied, ember-eyed).

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Knight, Shade } from '../sim/world';

/** Standard material with a cold rim term so black silhouettes still read against black. */
function rimMaterial(color: string, rim: THREE.Color, rough = 0.55, metal = 0.35): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const uRim = { value: rim };
  const uFlash = { value: 0 };
  m.userData.uRim = uRim;
  m.userData.uFlash = uFlash;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = uRim;
    sh.uniforms.uFlash = uFlash;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uFlash;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), -normal) * -1.0, 0.0, 1.0), 3.0);
         totalEmissiveRadiance += uRim * fr + vec3(uFlash * 2.5, uFlash * 2.0, uFlash * 1.6);`,
      );
  };
  return m;
}

export class KnightView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armR = new THREE.Group();
  private armL = new THREE.Group();
  private cape: THREE.Mesh;
  private capeBase: Float32Array;
  readonly torchTip = new THREE.Object3D();
  readonly swordTip = new THREE.Object3D();
  private torch: THREE.Group;
  readonly mat: THREE.MeshStandardMaterial;
  private visor: THREE.MeshBasicMaterial;
  private t = 0;
  private swingT = 0;
  private swingStep = 0;
  private lastState = '';
  private dissolve = 0;

  constructor() {
    const rim = new THREE.Color(0.06, 0.055, 0.1);
    const mat = (this.mat = rimMaterial('#0d0c11', rim));
    const cloth = rimMaterial('#060508', new THREE.Color(0.03, 0.02, 0.05), 0.95, 0);
    const add = (geo: THREE.BufferGeometry, parent: THREE.Object3D, x: number, y: number, z: number, m = mat) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    this.root.add(this.body);
    // legs
    const legGeo = new THREE.BoxGeometry(0.17, 0.85, 0.2);
    legGeo.translate(0, -0.42, 0);
    this.legL = add(legGeo, this.body, -0.13, 0.86, 0);
    this.legR = add(legGeo, this.body, 0.13, 0.86, 0);
    // torso: narrow waist, broad chest
    add(new THREE.CylinderGeometry(0.33, 0.2, 0.72, 8), this.body, 0, 1.22, 0);
    add(new THREE.CylinderGeometry(0.24, 0.28, 0.22, 8), this.body, 0, 0.82, 0); // tasset
    // pauldrons
    const pg = new THREE.SphereGeometry(0.2, 8, 6);
    pg.scale(1.1, 0.7, 1);
    add(pg, this.body, -0.36, 1.52, 0);
    add(pg, this.body, 0.36, 1.52, 0);
    // helm: tall, narrow, with two swept horns
    add(new THREE.CylinderGeometry(0.15, 0.17, 0.34, 8), this.body, 0, 1.78, 0);
    const crown = new THREE.ConeGeometry(0.15, 0.16, 8);
    add(crown, this.body, 0, 2.02, 0);
    const hornGeo = new THREE.ConeGeometry(0.045, 0.55, 5);
    hornGeo.translate(0, 0.27, 0);
    const hl = add(hornGeo, this.body, -0.12, 1.88, -0.02);
    hl.rotation.set(-0.5, 0, 0.55);
    const hr = add(hornGeo, this.body, 0.12, 1.88, -0.02);
    hr.rotation.set(-0.5, 0, -0.55);
    // visor slit: the only light he carries before midnight
    this.visor = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.55) });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.02), this.visor);
    visor.position.set(0, 1.8, 0.165);
    this.body.add(visor);

    // sword arm (right)
    this.armR.position.set(0.4, 1.48, 0);
    this.body.add(this.armR);
    const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.13);
    armGeo.translate(0, -0.3, 0);
    add(armGeo, this.armR, 0, 0, 0);
    const sword = new THREE.Group();
    sword.position.set(0, -0.58, 0.04);
    sword.rotation.x = Math.PI / 2;
    this.armR.add(sword);
    const blade = new THREE.BoxGeometry(0.06, 1.45, 0.018);
    blade.translate(0, 0.86, 0);
    add(blade, sword, 0, 0, 0, rimMaterial('#1a1a22', new THREE.Color(0.12, 0.12, 0.16), 0.25, 0.9));
    add(new THREE.BoxGeometry(0.34, 0.05, 0.06), sword, 0, 0.12, 0);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), sword, 0, 0, 0);
    this.swordTip.position.set(0, 1.55, 0);
    sword.add(this.swordTip);

    // off arm (left): carries the torch after midnight
    this.armL.position.set(-0.4, 1.48, 0);
    this.body.add(this.armL);
    add(armGeo, this.armL, 0, 0, 0);
    this.torch = new THREE.Group();
    this.torch.position.set(0, -0.55, 0.05);
    this.armL.add(this.torch);
    const stick = new THREE.CylinderGeometry(0.035, 0.03, 0.75, 6);
    stick.translate(0, 0.2, 0);
    add(stick, this.torch, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.07, 0.05, 0.14, 6), this.torch, 0, 0.58, 0);
    this.torchTip.position.set(0, 0.7, 0);
    this.torch.add(this.torchTip);
    this.torch.visible = false;

    // cape: a cloth sheet hung from the shoulders, simulated with a cheap wave
    const capeGeo = new THREE.PlaneGeometry(0.78, 1.5, 4, 10);
    capeGeo.translate(0, -0.75, 0);
    this.capeBase = (capeGeo.attributes.position.array as Float32Array).slice();
    this.cape = new THREE.Mesh(capeGeo, cloth);
    (this.cape.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    this.cape.position.set(0, 1.58, -0.24);
    this.cape.castShadow = true;
    this.body.add(this.cape);
  }

  setTorch(on: boolean): void {
    this.torch.visible = on;
  }

  setDissolve(v: number): void {
    this.dissolve = v;
  }

  update(k: Knight, dt: number, torch: boolean): void {
    this.t += dt;
    const r = this.root;
    r.position.set(k.x, 0, k.z);
    // smooth yaw
    let d = k.facing - r.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.rotation.y += d * Math.min(1, dt * 22);
    this.setTorch(torch);

    const mv = k.moving;
    const walk = this.t * 11;
    const swing = Math.sin(walk) * 0.65 * mv;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.body.position.y = Math.abs(Math.sin(walk)) * 0.06 * mv;
    // lean into motion (local forward)
    const lean = Math.min(0.25, mv * 0.18);
    this.body.rotation.x = lean;

    // attacks
    if (k.state === 'attack' && (this.lastState !== 'attack' || k.step !== this.swingStep)) {
      this.swingT = 0;
      this.swingStep = k.step;
    }
    this.lastState = k.state;
    this.swingT += dt;
    if (k.state === 'attack') {
      const c = CONFIG.knight.combo[k.step];
      const total = c.windup + c.active + 0.12;
      const p = Math.min(1, this.swingT / total);
      const e = 1 - Math.pow(1 - p, 3);
      // alternate swing directions: right-to-left, left-to-right, overhead
      if (k.step === 2) {
        this.armR.rotation.set(-2.6 + e * 3.6, 0, -0.2);
      } else {
        const dir = k.step === 0 ? 1 : -1;
        this.armR.rotation.set(-1.45, dir * (1.4 - e * 2.8), 0);
      }
      this.body.rotation.y = (k.step === 1 ? -1 : 1) * (0.35 - e * 0.7) * (k.step === 2 ? 0 : 1);
    } else if (k.state === 'dash') {
      this.armR.rotation.set(0.9, 0, 0.2);
      this.body.rotation.x = 0.5;
    } else {
      this.armR.rotation.set(-0.15 - Math.sin(walk) * 0.25 * mv, 0, 0.12);
      this.body.rotation.y *= 0.8;
    }
    this.armL.rotation.set(torch ? -1.25 : -0.1 + Math.sin(walk) * 0.25 * mv, 0, torch ? 0.2 : -0.12);

    // stretch on dash, squash on hurt
    const sq = k.state === 'dash' ? 1.12 : k.state === 'hurt' ? 0.9 : 1;
    r.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

    // flash while invulnerable after a hit
    const flash = k.state === 'hurt' ? 1 - k.stateT / 0.22 : 0;
    this.mat.userData.uFlash.value = Math.max(0, flash) * 0.6;
    r.visible = !(k.invuln > 0 && k.state !== 'dash' && Math.floor(this.t * 20) % 2 === 0 && k.invuln < 0.7);

    // death: he folds to one knee and sinks
    if (k.state === 'dead') {
      const p = Math.min(1, k.stateT / 1.2);
      this.body.rotation.x = p * 0.9;
      this.body.position.y = -p * 0.7;
      r.visible = true;
    }
    if (this.dissolve > 0) {
      const p = this.dissolve;
      r.scale.set(1 - p * 0.3, 1 - p * 0.6, 1 - p * 0.3);
      this.visor.color.setRGB(2.2 + p * 8, 1.3 + p * 5, 0.55 + p * 2);
    }

    // cape: sways with time, trails behind motion
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.capeBase;
    const speed = Math.hypot(k.vx, k.vz);
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const hang = -y / 1.5; // 0 at shoulders, 1 at hem
      const wave = Math.sin(this.t * 3.2 + hang * 4 + x * 3) * 0.06 * hang;
      const trail = -Math.min(0.9, speed * 0.09) * hang * hang;
      pos.setXYZ(i, x * (1 + hang * 0.25), y + Math.abs(trail) * 0.35 * hang, wave + trail);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}

/** All shades in two instanced draws: bodies and eyes. */
export class ShadesView {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private max: number;

  constructor(max = 64) {
    this.max = max;
    // a hunched, hooded form: wide hem, bent back, small head
    const profile: THREE.Vector2[] = [];
    const pts = [
      [0.0, 0.0],
      [0.55, 0.02],
      [0.5, 0.25],
      [0.42, 0.6],
      [0.34, 0.95],
      [0.3, 1.12],
      [0.26, 1.28],
      [0.16, 1.42],
      [0.0, 1.48],
    ];
    for (const [x, y] of pts) profile.push(new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(profile, 10);
    // hunch forward and fray the hem
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setZ(i, p.getZ(i) + Math.pow(y / 1.48, 2) * 0.42);
      if (y < 0.05) p.setY(i, y - 0.08 * (0.5 + 0.5 * Math.sin(a * 5)));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 1, metalness: 0, transparent: false });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
         #ifdef USE_INSTANCING_COLOR
           totalEmissiveRadiance += vColor * (0.25 + fr * 1.6);
         #endif`,
      );
      // body colour stays black: instance colour only feeds the glow
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '');
    };
    this.bodies = new THREE.InstancedMesh(geo, mat, max);
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.bodies.count = 0;
    this.bodies.frustumCulled = false;
    this.group.add(this.bodies);

    const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
    eyeGeo.scale(1.5, 0.7, 1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.eyes = new THREE.InstancedMesh(eyeGeo, eyeMat, max * 2);
    this.eyes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 6), 3);
    this.eyes.count = 0;
    this.eyes.frustumCulled = false;
    this.group.add(this.eyes);
  }

  update(shades: Shade[], time: number): void {
    const d = this.dummy;
    let n = 0;
    let e = 0;
    for (const s of shades) {
      if (n >= this.max) break;
      const K = CONFIG.kinds[s.kind];
      let sc = K.scale;
      let y = 0;
      let sy = 1;
      let lean = 0;
      let alpha = 1;
      if (s.state === 'rise') {
        const p = Math.min(1, s.stateT / (s.kind === 'boss' ? 2.2 : CONFIG.shade.riseTime));
        y = -(1 - p) * 1.4 * sc;
        sy = 0.4 + 0.6 * p;
      } else if (s.state === 'dead') {
        const p = Math.min(1, s.deadT / 0.5);
        if (p >= 1) continue;
        sy = 1 - p;
        sc *= 1 + p * 0.3;
        alpha = 1 - p;
      }
      const bob = Math.sin(time * 5 + s.seed * 30) * 0.05;
      if (s.state === 'windup') {
        const p = Math.min(1, s.stateT / CONFIG.shade.windup);
        lean = -0.35 * p; // rear back
        sy *= 1 + 0.18 * p;
      } else if (s.state === 'strike') lean = 0.55;
      else if (s.state === 'move') lean = 0.18;
      else if (s.state === 'feed') lean = 0.4 + Math.sin(time * 14 + s.seed * 9) * 0.12;
      d.position.set(s.x, y + bob * sc, s.z);
      d.rotation.set(lean, s.facing, 0, 'YXZ');
      const wob = 1 + Math.sin(time * 9 + s.seed * 50) * 0.04;
      d.scale.set(sc * wob, sc * sy, sc / wob);
      d.updateMatrix();
      this.bodies.setMatrixAt(n, d.matrix);
      // glow: violet-black rim normally, fire when burning, white on hit
      const burn = s.burn;
      const fl = s.flash;
      this.col.setRGB(
        0.03 + burn * 2.6 * (0.7 + 0.3 * Math.sin(time * 30 + s.seed * 7)) + fl * 3,
        0.02 + burn * 0.7 + fl * 2.6,
        0.06 + burn * 0.1 + fl * 2.2,
      );
      this.col.multiplyScalar(alpha);
      this.bodies.setColorAt(n, this.col);
      n++;
      // eyes: two embers in the hood; they flare during a wind-up
      const headY = y + 1.3 * sc * sy;
      const fw = 0.3 * sc;
      const intensity = (s.state === 'windup' ? 4 + Math.min(1, s.stateT / 0.4) * 6 : 2.6) * alpha;
      for (const side of [-1, 1]) {
        const ox = Math.cos(s.facing) * side * 0.09 * sc;
        const oz = -Math.sin(s.facing) * side * 0.09 * sc;
        d.position.set(s.x + Math.sin(s.facing) * fw + ox, headY, s.z + Math.cos(s.facing) * fw + oz);
        d.rotation.set(0, s.facing, 0);
        d.scale.setScalar(sc * (s.kind === 'boss' ? 0.8 : 1));
        d.updateMatrix();
        this.eyes.setMatrixAt(e, d.matrix);
        this.col.setRGB(intensity, intensity * 0.22, intensity * 0.05);
        this.eyes.setColorAt(e, this.col);
        e++;
      }
    }
    this.bodies.count = n;
    this.eyes.count = e;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.eyes.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.eyes.instanceColor) this.eyes.instanceColor.needsUpdate = true;
  }
}
