import * as THREE from 'three';
import { Loop } from './core/loop';
import { AdaptiveResolution, detectQuality } from './core/quality';
import { env } from './core/env';
import { World } from './world/world';
import { Director, viewport } from './world/director';
import { compose } from './world/compositions';
import { Glyphs } from './world/glyphs';
import { WorldType } from './world/worldType';
import { Labels } from './world/labels';
import { Eagle } from './world/eagle';
import { pose, PLATE, type Formation } from './world/plates';
import { shot } from './world/rig';
import { steps, stepFromHash, firstStepOfSection, isHorizontal } from './nav/steps';
import { Input, type Axis } from './nav/input';
import { sections } from './content/content';
import { damp } from './core/math';
import { UI } from './ui/ui';
import { Sound } from './audio/sound';

declare global {
  interface Window {
    __app: App;
    __ready: boolean;
  }
}

function grainTexture() {
  const s = 180;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
}

function setLoad(p: number) {
  document.documentElement.style.setProperty('--p', String(p));
}

export class App {
  loop = new Loop();
  world!: World;
  director!: Director;
  ui!: UI;
  glyphs!: Glyphs;
  type!: WorldType;
  labels!: Labels;
  eagle!: Eagle;
  input!: Input;
  sound = new Sound();
  private lastSub: Record<number, number> = {};
  private drag = 0;
  private dragTarget = 0;

  async init() {
    setLoad(0.15);
    grainTexture();
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    const probe = document.createElement('canvas').getContext('webgl2');
    const q = detectQuality(probe);
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    const first = compose(steps[0].kind, 0, viewport());
    this.world = new World(canvas, q, first.shot);
    this.world.setDpr(q.dprMax);
    setLoad(0.45);

    this.director = new Director(this.world);
    this.glyphs = new Glyphs(this.world.plates);
    this.type = new WorldType(this.world);
    this.labels = new Labels(this.world, this.glyphs);
    this.eagle = new Eagle(this.world);
    this.director.add(this.glyphs);
    this.director.add(this.type);
    this.director.add(this.labels);
    this.director.add(this.eagle);
    // debug captures: pin the eagle at a point of its flight (?fly=0.45)
    if (env.params.has('fly')) this.eagle.hold = Number(env.params.get('fly'));
    this.ui = new UI(this.director, this.world, this.type, this.sound);

    // Remember where each horizontal section was left, so coming back resumes there.
    this.director.onChange((e) => (this.lastSub[e.to.section] = e.to.sub));
    this.director.onChange((e) => this.eagle.onChange(e));
    this.ui.onNav = (axis, dir) => this.move(axis, dir);
    this.ui.onTheme = (light) => this.applyTheme(light, true);
    this.applyTheme(document.documentElement.dataset.theme === 'light', false);

    this.input = new Input({
      step: (dir, axis) => this.move(axis, dir),
      edge: (w) => this.director.goTo(w === 'first' ? 0 : steps.length - 1),
      progress: () => this.director.progress,
      blocked: () => this.ui.blocked,
      sideways: () => isHorizontal(this.director.step.section),
      drag: (dx) => (this.dragTarget = Math.max(-1, Math.min(1, dx / Math.max(320, window.innerWidth * 0.5)))),
    });

    const applyMotionPrefs = () => {
      const r = env.reducedMotion;
      this.world.rig.parallax = r || env.coarse ? 0 : 1;
      this.world.rig.drift = r ? 0 : env.coarse ? 0.7 : 1;
      document.documentElement.classList.toggle('reduced', r);
    };
    applyMotionPrefs();
    env.onReducedMotionChange(applyMotionPrefs);

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.world.rig.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        this.world.resize();
        this.director.recompose();
      });
    });

    const adaptive = new AdaptiveResolution(q, (d) => this.world.setDpr(d));
    const yaw = new THREE.Quaternion();
    const UP = new THREE.Vector3(0, 1, 0);
    this.loop.add((dt, time) => {
      this.input.update();
      this.director.update(dt, time);
      // Live drag: the orbit turns a little under the pointer; on the projects the camera leans.
      // Both ease back once the gesture commits or is released.
      this.drag = damp(this.drag, env.reducedMotion ? 0 : this.dragTarget, 9, dt);
      const kind = this.director.step.kind;
      if (kind === 'roadmap' && Math.abs(this.drag) > 1e-4) {
        this.world.plates.group.quaternion.premultiply(yaw.setFromAxisAngle(UP, this.drag * THREE.MathUtils.degToRad(14)));
      }
      // on the hero the camera leans a hair toward the eagle as it crosses
      this.world.rig.nudge = kind === 'build' ? -this.drag * THREE.MathUtils.degToRad(5) : this.eagle.lean * this.world.rig.parallax;
      this.world.plates.update(dt, time);
      this.world.rig.update(dt, time);
      this.world.render();
      if (!env.params.has('fixeddpr')) adaptive.update(dt);
    });

    // Where to begin: deep link, debug, or the origin.
    const fromParam = env.params.has('step') ? Number(env.params.get('step')) : -1;
    const start = fromParam >= 0 ? fromParam : stepFromHash(location.hash);
    const skipIntro = env.params.has('nointro') || env.reducedMotion || start > 0;
    if (start > 0) this.director.goTo(start, { instant: true });

    // Render one frame before revealing (shader compile happens here, not mid-move).
    this.world.rig.update(0, 0);
    this.world.renderer.compile(this.world.scene, this.world.rig.camera);
    this.eagle.warm();
    this.world.render();
    setLoad(0.8);
    await document.fonts.ready;
    setLoad(1);

    if (!skipIntro) this.playIntro();
    this.loop.start();
    window.setTimeout(
      () => {
        document.documentElement.classList.add('is-loaded');
        this.ui.reveal(skipIntro ? 250 : 1500);
        if (!skipIntro) document.documentElement.classList.add('intro');
      },
      env.params.has('nointro') ? 0 : 450,
    );
    window.__ready = true;
  }

  /** The opening: nine plates standing apart close into one monolith while the camera arrives. */
  private playIntro() {
    const target = compose('origin', 0, viewport());
    const spread: Formation = {
      group: { p: target.formation.group.p.clone(), q: target.formation.group.q.clone() },
      plates: target.formation.plates.map((_, i) => {
        const k = i - (PLATE.N - 1) / 2;
        return pose(0, k * 2.15, -Math.abs(k) * 0.6, 0, 0, 0);
      }),
    };
    const s = target.shot;
    const from = shot([s.target.x, s.target.y + 0.4, s.target.z], s.dist * 2.3, THREE.MathUtils.radToDeg(s.az) - 34, -10, s.fov - 6, s.sx, s.sy);
    this.director.intro(from, spread, { duration: 3.1, move: { logDist: true, fovKick: 3 }, stagger: 0.05, order: 'center' });
  }

  /** Light / dark: page tokens via data-theme, the scene and the hero sculpture re-skin themselves. */
  applyTheme(light: boolean, user: boolean) {
    const root = document.documentElement;
    if (user) {
      root.classList.add('theme-anim');
      window.setTimeout(() => root.classList.remove('theme-anim'), 700);
      try {
        localStorage.setItem('theme', light ? 'light' : 'dark');
      } catch {
        /* storage unavailable — the choice just won't persist */
      }
    }
    root.dataset.theme = light ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f1eee8' : '#050506');
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', light ? 'light' : 'dark');
    const btn = document.querySelector('[data-theme-toggle]');
    btn?.setAttribute('aria-pressed', String(light));
    btn?.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    this.world.setTheme(light);
    this.eagle.setTheme(light);
    this.glyphs.setTheme(light);
  }

  /**
   * The navigation rule, in one place:
   *   horizontal sections (skill domains, projects) — x moves between cards / projects,
   *                                                   y leaves for the previous / next page
   *   every other section                            — y moves step by step; x does nothing
   */
  move(axis: Axis, dir: 1 | -1) {
    const cur = this.director.step;
    const sec = sections[cur.section];
    if (axis === 'x') {
      if (!sec.horizontal) return;
      let sub = cur.sub + dir;
      // the orbit is a ring and wraps; the projects are a sequence and stop at either end
      if (sec.id === 'domains') sub = (sub + sec.steps) % sec.steps;
      else if (sub < 0 || sub >= sec.steps) return;
      this.director.goTo(firstStepOfSection(cur.section) + sub, { adjacent: true });
      return;
    }
    if (sec.horizontal) {
      const si = cur.section + dir;
      if (si >= 0 && si < sections.length) this.director.goTo(this.entry(si, dir), { adjacent: true });
      return;
    }
    const next = steps[cur.index + dir];
    if (!next) return;
    if (next.section !== cur.section && isHorizontal(next.section)) this.director.goTo(this.entry(next.section, dir), { adjacent: true });
    else this.director.goTo(next.index);
  }

  /** Where a vertical move lands in a section: resume horizontal ones; enter others from the near end. */
  private entry(si: number, dir: 1 | -1) {
    const first = firstStepOfSection(si);
    if (isHorizontal(si)) return first + (this.lastSub[si] ?? 0);
    return dir > 0 ? first : first + sections[si].steps - 1;
  }

  /** Debug: freeze a transition at progress t (visual checkpoints of mid-move frames). */
  debugFreeze(to: number, t: number) {
    if (this.director.index !== to) {
      this.director.freezeAt = null;
      this.director.goTo(to);
    }
    this.director.freezeAt = t;
  }
}
