/** Falas e roteiros do chefe e dos colegas da Disk Fortuna. */

export type NpcId = 'boss' | 'tonhao' | 'pri' | 'juninho';

export const NPC_NAMES: Record<NpcId, string> = {
  boss: 'Seu Gervásio',
  tonhao: 'Tonhão',
  pri: 'Pri',
  juninho: 'Juninho',
};

export const BOSS_LINES = {
  patrol: [
    'Telefone parado é dinheiro parado!',
    'Eu tô vendo vocês. Eu sempre tô vendo vocês.',
    'Quem bater a meta ganha um abraço. Meu. Não é opcional.',
    'Esse cheiro é de café ou de fracasso?',
    'Lembrem: a gente não engana ninguém. A gente vende esperança com prazo de validade.',
    'Juninho, isso é um pastel no teclado?',
  ],
  playerAway: ['Tá passeando?! O telefone tá tocando!', 'Ô, turista! Volta pra mesa!', 'Isso aqui não é excursão!'],
  missedCall: ['Perdeu ligação? Isso sai do seu couro!', 'Telefone tocou e ninguém atendeu. Que bonito.'],
  goodCall: ['Isso! É assim que se faz!', 'Ouvi o barulhinho do dinheiro. Lindo.', 'Muito bem. Não se acostume.'],
  badCall: ['Que vergonha.', 'Eu ouvi essa daí. Que vergonha alheia.', 'Meu sobrinho de 7 anos faria melhor.'],
  heat1: ['Tá todo mundo falando da gente no bairro. Menos barulho!', 'Alguém viu um carro parado lá fora?'],
  heat2: ['VIATURA LÁ EMBAIXO! Todo mundo pra triturar papel!', 'Modo discreto, gente! Somos uma empresa de entregas!'],
  heat3: ['Eles vão entrar! ESCONDE O FICHÁRIO!', 'Ninguém viu nada! Eu nem conheço vocês!'],
  quotaMet: ['Bateu a meta? Ótimo. Agora bate de novo.', 'Meta batida. Fico emocionado. Por dentro. Bem por dentro.'],
};

export const BOSS_DAY_END = {
  excellent: [
    'Cento e cinquenta por cento?! Vou mandar emoldurar seu crachá!',
    'Isso é que é funcionário! Toma um bônus antes que eu me arrependa.',
  ],
  met: ['Meta batida. Amanhã tem mais. Sempre tem mais.', 'Tá bom. Não é genial, mas é dinheiro.'],
  missed: [
    'Não bateu a meta. Isso é uma ADVERTÊNCIA. Mais uma e você vai vender coxinha na porta.',
    'Decepcionante. Vou anotar no seu prontuário. Sim, eu tenho um prontuário.',
  ],
  raided: ['A POLÍCIA ESTEVE AQUI! Por SUA causa! A multa sai do caixa e a advertência sai de você!'],
};

export const COWORKER_IDLE: Record<Exclude<NpcId, 'boss'>, string[]> = {
  tonhao: [
    'Hoje eu tô inspirado. Já falei com três avós e uma delas me adotou.',
    'Ô, parceiro, você viu meu grampeador?',
    'Se o chefe perguntar, eu tô no banheiro desde as dez.',
    'Comprei um jet-ski de verdade com a comissão. Tá na garagem. Não tenho mar.',
  ],
  pri: [
    'Dica grátis: vovó gosta de conversa. Executivo gosta de protocolo.',
    'Eu não sou golpista. Sou "consultora de expectativas".',
    'Quem pede TUDO sem confiança, ganha NADA com denúncia.',
    'Se ouvir clique na linha, desliga. Clique é rastreio.',
  ],
  juninho: [
    'Gente, alguém sabe se golpe dá estágio obrigatório?',
    'Eu queria ser influencer. Mas aqui pelo menos tem café.',
    'Hoje uma senhora me deu receita de bolo. Acho que eu é que caí no golpe.',
    'O chefe disse que se eu errar de novo ele me transforma em isca.',
  ],
};

/** Roteiros com escolhas; efeitos são interpretados pelo EventDirector. */
export interface NarrativeChoice {
  text: string;
  next?: string;
  effects?: string[];
  /** Condição simples avaliada pelo EventDirector (ex.: "flag:moura_listen"). */
  requires?: string;
}

export interface NarrativeNode {
  speaker: string;
  text: string;
  choices: NarrativeChoice[];
}

export interface NarrativeScript {
  id: string;
  title: string;
  portrait: NpcId | 'mystery';
  start: string;
  nodes: Record<string, NarrativeNode>;
}

export function bossSummonScript(progress: number, day: number): NarrativeScript {
  const good = progress >= 0.5;
  return {
    id: 'boss_summon',
    title: 'Sala do Chefe',
    portrait: 'boss',
    start: 'a',
    nodes: {
      a: {
        speaker: 'Seu Gervásio',
        text: good
          ? `Senta. Não, fica em pé. Você tá com ${Math.round(progress * 100)}% da meta. Isso é... aceitável. O que você tem a dizer?`
          : `Senta. ${Math.round(progress * 100)}% da meta?! Eu já demiti gente por 60. Gente boa. Gente com família. Explica.`,
        choices: [
          { text: 'Mostrar os números no tablet', next: good ? 'nums_good' : 'nums_bad', effects: good ? ['boss+1'] : ['boss-1'] },
          { text: '"Seu Gervásio, esse terno é novo? Tá parecendo um ministro."', next: 'flatter', effects: ['boss+1'] },
          { text: 'Culpar o Juninho pela internet lenta', next: 'blame', effects: ['juninho-1', 'boss+0.5'] },
          { text: 'Pedir aumento', next: 'raise', effects: ['boss-1'] },
        ],
      },
      nums_good: {
        speaker: 'Seu Gervásio',
        text: 'Hum. Gráfico subindo. Eu gosto de gráfico subindo. Toma T$ 60 e some daqui.',
        choices: [{ text: 'Voltar pro trabalho', effects: ['bonus:60'] }],
      },
      nums_bad: {
        speaker: 'Seu Gervásio',
        text: 'Esse gráfico é uma linha reta. Isso é um eletrocardiograma de defunto. Volta e liga pra alguém.',
        choices: [{ text: 'Voltar pro trabalho' }],
      },
      flatter: {
        speaker: 'Seu Gervásio',
        text: day >= 3 ? 'É italiano. Comprei com dinheiro de jet-ski. Gostei de você. Mas a meta continua a mesma.' : 'É novo, sim. Obrigado. Isso não muda nada. Mas obrigado.',
        choices: [{ text: 'Voltar pro trabalho' }],
      },
      blame: {
        speaker: 'Seu Gervásio',
        text: 'JUNINHO! ... Ele não tá ouvindo, tá com fone. Vou descontar dele mesmo assim. Volta pro trabalho.',
        choices: [{ text: 'Voltar pro trabalho (sem olhar pro Juninho)' }],
      },
      raise: {
        speaker: 'Seu Gervásio',
        text: 'Aumento? AUMENTO? Hahaha! Ótima piada. Vou contar no churrasco. Agora sai.',
        choices: [{ text: 'Sair de fininho' }],
      },
    },
  };
}

export function tonhaoHelpScript(): NarrativeScript {
  return {
    id: 'tonhao_help',
    title: 'Tonhão',
    portrait: 'tonhao',
    start: 'a',
    nodes: {
      a: {
        speaker: 'Tonhão',
        text: 'Ô, parceiro! Tô com uma cliente na espera que é a sua cara: já tá quentinha, confiando, só falta fechar. Te passo. Mas aí você me deve uma, hein?',
        choices: [
          { text: 'Aceitar a ligação transferida', next: 'yes', effects: ['tonhao+1', 'transfer_call'] },
          { text: '"Tô ocupado, Tonhão."', next: 'no', effects: ['tonhao-1'] },
        ],
      },
      yes: {
        speaker: 'Tonhão',
        text: 'Aí sim! Já tá tocando aí. Ela acha que você é sobrinho dela. Não desmente.',
        choices: [{ text: 'Valeu, Tonhão' }],
      },
      no: {
        speaker: 'Tonhão',
        text: 'Beleza. Vou lembrar disso quando a internet cair, viu?',
        choices: [{ text: '...' }],
      },
    },
  };
}

export function juninhoScript(): NarrativeScript {
  return {
    id: 'juninho_help',
    title: 'Juninho',
    portrait: 'juninho',
    start: 'a',
    nodes: {
      a: {
        speaker: 'Juninho',
        text: 'Ei... posso te perguntar uma coisa? Como você faz pra pessoa confiar? A minha última cliente me mandou rezar um terço.',
        choices: [
          { text: '"Lê a ficha antes. Fala do bicho de estimação."', next: 'tip', effects: ['juninho+1'] },
          { text: '"Pede TUDO logo de cara. Sempre funciona."', next: 'prank', effects: ['juninho-1', 'heat+4'] },
          { text: '"Agora não, Juninho."', effects: ['juninho-0.5'] },
        ],
      },
      tip: {
        speaker: 'Juninho',
        text: 'Ahhh! Faz sentido! Valeu! Vou te trazer um café depois. Prometo que não derrubo.',
        choices: [{ text: 'Voltar ao trabalho' }],
      },
      prank: {
        speaker: 'Juninho',
        text: 'Beleza! Vou tentar! ... ... Ele denunciou a gente. Desculpa. Acho que eu falei o nome da empresa.',
        choices: [{ text: 'Fingir que não ouviu' }],
      },
    },
  };
}

export function mysteryScript(day: number, flags: Record<string, unknown>): NarrativeScript {
  if (day <= 3) {
    return {
      id: 'mystery_1',
      title: 'Número privado',
      portrait: 'mystery',
      start: 'a',
      nodes: {
        a: {
          speaker: 'Voz desconhecida',
          text: '(Respiração calma.) Disk Fortuna Soluções. Jet-skis, geladeiras, príncipes... Vocês são criativos. Você parece diferente dos outros. Por que está aí?',
          choices: [
            { text: '"Quem está falando?"', next: 'who', effects: ['flag:moura_listen'] },
            { text: '"Aqui é uma empresa séria de entregas."', next: 'lie', effects: ['heat+4'] },
            { text: 'Desligar imediatamente', effects: ['heat+2'] },
          ],
        },
        who: {
          speaker: 'Voz desconhecida',
          text: 'Alguém que está prestando atenção. A gente se fala de novo. Guarde este número na memória, não no computador.',
          choices: [{ text: 'Desligar, com as mãos suando' }],
        },
        lie: {
          speaker: 'Voz desconhecida',
          text: 'Entregas. Claro. Entreguem-se, então. É mais barato. (Clique.)',
          choices: [{ text: 'Desligar' }],
        },
      },
    };
  }
  const listened = Boolean(flags.moura_listen) || Boolean(flags.moura_unmasked);
  return {
    id: 'mystery_2',
    title: 'Número privado',
    portrait: 'mystery',
    start: 'a',
    nodes: {
      a: {
        speaker: 'Inspetora Moura',
        text: listened
          ? 'Sou eu de novo. Inspetora Moura, Delegacia de Golpes Absurdos. Você foi o único que perguntou quem eu era. Isso me diz alguma coisa sobre você.'
          : 'Aqui é a Inspetora Moura, Delegacia de Golpes Absurdos. Temos gravações. Temos rastreios. Temos paciência.',
        choices: [
          { text: '"O que você quer de mim?"', next: 'want', effects: ['flag:moura_listen'] },
          { text: 'Negar tudo com convicção', next: 'deny', effects: ['heat+6'] },
          { text: 'Desligar', effects: ['heat+4'] },
        ],
      },
      want: {
        speaker: 'Inspetora Moura',
        text: 'Quero o Gervásio. Não você. Pense nisso até sexta. E pare de ligar pra aposentado, pelo amor de Deus.',
        choices: [{ text: 'Desligar e encarar o teto' }],
      },
      deny: {
        speaker: 'Inspetora Moura',
        text: 'Ótimo. Nega mesmo. Eu adoro quando negam. Fica tudo mais bonito no relatório.',
        choices: [{ text: 'Desligar' }],
      },
    },
  };
}

export function finalDealScript(flags: Record<string, unknown>): NarrativeScript {
  const canDeal = Boolean(flags.moura_listen) || Boolean(flags.moura_unmasked);
  if (!canDeal) {
    return {
      id: 'final_threat',
      title: 'Número privado',
      portrait: 'mystery',
      start: 'a',
      nodes: {
        a: {
          speaker: 'Inspetora Moura',
          text: 'Disk Fortuna? Avisa seu chefe que hoje a gente passa aí. Não precisa preparar café.',
          choices: [
            { text: 'Desligar e avisar o chefe', effects: ['heat+12', 'boss+1'] },
            { text: 'Desligar e não contar pra ninguém', effects: ['heat+18'] },
          ],
        },
      },
    };
  }
  return {
    id: 'final_deal',
    title: 'Inspetora Moura',
    portrait: 'mystery',
    start: 'a',
    nodes: {
      a: {
        speaker: 'Inspetora Moura',
        text: 'Última conversa. Proposta simples: você liga o gravador do celular quando o Gervásio contar o dinheiro hoje às 18h. Em troca, você sai como testemunha, não como réu. Decide agora.',
        choices: [
          { text: 'Aceitar o acordo (final alternativo)', next: 'yes', effects: ['flag:deal_accepted', 'heat-30'] },
          { text: 'Recusar: "Eu sou leal à firma."', next: 'no', effects: ['heat+15', 'boss+1'] },
        ],
      },
      yes: {
        speaker: 'Inspetora Moura',
        text: 'Boa escolha. Continua trabalhando normalmente. Normalmente quer dizer: sem pressa de fugir. Às 18h, a gente entra.',
        choices: [{ text: 'Desligar e esconder as mãos trêmulas' }],
      },
      no: {
        speaker: 'Inspetora Moura',
        text: 'Lealdade. Bonito. O Gervásio não tem nenhuma por você, sabia? Boa sorte com a meta.',
        choices: [{ text: 'Desligar' }],
      },
    },
  };
}
