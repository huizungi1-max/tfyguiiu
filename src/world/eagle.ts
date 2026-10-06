import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from './world';
import { presence, type ChangeEvent, type StageState, type StageSystem } from './director';
import { clamp, damp, lerp, smoothstep } from '../core/math';

/**
 * The hero: one eagle. Near-black, lit from behind by a restrained orange light
 * that only catches feather edges and contours. Nothing else is in the sky.
 *
 * Built procedurally — an articulated wing skeleton (shoulder → elbow → wrist)
 * carrying individual feathers, a contour-feathered body, a hooked beak and a
 * fanned tail — so the wing beat is a real joint motion, not a deforming card.
 *
 * Flight is driven by `u` (0 → 1) along a path authored in screen space
 * (NDC x, y + distance), so it frames the same on every viewport. On the origin
 * the user's scroll scrubs `u`; once the move to the next section starts, the
 * remaining flight plays in lockstep with that transition.
 */

/** [u, ndcX, ndcY, distance, roll] */
type Key = [number, number, number, number, number];

// Wide screens: in from the top-right corner, across the upper right, bank, then dive out low-left.
const PATH_WIDE: Key[] = [
  [0.0, 1.95, 1.75, 13, 0.42],
  [0.2, 1.05, 0.98, 12.6, 0.34],
  [0.42, 0.46, 0.5, 12.8, 0.12],
  [0.62, 0.08, 0.2, 12, -0.32],
  [0.8, -0.34, -0.3, 11, -0.5],
  [1.0, -1.1, -2.1, 8.5, -0.32],
];
// Upright screens: the portrait holds the top, so the eagle crosses the band beneath it.
const PATH_TALL: Key[] = [
  [0.0, 2.1, 1.3, 13, 0.42],
  [0.2, 0.95, 0.42, 12.6, 0.3],
  [0.42, 0.36, -0.08, 12.8, 0.1],
  [0.62, -0.05, -0.22, 12, -0.32],
  [0.8, -0.5, -0.5, 11, -0.5],
  [1.0, -1.8, -1.4, 8.5, -0.32],
];

const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

function sample(path: Key[], u: number, out: number[]) {
  u = clamp(u);
  let i = 0;
  while (i < path.length - 2 && u > path[i + 1][0]) i++;
  const k0 = path[Math.max(0, i - 1)];
  const k1 = path[i];
  const k2 = path[i + 1];
  const k3 = path[Math.min(path.length - 1, i + 2)];
  const t = clamp((u - k1[0]) / (k2[0] - k1[0]));
  for (let c = 1; c < 5; c++) out[c - 1] = cr(k0[c], k1[c], k2[c], k3[c], t);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One feather: root at the origin, vane extending along -Z, top facing +Y.
 * Three vertices per row (edge · spine · edge) so the shader knows where the outline is.
 */
function feather(len: number, w: number, o: { notch?: number; asym?: number; bend?: number; camber?: number } = {}) {
  const N = 14;
  const asym = o.asym ?? 0;
  const bend = o.bend ?? 0.05;
  const camber = o.camber ?? 0.14;
  const notch = o.notch ?? 0;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const rise = s < 0.18 ? 0.3 + 0.7 * smoothstep(0, 0.18, s) : 1;
    const tip = s > 0.7 ? Math.sqrt(Math.max(0, 1 - ((s - 0.7) / 0.3) ** 2)) : 1;
    const em = notch ? 1 - notch * smoothstep(0.4, 0.6, s) : 1; // emarginated "finger" tips
    const hw = 0.5 * w * rise * tip * em;
    const z = -s * len;
    const y = bend * s * s * len;
    const yE = y - camber * hw;
    pos.push(-hw * (1 - asym), yE, z, 0, y, z, hw * (1 + asym), yE, z);
    uv.push(s, 0, s, 0.5, s, 1);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A feather placed in its parent's space (for merging). */
function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, ry: number, rx = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}

/** A tapered limb along +X (the wing's leading edge). */
function limb(len: number, r0: number, r1: number) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 1);
  g.rotateZ(-Math.PI / 2);
  g.translate(len / 2, 0.004, 0.018);
  g.scale(1, 0.7, 1);
  return g;
}

/* -------------------------------------------------------------------------- */
/* Material                                                                    */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec2 vUv;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

// kind 0: flight feather (outline + barbs) · 1: contour feathers (scallops) · 2: smooth (beak, talons)
const FRAG = /* glsl */ `
  uniform vec3 uBase; uniform vec3 uRim; uniform float uRimK; uniform float uKind;
  uniform vec3 uLr; uniform vec3 uLk;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv;
  void main(){
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vV);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.6);
    float back = max(dot(N, uLr), 0.0);
    float key = max(dot(N, uLk), 0.0);
    vec3 col = uBase * (0.55 + 1.1 * key);
    float edge = 0.0;
    if (uKind < 0.5) {
      float across = abs(vUv.y * 2.0 - 1.0);
      float barbs = 0.9 + 0.1 * sin(vUv.x * 48.0 + across * 9.0);
      // a thin bright outline that strengthens toward the free end of the feather
      float outline = smoothstep(0.74, 1.0, across) * smoothstep(0.2, 0.9, vUv.x);
      float tip = smoothstep(0.9, 1.0, vUv.x);
      edge = max(outline, tip) * barbs;
      col *= 0.92 + 0.12 * barbs;
      col += uBase * (1.0 - smoothstep(0.0, 0.04, across)) * 0.6; // the shaft
    } else if (uKind < 1.5) {
      edge = 0.0; // contour plumage: smooth, read by the rim alone
    }
    // the orange light sits behind the bird: it only reaches contours and edges turned toward it
    float lit = smoothstep(0.05, 0.75, back);
    float rim = pow(1.0 - ndv, 3.4) * (0.1 + 1.25 * back);
    vec3 o = col + uRim * uRimK * (rim + edge * (0.2 + 0.45 * lit) * (0.55 + 0.6 * fres));
    gl_FragColor = vec4(o, 1.0);
    #include <colorspace_fragment>
  }`;

interface Wing {
  shoulder: THREE.Group;
  arm: THREE.Group;
  fore: THREE.Group;
  hand: THREE.Group;
  primaries: { m: THREE.Mesh; a: number }[];
  side: 1 | -1;
}

export class Eagle implements StageSystem {
  /** Lives in camera space, placed on the flight path every frame. */
  readonly root = new THREE.Group();
  private bank = new THREE.Group();
  private bird = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private tailFeathers: { m: THREE.Mesh; a: number }[] = [];
  private wings: Wing[] = [];
  private uniforms = {
    uBase: { value: new THREE.Color('#121214') },
    uRim: { value: new THREE.Color('#ff5a1f') },
    uRimK: { value: 1 },
    uKind: { value: 0 },
    // view space, pointing toward the light: the orange light sits behind, above and right
    uLr: { value: new THREE.Vector3(0.45, 0.75, -0.5).normalize() },
    uLk: { value: new THREE.Vector3(-0.4, 0.5, 0.75).normalize() },
  };
  private mats: THREE.ShaderMaterial[];

  /** Scroll-driven target on the origin (0 = off-screen top-right). */
  scrub = 0;
  /** Displayed flight progress. */
  u = 0;
  /** Gentle camera lean toward the bird (read by the app). */
  lean = 0;
  private from = 0;
  private prevU = 0;
  private phase = 0;
  private sky = 1;
  private k: number[] = [0, 0, 0, 0];
  private v0 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private vx = new THREE.Vector3();
  private vy = new THREE.Vector3();
  private up = new THREE.Vector3(0, 0.62, 0.78).normalize();
  private m4 = new THREE.Matrix4();

  constructor(private world: World) {
    const mat = (kind: number) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
        uniforms: { ...this.uniforms, uKind: { value: kind } },
      });
    this.mats = [mat(0), mat(1), mat(2)];

    const cam = world.rig.camera;
    if (!cam.parent) world.scene.add(cam);
    cam.add(this.root);
    this.root.add(this.bank);
    this.bank.add(this.bird);
    this.root.visible = false;

    this.buildBody();
    this.buildWing(1);
    this.buildWing(-1);
    this.buildTail();
  }

  /* — construction ————————————————————————————————————————————————————— */

  private mesh(g: THREE.BufferGeometry, kind: number, parent: THREE.Object3D) {
    const m = new THREE.Mesh(g, this.mats[kind]);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  private buildBody() {
    // spindle from the tail base (−z) to the neck (+z)
    const prof: [number, number][] = [
      [0.0, -0.4],
      [0.05, -0.37],
      [0.095, -0.26],
      [0.13, -0.1],
      [0.14, 0.04],
      [0.128, 0.17],
      [0.095, 0.29],
      [0.068, 0.37],
      [0.0, 0.43],
    ];
    const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    body.rotateX(Math.PI / 2);
    body.scale(1.22, 0.98, 1);
    this.mesh(body, 1, this.bird);

    // head (stabilised separately, like a real raptor's)
    this.head.position.set(0, 0.07, 0.42);
    this.bird.add(this.head);
    const skull = new THREE.SphereGeometry(1, 26, 18);
    skull.scale(0.068, 0.072, 0.13);
    skull.translate(0, 0.01, 0.06);
    this.mesh(skull, 1, this.head);
    // brow ridge: the stern raptor line over the eyes
    const brow = new THREE.SphereGeometry(1, 16, 10);
    brow.scale(0.062, 0.02, 0.06);
    brow.translate(0, 0.05, 0.1);
    this.mesh(brow, 1, this.head);
    // hooked beak
    const beak = new THREE.ConeGeometry(0.034, 0.13, 14, 6);
    beak.rotateX(Math.PI / 2);
    const p = beak.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = clamp((p.getZ(i) + 0.065) / 0.13);
      p.setY(i, p.getY(i) * (1 - 0.2 * t) - 0.07 * Math.pow(t, 2.4));
    }
    beak.computeVertexNormals();
    beak.translate(0, 0.004, 0.215);
    this.mesh(beak, 2, this.head);
    // eyes: the faintest amber, not a light source
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8641f').multiplyScalar(0.5) });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), eyeM);
      e.position.set(0.05 * sx, 0.032, 0.125);
      this.head.add(e);
    }

    // tucked legs and talons beneath the tail
    for (const sx of [-1, 1]) {
      const thigh = new THREE.SphereGeometry(1, 14, 10);
      thigh.scale(0.045, 0.05, 0.1);
      thigh.translate(0.045 * sx, -0.085, -0.1);
      this.mesh(thigh, 1, this.bird);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.ConeGeometry(0.009, 0.06, 6);
        c.rotateX(-Math.PI / 2 - 0.5);
        c.translate(0.045 * sx + (k - 1) * 0.014, -0.13, -0.2);
        this.mesh(c, 2, this.bird);
      }
    }

    // scapulars cover the wing roots
    const scap: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) scap.push(placed(feather(0.3 - k * 0.03, 0.12, { bend: 0.02 }), 0.055 * sx, 0.105 - k * 0.006, 0.1 - k * 0.05, 0.16 * sx));
    }
    this.mesh(mergeGeometries(scap), 0, this.bird);
  }

  private buildWing(side: 1 | -1) {
    const mount = new THREE.Group();
    mount.position.set(0.065 * side, 0.075, 0.09);
    if (side < 0) mount.scale.x = -1;
    this.bird.add(mount);
    const shoulder = new THREE.Group();
    const arm = new THREE.Group();
    const fore = new THREE.Group();
    const hand = new THREE.Group();
    mount.add(shoulder);
    shoulder.add(arm);
    fore.position.x = 0.28;
    arm.add(fore);
    hand.position.x = 0.36;
    fore.add(hand);

    // arm: limb, tertials, coverts
    const armG: THREE.BufferGeometry[] = [limb(0.28, 0.034, 0.026)];
    for (let i = 0; i < 5; i++) armG.push(placed(feather(0.46 + i * 0.02, 0.17), 0.03 + i * 0.058, -0.004 - i * 0.001, 0, -0.02 * i));
    for (let i = 0; i < 5; i++) armG.push(placed(feather(0.21, 0.1, { bend: 0.02 }), 0.025 + i * 0.058, 0.014, 0.016, -0.02 * i));
    for (let i = 0; i < 6; i++) armG.push(placed(feather(0.12, 0.08, { bend: 0.01 }), 0.02 + i * 0.048, 0.026, 0.03, 0));
    this.mesh(mergeGeometries(armG), 0, arm);

    // forearm: limb, secondaries, greater + lesser coverts
    const foreG: THREE.BufferGeometry[] = [limb(0.36, 0.026, 0.019)];
    for (let i = 0; i < 10; i++) foreG.push(placed(feather(0.57 - i * 0.004, 0.17), 0.01 + i * 0.038, -0.005 - i * 0.0012, 0, -0.035 * i));
    for (let i = 0; i < 10; i++) foreG.push(placed(feather(0.27, 0.12, { bend: 0.02 }), 0.008 + i * 0.037, 0.014, 0.016, -0.03 * i));
    for (let i = 0; i < 10; i++) foreG.push(placed(feather(0.13, 0.08, { bend: 0.01 }), 0.006 + i * 0.037, 0.027, 0.03, -0.02 * i));
    this.mesh(mergeGeometries(foreG), 0, fore);

    // hand: limb, coverts (static) + primaries (each its own mesh so the fingers can spread)
    const handG: THREE.BufferGeometry[] = [limb(0.26, 0.019, 0.01)];
    for (let i = 0; i < 7; i++) handG.push(placed(feather(0.2 - i * 0.008, 0.09, { bend: 0.02 }), 0.01 + i * 0.035, 0.016, 0.016, -(0.4 + i * 0.14)));
    for (let i = 0; i < 6; i++) handG.push(placed(feather(0.11, 0.07, { bend: 0.01 }), 0.008 + i * 0.04, 0.027, 0.028, -(0.3 + i * 0.12)));
    this.mesh(mergeGeometries(handG), 0, hand);

    const lens = [0.58, 0.61, 0.65, 0.7, 0.75, 0.79, 0.81, 0.8, 0.74, 0.64];
    const primaries: Wing['primaries'] = [];
    for (let i = 0; i < 10; i++) {
      const f = i / 9;
      const g = feather(lens[i], lerp(0.16, 0.11, f), { notch: i >= 5 ? 0.42 : 0, asym: 0.18, bend: 0.07 });
      const m = this.mesh(g, 0, hand);
      m.position.set(0.02 + 0.235 * Math.pow(f, 0.8), -0.003 * i, 0);
      const a = 0.12 + 1.22 * Math.pow(f, 1.15);
      m.rotation.y = -a;
      primaries.push({ m, a });
    }
    this.wings.push({ shoulder, arm, fore, hand, primaries, side });
  }

  private buildTail() {
    this.tail.position.set(0, 0.012, -0.33);
    this.bird.add(this.tail);
    for (let i = 0; i < 10; i++) {
      const f = i / 9;
      const m = this.mesh(feather(0.4 + 0.03 * Math.sin(Math.PI * f), 0.14, { bend: -0.01 }), 0, this.tail);
      const a = lerp(-0.24, 0.24, f);
      m.position.set(lerp(-0.045, 0.045, f), -0.002 * Math.abs(i - 4.5), 0);
      m.rotation.y = a;
      this.tailFeathers.push({ m, a });
    }
    const cov: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) cov.push(placed(feather(0.18, 0.09, { bend: 0.01 }), lerp(-0.035, 0.035, i / 4), 0.014, 0.02, lerp(-0.2, 0.2, i / 4)));
    this.mesh(mergeGeometries(cov), 0, this.tail);
  }

  /* — theme ———————————————————————————————————————————————————————————— */

  setTheme(light: boolean) {
    this.uniforms.uRimK.value = light ? 0.85 : 1;
  }

  /* — stage ———————————————————————————————————————————————————————————— */

  onChange(e: ChangeEvent) {
    if (e.from.kind === 'origin' && e.to.kind !== 'origin') this.from = this.u;
    if (e.to.kind === 'origin' && e.from.kind !== 'origin') this.scrub = this.u = this.prevU = 0;
  }

  update(s: StageState) {
    const a = s.from.kind === 'origin' ? 1 : 0;
    const b = s.to.kind === 'origin' ? 1 : 0;

    // The origin is the eagle's sky: the plates step aside there, and return everywhere else.
    let target: number;
    if (s.t >= 1 || a === b) target = s.t >= 1 ? b : a;
    else target = a * presence(true, false, s.t, 0.3) + b * presence(false, true, s.t, 0.4, 0.7, 1);
    this.sky = s.reduced ? target : damp(this.sky, target, 6, s.dt);
    if (s.t >= 1 && b === 1) this.sky = 1;
    this.world.plates.setVisibility(a || b ? 1 - clamp(this.sky) : 1);

    // Flight progress: scrubbed on the origin, carried out by the transition when leaving it.
    if (s.reduced) this.u = 0;
    else if (b === 1) this.u = a === 1 ? damp(this.u, this.scrub, 4.2, s.dt) : 0;
    else if (a === 1) {
      const x = clamp(s.t / 0.55); // gone before the next section settles
      const k = this.from < 0.04 ? smoothstep(0, 1, x) : 1 - Math.pow(1 - x, 1.7);
      this.u = lerp(this.from, 1, k);
    } else this.u = 0;

    const speed = Math.abs(this.u - this.prevU) / Math.max(s.dt, 1e-3);
    this.prevU = this.u;
    this.root.visible = this.u > 0.002 && this.u < 0.998;
    if (!this.root.visible) {
      this.lean = 0;
      return;
    }
    this.fly(s.dt, s.time, speed);
  }

  /* — flight ——————————————————————————————————————————————————————————— */

  private toCam(k: number[], out: THREE.Vector3) {
    const cam = this.world.rig.camera;
    out.set(k[0], k[1], 0.5).applyMatrix4(cam.projectionMatrixInverse);
    return out.multiplyScalar(-k[2] / out.z);
  }

  private fly(dt: number, time: number, speed: number) {
    const cam = this.world.rig.camera;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const path = window.innerHeight > window.innerWidth * 1.08 ? PATH_TALL : PATH_WIDE;
    const u = this.u;

    // position + heading along the path (camera space)
    const k = sample(path, u, this.k);
    this.toCam(k, this.root.position);
    const e = 0.015;
    this.toCam(sample(path, Math.max(0, u - e), [0, 0, 0, 0]), this.v0);
    this.toCam(sample(path, Math.min(1, u + e), [0, 0, 0, 0]), this.v1);
    const F = this.v1.sub(this.v0).normalize();
    this.vx.crossVectors(this.up, F).normalize();
    this.vy.crossVectors(F, this.vx);
    this.m4.makeBasis(this.vx, this.vy, F);
    this.root.quaternion.setFromRotationMatrix(this.m4);

    // size: a constant share of the frame, trimmed on narrow screens
    const fov = THREE.MathUtils.degToRad(cam.fov);
    this.root.scale.setScalar(0.62 * 12 * Math.tan(fov / 2) * Math.min(1, aspect / 0.95));

    // stroke: strong beats coming in, a slower held rhythm mid-frame, a last beat, then a tuck
    const fold = smoothstep(0.84, 1.0, u) * 0.75;
    const beat = u < 0.3 ? 1 : u < 0.7 ? lerp(1, 0.55, smoothstep(0.3, 0.45, u)) : lerp(0.55, 0.95, smoothstep(0.7, 0.8, u));
    const omega = Math.PI * 2 * (0.72 + 0.3 * Math.min(1, speed * 1.4));
    this.phase += omega * dt;
    const A = (0.14 + 0.74 * beat) * (1 - fold);
    const sn = Math.sin(this.phase);
    const cs = Math.cos(this.phase);
    const upS = Math.max(0, cs); // wings rising
    const roll = k[3] + 0.045 * Math.sin(time * 0.7);

    for (const w of this.wings) {
      const inner = Math.max(0, -roll * w.side); // the wing on the inside of a turn rides a touch higher
      w.shoulder.rotation.z = 0.16 + inner * 0.12 + A * 0.72 * sn;
      w.arm.rotation.set(-0.2 * cs * A, 0.25 + 0.2 * upS * A + fold * 0.9, 0);
      w.fore.rotation.set(0, -0.45 - 0.3 * upS * A - fold * 1.55, A * 0.32 * Math.sin(this.phase - 0.5));
      w.hand.rotation.set(-0.26 * cs * A, 0.3 + 0.5 * upS * A + fold * 1.35, A * 0.5 * Math.sin(this.phase - 1.0));
      const spread = 1 - 0.38 * upS * A - 0.55 * fold;
      for (const p of w.primaries) p.m.rotation.y = -p.a * spread;
    }

    // the body rides the stroke; the head holds level against it
    this.bank.rotation.z = roll;
    this.bird.position.y = -0.035 * A * sn;
    this.bird.rotation.x = 0.045 * A * cs;
    this.head.rotation.set(-this.bird.rotation.x - 0.06, 0, -roll * 0.55);
    this.tail.rotation.x = 0.06 + 0.05 * Math.sin(this.phase - 0.8) + fold * 0.1;
    const fan = 1 + 0.55 * Math.min(1, Math.abs(roll) * 1.6);
    for (const t of this.tailFeathers) t.m.rotation.y = t.a * fan;

    this.lean = 0.016 * clamp(k[0], -1, 1);
  }
}
