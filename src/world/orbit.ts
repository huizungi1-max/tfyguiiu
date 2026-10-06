import * as THREE from 'three';
import type { World } from './world';
import { HERO } from './compositions';
import { presence, type StageState, type StageSystem } from './director';
import { clamp, damp } from '../core/math';
import { createRadialTexture } from './environment';

/**
 * The hero sculpture: a chrome gyroscope of intersecting rings, wide orbit
 * ellipses, a glowing light beam and a quiet HUD — standing where the monolith
 * used to. Shown only on the origin step; the monolith plates fade out while it
 * is up, so every other section keeps the full plate structure.
 *
 * Glow is built from layered additive halos (no post-processing pass), so it is
 * cheap and cannot leak into the other compositions.
 */

const ORANGE = new THREE.Color('#ff5b24');
const HOT = new THREE.Color('#ffb27a');
const LINE = new THREE.Color('#9aa0aa');

type Fade = { set(v: number): void };

export class Orbit implements StageSystem {
  readonly group = new THREE.Group();
  /** Faces the camera: beam, orbit ellipses, HUD. */
  private face = new THREE.Group();
  /** The spinning gyroscope. */
  private gyro = new THREE.Group();
  private spin: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[] = [];
  private fades: Fade[] = [];
  private reveal = 0;
  private radial = createRadialTexture(128, 2.4);

  constructor(private world: World) {
    this.group.position.copy(HERO.p).add(new THREE.Vector3(-0.4, 0.5, -1.6));
    this.group.rotation.y = THREE.MathUtils.degToRad(HERO.az);
    this.group.scale.setScalar(3.5);
    this.group.visible = false;
    this.group.add(this.face, this.gyro);
    world.scene.add(this.group);

    this.buildGyro();
    this.buildOrbits();
    this.buildBeam();
    this.buildHud();
  }

  /* — materials ———————————————————————————————————————————————————————— */

  private chrome() {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#dfe2e7',
      metalness: 1,
      roughness: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 2.6,
      transparent: true,
    });
    this.fades.push({ set: (v) => (m.opacity = v) });
    return m;
  }

  /** Flat additive colour — glows, ignores lighting and tone mapping. */
  private glow(color: THREE.Color, opacity: number) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.fades.push({ set: (v) => (m.opacity = opacity * v) });
    return m;
  }

  private lineMat(color: THREE.Color, opacity: number, dashed = false) {
    const m = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0, dashSize: 0.045, gapSize: 0.04, depthWrite: false, fog: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.fades.push({ set: (v) => (m.opacity = opacity * v) });
    return m;
  }

  /** A glowing tube: hot core + two soft halos (fake bloom). */
  private glowTube(curve: THREE.Curve<THREE.Vector3>, r: number, parent: THREE.Object3D, segs = 90) {
    const layers: [number, THREE.Color, number][] = [
      [r, HOT, 1],
      [r * 2.1, ORANGE, 0.6],
      [r * 3.4, ORANGE, 0.1],
    ];
    for (const [rad, col, op] of layers) {
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, rad, 10, false), this.glow(col, op));
      mesh.renderOrder = 5;
      parent.add(mesh);
    }
  }

  private sprite(color: THREE.Color, size: number, opacity: number, parent: THREE.Object3D, at = new THREE.Vector3()) {
    const m = new THREE.SpriteMaterial({ map: this.radial, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.fades.push({ set: (v) => (m.opacity = opacity * v) });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.position.copy(at);
    s.renderOrder = 6;
    parent.add(s);
    return s;
  }

  /* — the gyroscope ———————————————————————————————————————————————————— */

  private buildGyro() {
    const torus = (r: number, tube: number) => new THREE.TorusGeometry(r, tube, 24, 200);
    const arcCurve = (r: number, a0: number, a1: number) =>
      new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / 47;
        return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
      }));

    // A — the big near-circle, a little tilted
    const a = new THREE.Mesh(torus(1, 0.03), this.chrome());
    a.rotation.set(0.32, -0.25, 0.1);
    this.gyro.add(a);
    this.glowTube(arcCurve(1, 0.35, 1.25), 0.022, a);
    this.glowTube(arcCurve(1, 3.55, 3.95), 0.018, a);

    // B — a strongly tilted ellipse crossing A
    const b = new THREE.Mesh(torus(0.9, 0.034), this.chrome());
    b.rotation.set(1.18, 0.35, -0.55);
    b.scale.set(1.05, 0.62, 1);
    this.gyro.add(b);
    this.glowTube(arcCurve(0.9, 4.3, 5.25), 0.024, b);

    // C — a smaller inner ring on the third axis
    const c = new THREE.Mesh(torus(0.62, 0.022), this.chrome());
    c.rotation.set(0.15, 1.15, 0.85);
    this.gyro.add(c);
    this.glowTube(arcCurve(0.62, 1.9, 2.5), 0.016, c);

    this.gyro.rotation.set(0.08, 0, -0.22);
    this.spin.push({ obj: a, axis: 'z', rate: 0.05 }, { obj: b, axis: 'z', rate: -0.08 }, { obj: c, axis: 'z', rate: 0.12 }, { obj: this.gyro, axis: 'y', rate: 0.05 });
  }

  /* — wide orbit ellipses (camera-facing) —————————————————————————————— */

  private ellipse(rx: number, ry: number, a0: number, a1: number, n = 160) {
    return Array.from({ length: n }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / (n - 1);
      return new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0);
    });
  }

  private buildOrbits() {
    const orbit = (rx: number, ry: number, tilt: number, opacity: number, dashed: boolean, hot?: [number, number]) => {
      const g = new THREE.Group();
      g.rotation.z = tilt;
      const pts = this.ellipse(rx, ry, 0, Math.PI * 2, 220);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.lineMat(LINE, opacity, dashed));
      if (dashed) line.computeLineDistances();
      g.add(line);
      if (hot) this.glowTube(new THREE.CatmullRomCurve3(this.ellipse(rx, ry, hot[0], hot[1], 50)), 0.007, g, 70);
      this.face.add(g);
    };
    // the big sweeping orbit that crosses the beam, with a hot segment low-right
    orbit(1.5, 0.58, -0.42, 0.42, false, [-0.75, 0.05]);
    // a second, rounder orbit, dashed
    orbit(1.26, 1.08, 0.12, 0.3, true);
    // a faint outer orbit with a hot segment upper-left
    orbit(1.68, 0.76, 0.55, 0.16, false, [2.35, 2.75]);
  }

  /* — the light beam ———————————————————————————————————————————————————— */

  private buildBeam() {
    // soft profile across the width and long fades at both ends
    const beamMat = (color: THREE.Color, opacity: number, soft: number) => {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uC: { value: color }, uO: { value: 0 }, uS: { value: soft } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uC; uniform float uO; uniform float uS; varying vec2 vUv;
          void main(){
            float ends = smoothstep(0.1, 0.42, vUv.y) * smoothstep(1.0, 0.72, vUv.y); // long fade at the foot
            float across = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), uS);
            gl_FragColor = vec4(uC * uO * ends * across, uO * ends * across);
          }`,
      });
      this.fades.push({ set: (v) => (m.uniforms.uO.value = opacity * v) });
      return m;
    };
    const beam = new THREE.Group();
    beam.rotation.z = THREE.MathUtils.degToRad(-8); // top leans right; the foot clears the name
    beam.position.set(0.26, 0.1, 0.2);
    const len = 8.5;
    const layers: [number, THREE.Color, number, number][] = [
      [0.6, ORANGE, 0.24, 2.4], // wide soft glow
      [0.22, ORANGE, 0.9, 1.6], // orange body
      [0.07, HOT, 1, 1.4], // warm inner
      [0.022, new THREE.Color('#ffffff'), 1, 1.2], // white-hot core
    ];
    layers.forEach(([w, c, o, s], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), beamMat(c, o, s));
      m.renderOrder = 7 + i;
      beam.add(m);
    });
    this.face.add(beam);
    // the hot spot where the beam passes through the gyroscope
    this.sprite(ORANGE, 1.5, 0.55, this.face, new THREE.Vector3(0.24, 0.08, 0.25));
    this.sprite(new THREE.Color('#ffffff'), 0.45, 0.6, this.face, new THREE.Vector3(0.24, 0.08, 0.3));
  }

  /* — HUD: thin verticals with orange markers, a few nodes ————————————— */

  private buildHud() {
    const seg = (x0: number, y0: number, x1: number, y1: number, color: THREE.Color, opacity: number) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, -0.1), new THREE.Vector3(x1, y1, -0.1)]), this.lineMat(color, opacity));
      this.face.add(l);
    };
    // thin vertical guides behind the gyroscope
    const verticals: [number, number, number][] = [
      [-0.92, -0.5, 0.95],
      [-0.6, -0.2, 1.25],
      [0.42, -0.85, 0.6],
      [0.72, -0.35, 1.05],
      [1.08, -0.6, 0.4],
    ];
    for (const [x, y0, y1] of verticals) {
      seg(x, y0, x, y1, LINE, 0.22);
      seg(x, y1, x, y1 + 0.07, ORANGE, 0.9); // orange marker cap
    }
    // short horizontal leaders with orange ends
    seg(-1.45, 0.08, -1.12, 0.08, LINE, 0.3);
    seg(-1.12, 0.08, -1.06, 0.08, ORANGE, 0.9);
    seg(1.3, 0.55, 1.62, 0.55, LINE, 0.28);
    seg(1.3, 0.55, 1.36, 0.55, ORANGE, 0.9);
    // small glowing nodes
    this.sprite(ORANGE, 0.12, 0.9, this.face, new THREE.Vector3(1.48, -0.52, 0));
    this.sprite(ORANGE, 0.09, 0.8, this.face, new THREE.Vector3(-1.2, 0.62, 0));
    this.sprite(ORANGE, 0.1, 0.85, this.face, new THREE.Vector3(0.95, 1.02, 0));
  }

  /* — stage ———————————————————————————————————————————————————————————— */

  update(s: StageState) {
    const a = s.from.kind === 'origin' ? 1 : 0;
    const b = s.to.kind === 'origin' ? 1 : 0;
    let target: number;
    if (s.t >= 1 || a === b) target = s.t >= 1 ? b : a;
    else target = a * presence(true, false, s.t, 0.3) + b * presence(false, true, s.t, 0.4, 0.7, 1);

    this.reveal = s.reduced ? target : damp(this.reveal, target, 6, s.dt);
    if (s.t >= 1 && b === 1) this.reveal = 1; // settled on origin: fully on, no lingering damp
    const v = clamp(this.reveal);

    // The sculpture replaces the monolith on origin; elsewhere the plates stay full.
    if (s.from.kind === 'origin' || s.to.kind === 'origin') this.world.plates.setVisibility(1 - v);
    else this.world.plates.setVisibility(1);

    this.group.visible = v > 0.002;
    if (!this.group.visible) return;

    if (!s.reduced) for (const { obj, axis, rate } of this.spin) obj.rotation[axis] += rate * s.dt;
    this.group.scale.setScalar(3.5 * (0.92 + 0.08 * v));
    for (const f of this.fades) f.set(v);
  }
}
