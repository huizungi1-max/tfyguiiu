import * as THREE from 'three';

/**
 * Selective bloom for one subject. The subject's emissive pass is rendered at half CSS
 * resolution, blurred through a short mip chain (½ · ¼ · ⅛) and added over the frame that is
 * already on the canvas. The main render is untouched — this only adds light, and only
 * where the subject glows.
 *
 * The canvas is transparent (the page shows through it), so the result is written as a valid
 * premultiplied colour: alpha = brightest channel. Over the dark page that reads as light;
 * nothing else in the scene is affected.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 9-tap Gaussian from 5 bilinear fetches
const BLUR = /* glsl */ `
  uniform sampler2D tSrc; uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
    c += texture2D(tSrc, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(tSrc, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }`;

const COMPOSITE = /* glsl */ `
  uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2;
  uniform vec3 uW; uniform float uK;
  varying vec2 vUv;
  void main() {
    vec3 g = (texture2D(t0, vUv).rgb * uW.x + texture2D(t1, vUv).rgb * uW.y + texture2D(t2, vUv).rgb * uW.z) * uK;
    g = 1.0 - exp(-g);
    gl_FragColor = vec4(g, max(g.r, max(g.g, g.b)));
  }`;

export class Glow {
  /** Overall bloom gain (0 disables the pass). */
  strength = 1;
  /** What the emissive pass is scaled by before it is stored (8-bit targets need headroom). */
  readonly encode: number;
  private src: THREE.WebGLRenderTarget;
  private chain: { h: THREE.WebGLRenderTarget; v: THREE.WebGLRenderTarget }[] = [];
  private blur: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new THREE.Vector2();
  private clear = new THREE.Color();
  private w = 0;
  private h = 0;

  constructor(
    private renderer: THREE.WebGLRenderer,
    /** Resolution of the first level, as a fraction of CSS pixels. */
    private scale = 0.5,
  ) {
    const ext = renderer.extensions;
    const half = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.encode = half ? 1 : 0.4;
    this.src = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: true, stencilBuffer: false });
    for (let i = 0; i < 3; i++) {
      const o = { type, depthBuffer: false, stencilBuffer: false };
      this.chain.push({ h: new THREE.WebGLRenderTarget(1, 1, o), v: new THREE.WebGLRenderTarget(1, 1, o) });
    }
    this.blur = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BLUR,
      uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE,
      uniforms: {
        t0: { value: this.chain[0].v.texture },
        t1: { value: this.chain[1].v.texture },
        t2: { value: this.chain[2].v.texture },
        // tight halo · body · wide breath
        uW: { value: new THREE.Vector3(0.5, 0.45, 0.42) },
        uK: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Compile the subject's glow-pass shader variant ahead of time (no hitch on first use). */
  warm(subject: THREE.Object3D, camera: THREE.Camera) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.src);
    r.compile(subject, camera);
    this.quad.material = this.blur;
    r.compile(this.scene, this.cam);
    r.setRenderTarget(prev);
    this.quad.material = this.comp;
    r.compile(this.scene, this.cam);
  }

  /**
   * Render `subject`'s glow over the current frame. `pass(true)` must switch the subject's
   * materials to their emissive-only output, `pass(false)` back.
   */
  render(subject: THREE.Object3D, camera: THREE.Camera, pass: (on: boolean) => void) {
    if (this.strength <= 0.001) return;
    const r = this.renderer;
    this.fit();
    const target = r.getRenderTarget();
    const autoClear = r.autoClear;
    const alpha = r.getClearAlpha();
    r.getClearColor(this.clear);
    r.autoClear = false;
    r.setClearColor(0x000000, 0);

    pass(true);
    r.setRenderTarget(this.src);
    r.clear(true, true, false);
    r.render(subject, camera);
    pass(false);

    let input = this.src.texture;
    for (const lv of this.chain) {
      this.blurPass(input, lv.h, 1, 0);
      this.blurPass(lv.h.texture, lv.v, 0, 1);
      input = lv.v.texture;
    }

    this.comp.uniforms.uK.value = this.strength / this.encode;
    this.quad.material = this.comp;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);

    r.autoClear = autoClear;
    r.setClearColor(this.clear, alpha);
  }

  private blurPass(src: THREE.Texture, dst: THREE.WebGLRenderTarget, x: number, y: number) {
    const u = this.blur.uniforms;
    u.tSrc.value = src;
    (u.uStep.value as THREE.Vector2).set(x / dst.width, y / dst.height);
    this.quad.material = this.blur;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.scene, this.cam);
  }

  /** Track the canvas size in CSS pixels (a blur does not need device resolution). */
  private fit() {
    const s = this.renderer.getDrawingBufferSize(this.size);
    const dpr = Math.max(1, this.renderer.getPixelRatio());
    const w = Math.max(2, Math.round((s.x / dpr) * this.scale));
    const h = Math.max(2, Math.round((s.y / dpr) * this.scale));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.src.setSize(w, h);
    this.chain.forEach((lv, i) => {
      const k = 1 << i;
      const lw = Math.max(1, Math.round(w / k));
      const lh = Math.max(1, Math.round(h / k));
      lv.h.setSize(lw, lh);
      lv.v.setSize(lw, lh);
    });
  }
}
