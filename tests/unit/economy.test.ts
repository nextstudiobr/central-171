import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { Economy, type MoneyEvent } from '../../src/systems/Economy';
import { freshState } from './helpers';

describe('Economy', () => {
  it('pagamento atualiza meta, caixa, total e comissão a partir de um único lançamento', () => {
    const s = freshState(1);
    const events: MoneyEvent[] = [];
    const eco = new Economy(s, (e) => events.push(e));
    eco.payment(500, 'teste');
    expect(s.day.collected).toBe(500);
    expect(s.campaign.operationBalance).toBe(500);
    expect(s.campaign.totalCollected).toBe(500);
    expect(s.campaign.wallet).toBe(Math.round(500 * BALANCE.economy.commissionRate));
    expect(s.day.ledger.map((e) => e.kind)).toEqual(['payment', 'commission']);
    expect(events.at(-1)?.collected).toBe(500);
  });

  it('multa e estorno descontam do arrecadado do dia', () => {
    const s = freshState(1);
    const eco = new Economy(s);
    eco.payment(400, 'a');
    eco.fine(100, 'multa');
    eco.reversal(200, 'estorno');
    expect(s.day.collected).toBe(100);
    expect(s.campaign.operationBalance).toBe(100);
    expect(s.campaign.totalCollected).toBe(200);
    expect(s.campaign.wallet).toBe(Math.round(400 * 0.12) - Math.round(200 * 0.12));
  });

  it('compra falha sem saldo e não cria lançamento', () => {
    const s = freshState(1);
    const eco = new Economy(s);
    expect(eco.purchase(50, 'headset')).toBe(false);
    expect(s.day.ledger).toHaveLength(0);
    eco.bonus(80, 'bônus');
    expect(eco.purchase(50, 'headset')).toBe(true);
    expect(s.campaign.wallet).toBe(30);
  });

  it('rejeita valores inválidos', () => {
    const eco = new Economy(freshState(1));
    expect(() => eco.payment(-5, 'x')).toThrow();
    expect(() => eco.payment(Number.NaN, 'x')).toThrow();
  });
});
