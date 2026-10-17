/**
 * In-game HUD: objective line, wife/boss HP bars, victory overlay.
 * Queries #game-hud, #objective, #wife-hp, #boss-hp, #victory-overlay.
 */
export class GameHud {
  private readonly root: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly wifeBar: HTMLElement;
  private readonly wifeFill: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly victory: HTMLElement;

  constructor() {
    this.root = document.getElementById('game-hud')!;
    this.objective = document.getElementById('objective')!;
    this.wifeBar = document.getElementById('wife-hp')!;
    this.wifeFill = document.getElementById('wife-hp-fill')!;
    this.bossBar = document.getElementById('boss-hp')!;
    this.bossFill = document.getElementById('boss-hp-fill')!;
    this.victory = document.getElementById('victory-overlay')!;
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setObjective(text: string): void {
    this.objective.textContent = text;
  }

  setWifeHp(cur: number, max: number): void {
    this.wifeBar.classList.remove('hidden');
    const t = max > 0 ? Math.min(1, Math.max(0, cur / max)) : 0;
    this.wifeFill.style.transform = `scaleX(${t.toFixed(3)})`;
  }

  hideWifeHp(): void {
    this.wifeBar.classList.add('hidden');
  }

  setBossHp(cur: number, max: number): void {
    this.bossBar.classList.remove('hidden');
    const t = max > 0 ? Math.min(1, Math.max(0, cur / max)) : 0;
    this.bossFill.style.transform = `scaleX(${t.toFixed(3)})`;
  }

  hideBossHp(): void {
    this.bossBar.classList.add('hidden');
  }

  showVictory(): void {
    this.victory.classList.remove('hidden');
  }

  hideVictory(): void {
    this.victory.classList.add('hidden');
  }
}
