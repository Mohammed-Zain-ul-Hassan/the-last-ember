import type { Form } from '../player/CharacterRig';

/**
 * Form HUD: Skyrim-style magicka (left) and stamina (right) bars that only exist in the shadow
 * form and fade out when full, the form name flash on a switch, and the ink vignette.
 */
export class FormHud {
  private readonly root: HTMLDivElement;
  private readonly magicka: HTMLDivElement;
  private readonly magickaFill: HTMLDivElement;
  private readonly stamina: HTMLDivElement;
  private readonly staminaFill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private labelT = Infinity;
  private flashT = Infinity;
  private magickaShow = 0;
  private staminaShow = 0;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      #form-hud { position: fixed; inset: 0; pointer-events: none; z-index: 19; }
      #form-hud .bar { position: absolute; bottom: 40px; width: 220px; height: 10px; padding: 2px;
        border: 1px solid rgba(220, 220, 240, 0.35); border-radius: 6px; background: rgba(4, 6, 12, 0.6);
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.6); opacity: 0; transition: border-color 0.1s; }
      #form-hud .bar.left { left: 40px; }
      #form-hud .bar.right { right: 40px; }
      #form-hud .fill { height: 100%; border-radius: 4px; transform-origin: left center; }
      #form-hud .bar.right .fill { transform-origin: right center; margin-left: auto; }
      #form-hud .magicka .fill { background: linear-gradient(90deg, #5b2bb8, #a873ff); box-shadow: 0 0 8px rgba(155, 77, 255, 0.8); }
      #form-hud .stamina .fill { background: linear-gradient(90deg, #3f9b4a, #7fd67a); box-shadow: 0 0 8px rgba(110, 210, 110, 0.6); }
      #form-hud .bar.flash { border-color: #ff5a5a; }
      #form-hud .label { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%);
        font-size: 15px; font-weight: 700; letter-spacing: 0.4em; white-space: nowrap; opacity: 0; }
      #form-hud .label.shadow { color: #c9a6ff; text-shadow: 0 0 12px rgba(155, 77, 255, 0.9); }
      #form-hud .label.runner { color: #fff; text-shadow: 0 0 10px rgba(255, 70, 50, 0.9); }
      #form-hud .ink { position: absolute; inset: 0; opacity: 0;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(8,2,18,0.7) 70%, rgba(2,0,6,0.95) 100%); }
      #form-hud .ink.runner { background: radial-gradient(ellipse at center, rgba(255,255,255,0) 35%, rgba(255,240,235,0.35) 80%, rgba(255,255,255,0.6) 100%); }
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'form-hud';
    this.vignette = this.el('ink');
    this.label = this.el('label');
    [this.magicka, this.magickaFill] = this.bar('magicka left');
    [this.stamina, this.staminaFill] = this.bar('stamina right');
    document.body.appendChild(this.root);
  }

  /** Shows the form name and starts the vignette pulse for a switch towards `to`. */
  announce(to: Form): void {
    this.label.textContent = to === 'shadow' ? 'SHADOW FORM' : 'RUNNER FORM';
    this.label.className = `label ${to}`;
    this.vignette.className = `ink ${to}`;
    this.labelT = 0;
  }

  /** The magicka bar flashes red when a cast is refused. */
  flashMagicka(): void {
    this.flashT = 0;
    this.magickaShow = 1;
  }

  /**
   * @param transition 0..1 burn amount of the form switch (drives the vignette)
   * @param magicka / stamina fractions 0..1
   */
  update(dt: number, form: Form, transition: number, magicka: number, stamina: number): void {
    this.labelT += dt;
    this.flashT += dt;
    const shadow = form === 'shadow';
    // Like Skyrim, bars appear while not full and fade a moment after refilling.
    const fade = (cur: number, full: boolean): number => (shadow && !full ? 1 : Math.max(0, cur - dt * 1.2));
    this.magickaShow = fade(this.magickaShow, magicka >= 0.999 && this.flashT > 0.6);
    this.staminaShow = fade(this.staminaShow, stamina >= 0.999);
    this.magicka.style.opacity = this.magickaShow.toFixed(2);
    this.stamina.style.opacity = this.staminaShow.toFixed(2);
    this.magickaFill.style.transform = `scaleX(${magicka.toFixed(3)})`;
    this.staminaFill.style.transform = `scaleX(${stamina.toFixed(3)})`;
    this.magicka.classList.toggle('flash', this.flashT < 0.6 && Math.floor(this.flashT * 10) % 2 === 0);

    const l = this.labelT;
    this.label.style.opacity = (l < 0.25 ? l / 0.25 : l < 1.4 ? 1 : Math.max(0, 1 - (l - 1.4) / 0.5)).toFixed(2);
    this.vignette.style.opacity = (transition * 0.9).toFixed(2);
  }

  private el(cls: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  private bar(cls: string): [HTMLDivElement, HTMLDivElement] {
    const b = this.el(`bar ${cls}`);
    const f = document.createElement('div');
    f.className = 'fill';
    b.appendChild(f);
    return [b, f];
  }
}
