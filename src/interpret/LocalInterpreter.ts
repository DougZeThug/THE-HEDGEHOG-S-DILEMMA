import { DIMENSIONS, type Dimension, type DimVector } from '../content/types';
import { LEXICON } from '../content/relations';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import { affinity } from '../state/PhraseSelector';
import type { Interpreter } from './Interpreter';
import { validateInterpretation, type Gesture, type Interpretation } from './schema';

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z' ?]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

function stemLookup(w: string): DimVector | undefined {
  if (LEXICON[w]) return LEXICON[w];
  for (const suf of ['ing', 'ed', 'es', 's', 'ly', 'ness']) {
    if (w.endsWith(suf) && w.length > suf.length + 2) {
      const base = w.slice(0, -suf.length);
      if (LEXICON[base]) return LEXICON[base];
      if (LEXICON[base + 'e']) return LEXICON[base + 'e'];
    }
  }
  return undefined;
}

/**
 * Local, deterministic interpretation of a contribution. It reads cues of tense,
 * address, negation and theme, maps them to dimensions with authored weights, and finds
 * phrases on the walls that rhyme with — or quietly contradict — what was offered.
 */
export function interpretLocally(text: string): Interpretation {
  const raw = text.trim().slice(0, 280);
  const lower = raw.toLowerCase();
  const tokens = tokenize(raw);
  const acc: Record<Dimension, number> = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;
  const add = (v: DimVector, k = 1) => {
    for (const d of DIMENSIONS) if (v[d]) acc[d] += v[d]! * k;
  };

  let hits = 0;
  for (let i = 0; i < tokens.length; i++) {
    const v = stemLookup(tokens[i]);
    if (!v) continue;
    hits++;
    const negated = i > 0 && /^(not|no|never|don't|didn't|can't|won't|isn't|wasn't|nobody)$/.test(tokens[i - 1]);
    // Negation does not invert a feeling; it makes it ambivalent.
    add(v, negated ? 0.6 : 1);
    if (negated) acc.contradiction += 0.35;
  }

  let tense: Interpretation['tense'] = 'none';
  if (/\b(used to|back then|when i was|anymore|remember|was|were|had|did)\b/.test(lower)) tense = 'past';
  else if (/\b(will|going to|someday|one day|tomorrow)\b/.test(lower)) tense = 'future';
  else if (/\b(am|is|are|now|today)\b/.test(lower)) tense = 'present';
  if (tense === 'past') add({ nostalgia: 0.4, grief: 0.15 });
  if (tense === 'future') add({ desire: 0.3, uncertainty: 0.3 });

  const question = raw.endsWith('?') || /^(why|how|what|who|do|does|did|is|are|can|will|would)\b/.test(lower);
  if (question) add({ uncertainty: 0.4, misunderstanding: 0.15 });

  const selfRefs = tokens.filter((t) => t === 'i' || t === 'me' || t === 'my' || t === 'myself' || t.startsWith("i'")).length;
  const youRefs = tokens.filter((t) => t === 'you' || t === 'your' || t === "you're").length;
  if (selfRefs) add({ self: Math.min(0.5, selfRefs * 0.15) });
  if (youRefs) add({ connection: Math.min(0.4, youRefs * 0.15), desire: 0.1, misunderstanding: 0.08 });
  if (/\bbut\b|\byet\b|\balthough\b/.test(lower)) acc.contradiction += 0.3;

  // Nothing recognised: treat the words as an ordinary object — ordinary things carry memory.
  if (hits === 0 && !question) add({ nostalgia: 0.3, self: 0.2, uncertainty: 0.2 });

  let max = 0;
  for (const d of DIMENSIONS) max = Math.max(max, acc[d]);
  const dims: DimVector = {};
  for (const d of DIMENSIONS) if (acc[d] > 0.05) dims[d] = max > 1 ? acc[d] / max : acc[d];

  // Related phrases: affinity + shared words.
  const full = Object.fromEntries(DIMENSIONS.map((d) => [d, dims[d] ?? 0])) as Record<Dimension, number>;
  const tokenSet = new Set(tokens);
  const scored = PHRASES.filter((p) => p.tier !== 'annotation')
    .map((p) => {
      const kw = (p.keywords ?? []).filter((k) => k.split(' ').every((w) => tokenSet.has(w))).length;
      return { p, s: affinity(p, full) + kw * 0.45 };
    })
    .sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1));
  const related = scored.slice(0, 3).map((x) => x.p.id);

  const contradictions: string[] = [];
  for (const id of related) for (const c of PHRASE_BY_ID.get(id)?.contradicts ?? []) if (!contradictions.includes(c) && !related.includes(c)) contradictions.push(c);

  const intensity = Math.min(1, 0.25 + hits * 0.12 + raw.length / 300);
  const g: Gesture[] = ['writeOnWall', 'quiet', 'revealRelated'];
  if ((dims.nostalgia ?? 0) + (dims.grief ?? 0) > 0.6 || tense === 'past') g.push('distantRecollection');
  if ((dims.contradiction ?? 0) > 0.25 || question || contradictions.length) g.push('rearrange');
  if (hits > 0) g.push('temperatureShift');
  if ((dims.happiness ?? 0) > 0.5 || (dims.affection ?? 0) > 0.5) g.push('music');

  return validateInterpretation({ dims, related, contradictions: contradictions.slice(0, 2), gestures: g, intensity, tense, question })!;
}

export class LocalInterpreter implements Interpreter {
  readonly name = 'local';
  async interpret(text: string): Promise<Interpretation> {
    return interpretLocally(text);
  }
}
