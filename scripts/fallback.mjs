// Fallback check — loads the site with WebGL disabled and captures the plain-document version.
//   node scripts/fallback.mjs            → .shots/nowebgl-1440.png, .shots/nowebgl-390.png
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5187, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-webgl', '--disable-3d-apis', '--disable-gpu'] });
for (const [w, h] of [
  [1440, 900],
  [390, 844],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({
    cls: document.documentElement.className,
    height: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }));
  console.log(`${w}x${h}`, JSON.stringify(info), 'errors:', errs.length ? errs.join(' | ') : 'none');
  await page.screenshot({ path: `.shots/nowebgl-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close();
await server.close();
process.exit(0);
