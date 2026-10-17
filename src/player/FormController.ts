import { FORMS } from '../config';
import type { Form } from './CharacterRig';

/**
 * Q toggles between the runner vessel and the shadow entity. A switch takes
 * FORMS.transitionTime: the current body burns away, the form swaps at the midpoint, and the
 * new body burns in. Toggling again mid-transition is ignored.
 */
export class FormController {
  form: Form = 'runner';
  /** Fires when a switch starts (sounds, cancelling actions) and at the swap point. */
  onStart: ((to: Form) => void) | null = null;
  onSwap: ((to: Form) => void) | null = null;
  /** Switches completed (playtest). */
  switches = 0;

  private t = 0;
  private to: Form | null = null;
  private swapped = false;

  get transitioning(): boolean {
    return this.to !== null;
  }

  /** Burn amount for the body: 0 -> 1 before the swap, 1 -> 0 after. */
  get dissolve(): number {
    if (this.to === null) return 0;
    const half = FORMS.transitionTime / 2;
    return this.t < half ? this.t / half : Math.max(0, 1 - (this.t - half) / half);
  }

  toggle(): void {
    if (this.to !== null) return;
    this.to = this.form === 'runner' ? 'shadow' : 'runner';
    this.t = 0;
    this.swapped = false;
    this.onStart?.(this.to);
  }

  update(dt: number): void {
    if (this.to === null) return;
    this.t += dt;
    if (!this.swapped && this.t >= FORMS.transitionTime / 2) {
      this.swapped = true;
      this.form = this.to;
      this.onSwap?.(this.form);
    }
    if (this.t >= FORMS.transitionTime) {
      this.to = null;
      this.switches++;
    }
  }
}
