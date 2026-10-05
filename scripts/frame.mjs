// Framing solver — measures how a step's composition sits in the frame without rendering screenshots.
// Sweeps camera parameters around the composed shot and scores each candidate:
//   size    — projected area of the plates' silhouettes (fraction of frame)
//   out     — fraction of that area outside the safe frame
//   hit     — fraction of the frame where plates cover live text (padded)
//
//   node scripts/frame.mjs --step 2 --vp 1440x900 --grid "az=0:30:4,el=26:40:3,dist=48:66:3,sx=0.3:0.6:0.05" --top 10
//   options: --plates 0-8 (which plates must fit)  --safe 0.02,0.08,0.03,0.05 (l,t,r,b)  --pad 14
import { chromium } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];

const step = Number(opt.step ?? 2);
const [W, H] = String(opt.vp || '1440x900').split('x').map(Number);
const top = Number(opt.top || 10);
const pad = Number(opt.pad || 14);
const safe = String(opt.safe || '0.02,0.08,0.03,0.05').split(',').map(Number);
const list = (arg, dflt) => {
  const a = String(arg ?? dflt);
  if (a === 'none' || a === '') return [];
  return a.split(',').flatMap((p) => {
    if (!p.includes('-')) return [Number(p)];
    const [x, y] = p.split('-').map(Number);
    return Array.from({ length: y - x + 1 }, (_, k) => x + k);
  });
};
// plates that must sit inside the safe frame; plates that must stay off text (may leave frame)
const required = list(opt.plates, '0-8');
const avoid = list(opt.avoid, 'none');
// --glyph i: build glyph i must be in frame and off text. --strip i: plate i's long front edge must stay off text.
const glyph = opt.glyph !== undefined ? Number(opt.glyph) : -1;
const strip = opt.strip !== undefined ? Number(opt.strip) : -1;

const KEYS = ['az', 'el', 'dist', 'fov', 'sx', 'sy', 'dx', 'dy', 'dz'];
const REL = ['daz', 'del', 'kdist']; // offsets from the composed shot (deg, deg, ×dist)
const axes = {};
for (const part of String(opt.grid || '').split(',').filter(Boolean)) {
  const [k, r] = part.split('=');
  if (!KEYS.includes(k) && !REL.includes(k)) throw new Error(`unknown axis ${k}`);
  const [a, b, s] = r.split(':').map(Number);
  const vals = [];
  if (s === undefined || Number.isNaN(b)) vals.push(a);
  else for (let v = a; v <= b + 1e-9; v += s) vals.push(Math.round(v * 1000) / 1000);
  axes[k] = vals;
}
const cands = [{}];
for (const [k, vals] of Object.entries(axes)) {
  const next = [];
  for (const c of cands) for (const v of vals) next.push({ ...c, [k]: v });
  cands.splice(0, cands.length, ...next);
}

const server = await createServer({ server: { port: 5181, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = W < 760;
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })).newPage();
await page.goto(`${base}?step=${step}&nointro&q=low&fixeddpr`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(Number(opt.wait || 3200));
if (opt.live) {
  page.on('console', (m) => m.text().startsWith('LIVE') && console.log(m.text()));
  await page.evaluate(() => (window.__frameLive = true));
}

const res = await page.evaluate(
  ({ cands, required, avoid, glyph, strip, safe, pad, nochrome, union }) => {
    const app = window.__app;
    const W = innerWidth;
    const H = innerHeight;
    const shot0 = app.director.target.shot;
    const V3 = app.world.rig.camera.position.constructor;
    const deg = Math.PI / 180;

    // live text boxes (padded)
    const rects = [];
    const pushRect = (r, t) => r.width > 2 && r.height > 2 && rects.push({ x0: r.left - pad, y0: r.top - pad, x1: r.right + pad, y1: r.bottom + pad, t });
    const visible = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (e.classList?.contains('sr-only')) return false;
        const cs = getComputedStyle(e);
        if (cs.clip && cs.clip !== 'auto' && /rect\(0px,? 0px,? 0px,? 0px\)/.test(cs.clip)) return false;
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || e.hidden) return false;
      }
      return true;
    };
    const scopes = [...document.querySelectorAll(nochrome ? '.panel.is-active' : '.panel.is-active, .chrome, .rail')];
    for (const sc of scopes) {
      sc.querySelectorAll('*').forEach((el) => {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (own && visible(el)) {
          const range = document.createRange();
          range.selectNodeContents(el);
          for (const r of range.getClientRects()) pushRect(r, (el.textContent || '').trim().slice(0, 24));
        }
      });
    }

    // plate corners in world space
    const meshes = app.world.plates.meshes;
    const corners = meshes.map((m) => {
      m.updateMatrixWorld(true);
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      const out = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new V3(x, y, z).applyMatrix4(m.matrixWorld));
      return out;
    });

    // glyph: world-space box of its solid parts (flat shadow discs and sprites excluded)
    let glyphCorners = null;
    if (glyph >= 0) {
      const Box3 = meshes[0].geometry.boundingBox.constructor;
      const g = app.glyphs.list[glyph].group;
      g.updateMatrixWorld(true);
      const box = new Box3();
      g.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (bb.max.y - bb.min.y < 0.012) return;
        box.union(bb);
      });
      glyphCorners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) glyphCorners.push(new V3(x, y, z));
    }
    // accent strip: the long front edge of a plate, sampled
    let stripPts = null;
    if (strip >= 0) {
      const m = meshes[strip];
      const b = m.geometry.boundingBox;
      stripPts = [];
      for (let k = 0; k <= 40; k++) stripPts.push(new V3(b.min.x + ((b.max.x - b.min.x) * k) / 40, 0, b.max.z).applyMatrix4(m.matrixWorld));
    }

    const hull = (pts) => {
      pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [];
      for (const p of pts) {
        while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
        lo.push(p);
      }
      const up = [];
      for (const p of pts.slice().reverse()) {
        while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
        up.push(p);
      }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    };
    const area = (poly) => {
      let s = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s) / 2;
    };
    const clip = (poly, r) => {
      const edges = [
        (p) => p[0] >= r.x0, (p) => p[0] <= r.x1, (p) => p[1] >= r.y0, (p) => p[1] <= r.y1,
      ];
      const cut = [
        (a, b) => [r.x0, a[1] + ((b[1] - a[1]) * (r.x0 - a[0])) / (b[0] - a[0])],
        (a, b) => [r.x1, a[1] + ((b[1] - a[1]) * (r.x1 - a[0])) / (b[0] - a[0])],
        (a, b) => [a[0] + ((b[0] - a[0]) * (r.y0 - a[1])) / (b[1] - a[1]), r.y0],
        (a, b) => [a[0] + ((b[0] - a[0]) * (r.y1 - a[1])) / (b[1] - a[1]), r.y1],
      ];
      let out = poly;
      for (let e = 0; e < 4 && out.length; e++) {
        const inp = out;
        out = [];
        for (let i = 0; i < inp.length; i++) {
          const a = inp[i];
          const b = inp[(i + 1) % inp.length];
          const ia = edges[e](a);
          const ib = edges[e](b);
          if (ia) out.push(a);
          if (ia !== ib) out.push(cut[e](a, b));
        }
      }
      return out;
    };

    const safeR = { x0: safe[0] * W, y0: safe[1] * H, x1: W - safe[2] * W, y1: H - safe[3] * H };
    const cam = app.world.rig.camera.clone();
    if (window.__frameLive) {
      // diagnostic: report the live camera's view of the required plates
      const live = app.world.rig.camera;
      live.updateMatrixWorld(true);
      const out = required.map((i) => {
        const pts = corners[i].map((v) => {
          const p = v.clone().project(live);
          return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H];
        });
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        return [Math.min(...xs) / W, Math.min(...ys) / H, Math.max(...xs) / W, Math.max(...ys) / H].map((v) => Math.round(v * 100)).join(',');
      });
      console.log('LIVE', out.join('  '), 'fov', live.fov, 'aspect', live.aspect.toFixed(3), 'view', JSON.stringify(live.view));
    }
    const results = [];
    for (const c of cands) {
      const s = {
        az: c.az !== undefined ? c.az * deg : shot0.az + (c.daz || 0) * deg,
        el: c.el !== undefined ? c.el * deg : shot0.el + (c.del || 0) * deg,
        dist: c.dist ?? shot0.dist * (c.kdist ?? 1),
        fov: c.fov ?? shot0.fov,
        sx: c.sx ?? shot0.sx,
        sy: c.sy ?? shot0.sy,
        t: new V3(shot0.target.x + (c.dx || 0), shot0.target.y + (c.dy || 0), shot0.target.z + (c.dz || 0)),
      };
      const ce = Math.cos(s.el);
      cam.position.set(s.t.x + s.dist * Math.sin(s.az) * ce, s.t.y + s.dist * Math.sin(s.el), s.t.z + s.dist * Math.cos(s.az) * ce);
      cam.up.set(0, 1, 0);
      cam.lookAt(s.t);
      cam.fov = s.fov;
      cam.aspect = W / H;
      cam.setViewOffset(W, H, (-s.sx * W) / 2, (s.sy * H) / 2, W, H);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      let size = 0;
      let outA = 0;
      let hit = 0;
      let behind = false;
      const boxes = [];
      // Project a box (8 corners, bit-indexed x·4+y·2+z), clipped against the near plane so
      // boxes that pass beside or under the camera still project correctly.
      const near = -cam.near * 1.01;
      const proj = (vs) => {
        const cv = vs.map((v) => v.clone().applyMatrix4(cam.matrixWorldInverse));
        const keep = cv.filter((v) => v.z < near);
        if (keep.length < cv.length) {
          if (vs.length !== 8) behind = true;
          else if (false) behind = true;
          else
            for (let a = 0; a < 8; a++)
              for (const bit of [1, 2, 4]) {
                const b = a | bit;
                if (b === a) continue;
                const A = cv[a];
                const B = cv[b];
                if (A.z < near !== B.z < near) keep.push(A.clone().lerp(B, (near - A.z) / (B.z - A.z)));
              }
        }
        return keep.map((v) => {
          const p = v.applyMatrix4(cam.matrixWorld).project(cam);
          return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H];
        });
      };
      const bbox = (h) => {
        const xs = h.map((p) => p[0]);
        const ys = h.map((p) => p[1]);
        return [Math.min(...xs) / W, Math.min(...ys) / H, Math.max(...xs) / W, Math.max(...ys) / H].map((v) => Math.round(v * 100));
      };
      // --union: treat the required plates as one solid (compact formations like the monolith)
      const subjects = union ? [required.flatMap((i) => corners[i])] : required.map((i) => corners[i]);
      if (glyphCorners) subjects.push(glyphCorners);
      for (const cs of subjects) {
        const h = hull(proj(cs));
        const a = area(h);
        size += a;
        outA += a - area(clip(h, safeR));
        for (const r of rects) hit += area(clip(h, r));
        boxes.push(bbox(h));
      }
      // glyph size alone (when present) is what the build compositions maximise
      let gsize = 0;
      if (glyphCorners) gsize = area(hull(proj(glyphCorners)));
      const avoidHits = [];
      for (const i of avoid) {
        const pts = proj(corners[i]);
        if (pts.length < 3) continue;
        const h = hull(pts);
        let hi = 0;
        const names = [];
        for (const r of rects) {
          const a = area(clip(h, r));
          if (a > 0) names.push(r.t);
          hi += a;
        }
        hit += hi;
        if (hi > 0) avoidHits.push(`${i}:${Math.round((hi / (W * H)) * 1e4)}‱[${[...new Set(names)].slice(0, 4).join('|')}]`);
      }
      let stripHit = 0;
      if (stripPts) {
        const sp = proj(stripPts);
        let n = 0;
        for (const p of sp) {
          if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
          n++;
          if (rects.some((r) => p[0] > r.x0 && p[0] < r.x1 && p[1] > r.y0 && p[1] < r.y1)) stripHit++;
        }
        stripHit = n ? stripHit / sp.length : 0;
      }
      const F = W * H;
      results.push({ c, size: size / F, gsize: gsize / F, out: size ? outA / size : 1, hit: hit / F, stripHit, behind, boxes, avoidHits });
    }
    return { results, nrects: rects.length, shot0: { az: shot0.az / deg, el: shot0.el / deg, dist: shot0.dist, fov: shot0.fov, sx: shot0.sx, sy: shot0.sy } };
  },
  { cands, required, avoid, glyph, strip, safe, pad, nochrome: !!opt.nochrome, union: !!opt.union },
);

const w = { out: Number(opt.wout || 6), hit: Number(opt.whit || 40), strip: Number(opt.wstrip || 0.2) };
// --prefer "sy=-0.15:0.2,sx=0.35:0.1" — soft pull toward a value: penalty = weight·|v − target|
const prefer = String(opt.prefer || '')
  .split(',')
  .filter(Boolean)
  .map((p) => {
    const [k, r] = p.split('=');
    const [t, wt] = r.split(':').map(Number);
    return { k, t, wt };
  });
for (const r of res.results) {
  const gain = glyph >= 0 ? r.gsize : r.size;
  let pen = 0;
  for (const p of prefer) if (r.c[p.k] !== undefined) pen += p.wt * Math.abs(r.c[p.k] - p.t);
  r.score = r.behind ? -99 : gain - w.out * r.out * r.size - w.hit * r.hit - w.strip * r.stripHit - pen;
}
res.results.sort((a, b) => b.score - a.score);
console.log(`step ${step} @ ${W}x${H}  base`, JSON.stringify(res.shot0), ` text boxes: ${res.nrects}  candidates: ${res.results.length}`);
const fmt = (c) => [...KEYS, ...REL].filter((k) => c[k] !== undefined).map((k) => `${k}${c[k]}`).join(' ');
const r2 = (v) => Math.round(v * 100) / 100;
const abs = (c) => ({
  ...c,
  az: c.az ?? r2(res.shot0.az + (c.daz || 0)),
  el: c.el ?? r2(res.shot0.el + (c.del || 0)),
  dist: c.dist ?? r2(res.shot0.dist * (c.kdist ?? 1)),
});
for (const r of res.results.slice(0, top)) {
  console.log(
    `${r.score.toFixed(4)}  size ${(r.size * 100).toFixed(1)}%  glyph ${(r.gsize * 100).toFixed(1)}%  out ${(r.out * 100).toFixed(1)}%  hit ${(r.hit * 1e4).toFixed(1)}‱  strip ${(r.stripHit * 100).toFixed(0)}%  | ${fmt(r.c)}`,
  );
  if (opt.boxes) console.log('   boxes(l,t,r,b %):', r.boxes.map((b) => b.join(',')).join('  '), r.avoidHits.length ? `  avoid-hits ${r.avoidHits.join(' ')}` : '');
}
const shotArg = (c0) => {
  const c = abs(c0);
  return KEYS.map((k) => c[k] ?? '').join(',').replace(/,+$/, '');
};
console.log('\n--variants "' + res.results.slice(0, Math.min(6, top)).map((r) => 'shot=' + shotArg(r.c)).join('|') + '"');
await browser.close();
await server.close();
process.exit(0);
