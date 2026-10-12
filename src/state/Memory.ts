import { clamp } from '../core/math';
import type { VisitorModel } from './VisitorModel';
import { PHRASE_BY_ID } from '../content/phrases';
import type { DimVector } from '../content/types';

/**
 * Memory — patterns the room notices across a visit. Each motif has a strength in
 * 0..1; once a motif reaches 1 it is "formed" and stays formed for the session.
 * Motifs bias what the room offers later; they are never shown to the visitor.
 */
export const MOTIFS = ['hesitation', 'closeness', 'distance', 'stillness', 'warmth', 'wandering', 'reading', 'contributor'] as const;
export type Motif = (typeof MOTIFS)[number];

export function warmthOf(d: DimVector): number {
  return (d.happiness ?? 0) + (d.affection ?? 0) * 0.8 + (d.nostalgia ?? 0) * 0.7 + (d.relief ?? 0) * 0.4;
}

export class Memory {
  strength: Record<Motif, number> = {
    hesitation: 0, closeness: 0, distance: 0, stillness: 0, warmth: 0, wandering: 0, reading: 0, contributor: 0,
  };
  formed = new Map<Motif, number>();
  /** Warm phrases the visitor spent time with — candidates to resurface later. */
  warmMemories: string[] = [];
  warmGaze = 0;
  contributions: { dims: DimVector; at: number }[] = [];
  /** Recently surfaced phrase ids with time — for recency penalties. */
  surfaced = new Map<string, number>();
  spoken = new Map<string, number>();

  /** Returns motifs newly formed on this update. */
  update(v: VisitorModel, dt: number): Motif[] {
    if (v.gazeId) {
      const ph = PHRASE_BY_ID.get(v.gazeId);
      if (ph && warmthOf(ph.dims) >= 0.9) {
        this.warmGaze += dt;
        if ((v.gazeTotals.get(v.gazeId) ?? 0) > 2.5 && !this.warmMemories.includes(v.gazeId)) this.warmMemories.push(v.gazeId);
      }
    }
    const s = this.strength;
    s.hesitation = clamp((v.hesitations - 0.5) / 2.5);
    s.closeness = clamp(v.totalNear / 45 + v.kneelTime / 30);
    s.distance = clamp(v.totalFar / 150 - v.approaches.length * 0.15);
    s.stillness = clamp(Math.max(v.longestStill / 35, v.totalStill / 80));
    s.warmth = clamp(this.warmGaze / 18);
    s.wandering = clamp((v.surfacesVisited.size / 4) * (v.movedDistance / 55));
    s.reading = clamp(v.read.size / 24);
    s.contributor = clamp(this.contributions.length / 1);
    const out: Motif[] = [];
    for (const m of MOTIFS) {
      if (s[m] >= 1 && !this.formed.has(m)) {
        this.formed.set(m, v.t);
        out.push(m);
      }
    }
    return out;
  }

  has(m: Motif): boolean {
    return this.formed.has(m);
  }

  /** The motif that most characterised the visit (for the departure line). */
  dominant(): Motif | null {
    let best: Motif | null = null;
    let bv = 0.55;
    for (const m of MOTIFS) {
      const w = this.strength[m] * (m === 'reading' ? 0.7 : 1) * (m === 'contributor' ? 0.9 : 1);
      if (w > bv) {
        bv = w;
        best = m;
      }
    }
    return best;
  }

  snapshot() {
    const o: Record<string, number> = {};
    for (const m of MOTIFS) o[m] = +this.strength[m].toFixed(2);
    return { strength: o, formed: [...this.formed.keys()], warmMemories: this.warmMemories.slice(-5), contributions: this.contributions.length };
  }
}
