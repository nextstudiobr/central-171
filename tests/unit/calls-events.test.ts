import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { storyCallers } from '../../src/data/callers';
import { dayDef } from '../../src/data/days';
import type { CallerProfile } from '../../src/data/types';
import { createBus, type GameEvents } from '../../src/core/events';
import { CallSystem } from '../../src/systems/CallSystem';
import { Economy } from '../../src/systems/Economy';
import { EventDirector, type DirectorHost } from '../../src/systems/EventDirector';
import { Inbox } from '../../src/systems/Inbox';
import { Risk } from '../../src/systems/Risk';
import { freshState } from './helpers';

/** Monta os sistemas de jogabilidade sem mundo 3D nem interface. */
function rig(day = 1) {
  const state = freshState(day, 99);
  const bus = createBus();
  const seen: Array<keyof GameEvents> = [];
  for (const k of ['call:ring', 'call:start', 'call:end', 'call:missed', 'trigger', 'raid', 'event:start', 'event:end'] as const) {
    bus.on(k, () => seen.push(k));
  }
  const economy = new Economy(state);
  const risk = new Risk(state, (c) => bus.emit('heat', c), () => bus.emit('raid', { day }));
  const calls = new CallSystem(state, economy, risk, bus, 99);
  const inbox = new Inbox(state, bus);
  const zones = { boss_office: false, desk: true, rack: false, breaker: false, shredder: false };
  const narratives: string[] = [];
  const host: DirectorHost = {
    npcVisitPlayer: () => {},
    npcGoTo: () => {},
    npcReturn: () => {},
    npcArrived: () => true,
    setPolice: () => {},
    setBlackout: () => {},
    setNetworkLeds: () => {},
    playerInZone: (z) => zones[z],
    playerSeated: () => true,
    openNarrative: (script, _fx, onClose) => {
      narratives.push(script.id);
      onClose();
    },
    narrativeOpen: () => false,
    setObjective: () => {},
  };
  const director = new EventDirector(state, economy, risk, calls, inbox, bus, host);
  const def = dayDef(day);
  calls.startDay(def);
  director.startDay(def);
  return { state, bus, economy, risk, calls, inbox, director, seen, zones, narratives };
}

function special(id: 'marta' | 'zeIsca' | 'zuleide', scheme = 'netuno'): CallerProfile {
  return { ...storyCallers()[id], schemeId: scheme } as CallerProfile;
}

/** Joga até o pagamento escolhendo a abordagem favorita e pedindo pouco. */
function playToPayment(r: ReturnType<typeof rig>): void {
  for (let i = 0; i < 12 && r.calls.conversation; i++) {
    const conv = r.calls.conversation;
    const ch = conv.currentChoices();
    const pick =
      ch.find((c) => c.kind === 'ask') ??
      ch.find((c) => c.kind === 'answer' && [conv.profile.facts.city, conv.profile.facts.petName, conv.profile.facts.bank, conv.profile.facts.relativeName].some((v) => c.text.includes(`"${v}"`))) ??
      ch.find((c) => c.approach === 'charm') ??
      ch[0];
    r.calls.choose(pick.id);
    r.calls.pauseTimer = 0;
  }
}

describe('CallSystem', () => {
  it('toca, perde a ligação sem atender e registra como perdida', () => {
    const r = rig(1);
    r.calls.update(3);
    expect(r.calls.phase).toBe('ringing');
    r.calls.update(BALANCE.calls.ringTimeoutSec + 1);
    expect(r.calls.phase).toBe('idle');
    expect(r.state.day.calls.at(-1)?.outcome).toBe('missed');
    expect(r.seen).toContain('call:missed');
  });

  it('não toca com a rede fora do ar', () => {
    const r = rig(1);
    r.state.day.networkUp = false;
    r.calls.update(30);
    expect(r.calls.phase).toBe('idle');
  });

  it('primeira ligação do dia 1 é a Dona Cleide; pagamento entra no extrato', () => {
    const r = rig(1);
    r.calls.update(3);
    expect(r.calls.caller?.id).toBe('cleide');
    r.calls.answer();
    r.calls.markFileViewed('cleide');
    playToPayment(r);
    const rec = r.state.day.calls.at(-1)!;
    expect(rec.callerId).toBe('cleide');
    if (rec.outcome === 'paid' || rec.outcome === 'partial') {
      expect(r.state.day.collected).toBe(rec.amount);
      expect(r.state.day.ledger.some((e) => e.kind === 'payment' && e.amount === rec.amount)).toBe(true);
    }
  });

  it('tempo de resposta esgotado derruba a ligação quando a paciência acaba', () => {
    const r = rig(1);
    r.calls.update(3);
    r.calls.answer();
    for (let i = 0; i < 30 && r.calls.phase === 'active'; i++) r.calls.update(BALANCE.calls.responseTimeSec + 10);
    expect(r.state.day.calls.at(-1)?.outcome).toBe('hangup');
  });

  it('rastreio completo aumenta a exposição; desligar antes evita', () => {
    const r = rig(3);
    r.calls.update(6);
    r.calls.answer();
    r.calls.traceActive = true;
    r.calls.update(BALANCE.calls.traceDurationSec + 1);
    expect(r.state.day.calls.at(-1)?.outcome).toBe('traced');
    expect(r.state.campaign.heat).toBeGreaterThanOrEqual(BALANCE.heat.traced);

    const r2 = rig(3);
    r2.calls.update(6);
    r2.calls.answer();
    r2.calls.traceActive = true;
    r2.calls.update(BALANCE.calls.traceDurationSec / 2);
    r2.calls.hangUp();
    expect(r2.state.day.calls.at(-1)?.outcome).toBe('player_hangup');
    expect(r2.state.campaign.heat).toBe(0);
  });

  it('golpe na policial disfarçada vira armadilha: dinheiro estornado e exposição alta', () => {
    const r = rig(3);
    expect(r.calls.ringNow(special('marta'))).toBe(true);
    r.calls.answer();
    const conv = r.calls.conversation!;
    conv.trust = 100;
    conv.suspicion = 0;
    playToPayment(r);
    const rec = r.state.day.calls.at(-1)!;
    expect(rec.outcome).toBe('sting');
    r.calls.update(7);
    expect(r.state.day.collected).toBe(0);
    expect(r.state.campaign.heat).toBeGreaterThanOrEqual(BALANCE.heat.sting);
  });

  it('caçador de golpistas paga com comprovante falso e dispara o vírus', () => {
    const r = rig(3);
    r.calls.ringNow(special('zeIsca'));
    r.calls.answer();
    r.calls.conversation!.trust = 100;
    r.calls.conversation!.suspicion = 0;
    playToPayment(r);
    expect(r.state.day.calls.at(-1)?.outcome).toBe('fake_payment');
    expect(r.state.day.collected).toBe(0);
    expect(r.seen).toContain('trigger');
    r.director.update(0.1);
    expect(r.state.day.pcInfected).toBe(true);
  });

  it('reconhecer a mãe do chefe pela ficha rende bônus', () => {
    const r = rig(4);
    r.calls.ringNow(special('zuleide'));
    r.calls.answer();
    r.calls.markFileViewed('zuleide');
    const rec = r.calls.conversation!.currentChoices().find((c) => c.kind === 'recognize');
    expect(rec).toBeDefined();
    r.calls.choose(rec!.id);
    expect(r.state.day.calls.at(-1)?.outcome).toBe('boss_mom');
    expect(r.state.campaign.wallet).toBe(150);
    expect(r.state.campaign.flags.boss_mom_saved).toBe(true);
  });
});

describe('EventDirector', () => {
  it('queda de rede bloqueia ligações até o roteador ser reiniciado', () => {
    const r = rig(2);
    r.director.start('network_down');
    expect(r.state.day.networkUp).toBe(false);
    expect(r.director.interact('rack')).toBe(true);
    expect(r.state.day.networkUp).toBe(true);
    expect(r.director.isActive('network_down')).toBe(false);
  });

  it('exigência do chefe: cumprir dá bônus, estourar o prazo dá multa', () => {
    const ok = rig(2);
    ok.director.start('boss_demand');
    ok.economy.payment(2000, 'teste');
    ok.director.update(0.1);
    expect(ok.state.day.ledger.some((e) => e.kind === 'bonus')).toBe(true);

    const late = rig(2);
    late.director.start('boss_demand');
    late.state.day.clock = 539;
    late.director.update(0.1);
    expect(late.state.day.ledger.some((e) => e.kind === 'fine')).toBe(true);
  });

  it('chamado do chefe abre a conversa ao entrar na sala; ignorar gera multa', () => {
    const r = rig(2);
    r.director.start('boss_summon');
    r.zones.boss_office = true;
    r.director.update(0.1);
    expect(r.narratives).toContain('boss_summon');

    const r2 = rig(2);
    r2.director.start('boss_summon');
    for (let i = 0; i < 60; i++) r2.director.update(1);
    expect(r2.state.day.ledger.some((e) => e.kind === 'fine')).toBe(true);
  });

  it('exposição em nível 2 inicia investigação; triturar resolve e reduz a exposição', () => {
    const r = rig(3);
    r.risk.add(65, 'teste');
    r.director.update(0.1);
    expect(r.director.isActive('investigation')).toBe(true);
    const before = r.state.campaign.heat;
    expect(r.director.interact('shredder')).toBe(true);
    expect(r.state.campaign.heat).toBe(before - BALANCE.heat.shredRelief);
  });

  it('exposição em 100% dispara a batida policial', () => {
    const r = rig(3);
    r.risk.add(100, 'teste');
    expect(r.seen).toContain('raid');
  });

  it('dívida com o Tonhão: ele derruba a rede; amizade: ele conserta', () => {
    const bad = rig(2);
    bad.state.campaign.relationships.tonhao = -1;
    const said: string[] = [];
    bad.bus.on('speech', (s) => said.push(s.who));
    bad.director.start('network_down');
    expect(said).toContain('tonhao');

    const good = rig(2);
    good.state.campaign.relationships.tonhao = 2;
    good.director.start('network_down');
    for (let i = 0; i < 25; i++) good.director.update(1);
    expect(good.state.day.networkUp).toBe(true);
  });

  it('acordo final com a investigadora só é oferecido a quem conversou com ela', () => {
    const r = rig(5);
    r.calls.update(0);
    r.director.start('final_deal');
    r.director.update(0.1);
    expect(r.calls.privateRing?.id).toBe('final_deal');
    r.calls.answer();
    expect(r.narratives).toContain('final_threat');

    const r2 = rig(5);
    r2.state.campaign.flags.moura_listen = true;
    r2.director.start('final_deal');
    r2.director.update(0.1);
    r2.calls.answer();
    expect(r2.narratives).toContain('final_deal');
  });
});
