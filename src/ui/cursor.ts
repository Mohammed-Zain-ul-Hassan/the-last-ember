// The cursor during play: hidden, and the pointer locked to the game so the view turns without limit. Esc (which the
// browser itself uses to release the lock) brings the cursor back with the pause menu.
//
// A lock is only granted to a request made inside a click or key handler (and Chrome refuses one for about a second
// after the player has just released it), so the request is made there and nowhere else: while play wants the lock and
// does not have it, a small prompt says to click, and that click takes the lock (and does nothing else in the game).
// A refused request leaves the prompt up and the next click asks again. Where locking is impossible (some embedded
// frames), the cursor is hidden anyway and plain mouse movement still looks.

let wanted = false;
let onLost: (() => void) | null = null;
let el: HTMLElement;
let prompt: HTMLElement;
let failures = 0;
let pending = false;

const style = document.createElement('style');
style.textContent = `
  body.nocursor, body.nocursor * { cursor: none !important; }
  #lock-prompt { position: fixed; left: 50%; top: 38%; translate: -50% 0; z-index: 12; pointer-events: none;
    font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-style: italic; color: #f3e2c8;
    padding: 8px 20px; border-radius: 4px; background: rgba(6, 4, 8, 0.55); text-shadow: 0 1px 6px #000;
    opacity: 0; transition: opacity 0.3s; }
  #lock-prompt.on { opacity: 1; }
  #lock-prompt::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 12px;
    vertical-align: middle; background: #ffa34a; box-shadow: 0 0 10px #ff7a1a; }
`;
document.head.appendChild(style);

export function isLocked(): boolean {
  return !!el && document.pointerLockElement === el;
}

/** Ask for the lock. Call it only from inside a click or key handler. */
export function requestLock(): void {
  if (!el?.requestPointerLock || isLocked() || pending) return;
  pending = true;
  try {
    const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.then === 'function')
      p.then(
        () => {
          pending = false;
          failures = 0;
        },
        (e: unknown) => {
          pending = false;
          // never possible here (a frame without the permission): stop asking, let clicks reach the game
          failures += (e as { name?: string })?.name === 'NotSupportedError' ? 6 : 1;
        },
      );
    else setTimeout(() => (pending = false), 300);
  } catch {
    pending = false;
    failures++;
  }
}

/**
 * label: what the prompt says ("Click to take the flame"). The click that takes the lock is kept from the game (it
 * would otherwise strike, or wake a shadow).
 */
export function initCursor(target: HTMLElement, lost: () => void, label = 'Click to play'): void {
  el = target;
  onLost = lost;
  prompt = document.createElement('div');
  prompt.id = 'lock-prompt';
  prompt.textContent = label;
  document.body.appendChild(prompt);
  // in the capture phase, before the game sees it: a click while play wants the lock is spent on taking it
  window.addEventListener(
    'pointerdown',
    (e) => {
      // (where locking keeps failing, the click goes to the game as usual)
      if (!wanted || isLocked() || e.button !== 0 || failures >= 6) return;
      if ((e.target as HTMLElement).closest?.('button, #sc-menu, #menu, #sc-choice, #sc-credits')) return;
      requestLock();
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (wanted && !isLocked() && e.code !== 'Escape' && !e.repeat) requestLock();
    },
    true,
  );
  document.addEventListener('pointerlockchange', () => {
    pending = false;
    // lost while play still wanted it: that was Esc (the browser keeps the key for itself) or a switch away
    if (!document.pointerLockElement && wanted) onLost?.();
  });
  document.addEventListener('pointerlockerror', () => {
    pending = false;
    failures++;
  });
}

/**
 * Every frame: is the game being played right now (true hides the cursor and wants the lock), or is a menu up?
 * ask: show the click prompt when unlocked (false during a cutscene: the cursor stays hidden, nothing nags).
 */
export function wantCursorHidden(on: boolean, ask = true): void {
  wanted = on;
  document.body.classList.toggle('nocursor', on);
  if (!on && document.pointerLockElement) document.exitPointerLock();
  // the prompt: in play, unlocked, and the lock still possible here (a frame that refuses it every time gets no nag)
  prompt?.classList.toggle('on', on && ask && !isLocked() && !!el?.requestPointerLock && failures < 6);
}
