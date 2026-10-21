import { describe, expect, it } from 'vitest';
import { DAYS, LAST_DAY } from '../../src/data/days';
import { Rng } from '../../src/core/rng';
import { Campaign } from '../../src/systems/Campaign';
import { Economy } from '../../src/systems/Economy';
import { Risk, levelOf } from '../../src/systems/Risk';
import { SaveSystem, validateCampaign, type KeyValueStore } from '../../src/systems/Save';
import { freshState, makeCaller, makeConversation, playRandom, playSmart } from './helpers';

class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('Campaign', () => {
  it('meta batida dá bônus e sobe de patente', () => {
    const s = freshState(1);
    const eco = new Economy(s);
    const camp = new Campaign(s, eco);
    eco.payment(s.day.quota + 10, 'x');
    const r = camp.evaluateDay(false);
    expect(r.stats.result).toBe('met');
    expect(r.bonus).toBeGreaterThan(0);
    expect(r.rankUp).toBe(true);
    expect(s.campaign.strikes).toBe(0);
  });

  it('duas metas perdidas causam demissão', () => {
    const s = freshState(1);
    const eco = new Economy(s);
    const camp = new Campaign(s, eco);
    expect(camp.evaluateDay(false).ending).toBeNull();
    camp.advance();
    camp.beginDay();
    expect(camp.evaluateDay(false).ending).toBe('demitido');
  });

  it('bater a meta no último dia leva ao final "sócio"; acordo leva a "delator"', () => {
    const s = freshState(LAST_DAY);
    const eco = new Economy(s);
    eco.payment(s.day.quota, 'x');
    expect(new Campaign(s, eco).evaluateDay(false).ending).toBe('socio');

    const s2 = freshState(LAST_DAY);
    s2.campaign.flags.deal_accepted = true;
    expect(new Campaign(s2, new Economy(s2)).evaluateDay(false).ending).toBe('delator');
  });

  it('batida policial confisca metade do caixa; duas batidas prendem', () => {
    const s = freshState(2);
    const eco = new Economy(s);
    eco.payment(1000, 'x');
    const camp = new Campaign(s, eco);
    const r = camp.evaluateDay(true);
    expect(r.stats.result).toBe('raided');
    expect(s.campaign.operationBalance).toBe(500);
    s.campaign.raids = 1;
    camp.advance();
    camp.beginDay();
    expect(camp.evaluateDay(true).ending).toBe('preso');
  });

  it('a exposição passa parcialmente para o dia seguinte', () => {
    const s = freshState(1);
    s.campaign.heat = 80;
    new Campaign(s, new Economy(s)).advance();
    expect(s.campaign.heat).toBe(36);
    expect(s.campaign.day).toBe(2);
  });
});

describe('Risk', () => {
  it('níveis e batida em 100', () => {
    const s = freshState(3);
    let raids = 0;
    const risk = new Risk(s, () => {}, () => raids++);
    risk.add(35, 'a');
    expect(risk.level).toBe(1);
    risk.add(70, 'b');
    expect(risk.heat).toBe(100);
    expect(raids).toBe(1);
    expect(levelOf(59)).toBe(1);
    expect(levelOf(60)).toBe(2);
    expect(levelOf(85)).toBe(3);
  });

  it('decai com o tempo, mais rápido no modo discreto', () => {
    const s = freshState(3);
    const risk = new Risk(s);
    risk.add(50, 'x');
    risk.update(40);
    const normal = s.campaign.heat;
    s.day.lowProfile = true;
    risk.update(10);
    expect(normal).toBeCloseTo(40);
    expect(s.campaign.heat).toBeCloseTo(32.5);
  });
});

describe('SaveSystem', () => {
  it('salva e carrega a campanha', () => {
    const store = new MemStore();
    const save = new SaveSystem(store);
    const s = freshState(3);
    s.campaign.wallet = 321;
    expect(save.save(s.campaign)).toBe(true);
    const loaded = save.load();
    expect(loaded?.day).toBe(3);
    expect(loaded?.wallet).toBe(321);
  });

  it('ignora salvamento corrompido ou de campanha encerrada', () => {
    const store = new MemStore();
    store.setItem('central171.save.v1', '{quebrado');
    expect(new SaveSystem(store).load()).toBeNull();
    const s = freshState(2);
    expect(validateCampaign({ ...s.campaign, ending: 'socio' })).toBeNull();
    expect(validateCampaign({ ...s.campaign, day: 99 })).toBeNull();
    expect(validateCampaign(null)).toBeNull();
  });
});

describe('Balanceamento das metas', () => {
  // Um expediente comporta por volta de 5 ligações atendidas.
  const CALLS_PER_DAY = 5;

  it.each(DAYS.map((d) => d.day))('dia %i: jogador atento bate a meta, jogador ao acaso não', (day) => {
    const def = DAYS[day - 1];
    let smartDays = 0;
    let randomDays = 0;
    const trials = 40;
    const rng = new Rng(day * 31);
    const schemes = ['netuno', 'gelomax', 'principe', 'abducao', 'capivara'].slice(0, Math.min(day, 5));
    for (let t = 0; t < trials; t++) {
      let smart = 0;
      let random = 0;
      for (let i = 0; i < CALLS_PER_DAY; i++) {
        const scheme = schemes[(t + i) % schemes.length];
        const p = makeCaller(day, day * 10000 + t * 100 + i, scheme);
        smart += playSmart(makeConversation(p, { seed: t * 7 + i, viewed: true, trace: day >= 3 })).amount;
        random += playRandom(makeConversation(p, { seed: t * 7 + i }), rng).amount;
      }
      if (smart >= def.quota) smartDays++;
      if (random >= def.quota) randomDays++;
    }
    expect(smartDays / trials).toBeGreaterThan(0.7);
    expect(randomDays / trials).toBeLessThan(0.45);
  });
});
