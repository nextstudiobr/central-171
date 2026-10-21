/**
 * Testes de ponta a ponta do CENTRAL 171 no Google Chrome instalado (Playwright).
 *
 * Uso:
 *   node tests/e2e/run-e2e.mjs            -> testa a build de produção (dist/) via `vite preview`
 *   node tests/e2e/run-e2e.mjs --dev      -> testa o servidor de desenvolvimento
 *   URL=http://localhost:5173 node tests/e2e/run-e2e.mjs   -> usa um servidor já aberto
 *   HEADED=1 ...                           -> abre a janela do Chrome
 *
 * Gera capturas e o relatório em production/qa/evidence/e2e/.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join('production', 'qa', 'evidence', 'e2e');
const DEV = process.argv.includes('--dev');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const PORT = 5199;
const results = [];
const consoleErrors = [];
const failedRequests = [];
let shotN = 0;

function log(...a) {
  console.log('[e2e]', ...a);
}

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail) });
  log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}${detail ? ` (${detail})` : ''}`);
}

async function waitForServer(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function startServer() {
  if (process.env.URL) return { url: process.env.URL, proc: null };
  const vite = join('node_modules', 'vite', 'bin', 'vite.js');
  const args = DEV ? [vite, '--port', String(PORT), '--strictPort'] : [vite, 'preview', '--port', String(PORT), '--strictPort'];
  if (!DEV && !existsSync('dist/index.html')) throw new Error('dist/ não existe: rode "npm run build" antes, ou use --dev.');
  // Node direto (sem shell) para que kill() encerre o servidor de verdade.
  const proc = spawn(process.execPath, args, { stdio: 'ignore' });
  const url = `http://localhost:${PORT}/`;
  if (!(await waitForServer(url))) throw new Error('servidor não respondeu');
  return { url, proc };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const { url, proc } = await startServer();
  log('servidor:', url, DEV ? '(dev)' : '(produção)');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !process.env.HEADED,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.url()} — HTTP ${r.status()}`);
  });

  const snap = () => page.evaluate(() => window.__c171.snapshot());
  const api = (fn, ...args) => page.evaluate(([f, a]) => window.__c171[f](...a), [fn, args]);
  const shot = async (name) => {
    const file = join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };
  const waitFor = async (fn, ms = 8000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await sleep(step);
    }
    return false;
  };
  const clickText = async (selector, text) => {
    const loc = page.locator(selector, { hasText: text }).first();
    await loc.click();
  };

  try {
    // ------------------------------------------------------------ 1. inicialização
    const t0 = Date.now();
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const booted = await waitFor(async () => (await page.locator('.title-screen').count()) > 0, 30000);
    check('Inicialização: tela de título aparece', booted, `${Date.now() - t0} ms`);
    await sleep(1500);
    const s0 = await snap();
    check('Renderização: WebGL ativo com GPU', !/SwiftShader|desconhecido/i.test(s0.renderer), s0.renderer);
    check('Renderização: cena desenhada (draw calls > 50)', s0.drawCalls > 50, `${s0.drawCalls} draw calls, ${s0.triangles} triângulos`);
    await shot('titulo-1280x720');
    await sleep(6000);
    const sPerf = await snap();
    check('Desempenho: FPS medido em 1280×720 (tela de título, câmera orbitando)', sPerf.fps > 0, `${sPerf.fps} FPS, escala ${sPerf.renderScale.toFixed(2)}, ${sPerf.drawCalls} draw calls`);

    // ------------------------------------------------------------ 2. começo da campanha
    await clickText('.btn', 'Iniciar campanha');
    await page.locator('.btn', { hasText: 'Começar expediente' }).waitFor({ timeout: 5000 });
    await sleep(600);
    await shot('briefing-dia1');
    await clickText('.btn', 'Começar expediente');
    await sleep(1200);
    let s = await snap();
    check('Campanha: dia 1 em andamento', s.mode === 'play' && s.day === 1, `modo=${s.mode} dia=${s.day}`);
    const audio = await page.evaluate(() => {
      const a = window.__c171.game.audio;
      const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('pt')).map((v) => `${v.name}${v.localService ? ' (local)' : ''}`) : [];
      return { state: a.ctx?.state ?? 'sem contexto', tts: a.hasTts, voices };
    });
    check('Áudio: contexto Web Audio ativo após o clique', audio.state === 'running', `estado=${audio.state}; voz pt-BR local=${audio.tts ? 'sim' : 'não'} (${audio.voices.join(', ') || 'nenhuma voz pt listada no Chrome headless'})`);
    await shot('inicio-expediente-hud');

    // ------------------------------------------------------------ 3. câmera e movimento
    const yaw0 = s.yaw;
    await page.mouse.move(640, 360);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(640 - i * 20, 360);
    await page.mouse.up();
    s = await snap();
    check('Câmera: arrastar o mouse gira a visão', Math.abs(s.yaw - yaw0) > 0.2, `yaw ${yaw0.toFixed(2)} → ${s.yaw.toFixed(2)}`);
    await api('teleport', 7.6, 6.0, 0);
    const p0 = (await snap()).position;
    await page.keyboard.down('KeyW');
    await sleep(1200);
    await page.keyboard.up('KeyW');
    const p1 = (await snap()).position;
    const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    check('Movimento: W anda para frente', moved > 1.5, `${moved.toFixed(2)} m em 1,2 s`);
    await page.keyboard.down('KeyD');
    await sleep(500);
    await page.keyboard.up('KeyD');
    const p2 = (await snap()).position;
    check('Movimento: D anda para o lado', Math.abs(p2[0] - p1[0]) > 0.5, `Δx ${(p2[0] - p1[0]).toFixed(2)} m`);
    // Colisão: andar contra a parede leste por 3 s.
    await api('teleport', 9.5, 4.5, -Math.PI / 2);
    await page.keyboard.down('KeyW');
    await sleep(3000);
    await page.keyboard.up('KeyW');
    const pw = (await snap()).position;
    check('Colisão: não atravessa a parede leste', pw[0] < 10.8, `x final ${pw[0].toFixed(2)} (parede em 11)`);
    // Colisão com mesa: andar do corredor em direção à mesa do jogador.
    await api('teleport', 0, 3.4, 0);
    await page.keyboard.down('KeyW');
    await sleep(2500);
    await page.keyboard.up('KeyW');
    const pd = (await snap()).position;
    check('Colisão: não atravessa a mesa', pd[2] > 1.3, `z final ${pd[2].toFixed(2)} (borda da mesa em 1,38)`);
    await shot('colisao-mesa');

    // ------------------------------------------------------------ 4. interação e estação de trabalho
    await api('teleport', 0, 2.6, 0);
    const chair = await api('target', 'chair');
    await api('lookAt', chair[0], chair[1], chair[2]);
    await sleep(300);
    s = await snap();
    check('Interação: mira na cadeira mostra o aviso', s.prompt === 'chair' || s.prompt === 'monitor', `alvo=${s.prompt}`);
    await shot('aviso-interacao');
    await page.keyboard.press('KeyE');
    await sleep(1400);
    s = await snap();
    check('Estação: E senta na cadeira', s.seated, `modo=${s.playerMode}`);
    const dtVisible = await page.locator('.desktop-host.show').count();
    check('Desktop: FortunaOS aparece sobre o monitor', dtVisible === 1);
    await shot('desktop-sentado');

    // Mensagens (tutorial).
    await page.locator('.dt-icon[data-app="msg"]').click();
    await sleep(500);
    await shot('app-mensagens');

    // ------------------------------------------------------------ 5. ligação completa
    const rang = await waitFor(async () => (await snap()).callPhase === 'ringing', 25000);
    check('Telefone: tocou depois do tutorial', rang);
    await shot('telefone-tocando');
    await page.keyboard.press('KeyE');
    await sleep(600);
    s = await snap();
    check('Telefone: E atende a ligação', s.callPhase === 'active', `fase=${s.callPhase} interlocutor=${s.caller}`);
    const before = await snap();
    const turnLoop = async (maxTurns = 10) => {
      for (let turn = 0; turn < maxTurns; turn++) {
        const ready = await waitFor(async () => (await page.locator('.call .choice').count()) > 0 || (await snap()).callPhase !== 'active', 20000);
        if (!ready) return 'sem escolhas';
        if ((await snap()).callPhase !== 'active') return 'fim';
        const kinds = await page.$$eval('.call .choice', (els) => els.map((e) => e.className + '|' + e.textContent));
        let idx;
        // Pergunta de verificação: escolhe a resposta que bate com a ficha.
        const facts = await page.evaluate(() => {
          const c = window.__c171.game.calls.caller;
          return c ? [c.facts.petName, c.facts.city, c.facts.bank, c.facts.relativeName] : [];
        });
        idx = kinds.findIndex((k) => k.includes('k-answer') && facts.some((f) => k.includes(`"${f}"`)));
        if (idx < 0) idx = kinds.findIndex((k) => k.includes('k-ask') && k.includes('Pedir o justo'));
        if (idx < 0) idx = kinds.findIndex((k) => k.includes('t-facts'));
        if (idx < 0) idx = kinds.findIndex((k) => k.includes('t-charm'));
        if (idx < 0) idx = 0;
        await page.locator('.call .choice').nth(idx).click();
        await sleep(400);
      }
      return 'limite';
    };
    // Primeira escolha.
    await waitFor(async () => (await page.locator('.call .choice').count()) > 0, 20000);
    await shot('ligacao-dialogo');
    await page.locator('.call .choice').first().click();
    await sleep(500);
    // Consulta da ficha no Arquivo de Casos durante a ligação.
    await page.locator('.dt-icon[data-app="arquivo"]').click();
    await sleep(300);
    await page.locator('.win[data-win="arquivo"] .btn', { hasText: 'Linha atual' }).click();
    await sleep(200);
    await page.locator('.win[data-win="arquivo"] .list-item').first().click();
    await sleep(3500);
    const dossier = await page.locator('.win[data-win="arquivo"] .dossier').count();
    check('Arquivo de Casos: ficha da linha atual abre após a consulta', dossier === 1);
    await shot('arquivo-ficha');
    const factsChoice = await waitFor(async () => (await page.locator('.call .choice.t-facts').count()) > 0 || (await page.locator('.call .choice.k-answer').count()) > 0, 15000);
    check('Diálogo: ficha aberta libera opções novas (Ficha ou resposta)', factsChoice);
    const end = await turnLoop();
    await waitFor(async () => (await snap()).callPhase !== 'active', 15000);
    s = await snap();
    await shot('ligacao-resultado');
    const outcome = s.calls.at(-1);
    check('Ligação: termina com um desfecho registrado', !!outcome, `desfecho=${outcome} (${end})`);
    const paid = outcome === 'paid' || outcome === 'partial';
    check('Dinheiro: pagamento atualiza meta, caixa e comissão juntos', !paid || (s.collected > before.collected && s.balance === s.collected && s.wallet > 0), `arrecadado=${s.collected} caixa=${s.balance} comissão=${s.wallet}`);
    const hudText = await page.locator('.quota .value').textContent();
    check('HUD: indicador da meta mostra o mesmo valor do estado', hudText.replace(/\D/g, '').startsWith(String(Math.round(s.collected))), hudText);

    // ------------------------------------------------------------ 6. pausa e configurações
    await page.keyboard.press('Escape');
    await sleep(400);
    check('Pausa: Esc abre o menu de pausa', (await snap()).mode === 'paused');
    const clock1 = (await snap()).clock;
    await sleep(1500);
    check('Pausa: o relógio do expediente para', Math.abs((await snap()).clock - clock1) < 0.01);
    await clickText('.btn', 'Configurações');
    await sleep(300);
    await shot('configuracoes');
    const vol = page.locator('.settings-grid input[type=range]').first();
    await vol.fill('0.4');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('central171.settings.v1') || '{}').masterVolume);
    check('Configurações: volume salvo no navegador', Math.abs(saved - 0.4) < 0.01, `masterVolume=${saved}`);
    await clickText('.btn', 'Voltar');
    await sleep(200);
    await clickText('.btn', 'Continuar');
    await sleep(300);
    check('Pausa: Continuar volta ao jogo', (await snap()).mode === 'play');

    writeFileSync(join(OUT, 'partial.json'), JSON.stringify({ results }, null, 2));

    // ------------------------------------------------------------ 7. eventos
    if (!ONLY || ONLY.includes('events')) {
      await api('skipTutorial');
      // Rede caindo.
      await api('stand');
      await sleep(800);
      await api('trigger', 'network_down');
      await sleep(400);
      s = await snap();
      check('Evento: queda de rede desliga a linha', !s.networkUp && s.events.includes('network_down'), `rede=${s.networkUp}`);
      await shot('evento-rede-caiu');
      await api('teleport', -9.3, 6.4, Math.PI / 2);
      const rack = await api('target', 'rack');
      await api('lookAt', rack[0], rack[1], rack[2]);
      await sleep(200);
      await page.keyboard.down('KeyE');
      await sleep(2900);
      await page.keyboard.up('KeyE');
      await sleep(300);
      s = await snap();
      check('Evento: segurar E no armário reinicia a rede', s.networkUp && !s.events.includes('network_down'), `rede=${s.networkUp}`);

      // Vírus.
      await api('trigger', 'pc_virus');
      await api('teleport', 0, 2.6, 0);
      await api('sit');
      await sleep(1500);
      await shot('evento-virus-popups');
      s = await snap();
      check('Evento: vírus bloqueia o Arquivo de Casos', s.infected);
      for (let i = 0; i < 40 && (await snap()).infected; i++) {
        const btn = page.locator('.virus-pop header button').first();
        if (await btn.count()) await btn.click();
        await sleep(350);
      }
      check('Evento: fechar os pop-ups limpa o vírus', !(await snap()).infected);

      // Chamado do chefe com diálogo narrativo.
      await api('stand');
      await sleep(800);
      await api('trigger', 'boss_summon');
      await sleep(300);
      await api('teleport', 7.4, -3.6, 0);
      const opened = await waitFor(async () => (await snap()).narrative, 4000);
      check('Evento: entrar na sala do chefe abre a conversa', opened);
      await shot('evento-sala-do-chefe');
      if (opened) {
        await page.locator('.narrative .choice').first().click();
        await sleep(300);
        while ((await page.locator('.narrative .choice').count()) > 0) {
          await page.locator('.narrative .choice').first().click();
          await sleep(300);
        }
      }
      check('Evento: conversa com o chefe termina e libera o jogo', !(await snap()).narrative);

      // Queda de energia.
      await api('trigger', 'power_outage');
      await sleep(500);
      await shot('evento-queda-de-energia');
      s = await snap();
      check('Evento: queda de energia apaga a central', !s.powerUp);
      await api('teleport', -10.0, 4.4, Math.PI / 2);
      const br = await api('target', 'breaker');
      await api('lookAt', br[0], br[1], br[2]);
      await sleep(200);
      await page.keyboard.press('KeyE');
      await sleep(300);
      check('Evento: disjuntor religa a energia', (await snap()).powerUp);

      // Investigação policial e triturador.
      await api('addHeat', 62);
      await sleep(500);
      s = await snap();
      check('Risco: exposição alta inicia investigação', s.events.includes('investigation'), `exposição=${Math.round(s.heat)} eventos=${s.events}`);
      await api('teleport', 9.0, -1.2, 0);
      const sh = await api('target', 'shredder');
      await api('lookAt', sh[0], sh[1], sh[2]);
      await sleep(200);
      await shot('evento-viatura-triturador');
      const heatBefore = (await snap()).heat;
      await page.keyboard.down('KeyE');
      await sleep(3300);
      await page.keyboard.up('KeyE');
      s = await snap();
      check('Risco: triturar provas reduz a exposição', s.heat < heatBefore - 15, `${Math.round(heatBefore)} → ${Math.round(s.heat)}`);
    }

    // ------------------------------------------------------------ 8. fim do dia, loja e salvamento
    await api('pay', 2000);
    await api('endDay');
    const dayEnd = await waitFor(async () => (await page.locator('.stamp').count()) > 0, 20000);
    check('Fim do expediente: relatório aparece às 18:00', dayEnd);
    await sleep(900);
    await shot('relatorio-fim-do-dia');
    const walletBefore = (await snap()).wallet;
    const buyBtn = page.locator('.shop-item', { hasText: 'SSD Turbo' }).locator('.btn');
    await buyBtn.click();
    s = await snap();
    check('Loja: compra de melhoria desconta a comissão', s.upgrades.includes('ssd') && s.wallet < walletBefore, `${walletBefore} → ${s.wallet}`);
    await clickText('.btn', 'Ir para o dia 2');
    await sleep(500);
    const saveDay = await page.evaluate(() => JSON.parse(localStorage.getItem('central171.save.v1') || 'null')?.campaign?.day);
    check('Salvamento: progresso salvo ao avançar o dia', saveDay === 2, `dia salvo=${saveDay}`);
    await page.reload();
    await waitFor(async () => (await page.locator('.title-screen').count()) > 0, 20000);
    const cont = await page.locator('.btn', { hasText: 'Continuar (Dia 2)' }).count();
    check('Carregamento: título oferece "Continuar (Dia 2)"', cont === 1);
    await clickText('.btn', 'Continuar');
    await page.locator('.btn', { hasText: 'Começar expediente' }).waitFor({ timeout: 5000 });
    s = await snap();
    check('Carregamento: campanha retomada no dia 2 com a melhoria comprada', s.day === 2 && s.upgrades.includes('ssd'), `dia=${s.day} melhorias=${s.upgrades}`);
    await shot('briefing-dia2-carregado');

    // ------------------------------------------------------------ 9. campanha até o fim
    for (let day = 2; day <= 5; day++) {
      if (day > 2) await page.locator('.btn', { hasText: 'Começar expediente' }).waitFor({ timeout: 8000 });
      await clickText('.btn', 'Começar expediente');
      await sleep(800);
      s = await snap();
      check(`Progressão: dia ${day} começa com meta ${s.quota}`, s.mode === 'play' && s.day === day);
      if (day === 3) await shot('dia3-em-jogo');
      await api('pay', s.quota + 100);
      await api('endDay');
      await waitFor(async () => (await page.locator('.stamp').count()) > 0, 20000);
      if (day < 5) await clickText('.btn', `Ir para o dia ${day + 1}`);
      else await clickText('.btn', 'Ver o desfecho');
    }
    await sleep(1000);
    s = await snap();
    check('Campanha: final alcançado ("Sócio") ao bater todas as metas', s.ending === 'socio', `final=${s.ending}`);
    await shot('final-campanha');
    const cleared = await page.evaluate(() => localStorage.getItem('central171.save.v1'));
    check('Campanha: salvamento apagado após o final', cleared === null);
    await clickText('.btn', 'Jogar de novo');
    await sleep(600);
    check('Reinício: volta à tela de título', (await page.locator('.title-screen').count()) === 1);

    // ------------------------------------------------------------ 10. derrota por batida policial
    await clickText('.btn', 'Iniciar campanha');
    await clickText('.btn', 'Começar expediente');
    await sleep(800);
    await api('skipTutorial');
    await api('addHeat', 100);
    const raided = await waitFor(async () => (await page.locator('.stamp').count()) > 0, 12000);
    const stamp = raided ? await page.locator('.stamp').textContent() : '';
    check('Derrota: exposição 100% causa batida policial e encerra o dia', raided && /BATIDA/.test(stamp), stamp);
    await sleep(900);
    await shot('batida-policial');

    // ------------------------------------------------------------ 11. resolução 1920x1080 e desempenho
    await page.setViewportSize({ width: 1920, height: 1080 });
    await clickText('.btn', 'Ir para o dia 2');
    await clickText('.btn', 'Começar expediente');
    await sleep(1500);
    await api('teleport', 7.6, 6.4, Math.PI * 0.28);
    await sleep(9000);
    s = await snap();
    check('Desempenho: FPS medido em 1920×1080 (vista ampla do escritório)', s.fps > 0, `${s.fps} FPS, escala de resolução ${s.renderScale.toFixed(2)}, ${s.drawCalls} draw calls (${s.renderer})`);
    await shot('jogo-1920x1080');
    await api('teleport', 0, 2.6, 0);
    await api('sit');
    await sleep(1600);
    await shot('desktop-1920x1080');
  } catch (err) {
    check('Execução sem exceções no roteiro de testes', false, err?.stack ?? String(err));
    try {
      await shot('erro');
    } catch {
      /* ignora */
    }
  } finally {
    const relevantErrors = consoleErrors.filter((e) => !/favicon/i.test(e));
    check('Console: nenhum erro de JavaScript', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' | '));
    check('Rede: nenhuma requisição essencial falhou', failedRequests.length === 0, failedRequests.slice(0, 5).join(' | '));
    await browser.close();
    proc?.kill();
    const passed = results.filter((r) => r.ok).length;
    const md = [
      '# Relatório E2E — CENTRAL 171',
      '',
      `Data: ${new Date().toISOString()}`,
      `Alvo: ${DEV ? 'servidor de desenvolvimento' : 'build de produção (vite preview)'} · Chrome (Playwright) · viewport 1280×720 e 1920×1080`,
      '',
      `**${passed}/${results.length} verificações passaram.**`,
      '',
      '| # | Verificação | Resultado | Detalhe |',
      '|---|---|---|---|',
      ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 200)} |`),
      '',
      'Capturas de tela: arquivos `NN-*.png` nesta pasta.',
    ].join('\n');
    writeFileSync(join(OUT, 'report.md'), md);
    writeFileSync(join(OUT, 'report.json'), JSON.stringify({ results, consoleErrors, failedRequests }, null, 2));
    rmSync(join(OUT, 'partial.json'), { force: true });
    log(`${passed}/${results.length} verificações passaram. Relatório: ${join(OUT, 'report.md')}`);
    process.exit(passed === results.length ? 0 : 1);
  }
}

main();
