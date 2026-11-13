import { PHRASE_BY_ID } from '../../content/phrases';
import type { Cue } from '../cues';
import { RULE, ROOM_OWN, isMeetingOrContribution, isSituation, isSituationLife, parseEncounterRule } from '../rules';
import { isMemoryOrHeartKey } from '../writeKeys';
import type { QueueOptions, RuleHost } from './host';

/** What cue admission needs of the rule groups it keeps in step. */
export interface AdmissionLink {
  /** The north wall is held for the heart's answer. */
  northKept(): boolean;
  /** Whether a cue would write, reveal or re-ink something on the north wall. */
  onNorth(cue: Cue): boolean;
  /** The way out is shown and is this line (it is never culled). */
  isWayOut(phraseId: string): boolean;
  aftermathUntil(): number;
  /** A draw from the room's own gap stream (so the visit's other choices are unchanged by it). */
  gap(min: number, max: number): number;
  /** When the visit's turn may sound, `want` seconds from now at the earliest, and whether with its dark. */
  turnClear(want: number): { delay: number; dark: boolean };
  writeFailed(key: string): void;
  kitchenLightLost(): void;
  silenceLost(): void;
  rewindEncounter(phraseId: string, n: number): void;
  forgetReading(phraseId: string): void;
}

/**
 * Cue admission: a cue the scheduler says is due is let through, put back to wait, or refused, and
 * the Director's model of what is visible is kept in step with what is let through. A cue that
 * was decided on and never sounded is undone: whatever it was counted for is given back.
 */
export class Admission {
  constructor(
    private readonly h: RuleHost,
    private readonly link: AdmissionLink,
  ) {}

  /** `opts`: how the cue was scheduled (put back the same when it must wait). */
  admit(cue: Cue, rule: string, opts: QueueOptions): boolean {
    this.dueOpts = opts;
    return this.accept(cue, rule);
  }

  /** How the cue now being accepted was scheduled (put back the same when it must wait). */
  private dueOpts: QueueOptions = {};

  /** A voice that was decided on but never sounded: undo what it was counted for. */
  lost(cue: Cue, rule: string) {
    // A memory that never found room isn't spent: it waits for the next look.
    if (cue.type === 'memory-scene' || cue.type === 'vignette') this.h.scenes.cancel(cue.id, this.h.now);
    if (cue.type === 'memory') this.link.kitchenLightLost();
    // A memory's line, or the heart's, decided on and never written: as if it found no room (not spent).
    if (cue.type === 'write' && isMemoryOrHeartKey(cue.key)) this.link.writeFailed(cue.key);
    // The held silence that never sounded: the visit still has it.
    if (cue.type === 'silence' && (rule === RULE.heldSilence || rule === RULE.tableSilence)) this.link.silenceLost();
    if (cue.type !== 'voice' || !cue.phraseId) return;
    // A line the room was finishing, unheard: it is still unfinished.
    if (cue.finish) this.h.ledger.unfinished.add(cue.phraseId);
    // A voice that was to write its line as it was heard: the line was marked as there when the
    // voice was queued. Unheard, it was never written, so it isn't there.
    if (cue.write) this.unwrite(cue.phraseId);
    if (this.h.memory.spoken.get(cue.phraseId) !== undefined) this.h.memory.spoken.delete(cue.phraseId);
    this.link.forgetReading(cue.phraseId);
    const enc = parseEncounterRule(rule);
    if (enc) this.link.rewindEncounter(enc.phraseId, enc.n);
  }

  /** A line marked as there when its voice was queued, to be written as it was heard, that won't be. */
  unwrite(id: string) {
    const st = this.h.visible.get(id);
    if (st?.base && this.h.ledger.accumulating.has(id)) {
      this.h.visible.delete(id);
      this.h.ledger.accumulating.delete(id);
      this.h.memory.surfaced.delete(id);
    }
  }

  /** Keep the Director's model of what is visible in sync with the cues it lets through. */
  private accept(cue: Cue, rule: string): boolean {
    // After the room's last music, none of its own again, nor anyone humming.
    if (this.h.musicWithdrawn && (cue.type === 'music' || (cue.type === 'voice' && cue.kind === 'hum'))) return false;
    // A situation that took the chair's voice or the space beyond the walls after this was
    // queued keeps it: claims hold at the moment of sounding, not only when queued.
    if (cue.type === 'voice' && !isSituation(rule)) {
      if (cue.position.kind === 'chair' && this.h.situations.claimed('chair-voice')) return false;
      if (cue.position.kind === 'beyond' && this.h.situations.claimed('beyond')) return false;
    }
    if (cue.type === 'music' && !isSituation(rule) && this.h.situations.claimed('music')) return false;
    // Nothing sounds over a memory: a situation's laugh or murmur waits too (it is emitted
    // directly, not through the voice rules that already wait).
    // (A meeting's or a contribution's gesture was counted when it was decided: it waits, not lost.)
    if (this.h.scenes.active && (cue.type === 'sound' || cue.type === 'music') && isMeetingOrContribution(rule)) {
      this.h.queue(4, cue, rule, { ...this.dueOpts, major: true });
      return false;
    }
    if (this.h.scenes.active && ((cue.type === 'voice' && (!cue.finish || this.h.vignettePlaying)) || cue.type === 'sound' || cue.type === 'music')) return false;
    if (cue.type === 'reveal' && this.h.withheld().includes(cue.phraseId)) return false;
    // Once the heart's answer is written, the north wall is left as the heart left it: nothing new
    // is written, revealed or re-inked there for the rest of the visit (the visitor's own words
    // aside). One peak, and its last word (creative director, 2026-11-06).
    if (this.link.northKept() && this.link.onNorth(cue) && rule !== RULE.contribution) return false;
    // (A voice queued to write its line there before the wall was held is heard, and writes nothing.)
    if (cue.type === 'voice' && cue.write && cue.phraseId && this.link.northKept() && PHRASE_BY_ID.get(cue.phraseId)?.surface === 'north') {
      this.unwrite(cue.phraseId);
      delete cue.write;
    }
    // (Nor is a line kept back written again in its own place: decision 137, QA 2026-10-20.)
    if (cue.type === 'redraw' && this.h.ledger.keptBack.has(cue.phraseId)) return false;
    // A situation's own sounds wait out a memory's aftermath (those answering the visitor don't).
    if (this.h.aftermath() && isSituationLife(rule) && (cue.type === 'voice' || cue.type === 'sound' || cue.type === 'music')) {
      this.h.queue(this.link.aftermathUntil() - this.h.now + 1, cue, rule, this.dueOpts);
      return false;
    }
    // Nothing of the room's own comes in a memory's aftermath, or while the room is holding (a
    // held silence; the visitor staying with the kitchen-light line), even if it was decided
    // before: it waits until after (and the scheduler spaces what was waiting).
    if (ROOM_OWN.test(rule) && !isSituation(rule) && (this.h.aftermath() || this.h.pacing.holding(this.h.now))) {
      // (After an aftermath, the first a few seconds after it.)
      const after = this.h.aftermath() ? this.link.aftermathUntil() + this.link.gap(3, 6) : this.h.pacing.heldUntil + 1;
      this.h.queue(Math.max(after, this.h.now + 1) - this.h.now, cue, rule, this.dueOpts);
      return false;
    }
    // Nor do they break into a held silence (a laugh on a timer, landing in the middle of it): after it, and its exhale.
    if (this.h.pacing.holding(this.h.now) && isSituationLife(rule) && (cue.type === 'voice' || cue.type === 'sound' || cue.type === 'music')) {
      this.h.queue(this.h.pacing.heldUntil - this.h.now + 6, cue, rule, this.dueOpts);
      return false;
    }
    // The visit's turn, due while a vignette plays or just after one: it waits until it is clear.
    if (rule === RULE.phaseTransform && cue.type === 'silence' && !this.h.departing) {
      const { delay: d0, dark } = this.link.turnClear(this.h.vignettePlaying ? 30 : 0);
      const delay = Math.max(d0, this.h.aftermath() ? this.link.aftermathUntil() - this.h.now + 1 : 0);
      if (delay > 0) {
        const { dim: _d, dimSeconds: _s, ...rest } = cue;
        this.h.queue(delay, dark ? cue : rest, rule, { major: true, ttl: 30 });
        return false;
      }
    }
    // While a living memory plays, the room waits with it: no silence (a dim would darken the
    // painting), no new line revealed or written.
    if (this.h.scenes.active && isMeetingOrContribution(rule) && (cue.type === 'silence' || cue.type === 'reveal' || cue.type === 'write')) {
      this.h.queue(4, cue, rule, { ...this.dueOpts, major: cue.type === 'silence' });
      return false;
    }
    if (this.h.scenes.active && (cue.type === 'silence' || cue.type === 'reveal' || (cue.type === 'write' && rule !== RULE.memoryOffer))) return false;
    if (this.h.scenes.active) {
      // Nor anything else that would move or appear. What the room had decided on (a drawing, words
      // in the air, the kitchen's light, a line rubbed out or let go) waits until the memory has
      // gone (it is already counted as done, so dropping it would lose it); a passing flash, glow,
      // nudge of the chair or link between lines simply doesn't happen.
      if (cue.type === 'draw' || cue.type === 'air' || cue.type === 'memory' || cue.type === 'erode' || cue.type === 'hide') {
        this.h.queue(4, cue, rule, { major: cue.type === 'air' || cue.type === 'memory' });
        return false;
      }
      if (cue.type === 'flash' || cue.type === 'glow' || cue.type === 'chairNudge' || cue.type === 'chairTurn' || cue.type === 'link' || (cue.type === 'redraw' && rule !== RULE.memoryOffer)) return false;
    }
    if (cue.type === 'reveal') {
      const cur = this.h.visible.get(cue.phraseId);
      if (cur && cur.mode === 'shown') return false;
      if (cue.mode === 'still' && this.h.visitor.stillFor < 2) return false;
      this.h.visible.set(cue.phraseId, { mode: cue.mode === 'still' ? 'still' : 'shown', since: this.h.now, base: this.h.ledger.accumulating.has(cue.phraseId) });
      this.h.memory.surfaced.set(cue.phraseId, this.h.now);
      this.cull();
    } else if (cue.type === 'hide') {
      const cur = this.h.visible.get(cue.phraseId);
      if (!cur || cur.base) return false;
      this.h.visible.delete(cue.phraseId);
    }
    return true;
  }

  private budget(): number {
    return { arrival: 3, familiar: 8, contradiction: 12, transform: 16 }[this.h.phase];
  }

  private cull() {
    // (Never the way out, once it is the way out: Codex review, PR #56.)
    const revealed = [...this.h.visible.entries()].filter(([id, s]) => !s.base && s.mode === 'shown' && !this.link.isWayOut(id));
    const over = revealed.length - this.budget();
    if (over <= 0) return;
    revealed.sort((a, b) => a[1].since - b[1].since);
    for (const [id] of revealed.slice(0, over)) {
      if (id === this.h.visitor.gazeId) continue;
      this.h.queue(0.5, { type: 'hide', phraseId: id, seconds: 14 }, 'cull');
    }
  }
}
