type Tick = (dt: number, time: number) => void;

/** Single RAF loop. Pauses with the tab; clamps dt so a hitch never becomes a jump. */
export class Loop {
  private ticks: Tick[] = [];
  private last = 0;
  private time = 0;
  private raf = 0;
  private running = false;
  private wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.halt();
      else if (this.wanted) this.run();
    });
  }

  add(t: Tick) {
    this.ticks.push(t);
  }

  start() {
    this.wanted = true;
    if (!document.hidden) this.run();
  }

  private run() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.time += dt;
      for (const t of this.ticks) t(dt, this.time);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private halt() {
    cancelAnimationFrame(this.raf);
    this.running = false;
  }

  /** Advance synchronously (deterministic captures). */
  step(dt: number) {
    this.time += dt;
    for (const t of this.ticks) t(dt, this.time);
  }
}
