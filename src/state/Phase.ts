import type { Phase } from '../content/types';
import type { VisitorModel } from './VisitorModel';
import type { Memory } from './Memory';

/**
 * Progression of possibilities. The room is never forced through a story: each phase
 * opens when time *and* some engagement suggest the visitor has settled in, with a
 * generous time fallback so that a visitor who simply stands and listens still sees the
 * room change. Stillness counts as engagement.
 */
export class PhaseTracker {
  phase: Phase = 'arrival';
  changedAt = 0;

  update(v: VisitorModel, m: Memory): Phase | null {
    const t = v.t;
    const formed = m.formed.size;
    let next: Phase | null = null;
    if (this.phase === 'arrival') {
      if ((t > 40 && (v.read.size >= 2 || v.approaches.length >= 1 || v.totalStill > 15)) || t > 95) next = 'familiar';
    } else if (this.phase === 'familiar') {
      if (
        (t > 140 && (v.approaches.length >= 2 || v.read.size >= 8 || m.has('hesitation') || v.longestStill > 25 || formed >= 1)) ||
        t > 290
      )
        next = 'contradiction';
    } else if (this.phase === 'contradiction') {
      if ((t > 320 && (formed >= 2 || v.read.size >= 18 || v.totalStill > 90)) || t > 520) next = 'transform';
    }
    if (next) {
      this.phase = next;
      this.changedAt = t;
    }
    return next;
  }
}
