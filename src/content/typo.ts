/** Shared typographic helpers (build-time templates and runtime world type). */

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ARROW =
  '<svg class="ar" viewBox="0 0 18 10" aria-hidden="true" focusable="false"><path d="M0 5h16M12 1l4 4-4 4"/></svg><span class="sr-only"> to </span>';

/** Escape + typographic replacements (arrows drawn as SVG — the glyph is not in the font subset). */
export const t = (s: string) => esc(s).replace(/\s*→\s*/g, ` ${ARROW} `);
