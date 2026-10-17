// Keyboard and mouse for the Still City. The camera moves only by the mouse: during play simply moving it looks (no
// button held), the cursor hidden and the pointer locked to the game (src/ui/cursor.ts); paused, or in a menu, the
// cursor is back. Where a lock is refused, plain movement still looks. The view turns only while the mouse moves: it
// never keeps turning on its own. Dragging works too, and a two-finger sideways swipe. A quick left click is E (wake, rest, read); a
// quick right click is Flame Lock. The wheel trims the flame's height. Presses are latched until a sim step reads them.

const held = new Set<string>();
const latched = new Set<string>();
let lookX = 0;
let lookY = 0;
let trim = 0;
let clickL = false;
let clickR = false;
const DRAG_PX = 5;
const CLICK_MS = 350;
const DRAG_GAIN = 1.8;
/** Plain mouse movement turns the view at this gain. */
const HOVER_GAIN = 1.25;

type Listener = (code: string) => void;
const listeners: Listener[] = [];
export function onKey(fn: Listener): void {
  listeners.push(fn);
}

export function initInput(canvas: HTMLElement): void {
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
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
    // (not while locked: the lock already holds it, and capturing then throws)
    if (document.pointerLockElement !== canvas) {
      try {
        canvas.setPointerCapture?.(e.pointerId);
      } catch {
        /* nothing to capture */
      }
    }
    for (const l of listeners) l('Mouse' + e.button);
  });
  canvas.addEventListener('pointermove', (e) => {
    // locked to the game: every movement looks, held button or not
    if (document.pointerLockElement === canvas) {
      lookX += e.movementX * HOVER_GAIN;
      lookY += e.movementY * HOVER_GAIN;
      return;
    }
    if (down < 0) {
      // no button held: the mouse just looks
      if (e.pointerType === 'mouse') {
        lookX += e.movementX * HOVER_GAIN;
        lookY += e.movementY * HOVER_GAIN;
      }
      return;
    }
    if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_PX) dragging = true;
    if (!dragging) return;
    lookX += e.movementX * DRAG_GAIN;
    lookY += e.movementY * DRAG_GAIN;
  });
  const lift = (e: PointerEvent) => {
    if (e.button !== down) return;
    if (!dragging && performance.now() - downT < CLICK_MS) {
      if (down === 0) clickL = true;
      if (down === 2) clickR = true;
    }
    down = -1;
    dragging = false;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', () => {
    down = -1;
    dragging = false;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) lookX += e.deltaX * DRAG_GAIN;
      else trim = Math.max(-1, Math.min(1, trim - e.deltaY * 0.0025));
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function takeLook(): [number, number] {
  const out: [number, number] = [lookX, lookY];
  lookX = lookY = 0;
  return out;
}

export const isHeld = (...codes: string[]): boolean => codes.some((c) => held.has(c));
export const pressed = (...codes: string[]): boolean => codes.some((c) => latched.has(c));

export function getTrim(): number {
  return trim;
}
export function setTrim(v: number): void {
  trim = v;
}

/** Movement on x/z turned by the camera's heading (forward is (cos yaw, sin yaw)). */
export function moveVector(yaw: number): [number, number] {
  const f = (isHeld('KeyW', 'ArrowUp') ? 1 : 0) - (isHeld('KeyS', 'ArrowDown') ? 1 : 0);
  const r = (isHeld('KeyD', 'ArrowRight') ? 1 : 0) - (isHeld('KeyA', 'ArrowLeft') ? 1 : 0);
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  let mx = fx * f - fz * r;
  let mz = fz * f + fx * r;
  const l = Math.hypot(mx, mz);
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  return [mx, mz];
}

/** The presses for one sim step (then forgotten). */
export function takePresses(): { act: boolean; lock: boolean } {
  const out = { act: pressed('KeyE') || clickL, lock: clickR || pressed('KeyQ') };
  latched.clear();
  clickL = clickR = false;
  return out;
}

export function clearInput(): void {
  latched.clear();
  held.clear();
  clickL = clickR = false;
  lookX = lookY = 0;
}
