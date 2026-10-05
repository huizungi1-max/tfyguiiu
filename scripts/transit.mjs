// Transition clearance check — samples every move between consecutive steps and reports how
// close the camera comes to any plate (in the plate's own box space). Nothing is rendered to disk.
//
//   node scripts/transit.mjs                 (all 14 moves, forward)
//   node scripts/transit.mjs --pairs 2-3,10-11 --vp 390x844 --step 0.025
import { chromium } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
const [W, H] = String(opt.vp || '1440x900').split('x').map(Number);
const pairs = opt.pairs
  ? String(opt.pairs).split(',').map((p) => p.split('-').map(Number))
  : Array.from({ length: 14 }, (_, i) => [i, i + 1]);
const dt = Number(opt.step || 0.04);
const warn = Number(opt.warn || 0.6);

const server = await createServer({ server: { port: 5185, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = W < 760;
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })).newPage();

let worst = Infinity;
for (const [a, b] of pairs) {
  await page.goto(`${base}?step=${a}&nointro&q=low&fixeddpr`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  let min = { d: Infinity, t: 0, plate: -1 };
  for (let t = 0; t <= 1.0001; t += dt) {
    await page.evaluate(([b, t]) => window.__app.debugFreeze(b, t), [b, t]);
    await page.waitForTimeout(Number(opt.fwait || 450));
    const r = await page.evaluate(() => {
      const app = window.__app;
      const cam = app.world.rig.camera;
      const meshes = app.world.plates.meshes;
      let best = { d: Infinity, plate: -1 };
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        m.updateMatrixWorld(true);
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        // camera position in plate-local space, distance to the (scaled) box
        const inv = m.matrixWorld.clone().invert();
        const p = cam.position.clone().applyMatrix4(inv);
        const s = new cam.position.constructor().setFromMatrixScale(m.matrixWorld);
        const dx = Math.max(bb.min.x - p.x, 0, p.x - bb.max.x) * s.x;
        const dy = Math.max(bb.min.y - p.y, 0, p.y - bb.max.y) * s.y;
        const dz = Math.max(bb.min.z - p.z, 0, p.z - bb.max.z) * s.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < best.d) best = { d, plate: i };
      }
      return best;
    });
    if (r.d < min.d) min = { d: r.d, t: Math.round(t * 100) / 100, plate: r.plate };
  }
  worst = Math.min(worst, min.d);
  const flag = min.d < warn ? '  <-- CLOSE' : '';
  console.log(`${a}→${b}: nearest plate ${min.plate} at ${min.d.toFixed(2)} units (t=${min.t})${flag}`);
}
console.log(`worst clearance ${worst.toFixed(2)}`);
await browser.close();
await server.close();
process.exit(0);
