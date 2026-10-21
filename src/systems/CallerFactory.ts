import { ARCHETYPES } from '../data/archetypes';
import { FACT_POOLS, NAME_POOLS, PORTRAIT_POOLS, fakeNumber, storyCallers } from '../data/callers';
import type { CallerProfile, CallerSpecial, DayDef } from '../data/types';
import type { Rng } from '../core/rng';
import { roundTo } from '../core/util';

/**
 * Gera interlocutores fictícios combinando personalidade, nome, ficha e
 * aparência. Interlocutores especiais vêm de data/callers.ts.
 */
export class CallerFactory {
  private serial = 0;

  constructor(private readonly rng: Rng) {}

  /** Interlocutor comum para o dia e golpe informados. */
  generate(day: DayDef, schemeId: string, usedNames: Set<string>): CallerProfile {
    const pool = ARCHETYPES.filter((a) => a.minDay <= day.day);
    // Variedade: arquétipos recentes ganham um pouco mais de peso.
    const arch = this.rng.weighted(pool, (a) => 1 + (a.minDay === day.day ? 0.8 : 0));
    const gender = this.rng.pick(arch.genders);
    let name = '';
    for (let i = 0; i < 20; i++) {
      const first = this.rng.pick(NAME_POOLS[gender]);
      const prefix = arch.id === 'vovo' ? (gender === 'f' ? 'Dona ' : 'Seu ') : arch.id === 'advogado' ? 'Dr. ' : '';
      name = `${prefix}${first} ${this.rng.pick(NAME_POOLS.surnames)}`;
      if (!usedNames.has(name)) break;
    }
    usedNames.add(name);
    const [wMin, wMax] = arch.wealth;
    const wealth = roundTo(this.rng.range(wMin, wMax) * day.wealthScale, 10);
    this.serial++;
    return {
      id: `gen-${day.day}-${this.serial}`,
      name,
      gender,
      age: this.rng.int(arch.ageRange[0], arch.ageRange[1]),
      number: fakeNumber(this.rng.int(0, 999), this.rng.int(0, 99999)),
      archetypeId: arch.id,
      occupation: arch.id === 'estudante' ? 'estudante' : this.rng.pick(FACT_POOLS.occupations),
      wealth,
      facts: {
        petName: this.rng.pick(FACT_POOLS.petNames),
        petType: this.rng.pick(FACT_POOLS.petTypes),
        relativeName: this.rng.pick(FACT_POOLS.relatives),
        relation: this.rng.pick(FACT_POOLS.relations),
        city: this.rng.pick(FACT_POOLS.cities),
        bank: this.rng.pick(FACT_POOLS.banks),
        team: this.rng.pick(FACT_POOLS.teams),
        hobby: this.rng.pick(FACT_POOLS.hobbies),
      },
      portrait: {
        skin: this.rng.pick(PORTRAIT_POOLS.skins),
        hair: arch.ageRange[0] > 60 ? this.rng.pick(['#d9d4cc', '#8f8f8f', '#e8d7a8']) : this.rng.pick(PORTRAIT_POOLS.hairs),
        hairStyle: this.rng.int(0, 4),
        glasses: this.rng.chance(arch.ageRange[0] > 50 ? 0.6 : 0.25),
        mustache: gender === 'm' && this.rng.chance(0.4),
        earrings: gender === 'f' && this.rng.chance(0.6),
        bg: this.rng.pick(PORTRAIT_POOLS.bgs),
        shirt: this.rng.pick(PORTRAIT_POOLS.shirts),
      },
      special: 'none',
      schemeId,
      extraNotes: [],
    };
  }

  /** Interlocutor especial; o golpe vem do perfil ou do sorteio do dia. */
  special(id: string, schemeId: string, day: DayDef): CallerProfile {
    const base = storyCallers()[id];
    if (!base) throw new Error(`Interlocutor especial desconhecido: ${id}`);
    return {
      ...base,
      wealth: roundTo(base.wealth * (base.special === 'tutorial' ? 1 : Math.max(1, day.wealthScale * 0.7)), 10),
      schemeId: base.schemeId ?? schemeId,
    };
  }
}

/** Qual perfil narrativo representa cada tipo especial. */
export const SPECIAL_CALLER_ID: Partial<Record<CallerSpecial, string>> = {
  tutorial: 'cleide',
  scambaiter: 'zeIsca',
  investigator: 'marta',
  boss_mom: 'zuleide',
  vip: 'vip',
};
