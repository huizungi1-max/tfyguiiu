/**
 * Optional sound — synthesised, so nothing to download. Off by default; the
 * site is complete without it. A low, slow ambient bed, a soft air movement
 * on transitions, and a quiet tick when a build arrives. Never loud, never looped melodies.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambientStarted = false;
  enabled = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  toggle() {
    if (this.enabled) this.disable();
    else this.enable();
    return this.enabled;
  }

  enable() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      this.fx = this.ctx.createGain();
      this.fx.gain.value = 1;
      this.fx.connect(this.master);
      this.noise = this.makeNoise(2.5);
    }
    void this.ctx.resume();
    if (!this.ambientStarted) this.startAmbient();
    this.enabled = true;
    const t = this.ctx.currentTime;
    this.master!.gain.cancelScheduledValues(t);
    this.master!.gain.setValueAtTime(this.master!.gain.value, t);
    this.master!.gain.linearRampToValueAtTime(0.9, t + 1.6);
  }

  disable() {
    this.enabled = false;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.45);
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (!this.enabled) void ctx.suspend();
    }, 520);
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    // soft pink-ish noise
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    return buf;
  }

  private startAmbient() {
    const ctx = this.ctx!;
    this.ambientStarted = true;
    const bus = ctx.createGain();
    bus.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.4;
    bus.connect(lp).connect(this.master!);

    // Two low partials a fifth apart, slowly beating.
    const freqs = [55, 82.41, 110.3];
    const gains = [0.55, 0.32, 0.12];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 4;
      const g = ctx.createGain();
      g.gain.value = gains[i];
      o.connect(g).connect(bus);
      o.start();
      // very slow breathing
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.035 + i * 0.017;
      const lg = ctx.createGain();
      lg.gain.value = gains[i] * 0.35;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
    });

    // Air: band-limited noise, barely there.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.06;
    src.connect(bp).connect(ng).connect(bus);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start();
  }

  /** Air movement shaped to the camera move. */
  whoosh(duration: number, strength = 1) {
    if (!this.enabled || !this.ctx || !this.fx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    const peak = t + duration * 0.38;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1500 * (0.8 + strength * 0.3), peak);
    bp.frequency.exponentialRampToValueAtTime(220, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * strength, peak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration * 1.05);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.25, t);
    pan.pan.linearRampToValueAtTime(0.25, t + duration);
    src.connect(bp).connect(g).connect(pan).connect(this.fx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration * 1.1);
  }

  /** A quiet, short tone when a composition settles. */
  tick(pitch = 1) {
    if (!this.enabled || !this.ctx || !this.fx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1760 * pitch, t);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(2637 * pitch, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.fx);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.5);
    o2.stop(t + 0.5);
  }

  /** Low, soft arrival — used for the largest moves only. */
  thump() {
    if (!this.enabled || !this.ctx || !this.fx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + 1);
  }
}
