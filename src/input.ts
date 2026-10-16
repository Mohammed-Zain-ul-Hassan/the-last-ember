import type { Input } from './sim/world';

// Keyboard + mouse. Presses are latched until the next sim step consumes them, so fast taps are never lost.
const held = new Set<string>();
const latched = new Set<string>();
let mouseL = false;
let mouseR = false;

const BIND = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  attack: ['KeyJ', 'KeyZ'],
  heavy: ['KeyK', 'KeyX'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC'],
};

type Listener = (code: string) => void;
const listeners: Listener[] = [];
export function onKey(fn: Listener): void {
  listeners.push(fn);
}

export function initInput(canvas: HTMLElement): void {
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
    if (e.button === 0) mouseL = true;
    if (e.button === 2) mouseR = true;
    for (const l of listeners) l('Mouse' + e.button);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

const any = (codes: string[], set: Set<string>) => codes.some((c) => set.has(c));

/** Build the input for one sim step and clear latched presses. */
export function readInput(): Input {
  const inp: Input = {
    left: any(BIND.left, held),
    right: any(BIND.right, held),
    jumpHeld: any(BIND.jump, held),
    jump: any(BIND.jump, latched),
    attack: any(BIND.attack, latched) || mouseL,
    heavy: any(BIND.heavy, latched) || mouseR,
    dash: any(BIND.dash, latched),
  };
  latched.clear();
  mouseL = mouseR = false;
  return inp;
}

export function clearInput(): void {
  latched.clear();
  mouseL = mouseR = false;
}
