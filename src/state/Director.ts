import { DRAWING_BY_ID } from '../content/drawings';
import { MemoryDirector } from './MemoryDirector';
import { VIGNETTE_BY_ID } from '../content/vignettes';
import { SCENE_MEMORIES, type HeartShape } from '../content/memories';
import { computeEnvironment, type Environment } from './director/environment';
import { Contributions } from './director/contributions';
import { Echoes } from './director/echoes';
import { WayOut, WAY_OUT } from './director/wayOut';
import { cameBack, stayedClose, visitShape } from './director/visitShape';
import { Encounters } from './director/encounters';
import { Responses } from './director/responses';
import { Approach } from './director/approach';
import { Heart, NORTH_LINES } from './director/heart';
import { WallLedger } from './director/ledger';
import { RoomLife, AIR_LINES } from './director/roomLife';
import { Silence } from './director/silence';
import { Voicing } from './director/voicing';
import { FIRST_WRITTEN, Writing } from './director/writing';
import { Stillness } from './director/stillness';
import { Withdraw } from './director/withdraw';
import { newSharedMarks, type QueueOptions, type RuleHost } from './director/host';
import { Rng } from '../core/rng';
import { EventScheduler } from '../core/scheduler';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import { DEPARTURE_BY_VISIT, DEPARTURE_STILL, type VoiceFragment } from '../content/relations';
import { WALLS, type Phase, type Wall, type Phrase, type Surface } from '../content/types';
import { VisitorModel, type VisitorInput } from './VisitorModel';
import { Memory } from './Memory';
import { EmotionalField } from './EmotionalField';
import { PhaseTracker, phaseAtLeast } from './Phase';
import { RULE, ROOM_OWN, isEncounter, isMeetingOrContribution, isSituation, isSituationLife, parseEncounterRule, ruleSource } from './rules';
import { WriteKeys, isMemoryOrHeartKey, parseWriteKey } from './writeKeys';
import { DRAWING_IDS, MEMORY_IDS, PHRASE_IDS } from '../content/ids';
import { Engagement } from './Engagement';
import { Pacing } from './Pacing';
import { PhraseSelector, type SelectContext } from './PhraseSelector';
import type { Cue, TimedCue, VoiceKind, VoicePosition } from './cues';
import type { Interpretation } from '../interpret/schema';

import { SituationRunner, type PhraseGeometry, type SituationHost } from './situations/Situation';
import { pickRepertoire } from './situations/library';
import { ROOM } from '../world/layout';

export type { Environment };

export interface VisibleState {
  mode: 'shown' | 'still';
  since: number;
  /** Shown from the start (arrival tier) — never culled. */
  base: boolean;
  /** A hide has been queued for it. */
  hiding?: boolean;
}

export interface DirectorOptions {
  seed: number;
  visits?: number;
  /** How many times each living memory has been seen on earlier visits. */
  memoryCounts?: Record<string, number>;
  /** Where each phrase is (world metres, chair at origin). Situations need it to relate place and writing. */
  geometry?: (phraseId: string) => PhraseGeometry | undefined;
  /** How the last visit left the chair (`hh.trace.v1`): the chair is turned before the room opens (App). */
  trace?: 'close' | null;
  /** Force a repertoire of situations (for inspection and tests). */
  situations?: string[];
  /**
   * The old arrival: the walls already written and a line redrawn as you come in. The room
   * now begins nearly empty and an authored opening (src/state/OpeningScore.ts) comes first.
   */
  legacyOpening?: boolean;
  /**
   * Design experiments, off unless named (docs/reviews/2026-11-core-loop.md): each changes one
   * part of how the room answers, so a visit with and without it can be compared on the same seed.
   */
  experiments?: readonly string[];
  /**
   * What the last visit's heart left beside "I wanted you to stay." (a phrase id, `hh.heart.v1`):
   * found there again on the next visit (docs/reviews/2026-11-emotional-arc.md).
   */
  answer?: string | null;
  /**
   * Whether a piece of writing is in the visitor's view now (the App knows the camera). Without it,
   * the wall faced stands in (the battery, tests).
   */
  inView?: (phraseId: string) => boolean;
}


export { ROOM_OWN };

/**
 * The chair on return (docs/reviews/2026-10-emotional-depth.md): after a visit that stayed close,
 * it is turned away from where the visitor comes in. Null: leave it.
 */
export function returnYaw(leaving: 'close' | null, base: number): number | null {
  return leaving === 'close' ? base + CLOSE_TURN : null;
}
/** How far it is turned (radians), seen in the returning opening's chair-only frame. */
export const CLOSE_TURN = 1.9;

/**
 * A designed moment is decided at the instant the room is free and has a ttl shorter than the
 * major gap: it goes before a major kept from earlier (which would take the slot, and the moment
 * would expire unheard with its spacing already spent).
 */
const DESIGNED = 3;

export class Director implements RuleHost {
  readonly visitor = new VisitorModel();
  readonly memory = new Memory();
  readonly field = new EmotionalField();
  readonly phaseTracker = new PhaseTracker();
  readonly engagement = new Engagement();
  readonly pacing = new Pacing();
  readonly selector = new PhraseSelector();
  // The room's own things are spaced 4–7 s apart, never at a fixed pulse (its own seeded draw, so
  // the visit's other choices are unchanged by it).
  readonly scheduler = new EventScheduler<{ cue: Cue; rule: string }>(7, () => this.roomGap());
  private gapRng = new Rng(1);
  private releaseStep = 0;
  /**
   * The gap before the room's next own event. After a memory's aftermath the room comes back
   * slowly and then less slowly (12–16 s, 8–11, 6–8), never on a pulse; otherwise 4–7 s.
   */
  private roomGap(): number {
    const since = this.now - this.aftermathUntil;
    if (since >= 0 && since < 45 && this.releaseStep < 3) {
      const [a, b] = [[12, 16], [8, 11], [6, 8]][this.releaseStep++];
      return this.gapRng.range(a, b);
    }
    return this.gapRng.range(4, 7);
  }
  readonly rng: Rng;
  readonly visible = new Map<string, VisibleState>();
  readonly log: TimedCue[] = [];
  env: Environment;
  visits: number;
  departing = false;

  private _facing: Surface = 'north';
  get facing(): Surface {
    return this._facing;
  }
  /** The wall faced, or null when looking at the floor or ceiling. */
  facingWall(): Wall | null {
    return (WALLS as readonly Surface[]).includes(this._facing) ? (this._facing as Wall) : null;
  }
  readonly situations: SituationRunner;
  readonly ledger = new WallLedger();
  /** Times and counts that more than one rule group reads or sets. */
  readonly shared = newSharedMarks();
  private readonly contributions = new Contributions(this);
  private readonly echoes = new Echoes(this);
  private readonly wayOut = new WayOut(this);
  private readonly encounters = new Encounters(this, (id) => this.wayOut.isOpenLine(id));
  private readonly responses = new Responses(this);
  private readonly approach = new Approach(this);
  private readonly withdraw = new Withdraw(this);
  private readonly stillness: Stillness;
  private readonly heart: Heart;
  private readonly writing: Writing;
  private readonly voicing: Voicing;
  private readonly roomLife = new RoomLife(this, { northKept: () => this.heart.northKept() });
  private readonly silence = new Silence(this, { wayOutRecent: () => this.wayOut.engaged() || this.wayOut.keptWithin(20) });
  private readonly host: SituationHost;
  readonly owned: Set<string>;
  private geometry: (id: string) => PhraseGeometry | undefined;
  private inView: (phraseId: string) => boolean;
  /** The memory has been offered (its line written where the visitor looks) / has played. */
  private memoryOffered = false;
  private memoryOfferedAt = -Infinity;
  memoryPlayed = false;
  /** No voices of the room's own until then: the memory's line has just been offered. */
  memoryQuietUntil = -Infinity;
  /**
   * The aftermath of a memory that was heard or watched: for a while the room's own life (new
   * writing drifting in, music, voices of its own, a situation's sounds, filler in a lull) waits,
   * so what happened is not covered over. What the visitor does is still answered. Chosen quiet,
   * not a stall (docs/reviews/2026-10-emotional-depth.md).
   */
  aftermathUntil = -Infinity;
  aftermath(): boolean {
    return this.now < this.aftermathUntil;
  }
  /** Seconds of it left (0 when there is none). */
  aftermathLeft(): number {
    return Math.max(0, this.aftermathUntil - this.now);
  }
  /**
   * The room's music is over for this visit (the woodland's afternoon has been seen: its music
   * was the last): nothing of the room's own plays again, its piano, its humming, or a tune a
   * humming situation owed (left unpaid). The room itself carries on.
   */
  private _musicWithdrawn = false;
  get musicWithdrawn(): boolean {
    return this._musicWithdrawn;
  }
  withdrawMusic(): void {
    this._musicWithdrawn = true;
  }

  /** A memory with voices of its own is playing: a vignette, or a painted memory begun with its overheard voices. */
  get vignettePlaying(): boolean {
    return !!this.scenes.active && (VIGNETTE_BY_ID.has(this.scenes.active.id) || !!this.scenes.active.voiced);
  }

  /** The hold that came with the last line offered for a memory (it doesn't hold back that memory). */
  private offerHoldTo = -Infinity;

  /** The last vignette to end (the visit's turn keeps clear of it). */
  private vignetteEnded: { id: string; at: number; dimmed: boolean } | null = null;
  /** The living memories: when one may open (src/state/MemoryDirector.ts). */
  readonly scenes: MemoryDirector;
  /** The line was touched (phones): latched until the memory can play. */
  private memoryTouched = false;
  /** The end of the pacing hold the memory asked for itself (so it never waits on its own hold). */
  private memoryHoldTo = -Infinity;
  /** When the pending turn first could have come (it waits for a return at most 30 s). */
  private pendingPhaseAt = -Infinity;
  /** A few seconds after a living memory ends, before the room turns a phase. */
  private scenesQuietAt = -Infinity;
  private taps = 0;
  private tappedAt = new Map<string, number>();
  private lastTapAt = -Infinity;
  /** Per-cooldown jitter, re-rolled each time it is used, so periodic rules don't beat in time. */
  private jitter = new Map<string, number>();
  private readonly legacy: boolean;
  readonly seed: number;
  /** While the authored opening plays, the room's own rules wait and its clock doesn't run. */
  held = false;
  /**
   * The design experiments this build defines (docs/reviews/2026-11-core-loop.md, 2026-11-emotional-arc.md).
   * The November 2026 rounds' winners are how the room behaves now; `noHeart` turns the visit's heart
   * off, so the arc battery (scripts/arc.ts) can compare with the room before it. A name not listed here is
   * ignored by the room (the App warns) and refused by the battery (scripts/experiment.ts), so two
   * arms can never be compared while running the same code.
   */
  static readonly EXPERIMENTS: readonly string[] = ['noHeart'];
  /** The design experiments this visit runs (empty in the room unless `?exp=` names some). */
  readonly exp: ReadonlySet<string>;

  constructor(opts: DirectorOptions) {
    this.exp = new Set((opts.experiments ?? []).filter((e) => Director.EXPERIMENTS.includes(e)));
    this.heart = new Heart(this, {
      seed: opts.seed,
      answer: opts.answer ?? null,
      memoryCounts: opts.memoryCounts ?? {},
      enabled: !this.exp.has('noHeart'),
      inView: (id) => this.inView(id),
      recoiledAt: () => this.approach.firstRecoilAt,
    });
    this.rng = new Rng(opts.seed);
    this.gapRng = new Rng(opts.seed * 7919 + 101);
    this.seed = opts.seed;
    this.scenes = new MemoryDirector(opts.memoryCounts ?? {});
    this.visits = opts.visits ?? 1;
    this.stillness = new Stillness(this);
    // The room begins nearly empty: only the writing on the floor by the chair, which can only
    // be read by someone who comes close. The rest accumulates (ruleAccumulate).
    this.legacy = !!opts.legacyOpening;
    this.voicing = new Voicing(this, { northKept: () => this.heart.northKept(), refusesStayWords: () => this.wayOut.refusesStayWords(), legacy: this.legacy });
    this.writing = new Writing(this, { legacy: this.legacy }, { memoryPlayed: () => this.memoryPlayed, isWayOut: (id) => this.wayOut.isOpenLine(id) });
    for (const p of PHRASES) if (this.legacy ? p.tier === 'arrival' || p.tier === 'near' : p.tier === 'near' && p.surface === 'floor') this.visible.set(p.id, { mode: 'shown', since: 0, base: true });
    this.geometry = opts.geometry ?? (() => undefined);
    this.inView = opts.inView ?? ((id) => PHRASE_BY_ID.get(id.replace(/^heart:/, ''))?.surface === this.facing);
    this.situations = new SituationRunner(Director.repertoire(this.visits, opts.situations, opts.seed));
    this.owned = this.situations.owned();
    this.host = this.makeHost();
    this.env = this.computeEnv();
    // Returning visitors find a room that remembers being visited.
    // (When the last visit stayed close, the chair, turned away, is the only sign: nothing asks.)
    if (this.visits > 1 && opts.trace !== 'close') this.reveal(PHRASE_IDS.rememberMe, 7, 'return', 'emerge', 8);
  }

  static readonly repertoire = pickRepertoire;
  /** Writing the room starts with, ordinary things first. */
  static readonly FIRST_WRITTEN = FIRST_WRITTEN;
  /** What may be written in the air, in order of preference. */
  static readonly AIR_LINES = AIR_LINES;

  private makeHost(): SituationHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const d = this;
    return {
      get now() {
        return d.now;
      },
      get visitor() {
        return d.visitor;
      },
      get memory() {
        return d.memory;
      },
      get field() {
        return d.field.v;
      },
      get phase() {
        return d.phase;
      },
      get facing() {
        return d.facing;
      },
      get visible() {
        return d.visible;
      },
      get rng() {
        return d.rng;
      },
      geometry: (id) => d.geometry(id),
      distToSurface: (s) => {
        const sc = d.env?.roomScale ?? 1;
        const { x, z } = d.visitor;
        if (s === 'north') return z + ROOM.halfD * sc;
        if (s === 'south') return ROOM.halfD * sc - z;
        if (s === 'east') return ROOM.halfW * sc - x;
        if (s === 'west') return x + ROOM.halfW * sc;
        return 0;
      },
      emit: (rule, delay, cue, opts) => d.queue(delay, cue, rule, opts),
      cancel: (rule) => d.scheduler.cancelWhere((e) => e.rule === rule),
      reveal: (rule, id, delay, mode, seconds) => d.reveal(id, delay, rule, mode, seconds),
      speak: (rule, p, position, delay, style, gain) => d.speakPhrase(rule, p, position, delay, style, gain),
      musicReady: (sec) => !d.musicWithdrawn && d.scheduler.ready('music', d.now, sec),
      get musicWithdrawn() {
        return d.musicWithdrawn;
      },
      markMusic: () => d.scheduler.mark('music', d.now),
      lastContribution: () => d.contributions.last,
      // A situation is a strong thing: it doesn't begin over a meeting, inside a held silence,
      // or while the room is still recovering from something else.
      attending: () => d.attending() || d.aftermath() || d.pacing.holding(d.now) || !d.pacing.intenseFree(d.now) || !d.scheduler.majorFree(d.now),
    };
  }

  get phase(): Phase {
    return this.phaseTracker.phase;
  }
  get now(): number {
    return this.visitor.t;
  }

  /** A cooldown whose length wanders (×0.6–1.6) from use to use. */
  cool(key: string, base: number): boolean {
    return this.scheduler.ready(key, this.now, base * (this.jitter.get(key) ?? 1));
  }
  used(key: string): void {
    this.scheduler.mark(key, this.now);
    this.jitter.set(key, this.rng.range(0.6, 1.6));
  }

  /** The visitor is in the middle of meeting a line: its beat is waiting or about to sound. */
  attending(): boolean {
    return this.encounters.waiting || this.memoryAwaited() || !!this.scenes.active || this.scheduler.pending().some((e) => isEncounter(e.payload.rule) && e.payload.cue.type === 'voice');
  }

  ctx(): SelectContext {
    return {
      field: this.field.v,
      phase: this.phase,
      memory: this.memory,
      now: this.now,
      recentRead: this.visitor.readOrder,
      rng: this.rng,
    };
  }

  queue(delay: number, cue: Cue, rule: string, opts: QueueOptions = {}) {
    // The room's own events never come together (a burst reads as a machine): spaced by the scheduler.
    const source = ruleSource(rule);
    this.scheduler.schedule(this.now + delay, { cue, rule }, { ...opts, room: source === 'room', group: rule, marks: source === 'turn' });
  }

  reveal(id: string, delay: number, rule: string, mode: 'emerge' | 'still' = 'emerge', seconds = 9) {
    const p = PHRASE_BY_ID.get(id);
    if (!p || p.tier === 'annotation') return;
    this.queue(delay, { type: 'reveal', phraseId: id, mode, seconds }, rule, { key: `reveal:${id}` });
  }

  /**
   * Whether the room declines to say this now. A refused voice queues nothing, so nothing may be
   * counted for it: callers that commit state around a voice ask first, or use what `voice` returns.
   */
  voiceRefused(rule: string, phraseId?: string, finish = false): boolean {
    return this.voicing.voiceRefused(rule, phraseId, finish);
  }

  /** Queues the voice; false when the room declined to speak (nothing was queued or counted). */
  voice(rule: string, delay: number, kind: VoiceKind, text: string | null, caption: string, position: VoicePosition, extra: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number; finish?: boolean } = {}): boolean {
    return this.voicing.voice(rule, delay, kind, text, caption, position, extra);
  }

  /** Says a phrase; only a voice that was queued is counted as spoken. */
  speakPhrase(rule: string, p: Phrase, position: VoicePosition, delay = 0, styleOverride?: Phrase['voice'], gain = 0.8): boolean {
    return this.voicing.speakPhrase(rule, p, position, delay, styleOverride, gain);
  }

  fragment(rule: string, f: VoiceFragment, position: VoicePosition, delay = 0, gain = 0.6): void {
    this.voicing.fragment(rule, f, position, delay, gain);
  }

  // ───────────────────────────── tick ─────────────────────────────

  tick(dt: number, input: VisitorInput, facing: Surface): TimedCue[] {
    // During the opening the room's own life hasn't begun: no rule runs and no time passes
    // for it (its clock is the visitor model's), so nothing is owed at the hand-off.
    if (this.held) return [];
    // Kneeling is kneeling by the chair (the App's own reach for it, 1.5 m): K pressed across the
    // room lowers the eye, but the room doesn't take it for kneeling there.
    if (input.kneeling && Math.hypot(input.x, input.z) > 1.5) input = { ...input, kneeling: false };
    this._facing = facing;
    const v = this.visitor;
    v.update(dt, input);
    this.writing.noteFacing(facing);
    this.engagement.update(dt, v, input.yaw);
    const formed = this.memory.update(v, dt);
    const phaseChanged = this.phaseTracker.update(v, this.memory, this.engagement);
    this.field.update(dt, v, this.memory, this.phase);

    if (!this.departing) {
      for (const m of formed) this.voicing.onMotif(m);
      // The turn into a new phase waits for a living memory to end (it would black out the room
      // in the middle of it), and a few seconds more.
      if (phaseChanged) {
        if (!this.shared.pendingPhase) this.pendingPhaseAt = this.now;
        this.shared.pendingPhase = phaseChanged;
      }
      // (A phase turns after a memory's aftermath, never inside it, nor while the visitor stays
      // with the kitchen-light line: the room waits with them. Nor while they may be coming back
      // to the chair: the recoil is theirs, and the turn's line comes after it, not over it.)
      const returnWaits = this.approach.returnInReach() && this.now - this.pendingPhaseAt < 30;
      if (this.shared.pendingPhase && !returnWaits && !this.scenes.active && this.now >= this.scenesQuietAt && !this.aftermath() && !this.memoryAwaited() && !this.wayOut.engaged()) {
        this.onPhase(this.shared.pendingPhase);
        this.shared.pendingPhase = null;
      }
      if (phaseChanged === 'transform') this.shared.transformAt = this.now;
      if (this.legacy) this.writing.opening();
      // (The heart is decided before the kitchen light may be offered: it waits for the heart.)
      this.heart.decide();
      this.ruleMemory();
      this.ruleScenes();
      this.heart.writeAnswer();
      this.heart.keptAnswer();
      // (The answer has been read: the card may end on it.)
      this.heart.watchAnswer(dt);
      this.echoes.tick();
      this.writing.accumulate();
      this.writing.drawings();
      this.writing.finish();
      this.situations.tick(this.host);
      // A memory and its aftermath are the memory's: stillness or closeness that grew while the
      // visitor was carried, or in the quiet after it, is not theirs to be answered for, and both
      // are counted again from when the aftermath ends (decision 117). What the visitor does is
      // still answered, a first approach to the chair among it.
      if (this.scenes.active || this.aftermath()) {
        this.stillness.pause();
        if (this.visitor.near && this.approach.spokenFirst) this.visitor.nearSince = this.visitor.t;
      }
      // In a memory's aftermath, and inside a held silence, the room's own life waits; what the
      // visitor does is still answered. (That the room's own things never come together is the
      // scheduler's: they are spaced 4–7 s apart.)
      const quiet = this.aftermath() || this.now < this.shared.heldSilenceUntil;
      if (!quiet) this.roomLife.drift();
      this.stillness.tick(dt);
      this.approach.tick();
      this.withdraw.tick();
      this.encounters.tick();
      if (!quiet) {
        this.roomLife.resurface();
        this.roomLife.music();
        this.roomLife.recontext();
        this.roomLife.contaminate();
        this.roomLife.distantLife();
      }
      this.roomLife.kneel();
      if (!quiet) {
        this.roomLife.chairNudge(input);
        this.voicing.attention();
        this.voicing.rehear();
        this.voicing.payHesitation();
      }
      this.silence.tick();
      this.roomLife.air();
      if (!quiet) this.responses.tick();
      this.silence.tableLift();
      this.wayOut.tick(input);
    }
    this.pacing.tick(dt, this.now, this.phase, this.engagement.activity(this.now));

    this.env = this.computeEnv();

    const out: TimedCue[] = [];
    const due = this.scheduler.tick(this.now);
    // A meeting's voice that never found room is owed to the next meeting, not lost.
    for (const { cue, rule } of this.scheduler.expired) this.lost(cue, rule);
    for (const item of due) {
      const { cue, rule } = item;
      this.dueOpts = this.scheduler.optsOf(item);
      if (!this.accept(cue, rule)) {
        this.lost(cue, rule);
        continue;
      }
      const tc = { t: +this.now.toFixed(2), cue, rule };
      if (cue.type === 'air') this.pacing.holdFor(this.now, 12);
      if (cue.type === 'voice' && cue.phraseId) this.wayOut.voiceSounded(cue.phraseId);
      if (rule === RULE.tableSilence && cue.type === 'silence') this.silence.tableSounded(cue.seconds);
      out.push(tc);
      this.pacing.note(this.now, cue, rule);
      // The inspector log never keeps a visitor's own words.
      this.log.push(cue.type === 'write' && cue.purpose === 'contribution' ? { ...tc, cue: { ...cue, text: '[visitor’s words]' } } : tc);
      if (this.log.length > 400) this.log.shift();
    }
    return out;
  }

  /** A voice that was decided on but never sounded: undo what it was counted for. */
  private lost(cue: Cue, rule: string) {
    // A memory that never found room isn't spent: it waits for the next look.
    if (cue.type === 'memory-scene' || cue.type === 'vignette') this.scenes.cancel(cue.id, this.now);
    if (cue.type === 'memory') this.memoryPlayed = false;
    // A memory's line, or the heart's, decided on and never written: as if it found no room (not spent).
    if (cue.type === 'write' && isMemoryOrHeartKey(cue.key)) this.writeFailed(cue.key);
    // The held silence that never sounded: the visit still has it.
    if (cue.type === 'silence' && (rule === RULE.heldSilence || rule === RULE.tableSilence)) this.silence.lost();
    if (cue.type !== 'voice' || !cue.phraseId) return;
    // A line the room was finishing, unheard: it is still unfinished.
    if (cue.finish) this.ledger.unfinished.add(cue.phraseId);
    // A voice that was to write its line as it was heard: the line was marked as there when the
    // voice was queued. Unheard, it was never written, so it isn't there.
    if (cue.write) this.unwrite(cue.phraseId);
    if (this.memory.spoken.get(cue.phraseId) !== undefined) this.memory.spoken.delete(cue.phraseId);
    this.voicing.forget(cue.phraseId);
    const enc = parseEncounterRule(rule);
    if (enc) this.encounters.rewind(enc.phraseId, enc.n);
  }

  /** A line marked as there when its voice was queued, to be written as it was heard, that won't be. */
  private unwrite(id: string) {
    const st = this.visible.get(id);
    if (st?.base && this.ledger.accumulating.has(id)) {
      this.visible.delete(id);
      this.ledger.accumulating.delete(id);
      this.memory.surfaced.delete(id);
    }
  }

  /** How the cue now being accepted was scheduled (put back the same when it must wait). */
  private dueOpts: { major?: boolean; ttl?: number; key?: string; priority?: number } = {};

  /** Keep the Director's model of what is visible in sync with the cues it lets through. */
  private accept(cue: Cue, rule: string): boolean {
    // After the room's last music, none of its own again, nor anyone humming.
    if (this._musicWithdrawn && (cue.type === 'music' || (cue.type === 'voice' && cue.kind === 'hum'))) return false;
    // A situation that took the chair's voice or the space beyond the walls after this was
    // queued keeps it: claims hold at the moment of sounding, not only when queued.
    if (cue.type === 'voice' && !isSituation(rule)) {
      if (cue.position.kind === 'chair' && this.situations.claimed('chair-voice')) return false;
      if (cue.position.kind === 'beyond' && this.situations.claimed('beyond')) return false;
    }
    if (cue.type === 'music' && !isSituation(rule) && this.situations.claimed('music')) return false;
    // Nothing sounds over a memory: a situation's laugh or murmur waits too (it is emitted
    // directly, not through the voice rules that already wait).
    // (A meeting's or a contribution's gesture was counted when it was decided: it waits, not lost.)
    if (this.scenes.active && (cue.type === 'sound' || cue.type === 'music') && isMeetingOrContribution(rule)) {
      this.queue(4, cue, rule, { ...this.dueOpts, major: true });
      return false;
    }
    if (this.scenes.active && ((cue.type === 'voice' && (!cue.finish || this.vignettePlaying)) || cue.type === 'sound' || cue.type === 'music')) return false;
    if (cue.type === 'reveal' && this.withheld().includes(cue.phraseId)) return false;
    // Once the heart's answer is written, the north wall is left as the heart left it: nothing new
    // is written, revealed or re-inked there for the rest of the visit (the visitor's own words
    // aside). One peak, and its last word (creative director, 2026-11-06).
    if (this.heart.northKept() && this.heart.onNorth(cue) && rule !== RULE.contribution) return false;
    // (A voice queued to write its line there before the wall was held is heard, and writes nothing.)
    if (cue.type === 'voice' && cue.write && cue.phraseId && this.heart.northKept() && PHRASE_BY_ID.get(cue.phraseId)?.surface === 'north') {
      this.unwrite(cue.phraseId);
      delete cue.write;
    }
    // (Nor is a line kept back written again in its own place: decision 137, QA 2026-10-20.)
    if (cue.type === 'redraw' && this.ledger.keptBack.has(cue.phraseId)) return false;
    // A situation's own sounds wait out a memory's aftermath (those answering the visitor don't).
    if (this.aftermath() && isSituationLife(rule) && (cue.type === 'voice' || cue.type === 'sound' || cue.type === 'music')) {
      this.queue(this.aftermathUntil - this.now + 1, cue, rule, this.dueOpts);
      return false;
    }
    // Nothing of the room's own comes in a memory's aftermath, or while the room is holding (a
    // held silence; the visitor staying with the kitchen-light line), even if it was decided
    // before: it waits until after (and the scheduler spaces what was waiting).
    if (ROOM_OWN.test(rule) && !isSituation(rule) && (this.aftermath() || this.pacing.holding(this.now))) {
      // (After an aftermath, the first a few seconds after it.)
      const after = this.aftermath() ? this.aftermathUntil + this.gapRng.range(3, 6) : this.pacing.heldUntil + 1;
      this.queue(Math.max(after, this.now + 1) - this.now, cue, rule, this.dueOpts);
      return false;
    }
    // Nor do they break into a held silence (a laugh on a timer, landing in the middle of it): after it, and its exhale.
    if (this.pacing.holding(this.now) && isSituationLife(rule) && (cue.type === 'voice' || cue.type === 'sound' || cue.type === 'music')) {
      this.queue(this.pacing.heldUntil - this.now + 6, cue, rule, this.dueOpts);
      return false;
    }
    // The visit's turn, due while a vignette plays or just after one: it waits until it is clear.
    if (rule === RULE.phaseTransform && cue.type === 'silence' && !this.departing) {
      const { delay: d0, dark } = this.turnClear(this.vignettePlaying ? 30 : 0);
      const delay = Math.max(d0, this.aftermath() ? this.aftermathUntil - this.now + 1 : 0);
      if (delay > 0) {
        const { dim: _d, dimSeconds: _s, ...rest } = cue;
        this.queue(delay, dark ? cue : rest, rule, { major: true, ttl: 30 });
        return false;
      }
    }
    // While a living memory plays, the room waits with it: no silence (a dim would darken the
    // painting), no new line revealed or written.
    if (this.scenes.active && isMeetingOrContribution(rule) && (cue.type === 'silence' || cue.type === 'reveal' || cue.type === 'write')) {
      this.queue(4, cue, rule, { ...this.dueOpts, major: cue.type === 'silence' });
      return false;
    }
    if (this.scenes.active && (cue.type === 'silence' || cue.type === 'reveal' || (cue.type === 'write' && rule !== RULE.memoryOffer))) return false;
    if (this.scenes.active) {
      // Nor anything else that would move or appear. What the room had decided on (a drawing, words
      // in the air, the kitchen's light, a line rubbed out or let go) waits until the memory has
      // gone (it is already counted as done, so dropping it would lose it); a passing flash, glow,
      // nudge of the chair or link between lines simply doesn't happen.
      if (cue.type === 'draw' || cue.type === 'air' || cue.type === 'memory' || cue.type === 'erode' || cue.type === 'hide') {
        this.queue(4, cue, rule, { major: cue.type === 'air' || cue.type === 'memory' });
        return false;
      }
      if (cue.type === 'flash' || cue.type === 'glow' || cue.type === 'chairNudge' || cue.type === 'chairTurn' || cue.type === 'link' || (cue.type === 'redraw' && rule !== RULE.memoryOffer)) return false;
    }
    if (cue.type === 'reveal') {
      const cur = this.visible.get(cue.phraseId);
      if (cur && cur.mode === 'shown') return false;
      if (cue.mode === 'still' && this.visitor.stillFor < 2) return false;
      this.visible.set(cue.phraseId, { mode: cue.mode === 'still' ? 'still' : 'shown', since: this.now, base: this.ledger.accumulating.has(cue.phraseId) });
      this.memory.surfaced.set(cue.phraseId, this.now);
      this.cull();
    } else if (cue.type === 'hide') {
      const cur = this.visible.get(cue.phraseId);
      if (!cur || cur.base) return false;
      this.visible.delete(cue.phraseId);
    }
    return true;
  }

  private budget(): number {
    return { arrival: 3, familiar: 8, contradiction: 12, transform: 16 }[this.phase];
  }

  private cull() {
    // (Never the way out, once it is the way out: Codex review, PR #56.)
    const revealed = [...this.visible.entries()].filter(([id, s]) => !s.base && s.mode === 'shown' && !this.wayOut.isOpenLine(id));
    const over = revealed.length - this.budget();
    if (over <= 0) return;
    revealed.sort((a, b) => a[1].since - b[1].since);
    for (const [id] of revealed.slice(0, over)) {
      if (id === this.visitor.gazeId) continue;
      this.queue(0.5, { type: 'hide', phraseId: id, seconds: 14 }, 'cull');
    }
  }

  // ───────────────────────────── rules ─────────────────────────────

  /** Phrases kept for particular moments; they never just drift onto the walls. */
  static readonly RESERVED = new Set<string>([PHRASE_IDS.thankStaying, PHRASE_IDS.movingChair, PHRASE_IDS.gladCame, PHRASE_IDS.dontHaveSay]);

  /** Kept for its moment: the reserved lines, and the memory's line until the memory offers it. */
  reserved(id: string): boolean {
    // (The door's line belongs beneath the drawn door, the woodland's to its own offer: never
    // drifted onto a wall before that.)
    return Director.RESERVED.has(id) || (id === Director.MEMORY.phraseId && !this.memoryOffered) || this.heldForOffer(id);
  }

  hiddenExcluding(): Set<string> {
    const out = new Set([...this.visible.keys(), ...Director.RESERVED, ...this.withheld()]);
    // (Nothing new on the north wall after the heart's answer: the room chooses from the others.)
    if (this.heart.northKept()) for (const id of NORTH_LINES) out.add(id);
    if (!this.memoryOffered) out.add(Director.MEMORY.phraseId);
    for (const m of SCENE_MEMORIES) if (this.heldForOffer(m.phraseId)) out.add(m.phraseId);
    return out;
  }

  /** A painted memory's line kept for its offer (`reserved`), not yet offered. */
  private heldForOffer(id: string): boolean {
    return SCENE_MEMORIES.some((m) => m.reserved && m.phraseId === id && !this.scenes.wasOffered(m.id));
  }

  /** Lines kept off the walls for the rest of the visit. */
  keepBack(ids: readonly string[]): void {
    this.ledger.keepBack(ids);
  }

  withheld(): string[] {
    return this.ledger.withheld();
  }


  /**
   * The first seconds. The room must not feel as if it is loading: the line in front of the
   * visitor writes itself as the light comes up, and — differently from visit to visit — the
   * room has only just been left: a door closing behind them, or the chair settling with a
   * warmth still on it, or the hum simply dropping as the line is finished.
   */
  /** Hold the room for the authored opening. */
  hold() {
    this.held = true;
  }

  /**
   * The opening has ended: what it wrote and said are now part of the room. Stillness built up
   * while the visitor watched it doesn't count (or every answer to stillness would arrive at once).
   */
  release(opened: { written?: string[]; spoken?: string[]; unfinished?: string[] } = {}) {
    for (const id of opened.unfinished ?? []) this.ledger.unfinished.add(id);
    for (const id of opened.written ?? []) {
      this.visible.set(id, { mode: 'shown', since: this.now, base: true });
      this.memory.surfaced.set(id, this.now);
    }
    for (const id of opened.spoken ?? []) this.memory.spoken.set(id, this.now);
    this.visitor.stillFor = 0;
    this.visitor.deepStillFor = 0;
    this.stillness.restart();
    this.held = false;
  }

  /**
   * Touching (or clicking) writing is deliberate attention: it counts as reading it at once.
   * The room leans in a little — the hum dips while the words are read. Returns whether the
   * touch was recognised.
   */
  tapped(t: { phraseId?: string; chair?: boolean }): boolean {
    if (this.departing) return false;
    if (t.chair) {
      if (this.now - this.lastTapAt >= 2) this.engagement.raise('tap-chair', this.now);
      this.lastTapAt = this.now;
      return true;
    }
    if (!t.phraseId || !PHRASE_BY_ID.has(t.phraseId)) return false;
    this.wayOut.touched(t.phraseId);
    this.visitor.touch(t.phraseId);
    // Touching the memory's line asks for its memory, however recently it was touched.
    if (t.phraseId === Director.MEMORY.phraseId && !this.memoryPlayed && this.visible.has(t.phraseId)) this.memoryTouched = true;
    if (this.visible.has(t.phraseId)) this.scenes.tapped(t.phraseId);
    // Touching the same words again and again, or tapping everything, is not more attention.
    if (this.now - (this.tappedAt.get(t.phraseId) ?? -Infinity) < 9 || this.now - this.lastTapAt < 2) return true;
    this.tappedAt.set(t.phraseId, this.now);
    this.lastTapAt = this.now;
    this.engagement.raise('tap', this.now, t.phraseId);
    this.taps++;
    // (The touch is felt in the ink, by the world: WallText.press. The dip in the hum it used to
    // get, half the time, can't be heard on a phone's speaker, where most touches are.)
    return true;
  }

  /**
   * One memory a visit intrudes on the room as light: "the light in the kitchen at four in the
   * afternoon", read, and for a few seconds that light falls across the wall where the words
   * are. Late (from 150 s, once the room has begun to contradict itself), so it is not spent on
   * arrival. If the line isn't on a wall yet, it is written first where the visitor is looking;
   * the light comes when they stay with it (2.5 s), or touch it. Then the room holds still.
   */
  static readonly MEMORY = { phraseId: PHRASE_IDS.kitchenLight, attack: 3, hold: 6, release: 4 };
  /** The visitor is staying with the memory's line (or touched it) and its light is still to come. */
  private memoryAwaited(): boolean {
    if (this.memoryPlayed || !this.memoryOffered || !this.visible.has(Director.MEMORY.phraseId)) return false;
    return this.memoryTouched || this.visitor.gazeId === Director.MEMORY.phraseId;
  }

  private memoryNoRoom: { surface: Surface; at: number } | null = null;
  private ruleMemory() {
    // Cereal is the same kitchen: if it has opened this visit, the late light isn't offered.
    if (this.memoryPlayed || this.departing || this.scenes.paintedPlayed || this.scenes.kitchenTaken) return;
    // (Nor while the visit's heart is chosen and waiting: it is the memory this visit is for. If it
    // was pointed at and let be, the light may still come.)
    if (this.scenes.heart && !this.scenes.heartPlayed && !this.memoryOffered && !this.scenes.heartLapsed(this.now)) return;
    if (this.now < 150 || !phaseAtLeast(this.phase, 'contradiction')) return;
    const m = Director.MEMORY;
    // Its own hold (below) doesn't keep it waiting.
    // (Never in another memory's aftermath, offered or begun.)
    const free = this.scheduler.majorFree(this.now) && !this.aftermath() && (!this.pacing.holding(this.now) || this.pacing.heldUntil <= this.memoryHoldTo);
    if (!this.visible.has(m.phraseId)) {
      // Not in the quiet a vignette leaves behind (the light offered there would answer it).
      if (this.memoryOffered || !free || this.heart.northHeld() || this.now < this.memoryQuietUntil || this.pacing.repeats('text', this.now, 8) || this.withheld().includes(m.phraseId)) return;
      // (A wall it found no room on is not tried again for a minute: it was written there eight times.)
      if (this.memoryNoRoom && this.memoryNoRoom.surface === this.facing && this.now - this.memoryNoRoom.at < 60) return;
      const p = PHRASE_BY_ID.get(m.phraseId)!;
      this.memoryOffered = true;
      this.memoryOfferedAt = this.now;
      this.memoryQuietUntil = this.now + 15;
      // The line arrives alone: nothing else is revealed, written or begun with it, so a visitor
      // who stays with it gets the light, not whatever else happened at the same moment.
      this.memoryHoldTo = this.now + 2.4;
      this.pacing.holdFor(this.now, 2.4);
      this.visible.set(p.id, { mode: 'shown', since: this.now, base: true });
      this.memory.surfaced.set(p.id, this.now);
      this.queue(0, {
        type: 'write', key: WriteKeys.memory(p.id), text: p.text, hand: p.hand === 'typed' ? 'pencil' : p.hand, size: 's',
        surface: this.facing, purpose: 'recall', ttl: 0, source: p.id,
      }, 'memory-offer');
      return;
    }
    const v = this.visitor;
    // While they stay with it, nothing else is revealed or written: the room waits with them.
    if (this.memoryAwaited() && (!this.pacing.holding(this.now) || this.pacing.heldUntil <= this.memoryHoldTo)) {
      this.memoryHoldTo = this.now + 0.3;
      this.pacing.holdFor(this.now, 0.3);
    }
    const looked = v.gazeId === m.phraseId && v.gazeFor >= 2.5;
    if (!looked && !this.memoryTouched) return;
    // Never on top of a voice (one just heard, or one about to be), a dim, a flash.
    if (!free || this.pacing.repeats('voice', this.now, 4) || this.pacing.repeats('light', this.now, 10)) return;
    this.memoryPlayed = true;
    this.memoryQuietUntil = -Infinity;
    // Later memories keep their distance from this one too.
    this.scenes.lastEnded = this.now + m.attack + m.hold + m.release;
    this.queue(0, { type: 'memory', phraseId: m.phraseId, attack: m.attack, hold: m.hold, release: m.release }, 'memory', { major: true, ttl: 3, priority: DESIGNED });
    // The light is the answer: nothing else while it is there, and a moment after.
    this.pacing.holdFor(this.now, m.attack + m.hold + m.release + 3);
  }

  /**
   * A living memory (src/state/MemoryDirector.ts decides when): once begun, the room waits with
   * it (no voices, nothing new written or revealed) until the App says it has gone.
   */
  private ruleScenes() {
    const v = this.visitor;
    // (The hold that comes with a line offered for a memory is that memory's: it doesn't keep it waiting.)
    const held = this.pacing.holding(this.now) && this.pacing.heldUntil > this.offerHoldTo;
    const free = this.scheduler.majorFree(this.now) && !held && !this.pacing.repeats('voice', this.now, 4) && !this.pacing.repeats('light', this.now, 10);
    const start = this.scenes.update({
      now: this.now,
      visible: (id) => this.visible.has(id),
      gazeId: v.gazeId,
      gazeFor: v.gazeFor,
      free,
      // (Kitchen-light having played is not a block: the arc and the spacing decide. Only one
      // waiting to be seen, or playing, is.)
      otherMemory: this.memoryAwaited(),
      departing: this.departing,
      kitchenPlayed: this.memoryPlayed,
      facing: this.facing,
      phase: this.phase,
      chairDistance: v.distance,
      finished: (id) => !this.ledger.unfinished.has(id),
      stillFor: v.stillFor,
      kneeling: v.kneeling,
      variantCtx: () => ({
        visits: this.visits,
        field: { ...this.field.v },
        motifs: [...this.memory.formed.keys()],
        withdrew: v.sinceWithdraw < 60,
      }),
    });
    if (start?.kind === 'vignette') this.queue(0, { type: 'vignette', id: start.id, phraseId: start.phraseId, variant: start.variant }, 'vignette', { major: true, ttl: 3, priority: DESIGNED });
    else if (start) this.queue(0, { type: 'memory-scene', id: start.id, phraseId: start.phraseId, variant: start.variant, minHold: start.minHold, maxHold: start.maxHold, voices: start.voices }, 'memory-scene', { major: true, ttl: 3, priority: DESIGNED });
    if (this.scenes.active) this.pacing.holdFor(this.now, 0.5);
    // A later memory's line is offered as the kitchen-light memory's is: written alone, where
    // the visitor is looking, and the room holds still a moment so a visitor who stays with it
    // gets the memory, not whatever else happened at the same time.
    // (Nor, facing the north wall while it is held, onto it: it waits until they face another wall.)
    const northHeld = this.heart.northHeld();
    const offer = this.scenes.offer({
      now: this.now,
      phase: this.phase,
      // (Never into a busy room: the line arrives into quiet, or waits. Nor into a memory's aftermath.)
      free: free && !northHeld && !this.aftermath() && !this.pacing.repeats('text', this.now, 8) && !this.pacing.crowded(this.now),
      visibleFacing: (id) => this.visible.has(id) && !this.ledger.keptBack.has(id) && PHRASE_BY_ID.get(id)?.surface === this.facing,
      visible: (id) => this.visible.has(id),
      departing: this.departing,
      otherMemory: this.memoryAwaited(),
      facing: this.facing,
      darkEnded: Number.isFinite(this.shared.heldSilenceUntil) ? this.shared.heldSilenceUntil : null,
      kitchenPlayed: this.memoryPlayed,
      kitchenOffered: this.memoryOffered,
      kitchenOfferedAt: this.memoryOffered ? this.memoryOfferedAt : undefined,
      prefer: this.earned(),
      // (And only while they look at a wall, level: at the chair, looking down at it, a line written
      // "where they look" lands out of view. Interaction designer, 2026-11-06.)
      // (Nor looking steeply up: the band it is written in, at eye height, is then below the frame.)
      heartFree: this.scheduler.majorFree(this.now) && !held && !northHeld && !this.aftermath() && this.pacing.sinceDev(this.now) >= 4 && !this.pacing.repeats('voice', this.now, 4) && this.facing !== 'floor' && this.facing !== 'ceiling' && v.pitch > -0.3 && v.pitch < 0.25 && !(this.sceneNoRoom?.surface === this.facing && this.now - this.sceneNoRoom.at < 60),
    });
    if (offer?.reink) {
      // Already on the wall they face: written again there, in front of them (no new line).
      this.pacing.holdFor(this.now, 2.4);
      this.offerHoldTo = this.now + 2.4;
      this.queue(0, { type: 'redraw', phraseId: offer.phraseId, ...(offer.key ? { key: offer.key } : {}), seconds: 3 }, 'memory-offer');
    } else if (offer) {
      const p = PHRASE_BY_ID.get(offer.phraseId);
      if (!p) return;
      // The door's line is written beneath the room's drawn door, which its memory opens from.
      const under = offer.id === 'door' ? DRAWING_BY_ID.get(DRAWING_IDS.ghostDoor) : undefined;
      this.visible.set(p.id, { mode: 'shown', since: this.now, base: true });
      this.memory.surfaced.set(p.id, this.now);
      this.pacing.holdFor(this.now, 2.4);
      this.offerHoldTo = this.now + 2.4;
      this.queue(0, {
        type: 'write', key: WriteKeys.memory(p.id), text: p.text, hand: p.hand === 'typed' ? 'pencil' : p.hand, size: 's',
        surface: under ? under.surface : this.facing, purpose: 'recall', ttl: 0, source: p.id,
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
  private earned(): string[] {
    return cameBack(this.visitor, this.now - 120) ? [MEMORY_IDS.almost] : [];
  }

  // ─────────────────────────── the visit's heart ───────────────────────────
  // (docs/reviews/2026-11-emotional-arc.md)

  /** A wall a memory's line found no room on just now (not tried again there for a minute). */
  private sceneNoRoom: { surface: Surface; at: number } | null = null;
  /**
   * The App reports a living memory has gone (or could not begin). `seen`: watched past its first
   * moments. Returns whether it counts as seen (persisted for revisits).
   */
  /** Lines that have migrated to a wall that isn't theirs: phrase id → wall. */
  get strays(): ReadonlyMap<string, Surface> {
    return this.roomLife.strays;
  }

  /** Drawings drawn during this visit (each at most once). */
  get drawn(): ReadonlySet<string> {
    return this.writing.drawn;
  }

  /** A drawing found no room on its wall: it may be tried again later, once. */
  drawFailed(id: string): void {
    this.writing.drawFailed(id);
  }

  /** The answer the heart wrote beside "I wanted you to stay." (a phrase id), once. */
  get heartAnswer(): string | null {
    return this.heart.answer;
  }
  answerKept(): string | null {
    return this.heart.answerKept();
  }
  answerRead(): string | null {
    return this.heart.answerRead();
  }
  heartLeft(watched?: string): string | null {
    return this.heart.heartLeft(watched);
  }
  heartShape(): HeartShape | null {
    return this.heart.heartShape();
  }

  /** The App could not begin it (its art or sound failed to load): not spent. */
  memoryFailed(id: string): void {
    this.scenes.cancel(id, this.now);
  }

  /** A preview has ended (never counted, nothing left behind): the room goes on. */
  memoryPreviewEnded(id: string): void {
    this.scenes.previewEnded(id);
    // Its quiet afterwards is part of it, previewed or not (nothing is counted).
    if (VIGNETTE_BY_ID.has(id)) this.shared.vignetteQuietUntil = this.now + 20;
  }

  /** A memory the Director didn't begin is playing (the artist's panel): the room waits with it. */
  memoryExternal(id: string, voiced = false): void {
    this.scenes.external(id, this.now, voiced);
  }

  memoryEnded(id: string, seen: boolean, ranToEnd: boolean): boolean {
    const counted = this.scenes.ended(id, this.now, seen, ranToEnd);
    this.scenesQuietAt = this.now + 6;
    // After a vignette the room doesn't answer at once with another voice: its quiet is part of it.
    if (VIGNETTE_BY_ID.has(id)) {
      this.memoryQuietUntil = Math.max(this.memoryQuietUntil, this.now + 20);
      this.shared.vignetteQuietUntil = this.now + 20;
      this.vignetteEnded = { id, at: this.now, dimmed: VIGNETTE_BY_ID.get(id)!.variants.first.events.some((e) => 'fx' in e && e.fx.kind === 'dim') };
    }
    this.heart.memoryEnded(id, counted, seen, ranToEnd);
    if (counted) {
      // Its aftermath (shorter if it was let go early).
      this.aftermathUntil = Math.max(this.aftermathUntil, this.now + (ranToEnd ? 25 : 12));
      this.releaseStep = 0;
      // Staying with a memory is attention, as returning to a line is.
      this.engagement.raise('memory', this.now, id);
      // A moment to come back to the room before anything else.
      this.pacing.holdFor(this.now, 6);
    }
    return counted;
  }

  /** When the visit's turn may sound, `want` seconds from now at the earliest, and whether with its dark. */
  private turnClear(want: number): { delay: number; dark: boolean } {
    const v = this.vignetteEnded;
    const since = v ? this.now - v.at : Infinity;
    const delay = Math.max(want, (v?.dimmed ? 45 : 25) - since);
    return { delay, dark: !(v?.dimmed && since + delay < 90) };
  }

  private onPhase(p: Phase) {
    this.shared.lastTurnAt = this.now;
    if (p === 'contradiction' || p === 'transform') this.shared.markedTurnAt = this.now;
    if (p === 'contradiction') {
      // The contradiction phase brings the fear of being left onto the wall; what it means is left to later meetings.
      if (!this.visible.has('afraid-leave')) this.reveal('afraid-leave', 0, 'phase-contradiction', 'emerge', 6);
    }
    if (p === 'transform') {
      // Already inside the long held silence: that silence, and its dark, are the turn. It keeps
      // clear of a vignette just ended (25 s; 45 after one that dimmed the room), so the turn isn't
      // heard as that memory's tail; after a dimming one within 90 s it comes without its dark
      // (that memory was the dark).
      const { delay: d0, dark } = this.turnClear(2);
      // (Just after the held silence, not a second one in its exhale: 15 s clear of it.)
      const delay = this.now + d0 > this.shared.heldSilenceUntil ? Math.max(d0, this.shared.heldSilenceUntil + 15 - this.now) : d0;
      if (this.now + d0 > this.shared.heldSilenceUntil)
        this.queue(delay, { type: 'silence', depth: 0.7, seconds: 14, ...(dark ? { dim: 0.15, dimSeconds: 11 } : {}) }, 'phase-transform', { major: true, ttl: 30 });
      const late = this.selector.select(this.ctx(), { tiers: ['transform'], exclude: this.hiddenExcluding() });
      if (late) this.reveal(late.id, 10, 'phase-transform', 'emerge', 14);
    }
  }

  // ───────────────────────────── environment ─────────────────────────────

  computeEnv(): Environment {
    return computeEnvironment({
      field: this.field.v,
      strength: this.memory.strength,
      phase: this.phase,
      kneeling: this.visitor.kneeling,
      deepStillFor: this.visitor.deepStillFor,
      departing: this.departing,
      previousRoomScale: this.env?.roomScale,
    });
  }

  // ───────────────────────────── contributions ─────────────────────────────

  /** A visitor's words become material in the room (the text is passed to the world once and not retained). */
  contribute(text: string, it: Interpretation): void {
    this.contributions.add(text, it);
  }

  writeFailed(key: string): void {
    const k = parseWriteKey(key);
    if (!k) return;
    switch (k.kind) {
      case 'memory':
        if (k.id === Director.MEMORY.phraseId) {
          // The memory's line found no room where the visitor was looking: offer it again later.
          this.memoryNoRoom = { surface: this.facing, at: this.now };
          this.visible.delete(k.id);
          this.memory.surfaced.delete(k.id);
          this.memoryOffered = false;
          this.memoryQuietUntil = -Infinity;
        } else {
          // A memory's line written alone found no room on the wall faced: offered again, on another wall.
          this.scenes.offerFailed(k.id);
          this.visible.delete(k.id);
          this.memory.surfaced.delete(k.id);
          this.sceneNoRoom = { surface: this.facing, at: this.now };
        }
        break;
      case 'heart':
        this.heart.writeFailed(k.id);
        break;
      case 'stray':
        this.roomLife.strayFailed(k.id);
        break;
      case 'enc':
        // A beat whose writing found no room is played again at the next meeting.
        this.encounters.rewind(k.id, k.n);
        break;
    }
  }

  /**
   * The visitor asked to be forgotten: the counts the room keeps for this visit (memories heard,
   * how it was left) go too, so nothing is written back afterwards.
   */
  forgetVisits(): void {
    this.scenes.forgetCounts();
    this.heart.forget();
    this.visits = 1;
  }

  /** Clears contributions from memory (privacy: "forget what I wrote"). */
  forgetContributions(): void {
    this.contributions.forget();
  }

  // ───────────────────────────── leaving ─────────────────────────────

  static readonly EXIT: string = WAY_OUT;
  get lettingGo(): boolean {
    return this.wayOut.lettingGo;
  }

  /** The visitor paused the room (settings): a leaving under way is not taken. */
  stayed(): void {
    this.wayOut.stayed();
  }

  /** Whether this visit stayed close to the chair: the one word kept for the next visit. */
  leaving(): 'close' | null {
    return stayedClose(this.visitor);
  }

  /** How the visit went with the chair, in one word (see DEPARTURE_BY_VISIT). */
  visitShape(how: 'door' | 'menu' = 'menu'): keyof typeof DEPARTURE_BY_VISIT {
    return visitShape(this.visitor, how);
  }

  departureLine(how: 'door' | 'menu' = 'menu'): string {
    // The visit's sentence: the room's first line as the visit left it, and what its heart answered.
    const answer = this.heart.answerRead();
    if (answer && this.heart.hearts()) {
      const stay = this.ledger.unfinished.has('stay') ? 'I wanted you to' : PHRASE_BY_ID.get('stay')!.text;
      return `${stay}\n${PHRASE_BY_ID.get(answer)!.text}`;
    }
    const shape = this.visitShape(this.wayOut.left ? 'door' : how);
    // (Someone who stood still and never came to it: the stillness is what happened.)
    if (shape === 'apart' && this.memory.dominant() === 'stillness') return DEPARTURE_STILL;
    return DEPARTURE_BY_VISIT[shape];
  }

  depart(): void {
    this.departing = true;
    this.scheduler.cancelWhere(() => true);
    this.scenes.dropEchoes();
  }

  /** Returning within the same session: the room has kept everything. */
  returnAfterDeparture(): void {
    this.departing = false;
    this.visits++;
    this.wayOut.returned();
    const p = this.selector.select(this.ctx(), {
      exclude: this.hiddenExcluding(),
      tiers: ['familiar', 'contradiction', 'transform', 'arrival'],
      bias: (x) => (x.id === PHRASE_IDS.gladCame || x.id === PHRASE_IDS.rememberMe ? 0.6 : 0),
    });
    if (p) this.reveal(p.id, 6, 'return', 'emerge', 10);
    // (No random nudge: the chair keeps the pose the trace gave it.)
  }

  snapshot() {
    return {
      phase: this.phase,
      depth: +this.engagement.depth.toFixed(1),
      rhythm: this.pacing.rhythm(this.now, this.phase, this.engagement.activity(this.now)),
      visitor: this.visitor.snapshot(),
      field: this.field.snapshot(),
      memory: this.memory.snapshot(),
      visible: this.visible.size,
      situations: this.situations.snapshot(),
      strays: [...this.roomLife.strays.entries()].map(([id, w]) => `${id}→${w}`),
      encounters: [...this.visitor.encounters.entries()].filter(([, e]) => e.count > 1).map(([id, e]) => `${id}×${e.count}`).slice(-8),
      pending: this.scheduler.snapshot(this.now).slice(0, 8).map((e) => `${e.in}s ${e.payload.rule}:${e.payload.cue.type}`),
      recent: this.log.slice(-8).map((c) => {
        const cu = c.cue as { phraseId?: string; caption?: string; text?: string };
        return `${c.t}s ${c.rule}:${c.cue.type} ${cu.phraseId ?? cu.caption ?? cu.text ?? ''}`.trim();
      }),
    };
  }
}
