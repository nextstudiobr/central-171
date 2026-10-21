import * as THREE from 'three';
import { clamp, damp } from '../core/util';
import type { CollisionWorld } from './Collision';

export type PlayerMode = 'walk' | 'seated' | 'transition' | 'frozen';

/** Teclado e mouse, independentes do modo do jogo. */
export class Input {
  readonly down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  /** Arrastar com o mouse para olhar (alternativa quando não há trava do cursor). */
  dragging = false;
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(private readonly target: HTMLElement) {
    this.listen(window, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (isTyping(ev)) return;
      if (!this.down.has(ev.code)) this.pressed.add(ev.code);
      this.down.add(ev.code);
      if (['Space', 'Tab'].includes(ev.code)) ev.preventDefault();
    });
    this.listen(window, 'keyup', (e) => this.down.delete((e as KeyboardEvent).code));
    this.listen(window, 'blur', () => this.down.clear());
    this.listen(target, 'mousedown', () => {
      if (!this.locked) this.dragging = true;
    });
    this.listen(window, 'mouseup', () => (this.dragging = false));
    this.listen(document, 'mousemove', (e) => {
      if (document.pointerLockElement !== this.target && !this.dragging) return;
      const ev = e as MouseEvent;
      // Ignora saltos absurdos que alguns navegadores geram ao travar o cursor.
      if (Math.abs(ev.movementX) > 300 || Math.abs(ev.movementY) > 300) return;
      this.mouseDX += ev.movementX;
      this.mouseDY += ev.movementY;
    });
  }

  private listen(t: EventTarget, type: string, fn: EventListener): void {
    t.addEventListener(type, fn);
    this.listeners.push([t, type, fn]);
  }

  /** Tecla apertada neste quadro (consome o aperto). */
  consume(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  async lock(): Promise<boolean> {
    if (this.locked) return true;
    try {
      await this.target.requestPointerLock();
      return true;
    } catch {
      return false;
    }
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  dispose(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/**
 * Câmera em primeira pessoa com caminhada, balanço da cabeça, colisão e a
 * transição suave para a posição sentada diante do computador.
 */
export class Player {
  mode: PlayerMode = 'walk';
  readonly position = new THREE.Vector3(0, 0, 3.6);
  yaw = 0;
  pitch = -0.05;
  readonly radius = 0.3;
  eyeHeight = 1.62;
  sensitivity = 1;
  invertY = false;
  bobEnabled = true;
  private bobT = 0;
  private bobAmt = 0;
  private velocity = new THREE.Vector2();
  private readonly out = { x: 0, z: 0 };
  /** Distância percorrida (para os passos). */
  stepDistance = 0;
  private transition: { from: THREE.Vector3; fromQ: THREE.Quaternion; to: THREE.Vector3; toQ: THREE.Quaternion; t: number; dur: number; then: PlayerMode } | null = null;
  private seatPose: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private standPose: { pos: THREE.Vector3; yaw: number } | null = null;
  /** Leve deslocamento do olhar sentado, seguindo o cursor. */
  seatedLook = new THREE.Vector2();
  private shake = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly collision: CollisionWorld,
  ) {
    this.yaw = 0;
  }

  get isSeated(): boolean {
    return this.mode === 'seated';
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt: number, input: Input): void {
    if (this.transition) {
      this.updateTransition(dt);
      return;
    }
    if (this.mode === 'seated' && this.seatPose) {
      const look = this.seatedLook;
      this.camera.position.copy(this.seatPose.pos);
      this.camera.quaternion.copy(this.seatPose.quat);
      this.camera.rotateY(-look.x * 0.025);
      this.camera.rotateX(-look.y * 0.015);
      this.applyShake(dt);
      return;
    }
    if (this.mode !== 'walk') {
      this.applyCamera(dt);
      return;
    }
    if (input.locked || input.dragging) {
      const s = 0.0022 * this.sensitivity;
      this.yaw -= input.mouseDX * s;
      this.pitch -= input.mouseDY * s * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }
    const fwd = (input.down.has('KeyW') || input.down.has('ArrowUp') ? 1 : 0) - (input.down.has('KeyS') || input.down.has('ArrowDown') ? 1 : 0);
    const side = (input.down.has('KeyD') || input.down.has('ArrowRight') ? 1 : 0) - (input.down.has('KeyA') || input.down.has('ArrowLeft') ? 1 : 0);
    const run = input.down.has('ShiftLeft') || input.down.has('ShiftRight');
    const speed = run ? 4.4 : 2.8;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let tx = -sin * fwd + cos * side;
    let tz = -cos * fwd - sin * side;
    const len = Math.hypot(tx, tz);
    if (len > 0) {
      tx = (tx / len) * speed;
      tz = (tz / len) * speed;
    }
    this.velocity.x = damp(this.velocity.x, tx, 12, dt);
    this.velocity.y = damp(this.velocity.y, tz, 12, dt);
    const before = this.position.clone();
    this.collision.move(this.position.x, this.position.z, this.velocity.x * dt, this.velocity.y * dt, this.radius, this.out);
    this.position.x = this.out.x;
    this.position.z = this.out.z;
    const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    this.stepDistance += moved;
    const moving = moved / Math.max(dt, 1e-4) > 0.3;
    this.bobAmt = damp(this.bobAmt, moving && this.bobEnabled ? (run ? 1.4 : 1) : 0, 8, dt);
    if (moving) this.bobT += dt * (run ? 11 : 8);
    this.applyCamera(dt);
  }

  private applyCamera(dt: number): void {
    const bobY = Math.sin(this.bobT) * 0.035 * this.bobAmt;
    const bobX = Math.cos(this.bobT * 0.5) * 0.02 * this.bobAmt;
    this.camera.position.set(this.position.x, this.eyeHeight + bobY, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, bobX * 0.5, 'YXZ');
    this.applyShake(dt);
  }

  private applyShake(dt: number): void {
    if (this.shake <= 0) return;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const s = this.shake * this.shake * 0.04;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
  }

  /** Senta na cadeira e enquadra o monitor. */
  sit(seatPos: THREE.Vector3, lookAt: THREE.Vector3, standPos: THREE.Vector3): void {
    if (this.mode === 'seated' || this.transition) return;
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(seatPos, lookAt, new THREE.Vector3(0, 1, 0)));
    this.seatPose = { pos: seatPos.clone(), quat: q };
    this.standPose = { pos: standPos.clone(), yaw: this.yaw };
    this.startTransition(seatPos, q, 0.75, 'seated');
  }

  /** Atualiza o enquadramento sentado (ex.: ao redimensionar a janela). */
  reframe(seatPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(seatPos, lookAt, new THREE.Vector3(0, 1, 0)));
    this.seatPose = { pos: seatPos.clone(), quat: q };
  }

  stand(): void {
    if (this.mode !== 'seated' || !this.standPose) return;
    const p = this.standPose.pos;
    this.position.set(p.x, 0, p.z);
    this.yaw = 0;
    this.pitch = -0.15;
    const toPos = new THREE.Vector3(p.x, this.eyeHeight, p.z);
    const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.startTransition(toPos, toQ, 0.55, 'walk');
  }

  private startTransition(to: THREE.Vector3, toQ: THREE.Quaternion, dur: number, then: PlayerMode): void {
    this.mode = 'transition';
    this.transition = {
      from: this.camera.position.clone(),
      fromQ: this.camera.quaternion.clone(),
      to: to.clone(),
      toQ: toQ.clone(),
      t: 0,
      dur,
      then,
    };
  }

  private updateTransition(dt: number): void {
    const tr = this.transition!;
    tr.t = Math.min(1, tr.t + dt / tr.dur);
    const k = tr.t < 0.5 ? 4 * tr.t ** 3 : 1 - (-2 * tr.t + 2) ** 3 / 2;
    this.camera.position.lerpVectors(tr.from, tr.to, k);
    this.camera.quaternion.slerpQuaternions(tr.fromQ, tr.toQ, k);
    if (tr.t >= 1) {
      this.mode = tr.then;
      this.transition = null;
    }
  }

  get inTransition(): boolean {
    return this.transition !== null;
  }

  /** Teleporta (início do dia). */
  spawn(x: number, z: number, yaw: number): void {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = -0.05;
    this.mode = 'walk';
    this.transition = null;
    this.velocity.set(0, 0);
    this.applyCamera(0);
  }
}
