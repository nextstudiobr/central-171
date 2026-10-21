import { BALANCE } from '../data/balance';
import { clamp } from '../core/util';
import type { GameState } from './GameState';

export type HeatLevel = 0 | 1 | 2 | 3;

export const HEAT_LEVEL_LABEL: Record<HeatLevel, string> = {
  0: 'Discreto',
  1: 'Burburinho',
  2: 'Investigação',
  3: 'Cerco',
};

export interface HeatChange {
  heat: number;
  delta: number;
  reason: string;
  level: HeatLevel;
  previousLevel: HeatLevel;
}

/**
 * Exposição da central à polícia fictícia. Sobe com denúncias e rastreios,
 * desce com o tempo e com ações de contenção. Em 100 acontece a batida.
 */
export class Risk {
  constructor(
    private readonly state: GameState,
    private readonly onChange: (c: HeatChange) => void = () => {},
    private readonly onRaid: () => void = () => {},
  ) {}

  get heat(): number {
    return this.state.campaign.heat;
  }

  get level(): HeatLevel {
    return levelOf(this.heat);
  }

  add(amount: number, reason: string): void {
    if (amount === 0) return;
    const prev = this.level;
    const before = this.heat;
    const next = clamp(before + amount, 0, 100);
    this.state.campaign.heat = next;
    this.state.day.heatPeak = Math.max(this.state.day.heatPeak, next);
    this.onChange({ heat: next, delta: next - before, reason, level: this.level, previousLevel: prev });
    if (next >= 100 && before < 100) this.onRaid();
  }

  /** Decaimento contínuo; dt em minutos de jogo. */
  update(gameMinutes: number): void {
    if (this.heat <= 0) return;
    const rate = BALANCE.heat.decayPerMinute * (this.state.day.lowProfile ? 3 : 1);
    const prevLevel = this.level;
    this.state.campaign.heat = clamp(this.heat - rate * gameMinutes, 0, 100);
    if (this.level !== prevLevel) {
      this.onChange({ heat: this.heat, delta: 0, reason: 'O burburinho diminuiu.', level: this.level, previousLevel: prevLevel });
    }
  }

  /** Multiplicador de velocidade de rastreio conforme o nível de exposição. */
  traceSpeedFactor(): number {
    return 1 + this.level * 0.15;
  }
}

export function levelOf(heat: number): HeatLevel {
  const [a, b, c] = BALANCE.heat.levels;
  if (heat >= c) return 3;
  if (heat >= b) return 2;
  if (heat >= a) return 1;
  return 0;
}
