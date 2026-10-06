// Interaction smoke test — keyboard, wheel, touch, drag, the horizontal/vertical gesture rule, menu.
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
// Steps: 0 origin · 1 capabilities · 2–10 skill domains · 11–18 projects · 19–20 stack · 21 directions · 22 contact
const D0 = 2, P0 = 11, S0 = 19, LAST = 22;
const wheel = (dx, dy) => page.evaluate(([dx, dy]) => window.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: dy, cancelable: true, bubbles: true })), [dx, dy]);
const swipe = (dx, dy) =>
  page.evaluate(([dx, dy]) => {
    const mk = (x, y) => new Touch({ identifier: 7, target: document.body, clientX: x, clientY: y });
    const fire = (type, x, y) => {
      const t = mk(x, y);
      window.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], cancelable: true, bubbles: true }));
    };
    const x0 = 700, y0 = 450;
    fire('touchstart', x0, y0);
    for (let k = 1; k <= 8; k++) fire('touchmove', x0 + (dx * k) / 8, y0 + (dy * k) / 8);
    fire('touchend', x0 + dx, y0 + dy);
  }, [dx, dy]);

// a vertical wheel notch inside the orbit leaves it for the next page (never changes card)
await wheel(0, 100);
await settle();
check('orbit: vertical wheel → next page (Projects 01)', (await idx()) === P0, `index ${await idx()}`);

// projects — horizontal changes project, vertical leaves
await page.keyboard.press('ArrowRight');
await settle();
check('projects: ArrowRight → project 02', (await idx()) === P0 + 1, `index ${await idx()}`);
await wheel(110, 0);
await settle();
check('projects: horizontal trackpad swipe → project 03', (await idx()) === P0 + 2, `index ${await idx()}`);
await swipe(-160, 6);
await settle();
check('projects: touch swipe left → project 04', (await idx()) === P0 + 3, `index ${await idx()}`);
await swipe(150, -4);
await settle();
check('projects: touch swipe right → project 03', (await idx()) === P0 + 2, `index ${await idx()}`);
await swipe(4, -170);
await settle();
check('projects: touch swipe up (scroll down) → next page, not next project', (await idx()) === S0, `index ${await idx()}`);
await page.keyboard.press('ArrowUp');
await settle();
check('back up into projects resumes project 03', (await idx()) === P0 + 2, `index ${await idx()}`);
await page.keyboard.press('ArrowDown');
await settle();
check('projects: ArrowDown → next page (Stack)', (await idx()) === S0, `index ${await idx()}`);
await page.keyboard.press('ArrowRight');
await settle();
check('vertical pages ignore sideways keys', (await idx()) === S0, `index ${await idx()}`);

await page.keyboard.press('End');
await settle();
check('End → last step', (await idx()) === LAST);
await page.keyboard.press('Home');
await settle();
check('Home → origin', (await idx()) === 0);

// hero: the eagle flies in by itself, keeps beating its wings while idle; one swipe hands over
const eagle = () => page.evaluate(() => ({ u: window.__app.eagle.u, on: window.__app.eagle.root.visible }));
const arrived = () => page.waitForFunction(() => window.__app.eagle.root.visible && window.__app.eagle.u > 0.4, null, { timeout: 30000 }).then(() => true, () => false);
check('hero: the eagle flies in without any input', (await arrived()) && (await idx()) === 0, JSON.stringify(await eagle()));
const wingZ = () => page.evaluate(() => window.__app.eagle.wings[0].shoulder.rotation.z);
const z0 = await wingZ();
let moved = 0;
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(150);
  moved = Math.max(moved, Math.abs((await wingZ()) - z0));
}
check('hero: its wings keep beating while idle', moved > 0.05 && (await idx()) === 0, `swing ${moved.toFixed(3)} rad`);
await wheel(0, 120);
await settle();
check('hero: one scroll hands over to Capabilities', (await idx()) === 1, `index ${await idx()}`);
await page.keyboard.press('ArrowUp');
await settle();
check('back on the hero the eagle flies in again', (await idx()) === 0 && (await arrived()), JSON.stringify(await eagle()));
await swipe(0, -170);
await settle();
check('hero: a touch swipe hands over too', (await idx()) === 1, `index ${await idx()}`);
await page.keyboard.press('Home');
await settle();

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
check('menu → skill domains', (await idx()) === D0, `index ${await idx()}`);
check('no roadmap term/stage selector anywhere', await page.evaluate(() => document.querySelectorAll('.term-btn, [data-term], [data-term-panel]').length === 0));

// orbit — sideways moves between cards and wraps round the ring
await page.keyboard.press('ArrowLeft');
await settle();
check('orbit: ArrowLeft from card 01 wraps to card 09', (await idx()) === D0 + 8, `index ${await idx()}`);
await page.keyboard.press('ArrowRight');
await settle();
check('orbit: ArrowRight wraps back to card 01', (await idx()) === D0, `index ${await idx()}`);
await page.mouse.move(900, 460);
await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(900 - k * 14, 462);
await page.mouse.up();
await settle();
check('orbit: mouse drag left → card 02', (await idx()) === D0 + 1, `index ${await idx()}`);
await page.click('.hnav-btn[data-hstep="1"]');
await settle();
check('orbit: next button → card 03', (await idx()) === D0 + 2, `index ${await idx()}`);
await page.click('.dom-btn[data-goto-domain="6"]');
await settle();
check('orbit: index jump → card 07', (await idx()) === D0 + 6, `index ${await idx()}`);
const card = await page.evaluate(() => [document.querySelector('[data-ind-label]').textContent, document.querySelector('.dom-btn[aria-current="true"]')?.dataset.gotoDomain]);
check('orbit: indicator + index show position', card[0] === 'Skill Domains 07' && card[1] === '6', card.join(' | '));
await page.click('[data-next]');
await settle();
check('orbit: "Next" goes to the next page, resuming project 03', (await idx()) === P0 + 2, `index ${await idx()}`);

// focus lands inside the active panel when tabbing
await page.keyboard.press('Tab');
const focusInPanel = await page.evaluate(() => {
  const a = document.activeElement;
  return !!a && (a.closest('.panel.is-active') !== null || a.closest('.chrome') !== null || a.classList.contains('skip'));
});
check('Tab focus is on a live control', focusInPanel);

// project index jumps to a project
await page.click('.pidx-btn[data-goto-project="5"]');
await settle();
check('project index → project 06', (await idx()) === P0 + 5, `index ${await idx()}`);

check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
await (server.close ? server.close() : server.httpServer?.close());
process.exit(fails ? 1 : 0);
