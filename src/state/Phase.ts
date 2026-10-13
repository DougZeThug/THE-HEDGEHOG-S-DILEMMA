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
 * Rough shape for an engaged visitor: familiar within the first half-minute, contradiction
 * around the first minute, transformation between two and four minutes.
 */
export const PHASE_GATES: Record<Exclude<Phase, 'arrival'>, { depth: number; floor: number; fallback: number }> = {
  familiar: { depth: 3, floor: 10, fallback: 40 },
  contradiction: { depth: 10, floor: 38, fallback: 110 },
  transform: { depth: 26, floor: 125, fallback: 230 },
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
