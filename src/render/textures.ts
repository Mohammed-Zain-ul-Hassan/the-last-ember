import * as THREE from 'three';
import { Rng } from '../sim/rng';

// Procedural textures, generated once at boot (no files to load, nothing to go missing).

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

let glow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/** Alpha mask for torn cloth: solid at the top, ragged tongues and holes toward the hem. */
export function tatterTexture(seed = 3): THREE.Texture {
  const [c, g] = canvas(128, 256);
  const rng = new Rng(seed);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(128, 0);
  // ragged right edge, then the hem as jagged tongues
  for (let y = 0; y <= 200; y += 16) g.lineTo(128 - rng.range(0, 6 + y * 0.05), y);
  let x = 128;
  while (x > 0) {
    const w = rng.range(8, 22);
    g.lineTo(x - w * 0.5, rng.range(205, 256));
    g.lineTo(x - w, rng.range(175, 215));
    x -= w;
  }
  for (let y = 200; y >= 0; y -= 16) g.lineTo(rng.range(0, 6 + y * 0.05), y);
  g.closePath();
  g.fill();
  // moth-eaten holes in the lower half
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(rng.range(15, 113), rng.range(110, 200), rng.range(2, 7), rng.range(4, 12), rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Soft tileable-ish noise for fog banks. */
export function fogTexture(): THREE.Texture {
  const [c, g] = canvas(512, 128);
  const rng = new Rng(77);
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(-40, 552);
    const y = rng.range(40, 100);
    const r = rng.range(20, 70);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${rng.range(0.12, 0.3)})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Vertical gradient for light shafts. */
export function shaftTexture(): THREE.Texture {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

/** Horizontal ramp: transparent on the left, solid on the right (sunlit ground at dawn). */
export function rampTexture(): THREE.Texture {
  const [c, g] = canvas(256, 4);
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 4);
  return new THREE.CanvasTexture(c);
}
