import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Assets } from './Assets';
import { batchStatic, trimSmallShadowCasters } from './Batching';
import { CollisionWorld } from './Collision';
import { CanvasSurface, MonitorScreen, NewsTv, Whiteboard, coworkerScreen, poster } from './Screens';

/** Dimensões do andar (metros). */
export const ROOM = { minX: -11, maxX: 11, minZ: -8, maxZ: 8, height: 3.2 };

/** Pontos de navegação dos personagens (x, z). */
export const NAV: Record<string, [number, number]> = {
  aisleS: [0, 2.95],
  aisleSW: [-3.4, 2.95],
  aisleSE: [3.4, 2.95],
  aisleNW: [-3.4, -2.25],
  aisleN: [0, -2.25],
  aisleNE: [3.4, -2.25],
  priAisle: [-1.6, 2.95],
  playerAisle: [0.8, 2.95],
  tonhaoAisle: [1.6, 2.95],
  priSeat: [-1.6, 1.62],
  tonhaoSeat: [1.6, 1.62],
  playerVisit: [0.85, 2.05],
  juninhoSeat: [0, -0.68],
  bossDoorOut: [5.8, -1.7],
  bossDoorIn: [5.8, -3.3],
  bossGuest: [7.4, -3.7],
  bossSide: [7.15, -6.05],
  bossDesk: [8.6, -6.0],
  westS: [-8.3, 2.95],
  rackFront: [-9.1, 5.4],
  pantry: [-7.6, -3.0],
  coffee: [-9.3, -5.6],
  watchPlayer: [0.3, 2.35],
};

export const NAV_EDGES: Array<[string, string]> = [
  ['aisleSW', 'priAisle'],
  ['priAisle', 'aisleS'],
  ['aisleS', 'playerAisle'],
  ['playerAisle', 'tonhaoAisle'],
  ['tonhaoAisle', 'aisleSE'],
  ['priAisle', 'priSeat'],
  ['tonhaoAisle', 'tonhaoSeat'],
  ['playerAisle', 'playerVisit'],
  ['playerAisle', 'watchPlayer'],
  ['aisleSW', 'aisleNW'],
  ['aisleSE', 'aisleNE'],
  ['aisleNW', 'aisleN'],
  ['aisleN', 'aisleNE'],
  ['aisleN', 'juninhoSeat'],
  ['aisleNE', 'bossDoorOut'],
  ['bossDoorOut', 'bossDoorIn'],
  ['bossDoorIn', 'bossGuest'],
  ['bossGuest', 'bossSide'],
  ['bossSide', 'bossDesk'],
  ['aisleSW', 'westS'],
  ['westS', 'rackFront'],
  ['aisleNW', 'pantry'],
  ['pantry', 'coffee'],
];

export interface OfficeRefs {
  scene: THREE.Scene;
  collision: CollisionWorld;
  /** Alvos de interação nomeados (meshes atingíveis pelo raio da câmera). */
  targets: Record<string, THREE.Object3D>;
  /** Posições importantes. */
  spots: Record<string, THREE.Vector3>;
  monitor: MonitorScreen;
  monitorMesh: THREE.Mesh;
  /** Centro, normal e tamanho da tela do jogador (para o desktop HTML). */
  screen: { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number };
  whiteboard: Whiteboard;
  tv: NewsTv;
  phone: PhoneRig;
  clockHands: { hour: THREE.Object3D; minute: THREE.Object3D };
  lights: LightRig;
  rackLeds: THREE.InstancedMesh;
  sky: THREE.Mesh;
  cityWindows: THREE.MeshStandardMaterial;
  nameplate: CanvasSurface;
  safeDisplay: CanvasSurface;
  emissiveScreens: THREE.MeshStandardMaterial[];
  breakerLever: THREE.Object3D;
}

export interface PhoneRig {
  root: THREE.Group;
  handset: THREE.Group;
  led: THREE.MeshStandardMaterial;
  ringT: number;
}

export interface LightRig {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  ceiling: THREE.PointLight[];
  panels: THREE.MeshStandardMaterial;
  deskLamp: THREE.SpotLight;
  monitorGlow: THREE.PointLight;
  emergency: THREE.PointLight[];
  police: THREE.PointLight[];
  flicker: { light: THREE.PointLight; panel: THREE.Mesh } | null;
}

const PLAYER_DESK = new THREE.Vector3(0, 0, 1);

/** Monta o andar inteiro da Disk Fortuna Soluções. */
export function buildOffice(assets: Assets): OfficeRefs {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1016');
  scene.fog = new THREE.Fog('#1a2129', 60, 170);
  if (assets.envMap) {
    scene.environment = assets.envMap;
    scene.environmentIntensity = 0.35;
  }
  const collision = new CollisionWorld();
  const targets: Record<string, THREE.Object3D> = {};
  const spots: Record<string, THREE.Vector3> = {};
  const emissiveScreens: THREE.MeshStandardMaterial[] = [];

  // ------------------------------------------------------------ materiais
  const plaster = assets.textures.plaster;
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#aeb9b6',
    roughness: 0.92,
    map: plaster?.map ?? null,
    normalMap: plaster?.normalMap ?? null,
    roughnessMap: plaster?.roughnessMap ?? null,
  });
  if (plaster) for (const t of [plaster.map, plaster.normalMap, plaster.roughnessMap]) t.repeat.set(3, 1);
  const carpet = assets.textures.carpet;
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#c3ccd6',
    roughness: 1,
    map: carpet?.map ?? null,
    normalMap: carpet?.normalMap ?? null,
    roughnessMap: carpet?.roughnessMap ?? null,
  });
  if (carpet) for (const t of [carpet.map, carpet.normalMap, carpet.roughnessMap]) t.repeat.set(7, 5);
  // Forro de placas acústicas: textura procedural nítida, com a textura do Poly Haven como relevo.
  const ceil = assets.textures.ceiling;
  const tiles = ceilingTiles();
  tiles.texture.wrapS = tiles.texture.wrapT = THREE.RepeatWrapping;
  tiles.texture.repeat.set(W_TILES, D_TILES);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: '#d9ddd8',
    roughness: 0.95,
    map: tiles.texture,
    normalMap: ceil?.normalMap ?? null,
    normalScale: new THREE.Vector2(0.25, 0.25),
  });
  if (ceil) ceil.normalMap.repeat.set(11, 8);
  const trimMat = new THREE.MeshStandardMaterial({ color: '#2b3138', roughness: 0.5, metalness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: '#e8862e', roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1c2026', roughness: 0.55, metalness: 0.3 });
  const partitionMat = new THREE.MeshStandardMaterial({ color: '#3d5560', roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#9fc5cf',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    envMapIntensity: 1.2,
  });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const place = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    scene.add(o);
    return o;
  };

  // ------------------------------------------------------------ casca
  const W = ROOM.maxX - ROOM.minX;
  const D = ROOM.maxZ - ROOM.minZ;
  const H = ROOM.height;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  // Paredes sul, leste e oeste.
  box(W, H, 0.2, wallMat, 0, H / 2, ROOM.maxZ + 0.1, false);
  box(0.2, H, D, wallMat, ROOM.maxX + 0.1, H / 2, 0, false);
  box(0.2, H, D, wallMat, ROOM.minX - 0.1, H / 2, 0, false);
  collision.addBox(0, ROOM.maxZ + 0.1, W + 1, 0.2);
  collision.addBox(ROOM.maxX + 0.1, 0, 0.2, D + 1);
  collision.addBox(ROOM.minX - 0.1, 0, 0.2, D + 1);
  collision.addBox(0, ROOM.minZ - 0.1, W + 1, 0.2);
  // Barra inferior mais escura nas paredes (dá base e profundidade à sala).
  const bandMat = new THREE.MeshStandardMaterial({ color: '#3f4f57', roughness: 0.9 });
  box(W, 1.0, 0.02, bandMat, 0, 0.5, ROOM.maxZ - 0.012, false);
  box(0.02, 1.0, D, bandMat, ROOM.maxX - 0.012, 0.5, 0, false);
  box(0.02, 1.0, D, bandMat, ROOM.minX + 0.012, 0.5, 0, false);
  box(W, 0.04, 0.03, accentMat, 0, 1.0, ROOM.maxZ - 0.02, false);
  box(0.03, 0.04, D, accentMat, ROOM.maxX - 0.02, 1.0, 0, false);
  box(0.03, 0.04, D, accentMat, ROOM.minX + 0.02, 1.0, 0, false);
  // Faixa de carpete mais clara marcando os corredores principais.
  const runnerMat = new THREE.MeshStandardMaterial({ color: '#4a5d6b', roughness: 1, map: carpet?.map ?? null });
  for (const [x, z, w, d] of [[0, 2.95, 15, 1.2], [3.4, 0.35, 1.2, 5.2], [-3.4, 0.35, 1.2, 5.2], [0, -2.25, 8, 1.2]] as Array<[number, number, number, number]>) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), runnerMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.004, z);
    r.receiveShadow = true;
    scene.add(r);
  }
  // Rodapé.
  box(W, 0.1, 0.03, trimMat, 0, 0.05, ROOM.maxZ - 0.01, false);
  box(0.03, 0.1, D, trimMat, ROOM.maxX - 0.01, 0.05, 0, false);
  box(0.03, 0.1, D, trimMat, ROOM.minX + 0.01, 0.05, 0, false);

  // Parede norte com janelas.
  const winBottom = 0.85;
  const winTop = 2.55;
  box(W, winBottom, 0.25, wallMat, 0, winBottom / 2, ROOM.minZ - 0.05, false);
  box(W, H - winTop, 0.25, wallMat, 0, (H + winTop) / 2, ROOM.minZ - 0.05, false);
  const winCount = 9;
  const winSpan = W / winCount;
  const slatGeo = new THREE.BoxGeometry(winSpan - 0.3, 0.012, 0.05);
  const slatMat = new THREE.MeshStandardMaterial({ color: '#d9d6cc', roughness: 0.7 });
  const slatsPerWindow = 22;
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, winCount * slatsPerWindow);
  slats.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i <= winCount; i++) {
    const x = ROOM.minX + i * winSpan;
    box(0.22, winTop - winBottom, 0.3, trimMat, x, (winTop + winBottom) / 2, ROOM.minZ - 0.05);
  }
  for (let i = 0; i < winCount; i++) {
    const cx = ROOM.minX + (i + 0.5) * winSpan;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winSpan - 0.2, winTop - winBottom), glassMat);
    glass.position.set(cx, (winTop + winBottom) / 2, ROOM.minZ - 0.03);
    scene.add(glass);
    // Persianas parcialmente abaixadas, cada janela numa altura.
    const drop = 0.35 + ((i * 37) % 5) * 0.12;
    for (let k = 0; k < slatsPerWindow; k++) {
      const y = winTop - 0.04 - k * ((winTop - winBottom) / slatsPerWindow);
      const visible = winTop - y < (winTop - winBottom) * drop;
      dummy.position.set(cx, visible ? y : -50, ROOM.minZ + 0.06);
      dummy.rotation.set(0.55, 0, 0);
      dummy.updateMatrix();
      slats.setMatrixAt(i * slatsPerWindow + k, dummy.matrix);
    }
  }
  scene.add(slats);
  box(W, 0.06, 0.32, trimMat, 0, winBottom, ROOM.minZ + 0.1, false);

  // ------------------------------------------------------------ cidade lá fora
  const { sky, cityWindows } = buildCity(scene);

  // ------------------------------------------------------------ iluminação
  const hemi = new THREE.HemisphereLight('#9fb8c8', '#2a2018', 0.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b8', 2.2);
  sun.position.set(-6, 9, -22);
  sun.target.position.set(0, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16;
  sc.right = 16;
  sc.top = 14;
  sc.bottom = -14;
  sc.near = 5;
  sc.far = 60;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const panelMat = new THREE.MeshStandardMaterial({ color: '#f4f8ff', emissive: '#e8f2ff', emissiveIntensity: 1.3 });
  const panelGeo = new THREE.BoxGeometry(1.2, 0.04, 0.6);
  const ceilingLights: THREE.PointLight[] = [];
  let flicker: LightRig['flicker'] = null;
  const panelPositions: Array<[number, number]> = [];
  for (let x = -9; x <= 9; x += 3) for (let z = -6; z <= 6; z += 3) panelPositions.push([x, z]);
  for (const [x, z] of panelPositions) {
    const p = new THREE.Mesh(panelGeo, panelMat);
    p.position.set(x, H - 0.02, z);
    scene.add(p);
    box(1.28, 0.03, 0.68, trimMat, x, H - 0.005, z, false);
  }
  const lightGrid: Array<[number, number]> = [
    [-7.5, -4.5],
    [-1.5, -4.5],
    [6, -4.5],
    [-7.5, 3],
    [-1.5, 1.5],
    [4.5, 3],
  ];
  lightGrid.forEach(([x, z], i) => {
    const l = new THREE.PointLight('#e6f0ff', 7, 12, 1.7);
    l.position.set(x, H - 0.85, z);
    scene.add(l);
    ceilingLights.push(l);
    if (i === 3) {
      const flickPanel = new THREE.Mesh(panelGeo, panelMat.clone());
      flickPanel.position.set(-9, H - 0.03, 6);
      scene.add(flickPanel);
      flicker = { light: l, panel: flickPanel };
    }
  });

  // ------------------------------------------------------------ estações de trabalho
  const deskW = 1.45;
  const deskD = 0.74;
  const deskH = 0.74;
  const makeDesk = (x: number, z: number, facingNorth: boolean, opts: { owner?: string; seed: number; monitorOn?: boolean; clutter?: number }) => {
    const rot = facingNorth ? 0 : Math.PI;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    const desk = assets.instance('desk', { width: deskW, height: deskH, depth: deskD, exact: true }, 0xd8cfc0);
    g.add(desk);
    collision.addBox(x, z, deskW + 0.02, deskD + 0.02);
    // Divisória baixa na frente da mesa.
    const part = new THREE.Mesh(new THREE.BoxGeometry(deskW + 0.1, 1.25, 0.05), partitionMat);
    part.position.set(0, 0.625, -deskD / 2 - 0.04);
    part.castShadow = true;
    part.receiveShadow = true;
    g.add(part);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(deskW + 0.12, 0.03, 0.07), trimMat);
    cap.position.set(0, 1.265, -deskD / 2 - 0.04);
    g.add(cap);
    if (opts.owner !== 'player') {
      const mon = makeMonitor(0.5, 0.3, opts.monitorOn ?? false);
      mon.group.position.set(0, deskH, -0.18);
      g.add(mon.group);
      if (opts.monitorOn) {
        const surf = coworkerScreen(opts.seed, opts.owner ?? 'FortunaOS');
        mon.screenMat.map = surf.texture;
        mon.screenMat.emissiveMap = surf.texture;
        mon.screenMat.emissive.set('#ffffff');
        mon.screenMat.emissiveIntensity = 0.9;
        emissiveScreens.push(mon.screenMat);
      }
      const kb = assets.instance('computerKeyboard', { width: 0.42 });
      kb.position.set(0, deskH, 0.1);
      g.add(kb);
      const chair = assets.instance('chairDesk', { height: 0.95 });
      chair.position.set(0.05, 0, 0.62);
      chair.rotation.y = Math.PI + 0.2 * Math.sin(opts.seed);
      g.add(chair);
      const clutter = opts.clutter ?? 0;
      if (clutter > 0) {
        const items: Array<Parameters<Assets['instance']>[0]> = ['books', 'plantSmall1', 'cardboardBoxClosed', 'plantSmall3', 'radio'];
        const item = assets.instance(items[opts.seed % items.length], { width: 0.28 });
        item.position.set(-0.52, deskH, -0.12);
        g.add(item);
      }
    }
    return g;
  };

  // Ilha central (jogador e colegas).
  makeDesk(-1.6, 1, true, { owner: 'Pri — Planilha de Vovós', seed: 1, monitorOn: true, clutter: 1 });
  const playerDesk = makeDesk(PLAYER_DESK.x, PLAYER_DESK.z, true, { owner: 'player', seed: 0 });
  makeDesk(1.6, 1, true, { owner: 'Tonhão — Contatos', seed: 2, monitorOn: true, clutter: 1 });
  makeDesk(-1.6, 0, false, { seed: 5, clutter: 1 });
  makeDesk(0, 0, false, { owner: 'Juninho — Vídeos de gato', seed: 3, monitorOn: true });
  makeDesk(1.6, 0, false, { seed: 7, clutter: 1 });
  // Ilha oeste (mesas vazias de quem já foi demitido).
  makeDesk(-6.4, 1, true, { seed: 11, clutter: 1 });
  makeDesk(-4.8, 1, true, { seed: 12, monitorOn: true, owner: 'Bloqueado' });
  makeDesk(-6.4, 0, false, { seed: 13 });
  makeDesk(-4.8, 0, false, { seed: 14, clutter: 1 });
  // Fileira sul.
  for (const [i, x] of [-4.8, -3.2, -1.6, 0, 1.6].entries()) makeDesk(x, 4.7, true, { seed: 20 + i, clutter: i % 2, monitorOn: i === 2, owner: 'Pausa para o café' });
  // Cadeiras dos colegas viram colisores leves.
  for (const [x, z] of [[-1.6, 1.62], [1.6, 1.62], [0, -0.68]] as Array<[number, number]>) spots[`seat_${x}_${z}`] = new THREE.Vector3(x, 0, z);

  // ------------------------------------------------------------ mesa do jogador
  const pd = playerDesk;
  const chair = assets.instance('chairDesk', { height: 0.95 }, 0xe8862e);
  chair.position.set(0, 0, 0.72);
  chair.rotation.y = Math.PI;
  pd.add(chair);
  targets.chair = chair;
  const mon = makeMonitor(0.62, 0.38, true, true);
  mon.group.position.set(0, deskH, -0.2);
  pd.add(mon.group);
  const monitor = new MonitorScreen();
  mon.screenMat.map = monitor.texture;
  mon.screenMat.emissiveMap = monitor.texture;
  mon.screenMat.emissive.set('#ffffff');
  mon.screenMat.emissiveIntensity = 1;
  emissiveScreens.push(mon.screenMat);
  targets.monitor = mon.group;
  const kb = assets.instance('computerKeyboard', { width: 0.44 });
  kb.position.set(-0.05, deskH, 0.08);
  pd.add(kb);
  const mouse = assets.instance('computerMouse', { width: 0.07 });
  mouse.position.set(0.28, deskH, 0.1);
  pd.add(mouse);
  const lamp = assets.instance('lampSquareTable', { height: 0.42 });
  lamp.position.set(-0.58, deskH, -0.18);
  pd.add(lamp);
  // Caneca, post-its, plaquinha.
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 16), accentMat);
  mug.position.set(-0.42, deskH + 0.05, 0.12);
  mug.castShadow = true;
  pd.add(mug);
  const postitColors = ['#ffe066', '#ff9fb2', '#9ff0c1'];
  postitColors.forEach((c, i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    p.position.set(0.36 + i * 0.075, deskH + 0.29 + (i % 2) * 0.03, -0.215);
    p.rotation.z = (i - 1) * 0.1;
    pd.add(p);
  });
  const nameplate = new CanvasSurface(256, 64);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), new THREE.MeshStandardMaterial({ map: nameplate.texture, roughness: 0.4 }));
  plate.position.set(0.5, deskH + 0.03, 0.22);
  plate.rotation.x = -0.4;
  pd.add(plate);

  // Telefone de mesa.
  const phone = makePhone();
  phone.root.position.set(0.53, deskH, -0.02);
  phone.root.rotation.y = -0.35;
  pd.add(phone.root);
  targets.phone = phone.root;

  // Luminária com sombra.
  const deskLamp = new THREE.SpotLight('#ffd9a0', 2.6, 4, 0.75, 0.7, 1.5);
  deskLamp.position.set(-0.55, 1.18, 0.88);
  deskLamp.target.position.set(0.1, deskH, 1.05);
  deskLamp.castShadow = true;
  deskLamp.shadow.mapSize.set(512, 512);
  deskLamp.shadow.bias = -0.0008;
  scene.add(deskLamp, deskLamp.target);
  const monitorGlow = new THREE.PointLight('#7fd6ff', 0.8, 1.6, 2);
  monitorGlow.position.set(0, deskH + 0.55, 1.05);
  scene.add(monitorGlow);

  scene.updateMatrixWorld(true);
  const screenCenter = new THREE.Vector3();
  mon.screen.getWorldPosition(screenCenter);
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(mon.screen.getWorldQuaternion(new THREE.Quaternion()));
  spots.seat = new THREE.Vector3(0, 0, 1.75);
  spots.deskCenter = new THREE.Vector3(0, 0, 1);

  // ------------------------------------------------------------ sala do chefe
  const bx0 = 4.5;
  const bz1 = -2.5;
  const frame = (w: number, h: number, d: number, x: number, y: number, z: number) => box(w, h, d, trimMat, x, y, z);
  // Parede oeste de vidro.
  const glassW = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.minZ * -1 + bz1, 2.6), glassMat);
  glassW.rotation.y = Math.PI / 2;
  glassW.position.set(bx0, 1.3, (ROOM.minZ + bz1) / 2);
  scene.add(glassW);
  frame(0.08, H, 0.08, bx0, H / 2, bz1);
  frame(0.08, 0.08, -ROOM.minZ + bz1, bx0, 2.6, (ROOM.minZ + bz1) / 2);
  for (let z = ROOM.minZ + 1.1; z < bz1; z += 1.1) frame(0.05, 2.6, 0.05, bx0, 1.3, z);
  box(0.12, H - 2.6, -ROOM.minZ + bz1, wallMat, bx0, (H + 2.6) / 2, (ROOM.minZ + bz1) / 2, false);
  collision.addBox(bx0, (ROOM.minZ + bz1) / 2, 0.12, -ROOM.minZ + bz1);
  // Parede sul de vidro com porta (vão entre x=5.2 e 6.4).
  const doorL = 5.2;
  const doorR = 6.4;
  const seg1 = doorL - bx0;
  const seg2 = ROOM.maxX - doorR;
  const g1 = new THREE.Mesh(new THREE.PlaneGeometry(seg1, 2.6), glassMat);
  g1.position.set(bx0 + seg1 / 2, 1.3, bz1);
  const g2 = new THREE.Mesh(new THREE.PlaneGeometry(seg2, 2.6), glassMat);
  g2.position.set(doorR + seg2 / 2, 1.3, bz1);
  scene.add(g1, g2);
  frame(0.08, H, 0.08, doorL, H / 2, bz1);
  frame(0.08, H, 0.08, doorR, H / 2, bz1);
  frame(ROOM.maxX - bx0, 0.08, 0.08, (ROOM.maxX + bx0) / 2, 2.6, bz1);
  for (let x = doorR + 1.15; x < ROOM.maxX; x += 1.15) frame(0.05, 2.6, 0.05, x, 1.3, bz1);
  box(ROOM.maxX - bx0, H - 2.6, 0.12, wallMat, (ROOM.maxX + bx0) / 2, (H + 2.6) / 2, bz1, false);
  collision.addBox(bx0 + seg1 / 2, bz1, seg1, 0.12);
  collision.addBox(doorR + seg2 / 2, bz1, seg2, 0.12);
  // Adesivo na porta: "DIRETORIA".
  const sign = poster(['DIRETORIA', 'Bata antes. Melhor: não bata.'], '#1c2026', '#e8862e', 512, 300);
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.53), new THREE.MeshStandardMaterial({ map: sign.texture, transparent: true }));
  signMesh.position.set(doorR + 0.6, 1.9, bz1 + 0.07);
  scene.add(signMesh);
  // Móveis do chefe.
  const bossDesk = assets.instance('desk', { width: 1.9, height: 0.78, depth: 0.9, exact: true }, 0x6b4a33);
  place(bossDesk, 8.6, -5.0, Math.PI);
  collision.addBox(8.6, -5.0, 1.9, 0.9);
  const bossChair = assets.instance('chairDesk', { height: 1.15 }, 0x333333);
  place(bossChair, 8.6, -6.0, 0);
  const bossMon = makeMonitor(0.55, 0.32, true);
  bossMon.group.position.set(8.6, 0.78, -5.25);
  bossMon.group.rotation.y = 0;
  scene.add(bossMon.group);
  const bossScreen = coworkerScreen(9, 'GERVÁSIO — LUCROS');
  bossMon.screenMat.map = bossScreen.texture;
  bossMon.screenMat.emissiveMap = bossScreen.texture;
  bossMon.screenMat.emissive.set('#ffffff');
  emissiveScreens.push(bossMon.screenMat);
  const sofa = assets.instance('loungeSofa', { width: 2.0 }, 0x8a2d2d);
  place(sofa, 10.3, -4.4, -Math.PI / 2);
  collision.addBox(10.3, -4.4, 0.9, 2.0);
  const plant = assets.instance('pottedPlant', { height: 1.3 });
  place(plant, 5.0, -7.4);
  collision.addBox(5.0, -7.4, 0.5, 0.5);
  // Cofre com o caixa da operação.
  const safe = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.9, 0.6, 3, 0.04), new THREE.MeshStandardMaterial({ color: '#3a3f44', metalness: 0.8, roughness: 0.35 }));
  safe.position.set(10.4, 0.45, -7.3);
  safe.castShadow = true;
  scene.add(safe);
  collision.addBox(10.4, -7.3, 0.7, 0.6);
  const safeDisplay = new CanvasSurface(256, 96);
  const safeScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.16),
    new THREE.MeshStandardMaterial({ map: safeDisplay.texture, emissive: '#ffffff', emissiveMap: safeDisplay.texture, emissiveIntensity: 1 }),
  );
  safeScreen.position.set(10.4, 0.7, -6.99);
  scene.add(safeScreen);
  targets.safe = safe;
  // Pôster motivacional na sala do chefe.
  const motiv = poster(['SUCESSO', '= LIGAÇÕES × OUSADIA', 'Gervásio Bastos, CEO, CFO e RH'], '#0f2b3a', '#ffb347');
  const motivMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshStandardMaterial({ map: motiv.texture }));
  motivMesh.position.set(ROOM.maxX - 0.02, 1.7, -5.6);
  motivMesh.rotation.y = -Math.PI / 2;
  scene.add(motivMesh);
  spots.bossOffice = new THREE.Vector3(7.6, 0, -4.5);

  // ------------------------------------------------------------ copa
  const bar = assets.instance('kitchenBar', { width: 2.4, height: 0.92, depth: 0.62, exact: true }, 0xcfd6d8);
  place(bar, -10.6, -5.6, Math.PI / 2);
  collision.addBox(-10.6, -5.6, 0.62, 2.4);
  const coffeeMachine = assets.instance('kitchenCoffeeMachine', { height: 0.4 });
  place(coffeeMachine, -10.62, -5.2, Math.PI / 2, 0.92);
  targets.coffee = coffeeMachine;
  spots.coffee = new THREE.Vector3(-9.6, 0, -5.2);
  const micro = assets.instance('kitchenMicrowave', { width: 0.5 });
  place(micro, -10.62, -6.3, Math.PI / 2, 0.92);
  const fridge = assets.instance('kitchenFridgeSmall', { height: 1.75 });
  place(fridge, -10.5, -7.4, Math.PI / 2);
  collision.addBox(-10.5, -7.4, 0.8, 0.8);
  const cooler = buildWaterCooler();
  cooler.position.set(-10.55, 0, -3.6);
  scene.add(cooler);
  collision.addBox(-10.55, -3.6, 0.4, 0.4);
  const table = assets.instance('tableCoffee', { width: 1.0 }, 0xb7a68f);
  place(table, -8.4, -5.8);
  collision.addBox(-8.4, -5.8, 1.0, 0.7);
  const trash = assets.instance('trashcan', { height: 0.5 });
  place(trash, -9.1, -7.5);
  const caneca = poster(['ÚLTIMO LUGAR', 'LAVA AS CANECAS', '(isso inclui você)'], '#f4f1e8', '#b33939');
  const canecaMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.82), new THREE.MeshStandardMaterial({ map: caneca.texture }));
  canecaMesh.position.set(ROOM.minX + 0.02, 1.65, -6.4);
  canecaMesh.rotation.y = Math.PI / 2;
  scene.add(canecaMesh);

  // ------------------------------------------------------------ armário de rede e quadro de energia
  const rack = new THREE.Mesh(new RoundedBoxGeometry(0.7, 2.0, 0.8, 2, 0.03), darkMat);
  rack.position.set(-10.45, 1.0, 6.4);
  rack.castShadow = true;
  scene.add(rack);
  collision.addBox(-10.45, 6.4, 0.75, 0.85);
  targets.rack = rack;
  spots.rack = new THREE.Vector3(-9.4, 0, 6.4);
  const ledGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const rackLeds = new THREE.InstancedMesh(ledGeo, ledMat, 48);
  for (let i = 0; i < 48; i++) {
    dummy.position.set(-10.09, 0.45 + Math.floor(i / 6) * 0.19, 6.15 + (i % 6) * 0.09);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    rackLeds.setMatrixAt(i, dummy.matrix);
    rackLeds.setColorAt(i, new THREE.Color('#29d16b'));
  }
  scene.add(rackLeds);
  // Cabos pelo chão (o cabo azul que todo mundo tropeça).
  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-10.1, 0.02, 6.0),
    new THREE.Vector3(-8.5, 0.02, 4.6),
    new THREE.Vector3(-5.5, 0.02, 3.4),
    new THREE.Vector3(-2.0, 0.02, 2.4),
    new THREE.Vector3(-0.3, 0.02, 1.5),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 60, 0.012, 6), new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.5 }));
  cable.castShadow = true;
  scene.add(cable);
  const breakerBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.45), new THREE.MeshStandardMaterial({ color: '#8f969c', metalness: 0.6, roughness: 0.4 }));
  breakerBox.position.set(-10.94, 1.45, 4.4);
  scene.add(breakerBox);
  const breakerLever = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), accentMat);
  breakerLever.position.set(-10.86, 1.5, 4.4);
  breakerLever.userData.dynamic = true;
  scene.add(breakerLever);
  targets.breaker = breakerBox;
  spots.breaker = new THREE.Vector3(-10.0, 0, 4.4);
  const hazard = poster(['PERIGO', 'Não puxe o cabo azul.', 'Juninho, isso é com você.'], '#f2c94c', '#1a1a1a', 512, 600);
  const hazardMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.58), new THREE.MeshStandardMaterial({ map: hazard.texture }));
  hazardMesh.position.set(ROOM.minX + 0.02, 1.55, 5.4);
  hazardMesh.rotation.y = Math.PI / 2;
  scene.add(hazardMesh);

  // ------------------------------------------------------------ impressora e triturador
  const printer = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.95, 0.6, 2, 0.04), new THREE.MeshStandardMaterial({ color: '#d7dade', roughness: 0.6 }));
  printer.position.set(8.0, 0.475, -1.95);
  printer.castShadow = true;
  scene.add(printer);
  collision.addBox(8.0, -1.95, 0.75, 0.6);
  const shredder = new THREE.Group();
  const shBody = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.65, 0.35, 2, 0.03), darkMat);
  shBody.position.y = 0.325;
  shBody.castShadow = true;
  const shTop = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.37), accentMat);
  shTop.position.y = 0.68;
  shredder.add(shBody, shTop);
  shredder.position.set(9.0, 0, -2.0);
  scene.add(shredder);
  collision.addBox(9.0, -2.0, 0.45, 0.35);
  targets.shredder = shredder;
  spots.shredder = new THREE.Vector3(9.0, 0, -1.2);
  const shLabel = poster(['TRITURADOR', 'Provas? Que provas?'], '#1c2026', '#f4f4f4', 512, 300);
  const shLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.23), new THREE.MeshStandardMaterial({ map: shLabel.texture }));
  shLabelMesh.position.set(9.0, 0.45, -1.82);
  scene.add(shLabelMesh);

  // ------------------------------------------------------------ quadro branco, TV, relógio, pôsteres
  const whiteboard = new Whiteboard();
  const wbMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: whiteboard.texture, roughness: 0.35 }));
  wbMesh.position.set(ROOM.maxX - 0.03, 1.6, 2.6);
  wbMesh.rotation.y = -Math.PI / 2;
  scene.add(wbMesh);
  box(0.04, 1.38, 2.68, trimMat, ROOM.maxX - 0.02, 1.6, 2.6, false);
  targets.whiteboard = wbMesh;

  const tv = new NewsTv();
  const tvBody = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.86, 1.46, 2, 0.02), darkMat);
  tvBody.position.set(ROOM.minX + 0.06, 2.0, -0.5);
  scene.add(tvBody);
  const tvMat = new THREE.MeshStandardMaterial({ map: tv.texture, emissive: '#ffffff', emissiveMap: tv.texture, emissiveIntensity: 1.1 });
  emissiveScreens.push(tvMat);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.78), tvMat);
  tvScreen.position.set(ROOM.minX + 0.105, 2.0, -0.5);
  tvScreen.rotation.y = Math.PI / 2;
  scene.add(tvScreen);
  targets.tv = tvScreen;

  const clockGroup = new THREE.Group();
  clockGroup.position.set(-1.2, 2.88, ROOM.minZ + 0.1);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 40), new THREE.MeshStandardMaterial({ color: '#f5f2ea', roughness: 0.5 }));
  face.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 40), trimMat);
  clockGroup.add(face, rim);
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.01), darkMat);
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(Math.sin(a) * 0.18, Math.cos(a) * 0.18, 0.025);
    tick.rotation.z = -a;
    clockGroup.add(tick);
  }
  const hand = (len: number, w: number, color: string) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.008), new THREE.MeshStandardMaterial({ color }));
    m.position.y = len / 2;
    pivot.add(m);
    pivot.position.z = 0.03;
    clockGroup.add(pivot);
    return pivot;
  };
  const hourHand = hand(0.11, 0.018, '#1a1a1a');
  const minuteHand = hand(0.17, 0.012, '#1a1a1a');
  hourHand.userData.dynamic = true;
  minuteHand.userData.dynamic = true;
  scene.add(clockGroup);

  const posters: Array<[string[], string, string, number, number, number, number]> = [
    [['FUNCIONÁRIO DO MÊS', 'TONHÃO', '(14 meses seguidos)'], '#1d3557', '#f1faee', -5.5, ROOM.maxZ - 0.02, Math.PI, 1],
    [['SORRIA', 'Você está sendo pago.', 'Por enquanto.'], '#e8862e', '#1c1c1c', -2.0, ROOM.maxZ - 0.02, Math.PI, 1],
    [['META É META', 'Feriado é opinião.'], '#2a9d8f', '#ffffff', 2.5, ROOM.maxZ - 0.02, Math.PI, 1],
  ];
  for (const [lines, bg, fg, x, z, rot] of posters) {
    const p = poster(lines, bg, fg);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.02), new THREE.MeshStandardMaterial({ map: p.texture, roughness: 0.8 }));
    pm.position.set(x, 1.7, z);
    pm.rotation.y = rot;
    scene.add(pm);
  }
  // Logotipo na parede leste.
  const logo = poster(['DISK FORTUNA', 'Soluções Ltda.', 'Realizando sonhos por telefone desde 2019'], '#101418', '#ffb347', 1024, 520);
  const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: logo.texture, emissive: '#ffb347', emissiveIntensity: 0.15, emissiveMap: logo.texture }));
  logoMesh.position.set(ROOM.maxX - 0.03, 1.75, 5.9);
  logoMesh.rotation.y = -Math.PI / 2;
  scene.add(logoMesh);

  // ------------------------------------------------------------ saída
  const doorMat = new THREE.MeshStandardMaterial({ color: '#4b3a2c', roughness: 0.6 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.15, 0.06), doorMat);
  door.position.set(8.0, 1.075, ROOM.maxZ - 0.02);
  door.castShadow = true;
  scene.add(door);
  box(1.3, 0.08, 0.1, trimMat, 8.0, 2.2, ROOM.maxZ - 0.02, false);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), trimMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(8.4, 1.05, ROOM.maxZ - 0.07);
  scene.add(handle);
  const exitSign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: '#0d6b2f', emissive: '#22ff77', emissiveIntensity: 1.6 }));
  exitSign.position.set(8.0, 2.45, ROOM.maxZ - 0.05);
  scene.add(exitSign);
  targets.door = door;
  spots.door = new THREE.Vector3(8.0, 0, 7.3);

  // ------------------------------------------------------------ decoração de canto
  for (const [x, z] of [[-10.4, 1.8], [10.4, 7.4], [4.0, 7.4], [-3.9, -7.4]] as Array<[number, number]>) {
    const p = assets.instance('pottedPlant', { height: 1.2 + ((x * 7) % 3) * 0.1 });
    place(p, x, z);
    collision.addBox(x, z, 0.45, 0.45);
  }
  const shelf = assets.instance('bookcaseClosedDoors', { height: 1.9 }, 0xbfb6a8);
  place(shelf, 10.6, 0.4, -Math.PI / 2);
  collision.addBox(10.6, 0.4, 0.5, 1.0);
  for (const [x, z] of [[-7.2, 6.8], [-6.6, 7.2], [3.0, -7.3]] as Array<[number, number]>) {
    const b = assets.instance('cardboardBoxClosed', { width: 0.55 });
    place(b, x, z, x);
    collision.addBox(x, z, 0.55, 0.55);
  }
  const coat = assets.instance('coatRackStanding', { height: 1.8 });
  place(coat, 9.2, 7.3);
  collision.addBox(9.2, 7.3, 0.4, 0.4);

  // Colunas estruturais.
  for (const [x, z] of [[-3.4, -5.2], [3.4, 5.9]] as Array<[number, number]>) {
    box(0.5, H, 0.5, wallMat, x, H / 2, z);
    collision.addBox(x, z, 0.5, 0.5);
  }

  // ------------------------------------------------------------ luzes de emergência e polícia
  const emergency: THREE.PointLight[] = [];
  for (const [x, z] of [[4.0, 5.0], [-6.0, -3.0]] as Array<[number, number]>) {
    const l = new THREE.PointLight('#ff2a2a', 0, 16, 1.4);
    l.position.set(x, 2.8, z);
    scene.add(l);
    emergency.push(l);
  }
  const police: THREE.PointLight[] = [];
  for (const [x, color] of [[-3, '#ff2030'], [4, '#2050ff']] as Array<[number, string]>) {
    const l = new THREE.PointLight(color, 0, 16, 1.1);
    l.position.set(x, 1.8, ROOM.minZ - 1.5);
    scene.add(l);
    police.push(l);
  }

  // Otimização: sombra só de objetos que importam, e malhas estáticas agrupadas.
  scene.updateMatrixWorld(true);
  trimSmallShadowCasters(scene);
  const batch = batchStatic(scene, new Set([...Object.values(targets), phone.root]));
  console.info(`[Office] malhas: ${batch.before} → ${batch.after} após agrupamento`);

  return {
    scene,
    collision,
    targets,
    spots,
    monitor,
    monitorMesh: mon.screen,
    screen: { center: screenCenter, normal: screenNormal, width: 0.62, height: 0.38 },
    whiteboard,
    tv,
    phone,
    clockHands: { hour: hourHand, minute: minuteHand },
    lights: { hemi, sun, ceiling: ceilingLights, panels: panelMat, deskLamp, monitorGlow, emergency, police, flicker },
    rackLeds,
    sky,
    cityWindows,
    nameplate,
    safeDisplay,
    emissiveScreens,
    breakerLever,
  };
}

/** Monitor procedural (moldura, tela e pé). */
function makeMonitor(w: number, h: number, on: boolean, big = false) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#16191d', roughness: 0.45, metalness: 0.3 });
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(w + 0.03, h + 0.03, 0.03, 2, 0.008), frameMat);
  bezel.position.y = 0.12 + h / 2;
  bezel.castShadow = true;
  group.add(bezel);
  const screenMat = new THREE.MeshStandardMaterial({ color: on ? '#ffffff' : '#0a0c0f', roughness: 0.7, metalness: 0.0 });
  if (!on) screenMat.color.set('#07090c');
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
  screen.position.set(0, 0.12 + h / 2, 0.0155);
  group.add(screen);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.03), frameMat);
  neck.position.set(0, 0.07, -0.03);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.26 : 0.2, 0.012, 0.16), frameMat);
  foot.position.set(0, 0.006, -0.02);
  neck.castShadow = foot.castShadow = true;
  group.add(neck, foot);
  return { group, screen, screenMat };
}

/** Telefone de mesa com fone articulado e LED. */
function makePhone(): PhoneRig {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#23272d', roughness: 0.4 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.22, 2, 0.015), body);
  base.position.y = 0.03;
  base.rotation.x = 0.12;
  base.castShadow = true;
  root.add(base);
  const keyMat = new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.5 });
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, 0.02), keyMat);
      k.position.set(0.03 + c * 0.03, 0.065 - r * 0.004, 0.02 + r * 0.028);
      root.add(k);
    }
  const led = new THREE.MeshStandardMaterial({ color: '#3a0d0d', emissive: '#ff2a2a', emissiveIntensity: 0 });
  const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), led);
  ledMesh.position.set(0.075, 0.068, -0.075);
  root.add(ledMesh);
  const handset = new THREE.Group();
  const hMat = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.35 });
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.15, 4, 10), hMat);
  grip.rotation.x = Math.PI / 2;
  const ear = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.035, 0.055, 2, 0.01), hMat);
  ear.position.z = -0.095;
  const mouth = ear.clone();
  mouth.position.z = 0.095;
  grip.castShadow = true;
  handset.add(grip, ear, mouth);
  handset.position.set(-0.045, 0.085, 0);
  root.add(handset);
  // Fio espiral.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    pts.push(new THREE.Vector3(-0.1 - t * 0.08 + Math.cos(t * 50) * 0.008, 0.03 + Math.sin(t * 50) * 0.008, 0.06 - t * 0.02));
  }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0035, 5), hMat);
  root.add(cord);
  return { root, handset, led, ringT: 0 };
}

const W_TILES = 22 / 0.6;
const D_TILES = 16 / 0.6;

/** Uma placa de forro 60×60 com borda (repetida no teto inteiro). */
function ceilingTiles(): CanvasSurface {
  const s = new CanvasSurface(128, 128);
  const { ctx } = s;
  ctx.fillStyle = '#e9ebe6';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(120,120,110,${(Math.random() * 0.12).toFixed(3)})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  ctx.strokeStyle = '#8b9196';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 128, 128);
  s.commit();
  return s;
}

function buildWaterCooler(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e8eaec', roughness: 0.5 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.95, 0.34, 2, 0.03), bodyMat);
  body.position.y = 0.475;
  body.castShadow = true;
  const jug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.42, 20),
    new THREE.MeshStandardMaterial({ color: '#7fc6ff', transparent: true, opacity: 0.55, roughness: 0.05 }),
  );
  jug.position.y = 1.17;
  g.add(body, jug);
  return g;
}

/** Céu, sol e prédios vistos pela janela. */
function buildCity(scene: THREE.Scene): { sky: THREE.Mesh; cityWindows: THREE.MeshStandardMaterial } {
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color('#4a86c5') },
      bottom: { value: new THREE.Color('#cfe3f0') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp((vP.y + 30.0) / 90.0, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), skyMat);
  scene.add(sky);

  // Janelas dos prédios: textura com grade de janelas acesas aleatórias.
  const surf = new CanvasSurface(256, 512);
  const { ctx } = surf;
  ctx.fillStyle = '#20262e';
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 8; x++) {
      const lit = Math.random() < 0.35;
      ctx.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd88a' : '#bfe4ff') : '#0e1217';
      ctx.fillRect(x * 32 + 6, y * 16 + 4, 20, 9);
    }
  surf.commit();
  surf.texture.wrapS = surf.texture.wrapT = THREE.RepeatWrapping;
  const cityWindows = new THREE.MeshStandardMaterial({
    color: '#59626e',
    roughness: 0.7,
    emissive: '#ffffff',
    emissiveMap: surf.texture,
    emissiveIntensity: 0.15,
    map: surf.texture,
  });
  const rand = mulberry(17);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 70; i++) {
    const w = 6 + rand() * 12;
    const d = 6 + rand() * 10;
    const h = 20 + rand() * 60;
    const x = -90 + rand() * 180;
    const z = -22 - rand() * 90;
    const b = new THREE.Mesh(geo, cityWindows);
    b.scale.set(w, h, d);
    b.position.set(x, -32 + h / 2, z);
    scene.add(b);
  }
  // Chão da cidade lá embaixo.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -32, -100);
  scene.add(ground);
  return { sky, cityWindows };
}

function mulberry(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
