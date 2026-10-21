import type { SettingsStore, Settings } from '../systems/Settings';
import { h } from './dom';

/** Formulário de configurações (usado no menu de pausa e no app do desktop). */
export function settingsForm(store: SettingsStore, ttsAvailable: boolean): HTMLElement {
  const grid = h('div', { class: 'settings-grid' });
  const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
    const value = h('span', { style: { fontFamily: 'var(--mono)', marginLeft: '8px', color: 'var(--ink-dim)' } }, fmt(store.values[key] as number));
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) }) as HTMLInputElement;
    input.value = String(store.values[key]);
    input.addEventListener('input', () => {
      store.set(key, Number(input.value) as never);
      value.textContent = fmt(Number(input.value));
    });
    grid.append(h('label', {}, label, value), input);
  };
  const toggle = (key: keyof Settings, label: string, note?: string) => {
    const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
    input.checked = Boolean(store.values[key]);
    input.addEventListener('change', () => store.set(key, input.checked as never));
    grid.append(h('label', {}, label, note ? h('div', { style: { fontSize: '12px', color: 'var(--ink-faint)' } }, note) : null), input);
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  slider('masterVolume', 'Volume geral', 0, 1, 0.05, pct);
  slider('sfxVolume', 'Efeitos', 0, 1, 0.05, pct);
  slider('ambienceVolume', 'Ambiente e música', 0, 1, 0.05, pct);
  slider('voiceVolume', 'Vozes', 0, 1, 0.05, pct);
  toggle('tts', 'Vozes sintetizadas', ttsAvailable ? 'Usa a voz pt-BR instalada no seu sistema.' : 'Nenhuma voz pt-BR local encontrada: usando vozes procedurais.');
  slider('mouseSensitivity', 'Sensibilidade do mouse', 0.3, 2.5, 0.05, (v) => v.toFixed(2));
  toggle('invertY', 'Inverter eixo Y');
  slider('fov', 'Campo de visão', 55, 95, 1, (v) => `${v}°`);
  slider('textSpeed', 'Velocidade do texto', 0.5, 3, 0.25, (v) => `${v.toFixed(2)}×`);
  toggle('reduceEffects', 'Reduzir efeitos visuais', 'Desliga brilho, granulado, balanço de câmera e luzes piscando.');
  toggle('skipTutorial', 'Pular dicas do tutorial');
  return grid;
}
