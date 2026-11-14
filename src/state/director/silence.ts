import { MEMORY_IDS } from '../../content/ids';
import { phaseAtLeast } from '../Phase';

import { RULE } from '../rules';
import type { RuleHost } from './host';

/** What the held silence needs to know of the way out. */
interface SilenceLink {
  /** The room is letting them go, or has just been kept from going: the silence waits. */
  wayOutRecent(): boolean;
}

/** The long held silence, once a visit, and the lift when it was held at the chair. */
export class Silence {
  constructor(
    private readonly h: RuleHost,
    private readonly link: SilenceLink,
  ) {}

  /** The held silence that never sounded: the visit still has it. */
  lost(): void {
    this.heldSilenceDone = false;
    this.h.shared.heldSilenceUntil = -Infinity;
  }

  /** The held silence at the chair has begun to sound: while the visitor stays it lasts. */
  tableSounded(seconds: number): void {
    this.tableFrom = this.h.now;
    this.tableUntil = this.h.now + seconds;
  }

  private heldSilenceDone = false;

  /** When the held silence could first have come (it may wait a little for the chair). */
  private heldDueAt: number | null = null;

  /** The held silence at the chair: while the visitor stays it lasts; moving away lifts it. */
  private tableUntil = -Infinity;
  private tableFrom = -Infinity;

  /**
   * Once, after the first couple of minutes, the room holds a long silence: the hum almost
   * gone, nothing written, nobody speaking, for half a minute or so. Nothing interrupts it.
   */
  tick() {
    if (this.heldSilenceDone || this.h.now < 120 || !phaseAtLeast(this.h.phase, 'contradiction')) return;
    const v = this.h.visitor;
    // "The table" (docs/reviews/2026-10-emotional-depth.md): once a meal shared at a table has been
    // heard (cereal, or the last biscuit; this visit or before), the room's one held silence waits
    // for the visitor to be alone with the chair — still, within 2.5 m, looking at it — and comes
    // there: the room goes under and draws in to the chair, and lifts when they walk away. Never as
    // a memory's tail (45 s clear of one: F ends at the chair too). It waits for them at most
    // 45 s past when it would have come (two minutes while they are with the chair); then, or for
    // anyone else, it comes as it always has.
    const table = this.h.scenes.heard(MEMORY_IDS.cereal) || this.h.scenes.heard(MEMORY_IDS.biscuit);
    const atChair = v.distance <= 2.5 && v.stillFor >= 8 && v.gazeChairFor >= 3 && this.h.now - this.h.scenes.lastEnded >= 45
      && !this.h.scenes.claimsChair(this.h.now, (id) => !this.h.ledger.unfinished.has(id), v.distance);
    if (this.h.pacing.sinceDev(this.h.now) < 8 || !this.h.scheduler.majorFree(this.h.now) || this.h.attending() || v.speed > 0.5) return;
    if (this.h.aftermath()) return;
    // (Nor on the way out, nor just after it: the room coming back must come back.)
    if (this.link.wayOutRecent()) return;
    this.heldDueAt ??= this.h.now;
    // (While they are there with the chair, it keeps waiting for its moment, up to two minutes.)
    const withChair = v.distance <= 2.5 && v.gazeChairFor >= 3;
    if (table && !atChair && this.h.now < this.heldDueAt + (withChair ? 120 : 45)) return;
    this.heldSilenceDone = true;
    const seconds = this.h.rng.range(30, 42);
    this.h.shared.heldSilenceUntil = this.h.now + seconds;
    const there = table && atChair;
    this.h.queue(0, { type: 'silence', depth: 0.92, seconds, dim: 0.15, dimSeconds: there ? seconds : 16 }, there ? RULE.tableSilence : RULE.heldSilence, { major: true, ttl: 10 });
  }

  tableLift() {
    // (Only once the silence has really begun: set when it sounds, in the dispatch.)
    if (this.h.now >= this.tableUntil) return;
    const v = this.h.visitor;
    // (Not a proximity switch: walking away past 3 m, not stepping round the chair to see it;
    // and a breath after they cross it, not on the step.)
    if (v.distance <= 3) return;
    // If the visit turned to its last phase inside this silence, that silence was the turn: it
    // keeps at least the turn's own 14 s before it lets go.
    const turnInside = this.h.shared.transformAt >= this.tableFrom && this.h.shared.transformAt < this.h.now;
    const at = Math.max(this.h.now + 1.5, turnInside ? this.h.shared.transformAt + 14 : -Infinity);
    this.tableUntil = -Infinity;
    this.h.shared.heldSilenceUntil = at;
    this.h.pacing.release(at);
    this.h.queue(at - this.h.now, { type: 'lift', seconds: 10 }, 'resonance:table-lift');
  }
}
