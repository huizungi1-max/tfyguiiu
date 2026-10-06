/**
 * Gesture → intent. The contract: ONE deliberate gesture produces ONE
 * transition. Trackpad inertia tails, wheel spins and long swipes are each
 * treated as a single gesture; a genuinely new gesture is recognised by a
 * quiet gap or by a clear rise in energy.
 *
 * Every intent carries an axis. Vertical gestures move between pages;
 * horizontal gestures move sideways inside horizontal sections (the skill-domain
 * orbit and the projects). The app decides what each axis means where.
 */

export type Source = 'wheel' | 'touch' | 'key' | 'drag';
export type Axis = 'x' | 'y';

export interface InputHooks {
  /** Move one step along an axis. */
  step(dir: 1 | -1, axis: Axis, source: Source): void;
  /** Jump to the first / last step. */
  edge(which: 'first' | 'last'): void;
  /** How far the current transition has progressed (1 = idle). */
  progress(): number;
  /** Whether input should be ignored entirely (e.g. menu open). */
  blocked(): boolean;
  /** Whether sideways gestures do anything right now. */
  sideways(): boolean;
  /** Live horizontal drag offset in px (0 when released / fired). */
  drag?(dx: number): void;
}

const LINE = 16;
const WHEEL_THRESHOLD = 34;
const QUIET_MS = 200;
const ACCEPT_AT = 0.72; // a new gesture may chain once the current move is mostly done
const QUEUE_AFTER = 0.34; // ...and is remembered if it arrives after this point
const DRAG_FIRE = 64; // px of mouse / pen drag that commits a sideways step

interface Pending {
  dir: 1 | -1;
  axis: Axis;
}

export class Input {
  private acc = 0;
  private accAxis: Axis = 'y';
  private fresh = true;
  private lastWheel = 0;
  private lastAbs = 0;
  private lastFire = 0;
  private queued: Pending | null = null;
  private touch: { x: number; y: number; t: number; fired: boolean } | null = null;
  private pointer: { id: number; x: number; y: number; fired: boolean } | null = null;

  constructor(private hooks: InputHooks) {
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', () => this.endTouch(), { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKey);
  }

  /** Called every frame: releases a queued gesture once the move allows it. */
  update() {
    if (this.queued && this.hooks.progress() >= ACCEPT_AT && !this.hooks.blocked()) {
      const q = this.queued;
      this.queued = null;
      this.hooks.step(q.dir, q.axis, 'wheel');
    }
  }

  private fire(dir: 1 | -1, axis: Axis, source: Source) {
    if (axis === 'x' && !this.hooks.sideways()) return;
    const p = this.hooks.progress();
    this.lastFire = performance.now();
    if (p >= ACCEPT_AT) this.hooks.step(dir, axis, source);
    else if (p >= QUEUE_AFTER) this.queued = { dir, axis };
    // earlier than that: the gesture is absorbed by the move already under way
  }

  private setDrag(dx: number) {
    this.hooks.drag?.(this.hooks.sideways() ? dx : 0);
  }

  /* — wheel / trackpad ——————————————————————————————————————————————— */
  private onWheel = (e: WheelEvent) => {
    if ((e.target as HTMLElement)?.closest?.('[data-scroll]')) return;
    e.preventDefault();
    if (this.hooks.blocked() || e.ctrlKey) return;
    const now = performance.now();
    const k = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? window.innerHeight : 1;
    const dy = e.deltaY * k;
    const dx = e.deltaX * k;
    const axis: Axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    const d = axis === 'x' ? dx : dy;
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

    if (this.acc !== 0 && (axis !== this.accAxis || Math.sign(d) !== Math.sign(this.acc))) this.acc = 0;
    this.accAxis = axis;
    this.acc += d;
    if (Math.abs(this.acc) >= WHEEL_THRESHOLD) {
      this.fresh = false;
      const dir = this.acc > 0 ? 1 : -1;
      this.acc = 0;
      this.fire(dir, axis, 'wheel');
    }
  };

  /* — touch ——————————————————————————————————————————————————————————— */
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
    // The two axes are kept clearly apart: a gesture must be decisively one or the other.
    const vertical = Math.abs(dy) > 44 && Math.abs(dy) > Math.abs(dx) * 1.15;
    const horizontal = Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4;
    if (vertical || horizontal) {
      s.fired = true;
      this.setDrag(0);
      if (vertical) this.fire(dy < 0 ? 1 : -1, 'y', 'touch');
      else this.fire(dx < 0 ? 1 : -1, 'x', 'touch');
    } else if (Math.abs(dx) > Math.abs(dy)) {
      this.setDrag(dx);
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    const s = this.touch;
    this.endTouch();
    if (!s || s.fired) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const dt = performance.now() - s.t;
    // a short, quick flick
    if (dt < 260 && Math.max(Math.abs(dx), Math.abs(dy)) > 26) {
      if (Math.abs(dy) >= Math.abs(dx)) this.fire(dy < 0 ? 1 : -1, 'y', 'touch');
      else this.fire(dx < 0 ? 1 : -1, 'x', 'touch');
    }
  };

  private endTouch() {
    this.touch = null;
    this.setDrag(0);
  }

  /* — mouse / pen drag (sideways only) ———————————————————————————————— */
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0 || this.hooks.blocked() || !this.hooks.sideways()) return;
    const el = e.target as HTMLElement;
    if (el?.closest?.('button, a, input, [data-scroll]')) return;
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
    document.documentElement.classList.add('is-dragging');
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId || p.fired) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > DRAG_FIRE && Math.abs(dx) > Math.abs(dy) * 1.4) {
      p.fired = true;
      this.setDrag(0);
      this.fire(dx < 0 ? 1 : -1, 'x', 'drag');
    } else {
      this.setDrag(dx);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointer || this.pointer.id !== e.pointerId) return;
    this.pointer = null;
    this.setDrag(0);
    document.documentElement.classList.remove('is-dragging');
  };

  /* — keys ———————————————————————————————————————————————————————————— */
  private onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || this.hooks.blocked()) return;
    const el = e.target as HTMLElement;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
    const onControl = tag === 'BUTTON' || tag === 'A';
    let dir: 0 | 1 | -1 = 0;
    let axis: Axis = 'y';
    switch (e.key) {
      case 'ArrowDown':
      case 'PageDown':
        dir = 1;
        break;
      case 'ArrowUp':
      case 'PageUp':
        dir = -1;
        break;
      case 'ArrowRight':
        dir = 1;
        axis = 'x';
        break;
      case 'ArrowLeft':
        dir = -1;
        axis = 'x';
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
    if (axis === 'x' && !this.hooks.sideways()) return;
    e.preventDefault();
    if (e.repeat) return; // holding a key never skips sections
    // Keys are deliberate: they may interrupt a move (the rig absorbs the change smoothly).
    if (this.hooks.progress() >= 0.25) this.hooks.step(dir, axis, 'key');
    else this.queued = { dir, axis };
  };
}
