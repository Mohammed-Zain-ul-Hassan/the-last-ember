import type { Input } from './sim/world';

// Keyboard + mouse. Presses are latched until the next sim step consumes them, so fast taps are never lost.
// Plays whole on the keyboard: A / D (or the arrows) swing the camera and him with it, W / S run forward and
// backpedal along where the camera looks, J / K strike. The mouse also turns the camera while the pointer is locked
// to the canvas (click the game to lock it, Esc releases it).
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
  turnLeft: ['KeyA', 'ArrowLeft', 'KeyQ'],
  turnRight: ['KeyD', 'ArrowRight', 'KeyE'],
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
  const el = canvasEl;
  const plain = () => {
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // locked out (iframe sandbox, too soon after a release): A / D still turn the camera
    }
  };
  // raw mouse movement where the browser offers it (no OS acceleration): turns feel immediate and consistent
  try {
    const lock = el.requestPointerLock as unknown as (this: HTMLElement, o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
    const p = lock.call(el, { unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(plain);
  } catch {
    plain();
  }
}

export function releaseLock(): void {
  if (isLocked()) document.exitPointerLock();
}

export function initInput(canvas: HTMLElement): void {
  canvasEl = canvas;
  window.addEventListener('keydown', (e) => {
    // Enter / Tab too: the menus handle them, and the browser's own default would press (or focus) a second button
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Tab'].includes(e.code)) e.preventDefault();
    // Cmd-held keys never send a keyup on macOS: forget everything held rather than run on forever
    if (e.metaKey) held.clear();
    if (!e.repeat) {
      latched.add(e.code);
      for (const l of listeners) l(e.code);
    }
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  document.addEventListener('visibilitychange', () => held.clear());
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

/** Is this key down right now? */
export function isHeld(code: string): boolean {
  return held.has(code);
}

/** Keyboard turning: A / D, the arrows (and Q / E). +1 turns right. */
export function keyTurn(): number {
  return (any(BIND.turnRight, held) ? 1 : 0) - (any(BIND.turnLeft, held) ? 1 : 0);
}

/**
 * Build the input for ONE sim step and clear latched presses. Only call it when a step will actually run.
 * camYaw is the camera's heading on the ground: forward is (cos, sin) on x/z.
 */
export function readInput(camYaw: number): Input {
  // forward and back only, along the camera's heading: turning is the camera's job (keyTurn / the mouse)
  const f = (any(BIND.forward, held) ? 1 : 0) - (any(BIND.back, held) ? 1 : 0);
  const inp: Input = {
    mx: Math.cos(camYaw) * f,
    mz: Math.sin(camYaw) * f,
    aim: camYaw,
    backpedal: f < 0,
    turning: keyTurn() !== 0,
    // a dash with a turn key held and neither W nor S is a sidestep that way (the shades' wind-ups are dodged sideways)
    dashSide: f === 0 && any(BIND.dash, latched) ? keyTurn() : 0,
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
