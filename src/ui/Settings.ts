const STORAGE_KEY = 'tle-settings';

/** Default sensitivity before the user multiplier is applied (matches config PLAYER). */
export const BASE_MOUSE_SENSITIVITY = 0.0022;

export interface GameSettings {
  /** Multiplier on base sensitivity; 1 = default. Range ~0.25–2. */
  mouseSensitivity: number;
  /** 0..1 overall bus level. */
  masterVolume: number;
  /** 0..1 music bed level. */
  musicVolume: number;
  /** 0..1 SFX bus level. */
  sfxVolume: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1,
  masterVolume: 0.5,
  musicVolume: 1,
  sfxVolume: 1,
};

/** Live look sensitivity applied by PlayerController (mutated from settings). */
export const runtimeControls = {
  mouseSensitivity: BASE_MOUSE_SENSITIVITY,
};

export type SettingsReturnTo = 'main' | 'pause';

export interface SettingsPanelOptions {
  /** Called whenever a slider changes (and once on construct after load). */
  onChange: (settings: GameSettings) => void;
  /** Called when Back is pressed; `returnTo` is which menu opened settings. */
  onBack?: (returnTo: SettingsReturnTo) => void;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clampSens(v: number): number {
  return Math.min(2, Math.max(0.25, v));
}

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const num = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      mouseSensitivity: clampSens(num(parsed.mouseSensitivity, DEFAULT_SETTINGS.mouseSensitivity)),
      masterVolume: clamp01(num(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume)),
      musicVolume: clamp01(num(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume)),
      sfxVolume: clamp01(num(parsed.sfxVolume, DEFAULT_SETTINGS.sfxVolume)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function save(s: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Settings panel: sensitivity + volumes, persisted under `tle-settings`.
 * Queries #settings-panel and its range inputs by ID.
 */
export class SettingsPanel {
  private readonly panel: HTMLElement;
  private readonly sens: HTMLInputElement;
  private readonly master: HTMLInputElement;
  private readonly music: HTMLInputElement;
  private readonly sfx: HTMLInputElement;
  private readonly sensVal: HTMLElement;
  private readonly masterVal: HTMLElement;
  private readonly musicVal: HTMLElement;
  private readonly sfxVal: HTMLElement;
  private readonly onChange: (settings: GameSettings) => void;
  private readonly onBack?: (returnTo: SettingsReturnTo) => void;
  private returnTo: SettingsReturnTo = 'main';
  private current: GameSettings;

  constructor(opts: SettingsPanelOptions) {
    this.onChange = opts.onChange;
    this.onBack = opts.onBack;
    this.panel = document.getElementById('settings-panel')!;
    this.sens = document.getElementById('set-sensitivity') as HTMLInputElement;
    this.master = document.getElementById('set-master') as HTMLInputElement;
    this.music = document.getElementById('set-music') as HTMLInputElement;
    this.sfx = document.getElementById('set-sfx') as HTMLInputElement;
    this.sensVal = document.getElementById('set-sensitivity-val')!;
    this.masterVal = document.getElementById('set-master-val')!;
    this.musicVal = document.getElementById('set-music-val')!;
    this.sfxVal = document.getElementById('set-sfx-val')!;

    this.current = load();
    this.syncInputs();
    this.onChange(this.current);

    const bump = () => this.readFromInputs();
    this.sens.addEventListener('input', bump);
    this.master.addEventListener('input', bump);
    this.music.addEventListener('input', bump);
    this.sfx.addEventListener('input', bump);

    document.getElementById('btn-settings-back')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
      this.onBack?.(this.returnTo);
    });
  }

  get settings(): GameSettings {
    return { ...this.current };
  }

  show(returnTo: SettingsReturnTo = 'main'): void {
    this.returnTo = returnTo;
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.panel.classList.add('hidden');
  }

  get visible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  private syncInputs(): void {
    this.sens.value = String(Math.round(this.current.mouseSensitivity * 100));
    this.master.value = String(Math.round(this.current.masterVolume * 100));
    this.music.value = String(Math.round(this.current.musicVolume * 100));
    this.sfx.value = String(Math.round(this.current.sfxVolume * 100));
    this.updateLabels();
  }

  private readFromInputs(): void {
    this.current = {
      mouseSensitivity: clampSens(Number(this.sens.value) / 100),
      masterVolume: clamp01(Number(this.master.value) / 100),
      musicVolume: clamp01(Number(this.music.value) / 100),
      sfxVolume: clamp01(Number(this.sfx.value) / 100),
    };
    this.updateLabels();
    save(this.current);
    this.onChange(this.current);
  }

  private updateLabels(): void {
    this.sensVal.textContent = `${Math.round(this.current.mouseSensitivity * 100)}%`;
    this.masterVal.textContent = `${Math.round(this.current.masterVolume * 100)}%`;
    this.musicVal.textContent = `${Math.round(this.current.musicVolume * 100)}%`;
    this.sfxVal.textContent = `${Math.round(this.current.sfxVolume * 100)}%`;
  }
}
