// Keyboard + mouse + gamepad -> one intent per frame.

export interface RawIntent {
  moveX: number; // screen-relative: +x right
  moveY: number; // +y up (forward)
  attack: boolean;
  dash: boolean;
  flare: boolean;
  pause: boolean;
  confirm: boolean;
  back: boolean;
  retry: boolean;
  mute: boolean;
  skip: boolean;
  mouseNdcX: number;
  mouseNdcY: number;
  usingPad: boolean;
  padAimX: number;
  padAimY: number;
  anyInput: boolean;
}

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = { l: false, r: false };
  private mousePressed = { l: false, r: false };
  mouseNdcX = 0;
  mouseNdcY = -0.2;
  private padPrev: boolean[] = [];
  private usingPad = false;
  private any = false;
  onFirstInput: (() => void) | null = null;

  constructor(el: HTMLElement) {
    const first = () => {
      this.any = true;
      if (this.onFirstInput) {
        const f = this.onFirstInput;
        this.onFirstInput = null;
        f();
      }
    };
    window.addEventListener('keydown', (e) => {
      first();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.usingPad = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouseNdcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouseNdcY = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.usingPad = false;
    });
    el.addEventListener('pointerdown', (e) => {
      first();
      if (e.button === 0) {
        this.mouseDown.l = true;
        this.mousePressed.l = true;
      }
      if (e.button === 2) {
        this.mouseDown.r = true;
        this.mousePressed.r = true;
      }
      this.usingPad = false;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseDown.l = false;
      if (e.button === 2) this.mouseDown.r = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private key(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }
  private press(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Read and clear this frame's presses. */
  poll(): RawIntent {
    let mx = (this.key('KeyD', 'ArrowRight') ? 1 : 0) - (this.key('KeyA', 'ArrowLeft') ? 1 : 0);
    let my = (this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0);
    let attack = this.press('KeyJ') || this.mousePressed.l;
    let dash = this.press('Space', 'ShiftLeft', 'ShiftRight', 'KeyK');
    let flare = this.press('KeyE', 'KeyL') || this.mousePressed.r;
    let pause = this.press('Escape', 'KeyP');
    let confirm = this.press('Enter', 'Space');
    let back = this.press('Escape', 'Backspace');
    let retry = this.press('KeyR');
    const mute = this.press('KeyM');
    let skip = this.press('Enter', 'Escape', 'Space');
    let padAimX = 0;
    let padAimY = 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0);
      const ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0);
      const ry = dz(pad.axes[3] ?? 0);
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const edge = (i: number) => btn(i) && !this.padPrev[i];
      if (lx || ly || rx || ry || pad.buttons.some((b) => b.pressed)) {
        this.usingPad = true;
        if (!this.any) {
          this.any = true;
          if (this.onFirstInput) {
            const f = this.onFirstInput;
            this.onFirstInput = null;
            f();
          }
        }
      }
      if (this.usingPad) {
        mx = lx || mx;
        my = -ly || my;
        padAimX = rx;
        padAimY = -ry;
      }
      attack ||= edge(2) || edge(7); // X / RT
      dash ||= edge(0) || edge(5); // A / RB
      flare ||= edge(1) || edge(3) || edge(4); // B / Y / LB
      pause ||= edge(9);
      confirm ||= edge(0) || edge(9);
      back ||= edge(1);
      retry ||= edge(3);
      skip ||= edge(0) || edge(9);
      this.padPrev = pad.buttons.map((b) => b.pressed);
    }

    const out: RawIntent = {
      moveX: mx,
      moveY: my,
      attack,
      dash,
      flare,
      pause,
      confirm,
      back,
      retry,
      mute,
      skip,
      mouseNdcX: this.mouseNdcX,
      mouseNdcY: this.mouseNdcY,
      usingPad: this.usingPad,
      padAimX,
      padAimY,
      anyInput: this.any,
    };
    this.pressed.clear();
    this.mousePressed.l = false;
    this.mousePressed.r = false;
    return out;
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }
}
