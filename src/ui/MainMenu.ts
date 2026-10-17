export interface MainMenuOptions {
  onPlay: () => void;
  onSettings: () => void;
}

/**
 * Start menu: title, Play, Settings. Queries #main-menu and its buttons.
 */
export class MainMenu {
  private readonly panel: HTMLElement;

  constructor(opts: MainMenuOptions) {
    this.panel = document.getElementById('main-menu')!;
    document.getElementById('btn-play')!.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onPlay();
    });
    document.getElementById('btn-settings')!.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onSettings();
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
