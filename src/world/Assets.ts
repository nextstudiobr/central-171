import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/** Modelos do Kenney Furniture Kit (CC0) usados no escritório. */
export const MODEL_NAMES = [
  'chairDesk',
  'desk',
  'computerScreen',
  'computerKeyboard',
  'computerMouse',
  'laptop',
  'kitchenCoffeeMachine',
  'pottedPlant',
  'plantSmall1',
  'plantSmall2',
  'plantSmall3',
  'trashcan',
  'bookcaseClosed',
  'bookcaseClosedDoors',
  'cardboardBoxClosed',
  'cardboardBoxOpen',
  'loungeSofa',
  'televisionModern',
  'kitchenFridgeSmall',
  'kitchenBar',
  'kitchenMicrowave',
  'radio',
  'coatRackStanding',
  'speaker',
  'sideTableDrawers',
  'tableCoffee',
  'books',
  'lampSquareTable',
  'deskCorner',
] as const;

export type ModelName = (typeof MODEL_NAMES)[number];

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/**
 * Carrega modelos, texturas e o HDRI. Qualquer arquivo que falhar é trocado
 * por um substituto procedural: o jogo nunca fica preso numa tela vazia.
 */
export class Assets {
  models = new Map<ModelName, THREE.Group>();
  textures: Record<'carpet' | 'ceiling' | 'plaster', PbrSet | null> = { carpet: null, ceiling: null, plaster: null };
  envMap: THREE.Texture | null = null;
  failures: string[] = [];
  private tinted = new Map<string, THREE.Material>();

  constructor(private readonly base = './assets/') {}

  async load(renderer: THREE.WebGLRenderer, onProgress: (p: number, label: string) => void): Promise<void> {
    const manager = new THREE.LoadingManager();
    const gltf = new GLTFLoader(manager);
    const tex = new THREE.TextureLoader(manager);
    const total = MODEL_NAMES.length + 3 * 3 + 1;
    let done = 0;
    const tick = (label: string) => onProgress(++done / total, label);

    const modelJobs = MODEL_NAMES.map(async (name) => {
      try {
        const g = await gltf.loadAsync(`${this.base}models/${name}.glb`);
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.models.set(name, g.scene);
      } catch (err) {
        this.failures.push(`modelo ${name}`);
        console.warn(`[Assets] falha ao carregar ${name}`, err);
      }
      tick(`Móveis: ${name}`);
    });

    const loadTex = async (path: string, srgb: boolean, repeat: number): Promise<THREE.Texture> => {
      const t = await tex.loadAsync(path);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      tick(`Textura: ${path.split('/').pop()}`);
      return t;
    };
    const pbr = async (key: 'carpet' | 'ceiling' | 'plaster', file: string, repeat: number) => {
      try {
        const [map, normalMap, roughnessMap] = await Promise.all([
          loadTex(`${this.base}textures/${file}_diff_1k.jpg`, true, repeat),
          loadTex(`${this.base}textures/${file}_nor_gl_1k.jpg`, false, repeat),
          loadTex(`${this.base}textures/${file}_rough_1k.jpg`, false, repeat),
        ]);
        this.textures[key] = { map, normalMap, roughnessMap };
      } catch (err) {
        this.failures.push(`textura ${file}`);
        console.warn(`[Assets] falha na textura ${file}`, err);
      }
    };

    const envJob = (async () => {
      try {
        const hdr = await new HDRLoader(manager).loadAsync(`${this.base}hdri/unfinished_office_night_1k.hdr`);
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.envMap = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
      } catch (err) {
        this.failures.push('HDRI');
        console.warn('[Assets] falha no HDRI; usando ambiente procedural', err);
        try {
          const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
          const pmrem = new THREE.PMREMGenerator(renderer);
          this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          pmrem.dispose();
        } catch {
          this.envMap = null;
        }
      }
      tick('Iluminação do ambiente');
    })();

    await Promise.all([
      ...modelJobs,
      pbr('carpet', 'dirty_carpet', 1),
      pbr('ceiling', 'ceiling_interior', 1),
      pbr('plaster', 'painted_plaster_wall', 1),
      envJob,
    ]);
  }

  /**
   * Cópia de um modelo, escalada para caber na largura pedida (metros).
   * Sem o modelo, devolve uma caixa cinza do mesmo tamanho aproximado.
   */
  instance(name: ModelName, fit: { width?: number; height?: number; depth?: number; exact?: boolean }, tint?: number): THREE.Object3D {
    const src = this.models.get(name);
    let obj: THREE.Object3D;
    if (src) {
      obj = src.clone(true);
    } else {
      const g = new THREE.BoxGeometry(fit.width ?? 0.5, fit.height ?? 0.5, fit.depth ?? 0.5);
      g.translate(0, (fit.height ?? 0.5) / 2, 0);
      obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 }));
      return obj;
    }
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    let s = 1;
    if (fit.width) s = fit.width / size.x;
    else if (fit.height) s = fit.height / size.y;
    else if (fit.depth) s = fit.depth / size.z;
    const scale = new THREE.Vector3(s, s, s);
    if (fit.exact && fit.width && fit.height && fit.depth) {
      scale.set(fit.width / size.x, fit.height / size.y, fit.depth / size.z);
    }
    obj.scale.copy(scale);
    // Apoia no chão e centraliza em XZ.
    const center = box.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    obj.position.set(-center.x * scale.x, -box.min.y * scale.y, -center.z * scale.z);
    wrapper.add(obj);
    if (tint !== undefined) {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          // Materiais tingidos são compartilhados: permite juntar malhas iguais depois.
          const src = m.material as THREE.MeshStandardMaterial;
          const key = `${src.uuid}:${tint}`;
          let mat = this.tinted.get(key) as THREE.MeshStandardMaterial | undefined;
          if (!mat) {
            mat = src.clone();
            mat.color.multiply(new THREE.Color(tint));
            this.tinted.set(key, mat);
          }
          m.material = mat;
        }
      });
    }
    return wrapper;
  }
}
