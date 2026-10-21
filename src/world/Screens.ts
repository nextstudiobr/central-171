import * as THREE from 'three';
import { clockText, money } from '../core/util';

/** Textura de canvas redesenhável. */
export class CanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  commit(): void {
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export interface MonitorSnapshot {
  day: number;
  clock: number;
  collected: number;
  quota: number;
  ringing: boolean;
  onCall: boolean;
  callerName: string | null;
  unread: number;
  networkUp: boolean;
  powerUp: boolean;
  infected: boolean;
  crashed: boolean;
}

const FONT = '"Segoe UI", "Inter", system-ui, sans-serif';

/** Tela do computador do jogador vista de longe (o desktop real é HTML ao sentar). */
export class MonitorScreen extends CanvasSurface {
  private blink = 0;

  constructor() {
    super(1024, 628);
  }

  draw(s: MonitorSnapshot, dt: number): void {
    this.blink += dt;
    const { ctx, width: w, height: h } = this;
    if (!s.powerUp) {
      ctx.fillStyle = '#020203';
      ctx.fillRect(0, 0, w, h);
      this.commit();
      return;
    }
    if (s.crashed) {
      ctx.fillStyle = '#1a3d9c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 64px ${FONT}`;
      ctx.fillText(':(', 70, 150);
      ctx.font = `30px ${FONT}`;
      ctx.fillText('O FortunaOS encontrou um café inesperado.', 70, 230);
      ctx.fillText('Reinicie o computador.', 70, 280);
      this.commit();
      return;
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0d2a33');
    g.addColorStop(1, '#2a1630');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Logotipo de fundo.
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffb347';
    ctx.font = `bold 220px ${FONT}`;
    ctx.fillText('171', w - 480, h - 90);
    ctx.globalAlpha = 1;
    // Barra de tarefas.
    ctx.fillStyle = 'rgba(8,10,14,0.85)';
    ctx.fillRect(0, h - 52, w, 52);
    ctx.fillStyle = '#ffb347';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText('◆ FortunaOS', 18, h - 17);
    ctx.fillStyle = '#d8e3e6';
    ctx.font = `26px ${FONT}`;
    ctx.fillText(clockText(s.clock), w - 100, h - 17);
    // Janela do painel.
    ctx.fillStyle = 'rgba(16,22,30,0.92)';
    ctx.fillRect(40, 40, 560, 300);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(40, 40, 560, 44);
    ctx.fillStyle = '#121212';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`Painel de Operações — Dia ${s.day}`, 56, 70);
    ctx.fillStyle = '#9fb3ba';
    ctx.font = `22px ${FONT}`;
    ctx.fillText('Arrecadado hoje', 64, 125);
    ctx.fillStyle = '#e9f7ef';
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText(money(s.collected), 64, 182);
    ctx.fillStyle = '#9fb3ba';
    ctx.font = `22px ${FONT}`;
    ctx.fillText(`Meta: ${money(s.quota)}`, 64, 220);
    const p = Math.max(0, Math.min(1, s.collected / Math.max(1, s.quota)));
    ctx.fillStyle = '#26323a';
    ctx.fillRect(64, 245, 500, 26);
    ctx.fillStyle = p >= 1 ? '#53d18b' : '#ffb347';
    ctx.fillRect(64, 245, 500 * p, 26);
    ctx.fillStyle = '#9fb3ba';
    ctx.fillText(`${Math.round(p * 100)}%`, 64, 310);
    // Ícones.
    const icons = ['Painel', 'PABX', 'Arquivo', 'Lista Quente', 'Mensagens'];
    icons.forEach((label, i) => {
      const x = 660 + (i % 2) * 160;
      const y = 60 + Math.floor(i / 2) * 120;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, 72, 72);
      ctx.fillStyle = '#d8e3e6';
      ctx.font = `20px ${FONT}`;
      ctx.fillText(label, x - 6, y + 100);
      if (label === 'Mensagens' && s.unread > 0) {
        ctx.fillStyle = '#e04848';
        ctx.beginPath();
        ctx.arc(x + 70, y + 4, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold 20px ${FONT}`;
        ctx.fillText(String(s.unread), x + 63, y + 11);
      }
    });
    if (!s.networkUp) this.banner('SEM REDE — reinicie o roteador', '#b33939');
    else if (s.infected) this.banner('⚠ VÍRUS DETECTADO ⚠', '#c0392b');
    else if (s.ringing && Math.floor(this.blink * 3) % 2 === 0) this.banner('☎ CHAMADA RECEBENDO', '#2d8f5b');
    else if (s.onCall) this.banner(`Em ligação: ${s.callerName ?? ''}`, '#2b5f8f');
    this.commit();
  }

  private banner(text: string, color: string): void {
    const { ctx, width: w } = this;
    ctx.fillStyle = color;
    ctx.fillRect(40, 380, w - 80, 70);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 36px ${FONT}`;
    ctx.fillText(text, 64, 428);
  }
}

/** Tela estática de um colega (planilha, lista de contatos...). */
export function coworkerScreen(seed: number, owner: string): CanvasSurface {
  const s = new CanvasSurface(256, 160);
  const { ctx } = s;
  const palettes = [
    ['#0e2230', '#4fb3d9'],
    ['#1e1430', '#c084fc'],
    ['#10261b', '#5bd18b'],
    ['#2a1d0e', '#ffb347'],
  ];
  const [bg, fg] = palettes[seed % palettes.length];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = '#000';
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillText(owner, 6, 13);
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 9; i++) {
    const w = 60 + ((seed * 37 + i * 53) % 150);
    ctx.fillRect(10, 28 + i * 14, w, 6);
    ctx.fillRect(200, 28 + i * 14, 40, 6);
  }
  ctx.globalAlpha = 1;
  s.commit();
  return s;
}

/** Placar do quadro branco: ranking ao vivo do dia. */
export class Whiteboard extends CanvasSurface {
  constructor() {
    super(1024, 512);
  }

  draw(day: number, quota: number, entries: Array<{ name: string; value: number; you?: boolean }>): void {
    const { ctx, width: w, height: h } = this;
    ctx.fillStyle = '#f4f4ef';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9c9c0';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    const hand = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
    ctx.fillStyle = '#c0392b';
    ctx.font = `bold 54px ${hand}`;
    ctx.fillText(`RANKING DO DIA ${day}`, 40, 80);
    ctx.fillStyle = '#2c3e50';
    ctx.font = `30px ${hand}`;
    ctx.fillText(`Meta individual: ${money(quota)}`, 44, 128);
    const sorted = [...entries].sort((a, b) => b.value - a.value);
    sorted.forEach((e, i) => {
      const y = 200 + i * 72;
      ctx.fillStyle = e.you ? '#1f6f43' : '#1d3b8f';
      ctx.font = `bold 44px ${hand}`;
      ctx.fillText(`${i + 1}. ${e.name}`, 60, y);
      ctx.fillText(money(e.value), 560, y);
      if (i === 0) {
        ctx.fillStyle = '#e6a700';
        ctx.fillText('★', 470, y);
      }
    });
    ctx.fillStyle = '#7f8c8d';
    ctx.font = `24px ${hand}`;
    ctx.fillText('"Último lugar lava as canecas" — Gerência', 40, h - 30);
    this.commit();
  }
}

/** TV de notícias com letreiro; as manchetes reagem à exposição da central. */
export class NewsTv extends CanvasSurface {
  private offset = 0;
  private ticker = '';
  private headline = '';
  private alert = false;

  constructor() {
    super(512, 288);
  }

  setNews(headline: string, ticker: string, alert: boolean): void {
    this.headline = headline;
    this.ticker = ticker;
    this.alert = alert;
  }

  draw(dt: number, on: boolean): void {
    const { ctx, width: w, height: h } = this;
    if (!on) {
      ctx.fillStyle = '#030303';
      ctx.fillRect(0, 0, w, h);
      this.commit();
      return;
    }
    this.offset += dt * 70;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, this.alert ? '#3a0d10' : '#0e1f3a');
    g.addColorStop(1, '#05070c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.alert ? '#e23b3b' : '#1f6fd1';
    ctx.fillRect(0, 18, 150, 30);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(this.alert ? 'URGENTE' : 'AO VIVO', 14, 40);
    ctx.font = `bold 26px ${FONT}`;
    wrap(ctx, this.headline, 18, 100, w - 36, 32);
    ctx.fillStyle = '#e6c229';
    ctx.fillRect(0, h - 44, w, 44);
    ctx.fillStyle = '#111';
    ctx.font = `bold 20px ${FONT}`;
    const text = `${this.ticker}   •   `;
    const tw = ctx.measureText(text).width;
    const x = -(this.offset % tw);
    for (let i = 0; i < 3; i++) ctx.fillText(text, x + i * tw, h - 15);
    this.commit();
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

/** Pôster com texto (decoração com humor). */
export function poster(lines: string[], bg: string, fg: string, w = 512, h = 700): CanvasSurface {
  const s = new CanvasSurface(w, h);
  const { ctx } = s;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  lines.forEach((l, i) => {
    const big = i === 0;
    ctx.font = `${big ? 'bold 64' : '34'}px ${FONT}`;
    wrapCenter(ctx, l, w / 2, 130 + i * 150, w - 80, big ? 70 : 42);
  });
  s.commit();
  return s;
}

function wrapCenter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  const words = text.split(' ');
  let line = '';
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
