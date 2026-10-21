import type { KeyValueStore } from './Save';

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  voiceVolume: number;
  /** Usa a síntese de voz local do navegador, quando houver voz pt-BR instalada. */
  tts: boolean;
  mouseSensitivity: number;
  invertY: boolean;
  /** Desliga bloom, granulado, balanço de câmera e luzes piscando fortes. */
  reduceEffects: boolean;
  textSpeed: number;
  skipTutorial: boolean;
  fov: number;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  ambienceVolume: 0.6,
  voiceVolume: 0.8,
  tts: true,
  mouseSensitivity: 1,
  invertY: false,
  reduceEffects: false,
  textSpeed: 1,
  skipTutorial: false,
  fov: 70,
};

const KEY = 'central171.settings.v1';

/** Preferências do jogador, salvas separadamente da campanha. */
export class SettingsStore {
  values: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(private readonly store: KeyValueStore | null) {
    this.values = { ...DEFAULT_SETTINGS, ...this.read() };
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.values[key] = value;
    this.write();
    for (const l of this.listeners) l(this.values);
  }

  onChange(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private read(): Partial<Settings> {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Partial<Settings> = {};
      for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
        if (typeof parsed[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = parsed[k];
      }
      return out;
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* sem armazenamento: as preferências valem só nesta sessão */
    }
  }
}
