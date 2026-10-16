// ?demo=1 autoplay: plays well enough (and showily enough) to record trailer footage.

import { CONFIG } from '../config';
import type { Input, Shade, World } from './world';

export class Bot {
  private atkT = 0;
  private flareWait = 0;
  private orbit = 0;
  /** which dawn ending the demo walks toward */
  choice: 'light' | 'shadow';
  private hide: { x: number; z: number } | null = null;

  constructor(seed: number) {
    this.choice = seed % 2 === 0 ? 'light' : 'shadow';
  }

  think(w: World, dt: number): Input {
    const k = w.knight;
    this.atkT -= dt;
    this.flareWait -= dt;
    this.orbit += dt * 0.4;
    const out: Input = { mx: 0, mz: 0, aimX: k.x + Math.sin(k.facing), aimZ: k.z + Math.cos(k.facing), attack: false, dash: false, flare: false };
    const alive = w.shades.filter((s) => s.state !== 'dead' && s.state !== 'rise');
    const hearth = w.mode === 'hearth';

    // dawn: walk to the chosen fate once the sun is up
    if (w.mode === 'dawn' && w.dawnT >= 0) {
      if (this.choice === 'light') {
        const q = w.query();
        // head west, where the sun reaches first
        const tx = -22;
        const tz = -2;
        void q;
        return this.moveTo(out, k, tx, tz, 0.55);
      }
      if (!this.hide) {
        // the tallest stone's sun-shadow, just behind it (west of it)
        let best = w.props[0];
        for (const p of w.props) if (p.kind === 'stone' && p.h > best.h && p.x > 0) best = p;
        this.hide = { x: best.x - w.sun.dx * 1.4, z: best.z - w.sun.dz * 1.4 };
      }
      return this.moveTo(out, k, this.hide.x, this.hide.z, 0.8);
    }

    // pick a target: shades nearest the flame first
    const gx = hearth ? 0 : k.x;
    const gz = hearth ? 0 : k.z;
    let target: Shade | null = null;
    let best = Infinity;
    for (const s of alive) {
      const dFlame = Math.hypot(s.x - gx, s.z - gz);
      const dMe = Math.hypot(s.x - k.x, s.z - k.z);
      let score = (hearth ? dFlame * 1.2 : 0) + dMe;
      if (s.state === 'feed') score -= 8;
      if (s.kind === 'boss') score -= s.lit ? 12 : -4;
      if (score < best) {
        best = score;
        target = s;
      }
    }

    // flare when it will catch a crowd, or the hearth is being fed on
    const near = alive.filter((s) => Math.hypot(s.x - w.fire.x, s.z - w.fire.z) < w.fire.r * 1.25 && !s.lit).length;
    const feeding = alive.filter((s) => s.state === 'feed').length;
    const res = hearth ? w.fuel : w.torchEmbers;
    if (this.flareWait <= 0 && w.flareCd <= 0 && res > CONFIG.flare.cost + 10 && (near >= 4 || feeding >= 2 || (w.boss && w.boss.state !== 'dead' && near >= 1))) {
      out.flare = true;
      this.flareWait = 2.5;
    }

    // dodge a strike when hurt
    const threat = alive.find((s) => s.state === 'windup' && Math.hypot(s.x - k.x, s.z - k.z) < 2 + s.r);
    if (threat && (k.hp <= 3 || threat.kind === 'boss') && k.dashCd <= 0) {
      out.dash = true;
      out.mx = k.x - threat.x;
      out.mz = k.z - threat.z;
      const l = Math.hypot(out.mx, out.mz) || 1;
      out.mx /= l;
      out.mz /= l;
      return out;
    }

    if (!target) {
      // idle: patrol a slow circle around the flame
      const r = hearth ? 4 : 0;
      if (hearth) return this.moveTo(out, k, Math.sin(this.orbit) * r, Math.cos(this.orbit) * r, 0.5);
      out.aimX = k.x + Math.sin(this.orbit);
      out.aimZ = k.z + Math.cos(this.orbit);
      return out;
    }

    const dx = target.x - k.x;
    const dz = target.z - k.z;
    const d = Math.hypot(dx, dz);
    out.aimX = target.x;
    out.aimZ = target.z;
    const reach = 2.2 + target.r;
    if (d > reach) {
      // hearth mode: don't chase far into the dark
      if (hearth && Math.hypot(target.x, target.z) > 12) {
        const a = Math.atan2(target.x, target.z);
        return this.moveTo(out, k, Math.sin(a) * 6, Math.cos(a) * 6, 1, target);
      }
      out.mx = dx / d;
      out.mz = dz / d;
      if (d > 7 && k.dashCd <= 0 && w.rng.next() < dt * 1.5) out.dash = true;
    } else {
      // strafe a little while swinging
      out.mx = (-dz / d) * 0.2;
      out.mz = (dx / d) * 0.2;
      if (this.atkT <= 0 && !(target.kind === 'boss' && !target.lit)) {
        out.attack = true;
        this.atkT = 0.16;
      }
    }
    return out;
  }

  private moveTo(out: Input, k: World['knight'], x: number, z: number, speed: number, face?: Shade): Input {
    const dx = x - k.x;
    const dz = z - k.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.3) {
      out.mx = (dx / d) * Math.min(1, d) * speed;
      out.mz = (dz / d) * Math.min(1, d) * speed;
    }
    if (face) {
      out.aimX = face.x;
      out.aimZ = face.z;
    } else if (d > 0.3) {
      out.aimX = x;
      out.aimZ = z;
    }
    return out;
  }
}
