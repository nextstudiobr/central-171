/**
 * Colisão 2D no plano XZ: caixas estáticas (paredes, móveis) e círculos
 * dinâmicos (personagens). Suficiente para um escritório e muito barato.
 */
export interface Box2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  tag?: string;
}

export interface Circle2 {
  x: number;
  z: number;
  r: number;
}

export class CollisionWorld {
  boxes: Box2[] = [];
  circles: Array<() => Circle2 | null> = [];

  /** Adiciona uma caixa centrada em (x, z) com largura w (X) e profundidade d (Z). */
  addBox(x: number, z: number, w: number, d: number, tag?: string): Box2 {
    const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, tag };
    this.boxes.push(b);
    return b;
  }

  /** Caixa rotacionada em múltiplos de 90° (troca largura e profundidade). */
  addBoxRot(x: number, z: number, w: number, d: number, rotY: number, tag?: string): Box2 {
    const quarter = Math.round(rotY / (Math.PI / 2)) % 2 !== 0;
    return quarter ? this.addBox(x, z, d, w, tag) : this.addBox(x, z, w, d, tag);
  }

  addCircle(fn: () => Circle2 | null): void {
    this.circles.push(fn);
  }

  /**
   * Move um círculo de (x, z) para (x+dx, z+dz) resolvendo penetrações.
   * Devolve a posição final. Faz sub-passos para não atravessar paredes finas.
   */
  move(x: number, z: number, dx: number, dz: number, r: number, out: { x: number; z: number }): { x: number; z: number } {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    let px = x;
    let pz = z;
    for (let s = 0; s < steps; s++) {
      px += dx / steps;
      pz += dz / steps;
      for (let iter = 0; iter < 3; iter++) {
        let moved = false;
        for (const b of this.boxes) {
          const cx = Math.max(b.minX, Math.min(px, b.maxX));
          const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
          let ox = px - cx;
          let oz = pz - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            px += (ox / d) * (r - d);
            pz += (oz / d) * (r - d);
          } else {
            // Centro dentro da caixa: empurra pela menor saída.
            const left = px - b.minX;
            const right = b.maxX - px;
            const back = pz - b.minZ;
            const front = b.maxZ - pz;
            const m = Math.min(left, right, back, front);
            if (m === left) px = b.minX - r;
            else if (m === right) px = b.maxX + r;
            else if (m === back) pz = b.minZ - r;
            else pz = b.maxZ + r;
            ox = oz = 0;
          }
          moved = true;
        }
        for (const fn of this.circles) {
          const c = fn();
          if (!c) continue;
          const ox = px - c.x;
          const oz = pz - c.z;
          const rr = r + c.r;
          const d2 = ox * ox + oz * oz;
          if (d2 >= rr * rr || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          px += (ox / d) * (rr - d);
          pz += (oz / d) * (rr - d);
          moved = true;
        }
        if (!moved) break;
      }
    }
    out.x = px;
    out.z = pz;
    return out;
  }

  /** Há alguma caixa no ponto? */
  blocked(x: number, z: number, r: number): boolean {
    for (const b of this.boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }
}
