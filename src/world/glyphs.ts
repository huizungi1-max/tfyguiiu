import * as THREE from 'three';
import { ACCENT, type Plates } from './plates';
import { GLYPH_AT } from './compositions';
import { createRadialTexture } from './environment';
import { clamp, damp, ease } from '../core/math';
import type { StageState, StageSystem } from './director';

/**
 * Eight illustrative constructions — one per build. They are visual metaphors
 * (captioned "Illustrative" in the UI), never depictions of finished hardware.
 * Each assembles once when its build arrives; afterwards it is still.
 */

const deg = THREE.MathUtils.degToRad;

/* -------------------------------------------------------------------------- */
/* Materials                                                                   */
/* -------------------------------------------------------------------------- */
interface Mats {
  metal: THREE.MeshPhysicalMaterial;
  steel: THREE.MeshPhysicalMaterial;
  matte: THREE.MeshPhysicalMaterial;
  light: THREE.MeshBasicMaterial;
  accent: THREE.MeshBasicMaterial;
  dim: THREE.MeshBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  glow: THREE.SpriteMaterial;
}

function materials(): Mats {
  const radial = createRadialTexture(128, 2.0);
  return {
    metal: new THREE.MeshPhysicalMaterial({ color: '#3a3d43', metalness: 1, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    steel: new THREE.MeshPhysicalMaterial({ color: '#a4a7ad', metalness: 1, roughness: 0.24, clearcoat: 0.3 }),
    matte: new THREE.MeshPhysicalMaterial({ color: '#17181b', metalness: 0.25, roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    light: new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1e2').multiplyScalar(1.15), toneMapped: false }),
    accent: new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false }),
    dim: new THREE.MeshBasicMaterial({ color: '#4a4a4c', toneMapped: false }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, alphaMap: radial, depthWrite: false }),
    glow: new THREE.SpriteMaterial({ map: radial, color: ACCENT, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  };
}

/* -------------------------------------------------------------------------- */
/* Part system: everything reveals from a base transform with a delay          */
/* -------------------------------------------------------------------------- */
type RevealKind = 'grow' | 'pop' | 'drop' | 'rise' | 'draw' | 'slide';

interface Part {
  obj: THREE.Object3D;
  kind: RevealKind;
  delay: number; // 0..1 portion of the reveal timeline
  span: number;
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  from?: THREE.Vector3; // for slide
  drawCount?: number;
}

class Glyph {
  readonly group = new THREE.Group();
  readonly parts: Part[] = [];
  /** Optional label anchors (glyph-local) with text, for projected labels. */
  readonly anchors: { p: THREE.Vector3; text: string }[] = [];
  reveal = 0;
  target = 0;

  add(obj: THREE.Object3D, kind: RevealKind, delay: number, span = 0.45, from?: THREE.Vector3) {
    this.group.add(obj);
    const p: Part = { obj, kind, delay, span, pos: obj.position.clone(), scale: obj.scale.clone(), from };
    if (kind === 'draw') {
      const g = (obj as THREE.Mesh).geometry as THREE.BufferGeometry;
      p.drawCount = g.index ? g.index.count : g.attributes.position.count;
    }
    this.parts.push(p);
    return obj;
  }

  private end = 0;

  apply(v: number) {
    this.group.visible = v > 0.001;
    if (!this.group.visible) return;
    if (!this.end) this.end = Math.max(1, ...this.parts.map((p) => p.delay + p.span));
    const tv = v * this.end;
    for (const p of this.parts) {
      const k = ease.outExpo(clamp((tv - p.delay) / p.span));
      const o = p.obj;
      o.visible = k > 0.001;
      switch (p.kind) {
        case 'grow':
          o.scale.set(p.scale.x, Math.max(0.0001, p.scale.y * k), p.scale.z);
          o.position.set(p.pos.x, p.pos.y * k, p.pos.z);
          break;
        case 'pop':
          o.scale.copy(p.scale).multiplyScalar(Math.max(0.0001, k));
          break;
        case 'drop':
          o.position.set(p.pos.x, p.pos.y + (1 - k) * 0.9, p.pos.z);
          o.scale.copy(p.scale).multiplyScalar(Math.max(0.0001, 0.6 + 0.4 * k));
          break;
        case 'rise':
          o.position.set(p.pos.x, p.pos.y - (1 - k) * 0.5, p.pos.z);
          o.scale.copy(p.scale).multiplyScalar(Math.max(0.0001, k));
          break;
        case 'slide':
          if (p.from) o.position.lerpVectors(p.from, p.pos, k);
          break;
        case 'draw': {
          const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry;
          const n = p.drawCount ?? 0;
          const c = Math.floor((n * k) / 6) * 6;
          g.setDrawRange(0, Math.max(0, c));
          break;
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

/** Box whose origin is at its base (so 'grow' scales it up from the plate). */
const column = (w: number, h: number, d: number, m: THREE.Material, x = 0, z = 0, y0 = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y0, z);
  mesh.castShadow = true;
  return mesh;
};

const tube = (pts: THREE.Vector3[], r: number, m: THREE.Material, segs = 200) => {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 6, false), m);
};

const polyTube = (pts: THREE.Vector3[], r: number, m: THREE.Material) => {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  return new THREE.Mesh(new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, pts.length * 8, r, 5, false), m);
};

function shadowDisc(m: Mats, w: number, d: number, x = 0, z = 0) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.shadow);
  s.rotation.x = -Math.PI / 2;
  s.position.set(x, 0.003, z);
  s.renderOrder = 1;
  return s;
}

/* -------------------------------------------------------------------------- */
/* 01 — one serial frame carrying "K"                                          */
/* -------------------------------------------------------------------------- */
function g01(m: Mats) {
  const g = new Glyph();
  // 'K' = 0x4B → LSB first 1,1,0,1,0,0,1,0 ; framed by start(0) and stop(1)
  const bits = [0, 1, 1, 0, 1, 0, 0, 1, 0, 1];
  const pitch = 0.3;
  const w = 0.23;
  const hi = 0.92;
  const lo = 0.26;
  const x0 = -((bits.length - 1) * pitch) / 2 - 0.15;
  g.group.add(shadowDisc(m, 4.2, 1.6, -0.15, 0));
  const tops: THREE.Vector3[] = [];
  tops.push(new THREE.Vector3(x0 - pitch * 0.9, hi, 0.0));
  bits.forEach((b, i) => {
    const x = x0 + i * pitch;
    const h = b ? hi : lo;
    const col = column(w, h, 0.46, i === 0 || i === bits.length - 1 ? m.steel : m.metal, x, 0);
    g.add(col, 'grow', 0.04 + i * 0.045, 0.42);
    tops.push(new THREE.Vector3(x - pitch / 2, h, 0.0), new THREE.Vector3(x + pitch / 2, h, 0.0));
  });
  tops.push(new THREE.Vector3(x0 + bits.length * pitch + pitch * 0.4, hi, 0));
  // the waveform outline traced over the bars, slightly in front
  const wave: THREE.Vector3[] = [];
  for (let i = 0; i < tops.length; i++) {
    const p = tops[i];
    if (i > 0 && Math.abs(tops[i - 1].y - p.y) > 1e-3) wave.push(new THREE.Vector3(p.x, tops[i - 1].y, 0.26));
    wave.push(new THREE.Vector3(p.x, p.y, 0.26));
  }
  g.add(polyTube(wave, 0.011, m.light), 'draw', 0.38, 0.6);
  // the LED it ends in
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 32), m.accent);
  led.position.set(x0 + bits.length * pitch + 0.45, 0.035, 0);
  g.add(led, 'pop', 0.82, 0.25);
  const glow = new THREE.Sprite(m.glow);
  glow.scale.set(0.9, 0.9, 1);
  glow.position.set(led.position.x, 0.12, 0);
  g.add(glow, 'pop', 0.86, 0.3);
  return g;
}

/* -------------------------------------------------------------------------- */
/* 02 — one quantity as a continuous curve and its quantised twin             */
/* -------------------------------------------------------------------------- */
function g02(m: Mats) {
  const g = new Glyph();
  const f = (x: number) => 0.24 + 0.66 * (0.5 + 0.5 * Math.tanh(1.5 * x)) + 0.045 * Math.sin(2.6 * x + 0.4);
  const X0 = -1.65;
  const X1 = 1.65;
  g.group.add(shadowDisc(m, 4.0, 1.9));

  const wall = (fn: (x: number) => number, z: number, mat: THREE.Material) => {
    const shape = new THREE.Shape();
    shape.moveTo(X0, 0);
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const x = X0 + ((X1 - X0) * i) / n;
      shape.lineTo(x, fn(x));
    }
    shape.lineTo(X1, 0);
    shape.lineTo(X0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 1, steps: 1 });
    geo.translate(0, 0, -0.025);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = z;
    mesh.castShadow = true;
    return mesh;
  };

  // analog (front)
  const aw = wall(f, 0.32, m.metal);
  g.add(aw, 'grow', 0.0, 0.5);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = X0 + ((X1 - X0) * i) / 80;
    pts.push(new THREE.Vector3(x, f(x) + 0.012, 0.32));
  }
  g.add(tube(pts, 0.012, m.light, 240), 'draw', 0.3, 0.55);

  // digital twin (behind): sampled and held, 8 levels
  const levels = 8;
  const step = 0.22;
  const q = (x: number) => {
    const xs = X0 + Math.floor((x - X0) / step) * step + step / 2;
    return Math.round(f(Math.min(X1, xs)) * levels) / levels;
  };
  const dw = wall(q, -0.38, m.steel);
  g.add(dw, 'grow', 0.14, 0.5);
  const sp: THREE.Vector3[] = [];
  for (let x = X0; x < X1 - 1e-6; x += step) {
    const y = q(x + 1e-4) + 0.012;
    if (sp.length) sp.push(new THREE.Vector3(x, sp[sp.length - 1].y, -0.38));
    sp.push(new THREE.Vector3(x, y, -0.38), new THREE.Vector3(Math.min(X1, x + step), y, -0.38));
  }
  g.add(polyTube(sp, 0.011, m.accent), 'draw', 0.45, 0.5);
  return g;
}

/* -------------------------------------------------------------------------- */
/* 03 — an orientation frame beside a low-pass FIR impulse response           */
/* -------------------------------------------------------------------------- */
function g03(m: Mats) {
  const g = new Glyph();
  g.group.add(shadowDisc(m, 4.1, 1.8, 0.1, 0));
  const N = 23;
  const mid = (N - 1) / 2;
  const fc = 0.18;
  const taps: number[] = [];
  for (let n = 0; n < N; n++) {
    const k = n - mid;
    const sinc = k === 0 ? 1 : Math.sin(2 * Math.PI * fc * k) / (2 * Math.PI * fc * k);
    const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
    taps.push(sinc * win);
  }
  const base = 0.42;
  const pitch = 0.1;
  const x0 = 0.35 - mid * pitch;
  const stemGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 8);
  stemGeo.translate(0, 0.5, 0);
  const tipGeo = new THREE.SphereGeometry(0.04, 16, 12);
  taps.forEach((h, n) => {
    const x = x0 + n * pitch;
    const len = h * 0.95;
    const stem = new THREE.Mesh(stemGeo, m.steel);
    stem.position.set(x, base, 0);
    stem.scale.set(1, Math.abs(len) < 0.004 ? 0.004 : Math.abs(len), 1);
    if (len < 0) stem.rotation.z = Math.PI;
    const order = Math.abs(n - mid) / mid;
    g.add(stem, 'pop', 0.08 + order * 0.32, 0.4);
    const tip = new THREE.Mesh(tipGeo, n === mid ? m.accent : m.light);
    tip.position.set(x, base + len, 0);
    g.add(tip, 'pop', 0.16 + order * 0.32, 0.36);
  });
  const axis = box(N * pitch + 0.24, 0.008, 0.008, m.dim, x0 + mid * pitch, base, 0);
  g.add(axis, 'pop', 0.02, 0.4);
  // pedestal under the response
  g.add(column(0.03, base, 0.03, m.metal, x0 - 0.12, 0), 'grow', 0.0, 0.35);

  // three-axis orientation frame
  const gimbal = new THREE.Group();
  gimbal.position.set(-1.55, 0.72, -0.15);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.009, 8, 96);
  const r1 = new THREE.Mesh(ringGeo, m.light);
  const r2 = new THREE.Mesh(ringGeo, m.steel);
  r2.rotation.y = Math.PI / 2;
  const r3 = new THREE.Mesh(ringGeo, m.steel);
  r3.rotation.x = Math.PI / 2;
  gimbal.add(r1, r2, r3);
  gimbal.rotation.set(deg(18), deg(-28), deg(12));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), m.metal);
  gimbal.add(core);
  g.add(gimbal, 'pop', 0.0, 0.55);
  g.add(column(0.02, 0.3, 0.02, m.metal, -1.55, -0.15), 'grow', 0.0, 0.4);
  return g;
}

/* -------------------------------------------------------------------------- */
/* 04 — an RTL description resolving into implemented fabric                  */
/* -------------------------------------------------------------------------- */
function g04(m: Mats) {
  const g = new Glyph();
  g.group.add(shadowDisc(m, 4.0, 1.9));
  const S = 1.04;
  // the description: one monolithic block
  const solid = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), m.metal);
  solid.position.set(-0.95, S / 2 + 0.02, 0);
  solid.castShadow = true;
  g.add(solid, 'pop', 0.0, 0.4);
  // its fabric: 5×5×5 cells
  const n = 5;
  const pitch = S / n;
  const cell = pitch * 0.74;
  const geo = new THREE.BoxGeometry(cell, cell, cell);
  const cx = 0.95;
  const lit = (i: number, j: number, k: number) => (i * 7 + j * 3 + k * 5) % 9 === 0 || (k === n - 1 && i === j);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const on = lit(i, j, k);
        const c = new THREE.Mesh(geo, on ? m.light : m.metal);
        c.position.set(cx + (i - (n - 1) / 2) * pitch, 0.02 + pitch / 2 + j * pitch, (k - (n - 1) / 2) * pitch);
        c.castShadow = !on;
        // resolves from the side facing the description
        g.add(c, 'pop', 0.18 + (i / (n - 1)) * 0.42 + (j / (n - 1)) * 0.06, 0.32);
      }
  return g;
}

/* -------------------------------------------------------------------------- */
/* 05 — time-sliced tasks beneath a closed-loop step response                 */
/* -------------------------------------------------------------------------- */
function g05(m: Mats) {
  const g = new Glyph();
  g.group.add(shadowDisc(m, 4.0, 2.0));
  const X0 = -1.6;
  const X1 = 1.6;
  const lanes = [-0.42, 0.0, 0.42];
  // rails
  lanes.forEach((z, i) => g.add(box(X1 - X0 + 0.1, 0.008, 0.008, m.dim, 0, 0.012, z + 0.2), 'pop', 0.02 + i * 0.04, 0.4));
  const sched = [0, 1, 0, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1];
  const slot = (X1 - X0) / sched.length;
  sched.forEach((lane, k) => {
    const x = X0 + slot * (k + 0.5);
    const b = column(slot * 0.86, 0.11, 0.26, lane === 0 ? m.steel : m.metal, x, lanes[lane]);
    g.add(b, 'grow', 0.06 + k * 0.03, 0.3);
  });
  // step response of a damped closed loop, settling onto its setpoint
  const zeta = 0.32;
  const wn = 9.5;
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  const y0 = 0.42;
  const amp = 0.52;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 140; i++) {
    const u = i / 140;
    const x = X0 + (X1 - X0) * u;
    const t = Math.max(0, u - 0.08) * 1.0;
    const y = t <= 0 ? 0 : 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    pts.push(new THREE.Vector3(x, y0 + amp * y, -0.86));
  }
  g.add(column(0.02, y0, 0.02, m.metal, X0, -0.86), 'grow', 0.1, 0.3);
  g.add(tube(pts, 0.012, m.light, 280), 'draw', 0.36, 0.6);
  g.add(box(X1 - X0, 0.007, 0.007, m.accent, 0, y0 + amp, -0.86), 'pop', 0.3, 0.4);
  return g;
}

/* -------------------------------------------------------------------------- */
/* 06 — a board with probe points (no real layout implied)                    */
/* -------------------------------------------------------------------------- */
function g06(m: Mats) {
  const g = new Glyph();
  g.group.add(shadowDisc(m, 3.9, 2.7));
  const board = new THREE.Group();
  board.position.set(0, 0.16, 0);
  const pcb = box(3.0, 0.05, 2.0, m.matte);
  pcb.receiveShadow = true;
  board.add(pcb);
  // edge plating line
  board.add(box(3.0, 0.004, 0.004, m.dim, 0, 0.027, 1.0));
  g.add(board, 'rise', 0.0, 0.45);
  const B = 0.185;
  [
    [-1.38, -0.88],
    [1.38, -0.88],
    [-1.38, 0.88],
    [1.38, 0.88],
  ].forEach(([x, z], i) => g.add(column(0.05, 0.135, 0.05, m.steel, x, z), 'grow', 0.0 + i * 0.02, 0.3));
  // components
  g.add(box(0.66, 0.09, 0.66, m.metal, -0.45, B + 0.045, -0.1), 'drop', 0.22, 0.32);
  g.add(box(0.34, 0.07, 0.2, m.metal, 0.55, B + 0.035, -0.45), 'drop', 0.3, 0.3);
  g.add(box(0.34, 0.07, 0.2, m.metal, 0.55, B + 0.035, 0.25), 'drop', 0.34, 0.3);
  g.add(box(0.2, 0.12, 0.2, m.steel, 1.1, B + 0.06, -0.1), 'drop', 0.38, 0.3);
  for (let i = 0; i < 6; i++) g.add(box(0.07, 0.012, 0.16, m.steel, -0.9 + i * 0.14, B + 0.006, 0.8), 'pop', 0.42 + i * 0.02, 0.25);
  // probe points — where measurement happens
  const probes: [number, number][] = [
    [-0.45, 0.42],
    [0.95, 0.6],
    [0.15, -0.72],
  ];
  probes.forEach(([x, z], i) => {
    const pin = column(0.012, 0.78, 0.012, m.light, x, z, B);
    g.add(pin, 'grow', 0.56 + i * 0.06, 0.34);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), i === 0 ? m.accent : m.light);
    tip.position.set(x, B + 0.8, z);
    g.add(tip, 'pop', 0.66 + i * 0.06, 0.3);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 20), m.steel);
    pad.position.set(x, B + 0.005, z);
    g.add(pad, 'pop', 0.5, 0.3);
  });
  return g;
}

/* -------------------------------------------------------------------------- */
/* 07 — a design under test, enclosed by its verification environment          */
/* -------------------------------------------------------------------------- */
function frame(size: number, r: number, mat: THREE.Material) {
  const grp = new THREE.Group();
  const h = size / 2;
  const geo = new THREE.BoxGeometry(size + r * 2, r * 2, r * 2);
  const ax = [
    [0, h, h],
    [0, -h, h],
    [0, h, -h],
    [0, -h, -h],
  ];
  ax.forEach(([x, y, z]) => {
    const a = new THREE.Mesh(geo, mat);
    a.position.set(x, y, z);
    grp.add(a);
    const b = new THREE.Mesh(geo, mat);
    b.rotation.y = Math.PI / 2;
    b.position.set(z, y, x);
    grp.add(b);
    const c = new THREE.Mesh(geo, mat);
    c.rotation.z = Math.PI / 2;
    c.position.set(y, x, z);
    grp.add(c);
  });
  return grp;
}

function g07(m: Mats) {
  const g = new Glyph();
  g.group.add(shadowDisc(m, 3.0, 2.6));
  const c = new THREE.Vector3(0, 0.95, 0);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), m.steel);
  inner.position.copy(c);
  inner.rotation.set(deg(0), deg(20), deg(0));
  g.add(inner, 'pop', 0.0, 0.4);
  const mid = frame(0.86, 0.011, m.light);
  mid.position.copy(c);
  mid.rotation.set(deg(0), deg(20), deg(0));
  g.add(mid, 'pop', 0.18, 0.45);
  // probe points on the testbench corners
  const probeGeo = new THREE.SphereGeometry(0.028, 14, 10);
  const pg = new THREE.Group();
  pg.position.copy(c);
  pg.rotation.copy(mid.rotation);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(probeGeo, sx > 0 && sy > 0 && sz > 0 ? m.accent : m.light);
    p.position.set((sx * 0.86) / 2, (sy * 0.86) / 2, (sz * 0.86) / 2);
    pg.add(p);
  }
  g.add(pg, 'pop', 0.3, 0.4);
  const outer = frame(1.5, 0.007, m.steel);
  outer.position.copy(c);
  outer.rotation.set(deg(0), deg(45), deg(0));
  g.add(outer, 'pop', 0.36, 0.5);
  g.add(column(0.03, 0.2, 0.03, m.metal, 0, 0), 'grow', 0.0, 0.3);
  return g;
}

/* -------------------------------------------------------------------------- */
/* 08 — seven disciplines converging into one integrated stack                 */
/* -------------------------------------------------------------------------- */
const DISCIPLINES = ['System architecture', 'Verification', 'Communication', 'Linux', 'RTL', 'Firmware', 'PCB'];

function g08(m: Mats) {
  const g = new Glyph();
  g.group.add(shadowDisc(m, 3.0, 2.6));
  const n = DISCIPLINES.length;
  const gap = 0.2;
  const S = 1.5;
  for (let i = 0; i < n; i++) {
    const y = 0.22 + (n - 1 - i) * gap;
    const layer = new THREE.Group();
    layer.position.set(0, y, 0);
    layer.add(box(S, 0.045, S, i === 0 ? m.steel : m.metal));
    layer.add(box(S * 0.96, 0.012, 0.01, i === 0 ? m.accent : m.light, 0, 0, S / 2 + 0.004));
    const spread = (i - (n - 1) / 2) * 0.55;
    g.add(layer, 'slide', 0.05 + i * 0.06, 0.55, new THREE.Vector3(spread * 1.5, y + spread * 0.4, -0.6));
    g.anchors.push({ p: new THREE.Vector3(S / 2 + 0.14, y, S / 2), text: DISCIPLINES[i] });
  }
  // the integration axis
  const seam = column(0.02, 0.22 + (n - 1) * gap + 0.42, 0.02, m.light, 0, 0, 0.0);
  g.add(seam, 'grow', 0.5, 0.45);
  return g;
}

/* -------------------------------------------------------------------------- */
/* System                                                                      */
/* -------------------------------------------------------------------------- */
/** Per-glyph turn on its tread (deg). 02 reads only from its low end: the quantised twin must show. */
const GLYPH_YAW = [0, 80, 0, 0, 0, 0, 0, 0];

export class Glyphs implements StageSystem {
  readonly list: Glyph[];
  private m = materials();

  /** On paper the contact shadow only needs to seat the forms, not black them out. */
  setTheme(light: boolean) {
    this.m.shadow.opacity = light ? 0.32 : 0.7;
  }

  constructor(plates: Plates) {
    this.list = [g01, g02, g03, g04, g05, g06, g07, g08].map((fn) => fn(this.m));
    this.list.forEach((gl, i) => {
      // Glyphs face down the stair (tread +z), toward the climbing camera; a few turn
      // so their camera sees them from the side they were drawn for.
      gl.group.position.copy(GLYPH_AT);
      gl.group.rotation.y = THREE.MathUtils.degToRad(GLYPH_YAW[i]);
      gl.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        o.castShadow = !!mesh.isMesh && mesh.material !== this.m.shadow;
      });
      plates.anchors[i].add(gl.group);
      gl.apply(0);
    });
  }

  /** Label anchors on the flagship glyph (glyph-local). */
  flagshipAnchors() {
    const g = this.list[7];
    return g.anchors.map((a) => ({ text: a.text, local: a.p, obj: g.group }));
  }

  update(s: StageState) {
    for (let i = 0; i < this.list.length; i++) {
      const gl = this.list[i];
      const inFrom = s.from.kind === 'build' && s.from.sub === i;
      const inTo = s.to.kind === 'build' && s.to.sub === i;
      let target: number;
      if (s.reduced) target = (s.t >= 0.45 ? inTo : inFrom) ? 1 : 0;
      else if (inFrom && inTo) target = 1;
      else if (inTo) target = clamp((s.t - 0.4) / 0.6);
      else if (inFrom) target = 1 - clamp(s.t / 0.3);
      else target = 0;
      // assemble exactly on the timeline; dismantle softly
      gl.reveal = target >= gl.reveal || s.reduced ? target : damp(gl.reveal, target, 10, s.dt);
      gl.apply(gl.reveal);
    }
  }
}
