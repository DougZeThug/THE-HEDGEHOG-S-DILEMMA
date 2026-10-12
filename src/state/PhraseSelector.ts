import type { Dimension, Phase, Phrase, Surface, Tier } from '../content/types';
import { DIMENSIONS } from '../content/types';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import type { FieldValues } from './EmotionalField';
import type { Memory } from './Memory';
import type { Rng } from '../core/rng';

/** What the room is "reaching for" given its field. */
export function desireVector(f: FieldValues, phase: Phase): Record<Dimension, number> {
  const late = phase === 'transform' ? 1 : 0;
  return {
    happiness: f.warmth * 0.6 + f.relief * 0.3 + f.reminiscence * 0.3,
    affection: f.warmth * 0.6 + f.exposure * 0.2,
    nostalgia: f.reminiscence * 0.8 + f.solitude * 0.2,
    connection: f.warmth * 0.5 + f.solitude * 0.3,
    isolation: f.solitude * 0.7 + f.exposure * 0.2,
    fear: f.exposure * 0.7 + f.tension * 0.3,
    shame: f.exposure * 0.4 + f.tension * 0.2,
    grief: f.reminiscence * 0.4 + f.solitude * 0.3,
    anger: f.tension * 0.6,
    uncertainty: f.dissonance * 0.4 + f.hush * 0.3 + f.tension * 0.2,
    forgiveness: f.relief * 0.5 + f.hush * 0.3 + late * 0.3,
    desire: f.exposure * 0.3 + f.solitude * 0.4 + f.warmth * 0.2,
    relief: f.relief * 0.8 + f.hush * 0.3,
    self: f.hush * 0.6 + f.solitude * 0.3,
    misunderstanding: f.tension * 0.3 + f.dissonance * 0.4,
    contradiction: f.dissonance * 0.8,
  };
}

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

const TIER_OPEN: Record<Phase, Tier[]> = {
  arrival: ['arrival', 'near'],
  familiar: ['arrival', 'near', 'familiar'],
  contradiction: ['arrival', 'near', 'familiar', 'contradiction'],
  transform: ['arrival', 'near', 'familiar', 'contradiction', 'transform'],
};

export interface SelectQuery {
  /** Allowed tiers (defaults to those open in the phase, excluding still/annotation). */
  tiers?: Tier[];
  surfaces?: Surface[];
  exclude?: Set<string>;
  /** Only phrases that can be voiced. */
  voiced?: boolean;
  /** Extra per-phrase bias. */
  bias?: (p: Phrase) => number;
  /** 0 = follow the field, 1 = go against it. */
  contrast?: number;
  pool?: readonly Phrase[];
}

export interface SelectContext {
  field: FieldValues;
  phase: Phase;
  memory: Memory;
  now: number;
  /** Recently read phrase ids (most recent last). */
  recentRead: string[];
  rng: Rng;
}

export class PhraseSelector {
  temperature = 0.12;

  score(p: Phrase, ctx: SelectContext, q: SelectQuery = {}): number {
    const d = desireVector(ctx.field, ctx.phase);
    let max = 0;
    for (const k of DIMENSIONS) max = Math.max(max, d[k]);
    const inv = {} as Record<Dimension, number>;
    for (const k of DIMENSIONS) inv[k] = max - d[k];
    const c = q.contrast ?? 0.15;
    let s = (1 - c) * affinity(p, d) + c * affinity(p, inv) * 0.8;

    const m = ctx.memory.strength;
    const dims = p.dims;
    const kw = p.keywords ?? [];
    if (m.hesitation > 0.3 && (kw.some((k) => /stay|close|leave|almost|come/.test(k)) || ((dims.desire ?? 0) >= 0.4 && (dims.fear ?? 0) >= 0.3)))
      s += 0.3 * m.hesitation;
    if (m.warmth > 0.3) s += 0.18 * m.warmth * ((dims.happiness ?? 0) + (dims.nostalgia ?? 0)) * 0.6;
    if (m.stillness > 0.3) s += 0.18 * m.stillness * ((dims.self ?? 0) + (dims.relief ?? 0)) * 0.6;
    if (m.distance > 0.3) s += 0.15 * m.distance * ((dims.isolation ?? 0) + (dims.relief ?? 0)) * 0.6;
    if (m.closeness > 0.3) s += 0.15 * m.closeness * ((dims.affection ?? 0) + (dims.connection ?? 0)) * 0.6;

    // Relationship boost: phrases that answer something recently read.
    const recent = ctx.recentRead.slice(-6);
    for (const r of recent) {
      const rp = PHRASE_BY_ID.get(r);
      if (!rp) continue;
      if (rp.echoes?.includes(p.id) || p.echoes?.includes(r)) s += 0.2;
      if (rp.contradicts?.includes(p.id) || p.contradicts?.includes(r)) s += ctx.phase === 'arrival' || ctx.phase === 'familiar' ? 0.1 : 0.3;
    }

    // Recency: the room avoids repeating itself.
    const last = ctx.memory.surfaced.get(p.id);
    if (last !== undefined) s -= 0.6 * Math.exp(-(ctx.now - last) / 120);

    if (q.bias) s += q.bias(p);
    return s;
  }

  candidates(ctx: SelectContext, q: SelectQuery = {}): Phrase[] {
    const tiers = q.tiers ?? TIER_OPEN[ctx.phase].filter((t) => t !== 'near');
    const pool = q.pool ?? PHRASES;
    return pool.filter(
      (p) =>
        tiers.includes(p.tier) &&
        (!q.surfaces || q.surfaces.includes(p.surface)) &&
        !(q.exclude && q.exclude.has(p.id)) &&
        (!q.voiced || !!p.voice),
    );
  }

  /** Deterministic weighted choice among the best candidates. */
  select(ctx: SelectContext, q: SelectQuery = {}): Phrase | null {
    const cands = this.candidates(ctx, q);
    if (!cands.length) return null;
    const scored = cands.map((p) => ({ p, s: this.score(p, ctx, q) })).sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1));
    const top = scored.slice(0, 8);
    const best = top[0].s;
    const weights = top.map((x) => Math.exp((x.s - best) / this.temperature));
    const i = ctx.rng.weighted(weights);
    return i < 0 ? null : top[i].p;
  }
}

export { TIER_OPEN };
