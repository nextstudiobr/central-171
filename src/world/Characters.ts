import * as THREE from 'three';

export interface CharacterLook {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  hairStyle: 'bald' | 'short' | 'bun' | 'cap' | 'beanie' | 'long' | 'mohawk';
  height: number;
  girth: number;
  glasses?: boolean;
  tie?: string;
  mustache?: boolean;
  headset?: boolean;
  belly?: boolean;
}

export type Pose = 'stand' | 'walk' | 'sit' | 'type' | 'yell' | 'panic';

const geo = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 20),
};

/**
 * Personagem procedural articulado (quadril, joelhos, ombros, cotovelos,
 * cabeça) com poses e animações simples. Estilo "boneco de escritório".
 */
export class Character {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly legs: Array<{ hip: THREE.Group; knee: THREE.Group }> = [];
  private readonly arms: Array<{ shoulder: THREE.Group; elbow: THREE.Group }> = [];
  private readonly mouth: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  pose: Pose = 'stand';
  talking = 0;
  private t = Math.random() * 10;
  private walkPhase = 0;
  /** Velocidade atual (m/s), usada para o ciclo de caminhada. */
  speed = 0;
  /** Ponto para onde a cabeça olha (opcional). */
  lookTarget: THREE.Vector3 | null = null;

  constructor(readonly look: CharacterLook) {
    const m = (color: string, rough = 0.75) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: rough });
      this.materials.push(mat);
      return mat;
    };
    const skin = m(look.skin, 0.6);
    const shirt = m(look.shirt, 0.85);
    const pants = m(look.pants, 0.9);
    const hair = m(look.hair, 0.9);
    const dark = m('#1b1b1f', 0.4);
    const shoe = m('#2a2420', 0.6);
    const h = look.height;
    const g = look.girth;

    const mesh = (gm: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(gm, mat);
      o.scale.set(sx, sy, sz);
      o.position.set(x, y, z);
      // Detalhes pequenos (olhos, sobrancelhas, sapatos) não precisam projetar sombra.
      o.castShadow = Math.max(sx, sy, sz) > 0.07;
      o.receiveShadow = true;
      return o;
    };

    // Quadril e pernas (coxa + canela com joelho).
    const hipY = 0.92 * h;
    this.hips.position.y = hipY;
    this.root.add(this.hips);
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1 * g, 0, 0);
      const thigh = mesh(geo.capsule, pants, 0.085 * g, 0.3 * h, 0.085 * g, 0, -0.22 * h, 0);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.45 * h;
      knee.add(mesh(geo.capsule, pants, 0.075 * g, 0.28 * h, 0.075 * g, 0, -0.2 * h, 0));
      knee.add(mesh(geo.box, shoe, 0.11 * g, 0.07, 0.24, 0, -0.43 * h, 0.05));
      hip.add(knee);
      this.hips.add(hip);
      this.legs.push({ hip, knee });
    }

    // Tronco.
    this.torso.position.y = 0;
    this.hips.add(this.torso);
    const torsoH = 0.52 * h;
    this.torso.add(mesh(geo.capsule, shirt, 0.19 * g, torsoH * 0.55, 0.13 * g * (look.belly ? 1.35 : 1), 0, torsoH * 0.5, look.belly ? 0.03 : 0));
    if (look.tie) {
      const tie = mesh(geo.box, m(look.tie, 0.5), 0.05, 0.3, 0.02, 0, torsoH * 0.62, 0.13 * g * (look.belly ? 1.4 : 1.05));
      tie.castShadow = false;
      this.torso.add(tie);
    }

    // Braços (ombro + cotovelo).
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.24 * g, torsoH * 0.88, 0);
      shoulder.add(mesh(geo.capsule, shirt, 0.06 * g, 0.2 * h, 0.06 * g, 0, -0.15 * h, 0));
      const elbow = new THREE.Group();
      elbow.position.y = -0.31 * h;
      elbow.add(mesh(geo.capsule, shirt, 0.052 * g, 0.17 * h, 0.052 * g, 0, -0.13 * h, 0));
      elbow.add(mesh(geo.sphere, skin, 0.055, 0.06, 0.055, 0, -0.27 * h, 0));
      shoulder.add(elbow);
      this.torso.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }

    // Cabeça.
    this.head.position.y = torsoH + 0.17;
    this.torso.add(this.head);
    this.head.add(mesh(geo.cyl, skin, 0.05, 0.12, 0.05, 0, -0.08, 0));
    this.head.add(mesh(geo.sphere, skin, 0.125, 0.145, 0.13, 0, 0.04, 0));
    for (const side of [-1, 1]) {
      this.head.add(mesh(geo.sphere, dark, 0.017, 0.022, 0.012, side * 0.045, 0.06, 0.118));
      const brow = mesh(geo.box, hair, 0.045, 0.012, 0.012, side * 0.047, 0.1, 0.12);
      brow.rotation.z = side * -0.12;
      this.head.add(brow);
      this.head.add(mesh(geo.sphere, skin, 0.02, 0.032, 0.02, side * 0.128, 0.04, 0));
    }
    this.head.add(mesh(geo.sphere, skin, 0.022, 0.028, 0.03, 0, 0.025, 0.128));
    this.mouth = mesh(geo.box, m('#5a1f1f', 0.6), 0.045, 0.01, 0.01, 0, -0.03, 0.122);
    this.head.add(this.mouth);
    if (look.mustache) this.head.add(mesh(geo.box, hair, 0.075, 0.02, 0.02, 0, -0.005, 0.127));
    this.addHair(look, hair);
    if (look.glasses) {
      const frame = m('#111111', 0.3);
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(geo.torus, frame);
        lens.scale.setScalar(0.03);
        lens.position.set(side * 0.047, 0.06, 0.128);
        this.head.add(lens);
      }
      this.head.add(mesh(geo.box, frame, 0.03, 0.006, 0.006, 0, 0.065, 0.13));
    }
    if (look.headset) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 24, Math.PI), dark);
      band.position.y = 0.06;
      this.head.add(band);
      for (const side of [-1, 1]) {
        const cup = mesh(geo.cyl, dark, 0.045, 0.03, 0.045, side * 0.135, 0.04, 0);
        cup.rotation.z = Math.PI / 2;
        this.head.add(cup);
      }
      const mic = mesh(geo.box, dark, 0.01, 0.01, 0.12, 0.11, -0.02, 0.07);
      mic.rotation.y = -0.5;
      this.head.add(mic);
    }
  }

  private addHair(look: CharacterLook, hair: THREE.Material): void {
    const add = (o: THREE.Mesh) => {
      o.castShadow = true;
      this.head.add(o);
    };
    const s = (sx: number, sy: number, sz: number, x: number, y: number, z: number, gm: THREE.BufferGeometry = geo.sphere) => {
      const o = new THREE.Mesh(gm, hair);
      o.scale.set(sx, sy, sz);
      o.position.set(x, y, z);
      return o;
    };
    switch (look.hairStyle) {
      case 'bald':
        add(s(0.13, 0.06, 0.12, 0, 0.0, -0.03));
        break;
      case 'short':
        add(s(0.133, 0.1, 0.135, 0, 0.09, -0.01));
        break;
      case 'bun':
        add(s(0.135, 0.11, 0.14, 0, 0.08, -0.015));
        add(s(0.06, 0.06, 0.06, 0, 0.2, -0.08));
        break;
      case 'long':
        add(s(0.138, 0.12, 0.142, 0, 0.07, -0.01));
        add(s(0.13, 0.17, 0.07, 0, -0.04, -0.08));
        break;
      case 'mohawk':
        add(s(0.025, 0.09, 0.13, 0, 0.16, -0.01));
        break;
      case 'cap': {
        add(s(0.138, 0.085, 0.14, 0, 0.1, -0.005));
        const brim = new THREE.Mesh(geo.box, hair);
        brim.scale.set(0.16, 0.012, 0.11);
        brim.position.set(0, 0.11, 0.14);
        add(brim);
        break;
      }
      case 'beanie':
        add(s(0.142, 0.13, 0.145, 0, 0.1, -0.005));
        add(s(0.03, 0.03, 0.03, 0, 0.245, -0.01));
        break;
    }
  }

  /** Avança a animação. */
  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const [L, R] = this.legs;
    const [AL, AR] = this.arms;
    const reset = () => {
      for (const l of this.legs) {
        l.hip.rotation.set(0, 0, 0);
        l.knee.rotation.set(0, 0, 0);
      }
      for (const a of this.arms) {
        a.shoulder.rotation.set(0, 0, 0);
        a.elbow.rotation.set(0, 0, 0);
      }
      this.torso.rotation.set(0, 0, 0);
      this.hips.position.y = 0.92 * this.look.height;
      this.hips.position.z = 0;
    };
    reset();
    const breathe = Math.sin(t * 1.6) * 0.012;
    switch (this.pose) {
      case 'walk': {
        this.walkPhase += dt * Math.max(2.5, this.speed * 5.2);
        const p = this.walkPhase;
        L.hip.rotation.x = Math.sin(p) * 0.55;
        R.hip.rotation.x = -Math.sin(p) * 0.55;
        L.knee.rotation.x = Math.max(0, -Math.sin(p)) * 0.8;
        R.knee.rotation.x = Math.max(0, Math.sin(p)) * 0.8;
        AL.shoulder.rotation.x = -Math.sin(p) * 0.45;
        AR.shoulder.rotation.x = Math.sin(p) * 0.45;
        AL.elbow.rotation.x = -0.25;
        AR.elbow.rotation.x = -0.25;
        this.hips.position.y += Math.abs(Math.cos(p)) * 0.035;
        this.torso.rotation.y = Math.sin(p) * 0.06;
        break;
      }
      case 'sit':
      case 'type': {
        this.hips.position.y = 0.5;
        this.hips.position.z = -0.05;
        for (const l of this.legs) {
          l.hip.rotation.x = -Math.PI / 2;
          l.knee.rotation.x = Math.PI / 2;
        }
        this.torso.rotation.x = 0.05 + breathe;
        if (this.pose === 'type') {
          for (const [i, a] of this.arms.entries()) {
            a.shoulder.rotation.x = -0.75;
            a.shoulder.rotation.z = (i === 0 ? 1 : -1) * 0.12;
            a.elbow.rotation.x = -0.9 + Math.sin(t * (14 + i * 3)) * 0.12;
          }
        } else {
          AL.shoulder.rotation.x = -0.35;
          AR.shoulder.rotation.x = -0.35;
          AL.elbow.rotation.x = -1.0;
          AR.elbow.rotation.x = -1.0;
        }
        break;
      }
      case 'yell': {
        AL.shoulder.rotation.x = -2.2 + Math.sin(t * 9) * 0.3;
        AR.shoulder.rotation.x = -0.4;
        AR.elbow.rotation.x = -1.2;
        AL.elbow.rotation.x = -0.3;
        this.torso.rotation.x = -0.08 + breathe;
        break;
      }
      case 'panic': {
        AL.shoulder.rotation.z = 2.6 + Math.sin(t * 14) * 0.25;
        AR.shoulder.rotation.z = -2.6 - Math.sin(t * 14) * 0.25;
        this.hips.position.y += Math.abs(Math.sin(t * 10)) * 0.05;
        break;
      }
      default: {
        this.torso.rotation.x = breathe;
        AL.shoulder.rotation.z = 0.08;
        AR.shoulder.rotation.z = -0.08;
        AL.elbow.rotation.x = -0.12;
        AR.elbow.rotation.x = -0.12;
      }
    }
    // Fala: boca e cabeça.
    if (this.talking > 0) {
      this.talking -= dt;
      this.mouth.scale.y = 0.01 + Math.abs(Math.sin(t * 17)) * 0.03;
      this.head.rotation.x = Math.sin(t * 6) * 0.06;
    } else {
      this.mouth.scale.y = 0.01;
      this.head.rotation.x = 0;
    }
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      const yaw = Math.atan2(local.x, local.z);
      this.head.rotation.y = THREE.MathUtils.clamp(yaw, -1.1, 1.1);
    } else {
      this.head.rotation.y = Math.sin(t * 0.3) * 0.25;
    }
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}

/** Aparência do chefe e dos colegas. */
export const LOOKS: Record<'boss' | 'tonhao' | 'pri' | 'juninho', CharacterLook> = {
  boss: { skin: '#e3b28f', shirt: '#2d3a5c', pants: '#1e2333', hair: '#3a2e28', hairStyle: 'bald', height: 1.02, girth: 1.25, tie: '#b8202c', mustache: true, belly: true },
  tonhao: { skin: '#8c5a3c', shirt: '#2f7d4f', pants: '#2b2f3a', hair: '#1a1a1a', hairStyle: 'beanie', height: 1.08, girth: 1.4, headset: true, belly: true },
  pri: { skin: '#f0c9a8', shirt: '#7a3d8f', pants: '#22242c', hair: '#5a2a1a', hairStyle: 'bun', height: 0.97, girth: 0.95, glasses: true, headset: true },
  juninho: { skin: '#d9a77f', shirt: '#d9a43a', pants: '#3a4a6a', hair: '#c0392b', hairStyle: 'cap', height: 0.95, girth: 0.9, headset: true },
};
