import { DIMENSIONS, type Dimension, type Phrase } from './types';

export function affinity(p: Phrase, d: Record<Dimension, number>): number {
  let s = 0;
  let w = 0;
  for (const k of DIMENSIONS) {
    const pw = p.dims[k] ?? 0;
    if (!pw) continue;
    s += pw * d[k];
    w += pw;
  }
  return w > 0 ? s / Math.sqrt(w) : 0;
}
