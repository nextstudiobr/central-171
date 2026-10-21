import { BALANCE } from '../data/balance';
import { RANKS, UPGRADES } from '../data/days';
import type { NarrativeScript } from '../data/npcs';
import { SCHEMES } from '../data/schemes';
import type { DayDef } from '../data/types';
import { money } from '../core/util';
import type { DayResult } from '../systems/Campaign';
import type { CampaignState, Ending } from '../systems/GameState';
import type { SettingsStore } from '../systems/Settings';
import { clear, h } from './dom';
import { drawNpcPortrait } from './Portrait';
import { settingsForm } from './SettingsForm';

const ENDINGS: Record<Ending, { title: string; tone: string; story: string[] }> = {
  socio: {
    title: 'Sócio da Firma',
    tone: '#ffd35a',
    story: [
      'Sexta-feira, 18h. O "Conselho" chega para ver os números. O Conselho é o próprio Gervásio, de terno diferente.',
      'Ele te entrega um crachá dourado escrito SÓCIO e um abraço que dura tempo demais. Tonhão aplaude. Juninho filma. A Pri revira os olhos.',
      'Na segunda-feira, a primeira mensagem na sua caixa é da Inspetora Moura: "Parabéns pela promoção. Agora o nome no contrato social é o seu."',
      'Você venceu. Mais ou menos.',
    ],
  },
  demitido: {
    title: 'Demitido',
    tone: '#ff8a8a',
    story: [
      'Seu crachá é cortado ao meio com a tesoura do bufê da mãe do Gervásio. Tonhão chora alto. Juninho herda sua cadeira laranja.',
      'Você sai pela porta da frente com uma caixa de papelão, a caneca e a dignidade que sobrou.',
      'Na semana seguinte, seu celular vibra: "PARABÉNS! Você ganhou um JET-SKI na Loteria Netuno!" Você ri. Depois fica em silêncio.',
    ],
  },
  preso: {
    title: 'Operação Tostão',
    tone: '#7fb2ff',
    story: [
      'As luzes azuis tomam o andar inteiro. Gervásio tenta se esconder dentro do cofre. Não cabe.',
      'No depoimento, você descobre que a "Disk Fortuna Soluções" estava registrada no seu nome desde o primeiro dia. Estava na letra miúda do crachá.',
      'A Inspetora Moura fecha o relatório com um sorriso cansado. As vovós de Uberaba recebem os tostões de volta.',
    ],
  },
  delator: {
    title: 'Testemunha',
    tone: '#8ff0b9',
    story: [
      'Às 18h, o gravador no seu bolso registra Gervásio contando o dinheiro e cantarolando a própria música de espera.',
      'A Inspetora Moura entra com a equipe. Você sai pela porta da frente, como testemunha, enquanto o chefe grita que "foi tudo ideia do Juninho".',
      'A central fecha. As vítimas fictícias recebem os tostões de volta, corrigidos. Você arranja um emprego de verdade: atendente de suporte de geladeira.',
    ],
  },
};

/** Telas cheias: título, carregamento, pausa, briefing, relatório, finais e créditos. */
export class Menus {
  private layer: HTMLElement;
  private narrativeEl: HTMLElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly settings: SettingsStore,
    private readonly ttsAvailable: () => boolean,
    private readonly sfx: (id: string) => void,
  ) {
    this.layer = h('div', { class: 'interactive', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    parent.appendChild(this.layer);
  }

  private solidNext = false;

  private screen(cls: string, ...children: Array<Node | null>): HTMLElement {
    this.close();
    const solid = this.solidNext ? ' solid' : '';
    this.solidNext = false;
    const el = h('div', { class: `screen ${cls}${solid}`, style: { pointerEvents: 'auto' } }, ...children);
    this.layer.appendChild(el);
    return el;
  }

  close(): void {
    this.layer.querySelectorAll('.screen').forEach((s) => s.remove());
  }

  get open(): boolean {
    return !!this.layer.querySelector('.screen');
  }

  private btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    return h(
      'button',
      {
        class: `btn ${cls}`,
        onclick: () => {
          this.sfx('click');
          onClick();
        },
      },
      label,
    );
  }

  loading(progress: number, label: string): void {
    let el = this.layer.querySelector('.loading') as HTMLElement | null;
    if (!el) {
      el = this.screen('loading', h('div', { class: 'logo-sign', style: { textAlign: 'center' } }, h('span', { class: 'b', style: { fontSize: '96px' } }, '171')), h('div', { class: 'bar' }, h('i')), h('p'));
    }
    (el.querySelector('.bar > i') as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
    (el.querySelector('p') as HTMLElement).textContent = label;
  }

  title(opts: { hasSave: boolean; saveDay?: number; onNew: () => void; onContinue: () => void; onSettings: () => void; onCredits: () => void }): void {
    this.screen(
      'title-screen',
      h(
        'div',
        { class: 'title-wrap' },
        h('div', { class: 'logo-sign' }, h('span', { class: 'a' }, 'CENTRAL'), h('span', { class: 'b' }, '171')),
        h('p', { class: 'tagline', html: 'Você acabou de ser contratado pela <b>Disk Fortuna Soluções</b>. Atenda o telefone, venda sonhos impossíveis, bata a meta do chefe e tente não ser demitido, preso ou pior: promovido.' }),
        h(
          'div',
          { class: 'menu' },
          opts.hasSave ? this.btn(`▶  Continuar (Dia ${opts.saveDay})`, opts.onContinue, 'primary') : null,
          this.btn(opts.hasSave ? '✚  Nova campanha' : '▶  Iniciar campanha', opts.onNew, opts.hasSave ? '' : 'primary'),
          this.btn('⚙  Configurações', opts.onSettings),
          this.btn('★  Créditos', opts.onCredits),
        ),
        h(
          'p',
          { class: 'disclaimer' },
          'Obra de ficção e comédia. Todos os golpes, pessoas, bancos e moedas são inventados e absurdos. Na vida real, golpe é crime e machuca gente de verdade: se alguém te ligar oferecendo jet-ski, desligue.',
        ),
      ),
    );
  }

  pause(opts: { onResume: () => void; onSettings: () => void; onQuit: () => void; day: number }): void {
    this.screen(
      '',
      h(
        'div',
        { class: 'panel', style: { width: 'min(460px, 100%)' } },
        h('h2', {}, 'Pausa'),
        h('p', { class: 'sub' }, `Dia ${this.dayLabel(opts.day)}. O relógio do expediente está parado.`),
        h(
          'div',
          { class: 'menu', style: { width: '100%' } },
          this.btn('▶  Continuar', opts.onResume, 'primary'),
          this.btn('⚙  Configurações', opts.onSettings),
          this.btn('⏏  Sair para o menu (o progresso do dia é perdido)', opts.onQuit, 'danger'),
        ),
        h('p', { class: 'sub', style: { marginTop: '18px', fontSize: '13px' } }, 'Controles: WASD andar · Mouse olhar · E interagir · Q levantar da mesa · 1–6 escolher resposta · Esc pausa.'),
      ),
    );
  }

  private dayLabel(day: number): string {
    return String(day);
  }

  settingsScreen(onBack: () => void): void {
    this.screen(
      '',
      h('div', { class: 'panel' }, h('h2', {}, 'Configurações'), h('p', { class: 'sub' }, 'Ajustes salvos automaticamente neste navegador.'), settingsForm(this.settings, this.ttsAvailable()), h('div', { class: 'row' }, this.btn('← Voltar', onBack, 'primary'))),
    );
  }

  credits(onBack: () => void): void {
    this.screen(
      '',
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Créditos'),
        h(
          'div',
          { class: 'credits-list' },
          h('h4', {}, 'Jogo'),
          h('div', {}, 'CENTRAL 171 — projeto original desenvolvido com o Claude Code Game Studios.'),
          h('div', {}, 'Direção, design, programação, roteiro, áudio procedural e arte procedural: equipe do estúdio (Claude).'),
          h('h4', {}, 'Inspiração de gameplay'),
          h('div', {}, '"Scam With Your Friends" (JakeHub & Metater) serviu de referência para o tipo de experiência. Nenhum arquivo, personagem, texto ou arte do jogo original foi usado.'),
          h('h4', {}, 'Assets de terceiros (licença CC0)'),
          h('div', {}, 'Móveis 3D: Furniture Kit 2.0 — Kenney (kenney.nl).'),
          h('div', {}, 'HDRI "Unfinished Office Night" — Sergej Majboroda (Poly Haven).'),
          h('div', {}, 'Texturas "Dirty Carpet" (Rohit Seervi), "Ceiling Interior" (Dimitrios Savva), "Painted Plaster Wall" (Amal Kumar) — Poly Haven.'),
          h('h4', {}, 'Tecnologia'),
          h('div', {}, 'Three.js, TypeScript, Vite. Sons e vozes gerados em tempo real com Web Audio e a síntese de voz local do navegador.'),
          h('p', { style: { color: 'var(--ink-faint)', fontSize: '13px', marginTop: '16px' } }, 'Detalhes completos em ASSET_CREDITS.md.'),
        ),
        h('div', { class: 'row' }, this.btn('← Voltar', onBack, 'primary')),
      ),
    );
  }

  dayIntro(def: DayDef, c: CampaignState, onStart: () => void): void {
    const newSchemes = SCHEMES.filter((s) => s.unlockDay === def.day);
    this.solidNext = true;
    const tips: Record<number, string> = {
      1: 'Sente na sua mesa (E), abra as Mensagens e atenda o telefone. Durante a ligação, consulte a ficha da pessoa no Arquivo de Casos.',
      2: 'Agora as pessoas fazem perguntas de verificação. A resposta certa está na ficha. Errar levanta muita suspeita.',
      3: 'Ouviu um clique na linha? É rastreio. Desligue antes da barra vermelha encher. Confira a Lista Quente antes de cobrar.',
      4: 'Exposição alta traz viaturas. Use o triturador e o Modo Discreto para baixar a pressão.',
      5: 'Último dia. Tudo pode acontecer. Inclusive uma proposta.',
    };
    this.screen(
      '',
      h(
        'div',
        { class: 'panel', style: { width: 'min(900px, 100%)' } },
        h('h2', {}, `Dia ${def.day} — ${def.weekday}`),
        h('p', { class: 'sub' }, def.title),
        h(
          'div',
          { class: 'brief' },
          h('div', { class: 'memo' }, h('p', { style: { fontWeight: '700' } }, 'MEMORANDO — Seu Gervásio'), ...def.bossBriefing.map((l) => h('p', {}, l.replace('{meta}', money(def.quota))))),
          h(
            'div',
            { class: 'facts' },
            h('div', { class: 'stat' }, h('small', {}, 'Meta do dia'), h('div', { class: 'big-num' }, money(def.quota))),
            h('div', { class: 'stat' }, h('small', {}, 'Cargo'), h('b', { style: { fontSize: '17px' } }, RANKS[c.rankIndex])),
            h('div', { class: 'stat' }, h('small', {}, 'Advertências'), h('b', { class: c.strikes ? 'neg' : '' }, `${c.strikes} de ${BALANCE.campaign.maxStrikes}`)),
            h('div', { class: 'stat' }, h('small', {}, 'Exposição herdada'), h('b', {}, `${Math.round(c.heat)}%`)),
            newSchemes.length ? h('div', { class: 'stat' }, h('small', {}, 'Nova isca liberada'), h('b', { style: { fontSize: '16px' } }, newSchemes.map((s) => s.name).join(', '))) : null,
          ),
        ),
        h('p', { style: { marginTop: '18px', color: 'var(--ink-dim)' } }, `💡 ${tips[def.day] ?? ''}`),
        h('div', { class: 'row' }, this.btn('Começar expediente  ▶', onStart, 'primary')),
      ),
    );
  }

  dayEnd(r: DayResult, c: CampaignState, opts: { onBuy: (id: string) => boolean; onNext: () => void; ending: boolean }): void {
    const s = r.stats;
    const stampCls = s.result === 'excellent' ? 'excellent' : s.result === 'met' ? 'good' : 'bad';
    const stampTx = s.result === 'excellent' ? 'EXCELENTE' : s.result === 'met' ? 'META BATIDA' : s.result === 'raided' ? 'BATIDA POLICIAL' : 'ADVERTÊNCIA';
    const shop = h('div', { class: 'shop' });
    const walletEl = h('b', { class: 'pos' }, money(c.wallet));
    const renderShop = () => {
      clear(shop);
      walletEl.textContent = money(c.wallet);
      for (const u of UPGRADES) {
        const owned = c.upgrades.includes(u.id);
        shop.append(
          h(
            'div',
            { class: `shop-item${owned ? ' owned' : ''}` },
            h('div', { class: 't' }, h('span', {}, `${u.icon} ${u.name}`), h('span', { class: 'pill' }, money(u.cost))),
            h('p', {}, u.description),
            this.btn(owned ? '✓ Comprado' : 'Comprar', () => {
              if (opts.onBuy(u.id)) renderShop();
            }, owned ? 'good' : 'primary'),
          ),
        );
        const b = shop.lastElementChild!.querySelector('button') as HTMLButtonElement;
        b.disabled = owned || c.wallet < u.cost;
      }
    };
    renderShop();
    this.solidNext = true;
    this.screen(
      '',
      h(
        'div',
        { class: 'panel', style: { width: 'min(980px, 100%)' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('div', {}, h('h2', {}, `Fim do expediente — Dia ${s.day}`), h('p', { class: 'sub' }, 'Relatório de desempenho da Disk Fortuna')), h('div', { class: `stamp ${stampCls}` }, stampTx)),
        h(
          'div',
          { class: 'report' },
          h(
            'div',
            {},
            h(
              'div',
              { class: 'stat-grid' },
              h('div', { class: 'stat' }, h('small', {}, 'Arrecadado'), h('b', { class: s.collected >= s.quota ? 'pos' : 'neg' }, money(s.collected))),
              h('div', { class: 'stat' }, h('small', {}, 'Meta'), h('b', {}, money(s.quota))),
              h('div', { class: 'stat' }, h('small', {}, 'Bônus'), h('b', { class: 'pos' }, money(r.bonus))),
              h('div', { class: 'stat' }, h('small', {}, 'Ligações'), h('b', {}, String(s.calls))),
              h('div', { class: 'stat' }, h('small', {}, 'Sucessos'), h('b', { class: 'pos' }, String(s.successes))),
              h('div', { class: 'stat' }, h('small', {}, 'Perdidas'), h('b', {}, String(s.missed))),
              h('div', { class: 'stat' }, h('small', {}, 'Denúncias'), h('b', { class: s.reports ? 'neg' : '' }, String(s.reports))),
              h('div', { class: 'stat' }, h('small', {}, 'Rastreios'), h('b', { class: s.traces ? 'neg' : '' }, String(s.traces))),
              h('div', { class: 'stat' }, h('small', {}, 'Multas'), h('b', { class: s.fines ? 'neg' : '' }, money(s.fines))),
            ),
            h('div', { class: 'memo', style: { marginTop: '14px', background: '#f3efe4', color: '#2a2620', padding: '14px 16px', borderRadius: '6px', fontFamily: "'Segoe Print', 'Comic Sans MS', cursive" } }, `"${r.bossLine}" — Seu Gervásio`),
            h('p', { style: { color: 'var(--ink-dim)' } }, r.rankUp ? `⬆ Promoção: agora você é ${r.rank}.` : `Cargo: ${r.rank}.`, r.strikeAdded ? ` ⚠ Advertências: ${c.strikes} de ${BALANCE.campaign.maxStrikes}.` : ''),
          ),
          h('div', {}, h('h3', { style: { margin: '0 0 6px' } }, '🛒 Almoxarifado'), h('p', { style: { margin: '0 0 10px', color: 'var(--ink-dim)' } }, 'Comissão disponível: ', walletEl), shop),
        ),
        h('div', { class: 'row' }, this.btn(opts.ending ? 'Ver o desfecho  ▶' : `Ir para o dia ${s.day + 1}  ▶`, opts.onNext, 'primary')),
      ),
    );
  }

  ending(ending: Ending, c: CampaignState, onRestart: () => void, onCredits: () => void): void {
    const e = ENDINGS[ending];
    this.solidNext = true;
    const total = c.history.reduce(
      (acc, d) => ({ calls: acc.calls + d.calls, ok: acc.ok + d.successes, rep: acc.rep + d.reports, tr: acc.tr + d.traces }),
      { calls: 0, ok: 0, rep: 0, tr: 0 },
    );
    this.screen(
      '',
      h(
        'div',
        { class: 'panel ending' },
        h('p', { class: 'sub', style: { letterSpacing: '3px', textTransform: 'uppercase' } }, 'Final'),
        h('h1', { style: { color: e.tone } }, e.title),
        h('div', { class: 'story' }, ...e.story.map((p) => h('p', {}, p))),
        h(
          'div',
          { class: 'stat-grid', style: { marginTop: '18px' } },
          h('div', { class: 'stat' }, h('small', {}, 'Dias trabalhados'), h('b', {}, String(c.history.length))),
          h('div', { class: 'stat' }, h('small', {}, 'Total arrecadado'), h('b', {}, money(c.totalCollected))),
          h('div', { class: 'stat' }, h('small', {}, 'Comissão final'), h('b', {}, money(c.wallet))),
          h('div', { class: 'stat' }, h('small', {}, 'Ligações'), h('b', {}, String(total.calls))),
          h('div', { class: 'stat' }, h('small', {}, 'Golpes concluídos'), h('b', {}, String(total.ok))),
          h('div', { class: 'stat' }, h('small', {}, 'Denúncias + rastreios'), h('b', {}, String(total.rep + total.tr))),
        ),
        h('div', { class: 'row' }, this.btn('↺  Jogar de novo', onRestart, 'primary'), this.btn('★  Créditos', onCredits)),
      ),
    );
  }

  confirm(text: string, yes: () => void, no: () => void): void {
    this.screen('', h('div', { class: 'panel', style: { width: 'min(480px, 100%)' } }, h('p', { style: { fontSize: '17px' } }, text), h('div', { class: 'row' }, this.btn('Sim', yes, 'primary'), this.btn('Não', no))));
  }

  // ------------------------------------------------------------ diálogos narrativos

  get narrativeOpen(): boolean {
    return this.narrativeEl !== null;
  }

  narrative(script: NarrativeScript, speak: (text: string, who: string) => void, onEffect: (e: string) => void, onClose: () => void): void {
    this.narrativeEl?.remove();
    const canvas = h('canvas');
    drawNpcPortrait(canvas, script.portrait);
    const sp = h('div', { class: 'sp' });
    const tx = h('div', { class: 'tx' });
    const opts = h('div', { class: 'opts' });
    const el = h('div', { class: 'narrative', style: { pointerEvents: 'auto' } }, canvas, h('div', {}, sp, tx, opts));
    this.layer.appendChild(el);
    this.narrativeEl = el;
    const show = (id: string) => {
      const node = script.nodes[id];
      if (!node) {
        el.remove();
        this.narrativeEl = null;
        onClose();
        return;
      }
      sp.textContent = node.speaker;
      tx.textContent = node.text;
      speak(node.text, script.portrait);
      clear(opts);
      node.choices.forEach((c, i) => {
        opts.append(
          h(
            'button',
            {
              class: 'choice',
              'data-choice': String(i),
              onclick: () => {
                this.sfx('click');
                for (const e of c.effects ?? []) onEffect(e);
                if (c.next) show(c.next);
                else {
                  el.remove();
                  this.narrativeEl = null;
                  onClose();
                }
              },
            },
            h('span', { class: 'num' }, String(i + 1)),
            h('span', {}, c.text),
          ),
        );
      });
    };
    show(script.start);
  }

  /** Escolha numérica no diálogo narrativo. */
  narrativeChoose(i: number): void {
    const btn = this.narrativeEl?.querySelector(`[data-choice="${i}"]`) as HTMLButtonElement | null;
    btn?.click();
  }
}
