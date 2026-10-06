import * as THREE from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { QualitySettings } from '../core/quality';
import { createBrushedTexture, createStudioEnvironment } from './environment';
import { Plates, PLATE } from './plates';
import { CameraRig, type Shot } from './rig';

const BG = new THREE.Color('#050506');
const FOG = 0.016;

/**
 * Owns rendering: one WebGL scene (the plates, the glyphs) sandwiched between
 * two CSS3D typography layers driven by the same camera. Type in the back
 * layer is genuinely behind the 3D world (plates occlude it); type in the
 * front layer lies on the plates.
 */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly plates: Plates;
  readonly backScene = new THREE.Scene();
  readonly frontScene = new THREE.Scene();
  /** Proxies in the front CSS scene that mirror each plate's world matrix. */
  readonly frontProxies: THREE.Object3D[] = [];
  private cssBack: CSS3DRenderer;
  private cssFront: CSS3DRenderer;
  private key: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private rim: THREE.DirectionalLight;
  readonly fog: THREE.FogExp2;
  /** Extra passes drawn over the frame right after the main render (e.g. the eagle's glow). */
  readonly post: (() => void)[] = [];
  width = 1;
  height = 1;
  dpr = 1;

  constructor(
    canvas: HTMLCanvasElement,
    readonly q: QualitySettings,
    initial: Shot,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: q.antialias,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = q.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.fog = new THREE.FogExp2(BG.clone(), FOG);
    this.scene.fog = this.fog;
    this.scene.environment = createStudioEnvironment(r, q.envSize);
    this.scene.environmentIntensity = 1.0;

    this.rig = new CameraRig(initial);

    // Light: one key with soft shadows, one cool rim. Restraint.
    this.key = new THREE.DirectionalLight(0xfff4ea, 1.6);
    this.key.position.set(-8, 16, 10);
    this.key.castShadow = q.shadows;
    if (q.shadows) {
      this.key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const c = this.key.shadow.camera;
      c.left = -18;
      c.right = 18;
      c.top = 18;
      c.bottom = -18;
      c.near = 1;
      c.far = 70;
      this.key.shadow.bias = -0.0004;
      this.key.shadow.normalBias = 0.02;
      this.key.shadow.radius = 4;
    }
    this.scene.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(0xc8d4ff, 0.55);
    this.rim.position.set(10, 4, -14);
    this.scene.add(this.rim);
    this.hemi = new THREE.HemisphereLight(0x2a2c30, 0x050506, 0.35);
    this.scene.add(this.hemi);

    this.plates = new Plates({ segments: q.segments, brushed: createBrushedTexture(512), shadows: q.shadows });
    this.scene.add(this.plates.group);

    for (let i = 0; i < PLATE.N; i++) {
      const proxy = new THREE.Object3D();
      proxy.matrixAutoUpdate = false;
      this.frontScene.add(proxy);
      this.frontProxies.push(proxy);
    }

    this.cssBack = new CSS3DRenderer({ element: document.getElementById('wt-back') as HTMLElement });
    this.cssFront = new CSS3DRenderer({ element: document.getElementById('wt-front') as HTMLElement });

    this.resize();
  }

  /**
   * Light theme: a bright paper studio. Fog fades distance toward the page colour (not black),
   * a soft sky fill opens the shadows, and the plates turn to pale anodised aluminium.
   */
  setTheme(light: boolean) {
    this.fog.color.set(light ? '#f1eee8' : BG);
    this.hemi.color.set(light ? 0xffffff : 0x2a2c30);
    this.hemi.groundColor.set(light ? 0xd9d4ca : 0x050506);
    this.hemi.intensity = light ? 1.35 : 0.35;
    this.key.intensity = light ? 2.1 : 1.6;
    this.rim.intensity = light ? 0.35 : 0.55;
    this.scene.environmentIntensity = light ? 1.15 : 1.0;
    this.renderer.toneMappingExposure = light ? 1.0 : 1.05;
    this.plates.setTheme(light);
  }

  setDpr(dpr: number) {
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
  }

  resize() {
    // visualViewport-free on purpose: the stage is fixed and fills the layout viewport.
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(this.dpr || Math.min(window.devicePixelRatio, this.q.dprMax));
    this.renderer.setSize(this.width, this.height, false);
    this.rig.setSize(this.width, this.height);
    this.cssBack.setSize(this.width, this.height);
    this.cssFront.setSize(this.width, this.height);
  }

  /** Keep the shadow frustum centred on what the camera is looking at. */
  private followKey() {
    const t = this.rig.base.target;
    this.key.target.position.copy(t);
    this.key.position.set(t.x - 8, t.y + 16, t.z + 10);
    this.key.target.updateMatrixWorld();
  }

  render() {
    this.followKey();
    // Fog is set for close compositions; wide and long-lens shots thin it so the subject
    // keeps roughly the same depth haze however far back the camera stands.
    this.fog.density = FOG * Math.min(1, 30 / Math.max(1, this.rig.base.dist));
    this.renderer.render(this.scene, this.rig.camera);
    for (const pass of this.post) pass();
    this.plates.group.updateMatrixWorld();
    for (let i = 0; i < PLATE.N; i++) {
      const proxy = this.frontProxies[i];
      proxy.matrix.copy(this.plates.meshes[i].matrixWorld);
      proxy.matrixWorldNeedsUpdate = true;
    }
    this.cssBack.render(this.backScene, this.rig.camera);
    this.cssFront.render(this.frontScene, this.rig.camera);
  }
}
