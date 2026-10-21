import type { DayDef, UpgradeDef } from './types';

/** Os cinco expedientes da campanha. */
export const DAYS: DayDef[] = [
  {
    day: 1,
    title: 'Primeiro dia',
    weekday: 'Segunda-feira',
    quota: 900,
    durationSec: 480,
    callGap: [8, 16],
    wealthScale: 1,
    suspicionBonus: 0,
    events: ['coworker_help'],
    scripted: [{ id: 'coworker_help', at: 300 }],
    features: { questions: false, trace: false, specials: ['tutorial'] },
    bossBriefing: [
      'Bem-vindo à Disk Fortuna Soluções. Aqui a gente vende sonhos. Por telefone. Adiantado.',
      'Sua meta hoje é {meta}. Meta de estagiário. Se não bater nem isso, nem precisa voltar amanhã.',
      'Senta na sua mesa, liga o computador e atende o telefone. Não é física quântica.',
    ],
    baitSlots: 1,
  },
  {
    day: 2,
    title: 'A geladeira tá com vírus',
    weekday: 'Terça-feira',
    quota: 2600,
    durationSec: 450,
    callGap: [8, 16],
    wealthScale: 1.35,
    suspicionBonus: 5,
    events: ['boss_demand', 'coworker_help', 'pri_tip', 'juninho_help'],
    scripted: [
      { id: 'network_down', at: 140 },
      { id: 'boss_summon', at: 320 },
    ],
    features: { questions: true, trace: false, specials: [] },
    bossBriefing: [
      'Ontem foi treino. Hoje a meta é {meta}.',
      'Liberei uma isca nova: Suporte GeloMax. Geladeira com vírus. As pessoas acreditam em tudo.',
      'E agora o pessoal começa a fazer pergunta. Usa o Arquivo de Casos, pra isso que eu pago a internet.',
    ],
    baitSlots: 2,
  },
  {
    day: 3,
    title: 'Tem gente na escuta',
    weekday: 'Quarta-feira',
    quota: 4200,
    durationSec: 450,
    callGap: [7, 15],
    wealthScale: 1.75,
    suspicionBonus: 8,
    events: ['boss_demand', 'coworker_help', 'pri_tip', 'network_down', 'boss_summon', 'juninho_help'],
    scripted: [
      { id: 'hot_lead', at: 80 },
      { id: 'mystery_call', at: 380 },
    ],
    features: { questions: true, trace: true, specials: ['scambaiter', 'investigator'] },
    bossBriefing: [
      'Meta de hoje: {meta}. E já te aviso: tem gente RASTREANDO ligação. Desconfiou, desliga.',
      'Nova isca: Herança do Príncipe. Ninguém resiste a um castelo.',
      'Ah, e tem uns engraçadinhos que ligam só pra fazer vídeo. Confere a Lista Quente antes de cobrar.',
    ],
    baitSlots: 2,
  },
  {
    day: 4,
    title: 'Luzes azuis na rua',
    weekday: 'Quinta-feira',
    quota: 6500,
    durationSec: 450,
    callGap: [7, 14],
    wealthScale: 2.2,
    suspicionBonus: 12,
    events: ['boss_demand', 'coworker_help', 'pri_tip', 'network_down', 'boss_summon', 'pc_crash'],
    scripted: [
      { id: 'power_outage', at: 190 },
      { id: 'mystery_call', at: 400 },
    ],
    features: { questions: true, trace: true, specials: ['scambaiter', 'investigator', 'boss_mom'] },
    bossBriefing: [
      'Quinta-feira. Meta: {meta}. Os investidores estão ansiosos. Eu sou os investidores.',
      'Nova isca: Seguro Anti-Abdução. Pânico vende.',
      'Se ver viatura na rua, finge que é entregador. Todo mundo aqui é entregador.',
    ],
    baitSlots: 3,
  },
  {
    day: 5,
    title: 'Sexta-feira da auditoria',
    weekday: 'Sexta-feira',
    quota: 8800,
    durationSec: 450,
    callGap: [6, 13],
    wealthScale: 2.6,
    suspicionBonus: 15,
    events: ['boss_demand', 'coworker_help', 'pri_tip', 'network_down', 'boss_summon', 'pc_crash', 'power_outage'],
    scripted: [
      { id: 'hot_lead', at: 60 },
      { id: 'final_deal', at: 300 },
    ],
    features: { questions: true, trace: true, specials: ['scambaiter', 'investigator', 'boss_mom'] },
    bossBriefing: [
      'Hoje é o dia. O Conselho vem ver os números. Meta: {meta}. Sem desculpa.',
      'Nova isca: CapivaraCoin. A moeda que só sobe. Igual minha pressão.',
      'Quem bater a meta hoje vira sócio. Quem não bater vira lenda. Lenda de quem foi demitido.',
    ],
    baitSlots: 3,
  },
];

export function dayDef(day: number): DayDef {
  const d = DAYS.find((x) => x.day === day);
  if (!d) throw new Error(`Dia inexistente: ${day}`);
  return d;
}

export const LAST_DAY = DAYS.length;

/** Melhorias compráveis com a comissão do jogador. */
export const UPGRADES: UpgradeDef[] = [
  { id: 'headset', name: 'Headset Premium', description: '+7 s para responder em cada fala. O som também fica mais bonito (placebo).', cost: 110, icon: '🎧' },
  { id: 'ssd', name: 'SSD Turbo', description: 'Consultas no Arquivo de Casos levam 1 s em vez de 3 s.', cost: 90, icon: '💾' },
  { id: 'coldread', name: 'Apostila "Leitura Fria"', description: 'Mostra os números de confiança e desconfiança e marca a abordagem favorita.', cost: 240, icon: '📘' },
  { id: 'vpn', name: 'VPN Paraguaia', description: 'Rastreamentos ficam 40% mais lentos.', cost: 300, icon: '🛰️' },
  { id: 'gourmet', name: 'Cafeteira Gourmet', description: 'O café dura 4 ligações em vez de 2.', cost: 70, icon: '☕' },
  { id: 'plant', name: 'Planta da Sorte', description: 'Uma suculenta. Não faz absolutamente nada. Mas é bonita.', cost: 25, icon: '🌱' },
];

/** Patentes da carreira na Disk Fortuna. */
export const RANKS = ['Estagiário', 'Operador', 'Operador Sênior', 'Supervisor', 'Sócio'];
