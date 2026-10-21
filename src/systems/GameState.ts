import type { CallerSpecial } from '../data/types';

/** Resultados possíveis de uma ligação. */
export type CallOutcome =
  | 'paid'
  | 'partial'
  | 'refused'
  | 'hangup'
  | 'reported'
  | 'traced'
  | 'missed'
  | 'player_hangup'
  | 'sting'
  | 'fake_payment'
  | 'boss_mom'
  | 'unmasked'
  | 'special';

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  paid: 'Pagou',
  partial: 'Pagou parte',
  refused: 'Recusou',
  hangup: 'Desligou',
  reported: 'Denunciou',
  traced: 'Rastreado',
  missed: 'Perdida',
  player_hangup: 'Você desligou',
  sting: 'Armadilha policial',
  fake_payment: 'Comprovante falso',
  boss_mom: 'Mãe do chefe',
  unmasked: 'Desmascarado',
  special: 'Especial',
};

export type LedgerKind = 'payment' | 'fine' | 'bonus' | 'reversal' | 'purchase' | 'commission';

export interface LedgerEntry {
  id: number;
  day: number;
  clock: number;
  kind: LedgerKind;
  amount: number;
  note: string;
}

export interface CallRecord {
  id: number;
  day: number;
  clock: number;
  callerId: string;
  callerName: string;
  number: string;
  schemeId: string;
  special: CallerSpecial;
  outcome: CallOutcome;
  amount: number;
}

export interface DayStats {
  day: number;
  quota: number;
  collected: number;
  fines: number;
  bonuses: number;
  calls: number;
  successes: number;
  failures: number;
  missed: number;
  reports: number;
  traces: number;
  heatPeak: number;
  result: 'excellent' | 'met' | 'missed' | 'raided';
}

export type Ending = 'socio' | 'demitido' | 'preso' | 'delator';

export interface CampaignState {
  version: 1;
  seed: number;
  day: number;
  strikes: number;
  raids: number;
  /** Caixa total da operação (dinheiro fictício). */
  operationBalance: number;
  /** Comissão pessoal do jogador. */
  wallet: number;
  totalCollected: number;
  rankIndex: number;
  upgrades: string[];
  history: DayStats[];
  heat: number;
  relationships: { boss: number; tonhao: number; pri: number; juninho: number };
  flags: Record<string, boolean | number | string>;
  /** Interlocutores que já ligaram (não repetem). */
  usedCallers: string[];
  /** Números marcados na Lista Quente. */
  hotList: Array<{ number: string; label: string }>;
  ending: Ending | null;
}

export interface DayState {
  day: number;
  quota: number;
  /** Arrecadado no expediente (conta para a meta). */
  collected: number;
  /** Minutos desde as 09:00 (0..540). */
  clock: number;
  ledger: LedgerEntry[];
  calls: CallRecord[];
  heatPeak: number;
  networkUp: boolean;
  powerUp: boolean;
  pcInfected: boolean;
  pcCrashed: boolean;
  lowProfile: boolean;
  /** Ligações restantes com o bônus do café. */
  coffeeCalls: number;
  finished: boolean;
}

export function newCampaign(seed: number): CampaignState {
  return {
    version: 1,
    seed,
    day: 1,
    strikes: 0,
    raids: 0,
    operationBalance: 0,
    wallet: 0,
    totalCollected: 0,
    rankIndex: 0,
    upgrades: [],
    history: [],
    heat: 0,
    relationships: { boss: 0, tonhao: 0, pri: 0, juninho: 0 },
    flags: {},
    usedCallers: [],
    hotList: [],
    ending: null,
  };
}

export function newDay(day: number, quota: number): DayState {
  return {
    day,
    quota,
    collected: 0,
    clock: 0,
    ledger: [],
    calls: [],
    heatPeak: 0,
    networkUp: true,
    powerUp: true,
    pcInfected: false,
    pcCrashed: false,
    lowProfile: false,
    coffeeCalls: 0,
    finished: false,
  };
}

/**
 * Contêiner único do estado da partida. Todos os sistemas leem e escrevem aqui;
 * nenhum sistema mantém cópias próprias de dinheiro, meta ou risco.
 */
export class GameState {
  campaign: CampaignState;
  day: DayState;

  constructor(campaign: CampaignState, day: DayState) {
    this.campaign = campaign;
    this.day = day;
  }

  hasUpgrade(id: string): boolean {
    return this.campaign.upgrades.includes(id);
  }

  /** Progresso da meta do dia (0..∞). */
  get quotaProgress(): number {
    return this.day.quota > 0 ? this.day.collected / this.day.quota : 0;
  }
}
