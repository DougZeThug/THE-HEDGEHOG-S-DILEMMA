import { warmthOf } from '../Memory';
import { PHRASE_IDS, FRAGMENT_IDS } from '../../content/ids';
import { VOICE_FRAGMENT_BY_ID } from '../../content/relations';
import { isPhaseTurn } from '../rules';
import type { RuleHost } from './host';

/** Each recoil, in order: the room pulls back; then only the chair's glow does, the hurt in the chair; then no more. */
const RECOIL: { amount: number; chair?: boolean }[] = [{ amount: 1 }, { amount: 0.6, chair: true }];

/**
 * Coming close to the chair, and coming back to it. The room answers by subtraction; a voice near
 * the chair is rare.
 */
export class Approach {
  /** A very long, settled closeness has been thanked (once a visit). */
  private thanked = false;

  constructor(private readonly h: RuleHost) {}

  get spokenFirst(): boolean {
    return this.spokenFirstApproach;
  }

  /** When the room first recoiled at them (the visit's heart may answer it). */
  get firstRecoilAt(): number | null {
    return this.recoiledAt;
  }

  private spokenFirstApproach = false;
  private nearVoices = 0;
  private returnSeenAt = -Infinity;
  private recoils = 0;
  /** When the room first recoiled at them (the visit's heart may answer it). */
  private recoiledAt: number | null = null;
  private lastRecoilAt = -Infinity;

  /**
   * Coming close to the chair. Usually the room answers by subtraction — the hum drops,
   * the light settles. A voice near the chair is rare: at most twice in a visit.
   */
  tick() {
    const v = this.h.visitor;
    this.answerReturn();
    if (!v.near) return;
    // (Once they have come to it: walking past it is not coming to it.)
    if (!this.spokenFirstApproach && v.nearFor > 1.2 && v.lastApproach?.confirmed) {
      this.spokenFirstApproach = true;
      // Coming close is answered at once, quietly: the room goes still, and the chair is
      // either heard (a creak, as if someone just got up), breathed beside, or simply left alone.
      this.h.queue(0, { type: 'silence', depth: 0.4, seconds: 7 }, 'first-approach', { major: true, ttl: 4 });
      // Mostly the silence alone. An empty chair that breathes belongs late in a visit, if at all.
      const r = this.h.rng.next();
      if (r < 0.2 && this.h.shared.creaks < 2) {
        this.h.shared.creaks++;
        this.h.queue(2.5, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.3 }, 'first-approach');
      } else if (r < 0.45 && this.h.phase === 'transform' && !this.h.situations.claimed('chair-voice'))
        this.h.fragment('first-approach', VOICE_FRAGMENT_BY_ID.get(FRAGMENT_IDS.breath)!, { kind: 'chair' }, 5, 0.4);
      return;
    }
    const f = this.h.field.v;
    if (v.nearFor > 6 && this.nearVoices < 3 && !this.h.situations.claimed('chair-voice') && this.h.scheduler.ready('near-dwell', this.h.now, 45) && this.h.pacing.intenseFree(this.h.now) && !this.h.attending()) {
      this.h.scheduler.mark('near-dwell', this.h.now);
      if (!this.h.rng.chance(this.nearVoices === 0 ? 0.9 : 0.55)) return;
      this.nearVoices++;
      const exposed = f.exposure > f.warmth + 0.05;
      if (exposed) {
        // Closeness as pressure: an affectionate line, spoken flatly, from behind.
        const p = this.h.selector.select(this.h.ctx(), {
          voiced: true,
          tiers: ['arrival', 'familiar', 'contradiction'],
          bias: (x) => ((x.dims.affection ?? 0) + (x.dims.connection ?? 0) * 0.6) * 0.4 - (this.h.memory.spoken.has(x.id) ? 0.5 : 0),
        });
        if (p) this.h.speakPhrase('near-exposed', p, { kind: 'nowhere' }, 0, 'flat', 0.65);
      } else {
        // Closeness as company.
        const p = this.h.selector.select(this.h.ctx(), {
          voiced: true,
          tiers: ['arrival', 'familiar', 'still', ...(this.h.phase === 'transform' ? (['transform'] as const) : [])],
          bias: (x) => warmthOf(x.dims) * 0.3 + (x.dims.connection ?? 0) * 0.4 - (this.h.memory.spoken.has(x.id) ? 0.5 : 0),
        });
        if (p) this.h.speakPhrase('near-warm', p, { kind: 'chair' }, 0, p.voice === 'flat' ? 'tender' : p.voice, 0.7);
      }
    }
    // A very long, settled closeness late in the visit.
    if (v.nearFor > 45 && this.h.phase !== 'arrival' && !this.thanked) {
      this.thanked = true;
      this.h.reveal(PHRASE_IDS.thankStaying, 0, 'long-near', 'emerge', 14);
    }
  }

  /**
   * Coming back to the chair (docs/reviews/2026-11-core-loop.md). The first time someone comes to
   * it, it is met as it always was. Spines go up after being left: when they come back to it after
   * going away, the room recoils (its sound taken away at once and given back soon, its own light
   * pulled back toward the chair for a moment). Less the second time; then never again: the room
   * gets used to them. Walking past the chair is not coming to it (VisitorModel), and the words in
   * the air, rubbed out as they come back through them, are that return's answer.
   */
  private answerReturn() {
    const v = this.h.visitor;
    const a = v.lastApproach;
    if (!a?.confirmed || a.arrivedAt === null || a.arrivedAt <= this.returnSeenAt) return;
    this.returnSeenAt = a.arrivedAt;
    const comings = v.comings;
    const prev = comings[comings.length - 2];
    // A return: after a coming they left, and were away a while (not a step back and in again).
    if (!prev || prev.leftAt === null || a.enteredAt - prev.leftAt < 4 || prev.dwell < 6) return;
    if (this.recoils >= RECOIL.length) return;
    // Not inside a memory, a held silence or a memory's aftermath; not through words just rubbed out.
    if (this.h.scenes.active || this.h.aftermath() || this.h.now < this.h.shared.heldSilenceUntil || this.h.now - this.h.shared.airAt < 60) return;
    // (Nor on a turn of the visit that writes or dims, which it would cut short. A turn that does
    // neither is not one a visitor can see: QA, 2026-11-06, found the first return lost to it.)
    if (this.h.now - this.h.shared.markedTurnAt < 16 || this.h.scheduler.pending().some((e) => isPhaseTurn(e.payload.rule))) return;
    const r = RECOIL[this.recoils++];
    this.h.queue(0, { type: 'flinch', amount: r.amount, chair: r.chair }, 'return-recoil', { ttl: 0.5 });
    if (this.recoiledAt === null) this.recoiledAt = this.h.now;
    this.lastRecoilAt = this.h.now;
    this.h.field.nudge({ exposure: 0.2 * r.amount, tension: 0.1 * r.amount });
    // Then nothing written or said over it for a moment: a subtraction, left alone.
    this.h.pacing.holdFor(this.h.now, 7);
  }

  /**
   * A return to the chair that may be under way: they stayed with it and left it a moment ago, they
   * are coming back to it now, or the room has just recoiled at them. The visit's turn waits for it
   * (a few seconds of the room's own clock), so the return isn't lost to the turn: QA, 2026-11-06,
   * found the first return lost to it in 4 of 4 real-input runs, and the recoil now decides whether
   * the visit's heart is Almost. ("I was afraid you'd leave." then comes after the flinch.)
   */
  returnInReach(): boolean {
    if (this.h.now - this.lastRecoilAt < 9) return true;
    if (this.recoils >= RECOIL.length) return false;
    const v = this.h.visitor;
    const a = v.lastApproach;
    if (!a) return false;
    const c = v.comings;
    // Coming in now (in reach of the chair, not yet answered): the coming before it is what they left.
    const coming = a.leftAt === null && (a.confirmed ? a.arrivedAt! > this.returnSeenAt : this.h.now - a.enteredAt < 6);
    const left = coming ? c.filter((x) => x !== a).pop() : c[c.length - 1];
    if (!left || left.leftAt === null || left.dwell < 6) return false;
    return coming ? a.enteredAt - left.leftAt >= 4 : this.h.now - left.leftAt < 12;
  }
}
