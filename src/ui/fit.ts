/**
 * Display headlines are set line by line inside masks (.ln), so a line wider than
 * its column would be cut off. Each headline keeps its designed size where it fits
 * and steps down only as far as its longest line needs — never below `floor`.
 */
export function fitDisplay(scopes: Iterable<ParentNode>, floor = 0.56) {
  for (const scope of scopes) {
    scope.querySelectorAll<HTMLElement>('.display').forEach((h) => {
      h.style.fontSize = '';
      const lines = h.querySelectorAll<HTMLElement>('.ln');
      let k = 1;
      lines.forEach((ln) => {
        const need = ln.scrollWidth;
        const have = ln.clientWidth;
        if (have > 0 && need > have + 0.5) k = Math.min(k, have / need);
      });
      if (k < 1) {
        const fs = parseFloat(getComputedStyle(h).fontSize);
        h.style.fontSize = `${(fs * Math.max(floor, k * 0.985)).toFixed(2)}px`;
      }
    });
  }
}
