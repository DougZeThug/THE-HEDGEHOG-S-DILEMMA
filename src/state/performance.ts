import dialogue from '../content/dialogue.json';
import type { VoiceStyle } from '../content/types';
import type { FieldKey, FieldValues } from './EmotionalField';

/**
 * Recorded performances. The Director chooses among authored variants of a phrase by
 * the room's current field — the same sentence can be tender, guarded or remembered —
 * using only the existing EmotionalField; nothing here is a second emotional engine.
 */
export interface Performance {
  id: string;
  phraseId: string;
  voice: string;
  text: string;
  input: string;
  direction: string;
  context: Partial<Record<FieldKey, number>>;
  fits: string[];
  file: string;
  interpretation?: string;
  /** Kept on disk and in the ledger, but no longer played. */
  retired?: boolean;
  /** An alternative reading for listening; played only once approved. */
  audition?: boolean;
}

/** All performances; retired ones only play if their file is still in the manifest (i.e. someone approved them). */
export const PERFORMANCES: readonly Performance[] = dialogue.performances as Performance[];
const BY_PHRASE = new Map<string, Performance[]>();
for (const p of PERFORMANCES) {
  const list = BY_PHRASE.get(p.phraseId) ?? [];
  list.push(p);
  BY_PHRASE.set(p.phraseId, list);
}

/** The performances of a phrase that are in the room (not retired, rejected or still being auditioned). */
export function performancesFor(phraseId: string): readonly Performance[] {
  return (BY_PHRASE.get(phraseId) ?? []).filter((p) => !p.retired && !p.audition);
}

/** How well a performance suits this moment: the field it was directed for, and the manner asked for. */
export function suitability(p: Performance, field: FieldValues, style?: VoiceStyle): number {
  // A weighted mean, not a sum: a reading directed for more feelings at once must not win
  // simply because it lists more of them.
  let s = 0, total = 0;
  for (const [k, w] of Object.entries(p.context) as [FieldKey, number][]) {
    s += w * field[k];
    total += w;
  }
  s = total ? s / total : 0;
  if (style && p.fits.includes(style)) s += 0.12;
  if (p.retired || p.audition) s -= 10;
  return s;
}

/** All recorded performances of a phrase, best first for this moment (deterministic). */
export function rankPerformances(phraseId: string, field: FieldValues, style?: VoiceStyle): Performance[] {
  return [...(BY_PHRASE.get(phraseId) ?? [])].sort((a, b) => suitability(b, field, style) - suitability(a, field, style) || (a.id < b.id ? -1 : 1));
}
