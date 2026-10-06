import * as THREE from 'three';
import type { World } from './world';
import { HERO } from './compositions';
import { presence, type StageState, type StageSystem } from './director';
import { clamp, damp } from '../core/math';

/**
 * The hero sculpture: intersecting elliptical rings crossed by a vertical light
 * beam — a gyroscope / orbit standing where the monolith used to. It lives in
 * the scene beside the plates and is only present on the origin step; the
 * director hides the monolith plates while it shows, so every other section is
 * untouched.
 *
 * Built from a few large forms, not hundreds of objects: three rings, one beam,
 * two accent arcs, and a faint HUD. Depth and the slow turn do the work.
 */

const ACCENT = new THREE.Color('#ff5b24');
const STEEL = new THREE.Color('#3a3d44');

export class Orbit implements StageSystem {
  readonly group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private spin: { obj: THREE.Object3D; rate: number }[] = [];
  private mats: THREE.Material[] = [];
  private emissives: THREE.MeshStandardMaterial[] = [];
  private beamShaders: THREE.ShaderMaterial[] = [];
  private reveal = 0;

  constructor(private world: World) {
    // Stand where the monolith stood, a touch deeper so the rings have room.
    this.group.position.copy(HERO.p).add(new THREE.Vector3(0.4, 0.3, -1.2));
    this.group.rotation.y = THREE.MathUtils.degToRad(HERO.az);
    this.group.scale.setScalar(2.9);
    this.group.visible = false;
    world.scene.add(this.group);

    // — three rings on different axes, like a gyroscope ———————————————
    const ringGeo = (r: number, tube: number) => new THREE.TorusGeometry(r, tube, 20, 160);
    const steelMat = () => {
      const m = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
      this.mats.push(m);
      return m;
    };

    const rA = new THREE.Mesh(ringGeo(1.0, 0.028), steelMat());
    const rB = new THREE.Mesh(ringGeo(0.86, 0.03), steelMat());
    rB.rotation.set(Math.PI / 2.3, 0.5, 0.2);
    const rC = new THREE.Mesh(ringGeo(0.72, 0.022), steelMat());
    rC.rotation.set(0.7, 1.2, Math.PI / 2);
    rA.rotation.set(0.25, 0, 0.15);
    [rA, rB, rC].forEach((r, i) => {
      r.scale.set(1, i === 1 ? 0.78 : 0.92, 1); // make them elliptical, not perfect circles
      this.group.add(r);
      this.rings.push(r);
    });
    this.spin.push({ obj: rA, rate: 0.08 }, { obj: rB, rate: -0.13 }, { obj: rC, rate: 0.17 });

    // — orange emissive accent arcs riding two of the rings ———————————————
    const arc = (radius: number, len: number, start: number) => {
      const g = new THREE.TorusGeometry(radius, 0.034, 16, 120, len);
      const m = new THREE.MeshStandardMaterial({
        color: ACCENT,
        emissive: ACCENT,
        emissiveIntensity: 2.4,
        metalness: 0.4,
        roughness: 0.4,
        toneMapped: true,
      });
      this.emissives.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.z = start;
      return mesh;
    };
    const arcA = arc(1.0, Math.PI * 0.42, 0.9);
    arcA.rotation.copy(rA.rotation);
    arcA.rotateZ(0.9);
    this.group.add(arcA);
    this.spin.push({ obj: arcA, rate: 0.08 });
    const arcC = arc(0.72, Math.PI * 0.3, 2.4);
    arcC.rotation.copy(rC.rotation);
    this.group.add(arcC);
    this.spin.push({ obj: arcC, rate: 0.17 });

    // — the vertical light beam slicing through the rings ———————————————
    // A soft glow bar that fades at both ends (a shader gradient, not a hard line),
    // with a hot white core down its centre.
    const beamShader = (color: THREE.ColorRepresentation, soft: number) => {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uC: { value: new THREE.Color(color) }, uO: { value: 0 }, uSoft: { value: soft } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uC; uniform float uO; uniform float uSoft; varying vec2 vUv;
          void main(){
            float ends = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);   // fade top & bottom
            float across = pow(1.0 - abs(vUv.x - 0.5) * 2.0, uSoft);                      // soft across the width
            gl_FragColor = vec4(uC, uO * ends * across);
          }`,
      });
      this.beamShaders.push(m);
      return m;
    };
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 6.6), beamShader(ACCENT, 1.6));
    beam.rotation.z = THREE.MathUtils.degToRad(14);
    beam.renderOrder = 3;
    this.group.add(beam);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 6.6), beamShader(0xffffff, 2.6));
    core.rotation.z = beam.rotation.z;
    core.renderOrder = 4;
    this.group.add(core);

    // — faint HUD: a dashed arc + a few crosshair ticks ———————————————
    const hud = new THREE.Group();
    const lineMat = new THREE.LineDashedMaterial({ color: STEEL, transparent: true, opacity: 0, dashSize: 0.06, gapSize: 0.05 });
    this.hudMat = lineMat;
    const dashPts: THREE.Vector3[] = [];
    for (let a = -0.6; a <= 2.4; a += 0.03) dashPts.push(new THREE.Vector3(Math.cos(a) * 1.28, Math.sin(a) * 1.1, 0));
    const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(dashPts), lineMat);
    dashed.computeLineDistances();
    hud.add(dashed);
    this.group.add(hud);

    // slow overall drift so the sculpture is alive but calm
    this.spin.push({ obj: this.group, rate: 0.015 });
  }

  private hudMat!: THREE.LineDashedMaterial;

  update(s: StageState) {
    const a = s.from.kind === 'origin' ? 1 : 0;
    const b = s.to.kind === 'origin' ? 1 : 0;
    let target: number;
    if (s.t >= 1 || a === b) target = s.t >= 1 ? b : a;
    else target = a * presence(true, false, s.t, 0.3) + b * presence(false, true, s.t, 0.4, 0.7, 1);

    this.reveal = s.reduced ? target : damp(this.reveal, target, 6, s.dt);
    // Settled origin: pin the sculpture fully on and the monolith fully off (no lingering damp).
    if (s.t >= 1 && b === 1) this.reveal = 1;
    const v = clamp(this.reveal);

    // The sculpture replaces the monolith on origin: fade the plates out as it fades in.
    // Only touch plate visibility while origin is involved; otherwise leave them full.
    if (s.from.kind === 'origin' || s.to.kind === 'origin') this.world.plates.setVisibility(1 - v);
    else this.world.plates.setVisibility(1);

    this.group.visible = v > 0.002;
    if (!this.group.visible) return;

    // Spin the gyroscope; the group drift is included in `spin`.
    for (const { obj, rate } of this.spin) obj.rotation.y += rate * s.dt;
    // Rings scale/fade in; beam and HUD ride the same reveal.
    this.group.scale.setScalar(2.9 * (0.9 + 0.1 * v));
    for (const m of this.mats) ((m as THREE.MeshStandardMaterial).opacity = v), (m.transparent = true);
    this.mats.forEach((m) => (m.opacity = v));
    this.emissives.forEach((m) => ((m.transparent = true), (m.opacity = v), (m.emissiveIntensity = 2.4 * v)));
    // beam (0) and core (1) ride the reveal; the core is hotter
    if (this.beamShaders[0]) this.beamShaders[0].uniforms.uO.value = 0.7 * v;
    if (this.beamShaders[1]) this.beamShaders[1].uniforms.uO.value = 1.0 * v;
    this.hudMat.opacity = 0.22 * v;
  }
}
