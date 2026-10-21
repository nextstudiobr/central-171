import { archetypeById } from '../data/archetypes';
import { BALANCE } from '../data/balance';
import { schemeById, SCHEMES } from '../data/schemes';
import type { CallerProfile, CallerSpecial, DayDef } from '../data/types';
import type { Bus } from '../core/events';
import { Rng, hashSeed } from '../core/rng';
import { money } from '../core/util';
import { CallerFactory, SPECIAL_CALLER_ID } from './CallerFactory';
import { Conversation, type DialogueOutcome } from './Dialogue';
import type { Economy } from './Economy';
import type { CallOutcome, CallRecord, GameState } from './GameState';
import type { Risk } from './Risk';

export type CallPhase = 'idle' | 'ringing' | 'active' | 'wrapup';

interface Timer {
  at: number;
  fn: () => void;
}

/**
 * Ciclo das ligações: toque, atendimento, conversa cronometrada, rastreio,
 * desfecho e consequências no dinheiro e no risco.
 */
export class CallSystem {
  phase: CallPhase = 'idle';
  caller: CallerProfile | null = null;
  conversation: Conversation | null = null;
  outbound = false;
  ringTimer = 0;
  gapTimer = 4;
  /** Tempo restante para o jogador responder (s). */
  responseTimer = 0;
  responseMax = 1;
  pauseTimer = 0;
  traceActive = false;
  traceProgress = 0;
  fileViewed = false;
  /** Ligação de número privado que abre um roteiro narrativo. */
  privateRing: { id: string; label: string } | null = null;
  narrativeActive = false;
  /** Impede novos toques (tutorial, fim de expediente, eventos). */
  holdRinging = false;
  closing = false;
  private wrapTimer = 0;
  private def: DayDef | null = null;
  private callIndex = 0;
  private specialPlan = new Map<number, CallerSpecial>();
  private usedNames = new Set<string>();
  private readonly leads = new Map<string, CallerProfile>();
  private nextRecordId = 1;
  private elapsed = 0;
  private timers: Timer[] = [];
  private factory: CallerFactory;
  private rng: Rng;
  activeBaits: string[] = [];

  constructor(
    private readonly state: GameState,
    private readonly economy: Economy,
    private readonly risk: Risk,
    private readonly bus: Bus,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.factory = new CallerFactory(this.rng);
  }

  /** Prepara o expediente: sementes, especiais e iscas ativas. */
  startDay(def: DayDef): void {
    this.def = def;
    this.rng = new Rng(hashSeed(this.state.campaign.seed, def.day, 71));
    this.factory = new CallerFactory(this.rng);
    this.phase = 'idle';
    this.caller = null;
    this.conversation = null;
    this.callIndex = 0;
    this.gapTimer = def.day === 1 ? 2 : 5;
    this.closing = false;
    this.privateRing = null;
    this.narrativeActive = false;
    this.traceActive = false;
    this.traceProgress = 0;
    this.timers = [];
    this.leads.clear();
    this.specialPlan.clear();
    const used = this.state.campaign.usedCallers;
    for (const sp of def.features.specials) {
      const id = SPECIAL_CALLER_ID[sp];
      if (!id || used.includes(id)) continue;
      const slot =
        sp === 'tutorial' ? 0 : sp === 'scambaiter' ? this.rng.int(2, 3) : sp === 'boss_mom' ? this.rng.int(3, 4) : this.rng.int(4, 6);
      let s = slot;
      while (this.specialPlan.has(s)) s++;
      this.specialPlan.set(s, sp);
    }
    if (!this.activeBaits.length) this.activeBaits = this.defaultBaits(def);
    this.activeBaits = this.activeBaits.filter((id) => this.unlockedSchemes().includes(id));
    if (!this.activeBaits.length) this.activeBaits = this.defaultBaits(def);
  }

  unlockedSchemes(): string[] {
    const day = this.def?.day ?? this.state.campaign.day;
    return SCHEMES.filter((s) => s.unlockDay <= day).map((s) => s.id);
  }

  /** Iscas mais recentes ocupam as vagas por padrão. */
  defaultBaits(def: DayDef): string[] {
    return SCHEMES.filter((s) => s.unlockDay <= def.day)
      .sort((a, b) => b.unlockDay - a.unlockDay)
      .slice(0, def.baitSlots)
      .map((s) => s.id);
  }

  setActiveBaits(ids: string[]): void {
    if (!this.def) return;
    const allowed = ids.filter((id) => this.unlockedSchemes().includes(id)).slice(0, this.def.baitSlots);
    if (allowed.length) this.activeBaits = allowed;
  }

  get canRing(): boolean {
    const d = this.state.day;
    return !this.holdRinging && !this.closing && d.networkUp && d.powerUp && !d.finished && !d.lowProfile;
  }

  get busy(): boolean {
    return this.phase === 'active' || this.phase === 'ringing';
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.elapsed);
      this.timers = this.timers.filter((t) => t.at > this.elapsed);
      for (const t of due) t.fn();
    }
    switch (this.phase) {
      case 'idle':
        if (!this.canRing) return;
        this.gapTimer -= dt;
        if (this.gapTimer <= 0) this.ring(this.nextCaller());
        break;
      case 'ringing':
        if (!this.state.day.networkUp || !this.state.day.powerUp) {
          this.phase = 'idle';
          this.gapTimer = 3;
          return;
        }
        this.ringTimer -= dt;
        if (this.ringTimer <= 0) {
          if (this.privateRing) {
            const id = this.privateRing.id;
            this.privateRing = null;
            this.phase = 'idle';
            this.gapTimer = 5;
            this.bus.emit('call:narrativeMissed', { id });
          } else this.miss();
        }
        break;
      case 'active':
        this.updateActive(dt);
        break;
      case 'wrapup':
        this.wrapTimer -= dt;
        if (this.wrapTimer <= 0) {
          this.phase = 'idle';
          const [a, b] = this.def?.callGap ?? [8, 16];
          this.gapTimer = this.rng.range(a, b);
        }
        break;
    }
  }

  private updateActive(dt: number): void {
    if (this.narrativeActive || !this.conversation) return;
    if (this.traceActive) {
      const vpn = this.state.hasUpgrade('vpn') ? BALANCE.upgrades.vpnTraceFactor : 1;
      this.traceProgress += (dt / BALANCE.calls.traceDurationSec) * vpn * this.risk.traceSpeedFactor();
      this.bus.emit('call:trace', { progress: Math.min(1, this.traceProgress), active: true });
      if (this.traceProgress >= 1) {
        this.finish({ outcome: 'traced', amount: 0 });
        return;
      }
    }
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) this.bus.emit('call:back', { line: this.conversation.backLine() });
      return;
    }
    this.responseTimer -= dt;
    if (this.responseTimer <= 0) {
      const t = this.conversation.timeout();
      this.bus.emit('call:timeout', t);
      this.bus.emit('sfx', { id: 'static' });
      if (t.hungUp) this.finish({ outcome: 'hangup', amount: 0 });
      else {
        this.responseTimer = BALANCE.calls.responseGraceSec;
        this.responseMax = this.responseTimer;
      }
    }
  }

  private nextCaller(): CallerProfile {
    const def = this.def!;
    const sp = this.specialPlan.get(this.callIndex);
    const schemeId = this.rng.pick(this.activeBaits);
    this.callIndex++;
    if (sp) {
      const id = SPECIAL_CALLER_ID[sp]!;
      return this.factory.special(id, schemeId, def);
    }
    return this.factory.generate(def, schemeId, this.usedNames);
  }

  /** Coloca uma ligação específica para tocar agora (eventos e colegas). */
  ringNow(profile: CallerProfile): boolean {
    if (this.phase !== 'idle' || !this.state.day.networkUp || !this.state.day.powerUp) return false;
    this.ring(profile);
    return true;
  }

  private ring(profile: CallerProfile): void {
    this.caller = profile;
    this.phase = 'ringing';
    this.ringTimer = BALANCE.calls.ringTimeoutSec;
    this.bus.emit('call:ring', { caller: profile });
  }

  private miss(): void {
    const caller = this.caller!;
    this.record(caller, 'missed', 0);
    this.state.campaign.relationships.boss -= 0.5;
    this.bus.emit('call:missed', { caller });
    this.caller = null;
    this.phase = 'idle';
    this.gapTimer = this.rng.range(4, 8);
  }

  /** Toca um número privado; atender abre um roteiro narrativo. */
  ringPrivate(id: string, label: string): boolean {
    if (this.phase !== 'idle' || !this.state.day.networkUp || !this.state.day.powerUp) return false;
    this.privateRing = { id, label };
    this.caller = null;
    this.phase = 'ringing';
    this.ringTimer = BALANCE.calls.ringTimeoutSec + 8;
    this.bus.emit('call:ringPrivate', { id, label });
    return true;
  }

  /** Encerra a ligação narrativa. */
  endNarrative(): void {
    if (!this.narrativeActive) return;
    this.narrativeActive = false;
    this.phase = 'wrapup';
    this.wrapTimer = 2;
    this.bus.emit('sfx', { id: 'hangup' });
  }

  /** Atende a ligação que está tocando. */
  answer(): boolean {
    if (this.phase === 'ringing' && this.privateRing) {
      const id = this.privateRing.id;
      this.privateRing = null;
      this.phase = 'active';
      this.narrativeActive = true;
      this.bus.emit('sfx', { id: 'pickup' });
      this.bus.emit('call:narrative', { id });
      return true;
    }
    if (this.phase !== 'ringing' || !this.caller) return false;
    this.begin(this.caller, false);
    return true;
  }

  /** Disca um número (ligação de saída para leads quentes). */
  dial(number: string): { ok: boolean; message: string } {
    const clean = number.replace(/\D/g, '');
    if (this.phase === 'active') return { ok: false, message: 'Você já está numa ligação.' };
    if (!this.state.day.networkUp || !this.state.day.powerUp) return { ok: false, message: 'Sem linha. A rede está fora do ar.' };
    for (const [num, profile] of this.leads) {
      if (num.replace(/\D/g, '') === clean) {
        this.leads.delete(num);
        if (this.phase === 'ringing' && this.caller) {
          // A ligação que tocava é perdida: o jogador escolheu discar.
          this.miss();
        }
        this.begin(profile, true);
        return { ok: true, message: `Chamando ${profile.number}...` };
      }
    }
    if (clean.length < 7) return { ok: false, message: 'Número incompleto.' };
    return { ok: false, message: 'A ligação caiu numa pizzaria. Eles não querem jet-ski.' };
  }

  addLead(profile: CallerProfile): void {
    this.leads.set(profile.number, profile);
  }

  hasLead(number: string): boolean {
    return this.leads.has(number);
  }

  /** Leads ainda não discados (aparecem no Arquivo de Casos). */
  leadProfiles(): CallerProfile[] {
    return [...this.leads.values()];
  }

  private begin(profile: CallerProfile, outbound: boolean): void {
    const def = this.def!;
    const arch = archetypeById(profile.archetypeId);
    const scheme = schemeById(profile.schemeId);
    this.caller = profile;
    this.outbound = outbound;
    this.fileViewed = false;
    this.traceActive = false;
    this.traceProgress = 0;
    this.pauseTimer = 0;
    const convRng = new Rng(hashSeed(this.state.campaign.seed, def.day, this.callIndex, profile.id.length, 913));
    this.conversation = new Conversation(profile, arch, scheme, {
      rng: convRng,
      questions: def.features.questions,
      trace: def.features.trace,
      suspicionBonus: def.suspicionBonus + this.risk.level * 4,
      coldRead: this.state.hasUpgrade('coldread'),
      fileViewed: () => this.fileViewed,
      hotListed: () => this.state.campaign.hotList.some((h) => h.number === profile.number),
    });
    if (!this.state.campaign.usedCallers.includes(profile.id) && profile.special !== 'none') {
      this.state.campaign.usedCallers.push(profile.id);
    }
    this.phase = 'active';
    const turn = this.conversation.start();
    this.resetResponse(turn.callerLines);
    this.bus.emit('sfx', { id: 'pickup' });
    this.bus.emit('call:start', { caller: profile, archetype: arch, scheme, turn, outbound });
  }

  /** O jogador escolheu uma resposta. */
  choose(choiceId: string): void {
    const conv = this.conversation;
    if (this.phase !== 'active' || !conv || this.pauseTimer > 0) return;
    const result = conv.choose(choiceId);
    let traceLine: string | null = null;
    if (result.startTrace && !this.traceActive) {
      this.traceActive = true;
      this.traceProgress = 0;
      traceLine = conv.traceLine();
      this.bus.emit('sfx', { id: 'trace' });
    }
    let interject: { line: string; duration: number } | null = null;
    if (!result.outcome && this.rng.chance(conv.archetype.interjectChance)) {
      const [a, b] = BALANCE.calls.interjectPauseSec;
      interject = { line: conv.interjectLine(), duration: this.rng.range(a, b) };
      this.pauseTimer = interject.duration;
    }
    this.bus.emit('call:result', { result, traceLine, interject });
    if (result.outcome) {
      this.finish(this.mapOutcome(result.outcome));
      return;
    }
    const lines = [...result.callerLines, ...(result.next?.callerLines ?? [])];
    this.resetResponse(lines);
  }

  /** O jogador desliga por conta própria. */
  hangUp(): void {
    if (this.phase === 'ringing') {
      if (this.privateRing) return;
      // Recusar a chamada conta como perdida.
      this.miss();
      return;
    }
    if (this.phase !== 'active') return;
    this.finish({ outcome: 'player_hangup', amount: 0 });
  }

  /** O jogador abriu a ficha de alguém no Arquivo de Casos. */
  markFileViewed(callerId: string): void {
    if (this.phase === 'active' && this.caller?.id === callerId && !this.fileViewed) {
      this.fileViewed = true;
      this.bus.emit('call:fileViewed', { callerId });
    }
  }

  /** Derruba a ligação ativa por motivo externo (queda de energia, batida). */
  drop(reason: string): void {
    if (this.narrativeActive) return;
    if (this.phase === 'ringing') {
      if (this.privateRing) {
        const id = this.privateRing.id;
        this.privateRing = null;
        this.bus.emit('call:narrativeMissed', { id });
      }
      this.phase = 'idle';
      this.caller = null;
      this.gapTimer = 6;
      return;
    }
    if (this.phase !== 'active') return;
    this.finish({ outcome: 'hangup', amount: 0 }, reason);
  }

  private resetResponse(lines: string[]): void {
    const chars = lines.reduce((s, l) => s + l.length, 0);
    const reading = Math.min(8, chars * 0.035);
    const headset = this.state.hasUpgrade('headset') ? BALANCE.upgrades.headsetBonusSec : 0;
    const coffee = this.state.day.coffeeCalls > 0 ? BALANCE.upgrades.coffeeBonusSec : 0;
    this.responseTimer = BALANCE.calls.responseTimeSec + headset + coffee + reading;
    this.responseMax = this.responseTimer;
  }

  private mapOutcome(o: DialogueOutcome): { outcome: CallOutcome; amount: number } {
    const kind: CallOutcome =
      o.kind === 'recognized' ? 'boss_mom' : o.kind === 'unmasked' ? 'unmasked' : (o.kind as CallOutcome);
    return { outcome: kind, amount: o.amount };
  }

  private finish(res: { outcome: CallOutcome; amount: number }, reason?: string): void {
    const caller = this.caller!;
    const scheme = schemeById(caller.schemeId);
    const camp = this.state.campaign;
    let outcome = res.outcome;
    let amount = res.amount;
    let headline = '';
    let detail = '';
    let good = false;

    const paidLike = outcome === 'paid' || outcome === 'partial';
    if (paidLike && caller.special === 'investigator') {
      this.economy.payment(amount, `${scheme.chargeName} — ${caller.name}`);
      const reversed = amount;
      this.timers.push({
        at: this.elapsed + 6,
        fn: () => {
          this.economy.reversal(reversed, 'Bloqueio judicial: conta rastreada pela polícia');
          this.bus.emit('notify', { title: 'TRANSFERÊNCIA BLOQUEADA', body: `${money(reversed)} estornados. Era dinheiro marcado.`, tone: 'bad', icon: '🚨' });
          this.bus.emit('sfx', { id: 'alarm' });
        },
      });
      this.risk.add(BALANCE.heat.sting, 'Você aplicou um golpe numa policial disfarçada.');
      camp.flags.stung = true;
      outcome = 'sting';
      headline = `${caller.name} pagou... rápido demais.`;
      detail = 'Era uma operação policial. O dinheiro vai ser bloqueado.';
    } else if (paidLike && caller.special === 'scambaiter') {
      outcome = 'fake_payment';
      amount = 0;
      headline = 'Comprovante recebido: comprovante_pix.exe';
      detail = 'Não caiu dinheiro nenhum. E o arquivo... fez alguma coisa no seu computador.';
      this.bus.emit('trigger', { id: 'pc_virus' });
      camp.flags.ze_baited = true;
    } else if (paidLike && caller.special === 'boss_mom') {
      this.economy.payment(amount, `${scheme.chargeName} — ${caller.name}`);
      const fine = Math.round(amount * 1.5);
      this.timers.push({
        at: this.elapsed + 4,
        fn: () => {
          this.economy.fine(fine, 'Multa: você aplicou golpe na MÃE DO CHEFE');
          this.bus.emit('speech', { who: 'boss', text: 'QUEM FOI QUE LIGOU PRA MINHA MÃE?!', duration: 4 });
          this.bus.emit('sfx', { id: 'boss_yell' });
        },
      });
      camp.relationships.boss -= 3;
      camp.flags.boss_mom_scammed = true;
      outcome = 'boss_mom';
      headline = `${caller.name} pagou ${money(amount)}.`;
      detail = 'O sobrenome "Bastos" não te lembrou ninguém?';
    } else if (paidLike) {
      this.economy.payment(amount, `${scheme.chargeName} — ${caller.name}`);
      good = true;
      headline = `${outcome === 'paid' ? 'Pagamento' : 'Pagamento parcial'}: +${money(amount)}`;
      detail = `${caller.name} transferiu a "${scheme.chargeName.toLowerCase()}".`;
    } else if (outcome === 'reported') {
      this.risk.add(BALANCE.heat.report, `${caller.name} denunciou a ligação.`);
      headline = `${caller.name} vai denunciar a central.`;
      detail = 'A exposição da central aumentou.';
    } else if (outcome === 'traced') {
      this.risk.add(BALANCE.heat.traced, `${caller.name} rastreou a ligação.`);
      headline = 'Ligação RASTREADA!';
      detail = 'Agora alguém sabe de onde a gente liga. Desligue mais cedo quando ouvir o clique.';
      this.bus.emit('sfx', { id: 'alarm' });
    } else if (outcome === 'unmasked') {
      if (caller.special === 'investigator') {
        this.economy.bonus(200, 'Bônus do chefe: farejou a polícia');
        this.risk.add(-10, 'Você escapou de uma armadilha policial.');
        camp.flags.moura_unmasked = true;
        headline = 'Armadilha desarmada!';
        detail = 'Era uma investigadora. O chefe te deu T$ 200 de bônus pela esperteza.';
      } else {
        this.economy.bonus(80, 'Bônus: não caiu no caçador de golpistas');
        camp.flags.ze_unmasked = true;
        headline = 'Caçador de golpistas desmascarado.';
        detail = 'O Zé encerrou a live. Você ganhou T$ 80 de bônus por não virar meme.';
      }
      good = true;
    } else if (outcome === 'boss_mom' && res.amount === 0) {
      this.economy.bonus(150, 'Bônus: protegeu a mãe do chefe');
      camp.relationships.boss += 2;
      camp.flags.boss_mom_saved = true;
      headline = 'Você reconheceu a mãe do chefe.';
      detail = 'O chefe soube e ficou emocionado. T$ 150 de bônus.';
      good = true;
    } else if (outcome === 'refused') {
      headline = `${caller.name} recusou.`;
      detail = 'Nada feito. Tente pedir menos ou ganhar mais confiança antes.';
    } else if (outcome === 'hangup') {
      headline = reason ?? `${caller.name} desligou na sua cara.`;
      detail = reason ? 'A ligação caiu.' : 'A paciência acabou.';
    } else if (outcome === 'player_hangup') {
      headline = 'Você desligou.';
      detail = this.traceActive ? 'Bem a tempo: o rastreio não terminou.' : 'Às vezes é melhor desistir.';
      good = this.traceActive;
    }

    if (this.state.day.coffeeCalls > 0) this.state.day.coffeeCalls--;
    const rec = this.record(caller, outcome, paidLike ? amount : 0);
    this.traceActive = false;
    this.bus.emit('call:trace', { progress: 0, active: false });
    this.bus.emit('sfx', { id: good ? 'cash' : outcome === 'player_hangup' ? 'hangup' : 'fail' });
    this.bus.emit('call:end', { record: rec, headline, detail, good });
    this.conversation = null;
    this.phase = 'wrapup';
    this.wrapTimer = 2.5;
  }

  private record(caller: CallerProfile, outcome: CallOutcome, amount: number): CallRecord {
    const rec: CallRecord = {
      id: this.nextRecordId++,
      day: this.state.day.day,
      clock: this.state.day.clock,
      callerId: caller.id,
      callerName: caller.name,
      number: caller.number,
      schemeId: caller.schemeId,
      special: caller.special,
      outcome,
      amount,
    };
    this.state.day.calls.push(rec);
    return rec;
  }
}
