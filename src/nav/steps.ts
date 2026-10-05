import { sections } from '../content/content';
import type { StepKind } from '../world/compositions';

export interface Step {
  index: number;
  section: number;
  sub: number;
  kind: StepKind;
  /** URL fragment, e.g. "builds-03". */
  hash: string;
}

const KIND: Record<string, StepKind> = {
  origin: 'origin',
  position: 'position',
  roadmap: 'roadmap',
  builds: 'build',
  stack: 'stack',
  directions: 'directions',
  contact: 'contact',
};

export const steps: Step[] = [];
sections.forEach((s, si) => {
  for (let sub = 0; sub < s.steps; sub++) {
    steps.push({
      index: steps.length,
      section: si,
      sub,
      kind: KIND[s.id],
      hash: s.steps > 1 ? `${s.id}-${String(sub + 1).padStart(2, '0')}` : s.id,
    });
  }
});

export const firstStepOfSection = (si: number) => steps.findIndex((s) => s.section === si);
export const stepFromHash = (hash: string) => {
  const h = hash.replace(/^#/, '');
  if (!h) return -1;
  const exact = steps.findIndex((s) => s.hash === h);
  if (exact >= 0) return exact;
  const si = sections.findIndex((s) => s.id === h);
  return si >= 0 ? firstStepOfSection(si) : -1;
};
