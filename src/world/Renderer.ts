import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Vinheta, granulado e aberração cromática leve (desligáveis). */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.03 },
    vignette: { value: 0.42 },
    alarm: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform float vignette; uniform float alarm;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = dot(c, c);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * d * 0.006).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * d * 0.006).b;
      col *= 1.0 - vignette * smoothstep(0.08, 0.6, d * 1.6);
      col += (rand(uv * (time + 1.0)) - 0.5) * grain;
      col = mix(col, col * vec3(1.25, 0.55, 0.55), alarm * smoothstep(0.05, 0.5, d * 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** Renderizador WebGL com pós-processamento. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private renderPass: RenderPass | null = null;
  effects = true;
  alarm = 0;
  /** Escala de resolução adaptativa (1 = nativa). */
  scale = 1;
  private readonly basePixelRatio = Math.min(window.devicePixelRatio, 1.75);

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(70, host.clientWidth / host.clientHeight, 0.05, 400);
  }

  attach(scene: THREE.Scene): void {
    const size = new THREE.Vector2(this.host.clientWidth, this.host.clientHeight);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(size, 0.22, 0.4, 0.97);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setEffects(this.effects);
  }

  setEffects(on: boolean): void {
    this.effects = on;
    if (this.bloom) this.bloom.enabled = on;
    if (this.grade) {
      this.grade.uniforms.grain.value = on ? 0.03 : 0;
      this.grade.uniforms.vignette.value = on ? 0.42 : 0.25;
    }
  }

  /** Muda a resolução interna mantendo o tamanho na tela. */
  setScale(scale: number): void {
    this.scale = Math.max(0.6, Math.min(1, scale));
    const pr = this.basePixelRatio * this.scale;
    this.renderer.setPixelRatio(pr);
    this.composer?.setPixelRatio(pr);
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Ajusta o tamanho quando o contêiner muda (inclusive quando começou com tamanho zero). */
  syncSize(): boolean {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const c = this.renderer.domElement;
    if (w === 0 || h === 0) return false;
    if (c.clientWidth !== w || c.clientHeight !== h) {
      this.resize();
      return true;
    }
    return false;
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  render(time: number): void {
    if (this.grade) {
      this.grade.uniforms.time.value = time % 100;
      this.grade.uniforms.alarm.value = this.alarm;
    }
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
  }
}
