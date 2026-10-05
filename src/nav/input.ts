/**
 * Gesture → intent. The contract: ONE deliberate gesture produces ONE
 * transition. Trackpad inertia tails, wheel spins and long swipes are each
 * treated as a single gesture; a genuinely new gesture is recognised by a
 * quiet gap or by a clear rise in energy.
 */

export type Source = 'wheel' | 'touch' | 'key';

export interface InputHooks {
  /** Move one step. */
  step(dir: 1 | -1, source: Source): void;
  /** Jump to the first / last step. */
  edge(which: 'first' | 'last'): void;
  /** How far the current transition has progressed (1 = idle). */
  progress(): number;
  /** Whether input should be ignored entirely (e.g. menu open). */
  blocked(): boolean;
}

const LINE = 16;
const WHEEL_THRESHOLD = 34;
const QUIET_MS = 200;
const ACCEPT_AT = 0.72; // a new gesture may chain once the current move is mostly done
const QUEUE_AFTER = 0.34; // ...and is remembered if it arrives after this point

export class Input {
  private acc = 0;
  private fresh = true;
  private lastWheel = 0;
  private lastAbs = 0;
  private lastFire = 0;
  private queued: 0 | 1 | -1 = 0;
  private touch: { x: number; y: number; t: number; fired: boolean } | null = null;

  constructor(private hooks: InputHooks) {
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', () => (this.touch = null), { passive: true });
    window.addEventListener('keydown', this.onKey);
  }

  /** Called every frame: releases a queued gesture once the move allows it. */
  update() {
    if (this.queued && this.hooks.progress() >= ACCEPT_AT && !this.hooks.blocked()) {
      const d = this.queued;
      this.queued = 0;
      this.hooks.step(d, 'wheel');
    }
  }

  private fire(dir: 1 | -1, source: Source) {
    const p = this.hooks.progress();
    this.lastFire = performance.now();
    if (p >= ACCEPT_AT) this.hooks.step(dir, source);
    else if (p >= QUEUE_AFTER) this.queued = dir;
    // earlier than that: the gesture is absorbed by the move already under way
  }

  private onWheel = (e: WheelEvent) => {
    if ((e.target as HTMLElement)?.closest?.('[data-scroll]')) return;
    e.preventDefault();
    if (this.hooks.blocked() || e.ctrlKey) return;
    const now = performance.now();
    const k = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? window.innerHeight : 1;
    const dy = e.deltaY * k;
    const dx = e.deltaX * k;
    const d = Math.abs(dx) > Math.abs(dy) * 1.3 ? dx : dy;
    const ad = Math.abs(d);
    const gap = now - this.lastWheel;
    this.lastWheel = now;

    if (gap > QUIET_MS) {
      this.fresh = true;
      this.acc = 0;
    } else if (!this.fresh && ad > this.lastAbs * 1.8 + 6 && ad > 18 && now - this.lastFire > 260) {
      // energy rose sharply mid-tail: a new, deliberate gesture
      this.fresh = true;
      this.acc = 0;
    }
    this.lastAbs = ad;
    if (!this.fresh) return;

    if (this.acc !== 0 && Math.sign(d) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += d;
    if (Math.abs(this.acc) >= WHEEL_THRESHOLD) {
      this.fresh = false;
      const dir = this.acc > 0 ? 1 : -1;
      this.acc = 0;
      this.fire(dir, 'wheel');
    }
  };

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || this.hooks.blocked()) {
      this.touch = null;
      return;
    }
    const t = e.touches[0];
    this.touch = { x: t.clientX, y: t.clientY, t: performance.now(), fired: false };
  };

  private onTouchMove = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target?.closest?.('[data-scroll]')) return;
    if (e.cancelable) e.preventDefault();
    const s = this.touch;
    if (!s || s.fired || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const vertical = Math.abs(dy) > 44 && Math.abs(dy) > Math.abs(dx) * 1.15;
    const horizontal = Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4;
    if (vertical || horizontal) {
      s.fired = true;
      const d = vertical ? dy : dx;
      this.fire(d < 0 ? 1 : -1, 'touch');
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    const s = this.touch;
    this.touch = null;
    if (!s || s.fired) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const dt = performance.now() - s.t;
    // a short, quick flick
    if (dt < 260 && Math.max(Math.abs(dx), Math.abs(dy)) > 26) {
      const d = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      this.fire(d < 0 ? 1 : -1, 'touch');
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || this.hooks.blocked()) return;
    const el = e.target as HTMLElement;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    const onControl = tag === 'BUTTON' || tag === 'A';
    let dir: 0 | 1 | -1 = 0;
    switch (e.key) {
      case 'ArrowDown':
      case 'PageDown':
      case 'ArrowRight':
        dir = 1;
        break;
      case 'ArrowUp':
      case 'PageUp':
      case 'ArrowLeft':
        dir = -1;
        break;
      case ' ':
        if (onControl) return; // let Space press the focused control
        dir = e.shiftKey ? -1 : 1;
        break;
      case 'Home':
        e.preventDefault();
        if (!e.repeat) this.hooks.edge('first');
        return;
      case 'End':
        e.preventDefault();
        if (!e.repeat) this.hooks.edge('last');
        return;
      default:
        return;
    }
    e.preventDefault();
    if (e.repeat) return; // holding a key never skips sections
    // Keys are deliberate: they may interrupt a move (the rig absorbs the change smoothly).
    if (this.hooks.progress() >= 0.25) this.hooks.step(dir, 'key');
    else this.queued = dir;
  };
}
