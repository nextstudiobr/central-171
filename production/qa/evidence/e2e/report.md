# Relatório E2E — CENTRAL 171

Data: 2026-10-21T22:25:33.563Z
Alvo: build de produção (vite preview) · Chrome (Playwright) · viewport 1280×720 e 1920×1080

**51/51 verificações passaram.**

| # | Verificação | Resultado | Detalhe |
|---|---|---|---|
| 1 | Inicialização: tela de título aparece | ✅ | 8054 ms |
| 2 | Renderização: WebGL ativo com GPU | ✅ | ANGLE (AMD, Radeon RX550/550 Series (0x0000699F) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| 3 | Renderização: cena desenhada (draw calls > 50) | ✅ | 455 draw calls, 128524 triângulos |
| 4 | Desempenho: FPS medido em 1280×720 (tela de título, câmera orbitando) | ✅ | 68 FPS, escala 1.00, 428 draw calls |
| 5 | Campanha: dia 1 em andamento | ✅ | modo=play dia=1 |
| 6 | Áudio: contexto Web Audio ativo após o clique | ✅ | estado=running; voz pt-BR local=sim (Microsoft Daniel - Portuguese (Brazil) (local), Microsoft Maria - Portuguese (Brazil) (local)) |
| 7 | Câmera: arrastar o mouse gira a visão | ✅ | yaw 0.88 → 1.32 |
| 8 | Movimento: W anda para frente | ✅ | 3.24 m em 1,2 s |
| 9 | Movimento: D anda para o lado | ✅ | Δx 1.20 m |
| 10 | Colisão: não atravessa a parede leste | ✅ | x final 10.70 (parede em 11) |
| 11 | Colisão: não atravessa a mesa | ✅ | z final 1.68 (borda da mesa em 1,38) |
| 12 | Interação: mira na cadeira mostra o aviso | ✅ | alvo=chair |
| 13 | Estação: E senta na cadeira | ✅ | modo=seated |
| 14 | Desktop: FortunaOS aparece sobre o monitor | ✅ |  |
| 15 | Telefone: tocou depois do tutorial | ✅ |  |
| 16 | Telefone: E atende a ligação | ✅ | fase=active interlocutor=Dona Cleide Fagundes |
| 17 | Arquivo de Casos: ficha da linha atual abre após a consulta | ✅ |  |
| 18 | Diálogo: ficha aberta libera opções novas (Ficha ou resposta) | ✅ |  |
| 19 | Ligação: termina com um desfecho registrado | ✅ | desfecho=paid (fim) |
| 20 | Dinheiro: pagamento atualiza meta, caixa e comissão juntos | ✅ | arrecadado=260 caixa=260 comissão=31 |
| 21 | HUD: indicador da meta mostra o mesmo valor do estado | ✅ | T$ 260 / T$ 900 |
| 22 | Pausa: Esc abre o menu de pausa | ✅ |  |
| 23 | Pausa: o relógio do expediente para | ✅ |  |
| 24 | Configurações: volume salvo no navegador | ✅ | masterVolume=0.4 |
| 25 | Pausa: Continuar volta ao jogo | ✅ |  |
| 26 | Evento: queda de rede desliga a linha | ✅ | rede=false |
| 27 | Evento: segurar E no armário reinicia a rede | ✅ | rede=true |
| 28 | Evento: vírus bloqueia o Arquivo de Casos | ✅ |  |
| 29 | Evento: fechar os pop-ups limpa o vírus | ✅ |  |
| 30 | Evento: entrar na sala do chefe abre a conversa | ✅ |  |
| 31 | Evento: conversa com o chefe termina e libera o jogo | ✅ |  |
| 32 | Evento: queda de energia apaga a central | ✅ |  |
| 33 | Evento: disjuntor religa a energia | ✅ |  |
| 34 | Risco: exposição alta inicia investigação | ✅ | exposição=62 eventos=investigation |
| 35 | Risco: triturar provas reduz a exposição | ✅ | 62 → 39 |
| 36 | Fim do expediente: relatório aparece às 18:00 | ✅ |  |
| 37 | Loja: compra de melhoria desconta a comissão | ✅ | 496 → 406 |
| 38 | Salvamento: progresso salvo ao avançar o dia | ✅ | dia salvo=2 |
| 39 | Carregamento: título oferece "Continuar (Dia 2)" | ✅ |  |
| 40 | Carregamento: campanha retomada no dia 2 com a melhoria comprada | ✅ | dia=2 melhorias=ssd |
| 41 | Progressão: dia 2 começa com meta 2600 | ✅ |  |
| 42 | Progressão: dia 3 começa com meta 4200 | ✅ |  |
| 43 | Progressão: dia 4 começa com meta 6500 | ✅ |  |
| 44 | Progressão: dia 5 começa com meta 8800 | ✅ |  |
| 45 | Campanha: final alcançado ("Sócio") ao bater todas as metas | ✅ | final=socio |
| 46 | Campanha: salvamento apagado após o final | ✅ |  |
| 47 | Reinício: volta à tela de título | ✅ |  |
| 48 | Derrota: exposição 100% causa batida policial e encerra o dia | ✅ | BATIDA POLICIAL |
| 49 | Desempenho: FPS medido em 1920×1080 (vista ampla do escritório) | ✅ | 56 FPS, escala de resolução 0.80, 439 draw calls (ANGLE (AMD, Radeon RX550/550 Series (0x0000699F) Direct3D11 vs_5_0 ps_5_0, D3D11)) |
| 50 | Console: nenhum erro de JavaScript | ✅ |  |
| 51 | Rede: nenhuma requisição essencial falhou | ✅ |  |

Capturas de tela: arquivos `NN-*.png` nesta pasta.