// Contact sheet: tiles several screenshots into one image for side-by-side review.
//   node scripts/sheet.mjs --out .shots/sheet.png --cols 2 --width 1600 a.png b.png c.png d.png
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opts = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
  else files.push(argv[i]);
}
const cols = Number(opts.cols || 2);
const width = Number(opts.width || 1600);
const out = opts.out || '.shots/sheet.png';

const labels = opts.labels ? String(opts.labels).split('|') : [];
// --crop x,y,w,h (source pixels): show the same region of every image at 1:1 scale
const crop = opts.crop ? String(opts.crop).split(',').map(Number) : null;
const cellW = crop ? crop[2] : Math.floor(width / cols);
const cells = files
  .map((f, i) => {
    const data = fs.readFileSync(f).toString('base64');
    const cap = labels[i] ? `${path.basename(f)} — ${labels[i]}` : path.basename(f);
    if (crop) {
      const [x, y, w, h] = crop;
      return `<figure style="width:${w}px;height:${h}px;background:url(data:image/png;base64,${data}) -${x}px -${y}px no-repeat"><figcaption>${cap}</figcaption></figure>`;
    }
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${cap}</figcaption></figure>`;
  })
  .join('');
const html = `<!doctype html><style>
  body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:0}
  figure{margin:0;position:relative}
  img{display:block;width:${cellW}px;height:auto}
  figcaption{position:absolute;left:6px;top:4px;font:12px monospace;color:#0f0;background:#000a;padding:1px 4px}
</style>${cells}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: cellW * cols, height: 400 } });
await page.setContent(html, { waitUntil: 'load' });
const jpeg = /\.jpe?g$/i.test(out);
await page.screenshot({ path: out, fullPage: true, ...(jpeg ? { type: 'jpeg', quality: 80 } : {}) });
await browser.close();
console.log('sheet', out);
