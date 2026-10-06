import type { ChangeEvent, Director } from '../world/director';
import type { WorldType } from '../world/worldType';
import type { World } from '../world/world';
import type { Sound } from '../audio/sound';
import { steps, firstStepOfSection, isHorizontal, type Step } from '../nav/steps';
import type { Axis } from '../nav/input';
import { sections, projects, domains } from '../content/content';
import { fitDisplay } from './fit';

const pad = (n: number) => String(n).padStart(2, '0');
const E_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const E_IN = 'cubic-bezier(0.5, 0, 0.75, 0)';

type Scope = HTMLElement[];

/**
 * Typography choreography. Text leaves early and fast as the camera starts
 * to move; the next composition's type arrives as the camera settles.
 * Only transform/opacity are animated (compositor-friendly, Web Animations API).
 */
export class UI {
  private panels: HTMLElement[];
  private tokens = new WeakMap<HTMLElement, number>();
  private seq = 0;
  private menu = document.getElementById('menu') as HTMLElement;
  private menuOpen = false;
  private lastFocus: HTMLElement | null = null;
  private announce = document.querySelector('[data-announce]') as HTMLElement;
  private hintHidden = false;
  /** The parts currently on screen — refitted when the viewport or fonts change. */
  private live: Scope = [];
  /** Navigation by axis (set by the app, which owns the navigation rule). */
  onNav: (axis: Axis, dir: 1 | -1) => void = () => {};
  onTheme: (light: boolean) => void = () => {};

  constructor(
    private director: Director,
    _world: World,
    _type: WorldType,
    private sound: Sound,
  ) {
    this.panels = sections.map((s) => document.getElementById(s.id) as HTMLElement);
    this.panels.forEach((p) => {
      p.setAttribute('tabindex', '-1');
      p.inert = true;
      p.setAttribute('aria-hidden', 'true');
    });
    this.bind();
    director.onChange((e) => this.onChange(e));
    director.onSettle((s) => this.onSettle(s));
    const y = document.querySelector('[data-year]');
    if (y) y.textContent = String(new Date().getFullYear());
    let fitTimer = 0;
    const refit = () => {
      clearTimeout(fitTimer);
      fitTimer = window.setTimeout(() => fitDisplay(this.live), 90);
    };
    addEventListener('resize', refit);
    void document.fonts?.ready.then(refit);
  }

  get blocked() {
    return this.menuOpen;
  }

  /* ---------------------------------------------------------------------- */
  /* Scopes                                                                   */
  /* ---------------------------------------------------------------------- */

  /** The elements that belong to a step: a panel, or a sub-part of one. */
  private scopeFor(step: Step, whole: boolean): { root: HTMLElement; parts: Scope } {
    const panel = this.panels[step.section];
    if (step.kind === 'build') {
      const pj = panel.querySelector(`[data-project="${step.sub}"]`) as HTMLElement;
      const parts: Scope = [pj];
      if (whole) parts.unshift(panel.querySelector('.builds-head') as HTMLElement, panel.querySelector('.pnav') as HTMLElement);
      return { root: panel, parts };
    }
    // The orbit's cards live in the world: moving between them changes no page copy.
    if (step.kind === 'roadmap') return { root: panel, parts: whole ? [panel] : [] };
    if (step.kind === 'stack') {
      const sub = panel.querySelector(`[data-sub="${step.sub}"]`) as HTMLElement;
      return { root: panel, parts: [sub] };
    }
    return { root: panel, parts: [panel] };
  }

  private animEls(parts: Scope) {
    const lines: HTMLElement[] = [];
    const others: HTMLElement[] = [];
    for (const p of parts) {
      p.querySelectorAll<HTMLElement>('.ln-i').forEach((e) => lines.push(e));
      p.querySelectorAll<HTMLElement>('[data-a]').forEach((e) => others.push(e));
      if (p.matches('[data-a]')) others.push(p);
    }
    return { lines, others };
  }

  private enter(parts: Scope, delay: number, dir: 1 | -1, reduced: boolean) {
    if (!parts.length) return;
    fitDisplay(parts);
    this.live = parts;
    const { lines, others } = this.animEls(parts);
    const all = [...lines, ...others];
    all.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    if (reduced) {
      all.forEach((el) =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay, easing: 'ease-out', fill: 'both' }),
      );
      return;
    }
    const from = dir === 1 ? '108%' : '-108%';
    lines.forEach((el, i) => {
      el.animate(
        [
          { transform: `translate3d(0, ${from}, 0)`, opacity: 1 },
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
        ],
        { duration: 1150, delay: delay + i * 70, easing: E_OUT, fill: 'both' },
      );
    });
    const base = delay + Math.min(lines.length, 4) * 70 + 120;
    others.forEach((el, i) => {
      const rise = el.dataset.a === 'rise';
      el.animate(
        [
          { transform: rise ? `translate3d(0, ${dir === 1 ? 28 : -28}px, 0)` : 'none', opacity: 0 },
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
        ],
        { duration: rise ? 1100 : 900, delay: base + i * 70, easing: E_OUT, fill: 'both' },
      );
    });
  }

  private exit(parts: Scope, dir: 1 | -1, reduced: boolean): Promise<void> {
    const { lines, others } = this.animEls(parts);
    const anims: Animation[] = [];
    const all = [...lines, ...others];
    all.forEach((el) => el.getAnimations().forEach((a) => a.commitStyles?.()));
    all.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    if (reduced) {
      all.forEach((el) => anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'both' })));
    } else {
      const to = dir === 1 ? '-108%' : '108%';
      lines.forEach((el, i) =>
        anims.push(
          el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(0, ${to}, 0)` }], {
            duration: 520,
            delay: i * 28,
            easing: E_IN,
            fill: 'both',
          }),
        ),
      );
      others.forEach((el, i) =>
        anims.push(
          el.animate(
            [
              { transform: 'translate3d(0,0,0)', opacity: 1 },
              { transform: `translate3d(0, ${dir === 1 ? -18 : 18}px, 0)`, opacity: 0 },
            ],
            { duration: 380, delay: i * 22, easing: E_IN, fill: 'both' },
          ),
        ),
      );
    }
    return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
  }

  private show(panel: HTMLElement) {
    this.tokens.set(panel, ++this.seq);
    panel.classList.add('is-active');
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
  }

  private hideLater(panel: HTMLElement, p: Promise<void>) {
    const token = ++this.seq;
    this.tokens.set(panel, token);
    void p.then(() => {
      if (this.tokens.get(panel) !== token) return; // re-entered meanwhile
      panel.classList.remove('is-active');
      panel.inert = true;
      panel.setAttribute('aria-hidden', 'true');
    });
  }

  private showSub(el: HTMLElement) {
    this.tokens.set(el, ++this.seq);
    el.hidden = false;
  }

  private hideSubLater(el: HTMLElement, p: Promise<void>) {
    const token = ++this.seq;
    this.tokens.set(el, token);
    void p.then(() => {
      if (this.tokens.get(el) === token) el.hidden = true;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Step changes                                                             */
  /* ---------------------------------------------------------------------- */

  /** First appearance (after the intro move). */
  reveal(delay: number) {
    const s = this.director.step;
    const panel = this.panels[s.section];
    this.prepareSubs(s);
    this.show(panel);
    this.enter(this.scopeFor(s, true).parts, delay, 1, document.documentElement.classList.contains('reduced'));
    this.updateChrome(s);
  }

  private prepareSubs(s: Step) {
    const panel = this.panels[s.section];
    if (s.kind === 'build') panel.querySelectorAll<HTMLElement>('[data-project]').forEach((el) => (el.hidden = Number(el.dataset.project) !== s.sub));
    if (s.kind === 'stack') panel.querySelectorAll<HTMLElement>('[data-sub]').forEach((el) => (el.hidden = Number(el.dataset.sub) !== s.sub));
  }

  private onChange(e: ChangeEvent) {
    const { from, to, dir, reduced } = e;
    const sameSection = from.section === to.section && from.index !== to.index;
    const inDelay = e.instant ? 0 : reduced ? e.duration * 450 : Math.max(380, e.duration * 1000 * 0.4);

    if (sameSection) {
      const a = this.scopeFor(from, false).parts;
      const b = this.scopeFor(to, false).parts;
      a.forEach((el) => {
        if (el !== this.panels[from.section]) this.hideSubLater(el, this.exit([el], dir, reduced));
      });
      b.forEach((el) => {
        if (el !== this.panels[to.section]) this.showSub(el);
      });
      this.enter(b, inDelay, dir, reduced);
    } else if (from.index !== to.index) {
      const fromPanel = this.panels[from.section];
      const toPanel = this.panels[to.section];
      const focusInside = fromPanel.contains(document.activeElement);
      this.hideLater(fromPanel, this.exit(this.scopeFor(from, true).parts, dir, reduced));
      this.prepareSubs(to);
      this.show(toPanel);
      this.enter(this.scopeFor(to, true).parts, inDelay, dir, reduced);
      if (focusInside) toPanel.focus({ preventScroll: true });
    }

    if (sameSection && isHorizontal(to.section)) document.documentElement.classList.add('has-swiped');
    if (!e.instant && from.index !== to.index) this.sound.whoosh(e.duration, sameSection ? 0.7 : 1);
    if (from.index !== to.index && !this.hintHidden) {
      this.hintHidden = true;
      document.documentElement.classList.add('has-moved');
    }
    this.updateChrome(to);
    this.say(to);
    const hash = to.index === 0 ? location.pathname + location.search : `#${to.hash}`;
    history.replaceState(null, '', hash);
  }

  private onSettle(s: Step) {
    if (s.kind === 'build') this.sound.tick(1 + s.sub * 0.03);
    else if (s.kind === 'contact' || s.kind === 'origin') this.sound.thump();
  }

  private updateChrome(s: Step) {
    const sec = sections[s.section];
    const cur = document.querySelector('[data-ind-cur]');
    const lab = document.querySelector('[data-ind-label]');
    if (cur) cur.textContent = pad(s.section + 1);
    if (lab) lab.textContent = sec.horizontal ? `${sec.label} ${pad(s.sub + 1)}` : sec.label;
    document.querySelectorAll<HTMLElement>('.rail-btn').forEach((b) => {
      if (Number(b.dataset.gotoSection) === s.section) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    document.querySelectorAll<HTMLElement>('.menu-btn').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.gotoSection) === s.section)));
    document.querySelectorAll<HTMLElement>('.pidx-btn').forEach((b) => {
      const i = Number(b.dataset.gotoProject);
      b.setAttribute('aria-current', String(s.kind === 'build' && i === s.sub));
      b.classList.toggle('is-past', s.kind === 'build' && i < s.sub);
    });
    document.querySelectorAll<HTMLElement>('.dom-btn').forEach((b) => b.setAttribute('aria-current', String(s.kind === 'roadmap' && Number(b.dataset.gotoDomain) === s.sub)));
    // sideways navigator: position, active name, ends
    document.querySelectorAll<HTMLElement>('[data-hnav]').forEach((nav) => {
      const mine = nav.dataset.hnav === sec.id;
      if (!mine) return;
      const cur = nav.querySelector('[data-hnav-cur]');
      const name = nav.querySelector('[data-hnav-name]');
      if (cur) cur.textContent = pad(s.sub + 1);
      if (name) name.textContent = s.kind === 'build' ? projects[s.sub].title : domains[s.sub].name;
      const wraps = sec.id === 'domains';
      nav.querySelector<HTMLButtonElement>('[data-hstep="-1"]')!.disabled = !wraps && s.sub === 0;
      nav.querySelector<HTMLButtonElement>('[data-hstep="1"]')!.disabled = !wraps && s.sub === sec.steps - 1;
    });
    // next affordance names the destination of the next gesture
    const wrap = document.querySelector('[data-next-wrap]') as HTMLElement;
    const label = document.querySelector('[data-next-label]') as HTMLElement;
    const k = document.querySelector('[data-next-k]') as HTMLElement;
    // Horizontal sections: "next" is always the next page — sideways has its own controls.
    const next = isHorizontal(s.section) ? steps[firstStepOfSection(s.section + 1)] : steps[s.index + 1];
    if (!next) {
      wrap.classList.add('is-end');
      label.textContent = 'Origin';
      k.textContent = 'Return';
    } else {
      wrap.classList.remove('is-end');
      k.textContent = 'Next';
      if (next.section === s.section && next.kind === 'stack') label.textContent = 'Support';
      else label.textContent = sections[next.section].label;
    }
    document.documentElement.dataset.step = s.kind;
  }

  private say(s: Step) {
    const sec = sections[s.section];
    let t = `Section ${s.section + 1} of ${sections.length}: ${sec.label}.`;
    if (s.kind === 'build') t += ` Project ${projects[s.sub].n} of ${projects.length}: ${projects[s.sub].title}.`;
    if (s.kind === 'roadmap') t += ` ${domains[s.sub].name}: ${domains[s.sub].skills.join(', ')}.`;
    if (s.kind === 'stack') t += s.sub === 0 ? ' Core.' : ' Support.';
    this.announce.textContent = t;
  }

  /* ---------------------------------------------------------------------- */
  /* Controls                                                                  */
  /* ---------------------------------------------------------------------- */

  private bind() {
    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const el = t.closest<HTMLElement>('[data-goto-step],[data-goto-section],[data-goto-project],[data-goto-domain],[data-hstep],[data-next],[data-copy],[data-sound],[data-menu-open],[data-menu-close],[data-theme-toggle]');
      if (!el) {
        if (this.menuOpen && t === this.menu) this.closeMenu();
        return;
      }
      if (el.dataset.gotoStep !== undefined) {
        this.closeMenu(false);
        this.director.goTo(Number(el.dataset.gotoStep));
      } else if (el.dataset.gotoSection !== undefined) {
        this.closeMenu(false);
        this.director.goTo(firstStepOfSection(Number(el.dataset.gotoSection)));
      } else if (el.dataset.gotoProject !== undefined) {
        this.director.goTo(firstStepOfSection(3) + Number(el.dataset.gotoProject));
      } else if (el.dataset.gotoDomain !== undefined) {
        this.director.goTo(firstStepOfSection(2) + Number(el.dataset.gotoDomain));
      } else if (el.dataset.hstep !== undefined) {
        this.onNav('x', Number(el.dataset.hstep) < 0 ? -1 : 1);
      } else if (el.dataset.next !== undefined) {
        if (this.director.index >= steps.length - 1) this.director.goTo(0);
        else this.onNav('y', 1);
      } else if (el.dataset.copy !== undefined) {
        void this.copy(el);
      } else if (el.dataset.sound !== undefined) {
        const on = this.sound.toggle();
        el.setAttribute('aria-pressed', String(on));
        const l = el.querySelector('[data-sound-label]');
        if (l) l.textContent = on ? 'Sound on' : 'Sound off';
      } else if (el.dataset.themeToggle !== undefined) {
        this.onTheme(document.documentElement.dataset.theme !== 'light');
      } else if (el.dataset.menuOpen !== undefined) {
        this.openMenu();
      } else if (el.dataset.menuClose !== undefined) {
        this.closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this.menuOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeMenu();
      } else if (e.key === 'Tab') {
        const f = Array.from(this.menu.querySelectorAll<HTMLElement>('button'));
        const i = f.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i >= f.length - 1 ? 0 : i + 1;
        f[n].focus();
      }
    });
  }

  private openMenu() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    this.lastFocus = document.activeElement as HTMLElement;
    this.menu.hidden = false;
    document.querySelector('[data-menu-open]')?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => this.menu.classList.add('is-open'));
    const cur = this.menu.querySelector<HTMLElement>('.menu-btn[aria-current="true"]') ?? this.menu.querySelector<HTMLElement>('.menu-btn');
    cur?.focus({ preventScroll: true });
  }

  private closeMenu(restore = true) {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menu.classList.remove('is-open');
    document.querySelector('[data-menu-open]')?.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!this.menuOpen) this.menu.hidden = true;
    }, 450);
    if (restore) this.lastFocus?.focus({ preventScroll: true });
  }

  private async copy(el: HTMLElement) {
    const text = el.dataset.copy ?? '';
    try {
      await navigator.clipboard.writeText(text);
      el.textContent = 'Copied';
    } catch {
      el.textContent = 'Select & copy';
    }
    window.setTimeout(() => (el.textContent = 'Copy'), 1800);
  }
}
