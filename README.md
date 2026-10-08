# Kaushal — Portfolio

Cinematic 3D engineering portfolio: Embedded Systems + Digital Hardware / FPGA-RTL.
Vite + TypeScript + Three.js, no UI framework.

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # type-check + production build to dist/
npm run preview
```

## Edit content

All copy, terms, projects, skills and lanes live in `src/content/content.ts`.
Contact email is a placeholder (`kaushal@example.com`); GitHub / LinkedIn / CV links are
empty and hidden until filled in (`site.contact` in the same file).

## Deploy to GitHub Pages

A GitHub Actions workflow is included at `.github/workflows/deploy.yml`.
In your repo Settings → Pages → Source, select **GitHub Actions**.
Every push to `main` will build and deploy automatically.

## Notes

- Works without WebGL or JavaScript (plain document), respects `prefers-reduced-motion`,
  sound is off by default.
- Dev-only URL params: `?step=N&nointro&q=low|high&reduced&debug&shot=az,el,dist,fov,sx,sy,dx,dy,dz`,
  and `fly=0..1` to hold the hero eagle at a point of its flight.
- Eagle close-ups (pose / wing-beat checks): `node scripts/eagle.mjs --fly 0.45` → `.shots/`.

## Eagle reference sheet

`/eagle-sheet.html` shows the hero eagle (same model, orange rim and glide pose — the hero itself is untouched) from the 14 views of the reference board: front, back, sides, top, bottom, four diagonals, head and talon close-ups, a wing-beat strip and a flight path. Click a panel to orbit it; *Animate* runs the wing beat; *Export PNG* saves the board.
