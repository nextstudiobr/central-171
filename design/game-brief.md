# CENTRAL 171 — Briefing do jogo

> Registro de design no rigor `minimal` do estúdio: este briefing substitui os GDDs.
> A ordem de construção no fim é o plano de produção.

## Conceito

Simulador 3D em primeira pessoa, para um jogador, no navegador. Você é o novo
estagiário da **Disk Fortuna Soluções**, uma central de telemarketing que, nos
bastidores, aplica golpes fictícios e absurdos: jet-skis da "Loteria Netuno",
geladeiras com vírus, heranças de príncipes inexistentes, seguro contra abdução
e a CapivaraCoin. Atenda ligações, converse com personagens que têm memória e
personalidade, consulte o computador da central, bata a meta do chefe e
sobreviva a cinco expedientes cada vez mais caóticos.

Comédia negra. Nada no jogo funciona no mundo real: os golpes são deliberadamente
impossíveis e as vítimas, bancos e moedas são inventados.

Referência de experiência: *Scam With Your Friends* (ciclo de ligações, meta do
chefe, computador da central e caos crescente). Nenhum conteúdo do jogo original
foi usado.

## Pilares

1. **O telefone é o coração.** Toda conversa tem estado (confiança, desconfiança,
   paciência, credulidade, riqueza) e as escolhas mudam o resultado de verdade.
2. **O escritório faz parte da jogabilidade.** Rede, energia, triturador, café,
   sala do chefe e colegas são sistemas, não cenário.
3. **Pressão compreensível.** Tempo de resposta, rastreio, exposição policial e
   exigências do chefe criam tensão que o jogador consegue ler e controlar.

## Ciclo principal

Briefing do chefe → sentar na mesa → o telefone toca → conversar (escolhas
cronometradas) → consultar a ficha no Arquivo de Casos → cobrar → consequências
(dinheiro, comissão, exposição) → eventos interrompem → 18:00 → relatório,
advertência ou bônus → loja com a comissão → próximo dia.

## Sistemas (código em `src/`)

| Sistema | Arquivo | Resumo |
|---|---|---|
| Estado único | `systems/GameState.ts` | Campanha + dia; todos os sistemas leem e escrevem aqui |
| Economia | `systems/Economy.ts` | Todo dinheiro vira uma linha do extrato (meta, caixa, comissão) |
| Diálogo | `systems/Dialogue.ts` | Conversa com estado, perguntas de verificação, pagamento |
| Ligações | `systems/CallSystem.ts` | Toque, atendimento, tempo de resposta, rastreio, desfechos |
| Risco | `systems/Risk.ts` | Exposição policial com níveis e batida em 100% |
| Eventos | `systems/EventDirector.ts` | Chefe, colegas, rede, energia, vírus, investigação, ligações misteriosas |
| Campanha | `systems/Campaign.ts` | Avaliação diária, advertências, patentes e finais |
| Salvamento | `systems/Save.ts` | Checkpoint no início de cada dia (localStorage, com validação) |
| Mundo 3D | `world/*` | Escritório, iluminação, personagens, colisão, telas dinâmicas |
| Interface | `ui/*` | HUD, FortunaOS (desktop), painel de chamada, menus |
| Áudio | `audio/AudioEngine.ts` | Efeitos, ambiente e vozes 100% locais |

## Progressão (dados em `src/data/days.ts`)

| Dia | Meta | Novidade |
|---|---|---|
| 1 | T$ 900 | Tutorial integrado, Loteria Netuno, Dona Cleide |
| 2 | T$ 2.600 | Suporte GeloMax, perguntas de verificação, rede caindo, chamado do chefe |
| 3 | T$ 4.200 | Herança do Príncipe, rastreio, caçador de golpistas, policial disfarçada, lead quente, ligação misteriosa |
| 4 | T$ 6.500 | Seguro Anti-Abdução, queda de energia, mãe do chefe, Inspetora Moura |
| 5 | T$ 8.800 | CapivaraCoin, auditoria, proposta final da investigadora |

Metas calibradas pela simulação em `tests/unit/campaign.test.ts`: um jogador
atento bate a meta com folga em ~5 ligações; jogando ao acaso, não.

## Finais

- **Sócio da Firma** — bate a meta do último dia.
- **Demitido** — duas advertências, ou meta perdida no último dia.
- **Operação Tostão (preso)** — duas batidas policiais, ou batida no último dia.
- **Testemunha** — aceita o acordo da Inspetora Moura no último dia.

## Ordem de construção (concluída)

1. Estado, economia, diálogo e ligações, com testes unitários.
2. Escritório 3D, jogador, colisão, estação de trabalho.
3. Desktop FortunaOS e painel de chamada.
4. Eventos, chefe e colegas, risco e campanha de 5 dias.
5. Menus, áudio, salvamento, configurações.
6. Otimização, testes E2E no Chrome, playtest automatizado, build de produção.
