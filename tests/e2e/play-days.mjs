/**
 * Playtest automatizado em tempo real: um "jogador competente" joga expedientes
 * inteiros pela interface (atende, consulta fichas, responde, cobra e resolve
 * eventos). O robô usa os números internos da conversa para decidir, como
 * aproximação de um jogador atento que lê as reações. Deslocamentos até pontos
 * do mapa usam teletransporte de teste; a interação em si (E, cliques) é real.
 *
 * Uso: node tests/e2e/play-days.mjs [dias=2]   (servidor em URL ou dev em 5198)
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DAYS = Number(process.argv[2] ?? 2);
const OUT = join('production', 'qa', 'evidence', 'playtest');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[playtest]', ...a);

async function main() {
  let proc = null;
  let url = process.env.URL;
  if (!url) {
    // Build de produção (sem recarga automática) servida por `vite preview`.
    proc = spawn(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '5198', '--strictPort'], { stdio: 'ignore' });
    url = 'http://localhost:5198/';
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(url)).ok) break;
      } catch {
        /* subindo */
      }
      await sleep(300);
    }
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const snap = () => page.evaluate(() => window.__c171.snapshot());
  const api = (fn, ...args) => page.evaluate(([f, a]) => window.__c171[f](...a), [fn, args]);
  const days = [];
  let shots = 0;
  const shot = (name) => page.screenshot({ path: join(OUT, `${String(++shots).padStart(2, '0')}-${name}.png`) });

  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.title-screen').waitFor({ timeout: 30000 });
  await page.locator('.btn', { hasText: 'Iniciar campanha' }).click();

  for (let d = 1; d <= DAYS; d++) {
    await page.locator('.btn', { hasText: 'Começar expediente' }).waitFor({ timeout: 15000 });
    await page.locator('.btn', { hasText: 'Começar expediente' }).click();
    await sleep(800);
    const seen = new Set();
    const started = Date.now();
    let lastShot = 0;
    let calls = 0;
    await api('teleport', 0, 2.6, 0);
    await api('sit');
    await sleep(1200);
    await page.locator('.dt-icon[data-app="msg"]').click();
    while (true) {
      const s = await snap();
      if (s.mode !== 'play') break;
      for (const e of s.events) seen.add(e);
      if (Date.now() - lastShot > 90000) {
        lastShot = Date.now();
        await shot(`dia${d}-${s.clockText.replace(':', 'h')}`);
      }
      // Diálogo narrativo aberto: escolhe a primeira opção.
      if (s.narrative) {
        const c = page.locator('.narrative .choice').first();
        if (await c.count()) await c.click().catch(() => {});
        await sleep(500);
        continue;
      }
      // Eventos que exigem sair da mesa.
      const ev = s.events;
      const go = async (x, z, target, holdMs) => {
        if (s.callPhase === 'active') return false;
        await api('stand');
        await sleep(700);
        await api('teleport', x, z, 0);
        const t = await api('target', target);
        await api('lookAt', t[0], t[1], t[2]);
        await sleep(150);
        if (holdMs) {
          await page.keyboard.down('KeyE');
          await sleep(holdMs);
          await page.keyboard.up('KeyE');
        } else await page.keyboard.press('KeyE');
        await sleep(300);
        await api('teleport', 0, 2.6, 0);
        await api('sit');
        await sleep(1000);
        return true;
      };
      if (ev.includes('network_down') && (await go(-9.3, 6.4, 'rack', 2800))) continue;
      if (ev.includes('power_outage') && (await go(-10.0, 4.4, 'breaker', 0))) continue;
      if (ev.includes('investigation') && (await go(9.0, -1.2, 'shredder', 3300))) continue;
      if (ev.includes('boss_summon') && s.callPhase !== 'active') {
        await api('stand');
        await sleep(700);
        await api('teleport', 7.4, -3.6, 0);
        await sleep(1500);
        continue;
      }
      for (const npc of ['tonhao', 'juninho']) {
        const evId = npc === 'tonhao' ? 'coworker_help' : 'juninho_help';
        if (ev.includes(evId) && s.callPhase !== 'active' && s.objective?.includes('Fale com')) {
          const head = await page.evaluate((n) => window.__c171.game.npcs.agents[n].headPosition.toArray(), npc);
          await api('stand');
          await sleep(700);
          await api('teleport', head[0] + 0.9, head[2] + 0.9, 0);
          await api('lookAt', head[0], head[1] - 0.3, head[2]);
          await sleep(200);
          await page.keyboard.press('KeyE');
          await sleep(800);
        }
      }
      if (!s.seated && !s.narrative && s.playerMode === 'walk') {
        await api('teleport', 0, 2.6, 0);
        await api('sit');
        await sleep(1000);
        continue;
      }
      // Computador travado / vírus.
      if (s.crashed && s.powerUp) {
        const b = page.locator('.bsod .btn');
        if (await b.count()) await b.click().catch(() => {});
      }
      if (s.infected) {
        const x = page.locator('.virus-pop header button').first();
        if (await x.count()) await x.click().catch(() => {});
      }
      // Lead quente: disca pelo PABX.
      const lead = await page.evaluate(() => window.__c171.game.calls.leadProfiles()[0]?.number ?? null);
      if (lead && s.callPhase === 'idle') {
        await page.locator('.dt-icon[data-app="pabx"]').click();
        await page.locator('.win[data-win="pabx"] input.input').fill(lead);
        await page.locator('.win[data-win="pabx"] .btn', { hasText: 'Ligar' }).click();
        await sleep(600);
        continue;
      }
      if (s.callPhase === 'ringing') {
        await page.keyboard.press('KeyE');
        calls++;
        await sleep(700);
        // Consulta a ficha (pode não existir para número privado).
        const arq = page.locator('.dt-icon[data-app="arquivo"]');
        if (!s.infected && (await page.locator('.call .who').count())) {
          await arq.click();
          const back = page.locator('.win[data-win="arquivo"] .btn', { hasText: 'Voltar' });
          if (await back.count()) await back.click();
          await page.locator('.win[data-win="arquivo"] .btn', { hasText: 'Linha atual' }).click().catch(() => {});
          await sleep(150);
          await page.locator('.win[data-win="arquivo"] .list-item').first().click().catch(() => {});
        }
        continue;
      }
      if (s.callPhase === 'active') {
        const choice = await page.evaluate(() => {
          const g = window.__c171.game;
          const conv = g.calls.conversation;
          if (!conv) return null;
          const btns = [...document.querySelectorAll('.call .choice')];
          if (!btns.length) return null;
          const choices = conv.currentChoices();
          const f = conv.profile.facts;
          const facts = [f.petName, f.city, f.bank, f.relativeName];
          let pick = choices.findIndex((c) => c.kind === 'unmask' || c.kind === 'recognize');
          if (pick < 0) pick = choices.findIndex((c) => c.kind === 'answer' && facts.some((v) => c.text.includes(`"${v}"`)));
          if (pick < 0 && conv.phase === 'payment') {
            let best = 0;
            choices.forEach((c, i) => {
              if (c.kind === 'ask' && conv.paymentScore(c.amount / conv.profile.wealth) >= 32) best = i;
            });
            pick = best;
          }
          if (pick < 0 && g.calls.traceActive && g.calls.traceProgress > 0.7) return 'hangup';
          if (pick < 0 && conv.suspicion > 60) pick = choices.findIndex((c) => c.kind === 'calm');
          if (pick < 0) pick = choices.findIndex((c) => c.kind === 'facts' && conv.archetype.prefs.facts >= 1.2);
          if (pick < 0) {
            let best = -1;
            let bestV = -9;
            choices.forEach((c, i) => {
              if (c.kind !== 'stage' || c.approach === conv.lastApproach) return;
              const v = conv.archetype.prefs[c.approach];
              if (v > bestV) {
                bestV = v;
                best = i;
              }
            });
            pick = best >= 0 ? best : 0;
          }
          return pick;
        });
        if (choice === 'hangup') await page.locator('.call .btn.danger').click().catch(() => {});
        else if (choice !== null) await page.locator('.call .choice').nth(choice).click().catch(() => {});
        await sleep(600);
        continue;
      }
      await sleep(400);
    }
    // Fim do dia.
    await page.locator('.stamp').waitFor({ timeout: 30000 });
    await sleep(800);
    const end = await snap();
    const stamp = await page.locator('.stamp').textContent();
    const hist = await page.evaluate(() => window.__c171.game.state.campaign.history.at(-1));
    days.push({ day: d, realSeconds: Math.round((Date.now() - started) / 1000), stamp, ...hist, events: [...seen], callsAnswered: calls });
    log(`dia ${d}: ${stamp} — arrecadado ${hist.collected} / meta ${hist.quota}, ligações ${hist.calls}, sucessos ${hist.successes}, eventos: ${[...seen].join(', ')}`);
    await shot(`dia${d}-relatorio`);
    const next = page.locator('.btn', { hasText: /Ir para o dia|Ver o desfecho/ });
    if (d < DAYS && (await next.count())) await next.click();
  }
  writeFileSync(join(OUT, 'playtest.json'), JSON.stringify({ days, errors }, null, 2));
  const md = [
    '# Playtest automatizado em tempo real',
    '',
    `Data: ${new Date().toISOString()}`,
    '',
    'Um robô jogou os expedientes em tempo real pela interface. Ele decide usando os números internos da conversa (aproximação de um jogador atento). Deslocamentos até os pontos de evento usam teletransporte de teste.',
    '',
    '| Dia | Resultado | Arrecadado | Meta | Ligações | Sucessos | Denúncias | Rastreios | Eventos vistos | Tempo real |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...days.map((d) => `| ${d.day} | ${d.stamp} | ${d.collected} | ${d.quota} | ${d.calls} | ${d.successes} | ${d.reports} | ${d.traces} | ${d.events.join(', ') || '—'} | ${d.realSeconds} s |`),
    '',
    `Erros de JavaScript durante o playtest: ${errors.length ? errors.join(' / ') : 'nenhum'}`,
  ].join('\n');
  writeFileSync(join(OUT, 'playtest.md'), md);
  await browser.close();
  proc?.kill();
  log('relatório em', join(OUT, 'playtest.md'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
