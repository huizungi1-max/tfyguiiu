import { env } from './env';

export type Tier = 'high' | 'mid' | 'low';

export interface QualitySettings {
  tier: Tier;
  /** Upper bound for device pixel ratio. */
  dprMax: number;
  /** Lower bound the adaptive controller may fall to. */
  dprMin: number;
  antialias: boolean;
  shadows: boolean;
  shadowSize: number;
  envSize: number;
  segments: number;
}

/** Heuristic tier detection. Deliberately conservative; the adaptive controller refines it live. */
export function detectQuality(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): QualitySettings {
  const forced = env.params.get('q') as Tier | null;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const dpr = window.devicePixelRatio || 1;
  let renderer = '';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  }
  const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  const mobile = env.coarse && Math.min(screen.width, screen.height) < 900;

  let tier: Tier = 'high';
  if (software || mem <= 2 || cores <= 2) tier = 'low';
  else if (mobile || mem <= 4 || cores <= 4) tier = 'mid';
  if (forced === 'high' || forced === 'mid' || forced === 'low') tier = forced;

  const table: Record<Tier, Omit<QualitySettings, 'tier'>> = {
    high: { dprMax: Math.min(dpr, 2), dprMin: 1, antialias: true, shadows: true, shadowSize: 2048, envSize: 256, segments: 4 },
    mid: { dprMax: Math.min(dpr, 1.75), dprMin: 0.85, antialias: true, shadows: true, shadowSize: 1024, envSize: 128, segments: 3 },
    low: { dprMax: Math.min(dpr, 1.25), dprMin: 0.7, antialias: !software, shadows: false, shadowSize: 512, envSize: 64, segments: 2 },
  };
  return { tier, ...table[tier] };
}

/**
 * Adaptive resolution. Watches frame times and nudges the pixel ratio within
 * [dprMin, dprMax] with hysteresis so it never oscillates visibly.
 */
export class AdaptiveResolution {
  private samples: number[] = [];
  private cooldown = 2.5;
  current: number;

  constructor(
    private q: QualitySettings,
    private apply: (dpr: number) => void,
  ) {
    this.current = q.dprMax;
  }

  update(dt: number) {
    if (dt <= 0 || dt > 0.5) return; // tab switches, hitches
    this.samples.push(dt);
    if (this.samples.length > 90) this.samples.shift();
    this.cooldown -= dt;
    if (this.cooldown > 0 || this.samples.length < 60) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    let next = this.current;
    if (p75 > 1 / 45) next = Math.max(this.q.dprMin, this.current - 0.25);
    else if (p75 < 1 / 100 && this.current < this.q.dprMax) next = Math.min(this.q.dprMax, this.current + 0.125);
    if (next !== this.current) {
      this.current = next;
      this.apply(next);
      this.samples.length = 0;
      this.cooldown = 3;
    } else {
      this.cooldown = 1;
    }
  }
}
