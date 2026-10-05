import * as THREE from 'three';
import type { World } from './world';
import type { Glyphs } from './glyphs';
import { PLATE } from './plates';
import { PLAN_TOP } from './compositions';
import { presence, type StageState, type StageSystem } from './director';
import type { Step } from '../nav/steps';
import { layers, joints, lanes } from '../content/content';
import { esc } from '../content/typo';

/**
 * Screen-aligned labels pinned to points in the world. They travel with the
 * structure during transitions but always read flat and crisp.
 */

interface Label {
  el: HTMLElement;
  at: (out: THREE.Vector3) => THREE.Vector3;
  vis: (s: Step) => number;
  last: number;
  x: number;
  y: number;
}

const tmp = new THREE.Vector3();

export class Labels implements StageSystem {
  private list: Label[] = [];
  private root = document.getElementById('labels') as HTMLElement;

  constructor(
    private world: World,
    glyphs: Glyphs,
  ) {
    const plates = world.plates.meshes;

    // 02 — the system stack: one label per layer, at each plate's front-right corner
    layers.forEach((layer, i) => {
      const core = layer.role === 'core';
      // Core layers: tag above a name that breaks at its slash, so the label stays compact.
      const el = this.el(
        core
          ? `<span class="lbl-rule"></span><span class="lbl-stack"><span class="lbl-tag">Core</span><span class="lbl-text">${esc(layer.name).replace(' / ', ' /<br>')}</span></span>`
          : `<span class="lbl-rule"></span><span class="lbl-text">${esc(layer.name)}</span>`,
        // two core layers sit side by side: on narrow screens one label rises, the other drops
        core ? `lbl-layer is-core ${layers[i + 1]?.role === 'core' ? 'lbl-down' : 'lbl-up'}` : 'lbl-layer',
      );
      const local = new THREE.Vector3(PLATE.W / 2 + 0.25, 0, PLATE.D / 2);
      this.add(el, (o) => plates[i].localToWorld(o.copy(local)), (s) => (s.kind === 'position' ? 1 : 0));
    });

    // 05 — joints between capability groups
    joints.forEach((j) => {
      const a = plates[PLAN_TOP[j.a]];
      const b = plates[PLAN_TOP[j.b]];
      const coreStep = j.a !== 'hardware' && j.b !== 'hardware';
      const el = this.el(`<span class="lbl-k">Joint</span><span class="lbl-text">${esc(j.via)}</span>`, 'lbl-joint');
      const pa = new THREE.Vector3();
      const pb = new THREE.Vector3();
      this.add(
        el,
        (o) => {
          a.getWorldPosition(pa);
          b.getWorldPosition(pb);
          o.lerpVectors(pa, pb, 0.5).setY(Math.max(pa.y, pb.y) + 0.12);
          // Side-by-side groups: the gap between them is narrow and full of type, so the
          // joint sits just below it, in the open row gap.
          if (Math.abs(pa.z - pb.z) < 0.5) o.z = Math.max(pa.z, pb.z) + PLATE.D / 2 + 0.55;
          // A centred group meeting a side group: sit toward the side group's column so the
          // two joints of one group never crowd each other.
          else if (Math.abs(pa.x - pb.x) > 0.5) o.x = pa.x + Math.sign(pb.x - pa.x) * Math.min(Math.abs(pb.x - pa.x), 3.0);
          return o;
        },
        (s) => (s.kind === 'stack' ? ((s.sub === 0) === coreStep ? 1 : 0) : 0),
      );
    });

    // 06 — lanes: one label at the far end of each opened plate
    const famName = { digital: 'Digital hardware', firmware: 'Firmware', board: 'Board' } as const;
    lanes.forEach((lane, j) => {
      const plate = plates[3 + j];
      const core = lane.name === 'FPGA / RTL' || lane.name === 'Embedded Firmware';
      const el = this.el(
        `<span class="lbl-rule"></span><span class="lbl-stack"><span class="lbl-fam">${esc(famName[lane.family])}</span><span class="lbl-text">${lane.name.length > 18 ? esc(lane.name).replace(' / ', ' /<br>') : esc(lane.name)}</span><span class="lbl-items">${lane.items.map(esc).join(' · ')}</span></span>`,
        core ? 'lbl-lane is-core' : 'lbl-lane',
      );
      const local = new THREE.Vector3(PLATE.W / 2 + 0.2, 0, PLATE.D / 2);
      this.add(el, (o) => plate.localToWorld(o.copy(local)), (s) => (s.kind === 'directions' ? 1 : 0));
    });
    {
      const el = this.el(
        `<span class="lbl-stack lbl-right"><span class="lbl-fam">Shared</span><span class="lbl-text">Foundation</span><span class="lbl-items">Broad systems base</span></span><span class="lbl-rule"></span>`,
        'lbl-found',
      );
      const local = new THREE.Vector3(-PLATE.W / 2 - 0.25, 0, PLATE.D / 2);
      this.add(el, (o) => plates[1].localToWorld(o.copy(local)), (s) => (s.kind === 'directions' ? 1 : 0));
    }

    // 04 — the flagship's seven disciplines
    glyphs.flagshipAnchors().forEach((a) => {
      const el = this.el(`<span class="lbl-rule"></span><span class="lbl-text">${esc(a.text)}</span>`, 'lbl-fig');
      this.add(el, (o) => a.obj.localToWorld(o.copy(a.local)), (s) => (s.kind === 'build' && s.sub === 7 ? 1 : 0));
    });
  }

  private el(html: string, cls: string) {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    el.innerHTML = `<div class="lbl-inner">${html}</div>`;
    this.root.appendChild(el);
    return el;
  }

  private add(el: HTMLElement, at: Label['at'], vis: Label['vis']) {
    this.list.push({ el, at, vis, last: -1, x: -1e5, y: -1e5 });
  }

  update(s: StageState) {
    const cam = this.world.rig.camera;
    const w = this.world.width;
    const h = this.world.height;
    for (const l of this.list) {
      const a = l.vis(s.from);
      const b = l.vis(s.to);
      let o: number;
      if (s.t >= 1 || a === b) o = s.t >= 1 ? b : a;
      else o = a * presence(true, false, s.t, 0.25) + b * presence(false, true, s.t, 0.25, 0.7, 1.0);
      if (o > 0.001) {
        l.at(tmp).project(cam);
        if (tmp.z > 1) o = 0;
        const x = Math.round(((tmp.x + 1) / 2) * w * 2) / 2;
        const y = Math.round(((1 - tmp.y) / 2) * h * 2) / 2;
        if (x !== l.x || y !== l.y) {
          l.x = x;
          l.y = y;
          l.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      }
      const q = Math.round(o * 100) / 100;
      if (q !== l.last) {
        l.last = q;
        l.el.style.opacity = String(q);
        l.el.style.visibility = q > 0.001 ? 'visible' : 'hidden';
      }
    }
  }
}
