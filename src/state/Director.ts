
import { MemoryDirector } from './MemoryDirector';
import { VIGNETTE_BY_ID } from '../content/vignettes';
import { SCENE_MEMORIES } from '../content/memories';
import { computeEnvironment } from './director/environment';
import { Contributions } from './director/contributions';
import { Echoes } from './director/echoes';
import { WayOut, WAY_OUT } from './director/wayOut';
import { stayedClose, visitShape } from './director/visitShape';
import { Encounters } from './director/encounters';
import { Responses } from './director/responses';
import { Approach } from './director/approach';
import { Heart, NORTH_LINES } from './director/heart';
import { WallLedger } from './director/ledger';
import { RoomLife } from './director/roomLife';
import { Silence } from './director/silence';
import { KITCHEN_LIGHT, MemoryRules } from './director/memoryRules';
import { Admission } from './director/admission';
import { Voicing } from './director/voicing';
import { Writing } from './director/writing';
import { Stillness } from './director/stillness';
import { Withdraw } from './director/withdraw';
import { newSharedMarks, type QueueOptions, type RuleHost } from './director/host';
import { Rng } from '../core/rng';
import { EventScheduler } from '../core/scheduler';
import { PHRASES, PHRASE_BY_ID } from '../content/phrases';
import { AIR_LINES, DEPARTURE_BY_VISIT, DEPARTURE_STILL, WELCOME_BACK, type VoiceFragment } from '../content/relations';
import { WALLS, oppositeWall, type Phase, type Wall, type Phrase, type Surface } from '../content/types';
import { VisitorModel, type VisitorInput } from './VisitorModel';
import { Memory } from './Memory';
import { EmotionalField } from './EmotionalField';
import { PhaseTracker } from './Phase';
import { RULE, isEncounter, ruleSource, phaseRule, type RuleName } from './rules';
import { parseWriteKey } from './writeKeys';
import { PHRASE_IDS } from '../content/ids';
import { Engagement } from './Engagement';
import { Pacing, DEEP_SILENCE } from './Pacing';
import { PhraseSelector, type SelectContext } from './PhraseSelector';
import type { Cue, TimedCue, VoicePosition } from './cues';
import type { VoiceKind } from '../content/types';
import type { Interpretation } from '../interpret/schema';
import { SituationRunner, type VisibleState, type PhraseGeometry, type SituationHost } from './situations/Situation';
import { pickRepertoire } from './situations/library';
import { ROOM, KNEEL_REACH } from '../core/room';
import type { Environment } from '../core/environment';

interface DirectorOptions {
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



/**
 * The chair on return (docs/reviews/2026-10-emotional-depth.md): after a visit that stayed close,
 * it is turned away from where the visitor comes in. Null: leave it.
 */
export function returnYaw(leaving: 'close' | null, base: number): number | null {
  return leaving === 'close' ? base + CLOSE_TURN : null;
}
/** How far it is turned (radians), seen in the returning opening's chair-only frame. */
export const CLOSE_TURN = 1.9;

/** The seconds between the room's own events, ordinarily. */
const ROOM_GAP: readonly [number, number] = [4, 7];
/** Coming out of an aftermath the room's own events return slowly: the gaps (s) of its first three, within this many seconds of its end. */
const AFTERMATH_RELEASE: readonly (readonly [number, number])[] = [[12, 16], [8, 11], [6, 8]];
const AFTERMATH_WINDOW = 45;

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
  readonly scheduler = new EventScheduler<{ cue: Cue; rule: RuleName }>(7, () => this.roomGap());
  private gapRng = new Rng(1);
  private releaseStep = 0;
  /**
   * The gap before the room's next own event. After a memory's aftermath the room comes back
   * slowly and then less slowly (12–16 s, 8–11, 6–8), never on a pulse; otherwise 4–7 s.
   */
  private roomGap(): number {
    const since = this.now - this.aftermathUntil;
    if (since >= 0 && since < AFTERMATH_WINDOW && this.releaseStep < AFTERMATH_RELEASE.length) {
      const [a, b] = AFTERMATH_RELEASE[this.releaseStep++];
      return this.gapRng.range(a, b);
    }
    return this.gapRng.range(ROOM_GAP[0], ROOM_GAP[1]);
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
  /** The wall behind the visitor, or undefined when they face the floor or ceiling. */
  behindWall(): Wall | undefined {
    const w = this.facingWall();
    return w ? oppositeWall(w) : undefined;
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
  readonly heart: Heart;
  private readonly writing: Writing;
  private readonly voicing: Voicing;
  private readonly memoryRules: MemoryRules;
  private readonly admission = new Admission(this, {
    northKept: () => this.heart.northKept(),
    onNorth: (cue) => this.heart.onNorth(cue),
    isWayOut: (id) => this.wayOut.isOpenLine(id),
    aftermathUntil: () => this.aftermathUntil,
    gap: (min, max) => this.gapRng.range(min, max),
    turnClear: (want) => this.memoryRules.turnClear(want),
    writeFailed: (key) => this.writeFailed(key),
    kitchenLightLost: () => this.memoryRules.kitchenLightLost(),
    silenceLost: () => this.silence.lost(),
    rewindEncounter: (id, n) => this.encounters.rewind(id, n),
    forgetReading: (id) => this.voicing.forget(id),
  });
  readonly roomLife = new RoomLife(this, { northKept: () => this.heart.northKept() });
  private readonly silence = new Silence(this, { wayOutRecent: () => this.wayOut.engaged() || this.wayOut.keptWithin(20) });
  private readonly host: SituationHost;
  readonly owned: Set<string>;
  private geometry: (id: string) => PhraseGeometry | undefined;
  private inView: (phraseId: string) => boolean;
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

  /** The living memories: when one may open (src/state/MemoryDirector.ts). */
  readonly scenes: MemoryDirector;
  /** When the pending turn first could have come (it waits for a return at most 30 s). */
  private pendingPhaseAt = -Infinity;
  private taps = 0;
  private tappedAt = new Map<string, number>();
  private lastTapAt = -Infinity;
  /** Per-cooldown jitter, re-rolled each time it is used, so periodic rules don't beat in time. */
  private jitter = new Map<string, number>();
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
    this.memoryRules = new MemoryRules(this, {
      northHeld: () => this.heart.northHeld(),
      heartEnded: (id, counted, seen, ranToEnd) => this.heart.memoryEnded(id, counted, seen, ranToEnd),
      startAftermath: (seconds) => {
        this.aftermathUntil = Math.max(this.aftermathUntil, this.now + seconds);
        this.releaseStep = 0;
      },
    });
    this.voicing = new Voicing(this, { northKept: () => this.heart.northKept(), refusesStayWords: () => this.wayOut.refusesStayWords() });
    this.writing = new Writing(this, { memoryPlayed: () => this.memoryRules.memoryPlayed, isWayOut: (id) => this.wayOut.isOpenLine(id) });
    for (const p of PHRASES) if (p.tier === 'near' && p.surface === 'floor') this.visible.set(p.id, { mode: 'shown', since: 0, base: true });
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
  /** The one memory a visit that intrudes as light: "the light in the kitchen at four in the afternoon". */
  static readonly MEMORY = KITCHEN_LIGHT;
  /** Writing the room starts with, ordinary things first. */
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
    return this.encounters.waiting || this.memoryRules.memoryAwaited() || !!this.scenes.active || this.scheduler.pending().some((e) => isEncounter(e.payload.rule) && e.payload.cue.type === 'voice');
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

  queue(delay: number, cue: Cue, rule: RuleName, opts: QueueOptions = {}) {
    // The room's own events never come together (a burst reads as a machine): spaced by the scheduler.
    const source = ruleSource(rule);
    this.scheduler.schedule(this.now + delay, { cue, rule }, { ...opts, room: source === 'room', group: rule, marks: source === 'turn' });
  }

  reveal(id: string, delay: number, rule: RuleName, mode: 'emerge' | 'still' = 'emerge', seconds = 9) {
    const p = PHRASE_BY_ID.get(id);
    if (!p || p.tier === 'annotation') return;
    this.queue(delay, { type: 'reveal', phraseId: id, mode, seconds }, rule, { key: `reveal:${id}` });
  }

  /**
   * Whether the room declines to say this now. A refused voice queues nothing, so nothing may be
   * counted for it: callers that commit state around a voice ask first, or use what `voice` returns.
   */
  voiceRefused(rule: RuleName, phraseId?: string, finish = false): boolean {
    return this.voicing.voiceRefused(rule, phraseId, finish);
  }

  /** Queues the voice; false when the room declined to speak (nothing was queued or counted). */
  voice(rule: RuleName, delay: number, kind: VoiceKind, text: string | null, caption: string, position: VoicePosition, extra: { gain?: number; assetId?: string; phraseId?: string; ttl?: number; priority?: number; finish?: boolean } = {}): boolean {
    return this.voicing.voice(rule, delay, kind, text, caption, position, extra);
  }

  /** Says a phrase; only a voice that was queued is counted as spoken. */
  speakPhrase(rule: RuleName, p: Phrase, position: VoicePosition, delay = 0, styleOverride?: Phrase['voice'], gain = 0.8): boolean {
    return this.voicing.speakPhrase(rule, p, position, delay, styleOverride, gain);
  }

  fragment(rule: RuleName, f: VoiceFragment, position: VoicePosition, delay = 0, gain = 0.6): void {
    this.voicing.fragment(rule, f, position, delay, gain);
  }

  /** A voice that was decided on but never sounded: undo what it was counted for. */
  private lost(cue: Cue, rule: RuleName): void {
    this.admission.lost(cue, rule);
  }

  // ───────────────────────────── tick ─────────────────────────────

  tick(dt: number, input: VisitorInput, facing: Surface): TimedCue[] {
    // During the opening the room's own life hasn't begun: no rule runs and no time passes
    // for it (its clock is the visitor model's), so nothing is owed at the hand-off.
    if (this.held) return [];
    // Kneeling is kneeling by the chair (the App's own reach for it): K pressed across the
    // room lowers the eye, but the room doesn't take it for kneeling there.
    if (input.kneeling && Math.hypot(input.x, input.z) > KNEEL_REACH) input = { ...input, kneeling: false };
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
      if (this.shared.pendingPhase && !returnWaits && !this.scenes.active && this.now >= this.memoryRules.quietAt && !this.aftermath() && !this.memoryRules.memoryAwaited() && !this.wayOut.engaged()) {
        this.onPhase(this.shared.pendingPhase);
        this.shared.pendingPhase = null;
      }
      if (phaseChanged === 'transform') this.shared.transformAt = this.now;
      // (The heart is decided before the kitchen light may be offered: it waits for the heart.)
      this.heart.decide();
      this.memoryRules.kitchenLight();
      this.memoryRules.scenes();
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
      if (!this.admission.admit(cue, rule, this.scheduler.optsOf(item))) {
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

  // ───────────────────────────── rules ─────────────────────────────

  /** Phrases kept for particular moments; they never just drift onto the walls. */
  static readonly RESERVED = new Set<string>([PHRASE_IDS.thankStaying, PHRASE_IDS.movingChair, PHRASE_IDS.gladCame, PHRASE_IDS.dontHaveSay]);

  /** Kept for its moment: the reserved lines, and the memory's line until the memory offers it. */
  reserved(id: string): boolean {
    // (The door's line belongs beneath the drawn door, the woodland's to its own offer: never
    // drifted onto a wall before that.)
    return Director.RESERVED.has(id) || (id === KITCHEN_LIGHT.phraseId && !this.memoryRules.offered) || this.heldForOffer(id);
  }

  hiddenExcluding(): Set<string> {
    const out = new Set([...this.visible.keys(), ...Director.RESERVED, ...this.withheld()]);
    // (Nothing new on the north wall after the heart's answer: the room chooses from the others.)
    if (this.heart.northKept()) for (const id of NORTH_LINES) out.add(id);
    if (!this.memoryRules.offered) out.add(KITCHEN_LIGHT.phraseId);
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
    this.memoryRules.tapped(t.phraseId);
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

  // ─────────────────────────── the visit's heart ───────────────────────────
  // (docs/reviews/2026-11-emotional-arc.md)

  /** A drawing found no room on its wall: it may be tried again later, once. */
  drawFailed(id: string): void {
    this.writing.drawFailed(id);
  }

  get memoryPlayed(): boolean {
    return this.memoryRules.memoryPlayed;
  }

  /** The App could not begin it (its art or sound failed to load): not spent. */
  memoryFailed(id: string): void {
    this.memoryRules.memoryFailed(id);
  }

  /** A preview has ended (never counted, nothing left behind): the room goes on. */
  memoryPreviewEnded(id: string): void {
    this.memoryRules.memoryPreviewEnded(id);
  }

  /** A memory the Director didn't begin is playing (the artist's panel): the room waits with it. */
  memoryExternal(id: string, voiced = false): void {
    this.memoryRules.memoryExternal(id, voiced);
  }

  /**
   * The App reports a living memory has gone. `seen`: watched past its first moments. Returns
   * whether it counts as seen (persisted for revisits).
   */
  memoryEnded(id: string, seen: boolean, ranToEnd: boolean): boolean {
    return this.memoryRules.memoryEnded(id, seen, ranToEnd);
  }

  heartLeft(watched?: string): string | null {
    return this.heart.heartLeft(watched);
  }

  private onPhase(p: Phase) {
    this.shared.lastTurnAt = this.now;
    if (p === 'contradiction' || p === 'transform') this.shared.markedTurnAt = this.now;
    if (p === 'contradiction') {
      // The contradiction phase brings the fear of being left onto the wall; what it means is left to later meetings.
      if (!this.visible.has(PHRASE_IDS.afraidLeave)) this.reveal(PHRASE_IDS.afraidLeave, 0, phaseRule('contradiction'), 'emerge', 6);
    }
    if (p === 'transform') {
      // Already inside the long held silence: that silence, and its dark, are the turn. It keeps
      // clear of a vignette just ended (25 s; 45 after one that dimmed the room), so the turn isn't
      // heard as that memory's tail; after a dimming one within 90 s it comes without its dark
      // (that memory was the dark).
      const { delay: d0, dark } = this.memoryRules.turnClear(2);
      // (Just after the held silence, not a second one in its exhale: 15 s clear of it.)
      const delay = this.now + d0 > this.shared.heldSilenceUntil ? Math.max(d0, this.shared.heldSilenceUntil + 15 - this.now) : d0;
      if (this.now + d0 > this.shared.heldSilenceUntil)
        this.queue(delay, { type: 'silence', depth: DEEP_SILENCE, seconds: 14, ...(dark ? { dim: 0.15, dimSeconds: 11 } : {}) }, phaseRule('transform'), { major: true, ttl: 30 });
      const late = this.selector.select(this.ctx(), { tiers: ['transform'], exclude: this.hiddenExcluding() });
      if (late) this.reveal(late.id, 10, phaseRule('transform'), 'emerge', 14);
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
        this.memoryRules.offerFailed(k.id);
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
  private visitShape(how: 'door' | 'menu' = 'menu'): keyof typeof DEPARTURE_BY_VISIT {
    return visitShape(this.visitor, how);
  }

  departureLine(how: 'door' | 'menu' = 'menu'): string {
    // The visit's sentence: the room's first line as the visit left it, and what its heart answered.
    const answer = this.heart.answerRead();
    if (answer && this.heart.hearts()) {
      const stay = this.ledger.unfinished.has(PHRASE_IDS.stay) ? 'I wanted you to' : PHRASE_BY_ID.get(PHRASE_IDS.stay)!.text;
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
      bias: (x) => (WELCOME_BACK.has(x.id) ? 0.6 : 0),
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
