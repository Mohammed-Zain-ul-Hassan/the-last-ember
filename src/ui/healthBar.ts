// One health bar for the knight's HUD, every shade and the boss.
//  - the fill drops at once; a pale chip underneath holds for a beat, then drains slowly, so the loss reads
//  - the fill colour ramps green -> yellow -> red with the fraction left
//  - it blinks white when struck and pulses when low; health coming back fills up smoothly instead of snapping

const HOLD = 0.5; // seconds the chip waits before draining
const BLINK = 0.42; // seconds of blinking after a hit

export class HealthBar {
  readonly el: HTMLDivElement;
  private fill: HTMLDivElement;
  private chip: HTMLDivElement;
  private frac = 1; // the real value
  private shown = 1; // the fill as drawn (rises smoothly on heals)
  private chipFrac = 1;
  private hold = 0;
  private blink = 0;
  private hue = -1;
  // what the DOM holds now: every frame calls draw(), but it only writes what changed (style writes cost layout)
  private fillW = -1;
  private chipW = -1;
  private blinkOn = false;
  private lowOn = false;

  /** Adopt an element that already holds `.chip` and `.fill`, or build one with the given class. */
  constructor(elOrClass: HTMLDivElement | string) {
    if (typeof elOrClass === 'string') {
      this.el = document.createElement('div');
      this.el.className = elOrClass;
      this.el.innerHTML = '<div class="chip"></div><div class="fill"></div>';
    } else this.el = elOrClass;
    this.el.classList.add('hbar');
    this.fill = this.el.querySelector('.fill') as HTMLDivElement;
    this.chip = this.el.querySelector('.chip') as HTMLDivElement;
  }

  /** The value as drawn, 0..1 (counts up with the fill when health comes back). */
  get shownFrac(): number {
    return this.shown;
  }

  /** Jump straight to a value (a new bar, a respawn, a life refilling from empty). */
  reset(frac: number, shown = frac): void {
    this.frac = frac;
    this.shown = shown;
    this.chipFrac = shown;
    this.hold = 0;
    this.blink = 0;
    this.draw();
  }

  set(fracIn: number, dt: number): void {
    const frac = Math.max(0, Math.min(1, fracIn));
    if (frac < this.frac - 0.015) {
      // struck: the fill drops now, the chip keeps the old value for a moment
      this.chipFrac = Math.max(this.chipFrac, this.shown);
      this.shown = frac;
      this.hold = HOLD;
      this.blink = BLINK;
    } else if (frac < this.shown) this.shown = frac; // a slow drain (burning in the light): no blink, the chip trails it
    this.frac = frac;
    if (this.shown < frac) this.shown = Math.min(frac, this.shown + Math.max(0.8, (frac - this.shown) * 3) * dt);
    if (this.hold > 0) this.hold -= dt;
    else if (this.chipFrac > this.shown) this.chipFrac -= Math.max(0.22, (this.chipFrac - this.shown) * 1.4) * dt;
    this.chipFrac = Math.max(this.chipFrac, this.shown);
    this.blink = Math.max(0, this.blink - dt);
    this.draw();
  }

  private draw(): void {
    // scaleX, not width: a transform never re-lays out the page
    const fw = Math.round(this.shown * 1000) / 1000;
    const cw = Math.round(this.chipFrac * 1000) / 1000;
    if (fw !== this.fillW) this.fill.style.transform = `scaleX(${(this.fillW = fw)})`;
    if (cw !== this.chipW) this.chip.style.transform = `scaleX(${(this.chipW = cw)})`;
    // green at full, yellow at half, red near empty
    const hue = Math.round(120 * Math.max(0, Math.min(1, (this.shown - 0.15) / 0.7)));
    if (hue !== this.hue) {
      this.hue = hue;
      this.fill.style.background = `linear-gradient(180deg, hsl(${hue} 90% 66%), hsl(${hue} 80% 42%) 55%, hsl(${hue} 85% 30%))`;
      this.fill.style.boxShadow = `0 0 8px hsla(${hue}, 90%, 55%, 0.55)`;
    }
    const blinkOn = this.blink > 0 && Math.floor(this.blink * 16) % 2 === 0;
    if (blinkOn !== this.blinkOn) this.el.classList.toggle('blink', (this.blinkOn = blinkOn));
    const lowOn = this.shown <= 0.25 && this.shown > 0;
    if (lowOn !== this.lowOn) this.el.classList.toggle('low', (this.lowOn = lowOn));
  }
}
