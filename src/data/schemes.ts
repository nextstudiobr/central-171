import type { Scheme } from './types';

/**
 * Golpes fictícios e absurdos. Nada aqui funciona no mundo real: são roteiros
 * de comédia para personagens inventados.
 */
export const SCHEMES: Scheme[] = [
  {
    id: 'netuno',
    name: 'Loteria Netuno',
    bait: 'SMS em massa: "PARABÉNS! Você ganhou um JET-SKI na Loteria Netuno!"',
    unlockDay: 1,
    askMultiplier: 1,
    risk: 0.15,
    openings: [
      'Alô? Recebi uma mensagem dizendo que eu ganhei um jet-ski. É aqui?',
      'Boa tarde... é da tal Loteria Netuno? Eu nem jogo na loteria!',
      'Oi. Chegou um torpedo falando de um prêmio. Eu ganhei mesmo?',
    ],
    stages: [
      {
        id: 'apresentacao',
        title: 'Apresentação',
        prompts: ['Mas quem está falando?', 'E vocês são de onde, exatamente?', 'Isso é sério?'],
        options: [
          { id: 'n1c', approach: 'charm', power: 1, text: 'Boa tarde! Aqui é o Rodrigo, da Loteria Netuno. Que voz bonita, hein!' },
          { id: 'n1a', approach: 'authority', power: 1, text: 'Central de Premiações Netuno, protocolo 171-B. Você foi sorteado oficialmente.' },
          { id: 'n1u', approach: 'urgency', power: 1, text: 'Ainda bem que você ligou! O prêmio expira em quinze minutos!' },
          { id: 'n1x', approach: 'absurd', power: 1.2, text: 'Aqui é o próprio Netuno, deus dos mares. Brincadeira. Mas o jet-ski é real.' },
        ],
      },
      {
        id: 'premio',
        title: 'O Prêmio',
        prompts: ['E o que exatamente eu ganhei?', 'Um jet-ski? Pra que eu quero um jet-ski?', 'E esse prêmio é de verdade?'],
        options: [
          { id: 'n2c', approach: 'charm', power: 1, text: 'Um jet-ski zero quilômetro, na cor que você quiser. Combina com você.' },
          { id: 'n2a', approach: 'authority', power: 1, text: 'Conforme o edital 12/B, o contemplado recebe um jet-ski e um ano de gasolina.' },
          { id: 'n2u', approach: 'urgency', power: 1, text: 'Um jet-ski! Mas tem mais três pessoas na fila caso você não confirme agora.' },
          { id: 'n2x', approach: 'absurd', power: 1.2, text: 'Um jet-ski anfíbio. Anda na água, na terra e, em testes, no céu.' },
        ],
      },
      {
        id: 'taxa',
        title: 'A Taxa',
        prompts: ['E tem algum custo pra mim?', 'Peraí, por que eu teria que pagar alguma coisa?', 'Tem pegadinha nisso, né?'],
        options: [
          { id: 'n3c', approach: 'charm', power: 1, text: 'Só uma taxinha de liberação, coisa simbólica, pra gente cuidar bem do seu prêmio.' },
          { id: 'n3a', approach: 'authority', power: 1, text: 'A Lei Marítima de Faz-de-Conta exige a taxa de desembaraço náutico. É padrão.' },
          { id: 'n3u', approach: 'urgency', power: 1, text: 'Tem a taxa de liberação, e precisa ser hoje, senão o jet-ski vai pro segundo colocado.' },
          { id: 'n3x', approach: 'absurd', power: 1.2, text: 'Uma taxa pro Netuno não ficar com ciúme. Ele é muito possessivo com os mares.' },
        ],
      },
    ],
    askLine: 'Pra liberar o jet-ski, é só transferir {valor} pra conta da Netuno.',
    chargeName: 'Taxa de liberação do jet-ski',
  },
  {
    id: 'gelomax',
    name: 'Suporte GeloMax',
    bait: 'Pop-up em TVs inteligentes: "SUA GELADEIRA ESTÁ INFECTADA. LIGUE JÁ."',
    unlockDay: 2,
    askMultiplier: 1.1,
    risk: 0.25,
    openings: [
      'Alô, suporte? Minha televisão disse que minha geladeira tá com vírus.',
      'É do suporte da GeloMax? Minha geladeira tá fazendo um barulho estranho.',
      'Olha, apareceu um aviso na tela... geladeira pega vírus agora?',
    ],
    stages: [
      {
        id: 'diagnostico',
        title: 'Diagnóstico',
        prompts: ['Mas como vocês sabem disso?', 'Vocês estão vendo minha geladeira daí?', 'Quem é você?'],
        options: [
          { id: 'g1c', approach: 'charm', power: 1, text: 'Fica tranquilo, você fez muito bem em ligar. Vamos cuidar disso juntos.' },
          { id: 'g1a', approach: 'authority', power: 1, text: 'Nosso sistema detectou atividade anômala no módulo de gelo. Protocolo GX-404.' },
          { id: 'g1u', approach: 'urgency', power: 1, text: 'Não abra a geladeira! Repito: NÃO abra a geladeira!' },
          { id: 'g1x', approach: 'absurd', power: 1.2, text: 'Sua geladeira está minerando CapivaraCoin de madrugada. Por isso o gelo tem gosto de moeda.' },
        ],
      },
      {
        id: 'problema',
        title: 'O Problema',
        prompts: ['E isso é grave?', 'Mas ela tá gelando normal...', 'O que esse vírus faz?'],
        options: [
          { id: 'g2c', approach: 'charm', power: 1, text: 'É grave, mas você caiu com o técnico certo. Sou o melhor da equipe, modéstia à parte.' },
          { id: 'g2a', approach: 'authority', power: 1, text: 'O vírus Pinguim.exe compromete a cadeia do frio. Nível de ameaça: picolé.' },
          { id: 'g2u', approach: 'urgency', power: 1, text: 'Em uma hora ela começa a congelar tudo. Inclusive a cozinha. Inclusive você.' },
          { id: 'g2x', approach: 'absurd', power: 1.2, text: 'Ela já fez amizade com o micro-ondas. Se os dois se unirem, nem o exército segura.' },
        ],
      },
      {
        id: 'solucao',
        title: 'A Solução',
        prompts: ['E como resolve isso?', 'Quanto vai me custar esse conserto?', 'Não dá pra só desligar da tomada?'],
        options: [
          { id: 'g3c', approach: 'charm', power: 1, text: 'Instalo o antivírus daqui mesmo, rapidinho. É só a licença, um valor bem camarada.' },
          { id: 'g3a', approach: 'authority', power: 1, text: 'É necessária a licença GeloShield Pro, anual, conforme o manual do fabricante.' },
          { id: 'g3u', approach: 'urgency', power: 1, text: 'Preciso da licença agora, antes que o freezer assuma o controle da casa!' },
          { id: 'g3x', approach: 'absurd', power: 1.2, text: 'Vou mandar um pinguim técnico pela fibra óptica. Ele cobra por hora, mas é rápido.' },
        ],
      },
    ],
    askLine: 'A licença GeloShield sai por {valor}. Pode transferir que eu ativo na hora.',
    chargeName: 'Licença do antivírus de geladeira',
  },
  {
    id: 'principe',
    name: 'Herança do Príncipe',
    bait: 'E-mail: "Prezado parente distante, o Príncipe de Pindorama do Norte deixou herança."',
    unlockDay: 3,
    askMultiplier: 1.25,
    risk: 0.3,
    openings: [
      'Alô? Recebi um e-mail sobre uma herança de um príncipe... isso é sério?',
      'Bom dia. Eu sou parente de príncipe? Ninguém nunca me contou isso.',
      'Olha, é sobre a herança. Meu primo disse que é golpe, mas eu quis confirmar.',
    ],
    stages: [
      {
        id: 'revelacao',
        title: 'Revelação',
        prompts: ['Que príncipe é esse?', 'Pindorama do Norte? Isso existe?', 'Por que eu?'],
        options: [
          { id: 'p1c', approach: 'charm', power: 1, text: 'O saudoso Príncipe Eustáquio III. Ele falava muito bem de você, mesmo sem te conhecer.' },
          { id: 'p1a', approach: 'authority', power: 1, text: 'Sou o tabelião internacional do Principado de Pindorama do Norte. Processo 171/88.' },
          { id: 'p1u', approach: 'urgency', power: 1, text: 'O testamento será lido amanhã. Sem herdeiro, tudo vai para os gansos do palácio.' },
          { id: 'p1x', approach: 'absurd', power: 1.2, text: 'Um príncipe muito rico, muito distante e, felizmente pra você, muito morto.' },
        ],
      },
      {
        id: 'genealogia',
        title: 'Genealogia',
        prompts: ['Mas como eu seria herdeiro disso?', 'Minha família é toda do interior...', 'Tem prova disso?'],
        options: [
          { id: 'p2c', approach: 'charm', power: 1, text: 'Pela sua bisavó. Dizem que você herdou o nariz nobre dela, dá pra ouvir pela voz.' },
          { id: 'p2a', approach: 'authority', power: 1, text: 'A árvore genealógica foi auditada por três cartórios e um astrólogo juramentado.' },
          { id: 'p2u', approach: 'urgency', power: 1, text: 'Você é o último herdeiro vivo! Os outros primos já foram desclassificados!' },
          { id: 'p2x', approach: 'absurd', power: 1.2, text: 'Exame de DNA por telefone. Diga "aaaah". Pronto: cem por cento realeza.' },
        ],
      },
      {
        id: 'burocracia',
        title: 'Burocracia',
        prompts: ['E o que eu preciso fazer?', 'Tem papelada?', 'Quando eu recebo o castelo?'],
        options: [
          { id: 'p3c', approach: 'charm', power: 1, text: 'Só uma taxinha de cartório e o castelo é seu. Com piscina. Bom, com fosso.' },
          { id: 'p3a', approach: 'authority', power: 1, text: 'Recolhimento do imposto de transmissão principesca, guia T-171, valor tabelado.' },
          { id: 'p3u', approach: 'urgency', power: 1, text: 'Pague a taxa hoje ou o castelo vai a leilão para um influencer!' },
          { id: 'p3x', approach: 'absurd', power: 1.2, text: 'A taxa cobre o frete do castelo. Ele vem desmontado, tipo móvel de loja.' },
        ],
      },
    ],
    askLine: 'A taxa de cartório intercontinental fica em {valor}. Transferindo agora, o castelo é seu.',
    chargeName: 'Taxa de cartório principesco',
  },
  {
    id: 'abducao',
    name: 'Seguro Anti-Abdução',
    bait: 'Panfleto em postes: "ELES ESTÃO VINDO. SUA APÓLICE ESTÁ EM DIA?"',
    unlockDay: 4,
    askMultiplier: 1.3,
    risk: 0.3,
    openings: [
      'Alô... é do seguro contra disco voador? Eu vi uma luz estranha ontem.',
      'Oi, peguei um panfleto do seu seguro. Minha vizinha jura que foi abduzida.',
      'Vocês cobrem abdução de gado também? Pergunto por um amigo.',
    ],
    stages: [
      {
        id: 'ameaca',
        title: 'Ameaça',
        prompts: ['Isso é sério mesmo?', 'Eu achei que era piada...', 'Quem garante que eles existem?'],
        options: [
          { id: 'a1c', approach: 'charm', power: 1, text: 'Seríssimo, mas fica calmo: quem liga pra gente já tá um passo à frente dos ETs.' },
          { id: 'a1a', approach: 'authority', power: 1, text: 'Dados do Observatório Fictício Nacional: abduções subiram 300% no seu bairro.' },
          { id: 'a1u', approach: 'urgency', power: 1, text: 'Tem uma nave estacionada na sua rua agora mesmo. Não olhe pela janela.' },
          { id: 'a1x', approach: 'absurd', power: 1.2, text: 'Eles adoram gente simpática. Por isso a gente cobra mais barato de quem é chato.' },
        ],
      },
      {
        id: 'cobertura',
        title: 'Cobertura',
        prompts: ['E o seguro cobre o quê?', 'E se eu for abduzido mesmo assim?', 'Tem carência?'],
        options: [
          { id: 'a2c', approach: 'charm', power: 1, text: 'Cobertura total: resgate, devolução e um chazinho quando você voltar.' },
          { id: 'a2a', approach: 'authority', power: 1, text: 'A apólice cobre sonda, translado intergaláctico e danos morais em outro planeta.' },
          { id: 'a2u', approach: 'urgency', power: 1, text: 'Cobre tudo, mas o plano promocional acaba quando a lua minguar. Hoje.' },
          { id: 'a2x', approach: 'absurd', power: 1.2, text: 'Se você for abduzido, mandamos outro você no lugar. Ninguém percebe.' },
        ],
      },
      {
        id: 'fechamento',
        title: 'Fechamento',
        prompts: ['Quanto custa isso?', 'Tem desconto pra família?', 'E como eu pago?'],
        options: [
          { id: 'a3c', approach: 'charm', power: 1, text: 'A primeira parcela é baratinha. Sua segurança não tem preço, mas tem desconto.' },
          { id: 'a3a', approach: 'authority', power: 1, text: 'Primeira parcela conforme tabela da Superintendência Galáctica de Seguros.' },
          { id: 'a3u', approach: 'urgency', power: 1, text: 'Fecha agora que a gente ativa antes do pôr do sol. Eles atacam no pôr do sol.' },
          { id: 'a3x', approach: 'absurd', power: 1.2, text: 'Aceitamos tostões. Os marcianos só aceitam queijo, então é bom negócio.' },
        ],
      },
    ],
    askLine: 'A primeira parcela da apólice fica em {valor}. Transferindo, você já está protegido.',
    chargeName: 'Apólice anti-abdução',
  },
  {
    id: 'capivara',
    name: 'CapivaraCoin',
    bait: 'Anúncio em vídeo: "CapivaraCoin: a moeda que só sobe. Igual capivara em barranco."',
    unlockDay: 5,
    askMultiplier: 1.5,
    risk: 0.35,
    openings: [
      'E aí, é aqui que eu entro na CapivaraCoin? Vi o anúncio.',
      'Alô, quero saber da moeda da capivara. Meu cunhado ficou rico.',
      'Boa tarde. Esse investimento da capivara... rende quanto?',
    ],
    stages: [
      {
        id: 'oportunidade',
        title: 'Oportunidade',
        prompts: ['Mas o que é essa moeda?', 'Isso é tipo bitcoin?', 'E por que capivara?'],
        options: [
          { id: 'c1c', approach: 'charm', power: 1, text: 'É a moeda mais simpática do mercado. Igual você, pelo jeito.' },
          { id: 'c1a', approach: 'authority', power: 1, text: 'Ativo digital lastreado em capivaras reais, auditadas por uma lontra certificada.' },
          { id: 'c1u', approach: 'urgency', power: 1, text: 'A moeda dobra de valor a cada vinte minutos. Já passaram dez enquanto você falava.' },
          { id: 'c1x', approach: 'absurd', power: 1.2, text: 'É uma capivara dentro de um computador. Ela cresce se você der dinheiro pra ela.' },
        ],
      },
      {
        id: 'prova',
        title: 'Prova Social',
        prompts: ['E quem já investiu?', 'Tem algum famoso nisso?', 'Como eu sei que não é pirâmide?'],
        options: [
          { id: 'c2c', approach: 'charm', power: 1, text: 'Gente como você, que confia no próprio instinto. O instinto não mente, né?' },
          { id: 'c2a', approach: 'authority', power: 1, text: 'Mais de quarenta mil investidores, segundo uma planilha que eu mesmo fiz.' },
          { id: 'c2u', approach: 'urgency', power: 1, text: 'Todo mundo! Seu vizinho comprou hoje cedo. Você vai ficar pra trás?' },
          { id: 'c2x', approach: 'absurd', power: 1.2, text: 'Uma capivara de verdade investiu e hoje ela tem um iate. Pequeno, mas tem.' },
        ],
      },
      {
        id: 'janela',
        title: 'Janela',
        prompts: ['E quanto eu preciso pra entrar?', 'Dá pra sacar quando eu quiser?', 'Qual o mínimo?'],
        options: [
          { id: 'c3c', approach: 'charm', power: 1, text: 'Um aporte inicial que caiba no seu bolso. Começa pequeno, sonha grande.' },
          { id: 'c3a', approach: 'authority', power: 1, text: 'Aporte mínimo regulamentado pela Comissão Fictícia de Valores Roedores.' },
          { id: 'c3u', approach: 'urgency', power: 1, text: 'A janela fecha em cinco minutos. Depois disso só ano que vem, e ano que vem não existe.' },
          { id: 'c3x', approach: 'absurd', power: 1.2, text: 'Você entra com tostões e sai com uma capivara de estimação digital. Garantido.' },
        ],
      },
    ],
    askLine: 'O aporte inicial na CapivaraCoin fica em {valor}. Manda que eu já compro suas capivaras.',
    chargeName: 'Aporte em CapivaraCoin',
  },
];

export function schemeById(id: string): Scheme {
  const s = SCHEMES.find((x) => x.id === id);
  if (!s) throw new Error(`Golpe desconhecido: ${id}`);
  return s;
}

/** Falas do jogador para a opção "Recuar". */
export const CALM_LINES = [
  'Calma, calma. Sem pressão nenhuma, tá? Pode perguntar o que quiser.',
  'Desculpa, eu me empolguei. Vamos devagar, no seu tempo.',
  'Olha, se não quiser, tudo bem. Só tô aqui pra ajudar mesmo.',
  'Respira. Eu também ficaria desconfiado. Vamos com calma.',
];

/** Modelos de frases que usam a ficha do interlocutor. */
export const FACT_LINES: Record<string, string[]> = {
  pet: [
    'Aliás, como vai o {petName}? Seu {petType} está no nosso cadastro de clientes especiais.',
    'Aqui no sistema aparece até o {petName}, seu {petType}. Mande um beijo pra ele!',
  ],
  relative: [
    'Inclusive, foi seu {relation} {relativeName} que indicou seu nome pra gente.',
    'O {relativeName}, seu {relation}, já é nosso cliente há anos. Gente finíssima.',
  ],
  city: [
    'Aqui consta que você é de {city}. Terra boa! Nossa melhor filial é aí.',
    'Moro pertinho de {city}, sabia? Somos praticamente vizinhos.',
  ],
  bank: [
    'Já confirmei aqui com o {bank}, está tudo certinho com seu cadastro.',
    'O {bank} é nosso parceiro oficial. Por isso seu nome foi aprovado.',
  ],
  team: [
    'E o {team}, hein? Esse ano sobe! Torço junto.',
    'Vi aqui que você torce pro {team}. Gente de bom gosto.',
  ],
  hobby: [
    'Vi que você curte {hobby}. O prêmio vem com um kit de {hobby} de brinde!',
    'Quem gosta de {hobby} sempre tem sorte. Estatística nossa.',
  ],
};
