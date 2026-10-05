export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const x = invLerp(a, b, v);
  return x * x * (3 - 2 * x);
};

/** Frame-rate independent exponential smoothing factor. */
export const dampK = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, dampK(lambda, dt));

/** Shortest-path angle interpolation (radians). */
export const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** CSS-equivalent cubic-bezier easing (Newton-Raphson + bisection fallback). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

export type Ease = (t: number) => number;

export const ease = {
  linear: ((t: number) => t) as Ease,
  /** Camera: decisive start, very long cinematic settle. */
  camera: cubicBezier(0.62, 0.0, 0.08, 1.0),
  /** Lead for look-at target — slightly ahead of position, like an operator panning first. */
  lead: cubicBezier(0.5, 0.0, 0.1, 1.0),
  /** Structures transforming in the world. */
  world: cubicBezier(0.7, 0.0, 0.16, 1.0),
  outExpo: cubicBezier(0.16, 1, 0.3, 1),
  inOutQuart: cubicBezier(0.76, 0, 0.24, 1),
  inQuad: cubicBezier(0.55, 0.085, 0.68, 0.53),
  outCubic: cubicBezier(0.33, 1, 0.68, 1),
};

/** Symmetric bump 0→1→0 over t∈[0,1]. */
export const bump = (t: number) => Math.sin(Math.PI * clamp(t));

/** Deterministic pseudo-random in [0,1). */
export function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
