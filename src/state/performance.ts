import { DIALOGUE_PERFORMANCES, type DialoguePerformance } from '../content/dialogue';
import type { VoiceStyle } from '../content/types';
import type { FieldKey, FieldValues } from './EmotionalField';

/**
 * Recorded performances. The Director chooses among authored variants of a phrase by
 * the room's current field — the same sentence can be tender, guarded or remembered —
 * using only the existing EmotionalField; nothing here is a second emotional engine.
 */
export type Performance = Omit<DialoguePerformance, 'context'> & { context: Partial<Record<FieldKey, number>> };

const BY_PHRASE = new Map<string, Performance[]>();
for (const p of DIALOGUE_PERFORMANCES as readonly Performance[]) {
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

/** How far apart two readings are: the field they were directed for, and the voice. */
function distance(a: Performance, b: Performance): number {
  const keys = new Set([...Object.keys(a.context), ...Object.keys(b.context)]) as Set<FieldKey>;
  let d = 0;
  for (const k of keys) d += ((a.context[k] ?? 0) - (b.context[k] ?? 0)) ** 2;
  return d + (a.voice !== b.voice ? 0.5 : 0);
}

/**
 * The readings of a phrase to offer for this moment, the one to play first. The best for the field
 * and the manner asked for; but a phrase already heard (`heardId`, the reading played) comes back
 * in the reading furthest from it, among those in the room: rejected and unheard takes stay last,
 * however different, and the reading already heard is the last of the others.
 */
export function pickReadings(phraseId: string, field: FieldValues, style: VoiceStyle | undefined, heardId?: string): Performance[] {
  const ranked = rankPerformances(phraseId, field, style);
  if (!heardId || ranked.length <= 1) return ranked;
  const first = ranked.find((r) => r.id === heardId);
  const dist = (r: Performance) => (first ? distance(r, first) : 0);
  const out = (r: Performance) => !!(r.retired || r.audition);
  const others = ranked.filter((r) => r.id !== heardId);
  return others.filter((r) => !out(r)).sort((a, b) => dist(b) - dist(a)).concat(first ? [first] : [], others.filter(out));
}
