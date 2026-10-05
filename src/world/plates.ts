import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, ease } from '../core/math';

/** The world is nine precision plates. Everything else is how they are arranged and seen. */
export const PLATE = { W: 6.4, T: 0.16, D: 4.0, N: 9 } as const;
export const ACCENT = new THREE.Color('#ff5b24');

export interface PlatePose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
}

export interface Formation {
  group: { p: THREE.Vector3; q: THREE.Quaternion };
  plates: PlatePose[];
}

export const pose = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): PlatePose => ({
  p: new THREE.Vector3(x, y, z),
  q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
  s: new THREE.Vector3(sx, sy, sz),
});

export function cloneFormation(f: Formation): Formation {
  return {
    group: { p: f.group.p.clone(), q: f.group.q.clone() },
    plates: f.plates.map((pp) => ({ p: pp.p.clone(), q: pp.q.clone(), s: pp.s.clone() })),
  };
}

export type StaggerOrder = 'up' | 'down' | 'center' | 'none';

export type StripMode = 'long' | 'short';

export class Plates {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  /** Top-surface anchors (glyphs / lettering attach here). */
  readonly anchors: THREE.Object3D[] = [];
  /** Two light lines per plate: along the long front edge, or across the outer short edge. */
  private strips: Record<StripMode, THREE.Mesh[]> = { long: [], short: [] };
  private stripMats: Record<StripMode, THREE.MeshBasicMaterial[]> = { long: [], short: [] };
  private accent: Record<StripMode, Float32Array> = { long: new Float32Array(PLATE.N), short: new Float32Array(PLATE.N) };
  private accentTarget = new Float32Array(PLATE.N);
  private mode: StripMode = 'long';
  readonly material: THREE.MeshPhysicalMaterial;

  constructor(opts: { segments: number; brushed: THREE.Texture; shadows: boolean }) {
    const geo = new RoundedBoxGeometry(PLATE.W, PLATE.T, PLATE.D, opts.segments, 0.035);
    opts.brushed.repeat.set(1.6, 1.0);
    // Dark anodised metal under a thin lacquer: satin body, crisp reflections on top.
    this.material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#2a2c31'),
      metalness: 1.0,
      roughness: 0.38,
      roughnessMap: opts.brushed,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.0,
    });

    const longGeo = new THREE.BoxGeometry(PLATE.W * 0.97, 0.024, 0.012);
    const shortGeo = new THREE.BoxGeometry(0.012, 0.024, PLATE.D * 0.95);
    for (let i = 0; i < PLATE.N; i++) {
      const m = new THREE.Mesh(geo, this.material);
      m.castShadow = opts.shadows;
      m.receiveShadow = opts.shadows;
      const anchor = new THREE.Object3D();
      anchor.position.y = PLATE.T / 2;
      m.add(anchor);
      this.anchors.push(anchor);

      for (const mode of ['long', 'short'] as StripMode[]) {
        const sm = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
        const strip = new THREE.Mesh(mode === 'long' ? longGeo : shortGeo, sm);
        if (mode === 'long') strip.position.set(0, 0, PLATE.D / 2 + 0.003);
        else strip.position.set(PLATE.W / 2 + 0.003, 0, 0);
        strip.visible = false;
        strip.renderOrder = 2;
        m.add(strip);
        this.strips[mode].push(strip);
        this.stripMats[mode].push(sm);
      }

      this.group.add(m);
      this.meshes.push(m);
    }
  }

  setStripMode(mode: StripMode) {
    this.mode = mode;
  }

  /** Current transforms as a formation (used to start transitions from wherever we are). */
  snapshot(): Formation {
    return {
      group: { p: this.group.position.clone(), q: this.group.quaternion.clone() },
      plates: this.meshes.map((m) => ({ p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone() })),
    };
  }

  apply(f: Formation) {
    this.group.position.copy(f.group.p);
    this.group.quaternion.copy(f.group.q);
    f.plates.forEach((pp, i) => {
      const m = this.meshes[i];
      m.position.copy(pp.p);
      m.quaternion.copy(pp.q);
      m.scale.copy(pp.s);
    });
  }

  /**
   * Blend between formations. Plates cascade with a small stagger — the
   * structure reorganises as one gesture rather than nine identical tweens.
   */
  blend(a: Formation, b: Formation, t: number, stagger = 0.06, order: StaggerOrder = 'up') {
    const gt = ease.world(t);
    this.group.position.lerpVectors(a.group.p, b.group.p, gt);
    this.group.quaternion.slerpQuaternions(a.group.q, b.group.q, gt);
    const n = PLATE.N;
    const span = stagger * (n - 1);
    for (let i = 0; i < n; i++) {
      let k = i;
      if (order === 'down') k = n - 1 - i;
      else if (order === 'center') k = Math.abs(i - (n - 1) / 2) * 2;
      else if (order === 'none') k = 0;
      const local = order === 'none' ? gt : ease.world(clamp((t - (k / (n - 1)) * span) / (1 - span)));
      const m = this.meshes[i];
      const pa = a.plates[i];
      const pb = b.plates[i];
      m.position.lerpVectors(pa.p, pb.p, local);
      m.quaternion.slerpQuaternions(pa.q, pb.q, local);
      m.scale.lerpVectors(pa.s, pb.s, local);
    }
  }

  setAccent(values: ArrayLike<number>) {
    for (let i = 0; i < PLATE.N; i++) this.accentTarget[i] = values[i] ?? 0;
  }

  update(dt: number, time: number) {
    for (const mode of ['long', 'short'] as StripMode[]) {
      const acc = this.accent[mode];
      for (let i = 0; i < PLATE.N; i++) {
        const target = mode === this.mode ? this.accentTarget[i] : 0;
        acc[i] = damp(acc[i], target, mode === this.mode ? 3.2 : 7, dt);
        const a = acc[i];
        this.strips[mode][i].visible = a > 0.003;
        // a very slow breathing — the only "alive" signal on the structure
        this.stripMats[mode][i].opacity = a * (0.9 + 0.1 * Math.sin(time * 1.3 + i * 0.7));
      }
    }
  }
}
