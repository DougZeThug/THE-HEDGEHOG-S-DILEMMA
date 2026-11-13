import { DRAWINGS } from '../../content/drawings';
import { PHRASES, PHRASE_BY_ID } from '../../content/phrases';
import { PHRASE_IDS } from '../../content/ids';
import type { Surface } from '../../content/types';
import { WriteKeys } from '../writeKeys';
import type { RuleHost, RuleLinks } from './host';

/** Writing the room starts with, ordinary things first; the rest comes by selection. */
// ("the light in the kitchen at four in the afternoon" is kept back: it is the memory, late.)
export const FIRST_WRITTEN: readonly string[] = ['cereal', 'sandwich', 'good-day', 'summer', 'laugh-breathe', 'home', 'rain-carpark'];

interface WritingOptions {
  /** The old arrival: the walls already written and a line redrawn as you come in. */
  legacy: boolean;
}

/** What writing needs to know of the kitchen-light memory and the way out. */
type WritingLink = Pick<RuleLinks, 'memoryPlayed' | 'isWayOut'>;

/**
 * Writing arrives on the walls: the room fills as the visit goes on, an unfinished line is finished
 * when someone stays with it, the one drawing is made while the visitor watches, and (the old
 * arrival) the first line is redrawn as they come in.
 */
export class Writing {
  constructor(
    private readonly h: RuleHost,
    private readonly o: WritingOptions,
    private readonly link: WritingLink,
  ) {}

  /** The visitor turned to face a different wall (a turn to a wall is answered where they look). */
  noteFacing(facing: Surface): void {
    if (facing !== this.lastFacing) {
      this.lastFacing = facing;
      this.facingSince = this.h.now;
    }
  }

  private nextAccumulate = 4;
  private lastAccumulateAt = -Infinity;

  private accumulated = 0;

  /** When the visitor last turned to face a different wall. */
  private facingSince = 0;
  private lastFacing: Surface | null = null;

  private openingDone = false;
  private drawAgainAt = 0;

  private drawRetried = new Set<string>();

  readonly drawn = new Set<string>();


  /**
   * The room fills: the walls start almost bare and gather writing through the visit — a few
   * lines soon after the opening (something to read, something to touch), then more slowly.
   * Usually on the wall the visitor faces, so it is seen being written.
   */
  accumulate() {
    if (this.o.legacy) return;
    // Someone staying with a line is answered sooner: something it echoes or contradicts is
    // written near it — reading makes more to read.
    const v = this.h.visitor;
    // (Not the memory's line before its memory: that look is the memory's to answer.)
    const memoryLine = (v.gazeId === PHRASE_IDS.kitchenLight && !this.link.memoryPlayed()) || this.h.scenes.claims(v.gazeId);
    const reading = v.gazeId && v.gazeFor > 2.5 && !memoryLine && !this.link.isWayOut(v.gazeId) ? PHRASE_BY_ID.get(v.gazeId) : undefined;
    const answerRead = !!reading && this.h.now - this.lastAccumulateAt > 5 && this.accumulated < 14;
    if (this.h.now < this.nextAccumulate && !answerRead) return;
    if (this.h.aftermath() && !answerRead) return;
    // Someone settled at the chair is with the chair: the walls can wait.
    if (!answerRead && v.near && v.stillFor > 3) return;
    if (this.h.pacing.holding(this.h.now) || this.h.pacing.repeats('text', this.h.now, 6)) return;
    // The first comes regardless (something to read); after that the room's own filling
    // waits while enough is happening.
    if (this.accumulated >= 2 && this.h.pacing.crowded(this.h.now)) return;
    // Never on top of something that has only just happened.
    if (this.accumulated >= 1 && this.h.pacing.sinceDev(this.h.now) < 2.5) return;
    const n = this.accumulated;
    this.nextAccumulate = this.h.now + (n < 5 ? this.h.rng.range(8, 12) : n < 12 ? this.h.rng.range(14, 22) : this.h.rng.range(26, 40));
    // Turning to a wall is answered: the hand writes there, where the visitor has just looked.
    const turned = this.h.now - this.facingSince < 4 && this.h.now > 4;
    const facing = turned || this.h.rng.chance(0.7);
    // Not a line something else has already promised to bring (a reveal waiting its time).
    const free = (id: string) => !this.h.visible.has(id) && !this.h.scheduler.hasPending(`reveal:${id}`);
    const pool = PHRASES.filter((p) => p.tier === 'arrival' && free(p.id) && p.surface !== 'floor' && p.surface !== 'ceiling');
    if (!pool.length) return;
    const onWall = (id: string) => pool.some((p) => p.id === id && (!facing || p.surface === this.h.facing));
    let id: string | undefined;
    let rule = turned ? 'accumulate-turn' : 'accumulate';
    if (answerRead && reading) {
      const related = [...(reading.contradicts ?? []), ...(reading.echoes ?? [])]
        .map((r) => PHRASE_BY_ID.get(r))
        .find((p) => p && free(p.id) && !this.h.reserved(p.id) && !this.h.withheld().includes(p.id) && p.surface !== 'floor' && p.surface !== 'ceiling' && !['transform', 'annotation', 'still', 'near'].includes(p.tier ?? 'arrival'));
      if (related) {
        id = related.id;
        rule = 'accumulate-read';
      }
    }
    // In a memory's aftermath only a line answering the one being read is written.
    if ((this.h.aftermath() || this.h.now < this.h.shared.heldSilenceUntil) && rule !== 'accumulate-read') return;
    if (!id) id = FIRST_WRITTEN.find(onWall);
    // The first few ordinary lines are written where the visitor is looking, whatever wall
    // they were first written on: the room is filling in front of them.
    if (!id && n < 3) {
      const moved = FIRST_WRITTEN.map((x) => PHRASE_BY_ID.get(x)).find((p) => p && free(p.id) && !this.h.ledger.moved.has(p.id));
      if (moved && moved.surface !== this.h.facing && this.h.facing !== 'floor' && this.h.facing !== 'ceiling') {
        this.accumulated++;
        this.lastAccumulateAt = this.h.now;
        this.h.ledger.moved.add(moved.id);
        this.h.ledger.accumulating.add(moved.id);
        this.h.visible.set(moved.id, { mode: 'shown', since: this.h.now, base: true });
        this.h.memory.surfaced.set(moved.id, this.h.now);
        this.h.queue(0, {
          type: 'write', key: WriteKeys.moved(moved.id), text: moved.text, hand: moved.hand === 'typed' ? 'pencil' : moved.hand, size: 's',
          surface: this.h.facing, purpose: 'recall', ttl: 0, source: moved.id,
        }, rule);
        return;
      }
    }
    if (!id) {
      const there = facing ? pool.filter((p) => p.surface === this.h.facing) : pool;
      const from = there.length ? there : pool;
      id = this.h.selector.select(this.h.ctx(), { exclude: this.h.hiddenExcluding(), surfaces: [...new Set(from.map((p) => p.surface))] })?.id ?? from[0].id;
    }
    this.accumulated++;
    this.lastAccumulateAt = this.h.now;
    this.h.queue(0, { type: 'reveal', phraseId: id, mode: 'emerge', seconds: 6 }, rule, { key: `reveal:${id}` });
    // What accumulates stays: the room remembers it.
    this.h.ledger.accumulating.add(id);
  }

  /**
   * An unfinished line is finished when someone stays with it: a long look at it, or coming to
   * the chair. A voice says the whole sentence, and the hand writes the rest as it is heard.
   */
  finish() {
    // (Never in the afternoon's aftermath: a sentence finished under its line would caption it.
    // After the other memories a long look is answered as ever: it is the visitor's.)
    if (!this.h.ledger.unfinished.size || this.h.now < 12 || (this.h.aftermath() && this.h.musicWithdrawn)) return;
    // Not over a vignette or a painted memory's own voices (a wordless painted one can take it).
    if (this.h.vignettePlaying || this.h.now < this.h.shared.vignetteQuietUntil) return;
    const v = this.h.visitor;
    for (const id of this.h.ledger.unfinished) {
      const p = PHRASE_BY_ID.get(id);
      if (!p) continue;
      // Earned by staying, not by arriving: a long look, or stillness at the chair — and only
      // while the line is in view, so the sentence is seen being finished.
      const looked = v.gazeId === id && v.gazeFor > 6;
      const stayed = v.near && v.nearFor > 8 && v.stillFor > 5 && this.h.facing === p.surface;
      if (!looked && !stayed) continue;
      if (!this.h.scheduler.majorFree(this.h.now) || !this.h.pacing.intenseFree(this.h.now) || this.h.pacing.holding(this.h.now)) return;
      this.h.ledger.unfinished.delete(id);
      this.h.voice(looked ? 'finish-look' : 'finish-chair', 0, p.voice ?? 'tender', p.text, p.text, { kind: 'surface', phraseId: id }, { phraseId: id, finish: true, ttl: 20, priority: 2 });
      this.h.memory.spoken.set(id, this.h.now);
      // Then nothing for a while: the sentence is left to stand.
      this.h.pacing.holdFor(this.h.now, 15);
      return;
    }
  }

  opening() {
    if (this.openingDone || this.h.now < 0.3) return;
    this.openingDone = true;
    const focal = this.h.visits <= 1 ? PHRASE_IDS.stay : this.h.rng.pick([PHRASE_IDS.stay, 'closer', 'not-going']);
    this.h.queue(0, { type: 'redraw', phraseId: focal, seconds: 4.5 }, 'opening');
    const r = this.h.rng.next();
    if (r < 0.4) {
      // The hum drops as the line is finished: the room choosing not to say anything more.
      this.h.queue(4.6, { type: 'silence', depth: 0.55, seconds: 6 }, 'opening');
    } else if (r < 0.75) {
      // Someone has just gone out, behind you.
      this.h.queue(2.2, { type: 'sound', kind: 'door', position: { kind: 'beyond', surface: 'south' }, gain: 0.36 }, 'opening');
    } else {
      // Someone has just got up from the chair, as you came in.
      this.h.shared.creaks++;
      this.h.queue(0.9, { type: 'sound', kind: 'chair-creak', position: { kind: 'chair' }, gain: 0.28 }, 'opening');
      this.h.queue(1, { type: 'glow', x: 0, z: 0, amount: 0.2, seconds: 20 }, 'opening');
    }
  }

  /**
   * The one drawing made while the visitor watches: when they have stayed with its line a few
   * seconds, the hand draws beside it (two cups, the second never finished). Never while the
   * room is holding its breath, never on top of other writing appearing.
   */
  drawings() {
    const v = this.h.visitor;
    if (this.h.now < this.drawAgainAt) return;
    for (const d of DRAWINGS) {
      if (d.when === 'start' || this.drawn.has(d.id)) continue;
      const { seen, gaze } = d.when;
      if (!this.h.visible.has(seen) || v.gazeId !== seen || v.gazeFor < gaze) continue;
      if (this.h.pacing.holding(this.h.now) || this.h.pacing.repeats('text', this.h.now, 4)) continue;
      this.drawn.add(d.id);
      this.h.queue(0.4, { type: 'draw', id: d.id }, `draw:${d.id}`);
    }
  }

  /** The world could not find room for a piece of writing: let its relation be tried again later. */
  /** A drawing found no room on its wall: it may be tried again later, once. */
  drawFailed(id: string): void {
    if (this.drawRetried.has(id)) return;
    this.drawRetried.add(id);
    this.drawn.delete(id);
    this.drawAgainAt = this.h.now + 60;
  }
}
