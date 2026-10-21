import { BALANCE } from '../data/balance';
import { BOSS_DAY_END } from '../data/npcs';
import { LAST_DAY, RANKS, dayDef } from '../data/days';
import type { DayDef } from '../data/types';
import { Rng, hashSeed } from '../core/rng';
import type { Economy } from './Economy';
import { GameState, newCampaign, newDay, type DayStats, type Ending } from './GameState';

export interface DayResult {
  stats: DayStats;
  strikeAdded: boolean;
  bonus: number;
  rankUp: boolean;
  rank: string;
  bossLine: string;
  ending: Ending | null;
}

/** Estatísticas do expediente derivadas do extrato e do registro de ligações. */
export function computeStats(state: GameState, result: DayStats['result']): DayStats {
  const d = state.day;
  const paid = d.calls.filter((c) => c.outcome === 'paid' || c.outcome === 'partial');
  const fails = d.calls.filter((c) => ['refused', 'hangup', 'reported', 'traced', 'sting', 'fake_payment'].includes(c.outcome));
  return {
    day: d.day,
    quota: d.quota,
    collected: d.collected,
    fines: -d.ledger.filter((e) => e.kind === 'fine').reduce((s, e) => s + e.amount, 0),
    bonuses: d.ledger.filter((e) => e.kind === 'bonus').reduce((s, e) => s + e.amount, 0),
    calls: d.calls.filter((c) => c.outcome !== 'missed').length,
    successes: paid.length,
    failures: fails.length,
    missed: d.calls.filter((c) => c.outcome === 'missed').length,
    reports: d.calls.filter((c) => c.outcome === 'reported').length,
    traces: d.calls.filter((c) => c.outcome === 'traced').length,
    heatPeak: Math.round(d.heatPeak),
    result,
  };
}

/** Ciclo da campanha: começo e avaliação de cada expediente, patentes e finais. */
export class Campaign {
  constructor(
    private readonly state: GameState,
    private readonly economy: Economy,
  ) {}

  static fresh(seed: number): GameState {
    const c = newCampaign(seed);
    return new GameState(c, newDay(1, dayDef(1).quota));
  }

  get def(): DayDef {
    return dayDef(this.state.campaign.day);
  }

  /** Reinicia o estado do dia atual. */
  beginDay(): DayDef {
    const def = this.def;
    this.state.day = newDay(def.day, def.quota);
    this.state.day.heatPeak = this.state.campaign.heat;
    return def;
  }

  /** Avalia o expediente encerrado e aplica advertências, bônus e patente. */
  evaluateDay(raided: boolean): DayResult {
    const s = this.state;
    const c = s.campaign;
    const def = this.def;
    const rng = new Rng(hashSeed(c.seed, def.day, 404));
    const ratio = s.quotaProgress;
    let result: DayStats['result'];
    let strikeAdded = false;
    let bonus = 0;
    let rankUp = false;

    if (raided) {
      result = 'raided';
      c.raids++;
      const fine = Math.max(0, Math.round(Math.max(0, c.operationBalance) * BALANCE.campaign.raidFine));
      if (fine > 0) this.economy.fine(fine, 'Batida policial: apreensão do caixa');
      c.strikes++;
      strikeAdded = true;
      c.relationships.boss -= 2;
    } else if (ratio >= BALANCE.economy.excellentThreshold) {
      result = 'excellent';
      bonus = Math.round(def.quota * (BALANCE.economy.quotaBonusRate + BALANCE.economy.excellentBonusRate));
    } else if (ratio >= 1) {
      result = 'met';
      bonus = Math.round(def.quota * BALANCE.economy.quotaBonusRate);
    } else {
      result = 'missed';
      c.strikes++;
      strikeAdded = true;
      c.relationships.boss -= 1;
    }
    if (bonus > 0) {
      this.economy.bonus(bonus, result === 'excellent' ? 'Bônus de desempenho excepcional' : 'Bônus por bater a meta');
      if (c.rankIndex < RANKS.length - 2) {
        c.rankIndex++;
        rankUp = true;
      }
    }
    const stats = computeStats(s, result);
    c.history.push(stats);
    s.day.finished = true;

    const ending = this.endingAfter(stats);
    if (ending === 'socio') {
      c.rankIndex = RANKS.length - 1;
      rankUp = true;
    }
    c.ending = ending;
    return {
      stats,
      strikeAdded,
      bonus,
      rankUp,
      rank: RANKS[c.rankIndex],
      bossLine: rng.pick(BOSS_DAY_END[result]),
      ending,
    };
  }

  /** Decide se a campanha terminou e com qual final. */
  endingAfter(stats: DayStats): Ending | null {
    const c = this.state.campaign;
    if (c.flags.deal_accepted && stats.day === LAST_DAY) return 'delator';
    if (c.raids >= BALANCE.campaign.maxRaids) return 'preso';
    if (stats.result === 'raided' && stats.day === LAST_DAY) return 'preso';
    if (c.strikes >= BALANCE.campaign.maxStrikes) return 'demitido';
    if (stats.day === LAST_DAY) return stats.result === 'missed' ? 'demitido' : 'socio';
    return null;
  }

  /** Avança para o próximo dia, levando parte da exposição junto. */
  advance(): void {
    const c = this.state.campaign;
    c.day = Math.min(LAST_DAY, c.day + 1);
    c.heat = Math.round(c.heat * BALANCE.heat.carryOver);
  }
}
