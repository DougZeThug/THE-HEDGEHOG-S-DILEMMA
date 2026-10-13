import type { Phase } from '../content/types';
import type { VisitorModel } from './VisitorModel';
import type { Memory } from './Memory';
import type { Engagement } from './Engagement';

/**
 * Progression of possibilities. The room is never forced through a story. Each phase
 * opens when the visit has gone deep enough — through whatever the visitor does: reading,
 * coming back to a line, touching, approaching, pausing, writing — with a short floor so
 * nothing is rushed, and a time fallback so a visitor who simply stands and listens still
 * sees the room change.
 *
 * The floors are low on purpose, so that depth decides: a visitor who reads and returns to
 * lines gets there sooner than one who mostly walks about. Rough shape: familiar within the
 * first half-minute, contradiction around the first minute (two at most), transformation
 * between two and four minutes for an engaged visitor; five for one who barely moves.
 */
export const PHASE_GATES: Record<Exclude<Phase, 'arrival'>, { depth: number; floor: number; fallback: number }> = {
  familiar: { depth: 3, floor: 8, fallback: 40 },
  contradiction: { depth: 16, floor: 25, fallback: 120 },
  transform: { depth: 45, floor: 100, fallback: 300 },
};

export class PhaseTracker {
  phase: Phase = 'arrival';
  changedAt = 0;

  update(v: VisitorModel, m: Memory, e: Engagement): Phase | null {
    const t = v.t;
    // A formed motif is the room recognising a pattern: it counts toward depth.
    const depth = e.depth + m.formed.size * 2;
    const next: Phase | null = this.phase === 'arrival' ? 'familiar' : this.phase === 'familiar' ? 'contradiction' : this.phase === 'contradiction' ? 'transform' : null;
    if (!next) return null;
    const g = PHASE_GATES[next];
    // Each phase also lasts a little while before the next can open.
    const settled = t - this.changedAt >= (next === 'familiar' ? 0 : 20);
    if ((t >= g.floor && depth >= g.depth && settled) || t >= g.fallback) {
      this.phase = next;
      this.changedAt = t;
      return next;
    }
    return null;
  }
}
