/**
 * Botões de ajuste da jogabilidade. Todos os números de balanceamento ficam
 * aqui para que nenhum sistema precise de valores mágicos.
 */
export const BALANCE = {
  economy: {
    /** Fração de cada pagamento que vira comissão do jogador. */
    commissionRate: 0.12,
    /** Bônus de comissão ao bater a meta (fração da meta). */
    quotaBonusRate: 0.1,
    /** Bônus extra ao fazer 150% da meta (fração da meta). */
    excellentBonusRate: 0.15,
    excellentThreshold: 1.5,
    missedCallFine: 0,
  },
  dialogue: {
    trustGain: 11,
    suspicionGainDislike: 11,
    suspicionDropLike: 4,
    patienceCostPerTurn: 9,
    patienceCostDislike: 6,
    repeatFactor: 0.55,
    repeatSuspicion: 4,
    factsTrust: 20,
    factsSuspicionDrop: 10,
    calmSuspicionDrop: 13,
    calmTrustLoss: 3,
    calmPatienceCost: 6,
    questionCorrectTrust: 12,
    questionCorrectSuspicionDrop: 10,
    questionWrongSuspicion: 30,
    questionEvasiveSuspicion: 11,
    /** Limite de desconfiança que faz o interlocutor denunciar. */
    reportSuspicion: 100,
    /** Desconfiança que pode iniciar um rastreio. */
    traceSuspicion: 55,
    payment: {
      base: 20,
      suspicionWeight: 0.7,
      gullibilityWeight: 25,
      urgencyPerUse: 6,
      urgencyMax: 15,
      askWeight: 90,
      fullThreshold: 25,
      partialThreshold: 5,
      reportSuspicion: 78,
      noise: 5,
    },
    /** Frações da riqueza oferecidas como valor do pedido. */
    askTiers: [0.25, 0.5, 0.8, 1.0],
  },
  calls: {
    ringTimeoutSec: 22,
    responseTimeSec: 20,
    responseTimeoutPatience: 16,
    responseGraceSec: 10,
    interjectPauseSec: [4, 8] as [number, number],
    traceDurationSec: 24,
    lookupSec: 3,
    lookupSecFast: 1,
  },
  heat: {
    decayPerMinute: 0.25,
    report: 14,
    traced: 24,
    sting: 38,
    carryOver: 0.45,
    levels: [30, 60, 85] as [number, number, number],
    shredRelief: 22,
    lowProfileRelief: 10,
  },
  upgrades: {
    headsetBonusSec: 7,
    vpnTraceFactor: 0.6,
    coffeeBonusSec: 6,
    coffeeCalls: 2,
    coffeeCallsGourmet: 4,
  },
  campaign: {
    maxStrikes: 2,
    maxRaids: 2,
    raidFine: 0.5,
  },
} as const;
