import { BALANCE } from '../data/balance';
import { CALM_LINES, FACT_LINES } from '../data/schemes';
import { FACT_POOLS } from '../data/callers';
import type { Approach, Archetype, CallerProfile, FactKey, ReactionKind, Scheme } from '../data/types';
import { APPROACH_LABEL } from '../data/types';
import { Rng } from '../core/rng';
import { clamp, fill, roundTo } from '../core/util';

export type ChoiceKind = 'stage' | 'facts' | 'calm' | 'answer' | 'evasive' | 'ask' | 'unmask' | 'recognize';

export interface ChoiceView {
  id: string;
  kind: ChoiceKind;
  text: string;
  label: string;
  approach?: Approach;
  amount?: number;
  /** Abordagem favorita (só aparece com a apostila de leitura fria). */
  favorite?: boolean;
}

export interface Turn {
  callerLines: string[];
  choices: ChoiceView[];
  stageTitle: string;
}

/** Desfecho decidido pelo diálogo; efeitos especiais ficam com o sistema de ligações. */
export interface DialogueOutcome {
  kind: 'paid' | 'partial' | 'refused' | 'reported' | 'hangup' | 'unmasked' | 'recognized';
  amount: number;
}

export interface ChoiceResult {
  playerLine: string;
  reaction: ReactionKind | 'correct' | 'wrong' | 'evasive' | 'payment';
  callerLines: string[];
  deltas: { trust: number; suspicion: number; patience: number };
  outcome: DialogueOutcome | null;
  startTrace: boolean;
  next: Turn | null;
}

export interface ConversationOptions {
  rng: Rng;
  questions: boolean;
  trace: boolean;
  suspicionBonus: number;
  coldRead: boolean;
  /** A ficha deste interlocutor foi aberta no Arquivo de Casos durante a ligação? */
  fileViewed: () => boolean;
  /** O número está na Lista Quente? */
  hotListed: () => boolean;
}

type Phase = 'stage' | 'question' | 'payment' | 'ended';

interface Question {
  key: FactKey;
  prompt: string;
  answers: string[];
  correct: number;
}

const PAYMENT_PROMPTS = [
  'Tá bom... e agora, o que eu faço?',
  'Certo. E como funciona o pagamento?',
  'Tá. Fala logo quanto é.',
  'Hum. E quanto custa essa brincadeira?',
];

const ASK_LABELS = ['Pedir pouco', 'Pedir o justo', 'Pedir alto', 'Pedir TUDO'];

const FACT_ORDER: FactKey[] = ['pet', 'relative', 'city', 'bank', 'team', 'hobby'];

/**
 * Uma conversa com estado entre o jogador e um interlocutor fictício.
 * Lógica pura: não toca em áudio, interface nem relógio, o que a torna testável.
 */
export class Conversation {
  trust: number;
  suspicion: number;
  patience: number;
  phase: Phase = 'stage';
  stageIndex = 0;
  urgencyUses = 0;
  lastApproach: Approach | null = null;
  usedFacts: FactKey[] = [];
  questionAsked = false;
  traceChecked = false;
  turns = 0;
  private question: Question | null = null;
  private readonly vars: Record<string, string | number>;

  constructor(
    readonly profile: CallerProfile,
    readonly archetype: Archetype,
    readonly scheme: Scheme,
    private readonly opts: ConversationOptions,
  ) {
    this.trust = archetype.trust;
    this.suspicion = clamp(archetype.suspicion + opts.suspicionBonus, 0, 95);
    this.patience = archetype.patience;
    if (profile.warmLead) {
      this.trust = clamp(this.trust + 22, 0, 100);
      this.suspicion = clamp(this.suspicion - 10, 0, 100);
    }
    const f = profile.facts;
    this.vars = {
      petName: f.petName,
      petType: f.petType,
      relativeName: f.relativeName,
      relation: f.relation,
      city: f.city,
      bank: f.bank,
      team: f.team,
      hobby: f.hobby,
      name: profile.name,
    };
  }

  get rng(): Rng {
    return this.opts.rng;
  }

  /** Primeira fala do interlocutor e as opções da primeira etapa. */
  start(): Turn {
    const greet = this.line(this.archetype.lines.greet);
    const opening = this.rng.pick(this.scheme.openings);
    return {
      callerLines: [greet, opening, this.rng.pick(this.scheme.stages[0].prompts)],
      choices: this.stageChoices(),
      stageTitle: this.scheme.stages[0].title,
    };
  }

  /** Turno atual sem avançar (para reabrir a interface). */
  currentChoices(): ChoiceView[] {
    if (this.phase === 'stage') return this.stageChoices();
    if (this.phase === 'question') return this.questionChoices();
    if (this.phase === 'payment') return this.paymentChoices();
    return [];
  }

  currentTitle(): string {
    if (this.phase === 'stage') return this.scheme.stages[this.stageIndex].title;
    if (this.phase === 'question') return 'Verificação';
    if (this.phase === 'payment') return 'Pagamento';
    return 'Fim';
  }

  /** Aplica a escolha do jogador. */
  choose(choiceId: string): ChoiceResult {
    if (this.phase === 'ended') throw new Error('Conversa encerrada');
    const choice = this.currentChoices().find((c) => c.id === choiceId);
    if (!choice) throw new Error(`Escolha inválida: ${choiceId}`);
    this.turns++;
    const before = { trust: this.trust, suspicion: this.suspicion, patience: this.patience };

    if (choice.kind === 'unmask' || choice.kind === 'recognize') {
      this.phase = 'ended';
      return this.result(choice.text, 'neutral', [], before, {
        kind: choice.kind === 'unmask' ? 'unmasked' : 'recognized',
        amount: 0,
      });
    }

    if (this.phase === 'payment') return this.resolvePayment(choice, before);
    if (this.phase === 'question') return this.resolveQuestion(choice, before);
    return this.resolveStage(choice, before);
  }

  /** O jogador demorou demais para responder. */
  timeout(): { line: string; hungUp: boolean } {
    this.patience = clamp(this.patience - BALANCE.calls.responseTimeoutPatience, 0, 100);
    if (this.patience <= 0) {
      this.phase = 'ended';
      return { line: this.line(this.archetype.lines.hangup), hungUp: true };
    }
    return { line: this.line(this.archetype.lines.timeout), hungUp: false };
  }

  interjectLine(): string {
    return this.line(this.archetype.lines.interject);
  }

  backLine(): string {
    return this.line(this.archetype.lines.back);
  }

  traceLine(): string {
    const pool = this.archetype.lines.trace;
    return pool.length ? this.line(pool) : 'Só um instante, fica na linha... tem um barulhinho aqui.';
  }

  /** Valores oferecidos na etapa de pagamento. */
  askAmounts(): number[] {
    return BALANCE.dialogue.askTiers.map((t) => Math.max(10, roundTo(this.profile.wealth * t, 10)));
  }

  /** Pontuação da decisão de pagamento (exposta para testes e balanceamento). */
  paymentScore(askRatio: number, noise = 0): number {
    const p = BALANCE.dialogue.payment;
    const urgency = Math.min(p.urgencyMax, this.urgencyUses * p.urgencyPerUse);
    return (
      p.base +
      this.trust -
      p.suspicionWeight * this.suspicion +
      p.gullibilityWeight * this.archetype.gullibility +
      urgency -
      p.askWeight * askRatio +
      noise
    );
  }

  // ---------------------------------------------------------------- etapas

  private resolveStage(choice: ChoiceView, before: Snapshot): ChoiceResult {
    const d = BALANCE.dialogue;
    const playerLine = choice.text;
    this.repeatFlag = false;
    if (choice.kind === 'facts') {
      const key = choice.id.split(':')[1] as FactKey;
      this.usedFacts.push(key);
      this.trust += d.factsTrust * Math.max(0.6, this.archetype.prefs.facts / 1.5);
      this.suspicion -= d.factsSuspicionDrop;
      this.patience -= d.patienceCostPerTurn * 0.6;
      this.lastApproach = 'facts';
    } else if (choice.kind === 'calm') {
      this.suspicion -= d.calmSuspicionDrop * Math.max(0.5, this.archetype.prefs.calm);
      this.trust -= d.calmTrustLoss;
      this.patience -= d.calmPatienceCost;
      this.lastApproach = 'calm';
    } else if (choice.approach) {
      const opt = this.scheme.stages[this.stageIndex].options.find((o) => o.id === choice.id);
      this.applyApproach(choice.approach, opt?.power ?? 1);
    }
    this.clampAll();

    const reaction = classify(this.trust - before.trust, this.suspicion - before.suspicion);
    const lines: string[] = [];
    if (choice.kind === 'stage' && this.repeatFlag) {
      lines.push(this.line(this.archetype.lines.repeat));
    }
    lines.push(this.line(this.archetype.lines[reaction]));

    const end = this.checkBreak();
    if (end) {
      lines.push(end.line);
      this.phase = 'ended';
      return this.result(playerLine, reaction, lines, before, end.outcome);
    }

    const startTrace = this.checkTrace();
    // Recuar mantém a etapa atual: o jogador ganha fôlego mas não avança.
    if (choice.kind !== 'calm') this.advance();
    const next = this.nextTurn();
    return { ...this.result(playerLine, reaction, lines, before, null), startTrace, next };
  }

  private repeatFlag = false;

  private applyApproach(approach: Approach, power: number): void {
    const d = BALANCE.dialogue;
    const a = this.archetype;
    const aff = a.prefs[approach];
    const repeated = this.lastApproach === approach;
    this.repeatFlag = repeated;
    const factor = power * (repeated ? d.repeatFactor : 1);
    const gull = a.gullibility;

    if (approach === 'absurd') {
      const chance = clamp(0.35 + gull * 0.5 + (aff - 1) * 0.15, 0.05, 0.92);
      if (this.rng.next() < chance) {
        this.trust += d.trustGain * 1.4 * factor * Math.max(aff, 0.6) * (0.6 + gull * 0.8);
        this.suspicion -= d.suspicionDropLike;
      } else {
        this.suspicion += 14 * factor * (1.3 - gull);
        this.trust -= 2;
      }
    } else if (aff >= 1) {
      this.trust += d.trustGain * factor * aff * (0.6 + gull * 0.8);
      this.suspicion -= d.suspicionDropLike * factor;
    } else {
      this.trust += 4 * factor * aff;
      this.suspicion += d.suspicionGainDislike * factor * (1 - aff) * (1.2 - gull);
    }
    if (approach === 'urgency') this.urgencyUses++;
    if (repeated) this.suspicion += d.repeatSuspicion;
    this.patience -= d.patienceCostPerTurn + (aff < 0.5 ? d.patienceCostDislike : 0);
    this.lastApproach = approach;
  }

  private advance(): void {
    const finished = this.stageIndex;
    const wantsQuestion =
      !this.questionAsked &&
      (this.profile.forcedQuestionStage === finished ||
        (this.opts.questions &&
          this.profile.forcedQuestionStage === undefined &&
          finished < this.scheme.stages.length - 1 &&
          this.rng.chance(this.archetype.questionChance * 0.55)));
    if (wantsQuestion && this.buildQuestion()) {
      this.phase = 'question';
      this.questionAsked = true;
      return;
    }
    this.stageIndex++;
    if (this.stageIndex >= this.scheme.stages.length) this.phase = 'payment';
  }

  private nextTurn(): Turn {
    if (this.phase === 'question' && this.question) {
      return { callerLines: [this.question.prompt], choices: this.questionChoices(), stageTitle: 'Verificação' };
    }
    if (this.phase === 'payment') {
      return { callerLines: [this.rng.pick(PAYMENT_PROMPTS)], choices: this.paymentChoices(), stageTitle: 'Pagamento' };
    }
    const stage = this.scheme.stages[this.stageIndex];
    return { callerLines: [this.rng.pick(stage.prompts)], choices: this.stageChoices(), stageTitle: stage.title };
  }

  private stageChoices(): ChoiceView[] {
    const stage = this.scheme.stages[this.stageIndex];
    const out: ChoiceView[] = stage.options.map((o) => ({
      id: o.id,
      kind: 'stage' as const,
      text: o.text,
      label: APPROACH_LABEL[o.approach],
      approach: o.approach,
      favorite: this.opts.coldRead && this.archetype.prefs[o.approach] >= 1.6,
    }));
    const fact = this.opts.fileViewed() ? this.nextFact() : null;
    if (fact) {
      out.push({
        id: `facts:${fact}`,
        kind: 'facts',
        text: fill(this.rng.pick(FACT_LINES[fact]), this.vars),
        label: APPROACH_LABEL.facts,
        approach: 'facts',
        favorite: this.opts.coldRead && this.archetype.prefs.facts >= 1.6,
      });
    }
    if (this.suspicion >= 30) {
      out.push({ id: 'calm', kind: 'calm', text: this.rng.pick(CALM_LINES), label: APPROACH_LABEL.calm, approach: 'calm' });
    }
    this.pushSpecialChoices(out);
    return out;
  }

  private pushSpecialChoices(out: ChoiceView[]): void {
    const sp = this.profile.special;
    if ((sp === 'investigator' || sp === 'scambaiter') && (this.opts.hotListed() || this.opts.fileViewed())) {
      out.push({
        id: 'unmask',
        kind: 'unmask',
        label: 'Desmascarar',
        text: sp === 'investigator' ? 'Senhora, isso aqui é uma operação policial, né? Tenha um bom dia.' : 'Tá transmitindo ao vivo, né, Zé? Manda um abraço pro chat. Tchau!',
      });
    }
    if (sp === 'boss_mom' && this.opts.fileViewed()) {
      out.push({
        id: 'recognize',
        kind: 'recognize',
        label: 'Reconhecer',
        text: 'Dona Zuleide? Mãe do seu Gervásio? Que honra! Pode desligar tranquila, foi engano.',
      });
    }
  }

  private nextFact(): FactKey | null {
    for (const k of FACT_ORDER) {
      if (this.usedFacts.includes(k)) continue;
      if (this.factValue(k) === '—') continue;
      return k;
    }
    return null;
  }

  private factValue(k: FactKey): string {
    const f = this.profile.facts;
    switch (k) {
      case 'pet':
        return f.petName;
      case 'relative':
        return f.relativeName;
      case 'city':
        return f.city;
      case 'bank':
        return f.bank;
      case 'team':
        return f.team;
      case 'hobby':
        return f.hobby;
    }
  }

  // ---------------------------------------------------------------- pergunta

  private buildQuestion(): boolean {
    const keys = (['pet', 'city', 'bank', 'relative'] as FactKey[]).filter((k) => this.factValue(k) !== '—');
    if (!keys.length) return false;
    const key = this.rng.pick(keys);
    const f = this.profile.facts;
    let prompt: string;
    let pool: string[];
    switch (key) {
      case 'pet':
        prompt = `Peraí. Se vocês são sérios mesmo, qual é o nome do meu ${f.petType}?`;
        pool = FACT_POOLS.petNames;
        break;
      case 'city':
        prompt = 'Antes de continuar: em que cidade eu moro? Quero ver se vocês sabem mesmo.';
        pool = FACT_POOLS.cities;
        break;
      case 'bank':
        prompt = 'Hum. E qual é o meu banco, então? Se vocês têm meu cadastro, sabem.';
        pool = FACT_POOLS.banks;
        break;
      default:
        prompt = `Então me diz o nome do meu ${f.relation}. Ele que cuida dessas coisas.`;
        pool = FACT_POOLS.relatives;
    }
    const correct = this.factValue(key);
    const decoys = this.rng.shuffle(pool.filter((p) => p !== correct)).slice(0, 2);
    const answers = this.rng.shuffle([correct, ...decoys]);
    this.question = { key, prompt, answers, correct: answers.indexOf(correct) };
    return true;
  }

  private questionChoices(): ChoiceView[] {
    if (!this.question) return [];
    const q = this.question;
    const out: ChoiceView[] = q.answers.map((a, i) => ({
      id: `ans:${i}`,
      kind: 'answer' as const,
      text: `"${a}", claro. Tá aqui no sistema.`,
      label: 'Responder',
    }));
    out.push({ id: 'evasive', kind: 'evasive', text: 'Por segurança, não posso confirmar dados por telefone.', label: 'Esquivar' });
    this.pushSpecialChoices(out);
    return out;
  }

  private resolveQuestion(choice: ChoiceView, before: Snapshot): ChoiceResult {
    const d = BALANCE.dialogue;
    const q = this.question!;
    let reaction: ChoiceResult['reaction'];
    const lines: string[] = [];
    if (choice.kind === 'evasive') {
      this.suspicion += d.questionEvasiveSuspicion;
      this.patience -= 5;
      reaction = 'evasive';
      lines.push(this.line(this.archetype.lines.evasive));
    } else {
      const idx = Number(choice.id.split(':')[1]);
      if (idx === q.correct) {
        this.trust += d.questionCorrectTrust;
        this.suspicion -= d.questionCorrectSuspicionDrop;
        reaction = 'correct';
        lines.push(this.line(this.archetype.lines.correct));
      } else {
        this.suspicion += d.questionWrongSuspicion;
        reaction = 'wrong';
        lines.push(this.line(this.archetype.lines.wrong));
      }
    }
    this.clampAll();
    this.question = null;
    const end = this.checkBreak();
    if (end) {
      lines.push(end.line);
      this.phase = 'ended';
      return this.result(choice.text, reaction, lines, before, end.outcome);
    }
    const startTrace = this.checkTrace();
    this.phase = 'stage';
    this.stageIndex++;
    if (this.stageIndex >= this.scheme.stages.length) this.phase = 'payment';
    return { ...this.result(choice.text, reaction, lines, before, null), startTrace, next: this.nextTurn() };
  }

  // ---------------------------------------------------------------- pagamento

  private paymentChoices(): ChoiceView[] {
    const out: ChoiceView[] = this.askAmounts().map((amount, i) => ({
      id: `ask:${i}`,
      kind: 'ask' as const,
      amount,
      label: ASK_LABELS[i],
      text: fill(this.scheme.askLine, { valor: `T$ ${amount.toLocaleString('pt-BR')}` }),
    }));
    this.pushSpecialChoices(out);
    return out;
  }

  private resolvePayment(choice: ChoiceView, before: Snapshot): ChoiceResult {
    const p = BALANCE.dialogue.payment;
    const amount = choice.amount ?? 0;
    const ratio = amount / Math.max(1, this.profile.wealth);
    const noise = this.rng.range(-p.noise, p.noise);
    const score = this.paymentScore(ratio, noise);
    this.phase = 'ended';
    let outcome: DialogueOutcome;
    let line: string;
    if (this.suspicion >= p.reportSuspicion) {
      outcome = { kind: 'reported', amount: 0 };
      line = this.line(this.archetype.lines.report);
    } else if (score >= p.fullThreshold) {
      outcome = { kind: 'paid', amount };
      line = this.line(this.archetype.lines.paid);
    } else if (score >= p.partialThreshold) {
      const frac = clamp((score + 25) / 60, 0.3, 0.8);
      const partial = Math.max(10, roundTo(amount * frac, 10));
      outcome = { kind: 'partial', amount: partial };
      line = fill(this.line(this.archetype.lines.partial), { valor: `T$ ${partial.toLocaleString('pt-BR')}` });
    } else if (this.suspicion >= 55 && this.rng.chance(0.5)) {
      outcome = { kind: 'reported', amount: 0 };
      line = this.line(this.archetype.lines.report);
    } else {
      outcome = { kind: 'refused', amount: 0 };
      line = this.line(this.archetype.lines.refused);
    }
    return this.result(choice.text, 'payment', [line], before, outcome);
  }

  // ---------------------------------------------------------------- auxiliares

  private checkBreak(): { line: string; outcome: DialogueOutcome } | null {
    if (this.suspicion >= BALANCE.dialogue.reportSuspicion) {
      return { line: this.line(this.archetype.lines.report), outcome: { kind: 'reported', amount: 0 } };
    }
    if (this.patience <= 0) {
      return { line: this.line(this.archetype.lines.hangup), outcome: { kind: 'hangup', amount: 0 } };
    }
    return null;
  }

  private checkTrace(): boolean {
    if (!this.opts.trace || this.traceChecked) return false;
    if (this.suspicion < BALANCE.dialogue.traceSuspicion) return false;
    this.traceChecked = true;
    const likely = this.archetype.canTrace || this.profile.special === 'investigator';
    return likely || this.rng.chance(this.scheme.risk);
  }

  private clampAll(): void {
    this.trust = clamp(this.trust, 0, 100);
    this.suspicion = clamp(this.suspicion, 0, 100);
    this.patience = clamp(this.patience, 0, 100);
  }

  private line(pool: string[]): string {
    return fill(this.rng.pick(pool), this.vars);
  }

  private result(
    playerLine: string,
    reaction: ChoiceResult['reaction'],
    callerLines: string[],
    before: Snapshot,
    outcome: DialogueOutcome | null,
  ): ChoiceResult {
    return {
      playerLine,
      reaction,
      callerLines,
      deltas: {
        trust: this.trust - before.trust,
        suspicion: this.suspicion - before.suspicion,
        patience: this.patience - before.patience,
      },
      outcome,
      startTrace: false,
      next: null,
    };
  }
}

interface Snapshot {
  trust: number;
  suspicion: number;
  patience: number;
}

/** Classifica a reação a partir da variação de confiança e desconfiança. */
export function classify(dTrust: number, dSusp: number): ReactionKind {
  const d = dTrust - dSusp;
  if (d >= 16) return 'love';
  if (d >= 6) return 'like';
  if (d >= -5) return 'neutral';
  if (d >= -16) return 'dislike';
  return 'hate';
}
