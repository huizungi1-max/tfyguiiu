// Eagle close-ups — holds the hero eagle at points of its flight and saves a tight, 2× crop of it.
//
//   node scripts/eagle.mjs --fly 0.3,0.45,0.6 [--vp 1440x900] [--out .shots] [--prefix x-]
//   node scripts/eagle.mjs --fly 0.45 --spin 0,90,180      (extra yaw on the bird: inspect the model)
//   node scripts/eagle.mjs --fly 0.45 --full                (whole viewport instead of the crop)
//   node scripts/eagle.mjs --fly 0.45 --tune '{"fz":0.6}'      (override pose dials, see Eagle.pose)
//   node scripts/eagle.mjs --fly 0.45 --amp 1 --phase 3.14     (hold the wing beat: full stroke, mid-downstroke)
//   node scripts/eagle.mjs --fly 0.45 --amp 0                  (the raised-wing glide pose, no beat)
//   options: --theme light  --scale 2  --pad 40  --wait 2200
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];

const flies = String(opt.fly ?? '0.45').split(',').map(Number);
const spins = String(opt.spin ?? '').split(',').filter(Boolean).map(Number);
const [W, H] = String(opt.vp || '1440x900').split('x').map(Number);
const out = opt.out || '.shots';
const prefix = opt.prefix || '';
const pad = Number(opt.pad || 40);
const scale = Number(opt.scale || 2);
fs.mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5193, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = W < 760;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && !/GPU stall|WebGL-0x|swiftshader/i.test(m.text()) && console.log('console.error', m.text()));

for (const fly of flies) {
  for (const spin of spins.length ? spins : [null]) {
    const theme = opt.theme ? `&theme=${opt.theme}` : '';
    await page.goto(`${base}?step=0&nointro&q=high&fixeddpr&fly=${fly}${theme}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    // --spin turns the bird about its own vertical axis after the flight has placed it;
    // --amp / --phase hold the wing beat at one amplitude and point of the stroke
    await page.evaluate(
      ([deg, amp, phase]) => {
        const e = window.__app.eagle;
        const fly = e.fly.bind(e);
        if (amp !== null) e.beat = amp;
        e.fly = (...a) => {
          if (phase !== null) e.phase = phase;
          fly(...a);
          if (deg !== null) e.root.rotateY((deg * Math.PI) / 180);
        };
      },
      [spin, opt.amp !== undefined ? Number(opt.amp) : null, opt.phase !== undefined ? Number(opt.phase) : null],
    );
    if (opt.tune) await page.evaluate((t) => Object.assign(window.__app.eagle.pose, JSON.parse(t)), String(opt.tune));
    // the loader must have faded and every reveal finished (as in shoot.mjs)
    await page
      .waitForFunction(
        () =>
          document.documentElement.classList.contains('is-loaded') &&
          document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming?.().iterations === Infinity),
        null,
        { timeout: 20000, polling: 250 },
      )
      .catch(() => console.log('  (settle timeout)'));
    await page.waitForTimeout(Number(opt.wait || 2200));
    const box = await page.evaluate(() => {
      const e = window.__app.eagle;
      const cam = window.__app.world.rig.camera;
      e.root.updateMatrixWorld(true);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      e.root.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        const v = cam.position.clone();
        for (let i = 0; i < p.count; i += 7) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).project(cam);
          const sx = (v.x * 0.5 + 0.5) * innerWidth;
          const sy = (-v.y * 0.5 + 0.5) * innerHeight;
          x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
        }
      });
      return { x0, y0, x1, y1, visible: e.root.visible };
    });
    const tag = `${prefix}eagle-${String(fly).replace('.', '_')}${spin !== null ? `-spin${spin}` : ''}-${W}x${H}.png`;
    const file = path.join(out, tag);
    if (opt.full || !box.visible) {
      await page.screenshot({ path: file });
    } else {
      const x = Math.max(0, Math.floor(box.x0 - pad));
      const y = Math.max(0, Math.floor(box.y0 - pad));
      const w = Math.min(W, Math.ceil(box.x1 + pad)) - x;
      const h = Math.min(H, Math.ceil(box.y1 + pad)) - y;
      await page.screenshot({ path: file, clip: { x, y, width: Math.max(10, w), height: Math.max(10, h) } });
    }
    console.log('saved', file, box.visible ? `bbox ${Math.round(box.x0)},${Math.round(box.y0)} → ${Math.round(box.x1)},${Math.round(box.y1)}` : '(eagle hidden)');
  }
}
await browser.close();
await server.close();
process.exit(0);
