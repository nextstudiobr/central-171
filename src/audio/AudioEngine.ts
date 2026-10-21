import type { Settings } from '../systems/Settings';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface VoiceProfile {
  pitch: number;
  rate: number;
}

/**
 * Áudio 100% local: efeitos sintetizados com Web Audio, ambiente de
 * escritório procedural, música de espera e vozes (síntese de voz do
 * navegador quando houver voz pt-BR local; senão, "balbucio" procedural).
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private voice!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ringTimer: number | null = null;
  private ringPanner: PannerNode | null = null;
  private ambNodes: { hvac: GainNode; chatter: GainNode; hum: GainNode } | null = null;
  private musicTimer: number | null = null;
  private ttsVoice: SpeechSynthesisVoice | null = null;
  private settings: Settings;
  blackout = false;

  constructor(settings: Settings) {
    this.settings = settings;
    this.pickVoice();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  /** Precisa ser chamado num gesto do usuário (clique). */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.sfx = c.createGain();
      this.amb = c.createGain();
      this.voice = c.createGain();
      this.music = c.createGain();
      for (const g of [this.sfx, this.amb, this.voice, this.music]) g.connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings(this.settings);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambienceVolume * 0.6, t, 0.05);
    this.voice.gain.setTargetAtTime(s.voiceVolume, t, 0.05);
    this.music.gain.setTargetAtTime(s.ambienceVolume * 0.5, t, 0.05);
  }

  /** Ouvinte posicional acompanha a câmera. */
  setListener(pos: Vec3Like, forward: Vec3Like): void {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  private panner(pos: Vec3Like): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.2;
    p.rolloffFactor = 1.1;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    return p;
  }

  private out(pos?: Vec3Like, bus: GainNode = this.sfx): AudioNode {
    if (!pos) return bus;
    const p = this.panner(pos);
    p.connect(bus);
    return p;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, when = 0, slideTo?: number): void {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, dest: AudioNode, filter: { type: BiquadFilterType; freq: number; q?: number }, when = 0, attack = 0.005): void {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    f.Q.value = filter.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Toca um efeito pelo nome. */
  play(id: string, pos?: Vec3Like, volume = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const o = this.out(pos);
    const v = volume;
    switch (id) {
      case 'pickup':
        this.noise(0.05, 0.4 * v, o, { type: 'highpass', freq: 2000 });
        this.tone(180, 0.08, 'square', 0.08 * v, o);
        break;
      case 'hangup':
        this.noise(0.04, 0.4 * v, o, { type: 'highpass', freq: 1500 });
        for (let i = 0; i < 3; i++) this.tone(425, 0.18, 'sine', 0.12 * v, o, 0.15 + i * 0.32);
        break;
      case 'key':
        this.noise(0.03, 0.12 * v, o, { type: 'bandpass', freq: 3000 + Math.random() * 2500, q: 3 });
        break;
      case 'click':
        this.noise(0.02, 0.15 * v, o, { type: 'highpass', freq: 3500 });
        break;
      case 'message':
        this.tone(880, 0.15, 'sine', 0.12 * v, o);
        this.tone(1320, 0.25, 'sine', 0.12 * v, o, 0.1);
        break;
      case 'notify':
        this.tone(660, 0.2, 'triangle', 0.1 * v, o);
        this.tone(990, 0.3, 'triangle', 0.08 * v, o, 0.08);
        break;
      case 'cash':
        this.noise(0.08, 0.3 * v, o, { type: 'lowpass', freq: 900 });
        for (const [f, d] of [[2093, 0.9], [2637, 0.7], [3136, 0.6], [4186, 0.5]] as Array<[number, number]>) this.tone(f, d, 'sine', 0.07 * v, o, 0.06);
        break;
      case 'fail':
        this.tone(220, 0.5, 'sawtooth', 0.07 * v, o, 0, 90);
        break;
      case 'trace':
        this.noise(0.03, 0.4 * v, o, { type: 'highpass', freq: 2500 });
        this.noise(0.03, 0.4 * v, o, { type: 'highpass', freq: 2500 }, 0.12);
        this.tone(1800, 0.35, 'sine', 0.05 * v, o, 0.25);
        break;
      case 'alarm':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 950 : 700, 0.22, 'square', 0.06 * v, o, i * 0.24);
        break;
      case 'siren': {
        const c = this.ctx;
        const t = c.currentTime;
        const osc = c.createOscillator();
        const g = c.createGain();
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1400;
        osc.type = 'sawtooth';
        for (let i = 0; i < 4; i++) {
          osc.frequency.setValueAtTime(600, t + i * 0.9);
          osc.frequency.linearRampToValueAtTime(1100, t + i * 0.9 + 0.45);
          osc.frequency.linearRampToValueAtTime(600, t + i * 0.9 + 0.9);
        }
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
        osc.connect(f).connect(g).connect(this.out({ x: 0, y: 2, z: -20 }));
        osc.start(t);
        osc.stop(t + 3.7);
        break;
      }
      case 'boss_yell':
        this.babble('AAAH GRRR NÃO', { pitch: 0.55, rate: 1.3 }, pos ?? { x: 7, y: 1.7, z: -4 }, 1.4);
        break;
      case 'static':
        this.noise(0.35, 0.12 * v, o, { type: 'bandpass', freq: 1800, q: 0.6 });
        break;
      case 'powerdown':
        this.tone(140, 1.2, 'sawtooth', 0.08 * v, o, 0, 25);
        this.noise(0.25, 0.4 * v, o, { type: 'lowpass', freq: 200 });
        break;
      case 'powerup':
        this.tone(40, 0.9, 'sawtooth', 0.05 * v, o, 0, 120);
        this.noise(0.05, 0.4 * v, o, { type: 'highpass', freq: 2000 }, 0.85);
        break;
      case 'virus':
        for (let i = 0; i < 8; i++) this.tone(200 + ((i * 377) % 900), 0.08, 'square', 0.05 * v, o, i * 0.07);
        break;
      case 'splash':
        this.noise(0.6, 0.3 * v, o, { type: 'lowpass', freq: 1200 }, 0, 0.02);
        this.tone(300, 0.3, 'sine', 0.05 * v, o, 0.05, 80);
        break;
      case 'coffee':
        this.noise(1.6, 0.18 * v, o, { type: 'bandpass', freq: 700, q: 0.8 }, 0, 0.1);
        for (let i = 0; i < 6; i++) this.tone(900 + Math.random() * 300, 0.05, 'sine', 0.04 * v, o, 1.7 + i * 0.25);
        break;
      case 'shred':
        this.noise(1.4, 0.25 * v, o, { type: 'bandpass', freq: 400, q: 2 }, 0, 0.05);
        this.tone(90, 1.4, 'square', 0.03 * v, o);
        break;
      case 'step':
        this.noise(0.09, 0.12 * v, o, { type: 'lowpass', freq: 260 + Math.random() * 80 });
        break;
      case 'success':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.09 * v, o, i * 0.11));
        break;
      case 'strike':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.05 * v, o, i * 0.2));
        break;
      case 'stamp':
        this.noise(0.12, 0.6 * v, o, { type: 'lowpass', freq: 500 });
        break;
      case 'door':
        this.noise(0.4, 0.2 * v, o, { type: 'bandpass', freq: 300, q: 4 });
        break;
      case 'whoosh':
        this.noise(0.35, 0.12 * v, o, { type: 'bandpass', freq: 1200, q: 0.7 }, 0, 0.1);
        break;
      default:
        break;
    }
  }

  /** Telefone tocando em loop até ser parado. */
  startRing(pos: Vec3Like): void {
    if (!this.ctx) return;
    this.stopRing();
    const ringOnce = () => {
      if (!this.ctx) return;
      this.ringPanner = this.panner(pos);
      this.ringPanner.connect(this.sfx);
      const c = this.ctx;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'square';
      for (let i = 0; i < 20; i++) osc.frequency.setValueAtTime(i % 2 ? 1290 : 1050, t + i * 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      g.gain.setValueAtTime(0.07, t + 0.95);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3000;
      osc.connect(f).connect(g).connect(this.ringPanner);
      osc.start(t);
      osc.stop(t + 1.05);
    };
    ringOnce();
    this.ringTimer = window.setInterval(ringOnce, 2600);
  }

  stopRing(): void {
    if (this.ringTimer !== null) window.clearInterval(this.ringTimer);
    this.ringTimer = null;
  }

  /** Ambiente: ar-condicionado, zumbido, murmúrio e sons esporádicos. */
  startAmbience(): void {
    if (!this.ctx || this.ambNodes) return;
    const c = this.ctx;
    const loopNoise = (filter: BiquadFilterType, freq: number, q = 0.7) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      src.connect(f).connect(g).connect(this.amb);
      src.start();
      return g;
    };
    const hvac = loopNoise('lowpass', 380);
    hvac.gain.value = 0.22;
    const chatter = loopNoise('bandpass', 650, 1.5);
    chatter.gain.value = 0.0;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.35;
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(chatter.gain);
    lfo.start();
    const humOsc = c.createOscillator();
    humOsc.frequency.value = 120;
    const hum = c.createGain();
    hum.gain.value = 0.012;
    humOsc.connect(hum).connect(this.amb);
    humOsc.start();
    this.ambNodes = { hvac, chatter, hum };
    chatter.gain.value = 0.035;
    // Sons esporádicos: teclados, telefone distante, risadas abafadas.
    const sporadic = () => {
      if (!this.ctx || this.blackout || this.ctx.state !== 'running') return;
      const r = Math.random();
      const pos = { x: -6 + Math.random() * 12, y: 1, z: -4 + Math.random() * 8 };
      if (r < 0.55) for (let i = 0; i < 6 + Math.random() * 10; i++) setTimeout(() => this.play('key', pos, 0.35), i * (60 + Math.random() * 90));
      else if (r < 0.75) this.play('click', pos, 0.3);
      else if (r < 0.9) this.babble('ha ha ha', { pitch: 0.9 + Math.random() * 0.4, rate: 1.4 }, pos, 0.25);
      else this.tone(1200, 0.4, 'square', 0.012, this.out({ x: -9, y: 1, z: 6 }));
    };
    window.setInterval(sporadic, 2200);
  }

  setBlackout(on: boolean): void {
    this.blackout = on;
    if (!this.ctx || !this.ambNodes) return;
    const t = this.ctx.currentTime;
    this.ambNodes.hvac.gain.setTargetAtTime(on ? 0 : 0.22, t, 0.3);
    this.ambNodes.hum.gain.setTargetAtTime(on ? 0 : 0.012, t, 0.3);
    this.ambNodes.chatter.gain.setTargetAtTime(on ? 0.01 : 0.035, t, 0.3);
  }

  /** Música de espera da tela inicial (bossa nova de telemarketing). */
  startHoldMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const chords = [
      [261.6, 329.6, 392.0, 493.9],
      [220.0, 261.6, 329.6, 392.0],
      [293.7, 349.2, 440.0, 523.3],
      [196.0, 246.9, 293.7, 349.2],
    ];
    const melody = [659, 587, 523, 587, 659, 659, 659, 0, 587, 587, 587, 0, 659, 784, 784, 0];
    let step = 0;
    const tick = () => {
      // Sem gesto do usuário o contexto fica suspenso: não acumula notas.
      if (!this.ctx || this.ctx.state !== 'running') return;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) for (const f of chord) this.tone(f, 1.6, 'triangle', 0.025, this.music);
      if (step % 2 === 0) this.tone(chord[0] / 2, 0.25, 'sine', 0.05, this.music);
      const m = melody[step % melody.length];
      if (m) this.tone(m, 0.22, 'sine', 0.03, this.music);
      if (step % 4 === 2) this.noise(0.05, 0.02, this.music, { type: 'highpass', freq: 6000 });
      step++;
    };
    this.musicTimer = window.setInterval(tick, 230);
  }

  stopHoldMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  // ------------------------------------------------------------------ vozes

  private pickVoice(): void {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices();
    const pt = voices.filter((v) => v.lang.toLowerCase().startsWith('pt'));
    // Só vozes locais: nada de serviço remoto para o jogo funcionar.
    this.ttsVoice = pt.find((v) => v.localService && v.lang.toLowerCase() === 'pt-br') ?? pt.find((v) => v.localService) ?? null;
  }

  get hasTts(): boolean {
    return this.ttsVoice !== null;
  }

  /** Fala uma linha. Devolve a duração estimada (s). */
  speak(text: string, profile: VoiceProfile, pos?: Vec3Like): number {
    const clean = text.replace(/\(.*?\)/g, '').trim();
    if (!clean) return 0;
    if (this.settings.tts && this.ttsVoice && typeof speechSynthesis !== 'undefined') {
      try {
        // As falas entram na fila do sintetizador; stopSpeech() limpa ao fim da ligação.
        const u = new SpeechSynthesisUtterance(clean);
        u.voice = this.ttsVoice;
        u.lang = this.ttsVoice.lang;
        u.pitch = Math.max(0.1, Math.min(2, profile.pitch));
        u.rate = Math.max(0.6, Math.min(1.6, profile.rate * 1.05));
        u.volume = Math.max(0, Math.min(1, this.settings.masterVolume * this.settings.voiceVolume));
        speechSynthesis.speak(u);
        return clean.length * 0.065 / profile.rate;
      } catch {
        /* cai para o balbucio */
      }
    }
    return this.babble(clean, profile, pos, 1);
  }

  stopSpeech(): void {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  /** Voz procedural: sílabas com formantes, no tom da personagem. */
  babble(text: string, profile: VoiceProfile, pos?: Vec3Like, volume = 1): number {
    if (!this.ctx || this.ctx.state !== 'running') return text.length * 0.05;
    const c = this.ctx;
    const dest = this.out(pos, this.voice);
    const base = 150 * profile.pitch;
    const syl = 0.085 / profile.rate;
    let t = c.currentTime + 0.02;
    const words = text.split(/\s+/).slice(0, 26);
    for (const w of words) {
      const count = Math.max(1, Math.min(4, Math.round(w.length / 3)));
      for (let i = 0; i < count; i++) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        const f = base * (0.9 + Math.random() * 0.25);
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * (0.92 + Math.random() * 0.12), t + syl);
        const f1 = c.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.value = 500 + Math.random() * 400;
        f1.Q.value = 4;
        const f2 = c.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.value = 1200 + Math.random() * 1000;
        f2.Q.value = 6;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * volume, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + syl * 0.95);
        o.connect(f1).connect(g);
        o.connect(f2).connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + syl);
        t += syl;
      }
      t += syl * 0.6;
      if (/[.!?]$/.test(w)) t += syl * 2;
    }
    return t - c.currentTime;
  }
}
