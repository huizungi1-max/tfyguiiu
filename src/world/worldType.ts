import * as THREE from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { World } from './world';
import { PLATE } from './plates';
import { HERO, PLAN_TOP } from './compositions';
import { presence, type StageState, type StageSystem } from './director';
import type { Step } from '../nav/steps';
import { groups, terms, currentTermIndex } from '../content/content';
import { t as typo } from '../content/typo';

/**
 * Typography that lives inside the world (CSS3D). Crisp at any scale,
 * real fonts, driven by the same camera as the WebGL scene.
 *   back layer  — behind the plates (the plates occlude it)
 *   front layer — lettering laid onto plate surfaces
 */

type Vis = (s: Step) => number;

interface Item {
  obj: CSS3DObject;
  el: HTMLElement;
  vis: Vis;
  last: number;
}

const PX = 100; // CSS px per world unit

function make(html: string, cls: string): { obj: CSS3DObject; el: HTMLElement } {
  const el = document.createElement('div');
  el.className = `wt ${cls}`;
  el.innerHTML = html;
  el.style.opacity = '0';
  const obj = new CSS3DObject(el);
  obj.scale.setScalar(1 / PX);
  obj.visible = false;
  return { obj, el };
}

/** Orientation for lettering lying on a plate's top face: text along `x`, letter-tops toward `y`. */
function onPlate(x: THREE.Vector3, y: THREE.Vector3): THREE.Quaternion {
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const FLAT = onPlate(V(1, 0, 0), V(0, 0, -1));

export class WorldType implements StageSystem {
  private items: Item[] = [];
  private treadEls: HTMLElement[] = [];
  nameEl!: HTMLElement;

  constructor(private world: World) {
    this.buildName();
    this.buildTreads();
    this.buildPlan();
  }

  private add(obj: CSS3DObject, el: HTMLElement, vis: Vis) {
    this.items.push({ obj, el, vis, last: -1 });
  }

  /* — the name, standing behind the monolith ————————————————————————— */
  private nameObj!: CSS3DObject;
  private nameKey: number | null = null;

  private buildName() {
    const { obj, el } = make(
      `<span class="wt-name-inner">${'KAUSHAL'
        .split('')
        .map((c, i) => `<span class="wt-ch" style="--i:${i}">${c}</span>`)
        .join('')}</span>`,
      'wt-name',
    );
    obj.rotation.y = THREE.MathUtils.degToRad(HERO.az);
    this.nameObj = obj;
    this.nameEl = el;
    this.add(obj, el, (s) => (s.kind === 'origin' ? 1 : 0));
    this.layoutName();
    addEventListener('resize', () => this.layoutName());
  }

  /**
   * Wide screens: the name stands behind the monolith, square to the hero camera and set
   * back along its line of sight, offset so the monolith crosses the U|S joint.
   * Upright screens are too narrow for that: the name comes forward across the monolith.
   */
  private layoutName() {
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1 / 1.08;
    // upright: ~84% of the frame width at the name's depth (portrait hero: 22.5 away, 46° lens)
    const fs = portrait ? Math.min(285, Math.round(272 * aspect)) : 285;
    const key = portrait ? fs : -1;
    if (key === this.nameKey) return;
    this.nameKey = key;
    const obj = this.nameObj;
    const az = THREE.MathUtils.degToRad(HERO.az);
    const fwd = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    obj.removeFromParent();
    if (portrait) {
      this.nameEl.style.fontSize = `${fs}px`;
      obj.position.copy(HERO.p).addScaledVector(fwd, 1.4).add(new THREE.Vector3(0, 1.15, 0));
      this.world.frontScene.add(obj);
    } else {
      this.nameEl.style.fontSize = '';
      obj.position.copy(HERO.p).addScaledVector(fwd, -6.6).add(new THREE.Vector3(0, -0.15, 0)).addScaledVector(right, 1.05);
      this.world.backScene.add(obj);
    }
  }

  /* — term lettering on each tread ——————————————————————————————— */
  private buildTreads() {
    const now = currentTermIndex();
    terms.forEach((term, i) => {
      const { obj, el } = make(
        `<span class="wt-t-id">${term.id}</span><span class="wt-t-date">${typo(term.date)}${i === now ? '<b> · now</b>' : ''}</span>`,
        `wt-tread${i === now ? ' is-now' : ''}`,
      );
      obj.quaternion.copy(FLAT);
      obj.position.set(-PLATE.W / 2 + 1.25, PLATE.T / 2 + 0.004, 0.55);
      this.world.frontProxies[i].add(obj);
      this.treadEls.push(el);
      this.add(obj, el, (s) => {
        if (s.kind === 'roadmap') return 1;
        if (s.kind === 'build') return s.sub === i ? 0 : i > s.sub ? 0.42 : 0;
        return 0;
      });
    });
  }

  setSelectedTerm(i: number) {
    this.treadEls.forEach((el, k) => el.classList.toggle('is-sel', k === i));
  }

  /* — capability floor plan —————————————————————————————————————— */
  private buildPlan() {
    for (const g of groups) {
      const plate = PLAN_TOP[g.key];
      const cols = g.items.length > 12 ? 3 : 2;
      const tier = g.tier === 'core' ? 'Core' : g.tier === 'software' ? 'Supporting layer' : 'Support';
      const { obj, el } = make(
        `<div class="wt-grp-head"><span class="wt-grp-tier">${tier}</span><h4 class="wt-grp-name">${g.nameLines.map(typo).join('<br>')}</h4></div>
         <ul class="wt-grp-items" style="--cols:${cols}">${g.items.map((it) => `<li>${typo(it)}</li>`).join('')}</ul>
         ${g.note ? `<p class="wt-grp-note">${typo(g.note)}</p>` : ''}`,
        `wt-grp wt-grp-${g.tier} wt-grp-${g.key}`,
      );
      obj.quaternion.copy(FLAT);
      obj.position.set(0, PLATE.T / 2 + 0.004, 0);
      this.world.frontProxies[plate].add(obj);
      const core = g.tier === 'core';
      // the other tier stays faintly lettered as context — except on upright screens,
      // where it would sit behind the copy
      const dim = () => (document.documentElement.classList.contains('portrait') ? 0 : 0.14);
      this.add(obj, el, (s) => {
        if (s.kind !== 'stack') return 0;
        if (s.sub === 0) return core ? 1 : dim();
        return core ? dim() : 1;
      });
    }
  }

  update(s: StageState) {
    for (const it of this.items) {
      const a = it.vis(s.from);
      const b = it.vis(s.to);
      let o: number;
      if (s.t >= 1) o = b;
      else if (a === b) o = a;
      else {
        // fade out early, fade in late — lettering never smears across a move
        const out = presence(true, false, s.t, 0.28);
        const inn = presence(false, true, s.t, 0.28, 0.62, 0.98);
        o = a * out + b * inn;
      }
      const q = Math.round(o * 100) / 100;
      if (q !== it.last) {
        it.last = q;
        it.el.style.opacity = String(q);
        it.obj.visible = q > 0.001;
      }
    }
  }
}
