// The visit's heart (docs/reviews/2026-11-emotional-arc.md)
import { PHRASE_IDS } from '../../content/ids';
import { Rng } from '../../core/rng';
import { HEART_AFTER_RECOIL, HEART_ANSWER, HEART_DECIDE, HEART_RETRY, heartOf, type HeartShape } from '../../content/memories';
import { PHRASE_BY_ID, PHRASES } from '../../content/phrases';
import type { Cue } from '../cues';
import { stayedClose } from './visitShape';
import { WriteKeys, isHeartKey } from '../writeKeys';
import type { RuleHost } from './host';

/** The room's north wall lines: held for the heart's answer. */
export const NORTH_LINES: readonly string[] = PHRASES.filter((p) => p.surface === 'north').map((p) => p.id);

export interface HeartOptions {
  seed: number;
  /** The last visit's heart answer (a phrase id), if this visit should find it. */
  answer: string | null;
  /** Memories seen on earlier visits (they weigh a shared heart). */
  memoryCounts: Record<string, number>;
  /** `noHeart` turns the visit's heart off (the room before it, for comparison). */
  enabled: boolean;
  /** Whether a piece of writing is in the visitor's view now. */
  inView: (phraseId: string) => boolean;
  /** When the room first recoiled at them, if it has. */
  recoiledAt: () => number | null;
}

/**
 * One painted memory a visit is the visit's heart; what it leaves is one line beside the room's
 * first, kept for the next visit. This group decides which, writes and finds the answer, and holds
 * the north wall while the answer waits for room there.
 */
export class Heart {
  /** The last visit's heart answer, if this visit should find it. */
  private readonly pastAnswer: string | null;
  /** This visit's heart has been seen (its id), and its answer when written. */
  private heartSeen: string | null = null;
  private heartAnswerAt = Infinity;
  /** The answer written beside "I wanted you to stay." (a phrase id), once. */
  answer: string | null = null;
  private answerInView = 0;
  /** The answer found no room beside the first line: it is tried again (`heartAnswerAt`). */
  private answerWaits = false;
  private keptFound = false;
  private keptAgainAt = 0;
  /** The last visit's answer found no room beside the first line: the wall is held until it is tried again. */
  private keptWaits = false;
  /** The visitor asked to be forgotten: the last visit's answer is not written from then on. */
  private pastForgotten = false;
  /** Memories seen on earlier visits. */
  memoryCounts: Record<string, number>;
  /** This visit's coin for a shared heart (its own draw, so nothing else the room draws moves with it). */
  private readonly heartCoin: number;

  constructor(
    private readonly h: RuleHost,
    private readonly o: HeartOptions,
  ) {
    this.pastAnswer = o.answer && Object.values(HEART_ANSWER).includes(o.answer) ? o.answer : null;
    this.memoryCounts = { ...o.memoryCounts };
    this.heartCoin = new Rng(o.seed * 104729 + 7).next();
  }

  /** Whether this visit has a heart at all. */
  hearts(): boolean {
    return this.o.enabled;
  }

  /** (The answer has been read: the card may end on it.) */
  watchAnswer(dt: number): void {
    if (this.answer && this.o.inView(WriteKeys.heart(this.answer))) this.answerInView += dt;
  }

  decide() {
    if (this.h.departing || !this.hearts() || this.h.scenes.heartPlayed) return;
    const shape = this.heartShape();
    if (!shape) return;
    // (Until its line is pointed at, the heart may change: a recoil makes it Almost.)
    this.h.scenes.setHeart(heartOf(shape, this.memoryCounts, this.heartCoin), shape === 'recoiled' ? this.o.recoiledAt()! + HEART_AFTER_RECOIL : 0);
  }

  /**
   * The last visit's answer, found: beside the first line, as if it had always been there, the
   * first time they are turned away from that wall (never appearing in front of them).
   */
  keptAnswer() {
    // (With the first line gone there is nothing to write it beside: the wall is not held for it.)
    if (this.keptWaits && !this.h.visible.has(PHRASE_IDS.stay)) this.keptWaits = false;
    // (Not while a memory plays: nothing is written then, and it would be lost. After it, it is found.)
    if (!this.pastAnswer || this.pastForgotten || !this.hearts() || this.keptFound || this.h.now < this.keptAgainAt || this.h.departing || this.h.scenes.active || !this.h.visible.has(PHRASE_IDS.stay)) return;
    if (this.o.inView(PHRASE_IDS.stay) || PHRASE_BY_ID.get(PHRASE_IDS.stay)!.surface === this.h.facing) return;
    this.keptFound = true;
    this.keptWaits = false;
    // (This visit's own heart has already written the same line there.)
    if (this.answer === this.pastAnswer) return;
    const a = PHRASE_BY_ID.get(this.pastAnswer)!;
    this.h.queue(0, { type: 'write', key: WriteKeys.heart(a.id), text: a.text, hand: a.hand, size: 's', beside: PHRASE_IDS.stay, purpose: 'annotation', ttl: 0, source: a.id, found: true }, 'heart-kept');
  }

  /**
   * What the heart leaves: one line in the answering pencil, beside the room's first line, found
   * rather than watched (on that wall only after a while), and kept for the next visit.
   */
  writeAnswer() {
    if (!this.heartSeen || this.answer || this.h.now < this.heartAnswerAt || this.h.departing || this.h.scenes.active) return;
    if (this.h.pacing.holding(this.h.now) || this.h.pacing.repeats('text', this.h.now, 6) || !this.h.visible.has(PHRASE_IDS.stay)) return;
    // (Not while the first line is in view: found, not watched. QA: the wall faced was not enough,
    // the line was in the middle of the frame at a diagonal.)
    if (this.o.inView(PHRASE_IDS.stay) && this.h.now < this.heartAnswerAt + 40) return;
    const a = PHRASE_BY_ID.get(HEART_ANSWER[this.heartSeen] ?? '');
    if (!a) return;
    this.answer = a.id;
    this.answerWaits = false;
    // (The last visit left the same line, and it has been found there: it is already written.)
    if (this.keptFound && this.pastAnswer === a.id) return;
    this.h.queue(0, { type: 'write', key: WriteKeys.heart(a.id), text: a.text, hand: a.hand, size: 's', beside: PHRASE_IDS.stay, purpose: 'annotation', ttl: 0, source: a.id }, 'heart-answer');
  }

  /** A living memory the visit counted has ended: if it was the heart and was seen, what it leaves comes once its aftermath is over. */
  memoryEnded(id: string, counted: boolean, seen: boolean, ranToEnd: boolean): void {
    // (Seen, not only spent: a painting let go unseen twice counts as played, but its answer is
    // about what happens in it, and they didn't see it happen. CodeRabbit, PR #57.)
    if (counted && seen && id === this.h.scenes.heart && !this.heartSeen) {
      this.heartSeen = id;
      this.heartAnswerAt = this.h.now + (ranToEnd ? 25 : 12) + 4;
    }
  }

  /** The world found no room for the heart's line (`id`: the answer's phrase): it is not spent, tried again in a while. */
  writeFailed(id: string): void {
    // The wall is held for it and it is tried again, as lines there fade (Codex, PR #57).
    if (id === this.answer) {
      this.answer = null;
      this.answerWaits = true;
      this.heartAnswerAt = this.h.now + HEART_RETRY;
    }
    if (id === this.pastAnswer && this.keptFound && !this.pastForgotten) {
      this.keptFound = false;
      this.keptWaits = true;
      this.keptAgainAt = this.h.now + HEART_RETRY;
    }
  }

  /** The visitor asked to be forgotten: earlier visits' counts stop choosing the heart, and the last visit's answer is not written now. */
  forget(): void {
    // (The earlier visits' counts the shared heart weighs, so they stop choosing it: Codex, PR #58.)
    this.memoryCounts = {};
    // (Nor is the last visit's answer written now, if it hasn't been, or tried again: cubic, PR #57.)
    this.pastForgotten = true;
    this.keptWaits = false;
  }

  /**
   * What has happened between the visitor and the chair, as far as the heart is concerned (null:
   * nothing yet). The recoil is an event they saw; the others are only offered from two minutes.
   */
  heartShape(): HeartShape | null {
    const v = this.h.visitor;
    const c = v.comings;
    if (this.o.recoiledAt() !== null) return 'recoiled';
    if (this.h.now < HEART_DECIDE) return null;
    if (stayedClose(v) === 'close') return 'close';
    const last = c[c.length - 1];
    if (last && last.leftAt !== null && v.t - last.leftAt >= 50) return 'refused';
    return null;
  }

  /**
   * What this visit leaves for the next: the heart's answer once its memory has been seen, written
   * on the wall yet or not (a short visit often ends in the memory's quiet). The room writes it
   * while they are away, and the next visit finds it beside the first line.
   */
  heartLeft(watched?: string): string | null {
    // (`watched`: a memory still playing, already past its heart, when the visit is cut off.)
    const seen = this.heartSeen ?? (watched !== undefined && watched === this.h.scenes.heart ? watched : null);
    if (!this.hearts() || !seen) return null;
    return HEART_ANSWER[seen] ?? null;
  }

  /**
   * What this visit's heart has written on the wall (a phrase id), once it has found room there.
   * The card ends on it once it has been read (`answerRead`); the next visit finds `heartLeft`.
   */
  answerKept(): string | null {
    return this.answer;
  }

  /**
   * The answer, once the visitor has had it in view (1.5 s): only then does the card end on it. A
   * line they never saw is not explained to them on the way out; the next visit finds it instead.
   * (Creative director, 2026-11-06.)
   */
  answerRead(): string | null {
    return this.answer && this.answerInView >= 1.5 ? this.answer : null;
  }

  /**
   * The north wall is left as the visit's heart left it: from its answer, and while the answer
   * waits for room there (lines that fade make room for it; nothing new takes that room). The last
   * visit's answer, waiting for room the same way, holds it too, until it is tried again.
   */
  northKept(): boolean {
    return (this.answer !== null || this.answerWaits || this.keptWaits) && this.hearts();
  }

  /** Facing the north wall while it is held: nothing is offered there (it would be refused, and spent). */
  northHeld(): boolean {
    return this.h.facing === 'north' && this.northKept();
  }

  /** Whether a cue would write, reveal or re-ink something on the north wall. */
  onNorth(cue: Cue): boolean {
    const north = (id?: string) => !!id && PHRASE_BY_ID.get(id)?.surface === 'north';
    // (A line written alone for a memory is written again on the wall it is on: the one faced.)
    if (cue.type === 'redraw' && cue.key) return this.h.facing === 'north';
    if (cue.type === 'reveal' || cue.type === 'redraw') return north(cue.phraseId);
    if (cue.type !== 'write' || isHeartKey(cue.key)) return false;
    return cue.surface === 'north' || north(cue.beside);
  }
}
