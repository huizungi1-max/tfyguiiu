// Interaction smoke test — keyboard, wheel, touch-free controls, menu, term selection, sound.
//   node scripts/interact.mjs [--dist]
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const dist = process.argv.includes('--dist');
const server = dist
  ? await preview({ preview: { port: 4189, strictPort: false }, logLevel: 'error' })
  : await createServer({ server: { port: 5189, strictPort: false }, logLevel: 'error' });
if (!dist) await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/GPU stall|WebGL-0x|swiftshader/i.test(m.text()) && errors.push(m.text()));

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const idx = () => page.evaluate(() => window.__app.director.index);
const settle = () => page.waitForFunction(() => !window.__app.director.busy, null, { timeout: 20000 });

await page.goto(`${base}?nointro&q=low&fixeddpr`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(800);
check('starts at origin', (await idx()) === 0);

await page.keyboard.press('ArrowDown');
await settle();
check('ArrowDown → step 1', (await idx()) === 1);

await page.keyboard.press('PageDown');
await settle();
check('PageDown → step 2', (await idx()) === 2);

await page.keyboard.press('ArrowUp');
await settle();
check('ArrowUp → step 1', (await idx()) === 1);

// one wheel gesture = one step, even with a long inertial tail. Events are dispatched in-page on
// an exact 16 ms clock (a trackpad flick: ~75 events decaying over 1.2 s) so software-rendered
// frames cannot open artificial gaps in the stream.
await page.evaluate(() => {
  const t0 = performance.now();
  for (let i = 0; i < 75; i++) {
    while (performance.now() - t0 < i * 16);
    const d = Math.max(1, Math.round(90 * Math.exp(-i / 16)));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, cancelable: true, bubbles: true }));
  }
});
await settle();
await page.waitForTimeout(400);
check('one trackpad flick (75 events) → one step', (await idx()) === 2, `index ${await idx()}`);
// a mouse wheel notch (single event of 100) → one step
await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true })));
await settle();
check('one mouse-wheel notch → one step', (await idx()) === 3, `index ${await idx()}`);
await page.keyboard.press('Home');
await settle();
await page.keyboard.press('ArrowDown');
await settle();
await page.keyboard.press('ArrowDown');
await settle();

await page.keyboard.press('End');
await settle();
check('End → last step', (await idx()) === 14);
await page.keyboard.press('Home');
await settle();
check('Home → origin', (await idx()) === 0);

// menu: open, jump to a section, closes
await page.click('[data-menu-open]');
await page.waitForTimeout(500);
check('menu opens', await page.evaluate(() => document.getElementById('menu').classList.contains('is-open')));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check('Escape closes menu', await page.evaluate(() => !document.getElementById('menu').classList.contains('is-open')));
await page.click('[data-menu-open]');
await page.waitForTimeout(400);
await page.click('.menu-btn[data-goto-section="2"]');
await settle();
check('menu → capabilities', (await idx()) === 2);

// capabilities is a statement, not a browsable roadmap — no term/stage selector
const noTermUi = await page.evaluate(
  () => document.querySelectorAll('.term-btn, [data-term], [data-term-panel]').length === 0,
);
check('capabilities has no term/stage selector', noTermUi);

// focus lands inside the active panel when tabbing
await page.keyboard.press('Tab');
const focusInPanel = await page.evaluate(() => {
  const a = document.activeElement;
  return !!a && (a.closest('.panel.is-active') !== null || a.closest('.chrome') !== null || a.classList.contains('skip'));
});
check('Tab focus is on a live control', focusInPanel);

// project index jumps to a build
await page.keyboard.press('ArrowDown');
await settle();
await page.click('.pidx-btn[data-goto-project="5"]');
await settle();
check('project index → build 06', (await idx()) === 8, `index ${await idx()}`);

check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
await (server.close ? server.close() : server.httpServer?.close());
process.exit(fails ? 1 : 0);
