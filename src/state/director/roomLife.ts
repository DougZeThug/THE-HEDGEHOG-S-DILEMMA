import { CHARACTER_WALLS, belonging } from '../../content/walls';
import { PHRASES, PHRASE_BY_ID } from '../../content/phrases';
import { PHRASE_IDS, FRAGMENT_IDS } from '../../content/ids';
import { AIR_LINES, RECONTEXTS, VOICE_FRAGMENTS, VOICE_FRAGMENT_BY_ID } from '../../content/relations';
import { WALLS, type Phrase, type Surface, type Tier } from '../../content/types';
import { phaseAtLeast } from '../Phase';
import { TIER_OPEN, type SelectQuery } from '../PhraseSelector';
import { devKind } from '../Pacing';
import type { VisitorInput } from '../VisitorModel';
import { WriteKeys } from '../writeKeys';
import type { RuleHost, RuleLinks } from './host';

/** What room life needs to know of the heart: the north wall is held while its answer waits. */
type RoomLifeLink = Pick<RuleLinks, 'northKept'>;

/**
 * What the room does of its own accord, not in answer to the visitor: writing drifts in, warm
 * memories resurface, music comes and goes, a line migrates to the wrong wall, life goes on
 * elsewhere, the chair is not quite where it was, and once a visit words are written in the air.
 */
export class RoomLife {
  constructor(
    private readonly h: RuleHost,
    private readonly link: RoomLifeLink,
  ) {}

  private recontextsUsed = new Set<string>();
  private heldMoved = false;

  private strayAnchors = new Set<string>();

  /** Lines that have migrated to a wall that isn't theirs: phrase id → wall. */
  readonly strays = new Map<string, Surface>();
  private nextDistantLife = 45;

  private chairNudges = 0;
  private kneelVoiced = false;

  /** Writing in the air happens at most once a visit. */
  private airDone = false;


  /** A migrated line found no room on its wall: it may migrate again later. */
  strayFailed(phraseId: string): void {
    if (this.strays.get(phraseId) === 'south') this.heldMoved = false;
    this.strays.delete(phraseId);
  }

  drift() {
    const gap = { arrival: 30, familiar: 28, contradiction: 26, transform: 30 }[this.h.phase];
    if (this.h.now < 14 || !this.h.cool('drift', gap) || this.h.pacing.holding(this.h.now) || this.h.pacing.crowded(this.h.now)) return;
    // Writing has just changed somewhere: let it be found before anything else appears.
    if (this.h.pacing.repeats('text', this.h.now, 12)) return;
    this.h.used('drift');
    // Usually where the visitor is looking; sometimes behind them, to be found on turning round.
    const towardFacing = this.h.rng.chance(0.6);
    const surfaces = towardFacing ? [this.h.facing] : WALLS.filter((s) => s !== this.h.facing);
    const q: SelectQuery = { exclude: this.h.hiddenExcluding(), surfaces, contrast: this.h.phase === 'contradiction' ? 0.35 : 0.15 };
    let p = this.h.selector.select(this.h.ctx(), q);
    if (!p) p = this.h.selector.select(this.h.ctx(), { exclude: this.h.hiddenExcluding() });
    if (p) this.h.reveal(p.id, 0, 'drift', 'emerge', this.h.rng.range(8, 14));
  }

  /** Warm memories return when the visitor is far away (never once the afternoon has been seen:
   * "That was a good day." after it would caption it, as the room's music would). */
  resurface() {
    const f = this.h.field.v;
    const mem = this.h.memory;
    if (this.h.musicWithdrawn || !mem.warmMemories.length || f.solitude < 0.45 || this.h.visitor.distance < 2.2) return;
    if (!this.h.cool('resurface', 70) || this.h.pacing.holding(this.h.now) || this.h.attending() || this.h.pacing.crowded(this.h.now)) return;
    this.h.used('resurface');
    const id = mem.warmMemories[this.h.rng.int(0, mem.warmMemories.length - 1)];
    const p = PHRASE_BY_ID.get(id)!;
    this.h.queue(0, {
      type: 'write', key: WriteKeys.recall(id, this.h.now), text: p.text, hand: 'cyan', size: 'xs', surface: this.h.facing, purpose: 'recall', ttl: 60, source: id,
    }, 'resurface');
    const f2 = this.h.rng.chance(0.5) ? FRAGMENT_IDS.laughNextRoom : FRAGMENT_IDS.hum;
    this.h.fragment('resurface', VOICE_FRAGMENT_BY_ID.get(f2)!, { kind: 'beyond', surface: this.h.rng.pick(WALLS) }, 4, 0.45);
  }

  /** Music arrives sometimes, and sometimes leaves before it resolves. */
  music() {
    const f = this.h.field.v;
    const gap = { arrival: 9999, familiar: 90, contradiction: 75, transform: 65 }[this.h.phase];
    if (!this.h.cool('music', gap) || this.h.now < 40 || this.h.situations.claimed('music') || !this.h.pacing.intenseFree(this.h.now) || this.h.attending() || this.h.pacing.crowded(this.h.now)) return;
    const pressure = Math.max(f.warmth, f.reminiscence * 1.1, f.dissonance, f.hush * 0.9);
    if (pressure < 0.42) return;
    this.h.used('music');
    let mood: 'warm' | 'tender' | 'uneasy' | 'sparse' | 'memory' = 'sparse';
    if (f.dissonance > 0.45 && f.exposure > 0.25) mood = 'uneasy';
    else if (f.reminiscence > 0.4) mood = 'memory';
    else if (f.warmth > 0.45) mood = this.h.rng.chance(0.5) ? 'warm' : 'tender';
    this.h.queue(0, { type: 'music', mood, notes: this.h.rng.int(4, 9), truncate: this.h.rng.chance(0.4) }, 'music', { major: true, ttl: 30 });
  }

  /** Late: something already read is written again elsewhere, beside something that changes it. */
  recontext() {
    // Context changes belong to the second half of a visit, but that can begin within a minute.
    if (!phaseAtLeast(this.h.phase, 'contradiction') || this.h.now < 90 || !this.h.cool('recontext', this.h.phase === 'transform' ? 40 : 60)) return;
    if (this.h.pacing.repeats('text', this.h.now, 10) || this.h.pacing.holding(this.h.now) || this.h.pacing.crowded(this.h.now)) return;
    // Lines kept for particular moments, and late lines, are never borrowed as context early.
    const fits = (id: string) => {
      const b = PHRASE_BY_ID.get(id);
      return !!b && !this.h.reserved(id) && (b.tier !== 'transform' || this.h.phase === 'transform');
    };
    const options = RECONTEXTS.filter((r) => !this.recontextsUsed.has(r.id) && this.h.visitor.read.has(r.phrase) && fits(r.beside));
    if (!options.length) return;
    this.h.used('recontext');
    const r = options[this.h.rng.int(0, options.length - 1)];
    this.recontextsUsed.add(r.id);
    if (!this.h.visible.has(r.beside)) this.h.reveal(r.beside, 0, 'recontext', 'emerge', 8);
    this.h.queue(6, {
      type: 'write', key: WriteKeys.recontext(r.id), text: PHRASE_BY_ID.get(r.phrase)!.text, hand: r.hand, size: 'xs', beside: r.beside, purpose: 'recontext', ttl: 120, source: r.phrase,
    }, 'recontext');
  }

  /**
   * Contamination. Each wall keeps its character, but as the visit deepens, writing
   * migrates: a line is written again on a wall where it doesn't belong, beside the line
   * that most belongs there — joy among the shame, a retraction among the warm memories.
   * Late in the visit, the line the visitor held longest is written small on the empty
   * wall behind them.
   */
  contaminate() {
    const allowed = { arrival: 0, familiar: 1, contradiction: 3, transform: 7 }[this.h.phase];
    if (this.h.now < 45 || this.strays.size >= allowed) return;
    if (!this.h.cool('stray', 40) || this.h.pacing.holding(this.h.now) || this.h.pacing.crowded(this.h.now)) return;

    if (this.h.phase === 'transform' && !this.heldMoved) {
      let held: Phrase | undefined;
      let most = 6;
      for (const [id, secs] of this.h.visitor.gazeTotals) {
        const p = PHRASE_BY_ID.get(id);
        if (p && p.surface !== 'south' && p.tier !== 'annotation' && secs > most && !this.strays.has(id)) {
          most = secs;
          held = p;
        }
      }
      // Only once it is actually written: nothing held long enough yet means later, and while the
      // visitor faces that wall it waits — keeping its place rather than giving it to another stray.
      if (held && this.h.facing === 'south') return;
      if (held) {
        this.heldMoved = true;
        this.h.used('stray');
        this.strays.set(held.id, 'south');
        this.h.queue(0, {
          type: 'write', key: WriteKeys.stray(held.id), text: held.text, hand: held.hand === 'typed' ? 'pencil' : held.hand, size: 'xs',
          surface: 'south', purpose: 'recontext', ttl: 0, source: held.id,
        }, 'stray-held');
        return;
      }
    }

    // A wall the visitor isn't looking at, so the change is found rather than watched.
    // (Not onto the north wall once the heart's answer is there: it is left as the heart left it.)
    const walls = CHARACTER_WALLS.filter((w) => w !== this.h.facing && w !== 'south' && !(w === 'north' && this.link.northKept()));
    if (!walls.length) return;
    const wall = this.h.rng.pick(walls);
    const anchor = PHRASES.filter((p) => p.surface === wall && this.h.visible.get(p.id)?.mode === 'shown' && p.tier !== 'near' && !this.strayAnchors.has(p.id))
      .map((p) => ({ p, b: belonging(p, wall) }))
      // Only writing that belongs where it is can be the thing a stray lands beside.
      .filter((x) => x.b > 0)
      .sort((a, b) => b.b - a.b || (a.p.id < b.p.id ? -1 : 1))
      .slice(0, 4);
    if (!anchor.length) return;
    const open = new Set<Tier>(TIER_OPEN[this.h.phase].filter((t) => t !== 'near'));
    // Floor and ceiling writing belongs to where it is; it never wanders.
    const cands = PHRASES.filter(
      (p) => p.surface !== wall && p.surface !== 'floor' && p.surface !== 'ceiling' && open.has(p.tier) && !this.strays.has(p.id) && !this.h.reserved(p.id) && p.kind !== 'word' && p.kind !== 'passage',
    ).map((p) => {
      // Strongly something else, and nothing like this wall.
      const foreign = 1 - belonging(p, wall);
      const own = Math.max(...CHARACTER_WALLS.filter((w) => w !== wall).map((w) => belonging(p, w)));
      // Unseen material arriving in the wrong place is stronger than a copy of something already read.
      const unseen = this.h.visible.has(p.id) || this.h.visitor.read.has(p.id) ? 0 : 0.12;
      return { p, s: foreign * own + unseen + this.h.selector.score(p, this.h.ctx()) * 0.15 };
    });
    cands.sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1));
    const top = cands.slice(0, 10);
    const i = this.h.rng.weighted(top.map((c) => Math.exp((c.s - top[0].s) / 0.2)));
    if (i < 0) return;
    const p = top[i].p;
    const beside = anchor[this.h.rng.int(0, anchor.length - 1)].p;
    this.strayAnchors.add(beside.id);
    this.h.used('stray');
    this.strays.set(p.id, wall);
    this.h.queue(0, {
      type: 'write', key: WriteKeys.stray(p.id), text: p.text, hand: p.hand, size: p.size === 'xs' ? 'xs' : 's',
      beside: beside.id, purpose: 'recontext', ttl: 0, source: p.id,
    }, 'stray');
  }

  /** Life elsewhere: muffled laughter, two people talking, someone humming. */
  distantLife() {
    if (this.h.phase === 'arrival' || this.h.now < this.nextDistantLife) return;
    // Not while someone is reading: the room's own life doesn't talk over attention.
    if (this.h.visitor.gazeId || this.h.attending() || this.h.pacing.holding(this.h.now) || this.h.pacing.crowded(this.h.now) || !this.h.scheduler.majorFree(this.h.now)) return;
    // Distant life is mostly situational now; this is only a fallback for long quiet stretches.
    if (this.h.situations.claimed('beyond') || this.h.now - this.h.situations.lastBeyond < 90 || !this.h.pacing.intenseFree(this.h.now)) return;
    this.nextDistantLife = this.h.now + this.h.rng.range(50, 90);
    const ctx = this.h.ctx();
    const weights = VOICE_FRAGMENTS.filter((f) => f.kind !== 'breath' && !this.h.owned.has(f.id)).map((f) => {
      const pull: Record<string, number> = {
        happiness: ctx.field.warmth + ctx.field.reminiscence, connection: ctx.field.solitude, isolation: ctx.field.solitude,
        nostalgia: ctx.field.reminiscence, misunderstanding: ctx.field.dissonance, affection: ctx.field.warmth,
      };
      let s = 0;
      // (Typed explicitly: @theatre/core's declarations narrow Object.entries globally.)
      for (const [k, w] of Object.entries(f.dims) as [string, number | undefined][]) s += (w ?? 0) * (pull[k] ?? 0.2);
      return { f, s: s + 0.1 };
    });
    const i = this.h.rng.weighted(weights.map((x) => x.s));
    if (i < 0) return;
    const frag = weights[i].f;
    const wall = this.h.rng.pick(WALLS.filter((s) => s !== this.h.facing));
    this.h.fragment('distant-life', frag, { kind: 'beyond', surface: wall }, 0, 0.4);
  }

  kneel() {
    const v = this.h.visitor;
    if (!v.kneeling || this.kneelVoiced || v.kneelTime < 4) return;
    // The chair's vignette (a child, asking someone to stay) may still come: its moment is kept.
    if (this.h.scenes.claimsChair(this.h.now, (id) => !this.h.ledger.unfinished.has(id))) return;
    this.kneelVoiced = true;
    if (this.h.rng.chance(0.4)) this.h.speakPhrase('kneel', PHRASE_BY_ID.get(PHRASE_IDS.smallMinute)!, { kind: 'chair' }, 2, 'child', 0.45);
  }

  /** Late, while nobody is looking, the chair is not quite where it was. */
  chairNudge(input: VisitorInput) {
    if (this.h.phase !== 'transform' || this.chairNudges >= 1 || this.h.now - this.h.shared.transformAt < 60 || this.h.pacing.holding(this.h.now)) return;
    if (input.gazeChair || this.h.visitor.distance < 2.2 || this.h.visitor.totalChairGaze < 8) return;
    this.chairNudges++;
    this.h.queue(0, { type: 'chairNudge', dx: this.h.rng.range(-0.06, 0.06), dz: this.h.rng.range(-0.06, 0.06), dyaw: this.h.rng.range(-0.2, 0.2) }, 'chair-nudge');
    if (this.h.visits > 1) this.h.reveal(PHRASE_IDS.movingChair, 90, 'chair-nudge', 'emerge', 10);
  }

  /**
   * Writing in the air, once a visit: when the visitor has been close to the chair and stepped
   * back from it (or has kept away from it a long time) and looks at it, "Please don't come any
   * closer." is written in the air in front of it. It goes as they come near: the request and
   * its undoing in one gesture (or, if those words are already on a wall, "far enough to miss
   * you", or "Come back. Don't."). Never while "stay" is unfinished (it would answer it),
   * and never in the first minute.
   */
  air() {
    if (this.airDone || this.h.now < 60) return;
    const v = this.h.visitor;
    // An answer to stepping back (well clear of the chair, so there is room to come closer), not
    // to standing by the door; only after a long time apart for someone who never came near.
    // After stepping back from having stayed by it a little (6 s), while they stay back, the chair in
    // view (not only stared at): spines go up after being left, not after being met
    // (docs/reviews/2026-11-core-loop.md). Or, for someone who never came to it, after a long time
    // apart, looking at it.
    const last = v.comings[v.comings.length - 1];
    const left = !!last && last.leftAt !== null && last.dwell >= 6 && !v.near && v.sinceWithdraw < Infinity && v.lastWithdrawAt >= last.leftAt && v.chairOutOfViewFor === 0;
    const apart = !v.comings.length && this.h.now >= 150 && v.gazeChairFor >= 1.5;
    if ((!left && !apart) || v.distance < 2.1 || v.speed > 0.3) return;
    // Words that are not already on a wall: a repeat would read as a copy, not as something said.
    const withheld = this.h.withheld();
    const phraseId = AIR_LINES.find((id) => !this.h.visible.has(id) && !withheld.includes(id));
    if (!phraseId) return;
    // A rare gesture, so not held back by the room being busy, only by it being busy right now:
    // nothing for a few seconds before it and nothing about to happen.
    if (!this.h.scheduler.majorFree(this.h.now) || this.h.pacing.holding(this.h.now) || this.h.pacing.sinceDev(this.h.now) < 6) return;
    if (this.h.scheduler.pending().some((e) => e.at - this.h.now < 6 && devKind(e.payload.cue) && devKind(e.payload.cue) !== 'silence')) return;
    this.airDone = true;
    this.h.shared.airAt = this.h.now;
    // (Then it is let be read, and they decide whether to come closer: the room holds when the words
    // appear, not when they are decided — a hold set here kept the words themselves waiting.)
    this.h.queue(0, { type: 'air', phraseId, toward: 0.6, aside: 0.55, height: 0.8 }, left ? 'withdraw-air' : 'air', { major: true, ttl: 4 });
  }
}
