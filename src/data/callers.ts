import type { CallerFacts, CallerProfile, PortraitSpec } from './types';

/** Listas usadas para gerar interlocutores fictícios variados. */
export const NAME_POOLS = {
  f: ['Cleide', 'Neusa', 'Rosângela', 'Marlene', 'Dalva', 'Jussara', 'Valquíria', 'Tereza', 'Kátia', 'Bianca', 'Larissa', 'Jéssica', 'Odete', 'Fátima', 'Sueli', 'Glória', 'Yasmin', 'Mirtes'],
  m: ['Válter', 'Osvaldo', 'Arlindo', 'Geraldo', 'Nivaldo', 'Edson', 'Clodoaldo', 'Rogério', 'Kleber', 'Wesley', 'Thiago', 'Brayan', 'Ademir', 'Severino', 'Juvenal', 'Lauro', 'Otávio', 'Gilmar'],
  surnames: ['Pereira', 'Bezerra', 'Tavares', 'Fagundes', 'Moreira', 'Quintela', 'Carvalhaes', 'Rocha', 'Damasceno', 'Lobato', 'Siqueira', 'Arruda', 'Peixoto', 'Ventura', 'Bragança', 'Macedo'],
};

export const FACT_POOLS = {
  petNames: ['Bigode', 'Pipoca', 'Thor', 'Princesa', 'Juca', 'Paçoca', 'Frajola', 'Biscoito', 'Xuxa', 'Tufão', 'Mel', 'Sansão'],
  petTypes: ['gato', 'cachorro', 'papagaio', 'jabuti', 'periquito', 'coelho'],
  relatives: ['Kevin', 'Shirley', 'Wanderson', 'Kelly', 'Rubens', 'Jaqueline', 'Robson', 'Tainá', 'Ednaldo', 'Patrícia'],
  relations: ['neto', 'sobrinho', 'genro', 'cunhado', 'afilhado', 'primo'],
  cities: ['Uberaba', 'Caruaru', 'Pelotas', 'Itabuna', 'Juazeiro', 'Mossoró', 'Chapecó', 'Bauru', 'Parintins', 'Ourinhos', 'Garanhuns', 'Sobral'],
  banks: ['Banco Sabiá', 'Banco Tatu', 'Cooperativa Jabuticaba', 'Banco Pão de Queijo', 'Caixinha do Bairro', 'Banco Siriema'],
  teams: ['Tamanduá FC', 'Esporte Clube Jacaré', 'Grêmio Tucano', 'Atlético Capivara', 'Sociedade Pinguim', 'União Calango'],
  hobbies: ['crochê', 'pescaria', 'karaokê', 'bingo', 'palavras cruzadas', 'jardinagem', 'dominó', 'aeróbica'],
  occupations: ['aposentado', 'professor', 'feirante', 'motorista', 'contador', 'manicure', 'síndico', 'vendedor', 'dentista', 'estudante'],
};

export const PORTRAIT_POOLS = {
  skins: ['#f1c7a5', '#e0ac87', '#c68863', '#9c6644', '#7a4a2e', '#5b3620'],
  hairs: ['#1d1a19', '#3b2a20', '#6b4a2b', '#a87b4f', '#d9d4cc', '#8f8f8f', '#b5432f', '#e8d7a8'],
  bgs: ['#2a4a5a', '#4b3a5e', '#5a3b33', '#2f5a45', '#5a5230', '#3a3f5e'],
  shirts: ['#c8553d', '#3d7ec8', '#d4a03d', '#5aa36a', '#8a5ac8', '#d46b9b', '#4a4a4a', '#e0e0e0'],
};

/** Número de telefone fictício (prefixo 555 sinaliza ficção). */
export function fakeNumber(a: number, b: number): string {
  const ddd = 11 + (a % 89);
  return `(${ddd}) 555-${String(1000 + (b % 9000)).padStart(4, '0')}`;
}

/** Interlocutores escritos à mão, com papel narrativo. */
export function storyCallers(): Record<string, Omit<CallerProfile, 'schemeId'> & { schemeId?: string }> {
  const portrait = (p: Partial<PortraitSpec>): PortraitSpec => ({
    skin: '#e0ac87',
    hair: '#d9d4cc',
    hairStyle: 1,
    glasses: false,
    mustache: false,
    earrings: false,
    bg: '#2a4a5a',
    shirt: '#c8553d',
    ...p,
  });
  const facts = (f: Partial<CallerFacts>): CallerFacts => ({
    petName: 'Bigode',
    petType: 'gato',
    relativeName: 'Kevin',
    relation: 'neto',
    city: 'Uberaba',
    bank: 'Banco Sabiá',
    team: 'Tamanduá FC',
    hobby: 'crochê',
    ...f,
  });
  return {
    cleide: {
      id: 'cleide',
      name: 'Dona Cleide Fagundes',
      gender: 'f',
      age: 79,
      number: '(34) 555-0179',
      archetypeId: 'vovo',
      occupation: 'aposentada',
      wealth: 520,
      facts: facts({}),
      portrait: portrait({ hair: '#d9d4cc', hairStyle: 3, glasses: true, earrings: true, shirt: '#d46b9b' }),
      special: 'tutorial',
      schemeId: 'netuno',
      extraNotes: ['Ligou três vezes ontem pra perguntar a previsão do tempo.'],
      forcedQuestionStage: 1,
    },
    zeIsca: {
      id: 'zeIsca',
      name: 'José "Zé" Ismael',
      gender: 'm',
      age: 31,
      number: '(41) 555-0666',
      archetypeId: 'tiozao',
      occupation: 'youtuber (?)',
      wealth: 900,
      facts: facts({ petName: 'Algoritmo', petType: 'papagaio', relativeName: 'Gabriel', relation: 'primo', city: 'Chapecó', bank: 'Banco Tatu', team: 'União Calango', hobby: 'transmissões ao vivo' }),
      portrait: portrait({ skin: '#c68863', hair: '#1d1a19', hairStyle: 2, glasses: true, shirt: '#8a5ac8', bg: '#3a3f5e' }),
      special: 'scambaiter',
      extraNotes: ['ALERTA: número associado a "caçadores de golpistas" que fazem transmissões ao vivo.', 'Comprovantes enviados por este número costumam ser arquivos .exe.'],
    },
    marta: {
      id: 'marta',
      name: 'Marta Souza',
      gender: 'f',
      age: 44,
      number: '(61) 555-0190',
      archetypeId: 'vovo',
      occupation: 'servidora pública (aposentada?)',
      wealth: 1500,
      facts: facts({ petName: '—', petType: '—', relativeName: '—', relation: '—', city: 'Brasília', bank: 'Banco Siriema', team: '—', hobby: '—' }),
      portrait: portrait({ skin: '#9c6644', hair: '#3b2a20', hairStyle: 4, glasses: false, shirt: '#4a4a4a', bg: '#2f3a45' }),
      special: 'investigator',
      extraNotes: ['Cadastro criado ontem. Nenhum histórico de compras, contas ou vizinhos.', 'Inconsistência: idade informada não bate com o CPF fictício.'],
    },
    zuleide: {
      id: 'zuleide',
      name: 'Dona Zuleide Bastos',
      gender: 'f',
      age: 81,
      number: '(11) 555-0001',
      archetypeId: 'vovo',
      occupation: 'aposentada, ex-dona de bufê',
      wealth: 1400,
      facts: facts({ petName: 'Gervasinho', petType: 'cachorro', relativeName: 'Gervásio', relation: 'filho', city: 'São Paulo', bank: 'Banco Pão de Queijo', team: 'Atlético Capivara', hobby: 'bingo' }),
      portrait: portrait({ hair: '#e8d7a8', hairStyle: 3, glasses: true, earrings: true, shirt: '#5aa36a', bg: '#5a3b33' }),
      special: 'boss_mom',
      extraNotes: ['Filho: Gervásio Bastos, "empresário do ramo de telemarketing".', 'Endereço de cobrança igual ao do nosso chefe. Coincidência?'],
    },
    vip: {
      id: 'vip',
      name: 'Dr. Heitor Bragança',
      gender: 'm',
      age: 58,
      number: '(21) 555-0777',
      archetypeId: 'executiva',
      occupation: 'herdeiro de rede de padarias',
      wealth: 2600,
      facts: facts({ petName: 'Duque', petType: 'cachorro', relativeName: 'Lorena', relation: 'afilhado', city: 'Petrópolis', bank: 'Banco Pão de Queijo', team: 'Grêmio Tucano', hobby: 'polo aquático' }),
      portrait: portrait({ skin: '#f1c7a5', hair: '#8f8f8f', hairStyle: 1, glasses: true, mustache: true, shirt: '#3d7ec8', bg: '#4b3a5e' }),
      special: 'vip',
      extraNotes: ['LEAD QUENTE indicado pelo chefe. Adora ser tratado como autoridade.'],
    },
  };
}
