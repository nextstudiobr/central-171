# CENTRAL 171

**Simulador 3D de uma central de golpes fictícia e absurda — para um jogador, no navegador.**

Você acaba de ser contratado pela *Disk Fortuna Soluções*, um escritório de
telemarketing que, por trás das divisórias, vende jet-skis imaginários, cura
geladeiras com vírus e entrega heranças de príncipes que não existem. Atenda o
telefone, converse com personagens que lembram do que você disse, consulte o
computador da central, bata a meta do chefe e sobreviva a cinco expedientes
cada vez mais caóticos sem ser demitido, preso ou, pior, promovido.

> Obra de ficção e comédia. Todos os golpes, pessoas, bancos e moedas são
> inventados e impossíveis. Na vida real, golpe é crime e machuca gente de
> verdade. O dinheiro do jogo (tostões, **T$**) só existe dentro da simulação.

---

## Requisitos

- **Node.js 20 ou mais novo** (testado com Node 24) e npm.
- **Google Chrome** atualizado, com aceleração de hardware ativada (WebGL 2).
- Nenhuma conta, chave de API ou internet é necessária para jogar: todos os
  assets ficam na pasta `public/assets/`.

## Instalação

```bash
npm install
```

## Jogar

Modo desenvolvimento (recarrega ao editar o código):

```bash
npm run dev
```

Abra **http://localhost:5173** no Chrome.

Build de produção e servidor local da build:

```bash
npm run build
```

```bash
npm run preview
```

Abra **http://localhost:4173**. A build fica em `dist/` e pode ser servida por
qualquer servidor de arquivos estáticos.

## Controles

| Ação | Tecla |
|---|---|
| Andar | `W` `A` `S` `D` (setas também funcionam) |
| Correr | `Shift` |
| Olhar | Mouse (clique na tela para capturar o cursor; sem captura, segure e arraste) |
| Interagir / atender o telefone | `E` ou clique |
| Ações de segurar (roteador, triturador, café) | Segure `E` |
| Escolher resposta na ligação | Clique ou teclas `1`–`6` |
| Levantar da mesa | `Q` (ou comece a andar com `WASD`) |
| Pausa / liberar o cursor | `Esc` |

Sentado diante do monitor, o cursor fica livre para usar o **FortunaOS**, o
sistema do computador da central. A câmera não gira enquanto você usa a tela.

## Como se joga

1. **Briefing.** Cada dia começa com o memorando do chefe e a meta.
2. **Sente-se** na sua mesa (cadeira laranja) e espere o telefone tocar.
3. **Atenda** e escolha respostas. Cada resposta usa uma abordagem: Simpatia,
   Autoridade, Urgência, Improviso, Ficha ou Recuar. Cada personalidade reage de
   um jeito. O rosto e a cor da reação mostram se a pessoa gostou.
4. **Consulte a ficha** no app *Arquivo de Casos* durante a ligação ("Linha
   atual"). Com a ficha aberta surgem frases da categoria **Ficha**, muito
   convincentes. As perguntas de verificação ("qual o nome do meu gato?") também
   têm a resposta na ficha.
5. **Cobre** no fim da conversa. Pedir mais do que a confiança aguenta leva a
   recusa ou denúncia.
6. **Cuidado com o risco.** Denúncias e rastreios aumentam a **exposição** da
   central. Ouviu um clique na linha? É rastreio: desligue antes da barra
   vermelha encher. Exposição alta traz viaturas, investigação e, em 100%, uma
   batida policial. O triturador e o *Modo Discreto* do PABX ajudam.
7. **Eventos** interrompem o dia: o chefe chama na sala dele ou exige resultado
   imediato, a rede cai, falta luz, um vírus trava o computador, colegas pedem
   favores, chegam leads quentes para discar e ligações misteriosas.
8. **Às 18:00** o dia termina. Bater a meta rende bônus e promoção. Perder a meta
   rende advertência; duas advertências, demissão. Com a comissão, compre
   melhorias no Almoxarifado.

A campanha tem **5 expedientes** e **4 finais**. O progresso é salvo
automaticamente no começo de cada dia ("Continuar" na tela inicial).

### Apps do FortunaOS

| App | Para que serve |
|---|---|
| Painel | Meta, arrecadado, caixa da operação, comissão, exposição, iscas ativas e extrato |
| PABX | Estado da linha, discador para leads quentes, Modo Discreto, histórico do dia |
| Arquivo de Casos | Busca por nome ou número e fichas completas dos interlocutores |
| Lista Quente | Números perigosos: policiais disfarçados, caçadores de golpista, repórteres |
| Mensagens | Ordens do chefe, recados dos colegas, propostas |
| Desempenho | Cargo, advertências, conversão, relação com a equipe, histórico |
| Almoxarifado | Melhorias compradas com a comissão |
| Antivírus | Remove o vírus do "comprovante_pix.exe" |
| Configurações | Áudio, mouse, campo de visão, velocidade do texto, efeitos |

### Configurações

Volume geral, efeitos, ambiente e vozes; vozes sintetizadas (usa a voz pt-BR
local do sistema, se existir); sensibilidade e inversão do mouse; campo de
visão; velocidade do texto; **reduzir efeitos visuais** (desliga brilho,
granulado, balanço da câmera e luzes piscando fortes); pular dicas do tutorial.

## Testes

Testes unitários (economia, diálogo, campanha, risco, salvamento e uma
simulação de balanceamento das metas):

```bash
npm test
```

Testes de ponta a ponta no Chrome instalado, contra a build de produção
(rode `npm run build` antes). Geram capturas e relatório em
`production/qa/evidence/e2e/`:

```bash
npm run test:e2e
```

Playtest automatizado em tempo real (um robô joga expedientes inteiros pela
interface), com relatório em `production/qa/evidence/playtest/`:

```bash
node tests/e2e/play-days.mjs 3
```

## Estrutura

```
src/
  core/       barramento de eventos, gerador aleatório com semente, utilidades
  data/       todo o conteúdo e balanceamento: golpes, personalidades, dias, falas
  systems/    lógica pura: estado, economia, diálogo, ligações, risco, eventos, campanha, salvamento
  world/      cena 3D: escritório, iluminação, personagens, colisão, jogador, telas
  ui/         HUD, FortunaOS, painel de chamada, menus
  audio/      efeitos, ambiente e vozes sintetizados
  game/       Game.ts orquestra tudo
public/assets/  modelos, texturas e HDRI (ver ASSET_CREDITS.md)
tests/unit/     Vitest
tests/e2e/      Playwright (Chrome)
design/game-brief.md      briefing de design
production/qa/            relatórios e evidências de QA
```

## Créditos

Assets de terceiros (todos CC0) estão listados em [ASSET_CREDITS.md](ASSET_CREDITS.md).

## Sobre o estúdio

Este repositório começou como o template
[Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
(agentes, skills, hooks e regras em `.claude/`). O jogo foi desenvolvido no
rigor `minimal` do estúdio: o briefing em `design/game-brief.md` é o registro de
design, e as evidências de QA ficam em `production/qa/`. A licença do template
está em [LICENSE](LICENSE).
