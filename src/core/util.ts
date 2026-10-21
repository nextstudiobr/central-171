/** Utilitários pequenos compartilhados. */

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolação exponencial independente de taxa de quadros. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Formata tostões (moeda fictícia do jogo). */
export function money(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.round(Math.abs(v));
  return `${sign}T$ ${abs.toLocaleString('pt-BR')}`;
}

/** Converte minutos desde 09:00 em "HH:MM". */
export function clockText(minutes: number): string {
  const total = 9 * 60 + Math.floor(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Substitui {chaves} num texto. Chaves ausentes ficam visíveis para facilitar a depuração. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
