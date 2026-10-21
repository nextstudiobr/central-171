import { archetypeById } from '../data/archetypes';
import { UPGRADES, RANKS, dayDef } from '../data/days';
import { SCHEMES, schemeById } from '../data/schemes';
import type { CallerProfile } from '../data/types';
import { APPROACH_LABEL } from '../data/types';
import type { Bus } from '../core/events';
import { clockText, money } from '../core/util';
import { BALANCE } from '../data/balance';
import type { CallSystem } from '../systems/CallSystem';
import { computeStats } from '../systems/Campaign';
import type { ChoiceView, Turn } from '../systems/Dialogue';
import { OUTCOME_LABEL, type GameState } from '../systems/GameState';
import type { Inbox } from '../systems/Inbox';
import { HEAT_LEVEL_LABEL, levelOf } from '../systems/Risk';
import type { SettingsStore } from '../systems/Settings';
import { clear, h } from './dom';
import { drawPortrait } from './Portrait';
import { settingsForm } from './SettingsForm';

/** Ações que o desktop pode pedir ao jogo (a interface não altera o estado sozinha). */
export interface DesktopCommands {
  answer(): void;
  choose(id: string): void;
  hangUp(): void;
  dial(number: string): { ok: boolean; message: string };
  search(query: string): CallerProfile[];
  fileOpened(id: string): void;
  setBaits(ids: string[]): void;
  lowProfile(): string;
  inboxAction(messageId: number, actionId: string): void;
  buy(id: string): boolean;
  cleanVirus(): void;
  reboot(): void;
  standUp(): void;
  speak(text: string, profile: CallerProfile | null): number;
  sfx(id: string): void;
}

export interface DesktopDeps {
  state: GameState;
  calls: CallSystem;
  inbox: Inbox;
  settings: SettingsStore;
  bus: Bus;
  commands: DesktopCommands;
  ttsAvailable: () => boolean;
}

type AppId = 'painel' | 'pabx' | 'arquivo' | 'lista' | 'msg' | 'desempenho' | 'loja' | 'antivirus' | 'config';

const APPS: Array<{ id: AppId; name: string; icon: string; w: number; h: number }> = [
  { id: 'painel', name: 'Painel', icon: '📊', w: 560, h: 560 },
  { id: 'pabx', name: 'PABX', icon: '☎️', w: 500, h: 600 },
  { id: 'arquivo', name: 'Arquivo de Casos', icon: '🗂️', w: 620, h: 600 },
  { id: 'lista', name: 'Lista Quente', icon: '🔥', w: 480, h: 420 },
  { id: 'msg', name: 'Mensagens', icon: '💬', w: 600, h: 520 },
  { id: 'desempenho', name: 'Desempenho', icon: '🏆', w: 600, h: 560 },
  { id: 'loja', name: 'Almoxarifado', icon: '🛒', w: 600, h: 560 },
  { id: 'antivirus', name: 'Antivírus', icon: '🛡️', w: 440, h: 320 },
  { id: 'config', name: 'Configurações', icon: '⚙️', w: 560, h: 600 },
];

interface Win {
  id: AppId;
  el: HTMLElement;
  body: HTMLElement;
  render: () => void;
}

const MOODS: Array<[number, string, string]> = [
  [25, '😊', 'Animado'],
  [8, '🙂', 'Receptivo'],
  [-8, '😐', 'Neutro'],
  [-25, '🤨', 'Desconfiado'],
  [-999, '😠', 'Hostil'],
];

/** O sistema operacional fictício do computador do jogador. */
export class Desktop {
  readonly host: HTMLElement;
  private readonly root: HTMLElement;
  private readonly area: HTMLElement;
  private readonly iconsEl: HTMLElement;
  private readonly taskbar: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly overlay: HTMLElement;
  private wins = new Map<AppId, Win>();
  private z = 10;
  private call: HTMLElement | null = null;
  private callLog: HTMLElement | null = null;
  private callChoices: HTMLElement | null = null;
  private callTimer: HTMLElement | null = null;
  private callMeters: HTMLElement | null = null;
  private traceEl: HTMLElement | null = null;
  private currentTurn: Turn | null = null;
  private lineQueue: Array<{ who: 'them' | 'me' | 'sys'; text: string; cls?: string }> = [];
  private typing = false;
  private waitingBack = false;
  private lookup: { id: string; until: number; total: number } | null = null;
  private openedFile: string | null = null;
  private av: { until: number; total: number } | null = null;
  private boot: { until: number; total: number } | null = null;
  private popups: HTMLElement[] = [];
  private popupClosed = 0;
  private popupTimer = 0;
  private searchQuery = '';
  private selectedMsg: number | null = null;
  private dialValue = '';
  private dialMsg = '';
  visible = false;
  /** Avisado quando um app é aberto (o tutorial usa isso). */
  onOpenApp: (id: string) => void = () => {};

  constructor(parent: HTMLElement, private readonly d: DesktopDeps) {
    this.iconsEl = h('div', { class: 'dt-icons' });
    this.area = h('div', { class: 'dt-area' }, h('div', { class: 'dt-wallpaper' }, '171'), this.iconsEl);
    this.tray = h('div', { class: 'dt-tray' });
    this.taskbar = h(
      'div',
      { class: 'dt-taskbar' },
      h('div', { class: 'dt-start' }, '◆ FortunaOS'),
      h('div', { class: 'dt-tasks', style: { display: 'flex', gap: '6px' } }),
      this.tray,
      h('button', { class: 'dt-stand', onclick: () => d.commands.standUp(), title: 'Levantar (Q)' }, '⇧ Levantar [Q]'),
    );
    this.overlay = h('div', {});
    this.root = h('div', { class: 'desktop' }, this.area, this.taskbar, this.overlay);
    this.host = h('div', { class: 'desktop-host interactive' }, this.root);
    parent.appendChild(this.host);
    this.renderIcons();
    this.wireBus();
  }

  // ------------------------------------------------------------ visibilidade

  setRect(left: number, top: number, width: number): void {
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.transform = `scale(${width / 1280})`;
  }

  show(on: boolean): void {
    this.visible = on;
    this.host.classList.toggle('show', on);
    this.host.style.pointerEvents = on ? 'auto' : 'none';
    if (on) this.refresh();
  }

  /** Reinicia o desktop no começo de um expediente. */
  reset(): void {
    for (const w of this.wins.values()) w.el.remove();
    this.wins.clear();
    this.closeCall();
    this.clearPopups();
    this.lookup = null;
    this.openedFile = null;
    this.av = null;
    this.boot = null;
    this.selectedMsg = null;
    this.searchQuery = '';
    this.dialValue = '';
    this.dialMsg = '';
    this.open(this.d.state.day.day === 1 ? 'msg' : 'painel');
  }

  // ------------------------------------------------------------ ícones e janelas

  private renderIcons(): void {
    clear(this.iconsEl);
    for (const app of APPS) {
      const badge = app.id === 'msg' && this.d.inbox.unread > 0 ? h('span', { class: 'badge' }, String(this.d.inbox.unread)) : null;
      const locked = app.id === 'arquivo' && this.d.state.day.pcInfected;
      this.iconsEl.append(
        h(
          'button',
          {
            class: `dt-icon${locked ? ' locked' : ''}`,
            'data-app': app.id,
            onclick: () => {
              this.d.commands.sfx('click');
              this.open(app.id);
            },
          },
          h('div', { class: 'gl' }, app.icon),
          app.name,
          badge,
        ),
      );
    }
  }

  open(id: AppId): void {
    this.onOpenApp(id);
    const existing = this.wins.get(id);
    if (existing) {
      this.focus(existing);
      existing.render();
      return;
    }
    const app = APPS.find((a) => a.id === id)!;
    const body = h('div', { class: 'win-body' });
    const title = h('div', { class: 'win-title' }, h('span', {}, `${app.icon} ${app.name}`), h('button', { class: 'x', onclick: () => this.closeWin(id) }, '×'));
    const el = h('div', { class: 'win', 'data-win': id }, title, body);
    const n = this.wins.size;
    const areaW = this.root.classList.contains('calling') ? 850 : 1280;
    el.style.width = `${app.w}px`;
    el.style.height = `${app.h}px`;
    el.style.left = `${Math.min(areaW - app.w - 10, 210 + n * 34)}px`;
    el.style.top = `${Math.min(784 - 46 - app.h - 10, 14 + n * 30)}px`;
    el.addEventListener('mousedown', () => this.focus(win));
    this.makeDraggable(el, title);
    const win: Win = { id, el, body, render: () => this.renderApp(win) };
    this.wins.set(id, win);
    this.area.append(el);
    this.focus(win);
    win.render();
    this.renderTasks();
  }

  private closeWin(id: AppId): void {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.remove();
    this.wins.delete(id);
    this.renderTasks();
  }

  private focus(w: Win): void {
    for (const o of this.wins.values()) o.el.classList.remove('focus');
    w.el.classList.add('focus');
    w.el.style.zIndex = String(++this.z);
    this.renderTasks();
  }

  private makeDraggable(el: HTMLElement, handle: HTMLElement): void {
    handle.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('x')) return;
      const scale = this.host.getBoundingClientRect().width / 1280;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = el.offsetLeft;
      const oy = el.offsetTop;
      const move = (ev: MouseEvent) => {
        el.style.left = `${Math.max(-200, Math.min(1180, ox + (ev.clientX - sx) / scale))}px`;
        el.style.top = `${Math.max(0, Math.min(700, oy + (ev.clientY - sy) / scale))}px`;
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  private renderTasks(): void {
    const tasks = this.taskbar.querySelector('.dt-tasks') as HTMLElement;
    clear(tasks);
    for (const w of this.wins.values()) {
      const app = APPS.find((a) => a.id === w.id)!;
      tasks.append(h('button', { class: `dt-task${w.el.classList.contains('focus') ? ' active' : ''}`, onclick: () => this.focus(w) }, `${app.icon} ${app.name}`));
    }
  }

  /** Atualiza tudo que depende do estado. */
  refresh(): void {
    this.renderIcons();
    for (const w of this.wins.values()) w.render();
    this.renderOverlay();
  }

  // ------------------------------------------------------------ apps

  private renderApp(w: Win): void {
    const b = w.body;
    clear(b);
    switch (w.id) {
      case 'painel':
        return this.appPainel(b);
      case 'pabx':
        return this.appPabx(b);
      case 'arquivo':
        return this.appArquivo(b);
      case 'lista':
        return this.appLista(b);
      case 'msg':
        return this.appMsg(b);
      case 'desempenho':
        return this.appDesempenho(b);
      case 'loja':
        return this.appLoja(b);
      case 'antivirus':
        return this.appAntivirus(b);
      case 'config':
        b.append(h('p', { style: { marginTop: '0', color: 'var(--ink-dim)' } }, 'Preferências do jogo (valem também fora do computador).'), settingsForm(this.d.settings, this.d.ttsAvailable()));
        return;
    }
  }

  private appPainel(b: HTMLElement): void {
    const s = this.d.state;
    const def = dayDef(s.day.day);
    const p = s.day.collected / Math.max(1, s.day.quota);
    const heat = s.campaign.heat;
    b.append(
      h(
        'div',
        { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('small', {}, 'Arrecadado hoje'), h('b', { class: p >= 1 ? 'pos' : '' }, money(s.day.collected))),
        h('div', { class: 'stat' }, h('small', {}, 'Meta'), h('b', {}, money(s.day.quota))),
        h('div', { class: 'stat' }, h('small', {}, 'Faltam'), h('b', {}, money(Math.max(0, s.day.quota - s.day.collected)))),
        h('div', { class: 'stat' }, h('small', {}, 'Caixa da operação'), h('b', {}, money(s.campaign.operationBalance))),
        h('div', { class: 'stat' }, h('small', {}, 'Sua comissão'), h('b', {}, money(s.campaign.wallet))),
        h('div', { class: 'stat' }, h('small', {}, 'Exposição'), h('b', { class: heat >= 60 ? 'neg' : '' }, `${Math.round(heat)}%`), h('div', { style: { fontSize: '12px', color: 'var(--ink-dim)' } }, HEAT_LEVEL_LABEL[levelOf(heat)])),
      ),
      h('div', { class: `bar${p >= 1 ? ' good' : ''}`, style: { margin: '14px 0 4px' } }, h('i', { style: { width: `${Math.min(100, p * 100)}%` } })),
      h('h4', { style: { margin: '16px 0 8px' } }, `Iscas ativas (${this.d.calls.activeBaits.length}/${def.baitSlots} vagas)`),
      h('p', { style: { margin: '0 0 8px', fontSize: '13px', color: 'var(--ink-dim)' } }, 'Cada isca atrai ligações de um golpe diferente. Iscas novas rendem mais, mas atraem gente mais desconfiada.'),
    );
    const unlocked = this.d.calls.unlockedSchemes();
    for (const sc of SCHEMES) {
      const on = this.d.calls.activeBaits.includes(sc.id);
      const locked = !unlocked.includes(sc.id);
      b.append(
        h(
          'div',
          {
            class: `slot${on ? ' on' : ''}${locked ? ' locked' : ''}`,
            onclick: () => {
              if (locked) return;
              let next = on ? this.d.calls.activeBaits.filter((x) => x !== sc.id) : [...this.d.calls.activeBaits, sc.id];
              if (next.length > def.baitSlots) next = next.slice(next.length - def.baitSlots);
              if (!next.length) return;
              this.d.commands.setBaits(next);
              this.d.commands.sfx('click');
              this.refresh();
            },
          },
          h('span', { style: { fontSize: '20px' } }, locked ? '🔒' : on ? '✅' : '⬜'),
          h('div', {}, h('b', {}, sc.name), h('div', { style: { fontSize: '12px', color: 'var(--ink-dim)' } }, locked ? `Libera no dia ${sc.unlockDay}` : sc.bait)),
          h('span', { class: 'pill', style: { marginLeft: 'auto' } }, `×${sc.askMultiplier.toFixed(2)}`),
        ),
      );
    }
    const ledger = s.day.ledger.filter((e) => e.kind !== 'commission').slice(-7).reverse();
    b.append(h('h4', { style: { margin: '16px 0 6px' } }, 'Extrato do dia'));
    if (!ledger.length) b.append(h('p', { style: { color: 'var(--ink-faint)' } }, 'Nenhuma movimentação ainda.'));
    else
      b.append(
        h(
          'table',
          { class: 'tbl' },
          ...ledger.map((e) => h('tr', {}, h('td', {}, clockText(e.clock)), h('td', {}, e.note), h('td', { class: `num ${e.amount >= 0 ? 'pos' : 'neg'}` }, money(e.amount)))),
        ),
      );
  }

  private appPabx(b: HTMLElement): void {
    const s = this.d.state;
    const c = this.d.calls;
    const net = s.day.networkUp && s.day.powerUp;
    b.append(
      h(
        'div',
        { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' } },
        h('span', { class: `pill ${net ? 'good' : 'bad'}` }, net ? '● Linha ativa' : '● Sem linha'),
        h('span', { class: 'pill' }, c.phase === 'active' ? `Em ligação: ${c.caller?.name ?? 'número privado'}` : c.phase === 'ringing' ? 'Tocando' : 'Aguardando'),
        s.day.lowProfile ? h('span', { class: 'pill warn' }, 'Modo discreto') : null,
      ),
    );
    const input = h('input', { class: 'input', placeholder: '(00) 555-0000', value: this.dialValue }) as HTMLInputElement;
    input.addEventListener('input', () => (this.dialValue = input.value));
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '(', '0', ')'];
    b.append(
      h('h4', { style: { margin: '6px 0' } }, 'Discar'),
      input,
      h(
        'div',
        { class: 'dial' },
        ...keys.map((k) =>
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.dialValue += k;
                input.value = this.dialValue;
                this.d.commands.sfx('key');
              },
            },
            k,
          ),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        h(
          'button',
          {
            class: 'btn good',
            onclick: () => {
              const r = this.d.commands.dial(input.value);
              this.dialMsg = r.message;
              if (r.ok) this.dialValue = '';
              this.refresh();
            },
          },
          '📞 Ligar',
        ),
        h('button', { class: 'btn', onclick: () => ((this.dialValue = ''), (input.value = '')) }, 'Limpar'),
        h(
          'button',
          {
            class: 'btn',
            title: 'Silencia a central por 60 s: nenhuma ligação entra e a exposição cai mais rápido.',
            onclick: () => {
              this.dialMsg = this.d.commands.lowProfile();
              this.refresh();
            },
          },
          '🤫 Modo discreto',
        ),
      ),
      this.dialMsg ? h('p', { style: { color: 'var(--ink-dim)', margin: '8px 0 0' } }, this.dialMsg) : '',
      h('h4', { style: { margin: '16px 0 6px' } }, 'Histórico de hoje'),
    );
    const calls = [...s.day.calls].reverse().slice(0, 12);
    if (!calls.length) b.append(h('p', { style: { color: 'var(--ink-faint)' } }, 'Nenhuma ligação ainda.'));
    else
      b.append(
        h(
          'table',
          { class: 'tbl' },
          ...calls.map((r) => {
            const good = r.outcome === 'paid' || r.outcome === 'partial' || r.outcome === 'unmasked';
            return h('tr', {}, h('td', {}, clockText(r.clock)), h('td', {}, r.callerName), h('td', {}, h('span', { class: `pill ${good ? 'good' : r.outcome === 'missed' ? '' : 'bad'}` }, OUTCOME_LABEL[r.outcome])), h('td', { class: 'num' }, r.amount ? money(r.amount) : '—'));
          }),
        ),
      );
  }

  private appArquivo(b: HTMLElement): void {
    if (this.d.state.day.pcInfected) {
      b.append(
        h('div', { class: 'note alert' }, '🔒 ARQUIVOS CRIPTOGRAFADOS. Para recuperar, pague 2 CapivaraCoins. (Ou rode o Antivírus.)'),
      );
      return;
    }
    const input = h('input', { class: 'input', placeholder: 'Nome ou número...', value: this.searchQuery }) as HTMLInputElement;
    input.addEventListener('input', () => {
      this.searchQuery = input.value;
      this.renderResults(results);
    });
    const caller = this.d.calls.caller;
    const results = h('div', { style: { marginTop: '10px' } });
    b.append(
      h(
        'div',
        { style: { display: 'flex', gap: '8px' } },
        input,
        h(
          'button',
          {
            class: 'btn primary',
            disabled: !caller,
            onclick: () => {
              if (!caller) return;
              this.searchQuery = caller.number;
              input.value = caller.number;
              this.renderResults(results);
            },
          },
          'Linha atual',
        ),
      ),
      results,
    );
    this.renderResults(results);
  }

  private renderResults(box: HTMLElement): void {
    clear(box);
    if (this.lookup) {
      const left = Math.max(0, (this.lookup.until - performance.now()) / 1000);
      box.append(h('p', {}, 'Consultando o banco de dados...'), h('div', { class: 'loading-bar' }, h('i', { style: { animationDuration: `${this.lookup.total}s`, animationDelay: `-${this.lookup.total - left}s` } })));
      return;
    }
    if (this.openedFile) {
      const p = this.d.commands.search('').find((x) => x.id === this.openedFile) ?? this.d.commands.search(this.openedFile)[0];
      if (p) {
        box.append(h('button', { class: 'btn', onclick: () => ((this.openedFile = null), this.renderResults(box)) }, '← Voltar'), this.dossier(p));
        return;
      }
    }
    const q = this.searchQuery.trim();
    if (!q) {
      box.append(h('p', { style: { color: 'var(--ink-dim)' } }, 'Digite um nome ou número. Durante uma ligação, use "Linha atual".'));
      return;
    }
    const found = this.d.commands.search(q);
    if (!found.length) {
      box.append(h('p', { style: { color: 'var(--ink-dim)' } }, 'Nenhum registro encontrado.'));
      return;
    }
    for (const p of found.slice(0, 8)) {
      box.append(
        h(
          'div',
          {
            class: 'list-item',
            onclick: () => {
              const fast = this.d.state.hasUpgrade('ssd');
              const total = fast ? BALANCE.calls.lookupSecFast : BALANCE.calls.lookupSec;
              this.lookup = { id: p.id, until: performance.now() + total * 1000, total };
              this.d.commands.sfx('key');
              this.renderResults(box);
            },
          },
          h('span', { style: { fontSize: '20px' } }, '📁'),
          h('div', {}, h('b', {}, p.name), h('div', { style: { fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--ink-dim)' } }, p.number)),
          this.d.calls.caller?.id === p.id ? h('span', { class: 'pill warn', style: { marginLeft: 'auto' } }, 'na linha') : null,
        ),
      );
    }
  }

  private dossier(p: CallerProfile): HTMLElement {
    const arch = archetypeById(p.archetypeId);
    const canvas = h('canvas');
    drawPortrait(canvas, p.portrait, p.name.length);
    const f = p.facts;
    const row = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
    const hot = this.d.state.campaign.hotList.find((x) => x.number === p.number);
    return h(
      'div',
      { style: { marginTop: '10px' } },
      h(
        'div',
        { class: 'dossier' },
        canvas,
        h(
          'dl',
          {},
          ...row('Nome', p.name),
          ...row('Telefone', p.number),
          ...row('Idade', `${p.age} anos`),
          ...row('Ocupação', p.occupation),
          ...row('Cidade', f.city),
          ...row('Banco', f.bank),
          ...row('Pet', f.petType === '—' ? '—' : `${f.petName} (${f.petType})`),
          ...row('Parente', f.relation === '—' ? '—' : `${f.relativeName} (${f.relation})`),
          ...row('Time', f.team),
          ...row('Hobby', f.hobby),
          ...row('Saldo estimado', money(p.wealth)),
        ),
      ),
      h('div', { class: 'note' }, h('b', {}, `Perfil: ${arch.label}. `), arch.fileNote),
      ...p.extraNotes.map((n) => h('div', { class: `note${/ALERTA|policial|Inconsist|Cadastro criado|Endereço|Filho/.test(n) ? ' alert' : ''}` }, n)),
      hot ? h('div', { class: 'note alert' }, `🔥 Número na Lista Quente: ${hot.label}`) : null,
    );
  }

  private appLista(b: HTMLElement): void {
    const list = this.d.state.campaign.hotList;
    const current = this.d.calls.caller?.number;
    b.append(h('p', { style: { marginTop: '0', color: 'var(--ink-dim)' } }, 'Números que a central NÃO deve cobrar. Compare com a linha atual antes de pedir dinheiro.'));
    if (!list.length) {
      b.append(h('p', { style: { color: 'var(--ink-faint)' } }, 'Lista vazia. A Pri costuma ter a lista atualizada...'));
      return;
    }
    for (const e of list) {
      const match = e.number === current;
      b.append(
        h(
          'div',
          { class: 'list-item', style: match ? { borderColor: 'var(--red)', background: '#2d1c1c' } : {} },
          h('span', { style: { fontSize: '20px' } }, match ? '🚨' : '🔥'),
          h('div', {}, h('b', { style: { fontFamily: 'var(--mono)' } }, e.number), h('div', { style: { fontSize: '13px', color: 'var(--ink-dim)' } }, e.label)),
          match ? h('span', { class: 'pill bad', style: { marginLeft: 'auto' } }, 'É A LINHA ATUAL') : null,
        ),
      );
    }
  }

  private appMsg(b: HTMLElement): void {
    const msgs = this.d.inbox.messages;
    const wrap = h('div', { style: { display: 'grid', gridTemplateColumns: '210px 1fr', gap: '12px', height: '100%' } });
    const list = h('div', { style: { borderRight: '1px solid var(--line)', paddingRight: '8px', overflow: 'auto' } });
    const detail = h('div', { style: { overflow: 'auto' } });
    if (!msgs.length) list.append(h('p', { style: { color: 'var(--ink-faint)' } }, 'Sem mensagens.'));
    for (const m of msgs) {
      list.append(
        h(
          'div',
          {
            class: `list-item${m.read ? '' : ' unread'}`,
            style: this.selectedMsg === m.id ? { background: '#1c262e', borderColor: 'var(--line)' } : {},
            onclick: () => {
              this.selectedMsg = m.id;
              this.d.inbox.markRead(m.id);
              this.d.commands.sfx('click');
              this.refresh();
            },
          },
          h('div', {}, h('b', { style: { fontSize: '14px' } }, m.from), h('div', { style: { fontSize: '12px', color: 'var(--ink-dim)' } }, `${clockText(m.clock)} · ${m.subject}`)),
        ),
      );
    }
    const sel = msgs.find((m) => m.id === this.selectedMsg) ?? msgs[0];
    if (sel) {
      if (!sel.read) this.d.inbox.markRead(sel.id);
      this.selectedMsg = sel.id;
      detail.append(
        h('div', { style: { color: 'var(--ink-dim)', fontSize: '13px' } }, `${sel.from} · ${clockText(sel.clock)}`),
        h('h3', { style: { margin: '4px 0 10px' } }, sel.subject),
        h('p', { style: { fontSize: '16px', lineHeight: '1.55' } }, sel.body),
      );
      if (sel.actions.length) {
        detail.append(
          h(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            ...sel.actions.map((a) =>
              h(
                'button',
                {
                  class: `btn${a.id === 'buy' || a.id === 'yes' ? ' primary' : ''}`,
                  disabled: !!sel.answered,
                  onclick: () => {
                    this.d.commands.inboxAction(sel.id, a.id);
                    this.refresh();
                  },
                },
                sel.answered === a.id ? `✓ ${a.label}` : a.label,
              ),
            ),
          ),
        );
      }
    }
    wrap.append(list, detail);
    b.append(wrap);
    this.renderIcons();
  }

  private appDesempenho(b: HTMLElement): void {
    const s = this.d.state;
    const today = computeStats(s, 'met');
    const c = s.campaign;
    b.append(
      h(
        'div',
        { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('small', {}, 'Cargo'), h('b', { style: { fontSize: '17px' } }, RANKS[c.rankIndex])),
        h('div', { class: 'stat' }, h('small', {}, 'Advertências'), h('b', { class: c.strikes ? 'neg' : '' }, `${c.strikes}/${BALANCE.campaign.maxStrikes}`)),
        h('div', { class: 'stat' }, h('small', {}, 'Total arrecadado'), h('b', {}, money(c.totalCollected))),
        h('div', { class: 'stat' }, h('small', {}, 'Ligações hoje'), h('b', {}, String(today.calls))),
        h('div', { class: 'stat' }, h('small', {}, 'Sucessos'), h('b', { class: 'pos' }, String(today.successes))),
        h('div', { class: 'stat' }, h('small', {}, 'Conversão'), h('b', {}, today.calls ? `${Math.round((today.successes / today.calls) * 100)}%` : '—')),
      ),
      h('h4', { style: { margin: '16px 0 6px' } }, 'Relação com a equipe'),
      h(
        'table',
        { class: 'tbl' },
        ...(
          [
            ['Seu Gervásio (chefe)', c.relationships.boss],
            ['Tonhão', c.relationships.tonhao],
            ['Pri', c.relationships.pri],
            ['Juninho', c.relationships.juninho],
          ] as Array<[string, number]>
        ).map(([n, v]) => h('tr', {}, h('td', {}, n), h('td', { class: `num ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}` }, v > 1 ? 'Te adora' : v > 0 ? 'Gosta de você' : v === 0 ? 'Neutro' : v > -2 ? 'Desconfia' : 'Te detesta'))),
      ),
      h('h4', { style: { margin: '16px 0 6px' } }, 'Histórico da campanha'),
    );
    if (!c.history.length) b.append(h('p', { style: { color: 'var(--ink-faint)' } }, 'Primeiro dia. Ainda não há histórico.'));
    else
      b.append(
        h(
          'table',
          { class: 'tbl' },
          h('tr', {}, h('th', {}, 'Dia'), h('th', {}, 'Arrecadado'), h('th', {}, 'Meta'), h('th', {}, 'Resultado')),
          ...c.history.map((d) => h('tr', {}, h('td', {}, String(d.day)), h('td', { class: 'num' }, money(d.collected)), h('td', { class: 'num' }, money(d.quota)), h('td', {}, h('span', { class: `pill ${d.result === 'missed' || d.result === 'raided' ? 'bad' : 'good'}` }, resultLabel(d.result))))),
        ),
      );
  }

  private appLoja(b: HTMLElement): void {
    const s = this.d.state;
    b.append(h('p', { style: { marginTop: '0' } }, 'Sua comissão: ', h('b', { class: 'pos' }, money(s.campaign.wallet))));
    const grid = h('div', { class: 'shop' });
    for (const u of UPGRADES) {
      const owned = s.hasUpgrade(u.id);
      grid.append(
        h(
          'div',
          { class: `shop-item${owned ? ' owned' : ''}` },
          h('div', { class: 't' }, h('span', {}, `${u.icon} ${u.name}`), h('span', { class: 'pill' }, money(u.cost))),
          h('p', {}, u.description),
          h(
            'button',
            {
              class: `btn${owned ? ' good' : ' primary'}`,
              disabled: owned || s.campaign.wallet < u.cost,
              onclick: () => {
                if (this.d.commands.buy(u.id)) this.refresh();
              },
            },
            owned ? '✓ Comprado' : 'Comprar',
          ),
        ),
      );
    }
    b.append(grid);
  }

  private appAntivirus(b: HTMLElement): void {
    const infected = this.d.state.day.pcInfected;
    if (this.av) {
      const left = Math.max(0, (this.av.until - performance.now()) / 1000);
      b.append(h('p', {}, `Varredura em andamento... ${Math.ceil(left)} s`), h('div', { class: 'loading-bar' }, h('i', { style: { animationDuration: `${this.av.total}s`, animationDelay: `-${this.av.total - left}s` } })));
      return;
    }
    b.append(
      h('p', { style: { fontSize: '17px' } }, infected ? '⚠️ Ameaça detectada: comprovante_pix.exe' : '✅ Nenhuma ameaça encontrada.'),
      h('p', { style: { color: 'var(--ink-dim)' } }, 'Varredor 3000 — versão de avaliação. Varredura completa: 25 segundos.'),
      h(
        'button',
        {
          class: 'btn primary',
          disabled: !infected,
          onclick: () => {
            this.av = { until: performance.now() + 25000, total: 25 };
            this.d.commands.sfx('click');
            this.refresh();
          },
        },
        'Iniciar varredura',
      ),
    );
  }

  // ------------------------------------------------------------ vírus, travamento, energia

  private renderOverlay(): void {
    clear(this.overlay);
    const day = this.d.state.day;
    if (!day.powerUp) {
      this.overlay.append(h('div', { class: 'poweroff' }, 'SEM ENERGIA'));
      return;
    }
    if (day.pcCrashed) {
      const booting = this.boot;
      const left = booting ? Math.max(0, (booting.until - performance.now()) / 1000) : 0;
      this.overlay.append(
        h(
          'div',
          { class: 'bsod' },
          h('h1', {}, ':('),
          h('p', {}, booting ? 'Reiniciando o FortunaOS...' : 'O FortunaOS encontrou um problema (provavelmente café) e precisa ser reiniciado.'),
          booting
            ? h('div', { class: 'loading-bar', style: { maxWidth: '520px' } }, h('i', { style: { animationDuration: `${booting.total}s`, animationDelay: `-${booting.total - left}s` } }))
            : h(
                'button',
                {
                  class: 'btn',
                  style: { marginTop: '24px', fontSize: '20px' },
                  onclick: () => {
                    this.boot = { until: performance.now() + 7000, total: 7 };
                    this.d.commands.sfx('powerup');
                    this.renderOverlay();
                  },
                },
                '⏻ Reiniciar',
              ),
        ),
      );
    }
  }

  private spawnPopup(): void {
    const texts = [
      ['PARABÉNS!!!', 'Você é o visitante 1.000.000! Clique para ganhar um JET-SKI!'],
      ['ALERTA', 'Sua geladeira TAMBÉM está infectada. Ligue para o suporte.'],
      ['OFERTA', 'Invista em CapivaraCoin AGORA!!! Rende 900% ao minuto!'],
      ['URGENTE', 'Um príncipe deixou herança pra você. Só falta pagar o frete do castelo.'],
      ['ZÉ ISCA AO VIVO', 'hehehe 5 mil pessoas estão vendo sua tela agora 👋'],
    ];
    const [t, p] = texts[(this.popupClosed + this.popups.length) % texts.length];
    const el = h(
      'div',
      { class: 'virus-pop' },
      h(
        'header',
        {},
        t,
        h(
          'button',
          {
            onclick: () => {
              el.remove();
              this.popups = this.popups.filter((x) => x !== el);
              this.popupClosed++;
              this.d.commands.sfx('click');
              if (this.popupClosed >= 6) this.d.commands.cleanVirus();
              else if (Math.random() < 0.35) this.spawnPopup();
            },
          },
          'X',
        ),
      ),
      h('p', {}, p),
    );
    el.style.left = `${120 + Math.random() * 640}px`;
    el.style.top = `${40 + Math.random() * 480}px`;
    this.root.append(el);
    this.popups.push(el);
    this.d.commands.sfx('virus');
  }

  private clearPopups(): void {
    for (const p of this.popups) p.remove();
    this.popups = [];
    this.popupClosed = 0;
  }

  // ------------------------------------------------------------ painel de chamada

  private wireBus(): void {
    const bus = this.d.bus;
    bus.on('call:ring', ({ caller }) => this.showRinging(caller.name, caller.number, schemeById(caller.schemeId).name));
    bus.on('call:ringPrivate', ({ label }) => this.showRinging(label, 'Número oculto', 'Desconhecido'));
    bus.on('call:missed', () => this.closeCall());
    bus.on('call:narrative', () => this.closeCall());
    bus.on('call:start', (e) => this.startCall(e.caller, e.turn));
    bus.on('call:result', (e) => {
      const r = e.result;
      this.enqueue('me', r.playerLine);
      for (const l of r.callerLines) this.enqueue('them', l, `react-${r.reaction}`);
      if (e.traceLine) this.enqueue('them', e.traceLine);
      if (e.interject) {
        this.enqueue('them', e.interject.line);
        this.enqueue('sys', '(A pessoa se afastou do telefone...)');
        this.waitingBack = true;
      }
      if (r.next) {
        for (const l of r.next.callerLines) this.enqueue('them', l);
        this.currentTurn = r.next;
      } else this.currentTurn = null;
      this.renderChoices();
      this.renderMeters();
      this.pump();
    });
    bus.on('call:back', ({ line }) => {
      this.waitingBack = false;
      this.enqueue('them', line);
      this.pump();
    });
    bus.on('call:timeout', ({ line }) => {
      this.enqueue('them', line);
      this.renderMeters();
      this.pump();
    });
    bus.on('call:end', (e) => {
      this.currentTurn = null;
      this.enqueue('sys', '— ligação encerrada —');
      this.pump();
      if (this.callChoices) {
        clear(this.callChoices);
        this.callChoices.append(
          h('div', { class: `result ${e.good ? 'good' : 'bad'}` }, h('h3', {}, e.headline), h('p', { style: { margin: '0', color: 'var(--ink-dim)' } }, e.detail)),
        );
      }
      this.renderFoot(false);
      setTimeout(() => {
        if (this.d.calls.phase !== 'active' && this.d.calls.phase !== 'ringing') this.closeCall();
      }, 3200);
      this.refresh();
    });
    bus.on('call:fileViewed', () => {
      this.renderChoices();
    });
    bus.on('inbox', () => this.refresh());
    bus.on('world:power', () => this.refresh());
    bus.on('event:start', () => this.refresh());
    bus.on('event:end', () => this.refresh());
    bus.on('money', () => {
      for (const w of this.wins.values()) if (w.id === 'painel' || w.id === 'desempenho' || w.id === 'loja') w.render();
    });
  }

  private ensureCallPanel(): HTMLElement {
    if (!this.call) {
      this.call = h('div', { class: 'call' });
      this.root.append(this.call);
      this.root.classList.add('calling');
    }
    return this.call;
  }

  private showRinging(name: string, number: string, bait: string): void {
    const c = this.ensureCallPanel();
    clear(c);
    this.callLog = null;
    this.callChoices = null;
    c.append(
      h(
        'div',
        { class: 'ringing' },
        h(
          'div',
          {},
          h('div', { class: 'ring-ic' }, '☎️'),
          h('h3', {}, name),
          h('p', {}, `${number} · isca: ${bait}`),
          h('button', { class: 'btn primary', style: { fontSize: '18px', padding: '12px 22px' }, onclick: () => this.d.commands.answer() }, 'Atender  [E]'),
          h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn danger', onclick: () => this.d.commands.hangUp() }, 'Recusar')),
        ),
      ),
    );
  }

  private startCall(caller: CallerProfile, turn: Turn): void {
    const c = this.ensureCallPanel();
    clear(c);
    const canvas = h('canvas');
    drawPortrait(canvas, caller.portrait, caller.name.length);
    const scheme = schemeById(caller.schemeId);
    this.callMeters = h('div', { class: 'call-meters' });
    this.traceEl = h('div', { class: 'trace hidden' }, 'Clique na linha! Estão RASTREANDO a ligação. Desligue antes de completar.', h('div', { class: 'bar', style: { marginTop: '6px' } }, h('i', { style: { width: '0%' } })));
    this.callLog = h('div', { class: 'call-log' });
    this.callTimer = h('div', { class: 'call-timer' }, h('div', { class: 'bar' }, h('i', { style: { width: '100%' } })));
    this.callChoices = h('div', { class: 'choices' });
    c.append(
      h('div', { class: 'call-head' }, canvas, h('div', { class: 'who' }, h('b', {}, caller.name), h('span', {}, caller.number), h('em', {}, `Golpe: ${scheme.name}`))),
      this.callMeters,
      this.traceEl,
      this.callLog,
      this.callTimer,
      this.callChoices,
      h('div', { class: 'call-foot' }),
    );
    this.renderFoot(true);
    this.lineQueue = [];
    this.typing = false;
    this.waitingBack = false;
    this.currentTurn = turn;
    for (const l of turn.callerLines) this.enqueue('them', l);
    this.renderMeters();
    this.renderChoices();
    this.pump();
    this.refresh();
  }

  private renderFoot(active: boolean): void {
    const foot = this.call?.querySelector('.call-foot') as HTMLElement | null;
    if (!foot) return;
    clear(foot);
    if (active) {
      foot.append(
        h('button', { class: 'btn', onclick: () => this.open('arquivo') }, '🗂️ Arquivo'),
        h('button', { class: 'btn', onclick: () => this.open('lista') }, '🔥 Lista'),
        h('button', { class: 'btn danger', onclick: () => this.d.commands.hangUp() }, '📵 Desligar'),
      );
    }
  }

  private closeCall(): void {
    this.call?.remove();
    this.call = null;
    this.callLog = null;
    this.callChoices = null;
    this.callTimer = null;
    this.callMeters = null;
    this.traceEl = null;
    this.currentTurn = null;
    this.lineQueue = [];
    this.typing = false;
    this.root.classList.remove('calling');
  }

  private enqueue(who: 'them' | 'me' | 'sys', text: string, cls = ''): void {
    if (!text) return;
    this.lineQueue.push({ who, text, cls });
  }

  /** Exibe as falas uma a uma, com efeito de digitação e voz. */
  private pump(): void {
    if (this.typing || !this.callLog) return;
    const next = this.lineQueue.shift();
    if (!next) {
      this.renderChoices();
      return;
    }
    this.typing = true;
    const el = h('div', { class: `line ${next.who} ${next.cls ?? ''}` });
    this.callLog.append(el);
    const speed = 42 * this.d.settings.values.textSpeed;
    let voiceDur = 0;
    if (next.who === 'them') voiceDur = this.d.commands.speak(next.text, this.d.calls.caller);
    // O texto acompanha a voz (com teto) para fala e legenda não se separarem.
    const total = Math.max(next.text.length / speed, next.who === 'them' ? Math.min(voiceDur, 6) * 0.8 : 0.2);
    const start = performance.now();
    const step = () => {
      if (!this.callLog) return;
      const t = (performance.now() - start) / 1000;
      const n = Math.min(next.text.length, Math.ceil((t / total) * next.text.length));
      el.textContent = next.text.slice(0, n);
      this.callLog.scrollTop = this.callLog.scrollHeight;
      if (n < next.text.length) requestAnimationFrame(step);
      else {
        this.typing = false;
        setTimeout(() => this.pump(), next.who === 'me' ? 180 : 260);
      }
    };
    requestAnimationFrame(step);
    this.renderChoices();
  }

  /** Pula a digitação (clique no histórico). */
  skipTyping(): void {
    if (!this.callLog) return;
    for (const l of this.lineQueue) this.callLog.append(h('div', { class: `line ${l.who} ${l.cls ?? ''}` }, l.text));
    this.lineQueue = [];
  }

  private renderChoices(): void {
    const box = this.callChoices;
    if (!box || !this.currentTurn) return;
    clear(box);
    const conv = this.d.calls.conversation;
    if (!conv) return;
    const busy = this.typing || this.lineQueue.length > 0 || this.waitingBack;
    box.append(h('div', { class: 'stage' }, h('span', {}, conv.currentTitle()), h('span', {}, busy ? 'ouvindo...' : 'sua resposta')));
    if (busy) {
      box.append(h('div', { class: 'typing' }, this.waitingBack ? 'Aguardando a pessoa voltar...' : '...'));
      return;
    }
    const choices: ChoiceView[] = conv.currentChoices();
    choices.forEach((ch, i) => {
      const tagText = ch.kind === 'ask' ? `${ch.label}` : ch.kind === 'answer' ? 'Responder' : ch.label;
      box.append(
        h(
          'button',
          {
            class: `choice t-${ch.approach ?? 'none'} k-${ch.kind}${ch.favorite ? ' fav' : ''}`,
            onclick: () => {
              this.d.commands.sfx('key');
              this.d.commands.choose(ch.id);
            },
          },
          h('span', { class: 'num' }, String(i + 1)),
          h('span', { class: 'tag' }, tagText),
          h('span', {}, ch.text),
        ),
      );
    });
  }

  /** Escolha pelo teclado numérico durante a ligação. */
  chooseIndex(i: number): void {
    const conv = this.d.calls.conversation;
    if (!conv || this.typing || this.lineQueue.length || this.waitingBack) return;
    const ch = conv.currentChoices()[i];
    if (ch) {
      this.d.commands.sfx('key');
      this.d.commands.choose(ch.id);
    }
  }

  private renderMeters(): void {
    const m = this.callMeters;
    const conv = this.d.calls.conversation;
    if (!m || !conv) return;
    clear(m);
    const delta = conv.trust - conv.suspicion;
    const mood = MOODS.find(([t]) => delta >= t)!;
    const cold = this.d.state.hasUpgrade('coldread');
    const meter = (cls: string, label: string, v: number) =>
      h('div', { class: `m ${cls}` }, h('span', {}, cold ? `${label}: ${Math.round(v)}` : label), h('div', { class: 'bar' }, h('i', { style: { width: `${v}%` } })));
    m.append(h('div', { class: 'mood' }, h('span', { class: 'face' }, mood[1]), h('span', {}, mood[2]), h('span', { style: { marginLeft: 'auto', fontSize: '12px', color: 'var(--ink-dim)' } }, archetypeById(conv.profile.archetypeId).label)));
    if (cold) {
      m.append(meter('trust', 'Confiança', conv.trust), meter('susp', 'Desconfiança', conv.suspicion));
      const fav = (Object.entries(conv.archetype.prefs) as Array<[keyof typeof APPROACH_LABEL, number]>).sort((a, b) => b[1] - a[1])[0];
      m.append(h('div', { style: { gridColumn: 'span 2', fontSize: '12px' } }, `📘 Leitura fria: prefere ${APPROACH_LABEL[fav[0]]}.`));
    }
    m.append(meter('pat', 'Paciência', conv.patience));
  }

  // ------------------------------------------------------------ quadro a quadro

  tick(dt: number): void {
    const now = performance.now();
    if (this.lookup && now >= this.lookup.until) {
      const id = this.lookup.id;
      this.lookup = null;
      this.openedFile = id;
      this.d.commands.fileOpened(id);
      this.d.commands.sfx('message');
      this.wins.get('arquivo')?.render();
    }
    if (this.av && now >= this.av.until) {
      this.av = null;
      this.d.commands.cleanVirus();
      this.refresh();
    }
    if (this.boot && now >= this.boot.until) {
      this.boot = null;
      this.d.commands.reboot();
      this.refresh();
    }
    const day = this.d.state.day;
    if (day.pcInfected && this.visible) {
      this.popupTimer -= dt;
      if (this.popupTimer <= 0 && this.popups.length < 4) {
        this.popupTimer = 1.2;
        this.spawnPopup();
      }
    } else if (!day.pcInfected && this.popups.length) this.clearPopups();
    // Barra de tempo de resposta e rastreio.
    const c = this.d.calls;
    if (this.callTimer && c.phase === 'active' && c.conversation) {
      const p = c.pauseTimer > 0 ? 1 : Math.max(0, c.responseTimer / c.responseMax);
      (this.callTimer.firstElementChild!.firstElementChild as HTMLElement).style.width = `${p * 100}%`;
      this.callTimer.classList.toggle('low', p < 0.3);
      if (Math.random() < 0.05) this.renderMeters();
    }
    if (this.traceEl) {
      this.traceEl.classList.toggle('hidden', !c.traceActive);
      (this.traceEl.querySelector('.bar > i') as HTMLElement).style.width = `${Math.min(100, c.traceProgress * 100)}%`;
    }
    this.tray.innerHTML = `<span class="net ${day.networkUp ? '' : 'down'}">${day.networkUp ? '📶' : '⛔'}</span><span>${money(day.collected)}</span><span>${clockText(day.clock)}</span>`;
  }
}

function resultLabel(r: string): string {
  return r === 'excellent' ? 'Excelente' : r === 'met' ? 'Meta batida' : r === 'raided' ? 'Batida policial' : 'Meta perdida';
}
