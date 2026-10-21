import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { archetypeById } from '../data/archetypes';
import { BALANCE } from '../data/balance';
import { LAST_DAY, RANKS, UPGRADES, dayDef } from '../data/days';
import { BOSS_LINES, COWORKER_IDLE, NPC_NAMES, type NarrativeScript, type NpcId } from '../data/npcs';
import type { CallerProfile, DayDef } from '../data/types';
import { createBus, type Bus } from '../core/events';
import { Rng, hashSeed } from '../core/rng';
import { clamp, clockText, lerp, money } from '../core/util';
import { CallSystem } from '../systems/CallSystem';
import { CallerFactory } from '../systems/CallerFactory';
import { Campaign } from '../systems/Campaign';
import { Economy } from '../systems/Economy';
import { EventDirector, type DirectorHost, type Zone } from '../systems/EventDirector';
import { GameState, newDay, type CampaignState } from '../systems/GameState';
import { Inbox } from '../systems/Inbox';
import { Risk, levelOf } from '../systems/Risk';
import { SaveSystem, browserStore } from '../systems/Save';
import { SettingsStore } from '../systems/Settings';
import { Desktop } from '../ui/Desktop';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { Assets } from '../world/Assets';
import { NpcManager } from '../world/Npcs';
import { buildOffice, type OfficeRefs } from '../world/Office';
import { Input, Player } from '../world/Player';
import { Renderer } from '../world/Renderer';

type Mode = 'boot' | 'title' | 'intro' | 'play' | 'paused' | 'dayend' | 'ending';

interface Interactable {
  id: string;
  root: THREE.Object3D;
  maxDist: number;
  label: () => string | null;
  hold?: number;
  use: () => void;
}

const NPC_VOICE: Record<NpcId, { pitch: number; rate: number }> = {
  boss: { pitch: 0.6, rate: 1.15 },
  tonhao: { pitch: 0.7, rate: 1.0 },
  pri: { pitch: 1.15, rate: 1.1 },
  juninho: { pitch: 1.05, rate: 1.3 },
};

/**
 * Orquestra o jogo: mundo 3D, sistemas de jogabilidade, interface, entradas,
 * áudio e o ciclo de expedientes da campanha.
 */
export class Game {
  readonly bus: Bus = createBus();
  readonly settings = new SettingsStore(browserStore());
  readonly save = new SaveSystem(browserStore());
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio: AudioEngine;
  readonly assets = new Assets();
  office!: OfficeRefs;
  player!: Player;
  npcs!: NpcManager;
  hud!: Hud;
  desktop!: Desktop;
  menus!: Menus;
  state: GameState;
  economy!: Economy;
  risk!: Risk;
  calls!: CallSystem;
  inbox!: Inbox;
  director!: EventDirector;
  campaign!: Campaign;
  mode: Mode = 'boot';
  private def: DayDef | null = null;
  private interactables: Interactable[] = [];
  private focusTarget: Interactable | null = null;
  private holdT = 0;
  private raycaster = new THREE.Raycaster();
  private time = 0;
  private timer = new THREE.Timer();
  private objective: string | null = null;
  private tutorialStep = -1;
  private tutorialFlags = { firstChoice: false, question: false, fileViewed: false, messages: false };
  private quotaAnnounced = false;
  private closingAnnounced = false;
  private raidT = -1;
  private stepAccum = 0;
  private screenTimer = 0;
  private boardTimer = 0;
  private lowProfileT = 0;
  private lowProfileCooldown = 0;
  private shredCooldown = 0;
  private coffeeT = 0;
  private chatCooldown = 0;
  private dayProfiles = new Map<string, CallerProfile>();
  private fillerProfiles: CallerProfile[] = [];
  private fps = { frames: 0, acc: 0, value: 0 };
  private perf = { low: 0, high: 0 };
  private titleAngle = 0;
  private lastHeatLevel = 0;
  private uiRoot: HTMLElement;
  private fadeEl: HTMLElement;
  private clickToPlay: HTMLElement;
  private dealEnding = false;
  /** A chegada da polícia combinada com a investigadora (não é uma batida). */
  private dealCinematic = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new Renderer(host);
    this.input = new Input(this.renderer.renderer.domElement);
    this.audio = new AudioEngine(this.settings.values);
    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'ui-root';
    host.appendChild(this.uiRoot);
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'fade';
    host.appendChild(this.fadeEl);
    this.clickToPlay = document.createElement('div');
    this.clickToPlay.className = 'click-to-play interactive hidden';
    this.clickToPlay.textContent = 'Clique aqui para capturar o mouse (ou segure e arraste na tela para olhar)';
    this.clickToPlay.addEventListener('click', () => this.resume());
    this.uiRoot.appendChild(this.clickToPlay);
    this.state = Campaign.fresh(Date.now() % 100000);
    this.timer.connect(document);
  }

  // =================================================================== boot

  async boot(): Promise<void> {
    this.menus = new Menus(this.uiRoot, this.settings, () => this.audio.hasTts, (id) => this.sfx(id));
    this.menus.loading(0, 'Ligando os computadores...');
    await this.assets.load(this.renderer.renderer, (p, label) => this.menus.loading(p * 0.9, label));
    this.menus.loading(0.95, 'Montando o escritório...');
    await new Promise((r) => setTimeout(r, 30));
    this.office = buildOffice(this.assets);
    this.renderer.attach(this.office.scene);
    this.player = new Player(this.renderer.camera, this.office.collision);
    this.npcs = new NpcManager(this.office.scene, this.office.collision, new Rng(7));
    this.npcs.onSay = (id, text) => this.bus.emit('speech', { who: id, text, duration: 4 });
    this.hud = new Hud(this.uiRoot);
    this.hud.setVisible(false);
    this.buildSystems(this.state);
    this.desktop = new Desktop(this.uiRoot, {
      state: this.state,
      calls: this.calls,
      inbox: this.inbox,
      settings: this.settings,
      bus: this.bus,
      commands: this.desktopCommands(),
      ttsAvailable: () => this.audio.hasTts,
    });
    this.desktop.onOpenApp = (id) => {
      if (id === 'msg') this.tutorialFlags.messages = true;
    };
    this.registerInteractables();
    this.wireBus();
    this.wireDom();
    this.applySettings();
    this.settings.onChange(() => this.applySettings());
    if (this.assets.failures.length) console.warn('[Game] assets substituídos por versões procedurais:', this.assets.failures);
    // Compila os shaders antes do primeiro quadro para evitar travadas.
    this.renderer.renderer.compile(this.office.scene, this.renderer.camera);
    this.showTitle();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /**
   * Cria os sistemas uma única vez. O contêiner de estado é sempre o mesmo
   * objeto; trocar de campanha troca apenas o conteúdo dele.
   */
  private buildSystems(state: GameState): void {
    this.economy = new Economy(state, (e) => this.bus.emit('money', e));
    this.risk = new Risk(
      state,
      (c) => this.bus.emit('heat', c),
      () => this.bus.emit('raid', { day: state.day.day }),
    );
    this.calls = new CallSystem(state, this.economy, this.risk, this.bus, state.campaign.seed);
    this.inbox = new Inbox(state, this.bus);
    this.director = new EventDirector(state, this.economy, this.risk, this.calls, this.inbox, this.bus, this.directorHost());
    this.campaign = new Campaign(state, this.economy);
  }

  private applySettings(): void {
    const s = this.settings.values;
    this.player.sensitivity = s.mouseSensitivity;
    this.player.invertY = s.invertY;
    this.player.bobEnabled = !s.reduceEffects;
    this.renderer.setEffects(!s.reduceEffects);
    this.renderer.setFov(s.fov);
    document.body.classList.toggle('reduce-motion', s.reduceEffects);
    this.audio.applySettings(s);
    if (this.player.isSeated) this.reframeSeat();
  }

  // =================================================================== DOM e entrada

  private wireDom(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      if (this.player.isSeated) this.reframeSeat();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked) {
        this.clickToPlay.classList.add('hidden');
        return;
      }
      if (this.mode === 'play' && this.player.mode === 'walk' && !this.menus.narrativeOpen) this.pause();
    });
    this.renderer.renderer.domElement.addEventListener('mousedown', (e) => {
      this.audio.unlock();
      if (this.mode !== 'play') return;
      if (this.player.mode === 'walk') {
        if (!this.input.locked) {
          void this.input.lock();
          return;
        }
        if (e.button === 0 && this.focusTarget && !this.focusTarget.hold) this.focusTarget.use();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.mode === 'paused') {
        this.resume();
        return;
      }
      if (this.mode === 'play' && (this.player.isSeated || !this.input.locked) && !this.menus.narrativeOpen) this.pause();
    });
    window.addEventListener('click', () => this.audio.unlock(), { once: true });
  }

  private pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.input.unlock();
    this.audio.stopSpeech();
    this.audio.stopRing();
    this.menus.pause({
      day: this.state.day.day,
      onResume: () => this.resume(),
      onSettings: () => this.menus.settingsScreen(() => this.pauseMenuAgain()),
      onQuit: () => {
        this.menus.close();
        this.leaveToTitle();
      },
    });
  }

  private pauseMenuAgain(): void {
    this.mode = 'play';
    this.pause();
  }

  private resume(): void {
    this.menus.close();
    this.mode = 'play';
    if (this.calls.phase === 'ringing') this.audio.startRing(this.phonePos());
    this.clickToPlay.classList.add('hidden');
    if (this.player.mode === 'walk') {
      void this.input.lock().then((ok) => {
        if (!ok) this.clickToPlay.classList.remove('hidden');
      });
    }
  }

  // =================================================================== telas

  private showTitle(): void {
    this.mode = 'title';
    this.hud.setVisible(false);
    this.desktop.show(false);
    this.npcs.reset();
    this.audio.stopRing();
    const saved = this.save.load();
    this.menus.title({
      hasSave: !!saved,
      saveDay: saved?.day,
      onNew: () => {
        this.audio.unlock();
        this.audio.startHoldMusic();
        this.newCampaign();
      },
      onContinue: () => {
        this.audio.unlock();
        const c = this.save.load();
        if (c) this.loadCampaign(c);
        else this.newCampaign();
      },
      onSettings: () => this.menus.settingsScreen(() => this.showTitle()),
      onCredits: () => this.menus.credits(() => this.showTitle()),
    });
    window.setTimeout(() => {
      this.audio.unlock();
      this.audio.startHoldMusic();
    }, 0);
  }

  private newCampaign(): void {
    this.save.clear();
    const st = Campaign.fresh((Date.now() ^ 0x5f3759df) % 1000000);
    this.useState(st);
    this.showDayIntro();
  }

  private loadCampaign(c: CampaignState): void {
    const st = new GameState(c, newDay(c.day, dayDef(c.day).quota));
    this.useState(st);
    this.showDayIntro();
  }

  private useState(st: GameState): void {
    this.state.campaign = st.campaign;
    this.state.day = st.day;
    this.calls.activeBaits = [];
  }

  private showDayIntro(): void {
    this.mode = 'intro';
    this.hud.setVisible(false);
    this.desktop.show(false);
    const def = dayDef(this.state.campaign.day);
    this.menus.dayIntro(def, this.state.campaign, () => {
      this.menus.close();
      this.beginDay();
    });
  }

  private beginDay(): void {
    this.audio.unlock();
    this.audio.stopHoldMusic();
    this.audio.startAmbience();
    const def = this.campaign.beginDay();
    this.def = def;
    this.save.save(this.state.campaign);
    this.dayProfiles.clear();
    this.buildFiller(def);
    this.calls.startDay(def);
    this.inbox.reset();
    this.director.startDay(def);
    this.npcs.reset();
    this.desktop.reset();
    this.hud.clearBubbles();
    this.player.spawn(7.6, 6.4, Math.PI * 0.28);
    this.quotaAnnounced = false;
    this.closingAnnounced = false;
    this.raidT = -1;
    this.lowProfileT = 0;
    this.lowProfileCooldown = 0;
    this.shredCooldown = 0;
    this.dealEnding = false;
    this.dealCinematic = false;
    this.lastHeatLevel = levelOf(this.state.campaign.heat);
    this.tutorialFlags = { firstChoice: false, question: false, fileViewed: false, messages: false };
    this.tutorialStep = def.day === 1 && !this.settings.values.skipTutorial ? 0 : -1;
    this.calls.holdRinging = this.tutorialStep >= 0;
    this.hud.setVisible(true);
    this.mode = 'play';
    this.fade(false);
    void this.input.lock().then((ok) => {
      if (!ok) this.clickToPlay.classList.remove('hidden');
    });
    this.hud.banner(`Dia ${def.day} — ${def.weekday}`, `Meta: ${money(def.quota)}`, 'info');
    this.updateDesk();
  }

  /** Fichas de gente que não ligou hoje: o arquivo precisa ser uma busca de verdade. */
  private buildFiller(def: DayDef): void {
    const factory = new CallerFactory(new Rng(hashSeed(this.state.campaign.seed, def.day, 5150)));
    const used = new Set<string>();
    this.fillerProfiles = Array.from({ length: 10 }, () => factory.generate(def, 'netuno', used));
  }

  private finishDay(raided: boolean): void {
    if (this.mode !== 'play') return;
    this.mode = 'dayend';
    this.input.unlock();
    this.audio.stopRing();
    this.audio.stopSpeech();
    this.director.stopAll();
    this.state.day.finished = true;
    if (this.player.isSeated) this.player.stand();
    this.desktop.show(false);
    this.hud.setVisible(false);
    this.hud.setPrompt(null);
    this.hud.clearTransient();
    this.office.lights.police.forEach((l) => (l.intensity = 0));
    this.renderer.alarm = 0;
    this.npcs.panic = false;
    const result = this.campaign.evaluateDay(raided);
    this.sfx(result.stats.result === 'met' || result.stats.result === 'excellent' ? 'success' : 'strike');
    this.menus.dayEnd(result, this.state.campaign, {
      ending: !!result.ending,
      onBuy: (id) => this.buy(id),
      onNext: () => {
        if (result.ending) {
          this.save.clear();
          this.mode = 'ending';
          this.menus.ending(result.ending, this.state.campaign, () => this.leaveToTitle(), () => this.menus.credits(() => this.leaveToTitle()));
          return;
        }
        this.campaign.advance();
        this.save.save(this.state.campaign);
        this.showDayIntro();
      },
    });
  }

  private leaveToTitle(): void {
    this.director.stopAll();
    this.audio.stopRing();
    this.audio.stopSpeech();
    this.desktop.show(false);
    if (this.player.isSeated) this.player.stand();
    this.showTitle();
  }

  private fade(on: boolean): void {
    this.fadeEl.classList.toggle('on', on);
  }

  // =================================================================== comandos

  private buy(id: string): boolean {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || this.state.hasUpgrade(id)) return false;
    if (!this.economy.purchase(u.cost, `Almoxarifado: ${u.name}`)) return false;
    this.state.campaign.upgrades.push(id);
    this.sfx('cash');
    return true;
  }

  private desktopCommands() {
    return {
      answer: () => this.answerPhone(),
      choose: (id: string) => {
        this.calls.choose(id);
        this.tutorialFlags.firstChoice = true;
      },
      hangUp: () => this.calls.hangUp(),
      dial: (n: string) => this.calls.dial(n),
      search: (q: string) => this.searchFiles(q),
      fileOpened: (id: string) => {
        this.calls.markFileViewed(id);
        if (this.calls.caller?.id === id) this.tutorialFlags.fileViewed = true;
      },
      setBaits: (ids: string[]) => this.calls.setActiveBaits(ids),
      lowProfile: () => this.toggleLowProfile(),
      inboxAction: (m: number, a: string) => this.inbox.act(m, a),
      buy: (id: string) => this.buy(id),
      cleanVirus: () => {
        if (!this.state.day.pcInfected) return;
        this.state.day.pcInfected = false;
        this.bus.emit('notify', { title: 'Computador limpo', body: 'O Arquivo de Casos voltou a funcionar.', tone: 'good', icon: '🛡️' });
        this.desktop.refresh();
      },
      reboot: () => {
        if (!this.state.day.powerUp) return;
        this.state.day.pcCrashed = false;
        this.desktop.refresh();
      },
      standUp: () => this.standUp(),
      speak: (text: string, p: CallerProfile | null) => {
        if (!p) return this.audio.speak(text, { pitch: 0.8, rate: 1 });
        const v = archetypeById(p.archetypeId).voice;
        const pitch = v.pitch * (p.gender === 'f' ? 1.35 : 0.95);
        return this.audio.speak(text, { pitch, rate: v.rate });
      },
      sfx: (id: string) => this.sfx(id),
    };
  }

  private searchFiles(q: string): CallerProfile[] {
    const all = new Map<string, CallerProfile>();
    for (const p of this.fillerProfiles) all.set(p.id, p);
    for (const p of this.dayProfiles.values()) all.set(p.id, p);
    for (const p of this.calls.leadProfiles()) all.set(p.id, p);
    if (this.calls.caller) all.set(this.calls.caller.id, this.calls.caller);
    const list = [...all.values()];
    const query = q.trim().toLowerCase();
    if (!query) return list;
    const digits = query.replace(/\D/g, '');
    return list.filter((p) => p.name.toLowerCase().includes(query) || p.id === q || (digits.length >= 3 && p.number.replace(/\D/g, '').includes(digits)));
  }

  private toggleLowProfile(): string {
    if (this.lowProfileCooldown > 0) return `O Modo discreto precisa esfriar (${Math.ceil(this.lowProfileCooldown)} s).`;
    if (this.calls.phase === 'active') return 'Termine a ligação antes de silenciar a central.';
    this.state.day.lowProfile = true;
    this.lowProfileT = 60;
    this.lowProfileCooldown = 150;
    this.director.interact('lowprofile');
    this.bus.emit('notify', { title: 'Modo discreto', body: 'Nenhuma ligação por 60 s. A exposição cai mais rápido.', tone: 'info', icon: '🤫' });
    return 'Central em silêncio por 60 segundos.';
  }

  private answerPhone(): void {
    if (this.calls.phase !== 'ringing') return;
    if (!this.player.isSeated) this.sitDown();
    this.calls.answer();
  }

  private sitDown(): void {
    if (this.player.isSeated || this.player.inTransition) return;
    const { seat, look } = this.seatPose();
    this.player.sit(seat, look, this.office.spots.seat);
    this.input.unlock();
    this.hud.setWalking(false);
    this.sfx('whoosh');
  }

  private standUp(): void {
    if (!this.player.isSeated) return;
    if (this.calls.phase === 'active') {
      this.bus.emit('notify', { title: 'Você está numa ligação', body: 'Desligue antes de levantar.', tone: 'warn', icon: '🎧' });
      return;
    }
    this.desktop.show(false);
    this.player.stand();
    this.hud.setWalking(true);
    void this.input.lock().then((ok) => {
      if (!ok) this.clickToPlay.classList.remove('hidden');
    });
  }

  /** Posição da câmera sentada que enquadra o monitor inteiro. */
  private seatPose(): { seat: THREE.Vector3; look: THREE.Vector3 } {
    const s = this.office.screen;
    const cam = this.renderer.camera;
    const vHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const distV = s.height / 2 / vHalf / 0.8;
    const distH = s.width / 2 / (vHalf * cam.aspect) / 0.94;
    const dist = Math.max(distV, distH);
    // A câmera sobe em paralelo ao monitor (sem inclinar): a tela desce na imagem,
    // libera o topo para o HUD e continua sem distorção de perspectiva.
    const lift = new THREE.Vector3(0, s.height * 0.1, 0);
    const seat = s.center.clone().addScaledVector(s.normal, dist).add(lift);
    const look = s.center.clone().add(lift);
    return { seat, look };
  }

  private reframeSeat(): void {
    const { seat, look } = this.seatPose();
    this.player.reframe(seat, look);
    this.renderer.camera.position.copy(seat);
    this.renderer.camera.lookAt(look);
    this.renderer.camera.updateMatrixWorld();
    this.placeDesktop();
  }

  /** Alinha o desktop HTML exatamente sobre a tela 3D projetada. */
  private placeDesktop(): void {
    const s = this.office.screen;
    const cam = this.renderer.camera;
    cam.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const tl = s.center.clone().addScaledVector(right, -s.width / 2).addScaledVector(up, s.height / 2).project(cam);
    const tr = s.center.clone().addScaledVector(right, s.width / 2).addScaledVector(up, s.height / 2).project(cam);
    const w = this.host.clientWidth;
    const hgt = this.host.clientHeight;
    const x0 = ((tl.x + 1) / 2) * w;
    const y0 = ((1 - tl.y) / 2) * hgt;
    const x1 = ((tr.x + 1) / 2) * w;
    this.desktop.setRect(x0, y0, x1 - x0);
  }

  // =================================================================== interações

  private registerInteractables(): void {
    const t = this.office.targets;
    const tag = (o: THREE.Object3D, id: string) => o.traverse((c) => (c.userData.interact = id));
    const add = (i: Interactable) => {
      tag(i.root, i.id);
      this.interactables.push(i);
    };
    const deskLabel = () => {
      if (this.player.isSeated) return null;
      if (this.calls.phase === 'ringing') return 'Atender o telefone';
      return 'Sentar e usar o computador';
    };
    const deskUse = () => {
      if (this.calls.phase === 'ringing') this.answerPhone();
      else this.sitDown();
    };
    add({ id: 'chair', root: t.chair, maxDist: 2.2, label: deskLabel, use: deskUse });
    add({ id: 'monitor', root: t.monitor, maxDist: 2.4, label: deskLabel, use: deskUse });
    add({ id: 'phone', root: t.phone, maxDist: 2.4, label: deskLabel, use: deskUse });
    add({
      id: 'coffee',
      root: t.coffee,
      maxDist: 2.2,
      hold: 1.6,
      label: () => (this.state.day.coffeeCalls > 0 ? 'Você já está elétrico de café' : 'Tomar um café (+tempo para responder)'),
      use: () => {
        if (this.state.day.coffeeCalls > 0) return;
        this.state.day.coffeeCalls = this.state.hasUpgrade('gourmet') ? BALANCE.upgrades.coffeeCallsGourmet : BALANCE.upgrades.coffeeCalls;
        this.sfx('coffee', this.office.spots.coffee);
        this.bus.emit('notify', { title: 'Café tomado', body: `Mais tempo para responder nas próximas ${this.state.day.coffeeCalls} ligações.`, tone: 'good', icon: '☕' });
      },
    });
    add({
      id: 'rack',
      root: t.rack,
      maxDist: 2.4,
      hold: 2.5,
      label: () => (this.director.isActive('network_down') ? 'Reiniciar o roteador' : null),
      use: () => this.director.interact('rack'),
    });
    add({
      id: 'breaker',
      root: t.breaker,
      maxDist: 2.4,
      label: () => (this.director.isActive('power_outage') ? 'Religar o disjuntor' : null),
      use: () => {
        if (this.director.interact('breaker')) {
          this.office.breakerLever.rotation.z = 0.6;
          this.sfx('door', this.office.spots.breaker);
        }
      },
    });
    add({
      id: 'shredder',
      root: t.shredder,
      maxDist: 2.2,
      hold: 3,
      label: () => (this.director.isActive('investigation') ? 'Triturar as provas' : this.shredCooldown > 0 ? null : 'Triturar rascunhos (reduz um pouco a exposição)'),
      use: () => {
        this.sfx('shred', this.office.spots.shredder);
        if (!this.director.interact('shredder')) {
          this.risk.add(-4, 'Rascunhos triturados.');
          this.shredCooldown = 60;
          this.bus.emit('notify', { title: 'Papéis triturados', body: 'A exposição caiu um pouco.', tone: 'info', icon: '🗑️' });
        }
      },
    });
    add({
      id: 'door',
      root: t.door,
      maxDist: 2.6,
      label: () => {
        const d = this.state.day;
        if (d.collected >= d.quota || d.clock >= 480) return 'Encerrar o expediente e ir embora';
        return 'Saída (só depois das 17:00 ou com a meta batida)';
      },
      use: () => {
        const d = this.state.day;
        if (!(d.collected >= d.quota || d.clock >= 480)) {
          this.bus.emit('speech', { who: 'boss', text: 'Aonde você pensa que vai? A meta não se bate sozinha!' });
          return;
        }
        if (this.calls.phase === 'active') return;
        this.input.unlock();
        this.mode = 'paused';
        this.menus.confirm(
          d.collected >= d.quota ? 'Meta batida. Encerrar o expediente agora?' : `Ainda faltam ${money(d.quota - d.collected)}. Ir embora mesmo assim vai gerar uma advertência. Encerrar?`,
          () => {
            this.menus.close();
            this.mode = 'play';
            this.finishDay(false);
          },
          () => this.resume(),
        );
      },
    });
    add({
      id: 'whiteboard',
      root: t.whiteboard,
      maxDist: 4,
      label: () => 'Ver o ranking do dia',
      use: () => {
        const r = this.ranking().sort((a, b) => b.value - a.value);
        this.bus.emit('notify', { title: 'Ranking do dia', body: r.map((e, i) => `${i + 1}. ${e.name}: ${money(e.value)}`).join(' · '), tone: 'info', icon: '📋' });
      },
    });
    add({
      id: 'tv',
      root: t.tv,
      maxDist: 5,
      label: () => 'Assistir às notícias',
      use: () => {
        const n = this.news();
        this.bus.emit('notify', { title: 'TV: ' + (n.alert ? 'URGENTE' : 'Ao vivo'), body: n.headline, tone: n.alert ? 'warn' : 'info', icon: '📺' });
      },
    });
    add({
      id: 'safe',
      root: t.safe,
      maxDist: 2.4,
      label: () => `Cofre da operação: ${money(this.state.campaign.operationBalance)}`,
      use: () => this.bus.emit('speech', { who: 'boss', text: 'TIRA A MÃO DO MEU COFRE!' }),
    });
    for (const id of ['boss', 'tonhao', 'pri', 'juninho'] as NpcId[]) {
      const agent = this.npcs.agents[id];
      add({
        id: `npc:${id}`,
        root: agent.char.root,
        maxDist: 2.6,
        label: () => {
          const ev = id === 'tonhao' ? 'coworker_help' : id === 'juninho' ? 'juninho_help' : '';
          if (ev && this.director.isActive(ev)) return `Falar com ${NPC_NAMES[id]}`;
          return this.chatCooldown > 0 ? null : `Conversar com ${NPC_NAMES[id]}`;
        },
        use: () => {
          if (this.director.interact(`npc:${id}`)) return;
          if (this.chatCooldown > 0) return;
          this.chatCooldown = 4;
          const line = id === 'boss' ? new Rng(Date.now()).pick(BOSS_LINES.patrol) : new Rng(Date.now()).pick(COWORKER_IDLE[id]);
          this.bus.emit('speech', { who: id, text: line });
        },
      });
    }
  }

  private updateInteraction(dt: number): void {
    if (this.player.mode !== 'walk' || this.mode !== 'play' || this.menus.narrativeOpen) {
      this.focusTarget = null;
      this.hud.setPrompt(null);
      return;
    }
    const cam = this.renderer.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    this.raycaster.far = 6;
    const roots = this.interactables.map((i) => i.root);
    const hits = this.raycaster.intersectObjects(roots, true);
    let found: Interactable | null = null;
    for (const hit of hits) {
      const id = hit.object.userData.interact as string | undefined;
      if (!id) continue;
      const it = this.interactables.find((i) => i.id === id);
      if (it && hit.distance <= it.maxDist && it.label()) found = it;
      break;
    }
    if (found !== this.focusTarget) this.holdT = 0;
    this.focusTarget = found;
    if (!found) {
      this.hud.setPrompt(null);
      return;
    }
    const label = found.label()!;
    if (found.hold) {
      if (this.input.down.has('KeyE')) {
        this.holdT += dt;
        if (this.holdT >= found.hold) {
          this.holdT = 0;
          found.use();
        }
      } else this.holdT = 0;
      this.hud.setPrompt(this.holdT > 0 ? `${label}...` : `Segure: ${label}`, this.holdT / found.hold);
    } else {
      this.hud.setPrompt(label);
      if (this.input.consume('KeyE')) found.use();
    }
  }

  // =================================================================== eventos do jogo

  private wireBus(): void {
    const b = this.bus;
    b.on('sfx', ({ id, volume }) => {
      const phoneIds = ['pickup', 'hangup', 'trace', 'static'];
      this.sfx(id, phoneIds.includes(id) ? this.phonePos() : undefined, volume);
    });
    b.on('notify', (n) => this.hud.toast(n.title, n.body, n.tone, n.icon));
    b.on('money', (e) => {
      if (e.entry.kind === 'payment' || e.entry.kind === 'fine' || e.entry.kind === 'reversal') this.hud.moneyPop(e.entry.amount);
      if (e.entry.kind === 'bonus') this.hud.toast('Bônus', `${e.entry.note}: +${money(e.entry.amount)}`, 'good', '💰');
      if (e.entry.kind === 'fine') this.hud.toast('Multa', `${e.entry.note}: ${money(e.entry.amount)}`, 'bad', '💸');
      if (!this.quotaAnnounced && e.collected >= e.quota && this.mode === 'play') {
        this.quotaAnnounced = true;
        this.hud.banner('Meta batida!', 'Continue faturando ou vá embora pela porta de SAÍDA.', 'good');
        this.sfx('success');
        this.bus.emit('speech', { who: 'boss', text: new Rng(e.entry.id).pick(BOSS_LINES.quotaMet) });
      }
    });
    b.on('heat', (h) => {
      if (h.level > this.lastHeatLevel) {
        const msgs = ['', 'O bairro começou a comentar sobre a central.', 'A polícia está investigando a Disk Fortuna.', 'CERCO! A batida pode acontecer a qualquer momento.'];
        this.hud.toast(`Exposição: ${['Discreto', 'Burburinho', 'Investigação', 'Cerco'][h.level]}`, `${h.reason} ${msgs[h.level]}`, h.level >= 2 ? 'bad' : 'warn', '🚨');
        if (!this.settings.values.reduceEffects) this.player.addShake(0.4);
      }
      this.lastHeatLevel = h.level;
    });
    b.on('raid', () => this.startRaid());
    b.on('call:ring', ({ caller }) => {
      this.dayProfiles.set(caller.id, caller);
      this.audio.startRing(this.phonePos());
      if (!this.player.isSeated) this.hud.toast('Telefone tocando', `${caller.name} está ligando. Volte à sua mesa!`, 'warn', '☎️');
    });
    b.on('call:ringPrivate', () => {
      this.audio.startRing(this.phonePos());
      if (!this.player.isSeated) this.hud.toast('Telefone tocando', 'Número privado.', 'warn', '☎️');
    });
    b.on('call:start', ({ caller }) => {
      this.dayProfiles.set(caller.id, caller);
      this.audio.stopRing();
      this.audio.stopSpeech();
    });
    b.on('call:narrative', () => this.audio.stopRing());
    b.on('call:narrativeMissed', () => this.audio.stopRing());
    b.on('call:missed', () => {
      this.audio.stopRing();
      this.hud.toast('Ligação perdida', 'O chefe anotou.', 'bad', '📵');
      this.bus.emit('speech', { who: 'boss', text: new Rng(Date.now()).pick(BOSS_LINES.missedCall) });
    });
    b.on('call:end', (e) => {
      // A última fala (ex.: "Prontinho, transferi!") termina de tocar.
      this.audio.stopRing();
      this.hud.toast(e.headline, e.detail, e.good ? 'good' : 'bad', e.good ? '💰' : '📞');
      if (this.tutorialStep >= 3 && this.tutorialStep < 7) this.tutorialStep = 7;
    });
    b.on('call:result', (e) => {
      if (e.result.next?.stageTitle === 'Verificação') this.tutorialFlags.question = true;
    });
    b.on('speech', ({ who, text, duration }) => {
      if (!(who in this.npcs.agents)) return;
      const id = who as NpcId;
      const agent = this.npcs.agents[id];
      agent.char.talking = Math.min(4, text.length * 0.05);
      if (id === 'boss' && /!/.test(text)) agent.act('yell', 2.5);
      this.hud.say(NPC_NAMES[id], text, () => agent.headPosition, duration ?? 4, id === 'boss');
      this.audio.babble(text, NPC_VOICE[id], agent.headPosition, 0.7);
    });
    b.on('event:start', (e) => {
      this.hud.banner(e.title, e.description, 'bad');
      if (this.player.isSeated) this.desktop.refresh();
    });
    b.on('event:end', (e) => this.hud.toast(e.success ? 'Resolvido' : 'Falhou', e.summary, e.success ? 'good' : 'bad', e.success ? '✅' : '❌'));
    b.on('inbox', ({ message }) => {
      if (!this.player.isSeated && this.mode === 'play') this.hud.toast(`Mensagem: ${message.from}`, message.subject, message.tone === 'boss' ? 'boss' : 'info', '💬');
    });
    b.on('world:power', ({ on }) => this.audio.setBlackout(!on));
  }

  private startRaid(): void {
    if (this.raidT >= 0 || this.mode !== 'play') return;
    this.raidT = 0;
    this.calls.drop('A polícia entrou!');
    this.calls.closing = true;
    this.director.stopAll();
    this.npcs.panic = true;
    this.hud.banner('BATIDA POLICIAL!', 'A exposição chegou ao limite. A polícia está subindo as escadas.', 'bad');
    this.sfx('siren');
    this.sfx('alarm');
    if (!this.settings.values.reduceEffects) this.player.addShake(1);
    this.bus.emit('speech', { who: 'boss', text: 'TODO MUNDO PRO ELEVADOR! NÃO, PRA ESCADA! NÃO, PRO COFRE!' });
  }

  private sfx(id: string, pos?: THREE.Vector3 | { x: number; y: number; z: number }, volume = 1): void {
    this.audio.play(id, pos, volume);
  }

  private phonePos(): THREE.Vector3 {
    const v = new THREE.Vector3();
    this.office.phone.root.getWorldPosition(v);
    return v;
  }

  // =================================================================== host do diretor

  private directorHost(): DirectorHost {
    const zones: Record<Zone, () => boolean> = {
      boss_office: () => {
        const p = this.player.position;
        return p.x > 4.6 && p.z < -2.6;
      },
      desk: () => this.player.position.distanceTo(this.office.spots.seat) < 1.6 || this.player.isSeated,
      rack: () => this.player.position.distanceTo(this.office.spots.rack) < 1.8,
      breaker: () => this.player.position.distanceTo(this.office.spots.breaker) < 1.8,
      shredder: () => this.player.position.distanceTo(this.office.spots.shredder) < 1.8,
    };
    return {
      npcVisitPlayer: (id) => this.npcs.visitPlayer(id),
      npcGoTo: (id, spot) => this.npcs.goTo(id, spot),
      npcReturn: (id) => this.npcs.release(id),
      npcArrived: (id) => this.npcs.arrived(id),
      setPolice: () => {},
      setBlackout: (on) => this.setBlackout(on),
      setNetworkLeds: () => {},
      playerInZone: (z) => zones[z](),
      playerSeated: () => this.player.isSeated,
      openNarrative: (script, onEffect, onClose) => this.openNarrative(script, onEffect, onClose),
      narrativeOpen: () => this.menus.narrativeOpen,
      setObjective: (text) => (this.objective = text),
    };
  }

  private openNarrative(script: NarrativeScript, onEffect: (e: string) => void, onClose: () => void): void {
    this.input.unlock();
    this.menus.narrative(
      script,
      (text, who) => {
        if (who === 'mystery') this.audio.speak(text, { pitch: 0.9, rate: 0.95 });
        else if (who in NPC_VOICE) this.audio.babble(text, NPC_VOICE[who as NpcId], undefined, 0.8);
      },
      onEffect,
      () => {
        this.audio.stopSpeech();
        onClose();
        if (this.mode === 'play' && this.player.mode === 'walk') {
          void this.input.lock().then((ok) => {
            if (!ok) this.clickToPlay.classList.remove('hidden');
          });
        }
      },
    );
  }

  private setBlackout(on: boolean): void {
    const L = this.office.lights;
    for (const l of L.ceiling) l.visible = !on;
    L.panels.emissiveIntensity = on ? 0 : 1.3;
    L.deskLamp.visible = !on;
    L.monitorGlow.visible = !on;
    for (const m of this.office.emissiveScreens) m.emissiveIntensity = on ? 0 : 1;
    if (!on) this.office.breakerLever.rotation.z = 0;
    else this.office.breakerLever.rotation.z = -0.6;
  }

  // =================================================================== laço principal

  private frame(t: number): void {
    if (this.renderer.syncSize() && this.player?.isSeated) this.reframeSeat();
    this.timer.update(t);
    const dt = Math.min(0.05, this.timer.getDelta());
    this.time += dt;
    this.fps.frames++;
    this.fps.acc += dt;
    if (this.fps.acc >= 1) {
      this.fps.value = this.fps.frames / this.fps.acc;
      this.fps.frames = 0;
      this.fps.acc = 0;
      this.adaptResolution();
    }
    try {
      this.update(dt);
    } catch (err) {
      console.error('[Game] erro no quadro', err);
    }
    this.renderer.render(this.time);
    this.input.endFrame();
  }

  /** Resolução adaptativa: abaixa quando o FPS cai e volta quando sobra folga. */
  private adaptResolution(): void {
    const f = this.fps.value;
    if (document.visibilityState !== 'visible') return;
    if (f < 50) {
      this.perf.low++;
      this.perf.high = 0;
    } else if (f > 58) {
      this.perf.high++;
      this.perf.low = 0;
    } else {
      this.perf.low = 0;
      this.perf.high = 0;
    }
    if (this.perf.low >= 2 && this.renderer.scale > 0.6) {
      this.renderer.setScale(this.renderer.scale - 0.1);
      this.perf.low = 0;
    } else if (this.perf.high >= 5 && this.renderer.scale < 1) {
      this.renderer.setScale(this.renderer.scale + 0.1);
      this.perf.high = 0;
    }
  }

  private update(dt: number): void {
    const playing = this.mode === 'play';
    if (this.mode === 'title' || this.mode === 'intro' || this.mode === 'boot') {
      this.titleCamera(dt);
      this.npcs.update(dt, new THREE.Vector3(0, 0, 3), false);
      this.updateWorld(dt);
      return;
    }
    if (this.mode === 'dayend' || this.mode === 'ending' || this.mode === 'paused') {
      this.updateWorld(dt * (this.mode === 'paused' ? 0 : 1));
      if (this.player.isSeated) this.placeDesktop();
      return;
    }
    if (!playing) return;

    // Relógio do expediente (parado durante conversas narrativas).
    const def = this.def!;
    const narrative = this.menus.narrativeOpen;
    if (!narrative && this.raidT < 0) {
      const minutesPerSec = 540 / def.durationSec;
      const gameMinutes = dt * minutesPerSec;
      this.state.day.clock = Math.min(540, this.state.day.clock + gameMinutes);
      this.risk.update(gameMinutes);
      this.calls.update(dt);
      this.director.update(dt);
    }
    this.updateTimers(dt);
    this.updateInput();
    this.player.update(dt, this.input);
    // O desktop aparece quando a transição termina, qualquer que seja o FPS.
    if (this.player.isSeated && !this.desktop.visible) {
      this.reframeSeat();
      this.desktop.show(true);
    }
    this.npcs.update(dt, this.player.position, this.player.isSeated);
    this.updateInteraction(dt);
    this.updateTutorial();
    this.updateWorld(dt);
    if (this.player.isSeated) {
      this.placeDesktop();
      this.desktop.tick(dt);
    }
    this.updateFootsteps();
    this.updateHud();
    this.checkDayEnd(dt);
  }

  private updateTimers(dt: number): void {
    if (this.lowProfileT > 0) {
      this.lowProfileT -= dt;
      if (this.lowProfileT <= 0) {
        this.state.day.lowProfile = false;
        this.bus.emit('notify', { title: 'Modo discreto encerrado', body: 'As ligações voltaram a entrar.', tone: 'info', icon: '📞' });
      }
    }
    if (this.lowProfileCooldown > 0) this.lowProfileCooldown -= dt;
    if (this.shredCooldown > 0) this.shredCooldown -= dt;
    if (this.chatCooldown > 0) this.chatCooldown -= dt;
    if (this.coffeeT > 0) this.coffeeT -= dt;
  }

  private updateInput(): void {
    const inp = this.input;
    if (this.menus.narrativeOpen) {
      for (let i = 0; i < 6; i++) if (inp.consume(`Digit${i + 1}`)) this.menus.narrativeChoose(i);
      return;
    }
    if (this.player.isSeated) {
      if (inp.consume('KeyE') && this.calls.phase === 'ringing') this.answerPhone();
      for (let i = 0; i < 6; i++) if (inp.consume(`Digit${i + 1}`) || inp.consume(`Numpad${i + 1}`)) this.desktop.chooseIndex(i);
      const wantsStand = inp.consume('KeyQ') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((k) => inp.down.has(k));
      if (wantsStand && this.calls.phase !== 'active' && !this.player.inTransition) this.standUp();
      else if (inp.consume('KeyQ')) this.standUp();
    }
  }

  private updateFootsteps(): void {
    if (this.player.stepDistance - this.stepAccum > 0.65) {
      this.stepAccum = this.player.stepDistance;
      const p = this.player.position;
      this.sfx('step', { x: p.x, y: 0.1, z: p.z }, 0.7);
    }
  }

  private checkDayEnd(dt: number): void {
    const d = this.state.day;
    if (this.raidT >= 0) {
      this.raidT += dt;
      this.renderer.alarm = this.settings.values.reduceEffects ? 0.3 : 0.5 + 0.5 * Math.sin(this.time * 8);
      if (this.raidT > 4) {
        this.renderer.alarm = 0;
        const deal = this.dealCinematic;
        this.dealCinematic = false;
        this.finishDay(!deal);
      }
      return;
    }
    if (d.clock >= 540) {
      if (!this.closingAnnounced) {
        this.closingAnnounced = true;
        this.calls.closing = true;
        this.hud.banner('18:00 — fim do expediente', this.calls.phase === 'active' ? 'Termine esta ligação.' : 'Hora de prestar contas.', 'info');
        if (this.state.campaign.flags.deal_accepted && d.day === LAST_DAY) this.dealEnding = true;
      }
      if (this.calls.phase !== 'active' && !this.menus.narrativeOpen) {
        if (this.calls.phase === 'ringing') this.calls.drop('Fim do expediente.');
        if (this.dealEnding) {
          this.sfx('siren');
          this.hud.banner('A Inspetora Moura chegou.', 'Às 18h em ponto. Como combinado.', 'good');
          this.dealEnding = false;
          this.dealCinematic = true;
          this.raidT = 1.5;
          this.npcs.panic = true;
          return;
        }
        this.finishDay(false);
      }
    }
  }

  // =================================================================== tutorial

  private updateTutorial(): void {
    if (this.tutorialStep < 0) return;
    const steps: Array<{ text: string; done: () => boolean }> = [
      { text: 'Mouse olha, WASD anda. Vá até a sua mesa: a cadeira laranja no centro do escritório.', done: () => this.player.position.distanceTo(this.office.spots.seat) < 2.2 },
      { text: 'Olhe para a cadeira ou o monitor e aperte E para sentar.', done: () => this.player.isSeated },
      { text: 'Este é o FortunaOS. Leia o recado do chefe no app Mensagens. (Q levanta da mesa.)', done: () => this.tutorialFlags.messages || this.inbox.unread === 0 },
      { text: 'O telefone vai tocar. Atenda com o botão "Atender" ou apertando E.', done: () => this.calls.phase === 'active' },
      { text: 'Escolha uma resposta (clique ou teclas 1–6). Observe o rosto e a cor da reação: dizem se a pessoa gostou.', done: () => this.tutorialFlags.firstChoice },
      { text: 'Dica: abra o Arquivo de Casos, clique em "Linha atual" e abra a ficha. Com a ficha aberta, surgem frases da categoria FICHA.', done: () => this.tutorialFlags.fileViewed || this.tutorialFlags.question },
      { text: 'Ela fez uma pergunta! A resposta certa está na ficha (Arquivo de Casos). Depois, na hora de cobrar, não peça mais do que a confiança aguenta.', done: () => this.calls.phase !== 'active' },
      { text: 'Continue atendendo até bater a meta. Com a meta batida, você pode ir embora pela SAÍDA ou trabalhar até as 18:00.', done: () => this.state.day.collected >= this.state.day.quota },
    ];
    const step = steps[this.tutorialStep];
    if (!step) {
      this.tutorialStep = -1;
      return;
    }
    if (this.tutorialStep === 3) this.calls.holdRinging = false;
    if (step.done()) {
      this.tutorialStep++;
      if (this.tutorialStep === 3) {
        this.calls.holdRinging = false;
        this.calls.gapTimer = Math.min(this.calls.gapTimer, 3);
      }
      if (this.tutorialStep >= steps.length) this.tutorialStep = -1;
    }
  }

  // =================================================================== HUD e mundo

  private updateHud(): void {
    const d = this.state.day;
    const def = this.def!;
    this.hud.update({
      day: d.day,
      weekday: def.weekday,
      clock: d.clock,
      collected: d.collected,
      quota: d.quota,
      wallet: this.state.campaign.wallet,
      heatLevel: levelOf(this.state.campaign.heat),
      heat: this.state.campaign.heat,
      ringing: this.calls.phase === 'ringing',
      seated: this.player.isSeated,
      onCall: this.calls.phase === 'active',
    });
    let obj = this.objective;
    if (!obj && this.tutorialStep >= 0) obj = [
      'Mouse olha, WASD anda. Vá até a sua mesa: a cadeira laranja no centro do escritório.',
      'Olhe para a cadeira ou o monitor e aperte E para sentar.',
      'Leia o recado do chefe no app Mensagens. (Q levanta da mesa.)',
      'O telefone vai tocar. Atenda com o botão "Atender" ou apertando E.',
      'Escolha uma resposta (clique ou teclas 1–6). Observe o rosto e a cor da reação.',
      'Abra o Arquivo de Casos, clique em "Linha atual" e abra a ficha: surgem frases da categoria FICHA.',
      'Se ela perguntar algo, a resposta está na ficha. Na hora de cobrar, não peça mais do que a confiança aguenta.',
      'Continue atendendo até bater a meta. Depois, vá embora pela SAÍDA ou trabalhe até as 18:00.',
    ][this.tutorialStep];
    if (!obj) {
      if (this.calls.phase === 'ringing') obj = 'Atenda o telefone na sua mesa';
      else if (d.collected < d.quota) obj = `Bata a meta: faltam ${money(d.quota - d.collected)} até as 18:00`;
      else obj = 'Meta batida! Fature mais ou saia pela porta de SAÍDA.';
    }
    this.hud.setObjective(obj);
    if (this.player.mode === 'walk') this.hud.setWalking(true);
    this.hud.setSeated(this.player.isSeated || this.player.inTransition);
    this.hud.updateBubbles(this.renderer.camera, this.host.clientWidth, this.host.clientHeight);
    const cam = this.renderer.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.audio.setListener(cam.position, fwd);
  }

  private titleCamera(dt: number): void {
    this.titleAngle += dt * 0.05;
    const cam = this.renderer.camera;
    const r = 6.5;
    cam.position.set(Math.sin(this.titleAngle) * r + 1, 2.3, Math.cos(this.titleAngle) * r * 0.7 + 1);
    cam.lookAt(0, 1.1, 0.5);
  }

  private ranking(): Array<{ name: string; value: number; you?: boolean }> {
    const d = this.state.day;
    const k = d.clock / 540;
    const wobble = (s: number) => 0.85 + 0.15 * Math.sin(d.clock / 37 + s);
    return [
      { name: 'Você', value: d.collected, you: true },
      { name: 'Tonhão', value: Math.round(d.quota * 1.05 * k * wobble(1)) },
      { name: 'Pri', value: Math.round(d.quota * 0.95 * k * wobble(2)) },
      { name: 'Juninho', value: Math.round(d.quota * 0.35 * k * wobble(3)) },
    ];
  }

  private news(): { headline: string; ticker: string; alert: boolean } {
    const lvl = levelOf(this.state.campaign.heat);
    const f = this.state.campaign.flags;
    const headlines = [
      'Previsão do tempo: sol com chance de golpe à tarde.',
      'Moradores relatam SMS sobre jet-skis. "Eu nem tenho mar", diz aposentada.',
      'Polícia investiga central de "geladeiras com vírus" no centro da cidade.',
      'URGENTE: viaturas cercam prédio comercial. Inspetora Moura não comenta.',
    ];
    const ticker = [
      'Dólar fictício estável',
      'CapivaraCoin cai 90% e sobe 900% no mesmo minuto',
      'Príncipe de Pindorama do Norte segue morto, diz porta-voz',
      f.stung ? 'Polícia confirma armadilha bem-sucedida contra golpistas' : 'Feira de geladeiras inteligentes é adiada',
      'Previsão: luzes estranhas no céu (seguradoras agradecem)',
    ].join('   •   ');
    return { headline: headlines[lvl], ticker, alert: lvl >= 2 };
  }

  private updateDesk(): void {
    const plate = this.office.nameplate;
    const ctx = plate.ctx;
    ctx.fillStyle = '#1b1f24';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 26px Segoe UI, sans-serif';
    ctx.fillText(`VOCÊ — ${RANKS[this.state.campaign.rankIndex].toUpperCase()}`, 12, 42);
    plate.commit();
  }

  private updateWorld(dt: number): void {
    const o = this.office;
    const d = this.state.day;
    const t = clamp(d.clock / 540, 0, 1);
    const L = o.lights;
    // Hora do dia: o sol atravessa as janelas e esquenta no fim da tarde.
    L.sun.position.set(lerp(16, -16, t), 6 + 10 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.05)), -22);
    const evening = clamp((t - 0.6) / 0.4, 0, 1);
    L.sun.color.setRGB(1, lerp(0.92, 0.62, evening), lerp(0.8, 0.38, evening));
    L.sun.intensity = lerp(2.4, 1.3, evening);
    const sky = o.sky.material as THREE.ShaderMaterial;
    (sky.uniforms.top.value as THREE.Color).setRGB(lerp(0.29, 0.17, evening), lerp(0.52, 0.2, evening), lerp(0.77, 0.4, evening));
    (sky.uniforms.bottom.value as THREE.Color).setRGB(lerp(0.81, 1.0, evening), lerp(0.89, 0.62, evening), lerp(0.94, 0.42, evening));
    o.cityWindows.emissiveIntensity = lerp(0.1, 0.9, evening);
    // Relógio de parede.
    const minutes = 9 * 60 + d.clock;
    o.clockHands.minute.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
    o.clockHands.hour.rotation.z = -(((minutes / 60) % 12) / 12) * Math.PI * 2;
    // Telefone.
    const ph = o.phone;
    const ringing = this.calls.phase === 'ringing' && this.mode === 'play';
    const offHook = this.calls.phase === 'active';
    ph.ringT += dt;
    ph.led.emissiveIntensity = ringing ? (Math.sin(ph.ringT * 16) > 0 ? 3 : 0.2) : offHook ? 1.2 : 0;
    ph.handset.position.y = offHook ? 0.2 : 0.085 + (ringing ? Math.abs(Math.sin(ph.ringT * 40)) * 0.006 : 0);
    ph.handset.rotation.z = ringing ? Math.sin(ph.ringT * 45) * 0.05 : offHook ? 0.6 : 0;
    // LEDs do rack.
    if (Math.random() < 0.3) {
      const i = Math.floor(Math.random() * o.rackLeds.count);
      const c = new THREE.Color(d.networkUp ? (Math.random() < 0.85 ? '#29d16b' : '#ffb347') : Math.random() < 0.5 ? '#ff2a2a' : '#300000');
      o.rackLeds.setColorAt(i, c);
      if (o.rackLeds.instanceColor) o.rackLeds.instanceColor.needsUpdate = true;
    }
    // Lâmpada piscando.
    if (L.flicker && d.powerUp) {
      const on = Math.random() > (Math.random() < 0.02 ? 0.9 : 0.03);
      (L.flicker.panel.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.3 : 0.1;
    }
    // Emergência e polícia.
    const blackout = !d.powerUp;
    for (const e of L.emergency) e.intensity = blackout ? 10 + Math.sin(this.time * 3) * 3 : 0;
    const lvl = levelOf(this.state.campaign.heat);
    const reduce = this.settings.values.reduceEffects;
    const policeOn = (lvl >= 2 && this.mode === 'play') || this.raidT >= 0;
    L.police.forEach((l, i) => {
      const phase = Math.sin(this.time * (reduce ? 2 : 7) + i * Math.PI);
      l.intensity = policeOn ? Math.max(0, phase) * (reduce ? 8 : 25) * (this.raidT >= 0 ? 1.6 : lvl === 3 ? 1.2 : 0.7) : 0;
    });
    // Telas dinâmicas (com taxa limitada).
    this.screenTimer -= dt;
    if (this.screenTimer <= 0) {
      this.screenTimer = 0.25;
      o.monitor.draw(
        {
          day: d.day,
          clock: d.clock,
          collected: d.collected,
          quota: d.quota,
          ringing: this.calls.phase === 'ringing',
          onCall: this.calls.phase === 'active',
          callerName: this.calls.caller?.name ?? null,
          unread: this.inbox.unread,
          networkUp: d.networkUp,
          powerUp: d.powerUp,
          infected: d.pcInfected,
          crashed: d.pcCrashed,
        },
        0.25,
      );
      const n = this.news();
      o.tv.setNews(n.headline, n.ticker, n.alert);
    }
    o.tv.draw(dt, d.powerUp);
    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 1;
      o.whiteboard.draw(d.day, d.quota, this.ranking());
      const ctx = o.safeDisplay.ctx;
      ctx.fillStyle = '#04140a';
      ctx.fillRect(0, 0, 256, 96);
      ctx.fillStyle = '#39ff88';
      ctx.font = 'bold 34px Consolas, monospace';
      ctx.fillText(money(this.state.campaign.operationBalance), 14, 60);
      o.safeDisplay.commit();
      this.updateDesk();
    }
  }

  // =================================================================== depuração e testes

  /** API usada pelos testes automatizados de ponta a ponta. */
  debugApi() {
    return {
      game: this,
      snapshot: () => ({
        mode: this.mode,
        day: this.state.day.day,
        clock: this.state.day.clock,
        clockText: clockText(this.state.day.clock),
        collected: this.state.day.collected,
        quota: this.state.day.quota,
        wallet: this.state.campaign.wallet,
        balance: this.state.campaign.operationBalance,
        heat: this.state.campaign.heat,
        strikes: this.state.campaign.strikes,
        callPhase: this.calls.phase,
        caller: this.calls.caller?.name ?? null,
        seated: this.player.isSeated,
        playerMode: this.player.mode,
        position: this.player.position.toArray(),
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        prompt: this.focusTarget?.id ?? null,
        objective: this.objective,
        renderer: (() => {
          const gl = this.renderer.renderer.getContext();
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconhecido';
        })(),
        drawCalls: this.renderer.renderer.info.render.calls,
        triangles: this.renderer.renderer.info.render.triangles,
        networkUp: this.state.day.networkUp,
        powerUp: this.state.day.powerUp,
        infected: this.state.day.pcInfected,
        crashed: this.state.day.pcCrashed,
        hotList: this.state.campaign.hotList.length,
        rank: this.state.campaign.rankIndex,
        day0Clock: this.state.day.clock,
        events: this.director.activeIds,
        ledger: this.state.day.ledger.length,
        calls: this.state.day.calls.map((c) => c.outcome),
        fps: Math.round(this.fps.value),
        renderScale: this.renderer.scale,
        narrative: this.menus.narrativeOpen,
        upgrades: [...this.state.campaign.upgrades],
        history: this.state.campaign.history.map((h) => h.result),
        ending: this.state.campaign.ending,
      }),
      skipMinutes: (m: number) => (this.state.day.clock = Math.min(540, this.state.day.clock + m)),
      sit: () => this.sitDown(),
      stand: () => this.standUp(),
      teleport: (x: number, z: number, yaw = 0) => this.player.spawn(x, z, yaw),
      /** Aponta a câmera para um ponto do mundo (simula o olhar do jogador). */
      lookAt: (x: number, y: number, z: number) => {
        const p = this.player.position;
        const dx = x - p.x;
        const dz = z - p.z;
        this.player.yaw = Math.atan2(-dx, -dz);
        this.player.pitch = Math.atan2(y - this.player.eyeHeight, Math.hypot(dx, dz));
      },
      /** Pagamento pelo caminho normal da economia (para acelerar testes de campanha). */
      pay: (amount: number) => this.economy.payment(amount, 'Pagamento de teste'),
      target: (id: string) => {
        const o = this.office.targets[id];
        if (!o) return null;
        const v = new THREE.Vector3();
        new THREE.Box3().setFromObject(o).getCenter(v);
        return v.toArray();
      },
      ring: () => {
        this.calls.holdRinging = false;
        this.calls.gapTimer = 0;
      },
      answer: () => this.answerPhone(),
      choices: () => this.calls.conversation?.currentChoices() ?? [],
      choose: (id: string) => this.calls.choose(id),
      viewFile: () => this.calls.caller && this.calls.markFileViewed(this.calls.caller.id),
      trigger: (id: string) => this.director.start(id),
      interact: (id: string) => this.interactables.find((i) => i.id === id)?.use(),
      addHeat: (v: number) => this.risk.add(v, 'teste'),
      endDay: () => {
        this.state.day.clock = 540;
      },
      skipTutorial: () => {
        this.tutorialStep = -1;
        this.calls.holdRinging = false;
      },
    };
  }
}
