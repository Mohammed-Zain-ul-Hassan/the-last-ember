export interface PauseMenuOptions {
  onResume: () => void;
  onSettings: () => void;
  onMainMenu: () => void;
}

/**
 * Mid-game pause panel: Resume / Settings / Main Menu. Queries #pause-menu.
 */
export class PauseMenu {
  private readonly panel: HTMLElement;

  constructor(opts: PauseMenuOptions) {
    this.panel = document.getElementById('pause-menu')!;
    document.getElementById('btn-resume')!.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onResume();
    });
    document.getElementById('btn-pause-settings')!.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onSettings();
    });
    document.getElementById('btn-main-menu')!.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onMainMenu();
    });
  }

  show(): void {
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.panel.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.panel.classList.contains('hidden');
  }
}
