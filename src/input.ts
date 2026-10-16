import type { Input } from './sim/world';

// Keyboard + mouse. Presses are latched until the next sim step consumes them, so fast taps are never lost.
// Movement is relative to the camera: W runs where the camera looks. The mouse turns the camera while the pointer
// is locked to the canvas (click the game to lock it, Esc releases it).
const held = new Set<string>();
const latched = new Set<string>();
let mouseL = false;
let mouseR = false;
let mouseRHeld = false;
let lookX = 0;
let lookY = 0;
let canvasEl: HTMLElement | null = null;

const BIND = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  attack: ['KeyJ', 'KeyZ'],
  heavy: ['KeyK', 'KeyX'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC'],
};

type Listener = (code: string) => void;
const listeners: Listener[] = [];
export function onKey(fn: Listener): void {
  listeners.push(fn);
}

type LockListener = (locked: boolean) => void;
const lockListeners: LockListener[] = [];
/** Fires when the pointer lock is taken or released (Esc releases it without a keydown). */
export function onLockChange(fn: LockListener): void {
  lockListeners.push(fn);
}

export function isLocked(): boolean {
  return !!canvasEl && document.pointerLockElement === canvasEl;
}

/** Capture the mouse for looking around (needs a user gesture). */
export function requestLock(): void {
  if (!canvasEl || isLocked()) return;
  try {
    const p = canvasEl.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  } catch {
    // locked out (iframe sandbox, too soon after a release): the arrow keys still turn the camera
  }
}

export function releaseLock(): void {
  if (isLocked()) document.exitPointerLock();
}

export function initInput(canvas: HTMLElement): void {
  canvasEl = canvas;
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      latched.add(e.code);
      for (const l of listeners) l(e.code);
    }
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousedown', (e) => {
    // the click that captures the mouse is not also a sword stroke
    const wasLocked = isLocked();
    if (wasLocked && e.button === 0) mouseL = true;
    if (wasLocked && e.button === 2) {
      mouseR = true;
      mouseRHeld = true;
    }
    for (const l of listeners) l('Mouse' + e.button);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) mouseRHeld = false;
  });
  window.addEventListener('blur', () => (mouseRHeld = false));
  window.addEventListener('mousemove', (e) => {
    if (!isLocked()) return;
    lookX += e.movementX;
    lookY += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    const on = isLocked();
    if (!on) mouseRHeld = false;
    for (const l of lockListeners) l(on);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Mouse movement since the last call, in pixels. */
export function takeLook(): [number, number] {
  const out: [number, number] = [lookX, lookY];
  lookX = lookY = 0;
  return out;
}

const any = (codes: string[], set: Set<string>) => codes.some((c) => set.has(c));

/** Turn keys for playing without a captured mouse: Q / E. */
export function keyTurn(): number {
  return (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
}

/**
 * Build the input for ONE sim step and clear latched presses. Only call it when a step will actually run.
 * camYaw is the camera's heading on the ground: forward is (cos, sin) on x/z.
 */
export function readInput(camYaw: number): Input {
  const f = (any(BIND.forward, held) ? 1 : 0) - (any(BIND.back, held) ? 1 : 0);
  const r = (any(BIND.right, held) ? 1 : 0) - (any(BIND.left, held) ? 1 : 0);
  const fx = Math.cos(camYaw);
  const fz = Math.sin(camYaw);
  // right of forward on x/z (y up): (-fz, fx)
  let mx = fx * f - fz * r;
  let mz = fz * f + fx * r;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const inp: Input = {
    mx,
    mz,
    aim: camYaw,
    jumpHeld: any(BIND.jump, held),
    jump: any(BIND.jump, latched),
    attack: any(BIND.attack, latched) || mouseL,
    heavy: any(BIND.heavy, latched) || mouseR,
    dash: any(BIND.dash, latched),
    heavyHeld: any(BIND.heavy, held) || mouseRHeld,
  };
  latched.clear();
  mouseL = mouseR = false;
  return inp;
}

export function clearInput(): void {
  latched.clear();
  mouseL = mouseR = false;
  lookX = lookY = 0;
}
