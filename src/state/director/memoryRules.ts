import { VIGNETTE_BY_ID } from '../../content/vignettes';
import { PHRASE_BY_ID } from '../../content/phrases';
import { PHRASE_IDS } from '../../content/ids';
import { DRAWING_BY_ID } from '../../content/drawings';
import { MEMORY_IDS } from '../../content/ids';
import type { Surface } from '../../content/types';
import { phaseAtLeast } from '../Phase';
import { cameBack } from './visitShape';

import { WriteKeys } from '../writeKeys';
import type { RuleHost } from './host';

/**
 * A designed moment is decided at the instant the room is free and has a ttl shorter than the
 * major gap: it goes before a major kept from earlier (which would take the slot, and the moment
 * would expire unheard with its spacing already spent).
 */
const DESIGNED = 3;

/**
 * One memory a visit intrudes on the room as light: "the light in the kitchen at four in the
 * afternoon", read, and for a few seconds that light falls across the wall where the words
 * are. Late (from 150 s, once the room has begun to contradict itself), so it is not spent on
 * arrival. If the line isn't on a wall yet, it is written first where the visitor is looking;
 * the light comes when they stay with it (2.5 s), or touch it. Then the room holds still.
 */
export const KITCHEN_LIGHT = { phraseId: PHRASE_IDS.kitchenLight, attack: 3, hold: 6, release: 4 };

/** What the memory rules need of the rest of the room. */
export interface MemoryLink {
  /** Facing the north wall while the heart holds it: nothing is offered there. */
  northHeld(): boolean;
  /** A memory the visit counted has ended (the heart's answer is decided there). */
  heartEnded(id: string, counted: boolean, seen: boolean, ranToEnd: boolean): void;
  /** The room's own life waits `seconds` after a memory that was heard or watched. */
  startAftermath(seconds: number): void;
}

/**
 * The living memories and the kitchen light: when a line is offered for one, when it opens, what
 * the room does as it ends, and the visit's turn that waits for it (src/state/MemoryDirector.ts
 * decides which memory and when; this is the room's side of it).
 */
export class MemoryRules {
  constructor(
    private readonly h: RuleHost,
    private readonly link: MemoryLink,
  ) {}

  /** A few seconds after a living memory ends, before the room turns a phase. */
  get quietAt(): number {
    return this.scenesQuietAt;
  }

  /** The kitchen light has been offered (its line written where the visitor looks). */
  get offered(): boolean {
    return this.memoryOffered;
  }

  /** The line was touched: asks for its memory, however recently it was touched. */
  tapped(phraseId: string): void {
    if (phraseId === KITCHEN_LIGHT.phraseId && !this.memoryPlayed && this.h.visible.has(phraseId)) this.memoryTouched = true;
  }

  /** The kitchen light was decided on and never sounded: it is not spent. */
  kitchenLightLost(): void {
    this.memoryPlayed = false;
  }

  /** A memory's line found no room on the wall faced: offered again, on another wall (the kitchen light's, again later). */
  offerFailed(phraseId: string): void {
    if (phraseId === KITCHEN_LIGHT.phraseId) {
      // The memory's line found no room where the visitor was looking: offer it again later.
      this.memoryNoRoom = { surface: this.h.facing, at: this.h.now };
      this.h.visible.delete(phraseId);
      this.h.memory.surfaced.delete(phraseId);
      this.memoryOffered = false;
      this.h.shared.memoryQuietUntil = -Infinity;
    } else {
      this.h.scenes.offerFailed(phraseId);
      this.h.visible.delete(phraseId);
      this.h.memory.surfaced.delete(phraseId);
      this.sceneNoRoom = { surface: this.h.facing, at: this.h.now };
    }
  }

  /** The memory has been offered (its line written where the visitor looks) / has played. */
  private memoryOffered = false;
  private memoryOfferedAt = -Infinity;

  memoryPlayed = false;

  /** The hold that came with the last line offered for a memory (it doesn't hold back that memory). */
  private offerHoldTo = -Infinity;

  /** The last vignette to end (the visit's turn keeps clear of it). */
  private vignetteEnded: { id: string; at: number; dimmed: boolean } | null = null;

  /** The line was touched (phones): latched until the memory can play. */
  private memoryTouched = false;

  /** The end of the pacing hold the memory asked for itself (so it never waits on its own hold). */
  private memoryHoldTo = -Infinity;

  /** A few seconds after a living memory ends, before the room turns a phase. */
  private scenesQuietAt = -Infinity;
  private memoryNoRoom: { surface: Surface; at: number } | null = null;

  /** A wall a memory's line found no room on just now (not tried again there for a minute). */
  private sceneNoRoom: { surface: Surface; at: number } | null = null;


  /** The visitor is staying with the memory's line (or touched it) and its light is still to come. */
  memoryAwaited(): boolean {
    if (this.memoryPlayed || !this.memoryOffered || !this.h.visible.has(KITCHEN_LIGHT.phraseId)) return false;
    return this.memoryTouched || this.h.visitor.gazeId === KITCHEN_LIGHT.phraseId;
  }

  kitchenLight() {
    // Cereal is the same kitchen: if it has opened this visit, the late light isn't offered.
    if (this.memoryPlayed || this.h.departing || this.h.scenes.paintedPlayed || this.h.scenes.kitchenTaken) return;
    // (Nor while the visit's heart is chosen and waiting: it is the memory this visit is for. If it
    // was pointed at and let be, the light may still come.)
    if (this.h.scenes.heart && !this.h.scenes.heartPlayed && !this.memoryOffered && !this.h.scenes.heartLapsed(this.h.now)) return;
    if (this.h.now < 150 || !phaseAtLeast(this.h.phase, 'contradiction')) return;
    const m = KITCHEN_LIGHT;
    // Its own hold (below) doesn't keep it waiting.
    // (Never in another memory's aftermath, offered or begun.)
    const free = this.h.scheduler.majorFree(this.h.now) && !this.h.aftermath() && (!this.h.pacing.holding(this.h.now) || this.h.pacing.heldUntil <= this.memoryHoldTo);
    if (!this.h.visible.has(m.phraseId)) {
      // Not in the quiet a vignette leaves behind (the light offered there would answer it).
      if (this.memoryOffered || !free || this.link.northHeld() || this.h.now < this.h.shared.memoryQuietUntil || this.h.pacing.repeats('text', this.h.now, 8) || this.h.withheld().includes(m.phraseId)) return;
      // (A wall it found no room on is not tried again for a minute: it was written there eight times.)
      if (this.memoryNoRoom && this.memoryNoRoom.surface === this.h.facing && this.h.now - this.memoryNoRoom.at < 60) return;
      const p = PHRASE_BY_ID.get(m.phraseId)!;
      this.memoryOffered = true;
      this.memoryOfferedAt = this.h.now;
      this.h.shared.memoryQuietUntil = this.h.now + 15;
      // The line arrives alone: nothing else is revealed, written or begun with it, so a visitor
      // who stays with it gets the light, not whatever else happened at the same moment.
      this.memoryHoldTo = this.h.now + 2.4;
      this.h.pacing.holdFor(this.h.now, 2.4);
      this.h.visible.set(p.id, { mode: 'shown', since: this.h.now, base: true });
      this.h.memory.surfaced.set(p.id, this.h.now);
      this.h.queue(0, {
        type: 'write', key: WriteKeys.memory(p.id), text: p.text, hand: p.hand === 'typed' ? 'pencil' : p.hand, size: 's',
        surface: this.h.facing, purpose: 'recall', ttl: 0, source: p.id,
      }, 'memory-offer');
      return;
    }
    const v = this.h.visitor;
    // While they stay with it, nothing else is revealed or written: the room waits with them.
    if (this.memoryAwaited() && (!this.h.pacing.holding(this.h.now) || this.h.pacing.heldUntil <= this.memoryHoldTo)) {
      this.memoryHoldTo = this.h.now + 0.3;
      this.h.pacing.holdFor(this.h.now, 0.3);
    }
    const looked = v.gazeId === m.phraseId && v.gazeFor >= 2.5;
    if (!looked && !this.memoryTouched) return;
    // Never on top of a voice (one just heard, or one about to be), a dim, a flash.
    if (!free || this.h.pacing.repeats('voice', this.h.now, 4) || this.h.pacing.repeats('light', this.h.now, 10)) return;
    this.memoryPlayed = true;
    this.h.shared.memoryQuietUntil = -Infinity;
    // Later memories keep their distance from this one too.
    this.h.scenes.lastEnded = this.h.now + m.attack + m.hold + m.release;
    this.h.queue(0, { type: 'memory', phraseId: m.phraseId, attack: m.attack, hold: m.hold, release: m.release }, 'memory', { major: true, ttl: 3, priority: DESIGNED });
    // The light is the answer: nothing else while it is there, and a moment after.
    this.h.pacing.holdFor(this.h.now, m.attack + m.hold + m.release + 3);
  }

  /**
   * A living memory (src/state/MemoryDirector.ts decides when): once begun, the room waits with
   * it (no voices, nothing new written or revealed) until the App says it has gone.
   */
  scenes() {
    const v = this.h.visitor;
    // (The hold that comes with a line offered for a memory is that memory's: it doesn't keep it waiting.)
    const held = this.h.pacing.holding(this.h.now) && this.h.pacing.heldUntil > this.offerHoldTo;
    const free = this.h.scheduler.majorFree(this.h.now) && !held && !this.h.pacing.repeats('voice', this.h.now, 4) && !this.h.pacing.repeats('light', this.h.now, 10);
    const start = this.h.scenes.update({
      now: this.h.now,
      visible: (id) => this.h.visible.has(id),
      gazeId: v.gazeId,
      gazeFor: v.gazeFor,
      free,
      // (Kitchen-light having played is not a block: the arc and the spacing decide. Only one
      // waiting to be seen, or playing, is.)
      otherMemory: this.memoryAwaited(),
      departing: this.h.departing,
      kitchenPlayed: this.memoryPlayed,
      facing: this.h.facing,
      phase: this.h.phase,
      chairDistance: v.distance,
      finished: (id) => !this.h.ledger.unfinished.has(id),
      stillFor: v.stillFor,
      kneeling: v.kneeling,
      variantCtx: () => ({
        visits: this.h.visits,
        field: { ...this.h.field.v },
        motifs: [...this.h.memory.formed.keys()],
        withdrew: v.sinceWithdraw < 60,
      }),
    });
    if (start?.kind === 'vignette') this.h.queue(0, { type: 'vignette', id: start.id, phraseId: start.phraseId, variant: start.variant }, 'vignette', { major: true, ttl: 3, priority: DESIGNED });
    else if (start) this.h.queue(0, { type: 'memory-scene', id: start.id, phraseId: start.phraseId, variant: start.variant, minHold: start.minHold, maxHold: start.maxHold, voices: start.voices }, 'memory-scene', { major: true, ttl: 3, priority: DESIGNED });
    if (this.h.scenes.active) this.h.pacing.holdFor(this.h.now, 0.5);
    // A later memory's line is offered as the kitchen-light memory's is: written alone, where
    // the visitor is looking, and the room holds still a moment so a visitor who stays with it
    // gets the memory, not whatever else happened at the same time.
    // (Nor, facing the north wall while it is held, onto it: it waits until they face another wall.)
    const northHeld = this.link.northHeld();
    const offer = this.h.scenes.offer({
      now: this.h.now,
      phase: this.h.phase,
      // (Never into a busy room: the line arrives into quiet, or waits. Nor into a memory's aftermath.)
      free: free && !northHeld && !this.h.aftermath() && !this.h.pacing.repeats('text', this.h.now, 8) && !this.h.pacing.crowded(this.h.now),
      visibleFacing: (id) => this.h.visible.has(id) && !this.h.ledger.keptBack.has(id) && PHRASE_BY_ID.get(id)?.surface === this.h.facing,
      visible: (id) => this.h.visible.has(id),
      departing: this.h.departing,
      otherMemory: this.memoryAwaited(),
      facing: this.h.facing,
      darkEnded: Number.isFinite(this.h.shared.heldSilenceUntil) ? this.h.shared.heldSilenceUntil : null,
      kitchenPlayed: this.memoryPlayed,
      kitchenOffered: this.memoryOffered,
      kitchenOfferedAt: this.memoryOffered ? this.memoryOfferedAt : undefined,
      prefer: this.earned(),
      // (And only while they look at a wall, level: at the chair, looking down at it, a line written
      // "where they look" lands out of view. Interaction designer, 2026-11-06.)
      // (Nor looking steeply up: the band it is written in, at eye height, is then below the frame.)
      heartFree: this.h.scheduler.majorFree(this.h.now) && !held && !northHeld && !this.h.aftermath() && this.h.pacing.sinceDev(this.h.now) >= 4 && !this.h.pacing.repeats('voice', this.h.now, 4) && this.h.facing !== 'floor' && this.h.facing !== 'ceiling' && v.pitch > -0.3 && v.pitch < 0.25 && !(this.sceneNoRoom?.surface === this.h.facing && this.h.now - this.sceneNoRoom.at < 60),
    });
    if (offer?.reink) {
      // Already on the wall they face: written again there, in front of them (no new line).
      this.h.pacing.holdFor(this.h.now, 2.4);
      this.offerHoldTo = this.h.now + 2.4;
      this.h.queue(0, { type: 'redraw', phraseId: offer.phraseId, ...(offer.key ? { key: offer.key } : {}), seconds: 3 }, 'memory-offer');
    } else if (offer) {
      const p = PHRASE_BY_ID.get(offer.phraseId);
      if (!p) return;
      // The door's line is written beneath the room's drawn door, which its memory opens from.
      const under = offer.under ? DRAWING_BY_ID.get(offer.under) : undefined;
      this.h.visible.set(p.id, { mode: 'shown', since: this.h.now, base: true });
      this.h.memory.surfaced.set(p.id, this.h.now);
      this.h.pacing.holdFor(this.h.now, 2.4);
      this.offerHoldTo = this.h.now + 2.4;
      this.h.queue(0, {
        type: 'write', key: WriteKeys.memory(p.id), text: p.text, hand: p.hand === 'typed' ? 'pencil' : p.hand, size: 's',
        surface: under ? under.surface : this.h.facing, purpose: 'recall', ttl: 0, source: p.id,
        ...(under ? { under: under.id } : {}),
      }, 'memory-offer');
    }
  }

  /**
   * The painted memory this visit has earned, if any (docs/reviews/2026-11-core-loop.md): Almost (a
   * hand reaches, starts, is taken back, comes nearer too late) for someone who came to the chair,
   * went away, and came back, at least two minutes before: the room choosing, not a mirror. The
   * rest come in their own order, the ones this browser has not seen first.
   */
  earned(): string[] {
    return cameBack(this.h.visitor, this.h.now - 120) ? [MEMORY_IDS.almost] : [];
  }

  /** The App could not begin it (its art or sound failed to load): not spent. */
  memoryFailed(id: string): void {
    this.h.scenes.cancel(id, this.h.now);
  }

  /** A preview has ended (never counted, nothing left behind): the room goes on. */
  memoryPreviewEnded(id: string): void {
    this.h.scenes.previewEnded(id);
    // Its quiet afterwards is part of it, previewed or not (nothing is counted).
    if (VIGNETTE_BY_ID.has(id)) this.h.shared.vignetteQuietUntil = this.h.now + 20;
  }

  /** A memory the Director didn't begin is playing (the artist's panel): the room waits with it. */
  memoryExternal(id: string, voiced = false): void {
    this.h.scenes.external(id, this.h.now, voiced);
  }

  memoryEnded(id: string, seen: boolean, ranToEnd: boolean): boolean {
    const counted = this.h.scenes.ended(id, this.h.now, seen, ranToEnd);
    this.scenesQuietAt = this.h.now + 6;
    // After a vignette the room doesn't answer at once with another voice: its quiet is part of it.
    if (VIGNETTE_BY_ID.has(id)) {
      this.h.shared.memoryQuietUntil = Math.max(this.h.shared.memoryQuietUntil, this.h.now + 20);
      this.h.shared.vignetteQuietUntil = this.h.now + 20;
      this.vignetteEnded = { id, at: this.h.now, dimmed: VIGNETTE_BY_ID.get(id)!.variants.first.events.some((e) => 'fx' in e && e.fx.kind === 'dim') };
    }
    this.link.heartEnded(id, counted, seen, ranToEnd);
    if (counted) {
      // Its aftermath (shorter if it was let go early).
      this.link.startAftermath(ranToEnd ? 25 : 12);
      // Staying with a memory is attention, as returning to a line is.
      this.h.engagement.raise('memory', this.h.now, id);
      // A moment to come back to the room before anything else.
      this.h.pacing.holdFor(this.h.now, 6);
    }
    return counted;
  }

  /** When the visit's turn may sound, `want` seconds from now at the earliest, and whether with its dark. */
  turnClear(want: number): { delay: number; dark: boolean } {
    const v = this.vignetteEnded;
    const since = v ? this.h.now - v.at : Infinity;
    const delay = Math.max(want, (v?.dimmed ? 45 : 25) - since);
    return { delay, dark: !(v?.dimmed && since + delay < 90) };
  }
}
