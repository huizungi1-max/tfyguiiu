// Visual checkpoint tool: renders steps of the journey in headless Chromium (WebGL via SwiftShader)
// and reports console/page errors.
//
//   node scripts/shoot.mjs --steps 0,1,2 --vp 1440x900,390x844 --wait 1500 --out .shots
//   node scripts/shoot.mjs --seq 3 --to 4 --frames 0.15,0.35,0.6   (mid-transition frames)
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []),
);

// Self-contained: boots Vite (dev, or preview of dist/ with --dist), shoots, shuts down.
let server;
if (!args.url) {
  if (args.dist) {
    server = await preview({ preview: { port: 4179, strictPort: false }, logLevel: 'error' });
  } else {
    server = await createServer({ server: { port: 5179, strictPort: false }, logLevel: 'error' });
    await server.listen();
  }
}
const base = args.url || (server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5179/');
const out = args.out || '.shots';
const vps = String(args.vp || '1440x900').split(',').map((s) => s.split('x').map(Number));
const stepsArg = String(args.steps ?? '0');
const steps = stepsArg === 'all' ? [...Array(15).keys()] : stepsArg.split(',').map(Number);
const wait = Number(args.wait || 1400);
const extra = args.params ? `&${args.params}` : '';
const prefix = args.prefix || '';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

// Wait until the loader has faded and every text reveal (WAAPI) has finished.
async function settle(page) {
  await page
    .waitForFunction(
      () =>
        document.documentElement.classList.contains('is-loaded') &&
        document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming?.().iterations === Infinity),
      null,
      { timeout: 20000, polling: 250 },
    )
    .catch(() => console.log('  (settle timeout)'));
}

let errors = 0;
for (const [w, h] of vps) {
  const mobile = w < 760;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: args.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const txt = m.text();
      if (/GPU stall|GL Driver Message|swiftshader|WebGL-0x|Automatic fallback to software/i.test(txt)) return;
      console.log(`[${w}x${h}] console.${m.type()}: ${txt}`);
      if (m.type() === 'error') errors++;
    }
  });
  page.on('pageerror', (e) => {
    console.log(`[${w}x${h}] PAGE ERROR: ${e.message}\n${e.stack || ''}`);
    errors++;
  });

  if (args.seq !== undefined) {
    // Capture frames of one transition: from step A to step B at frozen progress values.
    const a = Number(args.seq);
    const b = Number(args.to ?? a + 1);
    await page.goto(`${base}?step=${a}&nointro&q=${args.q || 'high'}&fixeddpr${extra}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.waitForTimeout(wait);
    const frames = String(args.frames || '0.2,0.4,0.6,0.8').split(',').map(Number);
    for (const f of frames) {
      await page.evaluate(([b, f]) => window.__app.debugFreeze(b, f), [b, f]);
      await page.waitForTimeout(Number(args.fwait || 900));
      const file = path.join(out, `${prefix}seq-${a}-${b}-${String(f).replace('.', '_')}-${w}x${h}.png`);
      await page.screenshot({ path: file });
      console.log('saved', file);
    }
  } else {
    // --variants "shot=10,20,30|shot=-10,20,30" renders each step once per extra param set
    const variants = args.variants ? String(args.variants).split('|') : [null];
    for (const s of steps) {
      for (const [vi, v] of variants.entries()) {
        const vq = v ? `&${v}` : '';
        await page.goto(`${base}?step=${s}&nointro&q=${args.q || 'high'}&fixeddpr${extra}${vq}`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
        await settle(page);
        await page.waitForTimeout(wait);
        const name = v ? `var-${String(s).padStart(2, '0')}-${vi}` : `step-${String(s).padStart(2, '0')}`;
        const file = path.join(out, `${prefix}${name}-${w}x${h}.png`);
        await page.screenshot({ path: file });
        console.log('saved', file, v ?? '');
      }
    }
  }
  await ctx.close();
}
await browser.close();
if (server) await (server.close ? server.close() : server.httpServer?.close());
console.log(errors ? `DONE with ${errors} error(s)` : 'DONE — no errors');
process.exit(0);
