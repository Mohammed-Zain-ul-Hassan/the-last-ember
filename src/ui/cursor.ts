// The cursor during play: hidden, and the pointer locked to the game so the view turns without limit. Esc (which
// the browser itself uses to release the lock) brings it back with the pause menu. Locking needs a recent click or
// key, so the request is made on the first frame of play after one; where the lock is not allowed (some embedded
// frames), the cursor is still hidden and the plain-movement look with screen-edge turning does the work.

let lastGesture = -1e9;
let triedFor = -1; // the gesture the last lock request was made for (one request per click or key, never a stream)
let wanted = false;
let onLost: (() => void) | null = null;
let el: HTMLElement;

const style = document.createElement('style');
style.textContent = 'body.nocursor, body.nocursor * { cursor: none !important; }';
document.head.appendChild(style);

export function initCursor(target: HTMLElement, lost: () => void): void {
  el = target;
  onLost = lost;
  const gesture = () => (lastGesture = performance.now());
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('keydown', gesture, true);
  document.addEventListener('pointerlockchange', () => {
    // lost while play still wanted it: that was Esc (the browser keeps the key for itself) or a switch away
    if (!document.pointerLockElement && wanted) onLost?.();
  });
}

export function isLocked(): boolean {
  return !!el && document.pointerLockElement === el;
}

/** Every frame: is the game being played right now (true hides and locks), or is a menu up (false shows it)? */
export function wantCursorHidden(on: boolean): void {
  wanted = on;
  document.body.classList.toggle('nocursor', on);
  if (!on) {
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  const now = performance.now();
  // a lock can only be asked for shortly after a click or a key, and once per such gesture: Chrome refuses a burst
  // of requests ("too many in a short window") and then the next good one too
  if (isLocked() || triedFor === lastGesture || now - lastGesture > 4000 || !el.requestPointerLock) return;
  triedFor = lastGesture;
  try {
    const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => undefined);
  } catch {
    /* refused: the cursor stays hidden, and the next click asks again */
  }
}
