import * as THREE from 'three';
import { CAMERA } from '../config';

/**
 * Screen-space rewind effects: blue chromatic vignette, radial speed lines, and FOV punch.
 */
export class ChronoFX {
  private readonly vignette: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx2d: CanvasRenderingContext2D;
  private active = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.vignette = document.getElementById('chrono-vignette')!;
    this.canvas = document.getElementById('chrono-lines') as HTMLCanvasElement;
    this.ctx2d = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * @param progress rewind progress in [0,1], or null when no recall is active.
   */
  update(progress: number | null): void {
    if (progress === null) {
      if (this.active) this.reset();
      return;
    }
    this.active = true;
    const pulse = Math.sin(Math.PI * THREE.MathUtils.clamp(progress, 0, 1));

    this.camera.fov = CAMERA.baseFov + (CAMERA.punchFov - CAMERA.baseFov) * pulse;
    this.camera.updateProjectionMatrix();

    this.vignette.style.opacity = (0.25 + 0.75 * pulse).toFixed(3);
    this.drawSpeedLines(0.35 + 0.65 * pulse);
  }

  private reset(): void {
    this.active = false;
    this.camera.fov = CAMERA.baseFov;
    this.camera.updateProjectionMatrix();
    this.vignette.style.opacity = '0';
    this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawSpeedLines(intensity: number): void {
    const { ctx2d: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.hypot(cx, cy);

    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';

    const count = 80;
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
      grad.addColorStop(0, 'rgba(0,240,255,0)');
      grad.addColorStop(1, `rgba(${Math.random() < 0.2 ? '255,255,255' : '0,240,255'},${alpha.toFixed(3)})`);
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
