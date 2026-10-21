/** Tipos de conteúdo do jogo. Todos os dados de jogabilidade vivem em src/data. */

/** Abordagens que o jogador pode usar numa conversa. */
export type Approach = 'charm' | 'authority' | 'urgency' | 'absurd' | 'facts' | 'calm';

export const APPROACH_LABEL: Record<Approach, string> = {
  charm: 'Simpatia',
  authority: 'Autoridade',
  urgency: 'Urgência',
  absurd: 'Improviso',
  facts: 'Ficha',
  calm: 'Recuar',
};

export interface SchemeOption {
  id: string;
  approach: Approach;
  text: string;
  /** Multiplicador de efeito. 1 = normal. */
  power: number;
}

export interface SchemeStage {
  id: string;
  title: string;
  /** Pergunta que o interlocutor faz ao entrar nesta etapa. */
  prompts: string[];
  options: SchemeOption[];
}

export interface Scheme {
  id: string;
  name: string;
  /** Isca: como as vítimas fictícias ficaram sabendo. */
  bait: string;
  unlockDay: number;
  /** Multiplicador sobre a riqueza do interlocutor. */
  askMultiplier: number;
  /** Propensão extra a rastreios (0..1). */
  risk: number;
  openings: string[];
  stages: SchemeStage[];
  /** Fala do jogador ao pedir o pagamento. {valor} é substituído. */
  askLine: string;
  /** Nome da cobrança, para o extrato. */
  chargeName: string;
}

export type ReactionKind = 'love' | 'like' | 'neutral' | 'dislike' | 'hate';

export interface ArchetypeLines {
  greet: string[];
  love: string[];
  like: string[];
  neutral: string[];
  dislike: string[];
  hate: string[];
  paid: string[];
  partial: string[];
  refused: string[];
  report: string[];
  hangup: string[];
  timeout: string[];
  interject: string[];
  back: string[];
  correct: string[];
  wrong: string[];
  evasive: string[];
  trace: string[];
  repeat: string[];
}

export interface Archetype {
  id: string;
  label: string;
  /** Pista mostrada na ficha do arquivo de casos. */
  fileNote: string;
  ageRange: [number, number];
  wealth: [number, number];
  patience: number;
  trust: number;
  suspicion: number;
  /** Credulidade 0..1. */
  gullibility: number;
  /** Afinidade por abordagem: -1 (odeia) .. 2 (adora). */
  prefs: Record<Approach, number>;
  interjectChance: number;
  questionChance: number;
  canTrace: boolean;
  /** Dia a partir do qual o arquétipo aparece. */
  minDay: number;
  voice: { pitch: number; rate: number };
  /** Gênero gramatical usado em textos ("a senhora"/"o senhor"). */
  genders: Array<'f' | 'm'>;
  lines: ArchetypeLines;
}

export type FactKey = 'pet' | 'relative' | 'city' | 'bank' | 'team' | 'hobby';

export interface CallerFacts {
  petName: string;
  petType: string;
  relativeName: string;
  relation: string;
  city: string;
  bank: string;
  team: string;
  hobby: string;
}

export interface PortraitSpec {
  skin: string;
  hair: string;
  hairStyle: number;
  glasses: boolean;
  mustache: boolean;
  earrings: boolean;
  bg: string;
  shirt: string;
}

/** Perfis especiais com regras próprias. */
export type CallerSpecial = 'none' | 'investigator' | 'scambaiter' | 'boss_mom' | 'tutorial' | 'vip';

export interface CallerProfile {
  id: string;
  name: string;
  gender: 'f' | 'm';
  age: number;
  number: string;
  archetypeId: string;
  occupation: string;
  wealth: number;
  facts: CallerFacts;
  portrait: PortraitSpec;
  special: CallerSpecial;
  /** Golpe que trouxe esta ligação. */
  schemeId: string;
  /** Observações adicionais na ficha. */
  extraNotes: string[];
  /** Força uma pergunta de verificação nesta etapa (índice). */
  forcedQuestionStage?: number;
  /** Ligação transferida por um colega: já chega com confiança. */
  warmLead?: boolean;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
}

export interface DayDef {
  day: number;
  title: string;
  weekday: string;
  quota: number;
  /** Duração do expediente em segundos reais (09:00–18:00). */
  durationSec: number;
  /** Intervalo entre ligações, em segundos reais. */
  callGap: [number, number];
  wealthScale: number;
  suspicionBonus: number;
  /** Eventos possíveis neste dia. */
  events: string[];
  /** Eventos que acontecem com certeza, com horário em minutos desde 09:00. */
  scripted: Array<{ id: string; at: number }>;
  features: {
    questions: boolean;
    trace: boolean;
    specials: CallerSpecial[];
  };
  bossBriefing: string[];
  baitSlots: number;
}
