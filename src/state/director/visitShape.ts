import type { DEPARTURE_BY_VISIT } from '../../content/relations';
import type { VisitorModel } from '../VisitorModel';

/**
 * How the visit went with the chair, read from the visitor model alone (nothing here is state):
 * whether it stayed close (kept for the next visit, docs/reviews/2026-10-emotional-depth.md), whether
 * they came back after going away, and the one word the departure line is chosen by.
 */

/**
 * Whether this visit stayed close to the chair (knelt there, or stayed by it a while).
 * (Walking past the chair is not staying with it, and staying means a long while: the chair
 * turned away on the next visit, and its line, belong to a visit that stayed, not to most visits
 * — they had come to be for nearly four in five, docs/reviews/2026-11-core-loop.md.)
 */
export function stayedClose(v: VisitorModel): 'close' | null {
  return v.kneelTime >= 8 || v.comings.some((a) => a.dwell >= 45 || (a.leftAt === null && v.t - a.enteredAt >= 45)) ? 'close' : null;
}

/** They came near, went away past the withdraw distance, and came near again and stayed a little (≥ 8 s). */
export function cameBack(v: VisitorModel, before = Infinity): boolean {
  const c = v.comings;
  for (let i = 1; i < c.length; i++) {
    if (c[i].enteredAt > before) break;
    // Away a while (gone, not a step back and in again: 20 s), then near again for a moment.
    const away = c.slice(0, i).some((a) => a.leftAt !== null && c[i].enteredAt - a.leftAt >= 20);
    const stayed = c[i].dwell >= 8 || (c[i].leftAt === null && v.t - c[i].enteredAt >= 8);
    if (away && stayed) return true;
  }
  return false;
}

/** How the visit went with the chair, in one word (see DEPARTURE_BY_VISIT). */
export function visitShape(v: VisitorModel, how: 'door' | 'menu' = 'menu'): keyof typeof DEPARTURE_BY_VISIT {
  const comings = v.comings;
  if (how === 'door') return 'door';
  // How it ended first: leaving from a long stay by it is "still warm where you were"; then coming
  // back, the dilemma itself; then having stayed close earlier.
  const last = comings[comings.length - 1];
  if (last && (last.leftAt === null ? v.t - last.enteredAt : last.dwell) >= 25 && (last.leftAt === null || v.t - last.leftAt < 30)) return 'close';
  if (cameBack(v)) return 'cameBack';
  if (stayedClose(v) === 'close') return 'close';
  if (comings.length && comings[comings.length - 1].leftAt !== null) return 'refused';
  if (!comings.length) return 'apart';
  return 'otherwise';
}
