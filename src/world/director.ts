import { cloneFormation, type Formation } from './plates';
import { arrival, compose, type Arrival, type Composition, type Viewport } from './compositions';
import { cloneShot, type Shot } from './rig';
import type { World } from './world';
import { steps, type Step } from '../nav/steps';
import { clamp, smoothstep } from '../core/math';
import { env } from '../core/env';

export interface StageState {
  from: Step;
  to: Step;
  /** Raw transition progress, 1 when settled. */
  t: number;
  /** Transition duration in seconds. */
  duration: number;
  dir: 1 | -1;
  dt: number;
  time: number;
  reduced: boolean;
}

export interface StageSystem {
  update(s: StageState): void;
}

export interface ChangeEvent {
  from: Step;
  to: Step;
  dir: 1 | -1;
  duration: number;
  instant: boolean;
  reduced: boolean;
}

export function viewport(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { aspect: w / h, portrait: h > w * 1.08, narrow: w < 760 };
}

/**
 * The director owns the journey: one progress value per transition drives the
 * camera, the plates and every subsystem, so motion stays in lockstep.
 */
export class Director {
  index = 0;
  private fromIndex = 0;
  private fromShot: Shot;
  private fromForm: Formation;
  private target: Composition;
  private spec: Arrival;
  private t = 1;
  private duration = 1;
  private dir: 1 | -1 = 1;
  private reduced = false;
  private systems: StageSystem[] = [];
  private changeListeners: ((e: ChangeEvent) => void)[] = [];
  private settleListeners: ((s: Step) => void)[] = [];
  private veil: HTMLElement | null = document.querySelector('.veil');
  private settledFired = true;
  /** Freeze progress (debug captures of mid-transition frames). */
  freezeAt: number | null = null;

  constructor(private world: World) {
    const first = steps[0];
    this.target = compose(first.kind, first.sub, viewport());
    this.spec = arrival(first.kind, first.sub, null);
    this.fromShot = cloneShot(this.target.shot);
    this.fromForm = cloneFormation(this.target.formation);
    world.plates.apply(this.target.formation);
    world.plates.setSkin(first.kind === 'origin' ? 4 : -1);
    world.rig.set(this.target.shot);
    world.rig.snap();
  }

  get step(): Step {
    return steps[this.index];
  }
  get busy() {
    return this.t < 1;
  }
  get progress() {
    return this.t;
  }

  add(sys: StageSystem) {
    this.systems.push(sys);
  }
  onChange(fn: (e: ChangeEvent) => void) {
    this.changeListeners.push(fn);
  }
  onSettle(fn: (s: Step) => void) {
    this.settleListeners.push(fn);
  }

  /**
   * `adjacent` marks a move as one gesture-sized step even when the indices are far apart
   * (sideways wrap on the orbit, or leaving a horizontal section for the next page).
   */
  goTo(index: number, opts: { instant?: boolean; from?: number; adjacent?: boolean } = {}) {
    index = clamp(Math.round(index), 0, steps.length - 1);
    if (index === this.index && !opts.instant && this.t >= 1) return false;
    const prev = this.index;
    const fromStep = steps[opts.from ?? prev];
    const toStep = steps[index];
    const adjacent = opts.adjacent ?? Math.abs(index - prev) === 1;
    this.dir = index >= prev ? 1 : -1;
    this.reduced = env.reducedMotion;

    // Start from wherever we are right now — never jump.
    this.fromShot = cloneShot(this.world.rig.base);
    this.fromForm = this.world.plates.snapshot();
    this.fromIndex = opts.from ?? prev;
    this.index = index;
    this.target = compose(toStep.kind, toStep.sub, viewport());
    // Moving backward re-uses the arrival of the step we are leaving, so a
    // reversed move mirrors the forward one.
    const ref = this.dir === 1 || !adjacent ? toStep : steps[prev];
    const refFrom = this.dir === 1 || !adjacent ? (adjacent ? fromStep.kind : null) : toStep.kind;
    this.spec = arrival(ref.kind, ref.sub, refFrom);
    if (!adjacent && prev !== index) {
      // Long jumps (index / menu): one decisive move, breathing out between.
      this.spec = { ...this.spec, duration: Math.min(2.6, this.spec.duration + 0.25), move: { ...this.spec.move, breathe: 1.25, logDist: true } };
    }
    this.duration = this.reduced ? 0.8 : this.spec.duration;
    this.world.plates.setStripMode(this.target.strip);
    this.world.plates.setAccent(this.target.accent);
    // The 5th slab (index 4) wears the orange skin on the origin monolith only.
    this.world.plates.setSkin(toStep.kind === 'origin' ? 4 : -1);

    if (opts.instant) {
      this.t = 1;
      this.world.plates.apply(this.target.formation);
      this.world.rig.set(this.target.shot);
      this.world.rig.snap();
    } else {
      this.t = 0;
    }
    this.settledFired = false;
    const ev: ChangeEvent = { from: fromStep, to: toStep, dir: this.dir, duration: opts.instant ? 0 : this.duration, instant: !!opts.instant, reduced: this.reduced };
    this.changeListeners.forEach((l) => l(ev));
    return true;
  }

  /** Opening move: from a custom state into the current step's composition. */
  intro(fromShot: Shot, fromForm: Formation, spec: Arrival) {
    this.fromShot = cloneShot(fromShot);
    this.fromForm = cloneFormation(fromForm);
    this.world.plates.apply(fromForm);
    this.world.rig.set(fromShot);
    this.world.rig.snap();
    this.spec = spec;
    this.duration = spec.duration;
    this.fromIndex = this.index;
    this.reduced = false;
    this.t = 0;
    this.settledFired = false;
  }

  /** Re-compose the current step for a new viewport (resize / rotate). */
  recompose() {
    const s = this.step;
    const next = compose(s.kind, s.sub, viewport());
    if (this.t >= 1) {
      this.fromShot = cloneShot(this.world.rig.base);
      this.fromForm = this.world.plates.snapshot();
      this.target = next;
      this.spec = { duration: 0.6, move: {}, stagger: 0, order: 'none' };
      this.duration = 0.6;
      this.t = 0;
      this.fromIndex = this.index;
    } else {
      this.target = next;
    }
  }

  update(dt: number, time: number) {
    if (this.t < 1) {
      this.t = this.freezeAt ?? Math.min(1, this.t + dt / this.duration);
    }
    const t = this.t;
    if (this.reduced) {
      // Reduced motion: same compositions, no travel — a quiet cut through black.
      const cut = t >= 0.45 ? 1 : 0;
      this.world.plates.blend(this.fromForm, this.target.formation, cut, 0, 'none');
      this.world.rig.blend(this.fromShot, this.target.shot, cut);
      if (cut) this.world.rig.snap();
      if (this.veil) this.veil.style.opacity = t < 1 ? String(1 - Math.abs(t - 0.45) / 0.55) : '0';
    } else {
      this.world.plates.blend(this.fromForm, this.target.formation, t, this.spec.stagger, this.dir === 1 ? this.spec.order : flip(this.spec.order));
      this.world.rig.blend(this.fromShot, this.target.shot, t, this.spec.move);
      if (this.veil && this.veil.style.opacity !== '0') this.veil.style.opacity = '0';
    }

    const state: StageState = {
      from: steps[this.fromIndex],
      to: steps[this.index],
      t,
      duration: this.duration,
      dir: this.dir,
      dt,
      time,
      reduced: this.reduced,
    };
    for (const s of this.systems) s.update(state);

    if (t >= 1 && !this.settledFired) {
      this.settledFired = true;
      this.fromIndex = this.index;
      this.settleListeners.forEach((l) => l(steps[this.index]));
    }
  }
}

function flip(o: Arrival['order']): Arrival['order'] {
  return o === 'up' ? 'down' : o === 'down' ? 'up' : o;
}

/** Visibility helper: fade out early in a move, fade in late. */
export function presence(inFrom: boolean, inTo: boolean, t: number, outEnd = 0.35, inStart = 0.45, inEnd = 0.95) {
  if (inFrom && inTo) return 1;
  if (inFrom) return 1 - smoothstep(0, outEnd, t);
  if (inTo) return smoothstep(inStart, inEnd, t);
  return 0;
}
