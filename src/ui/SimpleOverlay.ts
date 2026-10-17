import type { RecallState } from '../player/RecallSystem';

/** DOM HUD: ability status badge and the "Click to Play" pointer-lock blocker. */
export class SimpleOverlay {
  private readonly blocker: HTMLElement;
  private readonly status: HTMLElement;
  private readonly statusText: HTMLElement;
  private lastText = '';
  private lastClass = '';

  constructor(onPlay: () => void) {
    this.blocker = document.getElementById('blocker')!;
    this.status = document.getElementById('status')!;
    this.statusText = document.getElementById('status-text')!;
    this.blocker.addEventListener('click', onPlay);
  }

  setLocked(locked: boolean): void {
    this.blocker.classList.toggle('hidden', locked);
  }

  update(state: RecallState, cooldownRemaining: number): void {
    let text: string;
    switch (state) {
      case 'ready':
        text = 'RECALL READY';
        break;
      case 'recalling':
        text = 'RECALLING...';
        break;
      case 'cooldown':
        text = `COOLDOWN: ${cooldownRemaining.toFixed(1)}s`;
        break;
    }
    if (text !== this.lastText) {
      this.statusText.textContent = text;
      this.lastText = text;
    }
    if (state !== this.lastClass) {
      this.status.className = state;
      this.lastClass = state;
    }
  }
}
