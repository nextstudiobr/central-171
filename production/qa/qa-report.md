# Relatório de QA — CENTRAL 171

Data: 21/10/2026 · Build: `dist/` gerada por `npm run build` (Vite 8, Three.js r186)
Máquina de teste: Windows 10 Pro, Google Chrome 156, GPU AMD Radeon RX 550 (Direct3D 11 via ANGLE)

## Resumo

| Bateria | Como roda | Resultado |
|---|---|---|
| Testes unitários (Vitest) | `npm test` | **44/44 passaram** |
| Simulação de balanceamento das metas (dentro dos unitários) | 40 expedientes simulados por dia, jogador atento × jogador ao acaso | **5/5 dias** dentro da faixa-alvo |
| Testes de ponta a ponta no Chrome (Playwright) | `npm run test:e2e` contra a build de produção | **51/51 verificações passaram** |
| Playtest automatizado em tempo real | `node tests/e2e/play-days.mjs 3` | **3 expedientes completos**, nenhum erro de JavaScript |
| Inspeção visual | Capturas lidas e avaliadas uma a uma durante o desenvolvimento | Problemas encontrados e corrigidos (ver abaixo) |

## Evidências

- `production/qa/evidence/e2e/report.md`: tabela das 51 verificações com detalhes medidos.
- `production/qa/evidence/e2e/NN-*.png`: 24 capturas em 1280×720 e 1920×1080: título, briefing, HUD,
  colisão, aviso de interação, desktop, mensagens, telefone tocando, diálogo, ficha, resultado
  da ligação, configurações, rede caída, vírus, sala do chefe, queda de energia, viatura e
  triturador, relatório do dia, dia 2 carregado do salvamento, dia 3, final, batida policial,
  jogo e desktop em 1920×1080.
- `production/qa/evidence/e2e/report.json`: resultados, erros de console (nenhum) e requisições com falha (nenhuma).
- `production/qa/evidence/playtest/playtest.md`, `playtest.json` e 21 capturas: playtest de 3 dias.

## O que foi testado (e como)

**Executado no navegador real (Chrome, build de produção):**
inicialização; WebGL na GPU; renderização da cena; câmera (arrastar o mouse); movimento WASD;
colisão com parede e com mesa; mira e aviso de interação; sentar com E; desktop alinhado ao
monitor; telefone tocando depois do tutorial; atender com E; ligação completa com escolhas por
clique; consulta da ficha no Arquivo de Casos durante a ligação; pergunta de verificação
respondida pela ficha; pagamento; meta, caixa e comissão atualizados pelo mesmo lançamento;
HUD igual ao estado; pausa com Esc congelando o relógio; configurações salvas; eventos de queda
de rede (consertada segurando E no rack), vírus (limpo fechando pop-ups), chamado do chefe
(diálogo ao entrar na sala), queda de energia (disjuntor) e investigação (triturador reduz a
exposição); fim do dia às 18:00; compra na loja; salvamento ao avançar; recarregar a página e
continuar no dia 2 com a melhoria; progressão dos 5 dias com metas corretas; final "Sócio";
salvamento apagado no fim; reinício; derrota por batida policial em 100% de exposição; áudio
ativo; FPS em duas resoluções; console sem erros; nenhuma requisição falhou.

**Atalhos usados nos testes E2E (declarados):** teletransporte e mira programada até os pontos
de interação (a tecla E e os cliques são reais); nos dias 2 a 5 do teste de campanha a meta foi
preenchida com pagamentos pelo caminho normal da economia, para percorrer a campanha em minutos.
A ligação real completa foi testada no dia 1 do E2E e nos 3 dias do playtest.

**Playtest em tempo real (build de produção, antes do último ajuste de metas e de pequenos
polimentos):** um robô jogou os dias 1 a 3 inteiros pela interface, com 13, 12 e 14 ligações e
todos os eventos sorteados resolvidos (exigência do chefe, rede caindo, Tonhão, chamado do
chefe, Juninho, Pri, lead quente discado pelo PABX, ligação misteriosa). Arrecadou 4,2×, 5,0× e
5,2× a meta. O robô decide com os números internos da conversa e responde quase
instantaneamente, então é um teto de desempenho, não um jogador típico. Depois disso as metas
dos dias 2 a 5 subiram cerca de 10%.

**Testes unitários:** economia (lançamentos, multas, estornos, compras), diálogo (determinismo,
opção Ficha só com a ficha aberta, preferências, repetição, pergunta forçada, pagamento,
denúncia, tempo esgotado, desmascarar policial), campanha (bônus, patente, demissão, finais,
batida, exposição herdada), risco (níveis, decaimento, batida), salvamento (salvar, carregar,
arquivo corrompido), ligações (perda, rede fora, Dona Cleide, tempo esgotado, rastreio e
desligar a tempo, armadilha policial com estorno, comprovante falso com vírus, mãe do chefe) e
eventos (rede, exigência do chefe, chamado, investigação, batida, relação com o Tonhão, acordo
final só para quem conversou com a investigadora).

## Desempenho medido

| Cenário | FPS | Escala de resolução | Draw calls |
|---|---|---|---|
| 1280×720, tela de título com câmera orbitando | 68–72 | 1,00 (nativa) | 428 |
| 1920×1080, vista ampla do escritório | 55–56 | 0,80 (adaptativa) | 439 |

Antes das otimizações (agrupamento de malhas estáticas, menos objetos projetando sombra, menos
luzes, resolução adaptativa), a mesma cena fazia 1052 draw calls e 42 FPS em 1920×1080. Os 60 FPS
em 1080p **não** foram atingidos nesta GPU de entrada (RX 550, 2017); o jogo reduz a resolução
interna automaticamente para ficar acima de 50 FPS.

## Problemas encontrados e corrigidos durante o QA

- Canvas iniciava com tamanho zero quando o contêiner ainda não tinha medida (tela vazia).
- O tutorial travava: o telefone só tocava depois de ler *todas* as mensagens.
- Com FPS baixo, o desktop não aparecia ao sentar (temporizador fixo menor que a transição).
- HUD sobreposto ao monitor quando sentado; avisos ficavam por baixo do desktop.
- Diálogo narrativo entrava deslocado (conflito de animação CSS).
- Iluminação lavada (brilho excessivo dos painéis do teto) e luminária estourando a imagem.
- Reflexo forte da luz do monitor na própria tela.
- Fechar os pop-ups do vírus demorava demais.
- Relatório de fim de dia translúcido demais sobre o HUD.
- Música de espera acumulava notas enquanto o áudio estava bloqueado pelo navegador.
- Final "Testemunha" passava pela tela de batida policial com multa indevida.
- Evento de ajuda do Juninho nunca era sorteado; eventos do mesmo colega podiam se sobrepor.
- Telefone continuava tocando com o jogo pausado; vozes cortavam a fala anterior.
- Servidores de teste ficavam abertos após os testes (processo filho com shell).

## Limitações conhecidas

- **Captura do mouse (pointer lock):** o Chrome normal permite, mas os navegadores automatizados
  e embutidos usados no QA não. Nesse caso o jogo cai no modo "segure e arraste para olhar", e foi
  esse caminho que os testes exercitaram. O caminho com captura do mouse não foi verificado com um
  mouse físico.
- **Áudio:** foi verificado que o Web Audio inicia e que o Chrome tem vozes pt-BR locais
  (Microsoft Daniel e Maria). A qualidade sonora e a mixagem não foram avaliadas de ouvido.
- **Dificuldade para humanos:** as metas foram calibradas por simulação e pelo playtest do robô.
  Ninguém humano jogou a campanha inteira; o ritmo real de uma pessoa (estimado em 4–5 ligações
  por expediente) ainda precisa ser confirmado.
- **Dias 4 e 5 em tempo real:** queda de energia programada, mãe do chefe e acordo final foram
  testados por testes unitários e por disparo direto no E2E, não pelo robô em tempo real.
- Personagens procedurais simples (sem esqueleto nem captura de movimento) e móveis low-poly do
  Kenney: estilo coerente, mas não fotorrealista.
- Apenas teclado e mouse (sem controle), apenas português do Brasil, apenas desktop.
- Pacote JavaScript de 911 kB (254 kB comprimido) num arquivo só.
