// Intro check — loads the real first visit (no ?nointro) and captures frames over time.
//   node scripts/intro.mjs [--dist] [--vp 1440x900] [--times 300,800,1500,2500,4000]
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
const dist = !!opt.dist;
const [W, H] = String(opt.vp || '1440x900').split('x').map(Number);
const times = String(opt.times || '300,800,1500,2500,4000').split(',').map(Number);
const out = opt.out || '.shots';

const server = dist
  ? await preview({ preview: { port: 4191, strictPort: false }, logLevel: 'error' })
  : await createServer({ server: { port: 5191, strictPort: false }, logLevel: 'error' });
if (!dist) await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = W < 760;
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })).newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`${base}?q=high&fixeddpr`, { waitUntil: 'load' });
const t0 = Date.now();
for (const t of times) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const file = `${out}/intro-${t}-${W}x${H}.png`;
  await page.screenshot({ path: file });
  const st = await page.evaluate(() => ({ cls: document.documentElement.className, ready: window.__ready === true }));
  console.log('saved', file, JSON.stringify(st));
}
await browser.close();
await (server.close ? server.close() : server.httpServer?.close());
process.exit(0);
