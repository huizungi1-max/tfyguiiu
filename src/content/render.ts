/**
 * Static HTML renderer. Runs at build time (vite.config.ts → transformIndexHtml)
 * so that all content exists as real, crawlable, accessible markup. The runtime
 * only enhances this DOM — it never re-renders content.
 */
import {
  site,
  sections,
  tiers,
  domains,
  projects,
  groups,
  joints,
  lanes,
  families,
  type Project,
  type Group,
} from './content';

import { esc, t } from './typo';

const pad = (n: number) => String(n).padStart(2, '0');

/** A masked line: the inner span slides inside an overflow-clipped wrapper. */
const line = (html: string, cls = '') => `<span class="ln ${cls}"><span class="ln-i">${html}</span></span>`;

function kicker(index: number, label: string, extra = '') {
  return `<p class="kicker" data-a="fade"><span class="kicker-n">${pad(index + 1)}</span><span class="kicker-rule" aria-hidden="true"></span><span>${t(label)}</span>${extra}</p>`;
}

/**
 * The title system used by every major page:
 *   primary   — what the page contains (white, display face)
 *   subtitle  — the cinematic line (smaller, led by an orange rule)
 * `*word*` in the subtitle is set in the accent.
 */
function title(id: string, main: string[], sub: string, size: 'lg' | 'md' | 'sm' = 'md', tag: 'h2' | 'div' = 'h2') {
  const subHtml = t(sub).replace(/\*(.+?)\*/g, '<em>$1</em>');
  const idAttr = id ? ` id="${id}"` : '';
  return `<${tag}${idAttr} class="ttl ttl-${size}">
      <span class="sr-only">${t(main.join(' '))} — ${t(sub.replace(/\*/g, ''))}</span>
      <span class="display ${size} ttl-main" aria-hidden="true">${main.map((l) => line(t(l))).join('')}</span>
      <span class="ttl-sub" aria-hidden="true" data-a="rise"><i class="ttl-bar"></i><span>${subHtml}</span></span>
    </${tag}>`;
}

const ARROW_L = '<svg viewBox="0 0 18 10" aria-hidden="true" focusable="false"><path d="M18 5H2M6 1L2 5l4 4"/></svg>';
const ARROW_R = '<svg viewBox="0 0 18 10" aria-hidden="true" focusable="false"><path d="M0 5h16M12 1l4 4-4 4"/></svg>';

/** Sideways navigation for horizontal sections: prev / position / next, plus the gesture hint. */
function hnav(key: string, total: number, noun: string, firstName: string) {
  return `<div class="hnav" data-hnav="${key}">
    <button type="button" class="hnav-btn" data-hstep="-1" aria-label="Previous ${noun}">${ARROW_L}</button>
    <span class="hnav-pos mono"><span class="hnav-cur" data-hnav-cur>01</span><span class="dim"> / ${pad(total)}</span></span>
    <button type="button" class="hnav-btn" data-hstep="1" aria-label="Next ${noun}">${ARROW_R}</button>
    <span class="hnav-name mono" data-hnav-name>${t(firstName)}</span>
    <span class="hnav-hint mono" aria-hidden="true"><i class="hnav-hint-ar">${ARROW_L}${ARROW_R}</i><span>Swipe or drag</span></span>
  </div>`;
}

/* -------------------------------------------------------------------------- */

function origin() {
  return `
<section id="origin" class="panel panel-origin" data-section="0" aria-labelledby="origin-title">
  <h1 id="origin-title" class="sr-only">Kaushal — BS Electronic Systems, IIT Madras and B.Tech Electronics &amp; Communication Engineering. Embedded systems and digital hardware / FPGA-RTL.</h1>
  <img class="origin-portrait" src="/portrait.jpg" alt="" aria-hidden="true" decoding="async" fetchpriority="high" />
  <p class="doc-name" aria-hidden="true">Kaushal</p>
  <div class="origin-block">
    <div class="origin-head" data-a="fade">
      <span class="origin-bar" aria-hidden="true"></span>
      <span class="origin-head-txt">
        <span class="origin-name" aria-hidden="true">Kaushal</span>
        <span class="origin-sub mono">BS Electronic Systems, IIT Madras · B.Tech ECE</span>
      </span>
    </div>
    <div class="origin-primary" aria-hidden="true" data-a="rise">
      <span class="pl-row">
        <span class="pl-txt"><em class="lead">Ideas</em> <em class="into">into</em> Circuits.</span>
        <span class="pl-trace" aria-hidden="true"><span class="pl-line"></span><svg class="pl-cap" viewBox="0 0 80 40" fill="none" aria-hidden="true"><path d="M0 20 H46 L58 34 H74"/><circle cx="76" cy="34" r="3.4"/></svg></span>
      </span>
      <span class="pl-row">
        <span class="pl-txt"><em class="lead">Circuits</em> <em class="into">into</em> Real Solutions.</span>
        <span class="pl-trace" aria-hidden="true"><span class="pl-line"></span><svg class="pl-cap" viewBox="0 0 80 40" fill="none" aria-hidden="true"><path d="M0 20 H74"/><circle cx="76" cy="20" r="3.4"/></svg></span>
      </span>
    </div>
  </div>
</section>`;
}

function position() {
  const rows = tiers
    .map(
      (tr, i) => `
      <div class="tier tier-${tr.key}">
        <p class="tier-k mono"><span class="tier-n">${pad(i + 1)}</span><span>${t(tr.label)}</span></p>
        <div class="tier-body">
          <p class="tier-areas">${tr.areas.map((a) => `<span>${t(a)}</span>`).join('')}</p>
          <p class="tier-detail mono">${tr.detail.map(t).join('<span class="dot" aria-hidden="true"> · </span>')}</p>
        </div>
      </div>`,
    )
    .join('');
  return `
<section id="position" class="panel panel-position" data-section="1" aria-labelledby="position-title">
  <div class="col col-left">
    ${kicker(1, 'Capabilities')}
    ${title('position-title', ['Engineering', 'Capabilities'], 'Between the circuit and the code.')}
    <div class="tiers" data-a="rise">${rows}
    </div>
  </div>
</section>`;
}

function skillDomains() {
  const index = domains
    .map(
      (d, i) =>
        `<li><button type="button" class="dom-btn" data-goto-domain="${i}" aria-label="Skill domain ${pad(i + 1)}: ${esc(d.name)}"><span class="dom-n mono">${pad(i + 1)}</span><span class="dom-t">${t(d.name)}</span></button></li>`,
    )
    .join('');
  // Document modes (no JS / no WebGL) and screen readers get the cards as text.
  const doc = domains.map((d) => `<li><h3 class="grp-name">${t(d.name)}</h3><p class="grp-items-inline mono">${d.skills.map(t).join(' · ')}</p></li>`).join('');
  return `
<section id="domains" class="panel panel-domains" data-section="2" aria-labelledby="domains-title">
  <div class="dom-head">
    ${kicker(2, 'Skill Domains')}
    ${title('domains-title', ['Skill Domains'], 'Across the *whole* stack.')}
    <nav class="dom-index" aria-label="Skill domains" data-a="rise"><ol>${index}</ol></nav>
  </div>
  <ul class="dom-doc">${doc}</ul>
  ${hnav('domains', domains.length, 'skill domain', domains[0].name)}
</section>`;
}

function chips(items: string[], cls = '') {
  return `<ul class="chips ${cls}">${items.map((i) => `<li>${t(i)}</li>`).join('')}</ul>`;
}

function project(p: Project, i: number) {
  const extra = (p.extra ?? [])
    .map((x) => `<div class="pj-row"><dt class="mono dim">${t(x.label)}</dt><dd>${chips(x.items, 'chips-quiet')}</dd></div>`)
    .join('');
  const evidence = p.evidence?.length
    ? `<div class="pj-row"><dt class="mono dim">Evidence</dt><dd>${p.evidence.map((e) => `<a class="link" href="${esc(e.href)}" target="_blank" rel="noopener">${t(e.label)}</a>`).join(' ')}</dd></div>`
    : '';
  return `
  <article class="project" data-project="${i}" aria-labelledby="pj-${p.n}-title" ${i === 0 ? '' : 'hidden'}>
    <p class="pj-meta mono" data-a="fade"><span class="pj-n">Project ${p.n}<span class="dim"> / 08</span></span><span class="pj-term">${t(p.domain)}</span><span class="pj-mark">${t(p.mark)}</span></p>
    <h3 id="pj-${p.n}-title" class="display md pj-title">
      <span class="sr-only">${t(p.title)}</span>
      <span aria-hidden="true">${p.titleLines.map((l) => line(t(l))).join('')}</span>
    </h3>
    <p class="pj-concept" data-a="rise">${t(p.concept)}</p>
    ${p.note ? `<p class="pj-note" data-a="rise">${t(p.note)}</p>` : ''}
    <dl class="pj-dl" data-a="rise">
      <div class="pj-row"><dt class="mono dim">Stack</dt><dd>${chips(p.stack)}</dd></div>
      <div class="pj-row"><dt class="mono dim">Focus</dt><dd>${chips(p.focus, 'chips-quiet')}</dd></div>
      ${extra}
      ${evidence}
    </dl>
  </article>`;
}

function builds() {
  const index = projects
    .map(
      (p, i) =>
        `<li><button type="button" class="pidx-btn" data-goto-project="${i}" aria-label="Project ${p.n}: ${esc(p.title)}"><span class="pidx-n">${p.n}</span><span class="pidx-t">${t(p.title)}</span></button></li>`,
    )
    .join('');
  return `
<section id="builds" class="panel panel-builds" data-section="3" aria-labelledby="builds-title">
  <div class="builds-head">
    ${kicker(3, 'Projects')}
    ${title('builds-title', ['Engineering Projects'], 'Eight builds. *One* system.', 'sm')}
  </div>
  <div class="projects">${projects.map(project).join('')}</div>
  <div class="pnav">
    <nav class="pidx" aria-label="Project index"><ol>${index}</ol></nav>
    ${hnav('builds', projects.length, 'project', projects[0].title)}
  </div>
</section>`;
}

function groupBlock(g: Group) {
  return `<div class="grp grp-${g.key}" data-group="${g.key}">
    <h3 class="grp-name">${t(g.name)}</h3>
    ${g.note ? `<p class="grp-note">${t(g.note)}</p>` : ''}
    <ul class="grp-items">${g.items.map((i) => `<li>${t(i)}</li>`).join('')}</ul>
  </div>`;
}

function stack() {
  const core = groups.filter((g) => g.tier === 'core');
  const sup = groups.filter((g) => g.tier !== 'core');
  return `
<section id="stack" class="panel panel-stack" data-section="4" aria-labelledby="stack-title">
  <h2 id="stack-title" class="sr-only">Technical stack</h2>
  <div class="stack-step" data-sub="0">
    ${kicker(4, 'Stack · Core')}
    ${title('', ['Digital · Embedded', '· Programming'], 'The *core.*', 'md', 'div')}
    <p class="lede short" data-a="rise">Digital hardware and embedded systems, joined by the interfaces they share — and the languages that drive both.</p>
    <p class="stack-hint mono dim" data-a="fade">Joints mark where two groups meet</p>
    <div class="grp-list">${core.map(groupBlock).join('')}</div>
  </div>
  <div class="stack-step" data-sub="1" hidden>
    ${kicker(4, 'Stack · Support')}
    ${title('', ['Hardware · Signals', '· Systems'], 'The ground it *stands on.*', 'md', 'div')}
    <p class="lede short" data-a="rise">Physical hardware, signals and systems, and the tooling around them — with DSA as a supporting software layer.</p>
    <div class="grp-list">${sup.map(groupBlock).join('')}</div>
  </div>
  <p class="sr-only">Connections: ${joints.map((j) => `${groups.find((g) => g.key === j.a)?.name} and ${groups.find((g) => g.key === j.b)?.name} meet at ${j.via.replace(/→/g, 'to')}`).join('; ')}.</p>
</section>`;
}

function directions() {
  const fams = (['digital', 'firmware', 'board'] as const)
    .map((f) => {
      const ls = lanes.filter((l) => l.family === f);
      return `<div class="fam"><h3 class="mono dim">${t(families[f])}</h3><ul>${ls
        .map((l) => `<li><span class="lane-name">${t(l.name)}</span><span class="lane-items">${l.items.map(t).join(' · ')}</span></li>`)
        .join('')}</ul></div>`;
    })
    .join('');
  return `
<section id="directions" class="panel panel-directions" data-section="5" aria-labelledby="directions-title">
  <div class="col col-left">
    ${kicker(5, 'Directions')}
    ${title('directions-title', ['Engineering', 'Directions'], 'Foundation. Depth. *Focus.*')}
    <p class="dir-story mono" data-a="fade">${t('Broad systems foundation → engineering depth → specialised focus')}</p>
    <p class="lede short" data-a="rise">Six engineering directions this profile works across — from firmware and FPGA/RTL to verification and hardware. The centre of gravity stays fixed: digital hardware and embedded firmware.</p>
  </div>
  <div class="sr-only">${fams}</div>
</section>`;
}

function contact() {
  const links = site.contact.links
    .filter((l) => l.href)
    .map((l) => `<li><a class="link" href="${esc(l.href)}" target="_blank" rel="noopener">${t(l.label)}<span class="dim"> ${t(l.display || '')}</span></a></li>`)
    .join('');
  return `
<section id="contact" class="panel panel-contact" data-section="6" aria-labelledby="contact-title">
  <div class="contact-inner">
    ${kicker(6, 'Contact')}
    ${title('contact-title', ['Get in Touch'], "Let's build the *next layer.*", 'lg')}
    <div class="contact-row" data-a="rise">
      <a class="contact-mail" href="mailto:${esc(site.contact.email)}">${t(site.contact.email)}</a>
      <button class="btn-copy mono" type="button" data-copy="${esc(site.contact.email)}">Copy</button>
    </div>
    ${links ? `<ul class="contact-links mono" data-a="rise">${links}</ul>` : ''}
  </div>
  <div class="contact-foot" data-a="fade">
    <p class="mono dim">© <span data-year>2026</span> Kaushal · ${t(site.fieldLong)}</p>
    <p class="mono dim">${t(site.primary)}</p>
    <button type="button" class="btn-ghost mono" data-goto-step="0">Return to origin <svg class="ar ar-up" viewBox="0 0 18 10" aria-hidden="true" focusable="false"><path d="M0 5h16M12 1l4 4-4 4"/></svg></button>
  </div>
</section>`;
}

/* -------------------------------------------------------------------------- */

function chrome() {
  const rail = sections
    .map(
      (s, i) =>
        `<li><button type="button" class="rail-btn" data-goto-section="${i}" aria-label="Section ${pad(i + 1)}: ${esc(s.label)}"><span class="rail-label mono">${pad(i + 1)} ${esc(s.label)}</span><span class="rail-tick" aria-hidden="true"></span></button></li>`,
    )
    .join('');
  const menu = sections
    .map(
      (s, i) =>
        `<li><button type="button" class="menu-btn" data-goto-section="${i}"><span class="menu-n mono">${pad(i + 1)}</span><span class="menu-t">${esc(s.label)}</span></button></li>`,
    )
    .join('');
  return `
<header class="chrome" data-chrome>
  <button type="button" class="wordmark" data-goto-step="0" aria-label="Kaushal — return to origin">Kaushal</button>
  <div class="chrome-right">
    <button type="button" class="chip-btn mono indicator" data-menu-open aria-haspopup="dialog" aria-expanded="false" aria-controls="menu">
      <span class="ind-n"><span data-ind-cur>01</span><span class="dim"> / ${pad(sections.length)}</span></span>
      <span class="ind-label" data-ind-label>${esc(sections[0].label)}</span>
      <span class="ind-burger" aria-hidden="true"><i></i><i></i></span>
    </button>
  </div>
</header>
<nav class="rail" aria-label="Sections"><ol>${rail}</ol></nav>
<div class="next" data-next-wrap>
  <button type="button" class="next-btn mono" data-next aria-label="Next">
    <span class="next-k dim" data-next-k>Next</span><span data-next-label>${esc(sections[1].label)}</span>
    <svg class="ar ar-down" viewBox="0 0 18 10" aria-hidden="true" focusable="false"><path d="M0 5h16M12 1l4 4-4 4"/></svg>
  </button>
</div>
<div id="menu" class="menu" role="dialog" aria-modal="true" aria-label="Index" hidden>
  <div class="menu-inner">
    <p class="mono dim menu-k">Index</p>
    <ol class="menu-list">${menu}</ol>
    <button type="button" class="chip-btn mono menu-close" data-menu-close>Close</button>
  </div>
</div>`;
}

export function renderApp(): string {
  return `
<a class="skip mono" href="#main">Skip to content</a>
<div class="bg" aria-hidden="true"></div>
<div class="world" aria-hidden="true">
  <div id="wt-back" class="wt-layer"></div>
  <canvas id="gl"></canvas>
  <div id="wt-front" class="wt-layer"></div>
  <div id="labels" class="labels"></div>
</div>
${chrome()}
<main id="main" class="stage" tabindex="-1">
${origin()}
${position()}
${skillDomains()}
${builds()}
${stack()}
${directions()}
${contact()}
</main>
<div class="grain" aria-hidden="true"></div>
<div class="veil" aria-hidden="true"></div>
<div class="loader" aria-hidden="true"><div class="loader-line"><i></i></div><p class="loader-k mono">Kaushal</p></div>
<p class="sr-only" aria-live="polite" data-announce></p>
<noscript><style>.loader{display:none}</style></noscript>`;
}
