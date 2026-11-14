import type { PHRASES } from '../../src/content/phrases';

// Approximate text metrics (the browser uses real font measurement).
const SZ: Record<string, number> = { xs: 0.13, s: 0.17, m: 0.22, l: 0.31, xl: 0.53 };

export const measure = (p: (typeof PHRASES)[number]) => {
  const w = Math.min(2.6, p.text.length * 0.034 * (SZ[p.size] / 0.17));
  return { w, h: SZ[p.size] * Math.ceil((p.text.length * 0.034 * (SZ[p.size] / 0.17)) / 2.6) };
};
