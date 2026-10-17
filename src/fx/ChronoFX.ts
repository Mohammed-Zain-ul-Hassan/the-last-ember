import * as THREE from 'three';
import { CAMERA, CHRONO_DASH } from '../config';

const DASH_SCREEN = 0.28;
const DASH_BURST = 0.45;
const BURST_COUNT = 48;

const RECALL_VIGNETTE = `radial-gradient(ellipse at center,
  rgba(0, 0, 0, 0) 38%,
  rgba(255, 80, 20, 0.2) 70%,
  rgba(255, 122, 47, 0.55) 100%)`;

const DASH_VIGNETTE = `radial-gradient(ellipse at center,
  rgba(5, 8, 10, 0.15) 20%,
  rgba(5, 8, 10, 0.55) 55%,
  rgba(60, 255, 106, 0.45) 100%)`;

/**
 * Screen-space rewind effects (ember vignette + cyan speed lines) plus
 * black/green chronomancer dash pulse for the air chrono-dash.
 */
export class ChronoFX {
  private readonly vignette: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx2d: CanvasRenderingContext2D;
  private active = false;
  /** FOV outside of a rewind; the main loop widens it with speed. */
  baseFov: number = CAMERA.baseFov;

  private dashScreenT = 0;
  private dashBurstT = 0;
  private burst: THREE.Points | null = null;
  private readonly burstVel: Float32Array = new Float32Array(BURST_COUNT * 3);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
  ) {
    this.vignette = document.getElementById('chrono-vignette')!;
    this.canvas = document.getElementById('chrono-lines') as HTMLCanvasElement;
    this.ctx2d = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Black/green chronomancer flash at the dash origin (feet).
   * Screen pulse ~0.28s; world burst ~0.45s.
   */
  pulseDash(origin: THREE.Vector3): void {
    this.dashScreenT = DASH_SCREEN;
    this.dashBurstT = DASH_BURST;
    this.vignette.style.background = DASH_VIGNETTE;
    this.vignette.style.boxShadow = `
      inset 16px 0 70px rgba(5, 8, 10, 0.75),
      inset -16px 0 70px rgba(60, 255, 106, 0.35),
      inset 0 0 140px rgba(5, 8, 10, 0.6)`;
    this.vignette.style.mixBlendMode = 'screen';
    this.spawnBurst(origin);
  }

  /**
   * @param progress rewind progress in [0,1], or null when no recall is active.
   * @param dt frame delta for dash timers / particles.
   */
  update(progress: number | null, dt = 0): void {
    if (this.dashScreenT > 0 || this.dashBurstT > 0) {
      this.tickDash(dt);
    }

    if (progress === null) {
      if (this.active) this.resetRecall();
      if (this.dashScreenT <= 0) this.setFov(this.baseFov);
      return;
    }
    this.active = true;
    const pulse = Math.sin(Math.PI * THREE.MathUtils.clamp(progress, 0, 1));

    this.camera.fov = this.baseFov + (CAMERA.punchFov - this.baseFov) * pulse;
    this.camera.updateProjectionMatrix();

    // Recall owns the vignette while active; dash waits its turn.
    if (this.dashScreenT <= 0) {
      this.vignette.style.background = RECALL_VIGNETTE;
      this.vignette.style.opacity = (0.25 + 0.75 * pulse).toFixed(3);
      this.drawSpeedLines(0.35 + 0.65 * pulse, 'recall');
    }
  }

  private tickDash(dt: number): void {
    if (this.dashScreenT > 0) {
      this.dashScreenT = Math.max(0, this.dashScreenT - dt);
      const u = 1 - this.dashScreenT / DASH_SCREEN;
      const pulse = Math.sin(Math.PI * Math.min(1, u + 0.05));
      this.vignette.style.opacity = (0.35 + 0.55 * pulse).toFixed(3);
      this.drawSpeedLines(0.4 + 0.6 * pulse, 'dash');
      // FOV poke shared with punch curve, lighter than full recall.
      if (!this.active) {
        this.setFov(this.baseFov + (CAMERA.punchFov - this.baseFov) * pulse * 0.45);
      }
      if (this.dashScreenT <= 0) {
        this.vignette.style.opacity = this.active ? this.vignette.style.opacity : '0';
        this.vignette.style.background = RECALL_VIGNETTE;
        this.vignette.style.boxShadow = '';
        if (!this.active) {
          this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.setFov(this.baseFov);
        }
      }
    }

    if (this.dashBurstT > 0 && this.burst) {
      this.dashBurstT = Math.max(0, this.dashBurstT - dt);
      const life = this.dashBurstT / DASH_BURST;
      const pos = this.burst.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = this.burst.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < BURST_COUNT; i++) {
        const i3 = i * 3;
        pos.array[i3] += this.burstVel[i3] * dt;
        pos.array[i3 + 1] += this.burstVel[i3 + 1] * dt;
        pos.array[i3 + 2] += this.burstVel[i3 + 2] * dt;
        this.burstVel[i3 + 1] -= 4 * dt;
        // Fade toward ink.
        col.array[i3] *= 0.96;
        col.array[i3 + 1] *= 0.97;
        col.array[i3 + 2] *= 0.96;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      (this.burst.material as THREE.PointsMaterial).opacity = life;
      if (this.dashBurstT <= 0) this.clearBurst();
    }
  }

  private spawnBurst(origin: THREE.Vector3): void {
    this.clearBurst();
    const positions = new Float32Array(BURST_COUNT * 3);
    const colors = new Float32Array(BURST_COUNT * 3);
    const ink = new THREE.Color(CHRONO_DASH.ink);
    const green = new THREE.Color(CHRONO_DASH.green);
    for (let i = 0; i < BURST_COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = origin.x + (Math.random() - 0.5) * 0.3;
      positions[i3 + 1] = origin.y + 0.4 + Math.random() * 0.6;
      positions[i3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this.burstVel[i3] = Math.cos(a) * s;
      this.burstVel[i3 + 1] = 1 + Math.random() * 4;
      this.burstVel[i3 + 2] = Math.sin(a) * s;
      const c = Math.random() < 0.45 ? ink : green;
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.burst = new THREE.Points(geo, mat);
    this.burst.frustumCulled = false;
    this.scene.add(this.burst);
  }

  private clearBurst(): void {
    if (!this.burst) return;
    this.scene.remove(this.burst);
    this.burst.geometry.dispose();
    (this.burst.material as THREE.PointsMaterial).dispose();
    this.burst = null;
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) < 1e-3) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  private resetRecall(): void {
    this.active = false;
    if (this.dashScreenT <= 0) {
      this.setFov(this.baseFov);
      this.vignette.style.opacity = '0';
      this.vignette.style.background = RECALL_VIGNETTE;
      this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawSpeedLines(intensity: number, mode: 'recall' | 'dash'): void {
    const { ctx2d: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.hypot(cx, cy);

    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';

    const count = mode === 'dash' ? 56 : 80;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startR = outer * (0.42 + Math.random() * 0.35);
      const len = outer * (0.15 + Math.random() * 0.45);
      const endR = Math.min(outer * 1.05, startR + len);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x0 = cx + cos * startR;
      const y0 = cy + sin * startR;
      const x1 = cx + cos * endR;
      const y1 = cy + sin * endR;

      const alpha = intensity * (0.15 + Math.random() * 0.45);
      const grad = c.createLinearGradient(x0, y0, x1, y1);
      if (mode === 'dash') {
        const green = Math.random() < 0.55;
        grad.addColorStop(0, 'rgba(5,8,10,0)');
        grad.addColorStop(
          1,
          green
            ? `rgba(60,255,106,${alpha.toFixed(3)})`
            : `rgba(8,12,14,${Math.min(1, alpha * 1.4).toFixed(3)})`,
        );
      } else {
        grad.addColorStop(0, 'rgba(0,240,255,0)');
        grad.addColorStop(1, `rgba(${Math.random() < 0.2 ? '255,255,255' : '0,240,255'},${alpha.toFixed(3)})`);
      }
      c.strokeStyle = grad;
      c.lineWidth = (1 + Math.random() * 2.5) * (window.devicePixelRatio || 1);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }
}
