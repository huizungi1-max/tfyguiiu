import * as THREE from 'three';
import { PLATE, pose, type Formation, type PlatePose, type StaggerOrder, type StripMode } from './plates';
import { shot, type MoveSpec, type Shot } from './rig';
import { currentTermIndex } from '../content/content';

/**
 * ART DIRECTION
 * ---------------------------------------------------------------------------
 * The world is nine plates. Each step of the journey is a composition:
 *   where the plates are (formation), where the camera is (shot), what is lit.
 *
 *   origin      — a standing monolith; the name behind it
 *   position    — the monolith lies down and opens into a system stack
 *   roadmap     — the stack unfolds into a floating stair: one tread per term
 *   builds 1–8  — the camera climbs the stair, one build per tread
 *   stack A/B   — the treads lift into a floor plan of capabilities
 *   directions  — the plan resolves into a foundation and six lanes
 *   contact     — everything closes back into the monolith, where the lanes lead
 */

export type StepKind = 'origin' | 'position' | 'roadmap' | 'build' | 'stack' | 'directions' | 'contact';

export interface Viewport {
  aspect: number;
  portrait: boolean;
  narrow: boolean;
}

export interface Composition {
  shot: Shot;
  formation: Formation;
  accent: number[];
  strip: StripMode;
}

export interface Arrival {
  duration: number;
  move: MoveSpec;
  stagger: number;
  order: StaggerOrder;
}

const deg = THREE.MathUtils.degToRad;
const N = PLATE.N;
/** The term the calendar says we are in (−1 before T1) — lit on the stair, never claimed as progress. */
const now = currentTermIndex();
const zeros = () => new Array(N).fill(0);

function groupAt(x: number, y: number, z: number, yawDeg = 0, rollDeg = 0) {
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg(yawDeg))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deg(rollDeg)));
  return { p: new THREE.Vector3(x, y, z), q };
}

/* -------------------------------------------------------------------------- */
/* Monolith                                                                    */
/* -------------------------------------------------------------------------- */

export const HERO = { p: new THREE.Vector3(0, 2.2, 0), yaw: -2, az: 15 };
/** The closing monolith stands where the fan's hinge was — the lanes fold up into it. */
export const END = { p: new THREE.Vector3(-4.7, 15.2, -16), yaw: -12 };

function monolith(p: THREE.Vector3, yaw: number, seam = 0.016): Formation {
  const pitch = PLATE.T + seam;
  const plates: PlatePose[] = [];
  for (let i = 0; i < N; i++) plates.push(pose(0, (i - (N - 1) / 2) * pitch, 0));
  return { group: groupAt(p.x, p.y, p.z, yaw, 90), plates };
}

/* -------------------------------------------------------------------------- */
/* System stack — physical (bottom) → logical (top); the core opens up          */
/* -------------------------------------------------------------------------- */

export const STACK_C = new THREE.Vector3(0, 2.8, 0);

function systemStack(): Formation {
  const ys: number[] = [];
  let y = 0;
  for (let i = 0; i < N; i++) {
    if (i === 5) y += 0.36;
    if (i === 7) y += 0.36;
    ys.push(y);
    y += i === 5 ? 0.6 : 0.5;
  }
  const mid = (ys[0] + ys[N - 1]) / 2;
  const plates = ys.map((yy, i) => {
    const core = i === 5 || i === 6;
    return pose(core ? 0.25 : 0, yy - mid, core ? 1.05 : 0);
  });
  return { group: groupAt(STACK_C.x, STACK_C.y, STACK_C.z, 0), plates };
}

/* -------------------------------------------------------------------------- */
/* Stair — nine treads rising along a gentle curve                             */
/* -------------------------------------------------------------------------- */

export const STAIR = { going: 4.4, rise: 0.95, turn: 3.2, x0: -1.4 };
/** Where a build's illustration stands on its tread (tread-local). */
export const GLYPH_AT = new THREE.Vector3(0.95, 0, 0.15);

const treadCache: { p: THREE.Vector3; yaw: number }[] = [];
function treads() {
  if (treadCache.length) return treadCache;
  const p = new THREE.Vector3(STAIR.x0, 0, 0);
  let psi = 0;
  for (let i = 0; i < N; i++) {
    treadCache.push({ p: p.clone(), yaw: -psi });
    psi += deg(STAIR.turn);
    p.x += Math.sin(psi) * STAIR.going;
    p.z -= Math.cos(psi) * STAIR.going;
    p.y += STAIR.rise;
  }
  return treadCache;
}

export function treadPose(i: number) {
  return treads()[i];
}

/** World position of a point given in tread-local coordinates. */
export function onTread(i: number, local: THREE.Vector3, out = new THREE.Vector3()) {
  const t = treads()[i];
  return out.copy(local).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw).add(t.p);
}

function stair(active = -1): Formation {
  const plates = treads().map((t, i) => {
    const on = i === active;
    const fwd = new THREE.Vector3(0, 0, on ? 0.45 : 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
    return pose(t.p.x + fwd.x, t.p.y + (on ? 0.14 : 0), t.p.z + fwd.z, 0, t.yaw, 0);
  });
  return { group: groupAt(0, 0, 0), plates };
}

/* -------------------------------------------------------------------------- */
/* Floor plan of capabilities                                                  */
/* -------------------------------------------------------------------------- */

export const PLAN_C = new THREE.Vector3(0.6, 12.6, -23);
export const PLAN = {
  // core row + programming above it
  programming: [0, -5.05],
  embedded: [-3.6, 0],
  digital: [3.6, 0],
  // support rows
  hardware: [-3.6, 5.1],
  signal: [3.6, 5.1],
  tools: [-3.6, 10.3],
  dsa: [3.6, 10.3],
} as const;

/** Which plate carries which group (two plates under each core group). */
export const PLAN_SLOTS: { key: keyof typeof PLAN; lift: number }[] = [
  { key: 'embedded', lift: 0 },
  { key: 'embedded', lift: 1 },
  { key: 'digital', lift: 0 },
  { key: 'digital', lift: 1 },
  { key: 'programming', lift: 0 },
  { key: 'hardware', lift: 0 },
  { key: 'signal', lift: 0 },
  { key: 'tools', lift: 0 },
  { key: 'dsa', lift: 0 },
];

/** Top plate index per group (lettering and joints attach there). */
export const PLAN_TOP: Record<string, number> = { embedded: 1, digital: 3, programming: 4, hardware: 5, signal: 6, tools: 7, dsa: 8 };

function floorPlan(): Formation {
  const plates = PLAN_SLOTS.map((slot) => {
    const xz = PLAN[slot.key] as readonly [number, number];
    return pose(PLAN_C.x + xz[0], PLAN_C.y + slot.lift * 0.24, PLAN_C.z + xz[1]);
  });
  return { group: groupAt(0, 0, 0), plates };
}

/* -------------------------------------------------------------------------- */
/* Directions — the layers open like a fan from one shared foundation          */
/* -------------------------------------------------------------------------- */

export const FAN = {
  hinge: new THREE.Vector3(-4.0, 12.0, -16),
  angles: [4, 12, 20, 28, 36, 44],
};

function fan(): Formation {
  const plates: PlatePose[] = [];
  const h = FAN.hinge;
  // foundation: three plates closed beneath the hinge
  for (let k = 0; k < 3; k++) plates.push(pose(h.x + PLATE.W / 2, h.y - 0.2 * (3 - k), h.z, 0, 0, 0));
  // six lanes, hinged at their left ends, each a little further open
  FAN.angles.forEach((a, j) => {
    const th = deg(a);
    const y0 = h.y + j * 0.12;
    plates.push(pose(h.x + Math.cos(th) * (PLATE.W / 2), y0 + Math.sin(th) * (PLATE.W / 2), h.z + j * 0.02, 0, 0, th));
  });
  return { group: groupAt(0, 0, 0), plates };
}

export const FAN_CENTER = new THREE.Vector3(FAN.hinge.x + 3.2, FAN.hinge.y + 2.0, FAN.hinge.z);

/* -------------------------------------------------------------------------- */
/* Compositions                                                                */
/* -------------------------------------------------------------------------- */

/** Camera per build: low and close at the first tread, high and wide at the last — scope widens. */
// The camera stands front-right of each tread, so the treads still to come climb away to the
// upper right (as on the roadmap) and never pass behind the text column.
// Lens shifts (sx, sy) hold each illustration in the same slot — right of the copy, a little
// low — so the lit front edge of the tread passes beneath the text instead of through it.
// (Solved with scripts/frame.mjs: glyph in frame, later treads and the strip clear of live text.)
const BUILD_SHOTS: [number, number, number, number, number][] = [
  // az, el, dist, sx, sy
  [24, 7, 8.6, 0.3, -0.12],
  [40, 15, 9.2, 0.47, -0.24],
  [27, 19, 9.6, 0.45, -0.24],
  [43, 17, 10.0, 0.45, -0.21],
  [30, 24, 10.6, 0.45, -0.18],
  [45, 22, 11.2, 0.45, -0.24],
  [33, 28, 11.8, 0.45, -0.27],
  [38, 37, 13.4, 0.45, -0.12],
];

/** Upright screens: offsets from the landscape shot — copy fills the lower half, so each
 *  illustration is held in the upper half (solved at 390×844). [Δaz, Δel, ×dist, sx, sy] */
const BUILD_SHOTS_P: [number, number, number, number, number][] = [
  [0, -3, 0.8, 0, 0.2],
  [0, -6, 0.8, 0.15, 0.3],
  [12, -6, 0.8, 0.2, 0.3],
  [0, 0, 0.8, 0.15, 0.3],
  [12, -6, 0.8, 0.15, 0.3],
  [0, -3, 0.8, 0.15, 0.3],
  [12, -6, 0.8, 0.15, 0.3],
  // the flagship sits left so its seven discipline labels have the right-hand side
  [12, -6, 0.7, -0.4, 0.5],
];

export function compose(kind: StepKind, sub: number, vp: Viewport): Composition {
  const c = composeBase(kind, sub, vp);
  // Dev-only framing override for art direction: ?shot=az,el,dist,fov,sx,sy,dx,dy,dz (blank = keep)
  if (import.meta.env.DEV) {
    const raw = new URLSearchParams(location.search).get('shot');
    if (raw) {
      const v = raw.split(',').map((x) => (x.trim() === '' ? NaN : Number(x)));
      const s = c.shot;
      const has = (i: number) => Number.isFinite(v[i]);
      if (has(0)) s.az = deg(v[0]);
      if (has(1)) s.el = deg(v[1]);
      if (has(2)) s.dist = v[2];
      if (has(3)) s.fov = v[3];
      if (has(4)) s.sx = v[4];
      if (has(5)) s.sy = v[5];
      if (has(6)) s.target.x += v[6];
      if (has(7)) s.target.y += v[7];
      if (has(8)) s.target.z += v[8];
    }
  }
  return c;
}

function composeBase(kind: StepKind, sub: number, vp: Viewport): Composition {
  const P = vp.portrait;
  // Squarer screens pull back a little so compositions keep their edges.
  const fit = P ? 1 : Math.pow(Math.min(1, vp.aspect / 1.6), -0.45);

  switch (kind) {
    case 'origin': {
      const h = HERO.p;
      return {
        formation: monolith(h, HERO.yaw),
        // The portrait holds the left; the monolith is pushed to the far right (lens shift sx)
        // and lifted a touch so it stands clear of the name laid along the lower band.
        shot: P ? shot([h.x, h.y + 0.6, h.z], 22.5, HERO.az, -4, 46, 0.26, 0.2) : shot([h.x + 0.1, h.y - 0.05, h.z], 21.5 * fit, HERO.az, -4, 33, 0.48, 0.24),
        accent: zeros(),
        strip: 'long',
      };
    }
    case 'position': {
      const accent = zeros();
      accent[5] = 1;
      accent[6] = 1;
      const c = STACK_C;
      return {
        formation: systemStack(),
        // Held right of the headline with room for the layer labels before the section rail.
        shot: P ? shot([c.x, c.y - 0.3, c.z], 31, 11, 28, 46, -0.32, 0.3) : shot([c.x + 0.6, c.y - 0.1, c.z], 21.5 * fit, 33, 12, 30, 0.36, 0.06),
        accent,
        strip: 'long',
      };
    }
    case 'roadmap': {
      // A wide lens from below the first tread: "now" is large and close, the later terms
      // recede and climb to the upper right — time reads forward, left to right.
      const mid = onTread(4, new THREE.Vector3(0.6, 0.2, 0));
      const accent = zeros();
      if (now >= 0 && now < N) accent[now] = 0.8;
      return {
        formation: stair(),
        // upright: a long lens from far back lays the whole climb across the band between the copy
        shot: P ? shot([mid.x, mid.y - 0.2, mid.z], 160, 30, 32, 26, 0, 0.075) : shot([mid.x + 0.3, mid.y - 0.3, mid.z], 46 * fit, 24, 28, 42, 0.5, 0),
        accent,
        strip: 'long',
      };
    }
    case 'build': {
      const i = sub;
      const [az, el, dist, sx, sy] = BUILD_SHOTS[i];
      const t = treadPose(i);
      const c = onTread(i, new THREE.Vector3(GLYPH_AT.x, 0.62 + i * 0.015, GLYPH_AT.z + 0.45)).setY(t.p.y + 0.14 + 0.62);
      const yawDeg = THREE.MathUtils.radToDeg(t.yaw);
      const accent = zeros();
      accent[i] = 1;
      return {
        formation: stair(i),
        shot: P
          ? shot([c.x, c.y + 0.3, c.z], dist * 1.7 * BUILD_SHOTS_P[i][2], az + yawDeg + 6 + BUILD_SHOTS_P[i][0], el + 8 + BUILD_SHOTS_P[i][1], 46, BUILD_SHOTS_P[i][3], BUILD_SHOTS_P[i][4])
          : shot([c.x, c.y, c.z], dist * fit, az + yawDeg, el, 31, sx, sy),
        accent,
        strip: 'long',
      };
    }
    case 'stack': {
      const c = PLAN_C;
      const accent = zeros();
      if (sub === 0) {
        accent[1] = 0.85;
        accent[3] = 0.85;
      }
      const zA = c.z - 2.0;
      const zB = c.z + 7.4;
      // A: the core triangle — programming above, the two core groups below the copy line.
      // B: the camera slides down the plan and pulls back so the 2×2 support grid sits right.
      return {
        formation: floorPlan(),
        shot:
          sub === 0
            ? P
              ? shot([c.x, c.y, zA - 1.4], 40.7, 0, 74, 44, 0, 0.3)
              : shot([c.x, c.y, zA], 19.4 * fit, 0, 74, 31, 0.0, 0.0)
            : P
              ? shot([c.x + 1, c.y, zB + 1], 48, 0, 66, 44, 0.1, 0.6)
              : shot([c.x + 1, c.y, zB - 1], 24 * fit, 0, 77, 31, 0.35, 0.08),
        accent,
        strip: 'long',
      };
    }
    case 'directions': {
      const accent = zeros();
      accent[5] = 1; // Embedded Firmware
      accent[6] = 1; // FPGA / RTL
      const c = FAN_CENTER;
      return {
        formation: fan(),
        shot: P ? shot([c.x + 1.2, c.y + 0.4, c.z], 26.7, -4, 23, 46, -0.2, 0.35) : shot([c.x, c.y, c.z], 15.8 * fit, 9, 12, 30, -0.02, 0),
        accent,
        strip: 'long',
      };
    }
    case 'contact': {
      const accent = zeros();
      accent[4] = 1;
      const e = END.p;
      return {
        formation: monolith(e, END.yaw, 0.028),
        // The finale: the closed monolith stands tall at the right, turned so its nine edges
        // catch the strip light as nine fine lines beside the headline — one of them lit.
        shot: P ? shot([e.x, e.y - 0.6, e.z], 20, 40, 4, 40, 0, 0.2) : shot([e.x, e.y - 0.8, e.z], 21 * fit, 40, 3, 27, 0.6, -0.1),
        accent,
        strip: 'long',
      };
    }
  }
}

/** How the camera arrives at a step from its neighbour. */
export function arrival(kind: StepKind, _sub: number, fromKind: StepKind | null): Arrival {
  switch (kind) {
    case 'origin':
      return fromKind === 'position'
        ? { duration: 2.0, move: { fovKick: 4, swing: deg(-8) }, stagger: 0.035, order: 'down' }
        : { duration: 2.9, move: { fovKick: 5, lift: deg(10), logDist: true, breathe: 1.25 }, stagger: 0.03, order: 'center' };
    case 'position':
      return { duration: 2.1, move: { fovKick: 5, lift: deg(9), swing: deg(16) }, stagger: 0.05, order: 'up' };
    case 'roadmap':
      return fromKind === 'build'
        ? { duration: 1.9, move: { fovKick: 3, logDist: true }, stagger: 0.03, order: 'up' }
        : { duration: 2.25, move: { fovKick: 6, lift: deg(12), logDist: true }, stagger: 0.07, order: 'up' };
    case 'build':
      return fromKind === 'build'
        ? { duration: 1.5, move: { fovKick: 4.5, lift: deg(6), breathe: 1.16 }, stagger: 0.0, order: 'none' }
        : { duration: 2.0, move: { fovKick: 7, logDist: true, lift: deg(4) }, stagger: 0.02, order: 'up' };
    case 'stack':
      return fromKind === 'stack'
        ? { duration: 1.4, move: { fovKick: 2.5 }, stagger: 0.02, order: 'up' }
        : { duration: 2.2, move: { fovKick: 6, lift: deg(16), logDist: true, swing: deg(-20) }, stagger: 0.055, order: 'down' };
    case 'directions':
      return { duration: 2.05, move: { fovKick: 5, breathe: 1.12, swing: deg(10) }, stagger: 0.05, order: 'center' };
    case 'contact':
      return { duration: 2.8, move: { fovKick: 5, logDist: true, lift: deg(5) }, stagger: 0.045, order: 'center' };
  }
}
