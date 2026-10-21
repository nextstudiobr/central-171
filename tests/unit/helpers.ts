import { archetypeById } from '../../src/data/archetypes';
import { dayDef } from '../../src/data/days';
import { schemeById } from '../../src/data/schemes';
import type { CallerProfile } from '../../src/data/types';
import { Rng } from '../../src/core/rng';
import { CallerFactory } from '../../src/systems/CallerFactory';
import { Conversation, type ChoiceView } from '../../src/systems/Dialogue';
import { Campaign } from '../../src/systems/Campaign';
import { Economy } from '../../src/systems/Economy';
import type { GameState } from '../../src/systems/GameState';

/** Estado novo de campanha, já no dia pedido. */
export function freshState(day = 1, seed = 42): GameState {
  const s = Campaign.fresh(seed);
  s.campaign.day = day;
  const c = new Campaign(s, new Economy(s));
  c.beginDay();
  return s;
}

export function makeCaller(day: number, seed: number, scheme = 'netuno'): CallerProfile {
  return new CallerFactory(new Rng(seed)).generate(dayDef(day), scheme, new Set());
}

export function makeConversation(
  profile: CallerProfile,
  opts: { seed?: number; viewed?: boolean; questions?: boolean; trace?: boolean; hot?: boolean } = {},
): Conversation {
  return new Conversation(profile, archetypeById(profile.archetypeId), schemeById(profile.schemeId), {
    rng: new Rng(opts.seed ?? 7),
    questions: opts.questions ?? true,
    trace: opts.trace ?? false,
    suspicionBonus: 0,
    coldRead: false,
    fileViewed: () => opts.viewed ?? false,
    hotListed: () => opts.hot ?? false,
  });
}

/** Estratégia de jogador competente: usa a ficha, a abordagem favorita e responde certo. */
export function playSmart(conv: Conversation): { amount: number; kind: string } {
  let guard = 0;
  while (conv.phase !== 'ended' && guard++ < 20) {
    const choices = conv.currentChoices();
    let pick: ChoiceView;
    if (conv.phase === 'payment') {
      const asks = choices.filter((c) => c.kind === 'ask');
      // Escolhe o maior pedido cuja pontuação passa do limiar com folga.
      const w = conv.profile.wealth;
      pick = [...asks].reverse().find((c) => conv.paymentScore((c.amount ?? 0) / w) >= 32) ?? asks[0];
    } else if (conv.phase === 'question') {
      const answer = correctAnswer(conv, choices);
      pick = answer ?? choices[0];
    } else {
      const facts = choices.find((c) => c.kind === 'facts');
      if (facts && conv.archetype.prefs.facts >= 1.2) pick = facts;
      else {
        const stage = choices.filter((c) => c.kind === 'stage' && c.approach !== conv.lastApproach);
        pick = stage.sort((a, b) => conv.archetype.prefs[b.approach!] - conv.archetype.prefs[a.approach!])[0];
        if (conv.suspicion > 60) pick = choices.find((c) => c.kind === 'calm') ?? pick;
      }
    }
    const r = conv.choose(pick.id);
    if (r.outcome) return { amount: r.outcome.amount, kind: r.outcome.kind };
  }
  return { amount: 0, kind: 'none' };
}

function correctAnswer(conv: Conversation, choices: ChoiceView[]): ChoiceView | undefined {
  const f = conv.profile.facts;
  const values = [f.petName, f.city, f.bank, f.relativeName];
  return choices.find((c) => c.kind === 'answer' && values.some((v) => c.text.includes(`"${v}"`)));
}

/** Estratégia aleatória: representa um jogador que não presta atenção. */
export function playRandom(conv: Conversation, rng: Rng): { amount: number; kind: string } {
  let guard = 0;
  while (conv.phase !== 'ended' && guard++ < 20) {
    const choices = conv.currentChoices().filter((c) => c.kind !== 'unmask' && c.kind !== 'recognize');
    const r = conv.choose(rng.pick(choices).id);
    if (r.outcome) return { amount: r.outcome.amount, kind: r.outcome.kind };
  }
  return { amount: 0, kind: 'none' };
}
