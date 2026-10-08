import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from './world';
import type { ChangeEvent, StageState, StageSystem } from './director';
import { clamp, damp, lerp, rand, smoothstep } from '../core/math';
import { env } from '../core/env';
import { Glow } from './glow';

/**
 * The hero: one eagle, wings spread, crossing the upper frame. Dark umber plumage lit from
 * behind by an orange light that sets every free feather edge glowing — the scalloped ranks
 * of coverts, the long fingered primaries, the nape, the rim of the head — with a soft bloom
 * around the hottest edges. Yellow hooked beak, yellow feet, black talons.
 *
 * Built procedurally: an articulated wing (shoulder → elbow → wrist) carrying ~200 individual
 * feathers in real ranks (primaries, secondaries, tertials, greater / median / lesser coverts,
 * alula, underwing coverts), a contour-feathered body, a heavy hooked beak, a fanned tail and
 * feathered thighs with open feet. The wing beat is joint motion, not a deforming card;
 * between beats the bird holds a raised-wing glide.
 *
 * Flight is driven by `u` (0 → 1) along a path authored in screen space (NDC x, y + distance),
 * so it frames the same on every viewport. Whenever the origin is on screen the eagle flies
 * itself in from the top-right corner and holds station at `HOLD`, wings beating the whole
 * time; the first swipe away hands over to the next section and the rest of the flight
 * (out, low-left) plays in lockstep with that move.
 */

/** [u, ndcX, ndcY, distance, roll] */
type Key = [number, number, number, number, number];

// Wide screens: in from the top-right corner, across the upper right, then dive out low-left.
// The bank stays inside the band where the near wing shows its face (not its edge) to the lens.
const PATH_WIDE: Key[] = [
  [0.0, 1.95, 1.75, 13, -0.1],
  [0.2, 1.05, 0.98, 12.6, -0.2],
  [0.45, 0.34, 0.22, 12.8, -0.36], // the hold: full wing beats stay inside the frame
  [0.62, 0.02, 0.1, 12, -0.42],
  [0.8, -0.34, -0.3, 11, -0.5],
  [1.0, -1.1, -2.1, 8.5, -0.4],
];
// Upright screens: the portrait holds the top, so the eagle crosses the band beneath it.
const PATH_TALL: Key[] = [
  [0.0, 2.1, 1.3, 13, -0.1],
  [0.2, 0.95, 0.42, 12.6, -0.2],
  [0.45, 0.36, -0.08, 12.8, -0.36],
  [0.62, -0.05, -0.22, 12, -0.42],
  [0.8, -0.5, -0.5, 11, -0.5],
  [1.0, -1.8, -1.4, 8.5, -0.4],
];

/** Share of the frame the bird takes (scaled by the lens, trimmed on narrow screens). */
const SIZE = 0.88;
/** Where the eagle holds station on the hero (flight progress along the path). */
const HOLD = 0.45;
/** Seconds the fly-in takes, from off-screen top-right onto the hold. */
const ENTER = 2.4;
/** First visit only: a beat before it appears, while the loader lifts. */
const FIRST_DELAY = 0.5;

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

type V3 = [number, number, number];

// Wing bones in model units (the bird is ~1.1 from beak to tail, ~2.6 across the wings).
const ARM = 0.24;
const FORE = 0.3;
const HAND = 0.16;
const PRIMARY = [0.4, 0.42, 0.45, 0.48, 0.51, 0.54, 0.56, 0.56, 0.52, 0.44];
/** Fan angle of each primary, from straight back toward the wingtip (rad). */
const primaryAngle = (f: number) => 0.26 + 1.12 * Math.pow(f, 1.08);

// Row types (aLayer) — the shader sets outline weight and barb density from them.
const FLIGHT = 0;
const COVERT = 1;
const SMALL = 2;
const PLUMAGE = 3;
const HORN = 4;

/** Constant per-vertex attributes the shader reads: a per-feather seed and its row type. */
function tag(g: THREE.BufferGeometry, seed: number, layer: number) {
  const n = g.attributes.position.count;
  g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(seed), 1));
  g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(n).fill(layer), 1));
  return g;
}

/** Scale uv into plumage cells: the shader draws one small rounded feather per cell. */
function cells(g: THREE.BufferGeometry, cu: number, cv: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cu, uv.getY(i) * cv);
  return g;
}

/** Average normals across coincident vertices (lathe seams and poles after reshaping). */
function weld(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)}|${p.getY(i).toFixed(4)}|${p.getZ(i).toFixed(4)}`;
    const ids = groups.get(k);
    if (ids) ids.push(i);
    else groups.set(k, [i]);
  }
  const v = new THREE.Vector3();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of ids) v.set(v.x + n.getX(i), v.y + n.getY(i), v.z + n.getZ(i));
    v.normalize();
    for (const i of ids) n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

interface FeatherOpts {
  /** Where the rounded tip begins along the shaft (lower = rounder, covert-like). */
  tip?: number;
  /** Outer vane narrower than the inner one (flight feathers). */
  asym?: number;
  /** Lengthwise curve: rise of the tip, × length. */
  bend?: number;
  /** Cross-section curvature: how far the vane edges drop below the shaft, × half-width. */
  camber?: number;
  /** Emargination: the outer vane steps in past mid-length — the eagle's "fingers". */
  notch?: number;
  /** Seen from below (underwing coverts): the vane curves the other way. */
  under?: boolean;
  layer?: number;
  seed?: number;
}

/**
 * One feather: root at the origin, vane along −Z, top facing +Y. Five vertices per row
 * (edge · vane · shaft · vane · edge) so the vane can curve and the shader knows where the
 * outline is — uv.x runs root → tip, uv.y edge (0) · shaft (0.5) · edge (1).
 */
function feather(len: number, w: number, o: FeatherOpts = {}) {
  const N = Math.round(clamp(len * 36, 6, 20));
  const K = 5;
  const tip = o.tip ?? 0.62;
  const asym = o.asym ?? 0;
  const bend = o.bend ?? 0.03;
  const camber = (o.camber ?? 0.16) * (o.under ? -1 : 1);
  const notch = o.notch ?? 0;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const rise = 0.3 + 0.7 * smoothstep(0, 0.16, s);
    const round = s > tip ? Math.sqrt(Math.max(0, 1 - ((s - tip) / (1 - tip)) ** 2)) : 1;
    const hw = 0.5 * w * rise * round;
    const outer = (1 - asym) * (1 - notch * smoothstep(0.36, 0.56, s));
    const inner = (1 + asym) * (1 - 0.4 * notch * smoothstep(0.5, 0.72, s));
    const y0 = bend * len * s * s;
    for (let j = 0; j < K; j++) {
      const v = (j / (K - 1)) * 2 - 1;
      const x = v * hw * (v > 0 ? outer : inner);
      pos.push(x, y0 - camber * Math.abs(x) * Math.abs(v), -s * len);
      uv.push(s, (v + 1) / 2);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < K - 1; j++) {
      const a = i * K + j;
      idx.push(a, a + 1, a + K, a + 1, a + K + 1, a + K);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return tag(g, o.seed ?? 0, o.layer ?? FLIGHT);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Move a part into its parent's space (rotation, then translation). */
function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, order: THREE.EulerOrder = 'YXZ') {
  _q.setFromEuler(_e.set(rx, ry, rz, order));
  return g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s));
}

interface Row {
  n: number;
  /** Span of the row along the bone. */
  x0: number;
  x1: number;
  len: number | ((f: number) => number);
  w: number;
  /** Height over the flight feathers: ranks nearer the leading edge lie on top. */
  y: number;
  /** Root offset toward the leading edge. */
  z: number;
  /** Fan angle from straight back toward the wingtip (rad). */
  fan?: (f: number) => number;
  tip?: number;
  bend?: number;
  camber?: number;
  layer?: number;
  under?: boolean;
}

/** A rank of feathers along a bone, each a touch different in length. */
function row(r: Row, seed: number) {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < r.n; i++) {
    const f = r.n > 1 ? i / (r.n - 1) : 0.5;
    const len = (typeof r.len === 'number' ? r.len : r.len(f)) * (0.94 + 0.12 * rand(seed + i * 7.31));
    const g = feather(len, r.w, { tip: r.tip, bend: r.bend, camber: r.camber, layer: r.layer ?? COVERT, under: r.under, seed: seed + i });
    // a hair of stagger within the rank so neighbours overlap cleanly instead of z-fighting
    const dy = (r.under ? 1 : -1) * 0.0007 * i;
    out.push(placed(g, lerp(r.x0, r.x1, f), r.y + dy, r.z, -(r.fan?.(f) ?? 0)));
  }
  return out;
}

/** The wing's leading edge along +X: a tapered, slightly flattened tube. */
function limb(len: number, r0: number, r1: number) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 14, 3);
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 0.7, 1);
  g.translate(len / 2, 0.006, 0.03);
  return tag(cells(g, 12, Math.max(2, Math.round(len * 45))), 0.7, PLUMAGE);
}

/**
 * A tube along a centreline in the YZ plane, elliptical in section — the beak, toes, talons.
 * `at(t)` → [y, z] on the centreline, `r(t)` → [rx, ry] half-widths of the section.
 */
function loft(at: (t: number) => [number, number], r: (t: number) => [number, number], rows: number, cols: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const [y, z] = at(t);
    const [ya, za] = at(Math.max(0, t - 0.01));
    const [yb, zb] = at(Math.min(1, t + 0.01));
    const l = Math.hypot(yb - ya, zb - za) || 1;
    // the section's "up": the tangent turned a quarter in the YZ plane
    const ny = (zb - za) / l;
    const nz = -(yb - ya) / l;
    const [rx, ry] = r(t);
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(c * rx, y + ny * s * ry, z + nz * s * ry);
      const ex = c / Math.max(rx, 1e-4);
      const ey = s / Math.max(ry, 1e-4);
      const k = Math.hypot(ex, ey) || 1;
      nor.push(ex / k, (ny * ey) / k, (nz * ey) / k);
      uv.push(j / cols, t);
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** An ellipsoid of plumage; poles on Z (head: feathers lie front → back) or Y (thighs: down). */
function ellipsoid(r: V3, at: V3, cell: [number, number], poles: 'z' | 'y' = 'z', rot: V3 = [0, 0, 0], seg: [number, number] = [32, 20]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  if (poles === 'z') g.rotateX(Math.PI / 2);
  g.scale(r[0], r[1], r[2]);
  if (rot[0] || rot[1] || rot[2]) g.applyQuaternion(_q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')));
  g.translate(at[0], at[1], at[2]);
  return cells(g, cell[0], cell[1]);
}

/* -------------------------------------------------------------------------- */
/* Material                                                                    */
/* -------------------------------------------------------------------------- */

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aLayer;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vSeed; varying float vLayer;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vLayer = aLayer;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

// kind 0: feather (outline + barbs + shaft) · 1: contour plumage (rows of small feathers)
//      2: horn (beak, cere, scaled toes, talons) · 3: eye
const FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uKind; uniform float uBands;
  uniform vec3 uRim; uniform float uRimK; uniform vec3 uFill;
  uniform vec3 uLb; uniform vec3 uLk;
  uniform float uPass; uniform float uPx; uniform float uEnc;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vSeed; varying float vLayer;

  float h1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

  // Contour plumage: staggered rows of small rounded feathers, uv in cells, free edges toward −v.
  // x: distance (in rows) from the free edge of the feather that is on top here · y: its random.
  vec2 scales(vec2 p) {
    float row = floor(p.y);
    float fy = p.y - row;
    float cx = p.x + mod(row, 2.0) * 0.5;
    float fx = fract(cx) - 0.5;
    float r1 = h1(floor(cx) * 7.13 + row * 3.71);
    // each feather hangs a little longer or shorter than its neighbours: no tiled scales
    float b = 0.55 - sqrt(max(0.0, 0.3025 - fx * fx)) - 0.16 * (r1 - 0.5);
    if (fy >= b) return vec2(fy - b, r1);
    float cx2 = cx + 0.5;
    float fx2 = fract(cx2) - 0.5;
    float r2 = h1(floor(cx2) * 7.13 + (row - 1.0) * 3.71);
    float b2 = 0.55 - sqrt(max(0.0, 0.3025 - fx2 * fx2)) - 0.16 * (r2 - 0.5);
    return vec2(fy + 1.0 - b2, r2);
  }

  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vV);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = 1.0 - ndv;
    float back = dot(N, uLb);
    float key = max(dot(N, uLk), 0.0);

    vec3 alb = uColor;
    float edge = 0.0;
    float ao = 1.0;
    float emitK = 1.0;
    vec3 spec = vec3(0.0);

    if (uKind < 0.5) {
      float s = vUv.x;
      float a = abs(vUv.y * 2.0 - 1.0);
      float d = (1.0 - a) / max(fwidth(a), 1e-4);          // pixels to the vane's edge
      float barbs = sin(s * (60.0 + 40.0 * h1(vSeed)) * (1.0 + vLayer) + a * 9.0);
      float wpx = (vLayer < 0.5 ? 1.35 : 1.0) * uPx;
      edge = exp(-pow(d / wpx, 1.5)) * smoothstep(0.1, 0.65, s);  // a fine bright line; the hidden root never glows
      edge *= mix(0.6, 1.0, smoothstep(0.55, 0.95, s)) * (0.82 + 0.18 * barbs);
      // the long feathers burn brightest along their whole edge; coverts only round their free tips
      edge *= vLayer > 1.5 ? 0.65 * smoothstep(0.4, 0.8, s) : vLayer > 0.5 ? 0.85 * smoothstep(0.35, 0.75, s) : 1.0;
      edge *= mix(1.0, 0.5, smoothstep(0.55, 0.97, fres));       // edge-on, the whole vane would be "edge"
      ao = mix(0.28, 1.0, smoothstep(0.02, 0.8, s));          // shadowed where the next rank covers it
      alb *= (0.78 + 0.44 * h1(vSeed + 3.1)) * (0.93 + 0.07 * barbs);
      alb += uColor * 1.2 * (1.0 - smoothstep(0.0, 0.045, a)) * smoothstep(0.1, 0.9, s) * step(vLayer, 0.5);
    } else if (uKind < 1.5) {
      vec2 sc = scales(vUv);
      float px = max(fwidth(vUv.y), 1e-4);
      edge = exp(-sc.x / (px * 1.2 * uPx + 0.02)) * 0.24 * (0.2 + 0.8 * fres);
      ao = mix(1.0, 0.72, smoothstep(0.0, 0.85, sc.x));
      alb *= 0.75 + 0.5 * sc.y;
    } else if (uKind < 2.5) {
      if (uBands > 0.0) alb *= 0.78 + 0.22 * smoothstep(0.08, 0.3, abs(fract(vUv.y * uBands) - 0.5));
      vec3 hk = normalize(uLk + V);
      vec3 hb = normalize(uLb + V);
      spec = vec3(1.0, 0.9, 0.78) * pow(max(dot(N, hk), 0.0), 40.0) * 0.35 + uRim * pow(max(dot(N, hb), 0.0), 18.0) * 1.2;
      emitK = 0.75;
    } else {
      float r = 1.0 - vUv.y;                                  // 0 at the pupil
      // amber iris, darker toward its rim, around a large pupil
      vec3 iris = uColor * mix(1.15, 0.5, smoothstep(0.1, 0.24, r));
      alb = mix(vec3(0.0), iris, smoothstep(0.075, 0.1, r)) * (1.0 - smoothstep(0.22, 0.25, r));
      spec = vec3(pow(max(dot(N, normalize(uLk + V)), 0.0), 160.0) * 2.5);
      emitK = 0.0;
    }

    // A dim warm fill from the front keeps the forms; the orange light behind the bird reaches only
    // what turns toward it — the contours (rim) and the free feather edges, glowing through the barbs.
    float lit = smoothstep(-0.1, 0.8, back);
    // a thin vane seen from its shadow side still glows at the edges: the light comes through it
    float through = uKind < 0.5 ? smoothstep(0.0, 0.7, -back) : 0.0;
    vec3 diffuse = alb * uFill * (0.2 + (uKind < 0.5 ? 0.6 : uKind < 1.5 ? 0.42 : 0.8) * key) * ao;
    vec3 bounce = alb * uRim * 0.5 * lit * ao;
    // (a flat vane seen edge-on is not a contour: feathers take only a little of the rim)
    float rim = pow(fres, 2.6) * smoothstep(-0.1, 0.6, back) * (uKind < 0.5 ? 0.35 : 1.0);
    float reach = 0.22 + 0.78 * lit + 0.5 * through;
    vec3 emis = uRim * uRimK * emitK * (rim * 1.6 + edge * reach * (0.7 + 0.6 * fres) * 1.1) + spec;
    // glow pass: only the hotter light blooms, so dense fine edges don't fog the wing
    vec3 col = uPass > 0.5 ? max(emis - 0.1, 0.0) * uEnc : 1.0 - exp(-(diffuse + bounce + emis) * 1.15);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

type MatName = 'feather' | 'plumage' | 'beak' | 'beakTip' | 'cere' | 'foot' | 'talon' | 'eye';

interface Wing {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  primaries: { m: THREE.Mesh; a: number; f: number }[];
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
  private legs: THREE.Group[] = [];
  private uniforms = {
    uRim: { value: new THREE.Color('#ff6418') },
    uRimK: { value: 1 },
    uFill: { value: new THREE.Color(1.6, 1.38, 1.2) },
    // view space, toward the lights: the orange light sits behind and above; a dim fill in front
    uLb: { value: new THREE.Vector3(0.36, 0.8, -0.48).normalize() },
    uLk: { value: new THREE.Vector3(-0.35, 0.3, 0.88).normalize() },
    uPass: { value: 0 },
    uPx: { value: 1 },
    uEnc: { value: 1 },
  };
  private m: Record<MatName, THREE.ShaderMaterial>;
  private glow: Glow | null;

  /** Debug captures: pin the flight at this progress while on the origin (?fly=0.45). */
  hold: number | null = null;
  /** Debug captures: pin the wing-beat amplitude (0 = the raised-wing glide, 1 = full stroke). */
  beat: number | null = null;
  /** Displayed flight progress. */
  u = 0;
  /** Gentle camera lean toward the bird (read by the app). */
  lean = 0;
  private from = 0;
  private prevU = 0;
  /** Fly-in clock on the origin (s); negative while waiting to start. */
  private enter = -FIRST_DELAY;
  private phase = 0;
  private amp = 1;
  private sky = 1;
  private k: number[] = [0, 0, 0, 0];
  private k0: number[] = [0, 0, 0, 0];
  private k1: number[] = [0, 0, 0, 0];
  private v0 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private vx = new THREE.Vector3();
  private vy = new THREE.Vector3();
  private up = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  /**
   * Art direction of the glide (radians unless noted). Live-tunable for captures:
   * `node scripts/eagle.mjs --fly 0.45 --tune '{"dih":0.5}'`.
   */
  pose = {
    /** Heading turned toward the viewer (× path tangent): a three-quarter view, not a profile. */
    fz: 0.85,
    /** How much of the path's climb / descent the body follows (flatter = a swoop, not a fall). */
    fy: 0.55,
    /** Bird's up tipped back (−) so a little of the belly shows. */
    upZ: -0.12,
    /** Wings raised in a V while gliding. */
    dih: 0.42,
    /** Shoulder sweep (− forward). */
    sweep: -0.08,
    /** Body attitude (− nose up): the talons-forward approach. */
    pitch: -0.4,
    /** Extra bank on top of the path's. */
    roll: 0,
    /** Tail pitch (− down) and fan spread (×). */
    tail: -0.3,
    fan: 1.3,
    /** Elbow forward (−) and wrist back (+): the curve of the leading edge. */
    elbow: -0.18,
    wrist: 0.3,
    /** Share of the frame. */
    size: SIZE,
  };

  constructor(private world: World) {
    const mat = (kind: number, color: string, bands = 0) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
        uniforms: { ...this.uniforms, uKind: { value: kind }, uColor: { value: new THREE.Color(color) }, uBands: { value: bands } },
      });
    this.m = {
      feather: mat(0, '#2a1b12'),
      plumage: mat(1, '#2b1c12'),
      beak: mat(2, '#cf8a26'),
      cere: mat(2, '#dd9a30'),
      foot: mat(2, '#d39332', 22),
      beakTip: mat(2, '#2a1e16'),
      talon: mat(2, '#17120f'),
      eye: mat(3, '#d88a20'),
    };

    this.glow = world.q.tier === 'low' ? null : new Glow(world.renderer);
    if (this.glow) this.uniforms.uEnc.value = this.glow.encode;
    world.post.push(() => this.drawGlow());

    const cam = world.rig.camera;
    if (!cam.parent) world.scene.add(cam);
    cam.add(this.root);
    this.root.add(this.bank);
    this.bank.add(this.bird);
    this.root.visible = false;
    // the origin is the eagle's sky from the very first frame (no monolith before the loop runs)
    world.plates.setVisibility(1 - this.sky);

    this.buildBody();
    this.buildHead();
    this.buildLegs();
    this.buildWing(1);
    this.buildWing(-1);
    this.buildTail();
  }

  /* — construction ————————————————————————————————————————————————————— */

  private mesh(g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) {
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  private buildBody() {
    // torso and neck, vent (−z) → throat (+z): a deep chest, the neck rising into the head
    const prof: [number, number][] = [
      [0.0, -0.34],
      [0.045, -0.318],
      [0.08, -0.26],
      [0.104, -0.16],
      [0.118, -0.05],
      [0.122, 0.04],
      [0.114, 0.13],
      [0.096, 0.2],
      [0.08, 0.26],
      [0.071, 0.31],
      [0.0, 0.37],
    ];
    const torso = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 36);
    torso.rotateX(Math.PI / 2);
    const p = torso.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      let y = p.getY(i);
      y *= y < 0 ? 1.14 : 0.9;
      y += Math.max(0, z - 0.1) ** 2 * 1.5;
      p.setXYZ(i, p.getX(i) * 0.95, y, z);
    }
    torso.computeVertexNormals();
    weld(torso);
    this.mesh(tag(cells(torso, 36, 32), 0.3, PLUMAGE), this.m.plumage, this.bird);

    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      // scapulars: long feathers over the shoulders, covering the wing roots
      for (let k = 0; k < 4; k++)
        parts.push(
          placed(
            feather(0.27 - 0.025 * k, 0.09, { tip: 0.55, bend: -0.03, camber: 0.18, layer: COVERT, seed: 500 + k + 10 * sx }),
            sx * (0.04 + 0.014 * k),
            0.112 - 0.005 * k,
            0.16 - 0.06 * k,
            -sx * (0.12 + 0.07 * k),
            0,
            -sx * 0.3,
          ),
        );
      // flanks: soft feathers down the side, under the wing root
      for (let k = 0; k < 3; k++)
        parts.push(
          placed(
            feather(0.22, 0.09, { tip: 0.5, bend: -0.02, camber: 0.2, layer: COVERT, seed: 540 + k + 10 * sx }),
            sx * 0.112,
            0.01 - 0.03 * k,
            0.1 - 0.07 * k,
            -sx * 0.06,
            0,
            -sx * 1.3,
          ),
        );
    }
    // breast to belly: loose contour feathers that break the silhouette
    for (let k = 0; k < 7; k++) {
      const f = k / 6;
      parts.push(
        placed(
          feather(0.13, 0.07, { tip: 0.42, bend: -0.04, camber: 0.22, layer: COVERT, seed: 580 + k }),
          lerp(-0.06, 0.06, f),
          -0.118 - 0.01 * Math.sin(f * Math.PI),
          0.08 - 0.02 * Math.abs(f - 0.5),
          0,
          0,
          Math.PI + lerp(-0.6, 0.6, f),
        ),
      );
    }
    this.mesh(mergeGeometries(parts), this.m.feather, this.bird);
  }

  private buildHead() {
    this.head.position.set(0, 0.11, 0.35);
    this.bird.add(this.head);

    // skull: long, flat-crowned and broad behind the eyes, narrowing down into the face
    const skull = ellipsoid([0.064, 0.056, 0.114], [0, 0, 0.006], [24, 14]);
    {
      const p = skull.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        const front = smoothstep(0.0, 0.115, z);
        let y = p.getY(i);
        if (y > 0) y *= 0.8 - 0.12 * front; // flat crown sloping to the brow
        p.setXYZ(i, p.getX(i) * (1 - 0.28 * front), y - 0.008 * front, z);
      }
      skull.computeVertexNormals();
      weld(skull);
    }
    const brow = (sx: number) =>
      // the heavy supraorbital ridge that overhangs the eye: the eagle's frown
      tag(ellipsoid([0.024, 0.013, 0.056], [0.04 * sx, 0.019, 0.062], [6, 4], 'z', [0.28, -0.3 * sx, 0.16 * sx]), 0.2, PLUMAGE);
    this.mesh(
      mergeGeometries([
        tag(skull, 0.2, PLUMAGE),
        tag(ellipsoid([0.056, 0.048, 0.088], [0, -0.026, 0.022], [20, 10]), 0.25, PLUMAGE),
        brow(1),
        brow(-1),
      ]),
      this.m.plumage,
      this.head,
    );

    // Hooked beak, deep at the base and flattened at the sides: the culmen runs nearly level, then
    // rolls over into a short sharp hook that overhangs the lower mandible. Horn-dark at the tip.
    const L = 0.088;
    const cl: [number, number][] = [];
    {
      const n = 48;
      let y = 0.006;
      let z = 0.081;
      for (let i = 0; i <= n; i++) {
        cl.push([y, z]);
        const a = 0.1 + 1.65 * Math.pow(i / n, 2.4); // angle below level
        y -= (Math.sin(a) * L) / n;
        z += (Math.cos(a) * L) / n;
      }
    }
    const along = (t: number): [number, number] => {
      const f = clamp(t) * (cl.length - 1);
      const i = Math.min(cl.length - 2, Math.floor(f));
      const k = f - i;
      return [lerp(cl[i][0], cl[i + 1][0], k), lerp(cl[i][1], cl[i + 1][1], k)];
    };
    const girth = (t: number): [number, number] => [0.019 * Math.pow(1 - t, 0.75) + 0.0012, 0.027 * (1 - 0.8 * Math.pow(t, 0.9)) + 0.0012];
    const part = (t0: number, t1: number, rows: number) =>
      loft(
        (s) => along(lerp(t0, t1, s)),
        (s) => girth(lerp(t0, t1, s)),
        rows,
        18,
      );
    const TIP = 0.7;
    const lower = loft(
      (t) => [-0.015 - 0.011 * t, 0.079 + 0.05 * t],
      (t) => [0.0135 * (1 - 0.6 * t) + 0.0012, 0.0058 * (1 - 0.4 * t) + 0.001],
      12,
      12,
    );
    this.mesh(mergeGeometries([tag(part(0, TIP, 28), 0.1, HORN), tag(lower, 0.12, HORN)]), this.m.beak, this.head);
    this.mesh(tag(part(TIP, 1, 14), 0.11, HORN), this.m.beakTip, this.head);

    // cere over the beak's root with its nostril, and the yellow gape running back under the eye
    const flesh: THREE.BufferGeometry[] = [tag(ellipsoid([0.022, 0.017, 0.024], [0, 0.014, 0.087], [1, 1], 'z', [0, 0, 0], [16, 12]), 0.1, HORN)];
    const nostrils: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      flesh.push(tag(ellipsoid([0.0055, 0.006, 0.026], [0.027 * sx, -0.016, 0.066], [1, 1], 'z', [0.1, -0.6 * sx, 0], [12, 8]), 0.1, HORN));
      nostrils.push(tag(ellipsoid([0.0028, 0.004, 0.0065], [0.0195 * sx, 0.015, 0.096], [1, 1], 'z', [0, -0.3 * sx, 0], [10, 8]), 0.1, HORN));
    }
    this.mesh(mergeGeometries(flesh), this.m.cere, this.head);
    this.mesh(mergeGeometries(nostrils), this.m.beakTip, this.head);

    // eyes set deep under the brow, looking out and forward
    for (const sx of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.0135, 20, 16);
      g.rotateZ((-sx * Math.PI) / 2);
      g.rotateY(-sx * 0.42);
      g.translate(0.044 * sx, 0.009, 0.064);
      this.mesh(tag(g, 0, HORN), this.m.eye, this.head);
    }

    // the nape: hackles laid back over the crown and down the sides of the neck
    const nape: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 13; i++) {
      const ang = lerp(-1.9, 1.9, i / 12);
      nape.push(
        placed(
          feather(0.075 + 0.012 * Math.cos(ang * 0.5), 0.046, { tip: 0.42, bend: -0.08, camber: 0.22, layer: COVERT, seed: 700 + i }),
          Math.sin(ang) * 0.05,
          Math.cos(ang) * 0.044 - 0.006,
          -0.06,
          0,
          -0.22,
          -ang,
          'ZXY',
        ),
      );
    }
    this.mesh(mergeGeometries(nape), this.m.feather, this.head);
  }

  private buildLegs() {
    // [yaw, pitch, toe length, claw radius]: three toes forward, the hallux back with the biggest hook
    const digits: [number, number, number, number][] = [
      [-0.55, 0.7, 0.07, 0.031],
      [0, 0.6, 0.08, 0.034],
      [0.55, 0.7, 0.066, 0.03],
      [Math.PI, 0.5, 0.055, 0.039],
    ];
    const T = 0.09; // tarsus
    const BOOT = 0.062; // feathered down to here
    for (const sx of [-1, 1]) {
      // feathered thigh, with a fringe hanging off its back edge
      this.mesh(tag(ellipsoid([0.046, 0.074, 0.06], [0.052 * sx, -0.112, -0.03], [12, 7], 'y', [-0.35, 0, 0.12 * sx]), 0.5, PLUMAGE), this.m.plumage, this.bird);
      const fringe: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 5; k++) {
        const f = k / 4;
        fringe.push(
          placed(
            feather(0.08 + 0.025 * Math.sin(f * Math.PI), 0.05, { tip: 0.4, bend: -0.03, camber: 0.22, layer: COVERT, seed: 800 + k + 10 * sx }),
            sx * (0.052 + lerp(-0.026, 0.026, f)),
            -0.15,
            lerp(-0.075, -0.005, f),
            0,
            -1.0,
          ),
        );
      }
      this.mesh(mergeGeometries(fringe), this.m.feather, this.bird);

      const leg = new THREE.Group();
      leg.position.set(0.052 * sx, -0.158, -0.012);
      this.bird.add(leg);

      // the tarsus is feathered almost to the toes ("booted"), its hem a ring of small feathers
      this.mesh(tag(ellipsoid([0.021, 0.046, 0.024], [0, -0.03, 0.001], [10, 7], 'y'), 0.55, PLUMAGE), this.m.plumage, leg);
      const hem: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        hem.push(
          placed(
            feather(0.036, 0.028, { tip: 0.4, bend: -0.02, camber: 0.22, layer: SMALL, seed: 860 + k + 10 * sx }),
            -Math.sin(a) * 0.017,
            -0.05,
            -Math.cos(a) * 0.019,
            a,
            -Math.PI / 2 + 0.35,
          ),
        );
      }
      this.mesh(mergeGeometries(hem), this.m.feather, leg);

      // bare scaled feet: thick padded toes, long black hooked talons
      const toes: THREE.BufferGeometry[] = [loft((t) => [-BOOT - (T - BOOT) * t, 0.004 * t], () => [0.0135, 0.0145], 4, 12)];
      const claws: THREE.BufferGeometry[] = [];
      for (const [yaw, pitch, Lt, R] of digits) {
        const toe = loft(
          (t) => [-0.12 * Lt * t * t, Lt * t],
          (t) => {
            const pad = 1 + 0.14 * Math.pow(Math.abs(Math.sin(t * Math.PI * 2.5)), 2); // one bulge per phalanx
            const r = 0.0105 * (1 - 0.32 * t) * pad;
            return [r, r * 0.92];
          },
          16,
          12,
        );
        const sweep = 2.0;
        const claw = loft(
          (t) => [-(R - R * Math.cos(sweep * t)), R * Math.sin(sweep * t)],
          (t) => {
            const k = Math.pow(1 - t, 0.85);
            return [0.0072 * k + 0.0004, 0.0088 * k + 0.0004];
          },
          16,
          10,
        );
        claw.rotateX(Math.atan(0.24)); // continue the toe's own curve
        claw.translate(0, -0.12 * Lt, Lt - 0.003);
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).setPosition(0, -T, 0.004);
        toes.push(toe.applyMatrix4(m));
        claws.push(claw.applyMatrix4(m));
      }
      this.mesh(mergeGeometries(toes.map((g) => tag(g, 0, HORN))), this.m.foot, leg);
      this.mesh(mergeGeometries(claws.map((g) => tag(g, 0, HORN))), this.m.talon, leg);
      this.legs.push(leg);
    }
  }

  private buildWing(side: 1 | -1) {
    const mount = new THREE.Group();
    mount.position.set(0.066 * side, 0.07, 0.1);
    if (side < 0) mount.scale.x = -1;
    this.bird.add(mount);
    const shoulder = new THREE.Group();
    const elbow = new THREE.Group();
    const wrist = new THREE.Group();
    for (const g of [shoulder, elbow, wrist]) g.rotation.order = 'YZX'; // twist, then raise, then sweep
    mount.add(shoulder);
    elbow.position.x = ARM;
    shoulder.add(elbow);
    wrist.position.x = FORE;
    elbow.add(wrist);
    const S = side > 0 ? 1000 : 2000;
    const F = this.m.feather;
    const P = this.m.plumage;

    // arm: tertials, three ranks of coverts over them, two beneath
    this.mesh(
      mergeGeometries([
        ...row({ n: 6, x0: 0.012, x1: ARM - 0.01, len: (f) => lerp(0.4, 0.42, f), w: 0.1, y: -0.002, z: 0, fan: (f) => lerp(-0.26, -0.05, f), tip: 0.7, bend: 0.03, layer: FLIGHT }, S),
        ...row({ n: 7, x0: 0.0, x1: ARM, len: 0.21, w: 0.085, y: 0.012, z: 0.006, fan: (f) => lerp(-0.22, -0.04, f), tip: 0.5 }, S + 20),
        ...row({ n: 8, x0: 0.0, x1: ARM, len: 0.125, w: 0.066, y: 0.022, z: 0.015, fan: (f) => lerp(-0.16, -0.03, f), tip: 0.45 }, S + 40),
        ...row({ n: 9, x0: 0.0, x1: ARM, len: 0.075, w: 0.05, y: 0.03, z: 0.026, tip: 0.4, layer: SMALL }, S + 60),
        ...row({ n: 9, x0: 0.014, x1: ARM, len: 0.058, w: 0.044, y: 0.036, z: 0.04, tip: 0.4, layer: SMALL }, S + 80),
        ...row({ n: 6, x0: 0.01, x1: ARM, len: 0.22, w: 0.085, y: -0.014, z: 0.006, fan: (f) => lerp(-0.2, -0.04, f), tip: 0.5, under: true }, S + 100),
        ...row({ n: 7, x0: 0.0, x1: ARM, len: 0.12, w: 0.066, y: -0.022, z: 0.018, tip: 0.45, layer: SMALL, under: true }, S + 120),
        ...row({ n: 9, x0: 0.0, x1: ARM, len: 0.07, w: 0.05, y: -0.029, z: 0.04, tip: 0.4, layer: SMALL, under: true }, S + 130),
      ]),
      F,
      shoulder,
    );
    this.mesh(limb(ARM + 0.01, 0.034, 0.027), P, shoulder);

    // forearm: secondaries and their coverts
    const sec = (f: number) => lerp(-0.03, 0.2, f);
    this.mesh(
      mergeGeometries([
        ...row({ n: 12, x0: 0.012, x1: FORE - 0.008, len: (f) => lerp(0.42, 0.38, f), w: 0.092, y: -0.002, z: 0, fan: sec, tip: 0.72, bend: 0.035, layer: FLIGHT }, S + 140),
        ...row({ n: 13, x0: 0.004, x1: FORE, len: (f) => lerp(0.21, 0.19, f), w: 0.082, y: 0.012, z: 0.006, fan: (f) => sec(f) * 0.9, tip: 0.5 }, S + 160),
        ...row({ n: 14, x0: 0.0, x1: FORE, len: 0.12, w: 0.064, y: 0.022, z: 0.015, fan: (f) => sec(f) * 0.6, tip: 0.45 }, S + 180),
        ...row({ n: 15, x0: 0.0, x1: FORE, len: 0.072, w: 0.05, y: 0.03, z: 0.026, tip: 0.4, layer: SMALL }, S + 200),
        ...row({ n: 15, x0: 0.01, x1: FORE, len: 0.056, w: 0.044, y: 0.036, z: 0.04, tip: 0.4, layer: SMALL }, S + 220),
        ...row({ n: 12, x0: 0.01, x1: FORE, len: 0.22, w: 0.082, y: -0.014, z: 0.006, fan: (f) => sec(f) * 0.9, tip: 0.5, under: true }, S + 240),
        ...row({ n: 14, x0: 0.0, x1: FORE, len: 0.12, w: 0.064, y: -0.022, z: 0.018, tip: 0.45, layer: SMALL, under: true }, S + 260),
        ...row({ n: 15, x0: 0.0, x1: FORE, len: 0.068, w: 0.048, y: -0.027, z: 0.038, tip: 0.4, layer: SMALL, under: true }, S + 270),
      ]),
      F,
      elbow,
    );
    this.mesh(limb(FORE + 0.01, 0.027, 0.02), P, elbow);

    // hand: primary coverts and the alula; the primaries are separate so the fingers can spread
    this.mesh(
      mergeGeometries([
        ...row({ n: 10, x0: 0.01, x1: HAND, len: (f) => lerp(0.23, 0.17, f), w: 0.078, y: 0.011, z: 0.004, fan: (f) => primaryAngle(f) * 0.62, tip: 0.55 }, S + 280),
        ...row({ n: 9, x0: 0.0, x1: HAND, len: 0.11, w: 0.06, y: 0.021, z: 0.014, fan: (f) => primaryAngle(f) * 0.45, tip: 0.45 }, S + 300),
        ...row({ n: 8, x0: 0.0, x1: HAND, len: 0.055, w: 0.042, y: 0.03, z: 0.03, tip: 0.4, layer: SMALL }, S + 320),
        ...row({ n: 9, x0: 0.01, x1: HAND, len: 0.2, w: 0.075, y: -0.013, z: 0.006, fan: (f) => primaryAngle(f) * 0.6, tip: 0.5, under: true }, S + 340),
        ...row({ n: 8, x0: 0.0, x1: HAND, len: 0.06, w: 0.044, y: -0.022, z: 0.032, tip: 0.4, layer: SMALL, under: true }, S + 350),
        ...row({ n: 4, x0: 0.0, x1: 0.04, len: (f) => lerp(0.11, 0.16, f), w: 0.042, y: 0.036, z: 0.04, fan: () => 1.32, tip: 0.6 }, S + 360),
      ]),
      F,
      wrist,
    );
    this.mesh(limb(HAND + 0.01, 0.02, 0.011), P, wrist);

    const primaries: Wing['primaries'] = [];
    for (let i = 0; i < 10; i++) {
      const f = i / 9;
      const g = feather(PRIMARY[i], lerp(0.096, 0.072, f), { tip: 0.72, notch: i >= 4 ? 0.5 : 0, asym: 0.28, bend: 0.06, camber: 0.14, layer: FLIGHT, seed: S + 400 + i });
      const m = this.mesh(g, F, wrist);
      m.rotation.order = 'YXZ'; // lift the tip in the feather's own frame, then fan
      m.position.set(0.012 + (HAND - 0.006) * Math.pow(f, 0.85), -0.0025 * i, -0.004);
      const a = primaryAngle(f);
      m.rotation.y = -a;
      primaries.push({ m, a, f });
    }
    this.wings.push({ shoulder, elbow, wrist, primaries, side });
  }

  private buildTail() {
    this.tail.position.set(0, 0.005, -0.29);
    this.bird.add(this.tail);
    const F = this.m.feather;
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      const c = Math.abs(f - 0.5) * 2; // 0 centre … 1 outer
      const m = this.mesh(feather(0.37 - 0.03 * c, 0.1, { tip: 0.62, bend: -0.025, camber: 0.1, layer: FLIGHT, seed: 3000 + i }), F, this.tail);
      const a = lerp(-0.42, 0.42, f);
      m.position.set(lerp(-0.045, 0.045, f), -0.004 * c, 0); // the centre pair on top
      m.rotation.y = -a;
      this.tailFeathers.push({ m, a });
    }
    const cov: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const f = i / 7;
      cov.push(placed(feather(0.19, 0.085, { tip: 0.5, bend: -0.01, layer: COVERT, seed: 3100 + i }), lerp(-0.04, 0.04, f), 0.016, 0.04, -lerp(-0.28, 0.28, f)));
    }
    for (let i = 0; i < 6; i++) {
      const f = i / 5;
      cov.push(placed(feather(0.15, 0.08, { tip: 0.5, layer: COVERT, under: true, seed: 3200 + i }), lerp(-0.035, 0.035, f), -0.016, 0.03, -lerp(-0.24, 0.24, f)));
    }
    this.mesh(mergeGeometries(cov), F, this.tail);
  }

  /* — rendering ————————————————————————————————————————————————————————— */

  /** Compile the eagle's shaders (screen + glow variants) before the first flight. */
  warm() {
    const cam = this.world.rig.camera;
    this.world.renderer.compile(this.root, cam);
    this.glow?.warm(this.root, cam);
  }

  private drawGlow() {
    if (!this.glow || !this.root.visible) return;
    const u = this.uniforms;
    const px = u.uPx.value;
    this.glow.render(this.root, this.world.rig.camera, (on) => {
      u.uPass.value = on ? 1 : 0;
      u.uPx.value = on ? 1 : px;
    });
  }

  /* — theme ———————————————————————————————————————————————————————————— */

  /** Light theme: the bird reads as ink on paper — edges painted orange, no added light. */
  setTheme(light: boolean) {
    this.uniforms.uRimK.value = light ? 0.8 : 1;
    if (this.glow) this.glow.strength = light ? 0 : 1;
  }

  /* — stage ———————————————————————————————————————————————————————————— */

  onChange(e: ChangeEvent) {
    if (e.from.kind === 'origin' && e.to.kind !== 'origin') this.from = this.u;
    if (e.to.kind === 'origin' && e.from.kind !== 'origin') {
      // back on the hero: it flies in again
      this.u = this.prevU = 0;
      this.enter = 0;
      this.amp = 1;
    }
  }

  update(s: StageState) {
    const a = s.from.kind === 'origin' ? 1 : 0;
    const b = s.to.kind === 'origin' ? 1 : 0;

    // The origin is the eagle's sky: the plates are never seen there — not even for a moment as the
    // standing monolith they form for it. Leaving, they stay hidden until they have mostly turned
    // into the next composition; arriving, they are gone before they start to gather into it.
    let target: number;
    if (s.t >= 1 || a === b) target = s.t >= 1 ? b : a;
    else target = a * (1 - smoothstep(0.5, 0.85, s.t)) + b * smoothstep(0, 0.22, s.t);
    this.sky = s.reduced ? target : damp(this.sky, target, 6, s.dt);
    if (s.t >= 1 && b === 1) this.sky = 1;
    this.world.plates.setVisibility(a || b ? 1 - clamp(this.sky) : 1);

    // Flight progress. With the origin on screen the eagle flies itself in and holds station;
    // leaving it, the rest of the flight is carried out by the transition.
    const still = s.reduced || env.reducedMotion;
    if (still) {
      // no travel: while the origin is on screen it is simply there (reduced moves cut at 0.45)
      const shown = s.t >= 1 ? b : s.t < 0.45 ? a : b;
      this.u = shown ? (this.hold ?? HOLD) : 0;
    } else if (b === 1) {
      // arriving from another section it waits until the camera is nearly home
      if (a === 1 || s.t >= 0.35) this.enter += s.dt;
      const k = clamp(this.enter / ENTER);
      // in fast, settling onto the hold — then a slow drift along the line so it never looks pinned
      const drift = 0.012 * Math.sin(s.time * 0.33) * smoothstep(0.8, 1, k);
      this.u = this.hold ?? (HOLD * (1 - Math.pow(1 - k, 2.4)) + drift);
    } else if (a === 1) {
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
    this.fly(s.dt, s.time, speed, still);
  }

  /* — flight ——————————————————————————————————————————————————————————— */

  private toCam(k: number[], out: THREE.Vector3) {
    const cam = this.world.rig.camera;
    out.set(k[0], k[1], 0.5).applyMatrix4(cam.projectionMatrixInverse);
    return out.multiplyScalar(-k[2] / out.z);
  }

  private fly(dt: number, time: number, speed: number, still: boolean) {
    const cam = this.world.rig.camera;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const path = window.innerHeight > window.innerWidth * 1.08 ? PATH_TALL : PATH_WIDE;
    const u = this.u;

    // position + heading along the path (camera space)
    const k = sample(path, u, this.k);
    this.toCam(k, this.root.position);
    const e = 0.015;
    this.toCam(sample(path, Math.max(0, u - e), this.k0), this.v0);
    this.toCam(sample(path, Math.min(1, u + e), this.k1), this.v1);
    const F = this.v1.sub(this.v0).normalize();
    // Not a profile: the bird turns a little toward the viewer (a three-quarter view) and holds its
    // body flatter than the path, so the descent reads as a swoop rather than a fall.
    const T = this.pose;
    F.y *= T.fy;
    F.z += T.fz;
    F.normalize();
    this.up.set(0, 1, T.upZ).normalize();
    this.vx.crossVectors(this.up, F).normalize();
    this.vy.crossVectors(F, this.vx);
    this.m4.makeBasis(this.vx, this.vy, F);
    this.root.quaternion.setFromRotationMatrix(this.m4);

    // size: a constant share of the frame, trimmed on narrow screens
    const fov = THREE.MathUtils.degToRad(cam.fov);
    this.root.scale.setScalar(T.size * 12 * Math.tan(fov / 2) * Math.min(1, aspect / 0.95));

    // Stroke: the wings never rest — hard beats flying in and away, a steady working beat while it
    // holds station, breathing a little so it never looks mechanical. (Reduced motion: held still
    // in the raised-wing glide.) The exit ends in a tuck.
    const fold = smoothstep(0.84, 1.0, u) * 0.75;
    const travel = Math.min(1, speed * 2.5);
    this.amp = still ? 0 : (this.beat ?? damp(this.amp, 0.68 + 0.32 * travel, 3, dt));
    const A = this.amp * (1 - fold) * (still ? 1 : 0.92 + 0.08 * Math.sin(time * 0.53));
    const dihedral = lerp(T.dih, 0.1, this.amp);
    if (!still) this.phase += Math.PI * 2 * lerp(0.55, 1.0, this.amp) * dt;
    const sn = Math.sin(this.phase);
    const cs = Math.cos(this.phase);
    const rising = Math.max(0, cs);
    const falling = Math.max(0, -cs);
    const flutter = still ? 0 : 1 - A;
    const roll = k[3] + T.roll + (still ? 0 : 0.045 * Math.sin(time * 0.7));

    for (const w of this.wings) {
      const inner = Math.max(0, -roll * w.side); // the wing on the inside of a turn rides a touch higher
      // shoulder: pronate + sweep forward on the downstroke; the elbow and wrist flex on the way up
      w.shoulder.rotation.set(0.03 - 0.12 * A * cs, T.sweep + 0.12 * A * cs + fold * 0.9, dihedral + inner * 0.1 + 0.62 * A * sn);
      w.elbow.rotation.set(-0.08 * A * Math.cos(this.phase - 0.4), T.elbow - 0.32 * A * rising - fold * 1.6, 0.03 + 0.18 * A * Math.sin(this.phase - 0.45));
      w.wrist.rotation.set(0.04 - 0.18 * A * Math.cos(this.phase - 0.8), T.wrist + 0.48 * A * rising + fold * 1.45, 0.1 * (1 - A) + 0.34 * A * Math.sin(this.phase - 0.9));
      const spread = 1 - 0.32 * A * rising - 0.6 * fold;
      for (const p of w.primaries) {
        p.m.rotation.y = -p.a * spread;
        // the fingers bend up under load, and flutter a little in the glide
        p.m.rotation.x = (0.06 + 0.12 * A * falling + 0.08 * (1 - A)) * p.f * p.f;
        p.m.rotation.z = 0.03 * Math.sin(time * 6.3 + p.f * 9 + w.side) * flutter;
      }
    }

    // the body rides the stroke; the head holds level against it
    this.bank.rotation.z = roll;
    this.bird.position.y = -0.032 * A * sn;
    this.bird.rotation.x = T.pitch + 0.04 * A * cs;
    this.head.rotation.set(-this.bird.rotation.x * 0.8 - 0.04, 0, -roll * 0.5);
    this.tail.rotation.x = T.tail + 0.05 * A * Math.sin(this.phase - 0.8) + fold * 0.3;
    const fan = T.fan + 0.3 * Math.min(1, Math.abs(roll) * 1.2) - 0.5 * fold;
    for (const t of this.tailFeathers) t.m.rotation.y = -t.a * fan;
    for (const l of this.legs) l.rotation.x = -0.5 + fold * 1.4 + 0.05 * A * Math.sin(this.phase + 1.2);

    this.uniforms.uPx.value = this.world.renderer.getPixelRatio();
    this.lean = 0.016 * clamp(k[0], -1, 1);
  }
}
