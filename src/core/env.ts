/** Runtime environment facts. Values are live where the platform allows. */

const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const mqCoarse = window.matchMedia('(pointer: coarse)');

type Listener = (v: boolean) => void;
const reduceListeners = new Set<Listener>();
mqReduce.addEventListener?.('change', (e) => reduceListeners.forEach((l) => l(e.matches)));

const params = new URLSearchParams(location.search);

export const env = {
  get reducedMotion() {
    return mqReduce.matches || params.has('reduced');
  },
  onReducedMotionChange(l: Listener) {
    reduceListeners.add(l);
    return () => reduceListeners.delete(l);
  },
  get coarse() {
    return mqCoarse.matches;
  },
  get portrait() {
    return window.innerHeight > window.innerWidth * 1.08;
  },
  get narrow() {
    return window.innerWidth < 760;
  },
  /** Debug / capture switches (?step=4&nointro&debug). */
  params,
  debug: params.has('debug'),
};
