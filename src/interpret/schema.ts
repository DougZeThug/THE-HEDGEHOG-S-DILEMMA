import { DIMENSIONS, type DimVector } from '../content/types';
import { PHRASE_BY_ID } from '../content/phrases';

/**
 * The structured shape any interpreter — local or a future model — must return.
 * The experience engine only ever acts on a validated Interpretation; it never runs
 * code, styles or audio commands supplied by an interpreter.
 */
export const GESTURES = ['writeOnWall', 'quiet', 'revealRelated', 'distantRecollection', 'temperatureShift', 'rearrange', 'music'] as const;
export type Gesture = (typeof GESTURES)[number];

export interface Interpretation {
  dims: DimVector;
  related: string[];
  contradictions: string[];
  gestures: Gesture[];
  intensity: number;
  tense: 'past' | 'present' | 'future' | 'none';
  question: boolean;
}

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Returns a safe Interpretation or null. Unknown fields are dropped; unknown ids/gestures are discarded. */
export function validateInterpretation(raw: unknown): Interpretation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const dims: DimVector = {};
  if (r.dims && typeof r.dims === 'object') {
    for (const d of DIMENSIONS) {
      const v = (r.dims as Record<string, unknown>)[d];
      if (v !== undefined) {
        const c = clamp01(v);
        if (c > 0) dims[d] = c;
      }
    }
  } else return null;
  const ids = (x: unknown, max: number) =>
    Array.isArray(x) ? [...new Set(x.filter((i): i is string => typeof i === 'string' && PHRASE_BY_ID.has(i)))].slice(0, max) : [];
  const gestures = Array.isArray(r.gestures)
    ? [...new Set(r.gestures.filter((g): g is Gesture => typeof g === 'string' && (GESTURES as readonly string[]).includes(g)))]
    : [];
  const tense = r.tense === 'past' || r.tense === 'present' || r.tense === 'future' ? r.tense : 'none';
  return {
    dims,
    related: ids(r.related, 3),
    contradictions: ids(r.contradictions, 2),
    gestures,
    intensity: clamp01(r.intensity),
    tense,
    question: r.question === true,
  };
}
