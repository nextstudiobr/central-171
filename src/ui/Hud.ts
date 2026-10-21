import * as THREE from 'three';
import type { Tone } from '../core/events';
import { clockText, money } from '../core/util';
import { HEAT_LEVEL_LABEL, type HeatLevel } from '../systems/Risk';
import { h } from './dom';

export interface HudSnapshot {
  day: number;
  weekday: string;
  clock: number;
  collected: number;
  quota: number;
  wallet: number;
  heatLevel: HeatLevel;
  heat: number;
  ringing: boolean;
  seated: boolean;
  onCall: boolean;
}

interface Bubble {
  el: HTMLElement;
  anchor: () => THREE.Vector3 | null;
  until: number;
}

/** HUD em tela: relógio, meta, radar de exposição, avisos e balões de fala. */
export class Hud {
  readonly root: HTMLElement;
  private clockEl: HTMLElement;
  private dayEl: HTMLElement;
  private quotaEl: HTMLElement;
  private quotaVal: HTMLElement;
  private quotaBar: HTMLElement;
  private quotaPct: HTMLElement;
  private walletEl: HTMLElement;
  private radarEl: HTMLElement;
  private radarText: HTMLElement;
  private objectiveEl: HTMLElement;
  private phoneAlert: HTMLElement;
  private crosshair: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  private vignette: HTMLElement;
  private hint: HTMLElement;
  private bubbles: Bubble[] = [];
  private bubbleLayer: HTMLElement;
  private lastObjective: string | null = null;
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.clockEl = h('div', { class: 'time' }, '09:00');
    this.dayEl = h('div', { class: 'day' });
    this.objectiveEl = h('div', { class: 'objective hidden' });
    this.quotaVal = h('div', { class: 'value' });
    this.quotaBar = h('i');
    this.quotaPct = h('span');
    this.walletEl = h('div', { class: 'wallet' });
    this.quotaEl = h(
      'div',
      { class: 'quota' },
      h('div', { class: 'label' }, h('span', {}, 'Meta do dia'), this.quotaPct),
      this.quotaVal,
      h('div', { class: 'bar' }, this.quotaBar),
      this.walletEl,
    );
    this.radarText = h('span');
    this.radarEl = h('div', { class: 'radar' }, h('div', { class: 'dot' }), this.radarText);
    this.phoneAlert = h('div', { class: 'phone-alert hidden' }, '☎ Telefone tocando — volte à sua mesa!');
    this.crosshair = h('div', { class: 'crosshair' });
    this.prompt = h('div', { class: 'prompt hidden' });
    this.toasts = h('div', { class: 'toasts' });
    this.vignette = h('div', { class: 'heat-vignette' });
    this.bubbleLayer = h('div', { class: 'bubbles' });
    this.hint = h(
      'div',
      { class: 'controls-hint' },
      h('div', {}, h('span', { class: 'key' }, 'W'), h('span', { class: 'key' }, 'A'), h('span', { class: 'key' }, 'S'), h('span', { class: 'key' }, 'D'), ' andar  ', h('span', { class: 'key' }, 'Shift'), ' correr'),
      h('div', {}, h('span', { class: 'key' }, 'E'), ' interagir  ', h('span', { class: 'key' }, 'Esc'), ' pausa'),
    );
    this.root = h(
      'div',
      { class: 'hud' },
      this.vignette,
      this.bubbleLayer,
      h('div', { class: 'hud-tl' }, h('div', { class: 'hud-clock' }, this.clockEl, this.dayEl), this.objectiveEl),
      h('div', { class: 'hud-tr' }, this.quotaEl, this.radarEl, this.phoneAlert),
      this.crosshair,
      this.prompt,
      this.toasts,
      this.hint,
    );
    parent.appendChild(this.root);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('off', !on);
  }

  /** Mostra os atalhos só enquanto o jogador anda. */
  /** Layout compacto quando o jogador está sentado diante do monitor. */
  setSeated(seated: boolean): void {
    this.root.classList.toggle('seated', seated);
  }

  setWalking(walking: boolean): void {
    this.crosshair.classList.toggle('hidden', !walking);
    this.hint.classList.toggle('hidden', !walking);
    if (!walking) this.setPrompt(null);
  }

  update(s: HudSnapshot): void {
    this.clockEl.textContent = clockText(s.clock);
    this.dayEl.innerHTML = `<b>Dia ${s.day}</b>${s.weekday}`;
    this.quotaVal.innerHTML = `${money(s.collected)} <span>/ ${money(s.quota)}</span>`;
    const p = Math.max(0, Math.min(1, s.collected / Math.max(1, s.quota)));
    this.quotaBar.style.width = `${p * 100}%`;
    this.quotaBar.parentElement!.classList.toggle('good', p >= 1);
    this.quotaPct.textContent = `${Math.round((s.collected / Math.max(1, s.quota)) * 100)}%`;
    this.walletEl.innerHTML = `<span>Sua comissão</span><span>${money(s.wallet)}</span>`;
    this.radarEl.className = `radar l${s.heatLevel}`;
    this.radarText.innerHTML = `Exposição: <b>${HEAT_LEVEL_LABEL[s.heatLevel]}</b>`;
    this.vignette.className = `heat-vignette${s.heatLevel >= 2 ? ` l${s.heatLevel}` : ''}`;
    this.phoneAlert.classList.toggle('hidden', !(s.ringing && !s.seated));
  }

  setObjective(text: string | null): void {
    if (text === this.lastObjective) return;
    this.lastObjective = text;
    if (!text) {
      this.objectiveEl.classList.add('hidden');
      return;
    }
    this.objectiveEl.classList.remove('hidden');
    this.objectiveEl.innerHTML = '';
    this.objectiveEl.append(h('small', {}, 'Objetivo'), text);
  }

  setPrompt(text: string | null, holdProgress?: number): void {
    if (!text) {
      this.prompt.classList.add('hidden');
      this.crosshair.classList.remove('active');
      return;
    }
    this.crosshair.classList.add('active');
    this.prompt.classList.remove('hidden');
    this.prompt.innerHTML = '';
    if (holdProgress !== undefined && holdProgress > 0) {
      const ring = h('div', { class: 'hold-ring' });
      ring.style.setProperty('--p', String(Math.round(holdProgress * 100)));
      this.prompt.append(ring, text);
    } else this.prompt.append(h('span', { class: 'key' }, 'E'), text);
  }

  toast(title: string, body: string, tone: Tone = 'info', icon = 'ℹ️'): void {
    const el = h('div', { class: `toast ${tone}` }, h('div', { class: 'ic' }, icon), h('div', {}, h('b', {}, title), body ? h('p', {}, body) : null));
    this.toasts.prepend(el);
    while (this.toasts.children.length > 5) this.toasts.lastElementChild?.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, 5200);
  }

  banner(title: string, description: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
    this.root.querySelectorAll('.banner').forEach((b) => b.remove());
    const el = h('div', { class: `banner ${tone}` }, h('div', { class: 't' }, title), description ? h('div', { class: 'd' }, description) : null);
    this.root.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 520);
    }, 3600);
  }

  moneyPop(amount: number): void {
    const el = h('div', { class: `money-pop${amount < 0 ? ' neg' : ''}` }, `${amount >= 0 ? '+' : ''}${money(amount)}`);
    el.style.left = '50%';
    el.style.top = '42%';
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1900);
    if (amount > 0) {
      this.quotaEl.classList.remove('pulse');
      void this.quotaEl.offsetWidth;
      this.quotaEl.classList.add('pulse');
    }
  }

  /** Balão de fala preso a um ponto do mundo. */
  say(name: string, text: string, anchor: () => THREE.Vector3 | null, seconds: number, boss = false): void {
    this.bubbles = this.bubbles.filter((b) => {
      if (b.anchor === anchor) {
        b.el.remove();
        return false;
      }
      return true;
    });
    const el = h('div', { class: `bubble${boss ? ' boss' : ''}` }, h('b', {}, name), text);
    this.bubbleLayer.appendChild(el);
    this.bubbles.push({ el, anchor, until: performance.now() + seconds * 1000 });
  }

  /** Reposiciona os balões projetando a cabeça de cada personagem. */
  updateBubbles(camera: THREE.Camera, w: number, hgt: number): void {
    const now = performance.now();
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el.remove();
        return false;
      }
      const p = b.anchor();
      if (!p) {
        b.el.style.display = 'none';
        return true;
      }
      this.v.copy(p);
      this.v.y += 0.35;
      const dist = camera.position.distanceTo(this.v);
      this.v.project(camera);
      if (this.v.z > 1 || dist > 16) {
        b.el.style.display = 'none';
        return true;
      }
      b.el.style.display = '';
      const x = ((this.v.x + 1) / 2) * w;
      const y = ((1 - this.v.y) / 2) * hgt;
      b.el.style.left = `${Math.max(140, Math.min(w - 140, x))}px`;
      b.el.style.top = `${Math.max(60, y)}px`;
      b.el.style.opacity = String(Math.max(0.35, 1 - dist / 18));
      return true;
    });
  }

  /** Remove avisos e faixas transitórios (fim do dia). */
  clearTransient(): void {
    this.root.querySelectorAll('.banner, .money-pop').forEach((b) => b.remove());
    this.toasts.innerHTML = '';
    this.clearBubbles();
  }

  clearBubbles(): void {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
  }
}
