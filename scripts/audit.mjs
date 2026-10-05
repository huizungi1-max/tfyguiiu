// Layout audit — loads each step and reports text problems a screenshot review can miss:
//   CLIP     a masked line (.ln) narrower than its text
//   EDGE     visible text (panel, chrome, world lettering, labels) crossing the viewport edge
//   OVERLAP  world lettering / labels covering panel text, or labels covering each other
//
//   node scripts/audit.mjs --steps all --vp 1440x900,390x844
import { chromium } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
const vps = String(opt.vp || '1440x900').split(',').map((s) => s.split('x').map(Number));
const steps = String(opt.steps ?? 'all') === 'all' ? [...Array(15).keys()] : String(opt.steps).split(',').map(Number);
const wait = Number(opt.wait || 2600);
const extra = opt.params ? `&${opt.params}` : '';

const server = await createServer({ server: { port: 5183, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

let total = 0;
for (const [W, H] of vps) {
  const mobile = W < 760;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${W}x${H}] PAGE ERROR ${e.message}`));
  for (const s of steps) {
    await page.goto(`${base}?step=${s}&nointro&q=low&fixeddpr${extra}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.waitForTimeout(wait);
    const issues = await page.evaluate(() => {
      const W = innerWidth;
      const H = innerHeight;
      const out = [];
      const vis = (el) => {
        for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
          if (e.classList?.contains('sr-only')) return false;
          const cs = getComputedStyle(e);
          if (cs.clip && cs.clip !== 'auto' && /rect\(0px,? 0px,? 0px,? 0px\)/.test(cs.clip)) return false;
          if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden || Number(cs.opacity) < 0.08) return false;
        }
        return true;
      };
      const name = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42);
      const textRects = (root) => {
        const res = [];
        root.querySelectorAll('*').forEach((el) => {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
          if (!vis(el)) return;
          const r = document.createRange();
          r.selectNodeContents(el);
          const b = r.getBoundingClientRect();
          if (b.width > 1 && b.height > 1) res.push({ el, b, t: name(el) });
        });
        return res;
      };
      const inter = (a, b, pad = 0) => {
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left) + pad;
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + pad;
        return x > 0 && y > 0 ? x * y : 0;
      };

      // CLIP
      document.querySelectorAll('.panel.is-active .ln, .chrome .ln').forEach((ln) => {
        if (!vis(ln)) return;
        if (ln.scrollWidth > ln.clientWidth + 1) out.push(`CLIP     "${name(ln)}" needs ${ln.scrollWidth}px, has ${ln.clientWidth}px`);
      });

      const panel = [...document.querySelectorAll('.panel.is-active, .chrome, .rail')].flatMap(textRects);
      const world = [...document.querySelectorAll('#wt-front, #wt-back, #labels')].flatMap(textRects);

      // EDGE
      for (const r of [...panel, ...world]) {
        const b = r.b;
        const over = Math.max(-b.left, b.right - W, -b.top, b.bottom - H);
        if (over > 0.5 && b.right > 0 && b.left < W && b.bottom > 0 && b.top < H) out.push(`EDGE     "${r.t}" crosses viewport by ${Math.round(over)}px`);
      }
      // OVERLAP world text vs panel text
      for (const w of world)
        for (const p of panel) {
          const a = inter(w.b, p.b);
          if (a > 40) out.push(`OVERLAP  world "${w.t}" × panel "${p.t}" (${Math.round(a)}px²)`);
        }
      // OVERLAP labels vs each other (screen-aligned labels only)
      const lbl = textRects(document.getElementById('labels') || document.body);
      for (let i = 0; i < lbl.length; i++)
        for (let j = i + 1; j < lbl.length; j++) {
          if (lbl[i].el.contains(lbl[j].el) || lbl[j].el.contains(lbl[i].el)) continue;
          const a = inter(lbl[i].b, lbl[j].b);
          if (a > 20) out.push(`OVERLAP  label "${lbl[i].t}" × label "${lbl[j].t}" (${Math.round(a)}px²)`);
        }
      return [...new Set(out)];
    });
    total += issues.length;
    console.log(`[${W}x${H}] step ${String(s).padStart(2)}: ${issues.length ? issues.length + ' issue(s)' : 'ok'}`);
    for (const i of issues.slice(0, Number(opt.max || 14))) console.log('    ' + i);
  }
  await ctx.close();
}
await browser.close();
await server.close();
console.log(`TOTAL ${total}`);
process.exit(0);
