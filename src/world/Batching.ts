import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Junta malhas estáticas que usam o mesmo material numa única malha.
 * Reduz centenas de chamadas de desenho (inclusive nas passadas de sombra)
 * sem mudar a aparência. Objetos interativos ou animados ficam de fora.
 *
 * Exemplo: `batchStatic(scene, new Set([phone.root, chair]))`
 */
export function batchStatic(scene: THREE.Scene, exclude: Set<THREE.Object3D>): { before: number; after: number } {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  const isExcluded = (o: THREE.Object3D): boolean => {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      if (exclude.has(cur) || cur.userData.dynamic || cur.userData.npc) return true;
      cur = cur.parent;
    }
    return false;
  };
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    before++;
    if (Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial) return;
    if (isExcluded(m)) return;
    const g = m.geometry;
    const attrs = Object.keys(g.attributes).sort().join(',');
    const key = `${mat.uuid}|${attrs}|${m.castShadow}|${m.receiveShadow}`;
    let group = groups.get(key);
    if (!group) {
      group = { material: mat, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] };
      groups.set(key, group);
    }
    const clone = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m.matrixWorld);
    // Mantém só os atributos comuns que o material usa.
    for (const name of Object.keys(clone.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) clone.deleteAttribute(name);
    clone.morphAttributes = {};
    group.geos.push(clone);
    group.meshes.push(m);
  });
  let merged = 0;
  for (const g of groups.values()) {
    if (g.meshes.length < 2) {
      for (const geo of g.geos) geo.dispose();
      continue;
    }
    const geo = mergeGeometries(g.geos, false);
    for (const x of g.geos) x.dispose();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, g.material);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.name = 'batched';
    scene.add(mesh);
    for (const m of g.meshes) {
      m.removeFromParent();
    }
    merged += g.meshes.length - 1;
  }
  return { before, after: before - merged };
}

/** Desliga a sombra projetada de objetos pequenos (teclados, canecas, post-its). */
export function trimSmallShadowCasters(root: THREE.Object3D, minRadius = 0.22): number {
  let n = 0;
  const sphere = new THREE.Sphere();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.castShadow || o.userData.npc) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    sphere.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld);
    if (sphere.radius < minRadius) {
      m.castShadow = false;
      n++;
    }
  });
  return n;
}
