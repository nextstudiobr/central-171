import { BALANCE } from '../data/balance';
import {
  BOSS_LINES,
  COWORKER_IDLE,
  bossSummonScript,
  finalDealScript,
  juninhoScript,
  mysteryScript,
  tonhaoHelpScript,
  type NarrativeScript,
  type NpcId,
} from '../data/npcs';
import { storyCallers } from '../data/callers';
import type { DayDef } from '../data/types';
import type { Bus } from '../core/events';
import { Rng, hashSeed } from '../core/rng';
import { clockText, money, roundTo } from '../core/util';
import type { CallSystem } from './CallSystem';
import { CallerFactory } from './CallerFactory';
import type { Economy } from './Economy';
import type { GameState } from './GameState';
import type { Inbox } from './Inbox';
import { levelOf, type Risk, type HeatLevel } from './Risk';

export type Zone = 'boss_office' | 'desk' | 'rack' | 'breaker' | 'shredder';

/** O que o diretor precisa do mundo 3D e da interface. */
export interface DirectorHost {
  npcVisitPlayer(id: NpcId): void;
  npcGoTo(id: NpcId, spot: 'office' | 'rack' | 'desk'): void;
  npcReturn(id: NpcId): void;
  npcArrived(id: NpcId): boolean;
  setPolice(level: HeatLevel): void;
  setBlackout(on: boolean): void;
  setNetworkLeds(up: boolean): void;
  playerInZone(zone: Zone): boolean;
  playerSeated(): boolean;
  openNarrative(script: NarrativeScript, onEffect: (effect: string) => void, onClose: () => void): void;
  narrativeOpen(): boolean;
  setObjective(text: string | null): void;
}

interface Active {
  id: string;
  /** Tempo real decorrido desde o início (s). */
  t: number;
  update(dt: number): void;
  /** Interação do jogador com um ponto do mundo. Devolve true se consumiu. */
  interact?(what: string): boolean;
  objective(): string | null;
}

/**
 * Agenda e conduz os acontecimentos do expediente. Cada evento altera alguma
 * regra do jogo (rede, energia, tempo, dinheiro, risco) até ser resolvido.
 */
export class EventDirector {
  private active: Active[] = [];
  private done = new Set<string>();
  private pendingScripted: Array<{ id: string; at: number }> = [];
  private nextRandomAt = 0;
  private rng: Rng;
  private def: DayDef | null = null;
  private pendingRing: import('../data/types').CallerProfile | null = null;
  private investigationCooldown = 0;
  private barkTimer = 25;
  private bossAwayWarned = false;
  /** Fila de eventos disparados por outros sistemas. */
  private triggered: string[] = [];

  constructor(
    private readonly state: GameState,
    private readonly economy: Economy,
    private readonly risk: Risk,
    private readonly calls: CallSystem,
    private readonly inbox: Inbox,
    private readonly bus: Bus,
    private readonly host: DirectorHost,
  ) {
    this.rng = new Rng(1);
    bus.on('trigger', ({ id }) => this.triggered.push(id));
    bus.on('call:narrative', ({ id }) => this.onNarrativeCall(id));
    bus.on('call:narrativeMissed', ({ id }) => this.onNarrativeMissed(id));
    bus.on('call:ring', () => (this.bossAwayWarned = false));
    bus.on('heat', (h) => this.onHeat(h.level, h.previousLevel));
  }

  startDay(def: DayDef): void {
    this.def = def;
    this.rng = new Rng(hashSeed(this.state.campaign.seed, def.day, 1337));
    this.active = [];
    this.done.clear();
    this.triggered = [];
    this.pendingScripted = [...def.scripted].sort((a, b) => a.at - b.at);
    this.nextRandomAt = this.rng.range(70, 130);
    this.pendingRing = null;
    this.host.setPolice(levelOf(this.state.campaign.heat));
    this.host.setBlackout(false);
    this.host.setNetworkLeds(true);
    this.investigationCooldown = 0;
    this.barkTimer = 25;
    this.morningMessages(def);
    this.refreshObjective();
  }

  get activeIds(): string[] {
    return this.active.map((a) => a.id);
  }

  isActive(id: string): boolean {
    return this.active.some((a) => a.id === id);
  }

  /** dt real em segundos. */
  update(dt: number): void {
    const def = this.def;
    if (!def || this.state.day.finished) return;
    const clock = this.state.day.clock;

    while (this.triggered.length) this.start(this.triggered.shift()!);
    if (this.pendingRing && !this.host.narrativeOpen() && this.calls.ringNow(this.pendingRing)) this.pendingRing = null;

    if (this.pendingScripted.length && clock >= this.pendingScripted[0].at) {
      const next = this.pendingScripted[0];
      if (this.canStart(next.id)) {
        this.pendingScripted.shift();
        this.start(next.id);
      }
    }

    if (clock >= this.nextRandomAt && clock < 500) {
      const pool = def.events.filter((id) => !this.done.has(id) && !this.isActive(id) && !def.scripted.some((s) => s.id === id));
      if (pool.length && this.active.length < 2) {
        const id = this.rng.pick(pool);
        if (this.canStart(id)) {
          this.start(id);
          this.nextRandomAt = clock + this.rng.range(80, 140);
        } else this.nextRandomAt = clock + 10;
      } else this.nextRandomAt = clock + 30;
    }

    for (const a of [...this.active]) {
      a.t += dt;
      a.update(dt);
    }
    if (this.investigationCooldown > 0) this.investigationCooldown -= dt;
    this.ambient(dt);
    this.refreshObjective();
  }

  /** O jogador interagiu com um ponto do mundo (rack, disjuntor, colega...). */
  interact(what: string): boolean {
    for (const a of this.active) if (a.interact?.(what)) return true;
    return false;
  }

  /** Força o encerramento de tudo (fim do dia, batida). */
  stopAll(): void {
    this.active = [];
    this.host.setObjective(null);
  }

  private canStart(id: string): boolean {
    if (this.isActive(id)) return false;
    if (this.host.narrativeOpen()) return false;
    const needsQuiet = ['boss_summon', 'coworker_help', 'mystery_call', 'final_deal', 'network_down', 'pc_crash', 'juninho_help'];
    if (needsQuiet.includes(id) && this.calls.phase !== 'idle') return false;
    // Eventos que usam o mesmo colega não acontecem ao mesmo tempo.
    const sameNpc = [
      ['coworker_help', 'network_down'],
      ['pc_crash', 'juninho_help'],
    ];
    for (const group of sameNpc) if (group.includes(id) && group.some((g) => this.isActive(g))) return false;
    return true;
  }

  private end(id: string): void {
    this.active = this.active.filter((a) => a.id !== id);
    this.done.add(id);
  }

  private refreshObjective(): void {
    const texts = this.active.map((a) => a.objective()).filter((t): t is string => !!t);
    this.host.setObjective(texts.length ? texts[0] : null);
  }

  private say(who: NpcId, text: string, duration = 4): void {
    this.bus.emit('speech', { who, text, duration });
  }

  private rel(who: keyof GameState['campaign']['relationships'], delta: number): void {
    this.state.campaign.relationships[who] += delta;
  }

  /** Aplica efeitos textuais vindos dos roteiros narrativos. */
  applyEffect(effect: string): void {
    const c = this.state.campaign;
    const m = effect.match(/^(boss|tonhao|pri|juninho)([+-][\d.]+)$/);
    if (m) {
      this.rel(m[1] as keyof typeof c.relationships, Number(m[2]));
      return;
    }
    const h = effect.match(/^heat([+-]\d+)$/);
    if (h) {
      this.risk.add(Number(h[1]), 'Consequência de uma conversa.');
      return;
    }
    const [k, v] = effect.split(':');
    if (k === 'bonus') this.economy.bonus(Number(v), 'Bônus do chefe');
    else if (k === 'fine') this.economy.fine(Number(v), 'Multa do chefe');
    else if (k === 'flag') c.flags[v] = true;
    else if (effect === 'transfer_call') this.transferCall();
  }

  // ------------------------------------------------------------- manhã

  private morningMessages(def: DayDef): void {
    const c = this.state.campaign;
    this.inbox.reset();
    def.bossBriefing.forEach((line, i) =>
      this.inbox.push('Seu Gervásio (Chefe)', i === 0 ? `Expediente de ${def.weekday}` : 'Recado', line.replace('{meta}', money(def.quota)), 'boss'),
    );
    if (def.day === 1) {
      this.inbox.push('Pri', 'Bem-vindo, novato', 'Dica de quem tá aqui há 3 anos: abre o Arquivo de Casos durante a ligação e procura a ficha da pessoa. Com a ficha aberta você ganha frases muito mais convincentes.', 'info');
    }
    if (def.day >= 3 && c.relationships.pri >= 1) {
      this.addHotList(true);
      this.inbox.push('Pri', 'Lista Quente atualizada', 'Atualizei a Lista Quente pra você. De graça, porque você é legal. Confere antes de cobrar alguém.', 'info');
    }
    if (def.day >= 4 && !c.hotList.some((h) => h.label.includes('Moura'))) {
      c.hotList.push({ number: '(61) 555-0190', label: 'Possível policial disfarçada (Moura?)' });
    }
  }

  private addHotList(full: boolean): void {
    const c = this.state.campaign;
    const sc = storyCallers();
    const entries = [
      { number: sc.zeIsca.number, label: 'Caçador de golpistas (faz live)' },
      { number: '(48) 555-0404', label: 'Repórter do "Golpe Exposto"' },
      { number: '(85) 555-0911', label: 'Grava tudo e manda pro grupo da igreja' },
    ];
    if (full) entries.push({ number: sc.marta.number, label: 'Possível policial disfarçada' });
    for (const e of entries) if (!c.hotList.some((h) => h.number === e.number)) c.hotList.push(e);
  }

  // ------------------------------------------------------------- ambiente

  private ambient(dt: number): void {
    this.barkTimer -= dt;
    if (this.barkTimer <= 0) {
      this.barkTimer = this.rng.range(28, 50);
      const who = this.rng.pick(['tonhao', 'pri', 'juninho'] as const);
      this.say(who, this.rng.pick(COWORKER_IDLE[who]), 5);
    }
    // O chefe repara quando o telefone toca e o jogador está longe da mesa.
    if (this.calls.phase === 'ringing' && !this.host.playerSeated() && !this.host.playerInZone('desk') && !this.bossAwayWarned) {
      if (this.calls.ringTimer < 12) {
        this.bossAwayWarned = true;
        this.say('boss', this.rng.pick(BOSS_LINES.playerAway));
        this.bus.emit('sfx', { id: 'boss_yell' });
        this.rel('boss', -0.5);
      }
    }
  }

  private onHeat(level: HeatLevel, prev: HeatLevel): void {
    this.host.setPolice(level);
    if (level > prev) {
      if (level === 1) this.say('boss', this.rng.pick(BOSS_LINES.heat1));
      if (level >= 2 && this.investigationCooldown <= 0 && !this.isActive('investigation')) {
        this.triggered.push('investigation');
      }
      if (level === 3) {
        this.say('boss', this.rng.pick(BOSS_LINES.heat3), 5);
        this.bus.emit('sfx', { id: 'siren' });
      }
    }
  }

  // ------------------------------------------------------------- eventos

  /** Inicia um evento pelo id. */
  start(id: string): void {
    if (this.isActive(id) || this.state.day.finished) return;
    const handler = this.create(id);
    if (!handler) return;
    this.active.push(handler);
  }

  private create(id: string): Active | null {
    switch (id) {
      case 'boss_demand':
        return this.bossDemand();
      case 'boss_summon':
        return this.bossSummon();
      case 'coworker_help':
        return this.npcRequest('tonhao', tonhaoHelpScript);
      case 'juninho_help':
        return this.npcRequest('juninho', juninhoScript);
      case 'pri_tip':
        return this.priTip();
      case 'network_down':
        return this.networkDown();
      case 'pc_virus':
        return this.pcVirus();
      case 'pc_crash':
        return this.pcCrash();
      case 'power_outage':
        return this.powerOutage();
      case 'hot_lead':
        return this.hotLead();
      case 'mystery_call':
        return this.privateCall('mystery_call', 'Número privado');
      case 'final_deal':
        return this.privateCall('final_deal', 'Número privado');
      case 'investigation':
        return this.investigation();
      default:
        console.warn(`[EventDirector] evento desconhecido: ${id}`);
        return null;
    }
  }

  private announce(id: string, title: string, description: string): void {
    this.bus.emit('event:start', { id, title, description });
  }

  private finishEvent(id: string, success: boolean, summary: string): void {
    this.end(id);
    this.bus.emit('event:end', { id, success, summary });
  }

  private bossDemand(): Active {
    const quota = this.state.day.quota;
    const target = Math.max(100, roundTo(quota * 0.22, 50));
    const start = this.state.day.collected;
    const deadline = Math.min(530, this.state.day.clock + 110);
    this.announce('boss_demand', 'O chefe quer resultado', `Arrecade mais ${money(target)} até ${clockText(deadline)}.`);
    this.inbox.push('Seu Gervásio (Chefe)', 'URGENTE', `Quero mais ${money(target)} até as ${clockText(deadline)}. Não é pedido. É profecia.`, 'boss');
    this.say('boss', `Mais ${money(target)} até as ${clockText(deadline)}! Eu tô contando!`, 5);
    this.bus.emit('sfx', { id: 'boss_yell' });
    return {
      id: 'boss_demand',
      t: 0,
      objective: () => `Chefe: +${money(Math.max(0, target - (this.state.day.collected - start)))} até ${clockText(deadline)}`,
      update: () => {
        if (this.state.day.collected - start >= target) {
          const b = Math.round(quota * 0.05);
          this.economy.bonus(b, 'Bônus: exigência do chefe cumprida');
          this.rel('boss', 1);
          this.say('boss', 'Isso! Eu sabia que o medo funcionava.');
          this.finishEvent('boss_demand', true, `Exigência cumprida. Bônus de ${money(b)}.`);
        } else if (this.state.day.clock >= deadline) {
          const f = Math.round(quota * 0.05);
          this.economy.fine(f, 'Multa: exigência do chefe não cumprida');
          this.rel('boss', -1);
          this.say('boss', 'Prazo estourado! Multa! Vergonha! Multa de vergonha!');
          this.bus.emit('sfx', { id: 'boss_yell' });
          this.finishEvent('boss_demand', false, `Prazo perdido. Multa de ${money(f)}.`);
        }
      },
    };
  }

  private bossSummon(): Active {
    const limit = 55;
    let talking = false;
    this.host.npcGoTo('boss', 'office');
    this.announce('boss_summon', 'Chamado à sala do chefe', 'Vá até a sala de vidro do chefe.');
    this.inbox.push('Seu Gervásio (Chefe)', 'NA MINHA SALA', 'Na minha sala. Agora. Não é daqui a pouco. É agora.', 'boss');
    this.say('boss', 'VOCÊ! Na minha sala! AGORA!', 5);
    this.bus.emit('sfx', { id: 'boss_yell' });
    const ev: Active = {
      id: 'boss_summon',
      t: 0,
      objective: () => (talking ? null : `Vá à sala do chefe (${Math.max(0, Math.ceil(limit - ev.t))} s)`),
      update: () => {
        if (talking) return;
        if (this.host.playerInZone('boss_office')) {
          talking = true;
          this.host.openNarrative(
            bossSummonScript(this.state.quotaProgress, this.state.day.day),
            (e) => this.applyEffect(e),
            () => this.finishEvent('boss_summon', true, 'Você sobreviveu à conversa com o chefe.'),
          );
        } else if (ev.t >= limit) {
          const f = Math.round(this.state.day.quota * 0.04);
          this.economy.fine(f, 'Multa: ignorou o chamado do chefe');
          this.rel('boss', -1.5);
          this.say('boss', 'Ignorou meu chamado?! Isso vai pro prontuário!', 5);
          this.bus.emit('sfx', { id: 'boss_yell' });
          this.finishEvent('boss_summon', false, `Ignorou o chefe. Multa de ${money(f)}.`);
        }
      },
    };
    return ev;
  }

  private npcRequest(who: 'tonhao' | 'juninho', script: () => NarrativeScript): Active {
    const id = who === 'tonhao' ? 'coworker_help' : 'juninho_help';
    let talking = false;
    let arrivedAt = -1;
    this.host.npcVisitPlayer(who);
    const name = who === 'tonhao' ? 'Tonhão' : 'Juninho';
    this.announce(id, `${name} quer falar com você`, `${name} está indo até a sua mesa.`);
    const ev: Active = {
      id,
      t: 0,
      objective: () => (talking ? null : arrivedAt >= 0 ? `Fale com ${name} (olhe para ele e aperte E)` : null),
      update: () => {
        if (talking) return;
        if (arrivedAt < 0 && this.host.npcArrived(who)) {
          arrivedAt = ev.t;
          this.say(who, who === 'tonhao' ? 'Ô, parceiro! Dá um minutinho?' : 'Ei... posso perguntar uma coisa?');
        }
        if (arrivedAt >= 0 && ev.t - arrivedAt > 45) {
          this.rel(who, -0.5);
          this.say(who, 'Deixa pra lá então.');
          this.host.npcReturn(who);
          this.finishEvent(id, false, `${name} desistiu de esperar.`);
        }
      },
      interact: (what) => {
        if (what !== `npc:${who}` || talking || arrivedAt < 0) return false;
        talking = true;
        this.host.openNarrative(
          script(),
          (e) => this.applyEffect(e),
          () => {
            this.host.npcReturn(who);
            this.finishEvent(id, true, `Você conversou com ${name}.`);
          },
        );
        return true;
      },
    };
    return ev;
  }

  private transferCall(): void {
    const def = this.def!;
    const factory = new CallerFactory(new Rng(hashSeed(this.state.campaign.seed, def.day, 2024)));
    const scheme = this.rng.pick(this.calls.activeBaits.length ? this.calls.activeBaits : ['netuno']);
    const profile = factory.generate(def, scheme, new Set());
    profile.warmLead = true;
    profile.extraNotes.push('Transferida pelo Tonhão. Acha que você é sobrinho dela.');
    // Toca assim que a conversa com o Tonhão termina e a linha estiver livre.
    this.pendingRing = profile;
  }

  private priTip(): Active {
    let answered = false;
    const price = 60;
    this.inbox.push(
      'Pri',
      'Lista Quente?',
      `Tenho uns números que você NÃO quer cobrar: polícia disfarçada, caçador de golpista, repórter. Te passo a lista atualizada por ${money(price)} da sua comissão.`,
      'info',
      [
        { id: 'buy', label: `Comprar (${money(price)})` },
        { id: 'no', label: 'Dispensar' },
      ],
      (action) => {
        answered = true;
        if (action === 'buy') {
          if (this.economy.spendWallet(price, 'Lista Quente da Pri')) {
            this.addHotList(true);
            this.rel('pri', 1);
            this.inbox.push('Pri', 'Feito', 'Lista atualizada no app Lista Quente. Confere o número antes de pedir dinheiro.', 'good');
            this.finishEvent('pri_tip', true, 'Lista Quente atualizada.');
          } else {
            this.inbox.push('Pri', 'Sem grana?', 'Sua comissão não cobre. Te dou só um pedaço, porque sou boazinha.', 'warn');
            this.addHotList(false);
            this.finishEvent('pri_tip', false, 'Comissão insuficiente.');
          }
        } else {
          this.rel('pri', -0.5);
          this.finishEvent('pri_tip', false, 'Você dispensou a Pri.');
        }
      },
    );
    const ev: Active = {
      id: 'pri_tip',
      t: 0,
      objective: () => null,
      update: () => {
        if (!answered && ev.t > 150) this.finishEvent('pri_tip', false, 'A oferta da Pri expirou.');
      },
    };
    return ev;
  }

  private networkDown(): Active {
    const day = this.state.day;
    const culprit: NpcId = this.state.campaign.relationships.tonhao <= -1 ? 'tonhao' : 'juninho';
    day.networkUp = false;
    this.calls.drop('A internet caiu no meio da ligação.');
    this.host.setNetworkLeds(false);
    this.bus.emit('world:network', { up: false });
    this.bus.emit('sfx', { id: 'powerdown' });
    this.say(culprit, culprit === 'tonhao' ? 'Opa... tropecei no cabo. Sem querer. Juro.' : 'Gente, o que é esse cabo azul? Eu puxei.', 5);
    this.announce('network_down', 'A rede caiu!', 'Sem rede, o telefone não toca. Reinicie o roteador no armário de rede.');
    let warned = false;
    const helper = this.state.campaign.relationships.tonhao >= 2;
    if (helper) this.host.npcGoTo('tonhao', 'rack');
    const restore = (byHelper: boolean) => {
      day.networkUp = true;
      this.host.setNetworkLeds(true);
      this.bus.emit('world:network', { up: true });
      this.bus.emit('sfx', { id: 'powerup' });
      if (byHelper) {
        this.say('tonhao', 'Pronto, parceiro! Te devia essa.');
        this.host.npcReturn('tonhao');
      }
      this.finishEvent('network_down', true, byHelper ? 'O Tonhão consertou a rede para você.' : 'Rede restabelecida.');
    };
    const ev: Active = {
      id: 'network_down',
      t: 0,
      objective: () => 'Reinicie o roteador no armário de rede (segure E)',
      update: () => {
        if (helper && ev.t > 22) return restore(true);
        if (!warned && ev.t > 40) {
          warned = true;
          const f = Math.round(this.state.day.quota * 0.03);
          this.economy.fine(f, 'Multa: central fora do ar');
          this.say('boss', 'Cadê a internet?! Cada minuto parado é dinheiro saindo do MEU bolso!', 5);
          this.bus.emit('sfx', { id: 'boss_yell' });
        }
      },
      interact: (what) => {
        if (what !== 'rack') return false;
        restore(false);
        return true;
      },
    };
    return ev;
  }

  private pcVirus(): Active {
    this.state.day.pcInfected = true;
    this.announce('pc_virus', 'Vírus no computador!', 'Feche os pop-ups ou rode o antivírus. O Arquivo de Casos está bloqueado.');
    this.bus.emit('sfx', { id: 'virus' });
    this.say('pri', 'Abriu o comprovante.exe, né? Clássico.', 4);
    const ev: Active = {
      id: 'pc_virus',
      t: 0,
      objective: () => (this.state.day.pcInfected ? 'Limpe o vírus do computador (feche os pop-ups ou use o Antivírus)' : null),
      update: () => {
        if (!this.state.day.pcInfected) this.finishEvent('pc_virus', true, 'Computador limpo.');
      },
    };
    return ev;
  }

  private pcCrash(): Active {
    const friendly = this.state.campaign.relationships.juninho >= 1;
    let arrived = false;
    this.host.npcVisitPlayer('juninho');
    const ev: Active = {
      id: 'pc_crash',
      t: 0,
      objective: () => (this.state.day.pcCrashed ? 'Reinicie o computador (botão na tela)' : null),
      update: () => {
        if (!arrived && (this.host.npcArrived('juninho') || ev.t > 25)) {
          arrived = true;
          if (friendly) {
            this.say('juninho', 'Trouxe café pra você! E não derrubei! Tô evoluindo!', 5);
            this.state.day.coffeeCalls += BALANCE.upgrades.coffeeCalls;
            this.bus.emit('notify', { title: 'Juninho trouxe café', body: 'Mais tempo para responder nas próximas ligações.', tone: 'good', icon: '☕' });
            this.host.npcReturn('juninho');
            this.finishEvent('pc_crash', true, 'Juninho trouxe café em vez de desastre.');
            return;
          }
          this.say('juninho', 'Trouxe café pr... AI! Ai, ai, ai. Foi no teclado. Foi tudo no teclado.', 5);
          this.state.day.pcCrashed = true;
          this.bus.emit('sfx', { id: 'splash' });
          this.announce('pc_crash', 'Café no computador!', 'O computador travou. Reinicie pelo botão na tela.');
          this.host.npcReturn('juninho');
          return;
        }
        if (arrived && !this.state.day.pcCrashed) this.finishEvent('pc_crash', true, 'Computador reiniciado.');
      },
    };
    return ev;
  }

  private powerOutage(): Active {
    const day = this.state.day;
    this.calls.drop('A luz acabou!');
    day.powerUp = false;
    day.pcCrashed = true;
    this.host.setBlackout(true);
    this.bus.emit('world:power', { on: false });
    this.bus.emit('sfx', { id: 'powerdown' });
    this.say('juninho', 'AAAH! Quem apagou a luz?!', 3);
    this.announce('power_outage', 'Queda de energia!', 'Religue o disjuntor no quadro de energia, perto do armário de rede.');
    let warned = false;
    const ev: Active = {
      id: 'power_outage',
      t: 0,
      objective: () => 'Religue o disjuntor no quadro de energia (E)',
      update: () => {
        if (!warned && ev.t > 35) {
          warned = true;
          this.say('boss', 'Alguém religa essa luz! Eu tenho medo do escuro! QUER DIZER, de prejuízo!', 5);
        }
      },
      interact: (what) => {
        if (what !== 'breaker') return false;
        day.powerUp = true;
        this.host.setBlackout(false);
        this.bus.emit('world:power', { on: true });
        this.bus.emit('sfx', { id: 'powerup' });
        this.finishEvent('power_outage', true, 'Energia restabelecida. Reinicie o computador.');
        return true;
      },
    };
    return ev;
  }

  private hotLead(): Active {
    const def = this.def!;
    const factory = new CallerFactory(new Rng(hashSeed(this.state.campaign.seed, def.day, 777)));
    const scheme = this.rng.pick(this.calls.activeBaits.length ? this.calls.activeBaits : ['netuno']);
    const profile = factory.special('vip', scheme, def);
    if (def.day >= 5) {
      profile.id = 'vip2';
      profile.name = 'Dra. Lorena Bragança';
      profile.gender = 'f';
      profile.number = '(21) 555-0778';
      profile.extraNotes = ['LEAD QUENTE: filha do Dr. Heitor. Prefere protocolo e dados.'];
    }
    this.calls.addLead(profile);
    const deadline = Math.min(520, this.state.day.clock + 140);
    this.announce('hot_lead', 'Lead quente', `Ligue para ${profile.number} pelo PABX antes das ${clockText(deadline)}.`);
    this.inbox.push(
      'Seu Gervásio (Chefe)',
      'LEAD QUENTE',
      `Liga pro ${profile.name}, ${profile.number}. Cheio da grana. Usa o teclado do PABX. Até as ${clockText(deadline)}. A ficha tá no Arquivo.`,
      'boss',
    );
    const ev: Active = {
      id: 'hot_lead',
      t: 0,
      objective: () => `Ligue para ${profile.number} (PABX) até ${clockText(deadline)}`,
      update: () => {
        const called = this.state.day.calls.some((c) => c.callerId === profile.id);
        const inCall = this.calls.caller?.id === profile.id && this.calls.phase === 'active';
        if (called) {
          this.finishEvent('hot_lead', true, 'Lead quente atendido.');
        } else if (!inCall && this.state.day.clock >= deadline) {
          this.rel('boss', -1);
          this.say('boss', 'Você não ligou pro meu lead?! Eu ia cobrar comissão de você!', 5);
          this.finishEvent('hot_lead', false, 'O lead esfriou.');
        }
      },
    };
    return ev;
  }

  private privateCall(id: 'mystery_call' | 'final_deal', label: string): Active {
    let rang = false;
    let resolved = false;
    const ev: Active = {
      id,
      t: 0,
      objective: () => (rang && !resolved && this.calls.privateRing ? 'Atenda o número privado' : null),
      update: () => {
        if (!rang) {
          rang = this.calls.ringPrivate(id, label);
          return;
        }
        if (resolved || ev.t > 120) this.end(id);
      },
    };
    (ev as Active & { resolve: () => void }).resolve = () => (resolved = true);
    return ev;
  }

  private onNarrativeCall(id: string): void {
    const ev = this.active.find((a) => a.id === id) as (Active & { resolve?: () => void }) | undefined;
    ev?.resolve?.();
    const flags = this.state.campaign.flags;
    const script = id === 'final_deal' ? finalDealScript(flags) : mysteryScript(this.state.day.day, flags);
    this.host.openNarrative(
      script,
      (e) => this.applyEffect(e),
      () => {
        this.calls.endNarrative();
        this.end(id);
      },
    );
  }

  private onNarrativeMissed(id: string): void {
    this.end(id);
    if (id === 'final_deal') {
      this.risk.add(15, 'Você ignorou a última ligação da investigadora.');
      this.inbox.push('Número desconhecido', '(sem assunto)', 'Você não atendeu. Tudo bem. A gente se vê às 18h.', 'warn');
    } else {
      this.inbox.push('Número desconhecido', '(sem assunto)', 'Tentei te ligar. A gente ainda vai conversar.', 'warn');
    }
  }

  private investigation(): Active {
    this.investigationCooldown = 90;
    this.announce('investigation', 'Viatura na frente do prédio', 'Destrua papéis no triturador ou ative o Modo Discreto no PABX.');
    this.say('boss', this.rng.pick(BOSS_LINES.heat2), 5);
    this.bus.emit('sfx', { id: 'siren' });
    const limit = 70;
    const ev: Active = {
      id: 'investigation',
      t: 0,
      objective: () => `Triture os papéis (segure E no triturador) — ${Math.max(0, Math.ceil(limit - ev.t))} s`,
      update: () => {
        if (ev.t >= limit) {
          this.risk.add(8, 'A polícia anotou movimentação suspeita.');
          this.say('boss', 'Ninguém triturou NADA?! Eles tão tirando foto da janela!', 5);
          this.finishEvent('investigation', false, 'A investigação avançou.');
        }
      },
      interact: (what) => {
        if (what === 'lowprofile') {
          this.risk.add(-BALANCE.heat.lowProfileRelief, 'Modo discreto ativado.');
          this.finishEvent('investigation', true, 'Modo discreto: a central ficou em silêncio.');
          return true;
        }
        if (what !== 'shredder') return false;
        this.risk.add(-BALANCE.heat.shredRelief, 'Provas trituradas.');
        this.say('pri', 'Tritura o meu também. E o do Juninho. Ele anota tudo.', 4);
        this.finishEvent('investigation', true, 'Provas destruídas. A exposição caiu.');
        return true;
      },
    };
    return ev;
  }
}
