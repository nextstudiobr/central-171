import { BALANCE } from '../data/balance';
import type { GameState, LedgerEntry, LedgerKind } from './GameState';

export interface MoneyEvent {
  entry: LedgerEntry;
  collected: number;
  quota: number;
  wallet: number;
  balance: number;
}

/**
 * Toda movimentação de dinheiro fictício passa por aqui e vira uma linha do
 * extrato. Assim meta, saldo, comissão e estatísticas nunca divergem.
 */
export class Economy {
  private nextId = 1;

  constructor(
    private readonly state: GameState,
    private readonly onChange: (ev: MoneyEvent) => void = () => {},
  ) {
    for (const e of state.day.ledger) this.nextId = Math.max(this.nextId, e.id + 1);
  }

  /** Pagamento de uma vítima fictícia: conta para a meta e gera comissão. */
  payment(amount: number, note: string): LedgerEntry {
    const v = this.sanitize(amount);
    const s = this.state;
    s.day.collected += v;
    s.campaign.operationBalance += v;
    s.campaign.totalCollected += v;
    const entry = this.add('payment', v, note);
    const commission = Math.round(v * BALANCE.economy.commissionRate);
    if (commission > 0) {
      s.campaign.wallet += commission;
      this.add('commission', commission, `Comissão: ${note}`);
    }
    return entry;
  }

  /** Multa: desconta do arrecadado do dia e do caixa. */
  fine(amount: number, note: string): LedgerEntry {
    const v = this.sanitize(amount);
    this.state.day.collected -= v;
    this.state.campaign.operationBalance -= v;
    return this.add('fine', -v, note);
  }

  /** Estorno de um pagamento (comprovante falso, bloqueio judicial...). */
  reversal(amount: number, note: string): LedgerEntry {
    const v = this.sanitize(amount);
    const s = this.state;
    s.day.collected -= v;
    s.campaign.operationBalance -= v;
    s.campaign.totalCollected -= v;
    const commission = Math.round(v * BALANCE.economy.commissionRate);
    s.campaign.wallet = Math.max(0, s.campaign.wallet - commission);
    return this.add('reversal', -v, note);
  }

  /** Bônus pessoal pago pelo chefe (vai para a comissão do jogador). */
  bonus(amount: number, note: string): LedgerEntry {
    const v = this.sanitize(amount);
    this.state.campaign.wallet += v;
    return this.add('bonus', v, note);
  }

  /** Compra com a comissão. Devolve false se não houver saldo. */
  purchase(cost: number, note: string): boolean {
    const v = this.sanitize(cost);
    if (this.state.campaign.wallet < v) return false;
    this.state.campaign.wallet -= v;
    this.add('purchase', -v, note);
    return true;
  }

  /** Gasto pessoal opcional (empréstimo a colega, dica da Pri...). */
  spendWallet(cost: number, note: string): boolean {
    return this.purchase(cost, note);
  }

  private sanitize(v: number): number {
    if (!Number.isFinite(v) || v < 0) throw new Error(`Valor inválido: ${v}`);
    return Math.round(v);
  }

  private add(kind: LedgerKind, amount: number, note: string): LedgerEntry {
    const s = this.state;
    const entry: LedgerEntry = { id: this.nextId++, day: s.day.day, clock: s.day.clock, kind, amount, note };
    s.day.ledger.push(entry);
    this.onChange({
      entry,
      collected: s.day.collected,
      quota: s.day.quota,
      wallet: s.campaign.wallet,
      balance: s.campaign.operationBalance,
    });
    return entry;
  }
}
