import * as THREE from 'three';
import { bump, clamp, damp, dampK, ease, lerp, lerpAngle } from '../core/math';

/** A camera composition, expressed around what the camera looks at. */
export interface Shot {
  target: THREE.Vector3;
  dist: number;
  /** Azimuth around the target (rad). 0 = camera on +Z looking toward −Z. */
  az: number;
  /** Elevation (rad). */
  el: number;
  /** Vertical field of view (deg). */
  fov: number;
  /** Lens shift in NDC — composes the subject off-centre without changing perspective. */
  sx: number;
  sy: number;
  roll: number;
}

export interface MoveSpec {
  /** Extra FOV at mid-move: a sense of speed without shaking. */
  fovKick?: number;
  /** Temporary elevation added at mid-move (rad) — arcs over things instead of through them. */
  lift?: number;
  /** Temporary distance multiplier at mid-move — a breath out between compositions. */
  breathe?: number;
  /** Extra azimuth swing at mid-move (rad). */
  swing?: number;
  /** Interpolate distance logarithmically (natural for big scale changes). */
  logDist?: boolean;
}

export const shot = (
  target: [number, number, number],
  dist: number,
  azDeg: number,
  elDeg: number,
  fov = 34,
  sx = 0,
  sy = 0,
  rollDeg = 0,
): Shot => ({
  target: new THREE.Vector3(...target),
  dist,
  az: THREE.MathUtils.degToRad(azDeg),
  el: THREE.MathUtils.degToRad(elDeg),
  fov,
  sx,
  sy,
  roll: THREE.MathUtils.degToRad(rollDeg),
});

export const cloneShot = (s: Shot): Shot => ({ ...s, target: s.target.clone() });

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** The composed (pre-ambient) shot. */
  readonly base: Shot;
  /** The smoothed shot actually rendered (before parallax). */
  private out: Shot;
  private pointer = new THREE.Vector2();
  private pointerSmoothed = new THREE.Vector2();
  private pos = new THREE.Vector3();
  private tgt = new THREE.Vector3();
  private w = 1;
  private h = 1;
  parallax = 1;
  drift = 1;

  constructor(initial: Shot) {
    this.camera = new THREE.PerspectiveCamera(initial.fov, 1, 0.1, 400);
    this.base = cloneShot(initial);
    this.out = cloneShot(initial);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
  }

  setPointer(x: number, y: number) {
    this.pointer.set(clamp(x, -1, 1), clamp(y, -1, 1));
  }

  /** Interpolate between two shots at progress t ∈ [0,1], writing into `base`. */
  blend(a: Shot, b: Shot, t: number, spec: MoveSpec = {}) {
    const pt = ease.camera(t);
    const lt = ease.lead(t);
    const s = this.base;
    s.target.lerpVectors(a.target, b.target, lt);
    s.dist = spec.logDist ? a.dist * Math.pow(b.dist / a.dist, pt) : lerp(a.dist, b.dist, pt);
    s.az = lerpAngle(a.az, b.az, pt) + (spec.swing ?? 0) * bump(t);
    s.el = lerp(a.el, b.el, pt) + (spec.lift ?? 0) * bump(t);
    s.fov = lerp(a.fov, b.fov, pt) + (spec.fovKick ?? 0) * bump(Math.pow(t, 0.8));
    s.sx = lerp(a.sx, b.sx, lt);
    s.sy = lerp(a.sy, b.sy, lt);
    s.roll = lerp(a.roll, b.roll, pt);
    if (spec.breathe) s.dist *= 1 + (spec.breathe - 1) * bump(t);
  }

  set(s: Shot) {
    const b = this.base;
    b.target.copy(s.target);
    b.dist = s.dist;
    b.az = s.az;
    b.el = s.el;
    b.fov = s.fov;
    b.sx = s.sx;
    b.sy = s.sy;
    b.roll = s.roll;
  }

  /** Hard-sync the smoothed output (no catch-up) — after resizes or instant jumps. */
  snap() {
    const o = this.out;
    const b = this.base;
    o.target.copy(b.target);
    o.dist = b.dist;
    o.az = b.az;
    o.el = b.el;
    o.fov = b.fov;
    o.sx = b.sx;
    o.sy = b.sy;
    o.roll = b.roll;
  }

  update(dt: number, time: number) {
    // Light critically-damped follow in shot space: absorbs velocity discontinuities
    // (e.g. a project chosen mid-flight) while keeping orbits as orbits.
    const k = dampK(14, dt);
    const o = this.out;
    const b = this.base;
    o.target.lerp(b.target, k);
    o.dist = lerp(o.dist, b.dist, k);
    o.az = lerpAngle(o.az, b.az, k);
    o.el = lerp(o.el, b.el, k);
    o.fov = lerp(o.fov, b.fov, k);
    o.sx = lerp(o.sx, b.sx, k);
    o.sy = lerp(o.sy, b.sy, k);
    o.roll = lerp(o.roll, b.roll, k);

    this.pointerSmoothed.x = damp(this.pointerSmoothed.x, this.pointer.x, 2.2, dt);
    this.pointerSmoothed.y = damp(this.pointerSmoothed.y, this.pointer.y, 2.2, dt);

    const px = this.pointerSmoothed.x * this.parallax;
    const py = this.pointerSmoothed.y * this.parallax;
    const d = this.drift;
    const az = o.az + px * 0.05 + d * 0.014 * Math.sin(time * 0.11);
    const el = o.el - py * 0.032 + d * 0.01 * Math.sin(time * 0.153 + 1.3);
    const cosEl = Math.cos(el);
    this.tgt.copy(o.target);
    this.tgt.y += d * 0.04 * Math.sin(time * 0.19 + 0.4);
    this.pos.set(
      this.tgt.x + o.dist * Math.sin(az) * cosEl,
      this.tgt.y + o.dist * Math.sin(el),
      this.tgt.z + o.dist * Math.cos(az) * cosEl,
    );

    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tgt);
    if (o.roll !== 0) cam.rotateZ(o.roll);
    cam.fov = o.fov;
    // Lens shift via view offset (supported by both WebGL and CSS3D renderers).
    cam.setViewOffset(this.w, this.h, (-o.sx * this.w) / 2, (o.sy * this.h) / 2, this.w, this.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
