import '@fontsource-variable/archivo/wdth.css';
import './sheet.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Eagle } from '../world/eagle';
import { Glow } from '../world/glow';
import type { World } from '../world/world';

/**
 * Eagle reference sheet: the site's own hero eagle (same model, shader, orange rim and glide
 * pose) shown from the 14 views of the reference board. Nothing in the hero is changed — the
 * sheet builds its own Eagle instances, poses them through the same flight code held at the
 * hold point, and lifts them out of the camera onto a turntable.
 */

/** The Eagle internals the sheet drives (TypeScript-private, so reached through a cast). */
interface Inside {
  root: THREE.Group;
  bank: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  uniforms: { uPass: { value: number }; uPx: { value: number }; uEnc: { value: number } };
  pose: { roll: number };
  beat: number | null;
  u: number;
  phase: number;
  fly(dt: number, time: number, speed: number, still: boolean): void;
}

const V3 = THREE.Vector3;
const PI = Math.PI;
const HOLD = 0.45;
const HOLD_ROLL = 0.36; // cancels the path's bank at the hold: the sheet shows the bird level

// ---------------- Renderer + eagles ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
const glow = new Glow(renderer);

const scene = new THREE.Scene();
const stubCam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
const stub = {
  q: { tier: 'low' }, // no per-eagle glow: the sheet runs one Glow for every bird in a panel
  renderer,
  post: [] as (() => void)[],
  rig: { camera: stubCam },
  scene: new THREE.Scene(),
  plates: { setVisibility() {} },
} as unknown as World;

const eagles: Inside[] = Array.from({ length: 9 }, () => {
  const e = new Eagle(stub) as unknown as Inside;
  scene.add(e.root); // out of the (stub) camera, into world space
  e.uniforms.uEnc.value = glow.encode;
  return e;
});

/** Pose through the hero's own flight code at the hold, then place the bird on the turntable. */
function pose(e: Inside, beat: number, phase: number, at?: { pos?: THREE.Vector3; quat?: THREE.Quaternion; scale?: number }) {
  e.u = HOLD;
  e.beat = beat;
  e.phase = phase;
  e.pose.roll = HOLD_ROLL;
  e.fly(0, 0, 0, false);
  e.bank.rotation.z = 0;
  e.root.position.copy(at?.pos ?? new V3());
  e.root.quaternion.copy(at?.quat ?? new THREE.Quaternion());
  e.root.scale.setScalar(at?.scale ?? 1);
  e.root.visible = true;
}

// ---------------- Panels ----------------
type Cam = { az: number; el: number; d: number; fov?: number; top?: 1 | -1; focus?: 'head' | 'feet'; target?: [number, number, number] };
interface Panel { n: string; title: string; sub: string; wide?: boolean; kind?: 'frames' | 'path'; cam?: Cam; beat?: number; phase?: number; rot?: [number, number, number] }

const UP = PI / 2; // phase at the top of the stroke
const PANELS: Panel[] = [
  { n: '01', title: 'FRONT VIEW', sub: 'Wings spread, facing forward', cam: { az: 0, el: 0.08, d: 3.2, target: [0, 0.32, 0] }, beat: 0 },
  { n: '02', title: 'BACK VIEW', sub: 'Wings spread, back side', cam: { az: PI, el: 0.3, d: 3.3, target: [0, 0.15, 0] }, beat: 0 },
  { n: '03', title: 'LEFT SIDE VIEW', sub: 'Side profile, flying', cam: { az: -1.25, el: 0.2, d: 3.3, target: [0, 0.25, 0] }, beat: 1, phase: UP },
  { n: '04', title: 'RIGHT SIDE VIEW', sub: 'Side profile, flying', cam: { az: 1.25, el: 0.2, d: 3.3, target: [0, 0.25, 0] }, beat: 1, phase: UP },
  { n: '05', title: 'TOP VIEW', sub: 'From above', cam: { az: 0, el: 0, d: 3.6, top: 1 }, beat: 0 },
  { n: '06', title: 'BOTTOM VIEW', sub: 'From below', cam: { az: 0, el: 0, d: 3.6, top: -1 }, beat: 0 },
  { n: '07', title: 'FRONT-LEFT ANGLE', sub: 'Diagonal front view', cam: { az: 0.85, el: 0.12, d: 3.3, target: [0, 0.18, 0] }, beat: 1, phase: UP - 0.5 },
  { n: '08', title: 'FRONT-RIGHT ANGLE', sub: 'Diagonal front view', cam: { az: -0.85, el: 0.12, d: 3.3, target: [0, 0.18, 0] }, beat: 1, phase: UP - 0.5 },
  { n: '09', title: 'BACK-LEFT ANGLE', sub: 'Diagonal back view', cam: { az: -2.3, el: 0.34, d: 3.3 }, beat: 0 },
  { n: '10', title: 'BACK-RIGHT ANGLE', sub: 'Diagonal back view', cam: { az: 2.3, el: 0.34, d: 3.3 }, beat: 0 },
  { n: '11', title: 'HEAD CLOSE-UP', sub: 'Detailed head view', cam: { az: -1.2, el: 0.08, d: 0.85, fov: 30, focus: 'head' }, beat: 0 },
  { n: '12', title: 'TALON CLOSE-UP', sub: 'Claw detail', cam: { az: 0.5, el: -0.05, d: 0.6, fov: 32, focus: 'feet' }, beat: 0 },
  { n: '13', title: 'WING ANIMATION FRAMES', sub: 'Wing flap sequence (left to right)', wide: true, kind: 'frames' },
  { n: '14', title: 'FLIGHT PATH EXAMPLE', sub: 'Top-right entrance to bottom-left exit', wide: true, kind: 'path' },
];

const path = new THREE.CatmullRomCurve3([
  new V3(11, 3.6, -7), new V3(6, 2.3, -4), new V3(1.5, 1.0, -1.5), new V3(-2.8, -0.4, 0.9), new V3(-7, -1.6, 2.6),
]);
const pathLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(path.getPoints(200)),
  new THREE.LineBasicMaterial({ color: 0xff6418, transparent: true, opacity: 0.28 }),
);
scene.add(pathLine);
const PATH_U = [0.82, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
const PATH_PH = [1.25, 0.2, 2.5, 4.1, 5.3, 0.9, 3.2];
const FLAP = PI * 2 * 0.9; // rad/s while animating

function stage(p: Panel, t: number, anim: boolean) {
  eagles.forEach((e) => (e.root.visible = false));
  pathLine.visible = p.kind === 'path';
  if (p.kind === 'frames') {
    eagles.forEach((e, i) => {
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 1.12, 0, 'YXZ'));
      pose(e, 1, -UP + (i * 2 * PI) / 9 + (anim ? t * FLAP : 0), { pos: new V3((i - 4) * 1.15, 0, 0), quat, scale: 0.8 });
    });
  } else if (p.kind === 'path') {
    PATH_U.forEach((u0, i) => {
      const u = anim ? (u0 + t * 0.05) % 1 : u0;
      const pos = path.getPointAt(u);
      const o = new THREE.Object3D();
      o.position.copy(pos);
      o.lookAt(pos.clone().add(path.getTangentAt(u)));
      o.rotateZ(0.22);
      pose(eagles[i], 1, PATH_PH[i] + (anim ? t * FLAP : 0), { pos, quat: o.quaternion, scale: 1.55 });
    });
  } else {
    const beat = anim ? 1 : (p.beat ?? 0);
    const phase = anim ? t * FLAP + Number(p.n) : (p.phase ?? 0);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]), 'YXZ'));
    pose(eagles[0], beat, phase, { quat });
  }
}

function camera(p: Panel, aspect: number): THREE.Camera & { userData: { target?: THREE.Vector3 } } {
  if (p.kind === 'frames') {
    const h = 3.7;
    const c = new THREE.OrthographicCamera((-h * aspect) / 2, (h * aspect) / 2, h / 2, -h / 2, 0.1, 100);
    c.position.set(0, 0.9, 12);
    c.lookAt(0, 0.05, 0);
    return c;
  }
  if (p.kind === 'path') {
    const c = new THREE.PerspectiveCamera(38, aspect, 0.1, 200);
    c.position.set(0, 0, 10);
    c.lookAt(0, 0, 0);
    c.userData.target = new V3();
    return c;
  }
  const k = p.cam!;
  const c = new THREE.PerspectiveCamera(k.fov ?? 34, aspect, 0.02, 100);
  const e = eagles[0];
  e.root.updateMatrixWorld(true);
  let target = new V3(...(k.target ?? [0, 0, 0]));
  if (k.focus === 'head') target = e.head.getWorldPosition(new V3()).add(new V3(0, -0.01, 0.05));
  if (k.focus === 'feet') {
    target = e.legs.reduce((a, l) => a.add(l.getWorldPosition(new V3())), new V3()).multiplyScalar(1 / e.legs.length);
    target.y -= 0.08;
    target.z += 0.04;
  }
  if (k.top) {
    c.up.set(0, 0, 1);
    c.position.set(0, k.d * k.top, 0.001);
  } else {
    c.position.set(
      target.x + k.d * Math.cos(k.el) * Math.sin(k.az),
      target.y + k.d * Math.sin(k.el),
      target.z + k.d * Math.cos(k.el) * Math.cos(k.az),
    );
  }
  c.lookAt(target);
  c.userData.target = target;
  return c;
}

/** Main pass + the hero's selective orange glow, for every eagle in the panel. */
function draw(cam: THREE.Camera, w: number, h: number) {
  renderer.setSize(w, h, false);
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(scene, cam);
  const line = pathLine.visible;
  glow.render(scene, cam, (on) => {
    pathLine.visible = on ? false : line; // only the birds bloom
    for (const e of eagles) {
      e.uniforms.uPass.value = on ? 1 : 0;
      e.uniforms.uPx.value = 1;
    }
  });
  return renderer.domElement;
}

// ---------------- Backdrop ----------------
function seeded(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoke = (() => {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 683;
  const x = c.getContext('2d')!;
  x.fillStyle = '#060606';
  x.fillRect(0, 0, c.width, c.height);
  const r = seeded(3);
  for (let i = 0; i < 140; i++) {
    const px = r() * c.width, py = r() * c.height, rad = 60 + r() * 260, a = 0.035 * r();
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(72,62,56,${a})`);
    g.addColorStop(1, 'rgba(72,62,56,0)');
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  return c;
})();
function compose(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, w: number, h: number) {
  ctx.drawImage(smoke, 0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------------- DOM ----------------
const sheet = document.getElementById('sheet')!;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const cells = PANELS.map((p, i) => {
  const el = document.createElement('div');
  el.className = 'panel' + (p.wide ? ' wide' : '');
  el.innerHTML = `<canvas></canvas>${i === 0 ? '<div class="brand"><b>EAGLE</b><span><i></i>8K ULTRA REALISTIC REFERENCE</span></div>' : ''}
    <div class="label"><b>${p.n}.&nbsp; ${p.title}</b><span><i></i>${p.sub}</span></div>`;
  el.addEventListener('click', () => openModal(p));
  sheet.appendChild(el);
  return { p, el, cv: el.querySelector('canvas')! };
});

function renderSheet(t: number, anim: boolean) {
  for (const c of cells) {
    const r = c.el.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width * DPR));
    const h = Math.max(2, Math.round(r.height * DPR));
    if (c.cv.width !== w || c.cv.height !== h) {
      c.cv.width = w;
      c.cv.height = h;
    }
    stage(c.p, t, anim);
    compose(c.cv.getContext('2d')!, draw(camera(c.p, w / h), w, h), w, h);
  }
}

// ---------------- Modal: orbit any panel ----------------
const mEl = document.getElementById('modal')!;
const mCv = document.getElementById('mcv') as HTMLCanvasElement;
const modal: { open: boolean; p: Panel | null; cam: THREE.PerspectiveCamera | null; ctl: OrbitControls | null; anim: boolean } = {
  open: false, p: null, cam: null, ctl: null, anim: true,
};
document.getElementById('mclose')!.onclick = () => {
  mEl.classList.remove('on');
  modal.open = false;
  dirty = true;
};
document.getElementById('manim')!.onclick = (e) => {
  modal.anim = !modal.anim;
  (e.target as HTMLElement).textContent = modal.anim ? '❚❚ Pause flap' : '▶ Flap';
};
function modalSize() {
  const r = mCv.getBoundingClientRect();
  return [Math.max(2, Math.round(r.width * DPR)), Math.max(2, Math.round(r.height * DPR))];
}
function openModal(p: Panel) {
  modal.p = p;
  modal.open = true;
  mEl.classList.add('on');
  document.getElementById('mtitle')!.textContent = `${p.n}. ${p.title}`;
  const [w, h] = modalSize();
  stage(p, 0, false);
  const c = camera(p, w / h);
  let cam: THREE.PerspectiveCamera;
  let target = c.userData.target ?? new V3();
  if (c instanceof THREE.PerspectiveCamera) cam = c;
  else {
    cam = new THREE.PerspectiveCamera(36, w / h, 0.1, 200);
    cam.position.set(0, 1.2, 15);
    target = new V3();
    cam.lookAt(target);
  }
  modal.cam = cam;
  modal.ctl?.dispose();
  modal.ctl = new OrbitControls(cam, mCv);
  modal.ctl.target.copy(target);
  modal.ctl.enableDamping = true;
  modal.ctl.update();
}
function renderModal(t: number) {
  const [w, h] = modalSize();
  if (mCv.width !== w || mCv.height !== h) {
    mCv.width = w;
    mCv.height = h;
  }
  modal.cam!.aspect = w / h;
  modal.cam!.updateProjectionMatrix();
  stage(modal.p!, t, modal.anim);
  modal.ctl!.update();
  compose(mCv.getContext('2d')!, draw(modal.cam!, w, h), w, h);
}

// ---------------- Loop ----------------
let animating = false;
let dirty = true;
const t0 = performance.now();
const btn = document.getElementById('anim')!;
btn.onclick = () => {
  animating = !animating;
  btn.textContent = animating ? '❚❚ Pause' : '▶ Animate';
  dirty = true;
};
addEventListener('resize', () => (dirty = true));
function loop() {
  const t = (performance.now() - t0) / 1000;
  if (modal.open) renderModal(t);
  else if (animating || dirty) {
    renderSheet(t, animating);
    dirty = false;
    document.documentElement.dataset.ready = '1';
  }
  requestAnimationFrame(loop);
}

// ---------------- Export PNG ----------------
document.getElementById('export')!.onclick = () => {
  const sr = sheet.getBoundingClientRect();
  const S = 2;
  const out = document.createElement('canvas');
  out.width = sr.width * S;
  out.height = sr.height * S;
  const x = out.getContext('2d')!;
  x.fillStyle = '#3a3a3a';
  x.fillRect(0, 0, out.width, out.height);
  for (const c of cells) {
    const r = c.el.getBoundingClientRect();
    const px = (r.left - sr.left) * S, py = (r.top - sr.top) * S, w = r.width * S, h = r.height * S;
    x.drawImage(c.cv, px, py, w, h);
    const fs = h * 0.052;
    const lx = px + w * (c.p.wide ? 0.025 : 0.05);
    x.fillStyle = '#fff';
    x.font = `700 ${fs}px "Archivo Variable", Arial`;
    x.fillText(`${c.p.n}.  ${c.p.title}`, lx, py + h * 0.86);
    x.fillStyle = '#ff6418';
    x.fillRect(lx, py + h * 0.905, fs * 1.6, fs * 0.3);
    x.fillStyle = '#bbb';
    x.font = `400 ${fs * 0.82}px "Archivo Variable", Arial`;
    x.fillText(c.p.sub, lx + fs * 2.1, py + h * 0.93);
    if (c.p.n === '01') {
      x.fillStyle = '#fff';
      x.font = `800 ${h * 0.11}px "Archivo Variable", Arial`;
      x.fillText('EAGLE', px + w * 0.05, py + h * 0.16);
      x.fillStyle = '#ff6418';
      x.fillRect(px + w * 0.05, py + h * 0.2, fs * 2.4, fs * 0.55);
      x.fillStyle = '#bbb';
      x.font = `600 ${fs * 0.75}px "Archivo Variable", Arial`;
      x.fillText('8K ULTRA REALISTIC REFERENCE', px + w * 0.05 + fs * 3, py + h * 0.235);
    }
  }
  const a = document.createElement('a');
  a.download = 'eagle-reference-sheet.png';
  a.href = out.toDataURL('image/png');
  a.click();
};

loop();
