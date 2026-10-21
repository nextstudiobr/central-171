import { describe, expect, it } from 'vitest';
import { archetypeById } from '../../src/data/archetypes';
import { storyCallers } from '../../src/data/callers';
import { schemeById } from '../../src/data/schemes';
import type { CallerProfile } from '../../src/data/types';
import { Rng } from '../../src/core/rng';
import { classify, Conversation } from '../../src/systems/Dialogue';
import { makeCaller, makeConversation, playRandom, playSmart } from './helpers';

function cleide(): CallerProfile {
  const c = storyCallers().cleide;
  return { ...c, schemeId: 'netuno' };
}

describe('Conversation', () => {
  it('é determinística para a mesma semente', () => {
    const p = makeCaller(2, 99);
    const a = makeConversation(p, { seed: 5, viewed: true });
    const b = makeConversation(p, { seed: 5, viewed: true });
    expect(a.start()).toEqual(b.start());
    expect(playSmart(a)).toEqual(playSmart(b));
  });

  it('a opção "Ficha" só aparece depois de abrir a ficha', () => {
    const p = makeCaller(1, 3);
    const closed = makeConversation(p, { viewed: false });
    closed.start();
    expect(closed.currentChoices().some((c) => c.kind === 'facts')).toBe(false);
    const open = makeConversation(p, { viewed: true });
    open.start();
    expect(open.currentChoices().some((c) => c.kind === 'facts')).toBe(true);
  });

  it('abordagem favorita aumenta a confiança; abordagem odiada aumenta a desconfiança', () => {
    const p = cleide();
    const love = makeConversation(p);
    love.start();
    const r1 = love.choose('n1c'); // simpatia: Dona Cleide adora
    expect(r1.deltas.trust).toBeGreaterThan(10);
    const hate = makeConversation(p);
    hate.start();
    const r2 = hate.choose('n1u'); // urgência: Dona Cleide odeia
    expect(r2.deltas.suspicion).toBeGreaterThan(5);
    expect(['dislike', 'hate']).toContain(r2.reaction);
  });

  it('repetir a mesma abordagem rende menos e levanta suspeita', () => {
    const p = cleide();
    const conv = makeConversation(p);
    conv.start();
    const first = conv.choose('n1c');
    const second = conv.choose('n2c');
    expect(second.deltas.trust).toBeLessThan(first.deltas.trust);
  });

  it('a pergunta forçada da Dona Cleide aparece após a segunda etapa e pune resposta errada', () => {
    const p = cleide();
    const conv = makeConversation(p, { questions: false });
    conv.start();
    conv.choose('n1c');
    const r = conv.choose('n2a');
    expect(conv.phase).toBe('question');
    expect(r.next?.stageTitle).toBe('Verificação');
    const wrong = conv.currentChoices().find((c) => c.kind === 'answer' && !c.text.includes('"Bigode"'))!;
    const before = conv.suspicion;
    conv.choose(wrong.id);
    expect(conv.suspicion).toBeGreaterThanOrEqual(before + 25);
  });

  it('pedir TUDO sem confiança é recusado; pedir pouco com confiança é pago', () => {
    const p = cleide();
    const conv = makeConversation(p);
    const ratioAll = 1;
    expect(conv.paymentScore(ratioAll)).toBeLessThan(25);
    conv.trust = 85;
    conv.suspicion = 5;
    expect(conv.paymentScore(0.25)).toBeGreaterThan(25);
  });

  it('suspeita máxima encerra com denúncia', () => {
    const p = makeCaller(3, 11);
    const conv = makeConversation(p);
    conv.start();
    conv.suspicion = 95;
    const choice = conv.currentChoices().find((c) => c.approach === 'urgency')!;
    const arch = archetypeById(p.archetypeId);
    const r = conv.choose(choice.id);
    if (arch.prefs.urgency < 1) {
      expect(r.outcome?.kind).toBe('reported');
      expect(conv.phase).toBe('ended');
    }
  });

  it('tempo esgotado gasta paciência e pode derrubar a ligação', () => {
    const conv = makeConversation(makeCaller(1, 5));
    conv.start();
    let hung = false;
    for (let i = 0; i < 10 && !hung; i++) hung = conv.timeout().hungUp;
    expect(hung).toBe(true);
    expect(conv.phase).toBe('ended');
  });

  it('investigadora pode ser desmascarada quando o número está na Lista Quente', () => {
    const marta = { ...storyCallers().marta, schemeId: 'principe' } as CallerProfile;
    const conv = new Conversation(marta, archetypeById('vovo'), schemeById('principe'), {
      rng: new Rng(1),
      questions: false,
      trace: true,
      suspicionBonus: 0,
      coldRead: false,
      fileViewed: () => false,
      hotListed: () => true,
    });
    conv.start();
    const unmask = conv.currentChoices().find((c) => c.kind === 'unmask');
    expect(unmask).toBeDefined();
    expect(conv.choose(unmask!.id).outcome?.kind).toBe('unmasked');
  });

  it('jogar bem rende mais que jogar ao acaso (100 ligações)', () => {
    let smart = 0;
    let random = 0;
    const rng = new Rng(8);
    for (let i = 0; i < 100; i++) {
      const p = makeCaller(3, 1000 + i, i % 2 ? 'netuno' : 'gelomax');
      smart += playSmart(makeConversation(p, { seed: i, viewed: true })).amount;
      random += playRandom(makeConversation(p, { seed: i, viewed: false }), rng).amount;
    }
    expect(smart).toBeGreaterThan(random * 1.6);
  });

  it('classify segue os limiares', () => {
    expect(classify(20, 0)).toBe('love');
    expect(classify(8, 0)).toBe('like');
    expect(classify(0, 0)).toBe('neutral');
    expect(classify(0, 10)).toBe('dislike');
    expect(classify(-5, 20)).toBe('hate');
  });
});
