import { PHRASE_BY_ID } from '../../content/phrases';
import { WITHHELD_WHILE_UNFINISHED } from '../../content/relations';

/** Which lines the walls have been told to hold, finish or leave alone this visit. */
export class WallLedger {
  /** Lines the opening left unfinished on the wall. */
  readonly unfinished = new Set<string>();
  /** Lines the room has written as it filled (what accumulates stays: the room remembers it). */
  readonly accumulating = new Set<string>();
  /**
   * Lines kept off the walls for the rest of the visit: their own place is beside the line written
   * where the woodland's painting was, and written there they would run on from it (decision 137).
   */
  readonly keptBack = new Set<string>();
  /** Ordinary lines written on another wall than their own. */
  readonly moved = new Set<string>();

  keepBack(ids: readonly string[]): void {
    for (const id of ids) this.keptBack.add(id);
  }

  /**
   * While a line is left unfinished, nothing answers it: not its echoes, not what contradicts
   * it, not other lines about going or staying. The visitor finishes it, or nobody does. And the
   * lines kept back for the rest of the visit (`keepBack`).
   */
  withheld(): string[] {
    if (!this.unfinished.size) return [...this.keptBack];
    const out = new Set<string>(this.keptBack);
    for (const id of this.unfinished) {
      const p = PHRASE_BY_ID.get(id);
      for (const r of [...(p?.echoes ?? []), ...(p?.contradicts ?? [])]) out.add(r);
      for (const r of WITHHELD_WHILE_UNFINISHED[id] ?? []) out.add(r);
    }
    return [...out];
  }
}
