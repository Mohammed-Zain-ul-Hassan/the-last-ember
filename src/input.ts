import type { Input } from './sim/world';

// Keyboard + mouse. Presses are latched until the next sim step consumes them, so fast taps are never lost.
// W A S D (or the arrows) move relative to the camera and he turns to face where he runs; J / K strike. The camera
// moves only by the mouse, and the cursor is never captured: simply moving the mouse looks around (no button held),
// and resting the cursor near the left or right edge of the screen keeps turning, so a free cursor never runs out of
// room. Dragging works too, and a two-finger swipe on a trackpad; a quick click strikes (left) or cleaves (right).
// (Pointer lock was dropped: it needs a click, shows a browser banner, Esc steals it back, and itch.io frames block it.)
const held = new Set<string>();
const latched = new Set<string>();
let mouseL = false;
let mouseR = false;
let lookX = 0;
let lookY = 0;
let lookT = 0; // performance.now() of the last look input
let cursorX = -1; // the cursor across the canvas, 0..1 (-1: not over it)
let lastTake = 0;
/** Plain mouse movement turns the view at this gain (dragging turns faster: the hand travels further). */
const HOVER_GAIN = 1.25;
/** The outer fraction of the screen, left and right, where a resting cursor keeps the view turning. */
const EDGE = 0.07;
/** Turning speed at the very edge, in look pixels per second. */
const EDGE_SPEED = 650;

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
/** A press that moves less than this (px) and lifts within CLICK_MS is a click, not a drag. */
const DRAG_PX = 5;
const CLICK_MS = 350;
/** Dragging turns faster than a captured mouse would: the hand travels further for the same turn. */
const DRAG_GAIN = 1.8;

type Listener = (code: string) => void;
const listeners: Listener[] = [];
export function onKey(fn: Listener): void {
  listeners.push(fn);
}

/** Seconds since the player last moved the camera (the follow camera eases back behind him after a while). */
export function sinceLook(): number {
  return (performance.now() - lookT) / 1000;
}

export function initInput(canvas: HTMLElement): void {
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
  // drag to look: any button; a press that barely moves is a click (a strike) when it lifts
  let down = -1;
  let downX = 0;
  let downY = 0;
  let downT = 0;
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (down >= 0) return;
    down = e.button;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    dragging = false;
    canvas.setPointerCapture?.(e.pointerId); // keep the drag even when the cursor leaves the canvas
    for (const l of listeners) l('Mouse' + e.button);
  });
  canvas.addEventListener('pointermove', (e) => {
    // the pointer locked to the game (during play): every movement looks, held button or not
    if (document.pointerLockElement === canvas) {
      lookX += e.movementX * HOVER_GAIN;
      lookY += e.movementY * HOVER_GAIN;
      lookT = performance.now();
      cursorX = -1;
      return;
    }
    const r = canvas.getBoundingClientRect();
    cursorX = r.width > 0 ? (e.clientX - r.left) / r.width : -1;
    if (down < 0) {
      // no button held: the mouse just looks
      if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) {
        lookX += e.movementX * HOVER_GAIN;
        lookY += e.movementY * HOVER_GAIN;
        lookT = performance.now();
      }
      return;
    }
    if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_PX) dragging = true;
    if (!dragging) return;
    lookX += e.movementX * DRAG_GAIN;
    lookY += e.movementY * DRAG_GAIN;
    lookT = performance.now();
  });
  const lift = (e: PointerEvent) => {
    if (e.button !== down) return;
    if (!dragging && performance.now() - downT < CLICK_MS) {
      if (down === 0) mouseL = true;
      if (down === 2) mouseR = true;
    }
    down = -1;
    dragging = false;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointerleave', () => (cursorX = -1));
  window.addEventListener('blur', () => (cursorX = -1));
  canvas.addEventListener('pointercancel', () => {
    down = -1;
    dragging = false;
  });
  // a two-finger swipe on a trackpad (horizontal wheel) turns the camera without a click
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) < 0.5) return;
      e.preventDefault();
      lookX += e.deltaX * DRAG_GAIN;
      lookT = performance.now();
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Mouse movement since the last call, in pixels. */
export function takeLook(): [number, number] {
  // a cursor resting at the left or right edge keeps turning that way
  const now = performance.now();
  const dt = lastTake ? Math.min(0.1, (now - lastTake) / 1000) : 0;
  lastTake = now;
  if (cursorX >= 0 && cursorX <= 1) {
    const k = cursorX < EDGE ? -(EDGE - cursorX) / EDGE : cursorX > 1 - EDGE ? (cursorX - (1 - EDGE)) / EDGE : 0;
    if (k) {
      lookX += k * EDGE_SPEED * dt;
      lookT = now;
    }
  }
  const out: [number, number] = [lookX, lookY];
  lookX = lookY = 0;
  return out;
}

const any = (codes: string[], set: Set<string>) => codes.some((c) => set.has(c));

/** Is this key down right now? */
export function isHeld(code: string): boolean {
  return held.has(code);
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
  // relative to the camera: right of forward on x/z (y up) is (-fz, fx); he turns to face the way he runs
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
    heavyHeld: any(BIND.heavy, held),
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
