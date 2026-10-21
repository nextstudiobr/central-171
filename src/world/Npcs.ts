import * as THREE from 'three';
import { BOSS_LINES, type NpcId } from '../data/npcs';
import type { Rng } from '../core/rng';
import { Character, LOOKS, type Pose } from './Characters';
import type { CollisionWorld } from './Collision';
import { NAV, NAV_EDGES } from './Office';

type Arrive = 'sit' | 'stand' | 'watch';

/** Um personagem que anda pelo grafo de navegação do escritório. */
export class NpcAgent {
  readonly char: Character;
  readonly pos = new THREE.Vector2();
  yaw = 0;
  private path: THREE.Vector2[] = [];
  private arrive: Arrive = 'sit';
  private arriveYaw = 0;
  node: string;
  /** Chegou ao destino pedido? */
  arrived = true;
  busy = false;
  speed = 1.25;
  idleTimer = 0;
  private poseOverride: { pose: Pose; t: number } | null = null;

  constructor(
    readonly id: NpcId,
    readonly home: string,
    readonly homeYaw: number,
    scene: THREE.Scene,
  ) {
    this.char = new Character(LOOKS[id]);
    const [x, z] = NAV[home];
    this.pos.set(x, z);
    this.yaw = homeYaw;
    this.node = home;
    this.arrive = 'sit';
    this.arriveYaw = homeYaw;
    scene.add(this.char.root);
    this.char.root.traverse((o) => (o.userData.npc = id));
  }

  /** Vai até um nó do grafo; ao chegar senta, fica em pé ou observa. */
  goTo(target: string, arrive: Arrive, yaw?: number): void {
    const route = findPath(this.node, target);
    this.path = route.map((n) => new THREE.Vector2(NAV[n][0], NAV[n][1]));
    // O primeiro ponto é o nó atual; se já estamos nele, descarta.
    if (this.path.length && this.path[0].distanceTo(this.pos) < 0.05) this.path.shift();
    this.node = target;
    this.arrive = arrive;
    this.arriveYaw = yaw ?? this.yaw;
    this.arrived = this.path.length === 0;
  }

  goHome(): void {
    this.goTo(this.home, 'sit', this.homeYaw);
    this.busy = false;
  }

  act(pose: Pose, seconds: number): void {
    this.poseOverride = { pose, t: seconds };
  }

  update(dt: number, lookAt: THREE.Vector3 | null): void {
    const c = this.char;
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.y - this.pos.y;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      const desiredYaw = Math.atan2(dx, dz);
      this.yaw = turnTowards(this.yaw, desiredYaw, dt * 8);
      if (dist <= step) {
        this.pos.copy(target);
        this.path.shift();
        if (!this.path.length) this.arrived = true;
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dz / dist) * step;
      }
      c.pose = 'walk';
      c.speed = this.speed;
    } else {
      this.yaw = turnTowards(this.yaw, this.arriveYaw, dt * 6);
      c.pose = this.arrive === 'sit' ? (this.id === 'boss' ? 'sit' : 'type') : 'stand';
      c.speed = 0;
    }
    if (this.poseOverride) {
      this.poseOverride.t -= dt;
      if (this.poseOverride.t <= 0) this.poseOverride = null;
      else if (!this.path.length) c.pose = this.poseOverride.pose;
    }
    c.root.position.set(this.pos.x, 0, this.pos.y);
    c.root.rotation.y = this.yaw;
    c.lookTarget = this.arrive === 'watch' || (!this.path.length && this.arrive === 'stand') ? lookAt : null;
    c.update(dt);
  }

  get headPosition(): THREE.Vector3 {
    const v = new THREE.Vector3();
    this.char.head.getWorldPosition(v);
    return v;
  }

  get seated(): boolean {
    return !this.path.length && this.arrive === 'sit';
  }
}

function turnTowards(a: number, b: number, maxStep: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}

/** Caminho mais curto (em número de nós) pelo grafo de navegação. */
export function findPath(from: string, to: string): string[] {
  if (from === to) return [to];
  const adj = new Map<string, string[]>();
  for (const [a, b] of NAV_EDGES) {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) break;
    for (const m of adj.get(n) ?? []) {
      if (seen.has(m)) continue;
      seen.add(m);
      prev.set(m, n);
      queue.push(m);
    }
  }
  if (!seen.has(to)) return [to];
  const path = [to];
  let cur = to;
  while (cur !== from) {
    cur = prev.get(cur)!;
    path.unshift(cur);
  }
  return path;
}

/**
 * Chefe e colegas: rotinas próprias (trabalhar, café, ronda do chefe) e
 * comandos vindos do diretor de eventos.
 */
export class NpcManager {
  readonly agents: Record<NpcId, NpcAgent>;
  private patrolTimer = 50;
  private patrolStep = -1;
  private readonly patrolRoute = ['bossDoorIn', 'bossDoorOut', 'aisleNE', 'aisleSE', 'watchPlayer', 'aisleS', 'aisleSW', 'aisleNW', 'aisleN', 'aisleNE', 'bossDoorOut', 'bossDoorIn', 'bossDesk'];
  private watchSaid = true;
  private lastSeated = true;
  private coffeeTimers: Record<'tonhao' | 'pri' | 'juninho', number> = { tonhao: 90, pri: 150, juninho: 60 };
  panic = false;
  /** Fala de reação: o jogo conecta isso aos balões e às vozes. */
  onSay: (id: NpcId, text: string) => void = () => {};

  constructor(
    scene: THREE.Scene,
    collision: CollisionWorld,
    private readonly rng: Rng,
  ) {
    this.agents = {
      boss: new NpcAgent('boss', 'bossDesk', 0, scene),
      pri: new NpcAgent('pri', 'priSeat', Math.PI, scene),
      tonhao: new NpcAgent('tonhao', 'tonhaoSeat', Math.PI, scene),
      juninho: new NpcAgent('juninho', 'juninhoSeat', 0, scene),
    };
    for (const a of Object.values(this.agents)) {
      collision.addCircle(() => (a.seated ? null : { x: a.pos.x, z: a.pos.y, r: 0.28 }));
    }
  }

  /** Reposiciona todos em seus lugares (início do dia). */
  reset(): void {
    for (const a of Object.values(this.agents)) {
      const [x, z] = NAV[a.home];
      a.pos.set(x, z);
      a.node = a.home;
      a.yaw = a.homeYaw;
      a.goTo(a.home, 'sit', a.homeYaw);
      a.busy = false;
    }
    this.patrolStep = -1;
    this.patrolTimer = 45;
    this.panic = false;
  }

  update(dt: number, playerPos: THREE.Vector3, playerSeated: boolean): void {
    const look = new THREE.Vector3(playerPos.x, 1.5, playerPos.z);
    // Ronda do chefe.
    const boss = this.agents.boss;
    if (!boss.busy) {
      if (this.patrolStep < 0) {
        this.patrolTimer -= dt;
        if (this.patrolTimer <= 0) {
          this.patrolStep = 0;
          this.nextPatrol();
        }
      } else if (boss.arrived) {
        if (!this.watchSaid && boss.node === 'watchPlayer') {
          this.watchSaid = true;
          this.onSay('boss', this.rng.pick(this.lastSeated ? BOSS_LINES.patrol : BOSS_LINES.playerAway));
        }
        if (boss.idleTimer > 0) boss.idleTimer -= dt;
        else this.nextPatrol(playerSeated);
      }
    }
    // Pausas para o café dos colegas.
    for (const id of ['tonhao', 'pri', 'juninho'] as const) {
      const a = this.agents[id];
      if (a.busy) continue;
      if (a.node === a.home && a.arrived) {
        this.coffeeTimers[id] -= dt;
        if (this.coffeeTimers[id] <= 0) {
          this.coffeeTimers[id] = this.rng.range(140, 240);
          a.goTo('coffee', 'stand', -Math.PI / 2);
          a.idleTimer = this.rng.range(8, 14);
        }
      } else if (a.node === 'coffee' && a.arrived) {
        a.idleTimer -= dt;
        if (a.idleTimer <= 0) a.goHome();
      }
    }
    for (const a of Object.values(this.agents)) {
      if (this.panic && a.arrived && !a.busy) a.act('panic', 0.5);
      a.update(dt, look);
    }
  }

  private nextPatrol(playerSeated = true): void {
    const boss = this.agents.boss;
    if (this.patrolStep >= this.patrolRoute.length) {
      this.patrolStep = -1;
      this.patrolTimer = this.rng.range(70, 120);
      boss.goTo('bossDesk', 'sit', 0);
      return;
    }
    const node = this.patrolRoute[this.patrolStep++];
    const watching = node === 'watchPlayer';
    boss.goTo(node, watching ? 'watch' : 'stand', watching ? Math.PI : undefined);
    boss.idleTimer = watching ? 5 : 0;
    this.watchSaid = !watching;
    this.lastSeated = playerSeated;
  }

  /** Comando: ir até a mesa do jogador. */
  visitPlayer(id: NpcId): void {
    const a = this.agents[id];
    a.busy = true;
    a.goTo('playerVisit', 'watch', -Math.PI / 2);
  }

  goTo(id: NpcId, spot: 'office' | 'rack' | 'desk'): void {
    const a = this.agents[id];
    a.busy = true;
    if (spot === 'office') {
      if (id === 'boss') this.patrolStep = -1;
      a.goTo(id === 'boss' ? 'bossDesk' : 'bossGuest', 'stand', 0);
    } else if (spot === 'rack') a.goTo('rackFront', 'stand', -Math.PI / 2);
    else a.goTo('playerVisit', 'watch');
  }

  release(id: NpcId): void {
    const a = this.agents[id];
    if (id === 'boss') {
      a.busy = false;
      this.patrolTimer = this.rng.range(40, 80);
      a.goTo('bossDesk', 'sit', 0);
      return;
    }
    a.goHome();
  }

  arrived(id: NpcId): boolean {
    return this.agents[id].arrived;
  }

  /** NPC atingido por um objeto (para interação). */
  static npcOf(o: THREE.Object3D): NpcId | null {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      if (cur.userData.npc) return cur.userData.npc as NpcId;
      cur = cur.parent;
    }
    return null;
  }
}
