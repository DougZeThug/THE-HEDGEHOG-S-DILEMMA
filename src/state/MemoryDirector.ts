import { ALL_MEMORIES, HEART_BY_SHAPE, HEART_EARLIEST, MEMORY_BY_PHRASE, linesOf, type SceneMemory } from '../content/memories';
import { VIGNETTE_BY_ID, chooseVariant, spokenLines, type Echo, type VariantContext } from '../content/vignettes';
import { chooseVoices, voicesId } from '../content/memory-voices';

/**
 * When a living memory may open (docs/memories.md; decisions in
 * docs/reviews/2026-10-living-memories.md). Pure and owned by the Director, which feeds it the
 * room's state each tick and turns a decision into a `memory-scene` cue.
 *
 * - **Armed** by reading the line (a long enough look) or touching it, at any time: a phone
 *   visitor's tap is never lost because it came early.
 * - **Begins** when the visitor comes back to the line: a look of a second after their eyes have
 *   been elsewhere for 2 s or more (approach, withdraw, approach), or a touch, once it is eligible: past its earliest time, the room
 *   free (no voice just heard, no held breath), nothing else playing, not cooling down, and not
 *   in a visit where the kitchen-light memory has played (the two are one kitchen).
 * - **One at a time**, each scene **once a visit**, and a cooldown after each (longer if it ran to
 *   its end). A memory that ended before anyone saw it (withdrawn in its first moments) is not
 *   spent: it can be offered again once, a little later.
 * - **Revisits** (a returning visitor) get the memory's next variant.
 *
 * Vignettes (src/content/vignettes.ts) are memories too, heard rather than painted, and follow the
 * same rules, with these differences:
 * - they keep at least 90 s from any other memory's end (150 s after one of the same tone), so a
 *   visit is never a run of them;
 * - one may open from stillness by the chair (or kneeling there) instead of a line;
 * - which version plays is chosen from what the visitor has done (`chooseVariant`), not only from
 *   how often they have seen it;
 * - one is only begun if its voices have been recorded and approved (`setAvailable`), unless the
 *   version chosen has no voices;
 * - what comes back later (an echo) is kept until it is due, and only if it was heard.
 */
export interface SceneState {
  now: number;
  visible: (phraseId: string) => boolean;
  gazeId: string | null;
  gazeFor: number;
  /** The room can take a major event now (no voice just heard, nothing held). */
  free: boolean;
  /** Another memory (kitchen-light) is waiting, playing or has played this visit. */
  otherMemory: boolean;
  departing: boolean;
  /** The kitchen-light memory has played this visit (it counts in the arc). */
  kitchenPlayed?: boolean;
  /** The wall the visitor faces. */
  facing?: string;
  /** The phase (vignettes may keep to some). */
  phase?: string;
  /** How far from the chair, and how long they have been still (the chair's vignette). */
  chairDistance?: number;
  stillFor?: number;
  kneeling?: boolean;
  /** What the visitor has done, for choosing a vignette's version. */
  variantCtx?: () => Omit<VariantContext, 'seen'>;
  /** Is this line finished (not left unfinished on the wall)? */
  finished?: (phraseId: string) => boolean;
}

export interface SceneStart {
  id: string;
  phraseId: string;
  variant: string;
  minHold: number;
  maxHold: number;
  kind?: 'vignette';
  /** A painted memory's overheard voices: which version (memory-voices.ts), if it has any. */
  voices?: string;
}

/** Something a vignette left to come back later in the visit. */
export interface PendingEcho {
  vignette: string;
  echo: Echo;
  at: number;
  until: number;
}

/** Seconds a vignette keeps from the end of any other memory (more after one of its tone). */
export const VIGNETTE_APART = 90;
export const SAME_TONE_APART = 150;
/**
 * Never three in five minutes: at most this many vignettes begun in any `VIGNETTE_WINDOW` seconds.
 * (With more than one way into some, a settled visitor met three late in a visit; three close
 * together is the pushing the room never does: interaction review, 2026-10-27.)
 */
export const VIGNETTE_WINDOW = 300;
export const VIGNETTES_IN_WINDOW = 2;

interface Track {
  armed: boolean;
  /** Seconds the gaze has been off the line since it was armed, and whether it has really left. */
  away: number;
  left: boolean;
  /** Its line has been offered (written where the visitor faces) this visit. */
  offered: boolean;
  /** A touch asked for it; honoured until then, once the room is free. */
  requestedUntil: number;
  played: boolean;
  unseen: number;
  notBefore: number;
  /** Until then a shorter look begins it (its line was just offered, or written again for it). */
  easyUntil: number;
  /** A vignette whose line was read when it couldn't play: owed, it is pointed at once it can. */
  owed: boolean;
  /** Its line has been written again for it (once a visit). */
  reinked: boolean;
  /** Which of its lines was last read or touched (it is placed beside that one). */
  line?: string;
}

/** A look this long begins a vignette whose line the room has just pointed at (or that is owed). */
export const EASY_LOOK = 1.5;
/** The room points at a line (an offer, or a line written again) at most this often… */
export const POINT_APART = 120;
/** …this many times a visit (the painted memories' offers included)… */
export const POINTS_PER_VISIT = 3;
/** …and never this soon after a vignette has ended. */
export const POINT_AFTER_VIGNETTE = 60;
/** The memories that can be a visit's heart. */
const HEARTS: ReadonlySet<string> = new Set(Object.values(HEART_BY_SHAPE));
/** A heart pointed at and let be this long no longer keeps the others back. */
export const HEART_LAPSE = 120;
/** A heart pointed at and not taken up is written again once, no sooner than this. */
export const HEART_REINK = 30;
/** The heart keeps this far from the last pointing, the last memory and the last vignette. */
export const HEART_POINT_APART = 45;

/** What the room points at: a line written alone where the visitor looks, or (`reink`) one already there, written again. */
export type OfferPick = SceneMemory & { reink?: boolean };

export class MemoryDirector {
  private tracks = new Map<string, Track>();
  /** `voiced`: a painted memory begun with overheard voices of its own. */
  active: { id: string; since: number; voiced?: boolean } | null = null;
  private cooldownUntil = -Infinity;
  private last: number | null = null;
  /** When the last memory (any) ended; kitchen-light's too, reported by the Director. */
  lastEnded = -Infinity;
  /** When each vignette of this visit began. */
  private vignetteStarts: number[] = [];
  /** The tone of the last vignette heard this visit. */
  private lastTone: string | null = null;
  /** Vignettes whose voices are recorded and approved (null: all, as in tests and previews). */
  private available: Set<string> | null = null;
  private pending: PendingEcho[] = [];
  /** Lines written alone for a memory this visit (the kitchen-light memory's counts too). */
  private offersMade = 0;
  private lastOfferAt = -Infinity;
  /** Every time the room pointed at a line this visit (offers and lines written again). */
  private points = 0;
  private lastPointAt = -Infinity;
  private lastVignetteEnded = -Infinity;
  /**
   * This visit's heart (content/memories.ts HEART_BY_SHAPE): the painted memory that rhymes with
   * how the visitor has been with the chair. Offered first and sooner, it needs no memory before it,
   * and once it has played no other painted memory comes this visit.
   */
  heart: string | null = null;
  private heartOfferedAt: number | null = null;

  private counts: Record<string, number>;
  /** `counts`: how many times each memory has been seen on earlier visits (persisted). */
  constructor(counts: Record<string, number> = {}) {
    // (Its own copy: the caller's record is never changed under it.)
    this.counts = { ...counts };
    for (const m of ALL_MEMORIES) this.tracks.set(m.id, { armed: false, away: 0, left: false, offered: false, requestedUntil: -Infinity, played: false, unseen: 0, notBefore: m.earliest, easyUntil: -Infinity, owed: false, reinked: false });
  }

  /**
   * This visit's heart is chosen: it may come from `notBefore` (at the earliest `HEART_EARLIEST`),
   * whatever came before. Until its line is pointed at, another may take its place.
   */
  setHeart(id: string, notBefore = HEART_EARLIEST): void {
    const t = this.tracks.get(id);
    if (!t || t.played || id === this.heart) return;
    if (this.heart) {
      const was = this.tracks.get(this.heart)!;
      if (was.offered || was.played) return;
      was.notBefore = Math.max(was.notBefore, ALL_MEMORIES.find((m) => m.id === this.heart)!.earliest);
    }
    this.heart = id;
    t.notBefore = Math.max(HEART_EARLIEST, notBefore);
  }

  /** The heart is chosen, may come now, and its line hasn't been pointed at yet. */
  heartDue(now: number): boolean {
    if (!this.heart) return false;
    const t = this.tracks.get(this.heart)!;
    return !t.offered && !t.played && now >= Math.max(HEART_EARLIEST, t.notBefore);
  }

  /**
   * A line written alone for a memory found no room on the wall the visitor faced: not offered after
   * all (the room tries again, elsewhere). Its pointing is given back.
   */
  offerFailed(phraseId: string): void {
    const m = MEMORY_BY_PHRASE.get(phraseId);
    const t = m && this.tracks.get(m.id);
    if (!m || !t || t.played || !t.offered) return;
    t.offered = false;
    if (!t.reinked && !m.offer?.wall) {
      this.points = Math.max(0, this.points - 1);
      if (m.id !== this.heart) this.offersMade = Math.max(0, this.offersMade - 1);
    }
    if (m.id === this.heart) this.heartOfferedAt = null;
  }

  /** The heart was pointed at long ago and let be: it no longer keeps anything back. */
  heartLapsed(now: number): boolean {
    return this.heartOfferedAt !== null && !this.heartPlayed && now - this.heartOfferedAt > HEART_LAPSE;
  }

  /** Has this visit's heart been begun (or is it playing)? */
  get heartPlayed(): boolean {
    return !!this.heart && this.tracks.get(this.heart)!.played;
  }

  /** The earliest it may come this visit (sooner for the heart). */
  private earliestOf(m: SceneMemory): number {
    return m.id === this.heart ? Math.min(m.earliest, HEART_EARLIEST) : m.earliest;
  }

  /** Forgotten (the visitor asked): what was heard on earlier visits, and this one, no longer counts. */
  forgetCounts(): void {
    for (const k of Object.keys(this.counts)) delete this.counts[k];
  }

  /** Heard or watched, on this visit or before. */
  heard(id: string): boolean {
    return (this.counts[id] ?? 0) > 0;
  }

  /** A vignette begun that never played (its cue lost, or withdrawn unseen to come again) holds no place in the window. */
  private unspend(id: string, since: number): void {
    if (!VIGNETTE_BY_ID.has(id)) return;
    const i = this.vignetteStarts.lastIndexOf(since);
    if (i >= 0) this.vignetteStarts.splice(i, 1);
  }

  /** Its line has been offered this visit (until then the room keeps it back). */
  wasOffered(id: string): boolean {
    return !!this.tracks.get(id)?.offered;
  }

  /**
   * Which vignettes may speak (their recordings approved); the rest wait, or play voiceless. Also
   * which painted memories' voices may (`voicesId`): those are heard only when named here, so with
   * nothing set a painted memory is wordless, to the Director as to the App.
   */
  setAvailable(ids: Set<string> | null): void {
    this.available = ids;
  }

  /** A touch on writing: arms its memory, and asks for it now if it is eligible. */
  tapped(phraseId: string): void {
    const m = MEMORY_BY_PHRASE.get(phraseId);
    if (!m) return;
    const t = this.tracks.get(m.id)!;
    if (t.played) return;
    t.line = phraseId;
    t.armed = true;
    // A touch is intent: coming back to the line later begins it without looking away first.
    t.left = true;
    // Asked for: kept for a while if the room can't take it at once (it is often holding still
    // just then, for the line being written).
    t.requestedUntil = this.last === null ? Infinity : this.last + 10;
  }

  /** The line is one whose look belongs to its memory (not to the room's ordinary answers). */
  claims(phraseId: string | null): boolean {
    if (!phraseId) return false;
    const m = MEMORY_BY_PHRASE.get(phraseId);
    if (!m) return false;
    // A vignette's line answers like any other until its memory could open (a line read early
    // isn't left unanswered for minutes).
    if (m.kind === 'vignette' && (this.last ?? 0) < m.earliest) return false;
    // Nor a vignette that can't play (its voices not kept): its lines answer as any other (QA,
    // 2026-10-27). (A painted memory's id is never in the available set: only its voices' keys
    // are, and it plays wordless without them.)
    if (m.kind === 'vignette' && !this.isAvailable(m.id)) return false;
    // Nor a painted memory once another has ended the arc: none comes now, so its line is the room's.
    if (this.arcEnded(m)) return false;
    return !this.tracks.get(m.id)!.played;
  }

  /** Has any scene played (or is one playing) this visit? */
  get anyPlayed(): boolean {
    return !!this.active || [...this.tracks.values()].some((t) => t.played);
  }

  /** Has a painted memory played (or is one playing)? (Vignettes don't change the visit's arc.) */
  get paintedPlayed(): boolean {
    return (!!this.active && this.painted(this.active.id)) || [...this.tracks.entries()].some(([id, t]) => t.played && this.painted(id));
  }

  private painted(id: string): boolean {
    return ALL_MEMORIES.find((m) => m.id === id)?.kind !== 'vignette';
  }

  /** A memory of the kitchen has been heard this visit (the kitchen-light memory then waits). */
  get kitchenTaken(): boolean {
    return ALL_MEMORIES.some((m) => m.group === 'kitchen' && this.tracks.get(m.id)!.played);
  }

  /**
   * A wall line a vignette speaks itself (its approved reading is one of the vignette's lines):
   * the room doesn't say it first while that vignette may still come this visit. Lines that only
   * open a vignette are not kept back (that would silence approved readings for whole visits).
   */
  claimsVoice(phraseId: string): boolean {
    for (const def of VIGNETTE_BY_ID.values()) {
      if (!def.lines.some((l) => l.phraseId === phraseId)) continue;
      if (!this.tracks.get(def.id)!.played && this.isAvailable(def.id)) return true;
    }
    return false;
  }

  /** Its voices are recorded and kept (or no list was given). */
  isAvailable(id: string): boolean {
    return !this.available || this.available.has(id);
  }

  /** Is a vignette playing? */
  get vignetteActive(): boolean {
    return !!this.active && VIGNETTE_BY_ID.has(this.active.id);
  }

  /**
   * A later memory whose line should now be offered: written alone where the visitor faces.
   * Once per memory per visit; the Director writes it and holds the room a moment.
   */
  offer(s: {
    now: number;
    phase: string;
    free: boolean;
    visibleFacing: (phraseId: string) => boolean;
    departing: boolean;
    otherMemory: boolean;
    facing?: string;
    /** When the room's long held silence ended (null if it hasn't come). */
    darkEnded?: number | null;
    kitchenPlayed?: boolean;
    /** The kitchen-light memory's line has been offered this visit. */
    kitchenOffered?: boolean;
    /** When (a pointing, for the two minutes between them). */
    kitchenOfferedAt?: number;
    /**
     * Painted memories this visit has earned, best first (docs/reviews/2026-11-core-loop.md): the
     * one whose story rhymes with how the visitor has been with the chair. Ahead of the rest.
     */
    prefer?: readonly string[];
    /**
     * The room is quiet enough for the heart (its own life has been cleared for it): the heart
     * asks a local quiet, not an empty minute (a visitor at the chair keeps the room answering).
     */
    heartFree?: boolean;
  }): OfferPick | null {
    if (s.departing || this.active || s.otherMemory) return null;
    if (s.now < this.cooldownUntil || s.now - this.lastEnded < 0) return null;
    // The heart's line pointed at and not taken up: written again, once, the next time they rest on
    // that wall (half of them were never begun from a single pointing: interaction designer).
    if (this.heart && s.heartFree) {
      const t = this.tracks.get(this.heart)!;
      const m = ALL_MEMORIES.find((x) => x.id === this.heart)!;
      if (t.offered && !t.played && !t.reinked && this.heartOfferedAt !== null && s.now - this.heartOfferedAt >= HEART_REINK && !this.heartLapsed(s.now) && s.visibleFacing(m.phraseId)) {
        t.reinked = true;
        t.easyUntil = s.now + 20;
        // (A pointing like any other: the next keeps its distance from it.)
        this.points++;
        this.lastPointAt = s.now;
        return { ...m, reink: true };
      }
    }
    if (!s.free && !(this.heartDue(s.now) && s.heartFree)) return null;
    // Never pushing: at most one pointing every two minutes, three a visit, none just after a vignette.
    const pointed = this.points + (s.kitchenOffered ? 1 : 0);
    const sincePoint = s.now - Math.max(this.lastPointAt, s.kitchenOfferedAt ?? -Infinity);
    // (The heart keeps a shorter distance from the last pointing, and isn't counted out by the
    // others: it is the one memory the visit is for.)
    // (Only into the local quiet it asks, never merely a free room: looking down at the chair, a
    // line written where they look lands out of view.)
    const heartOk = this.heartDue(s.now) && !!s.heartFree && sincePoint >= HEART_POINT_APART && s.now - this.lastVignetteEnded >= HEART_POINT_APART;
    // While it waits, nothing else takes its place.
    if (this.heartDue(s.now) && !heartOk) return null;
    if (!heartOk && (pointed >= POINTS_PER_VISIT || sincePoint < POINT_APART || s.now - this.lastVignetteEnded < POINT_AFTER_VIGNETTE)) return null;
    const point = <T extends SceneMemory>(m: T, t: Track, reink: boolean): OfferPick => {
      // (A line with its own place, found there later, doesn't point at anything: it doesn't spend
      // one of the visit's three pointings, nor make the next wait. Docs/reviews/2026-11-core-loop.md.)
      if (!m.offer?.wall) {
        this.points++;
        this.lastPointAt = s.now;
      }
      // For a while, a shorter look at it begins it (an offer: 20 s; a line written again for an owed
      // one: 30 s; a line written in its own place, found later: from then on).
      t.easyUntil = m.offer?.wall ? Infinity : s.now + (reink && t.owed ? 30 : 20);
      return reink ? { ...m, reink: true } : m;
    };
    // Painted memories never met first, then owed vignettes (read when they couldn't play), then those never heard on any visit.
    const owed = (m: SceneMemory) => this.tracks.get(m.id)!.owed && m.kind === 'vignette';
    // (The door, once it may come, before other offers: it has a place of its own and is otherwise never found.)
    const rank = (m: SceneMemory) => (m.offer?.wall ? 0.5 : (this.counts[m.id] ?? 0) === 0 && m.kind !== 'vignette' ? 1 : owed(m) ? 1.5 : (this.counts[m.id] ?? 0) === 0 ? 2 : 3);
    const pref = (m: SceneMemory) => {
      const i = s.prefer?.indexOf(m.id) ?? -1;
      return i < 0 ? Infinity : i;
    };
    const order = [...ALL_MEMORIES].sort((a, b) => rank(a) - rank(b) || pref(a) - pref(b));
    if (this.heart) order.unshift(...order.splice(order.findIndex((m) => m.id === this.heart), 1));
    for (const m of order) {
      const t = this.tracks.get(m.id)!;
      const heart = m.id === this.heart;
      // (Only the heart while it is waiting to be pointed at: nothing else takes its slot.)
      if (heartOk && !heart) continue;
      if (!heartOk && !s.free) continue;
      if (t.played || s.now < this.earliestOf(m) || (heart && !this.heartDue(s.now) && !t.offered) || this.arcEnded(m)) continue;
      // An owed vignette whose line is already where they look: written again there, once. The
      // line that was read, if it is there (most owed reads come through a second way in); else its own.
      const owedLine = t.line && t.line !== m.phraseId && s.visibleFacing(t.line) ? t.line : m.phraseId;
      if (owed(m) && !t.reinked && s.visibleFacing(owedLine) && this.isAvailable(m.id) && this.vignetteAllows(m, s) && s.now >= t.notBefore) {
        t.reinked = true;
        return point({ ...m, phraseId: owedLine }, t, true);
      }
      // Owed through another way in, it is pointed at only by that line, written again: never by its
      // own line written alone, which the visitor didn't read (it spent the painted memories' points
      // and seldom began: QA, 2026-10-27).
      if (owed(m) && t.line && t.line !== m.phraseId) continue;
      const free = heart;
      if (!m.offer || t.offered || (!free && !m.offer.phases.includes(s.phase as never))) continue;
      if (s.now - this.lastEnded < (free ? HEART_POINT_APART : m.offer.apart)) continue;
      if (!this.arcAllows(m, s.now, !!s.kitchenPlayed)) continue;
      if (m.kind === 'vignette') {
        // Offered only if it can play, keeps its distance, and the visit hasn't had two offers.
        if (!this.isAvailable(m.id) || !this.vignetteAllows(m, s)) continue;
        // Never close behind another line written alone.
        if (s.now - this.lastOfferAt < m.offer.apart) continue;
      }
      // The pale morning answers the dark: a few seconds after the held silence lifts.
      if (m.offer.afterDark && !heart && !(s.darkEnded != null ? s.now >= s.darkEnded + 8 : s.now >= 200)) continue;
      // Already where they are looking: written again there rather than a second time (not a new line).
      if (!m.offer.wall && s.visibleFacing(m.phraseId)) {
        t.offered = true;
        if (heart) this.heartOfferedAt = s.now;
        t.reinked = true;
        return point(m, t, true);
      }
      // New lines written alone: two a visit at most, of any memory (one with its own place — the
      // door, written beneath the room's drawn door — is outside that: it is found there later).
      if (!m.offer.wall && !heart && this.offersMade + (s.kitchenOffered ? 1 : 0) >= 2) continue;
      t.offered = true;
      if (heart) this.heartOfferedAt = s.now;
      if (!m.offer.wall) this.offersMade++;
      this.lastOfferAt = s.now;
      return point(m, t, false);
    }
    return null;
  }

  /**
   * A vignette could open at the chair soon (the room's own voice there waits): its line finished,
   * nearly its time, not yet heard, recorded. With `distance`: and the visitor is near enough for it.
   */
  claimsChair(now = Infinity, finished: (id: string) => boolean = () => true, distance = 0): boolean {
    return ALL_MEMORIES.some((m) => m.chair && distance <= m.chair.within && !this.tracks.get(m.id)!.played && this.isAvailable(m.id) && !(m.maxSeen !== undefined && (this.counts[m.id] ?? 0) >= m.maxSeen) && now >= m.earliest - 30 && (!m.afterFinished || finished(m.afterFinished)));
  }

  /** A preview played and ended: the room goes on; nothing is counted or left behind. */
  previewEnded(id: string): void {
    if (this.active?.id === id) this.active = null;
  }

  update(s: SceneState): SceneStart | null {
    if (s.departing || this.active) return null;
    const dt = this.last === null ? 0 : Math.max(0, s.now - this.last);
    this.last = s.now;
    for (const m of ALL_MEMORIES) {
      const t = this.tracks.get(m.id)!;
      if (t.played) continue;
      if (m.chair) {
        // Opened by staying: still (or kneeling) close to the chair, once it may play.
        if ((s.chairDistance ?? Infinity) > m.chair.within || !((s.stillFor ?? 0) >= m.chair.still || s.kneeling)) continue;
        if (s.now < t.notBefore || s.now < this.cooldownUntil || !s.free || s.otherMemory || !this.vignetteAllows(m, s)) continue;
        const start = this.begin(m, s.now, s);
        if (start) return start;
        continue;
      }
      // Any of its lines on the wall (most have one).
      const lines = linesOf(m).filter((p) => s.visible(p));
      if (!lines.length) continue;
      if (!this.arcAllows(m, s.now, !!s.kitchenPlayed)) continue;
      // A memory with its own place (the door, under the room's drawn door) begins only there.
      if (m.offer?.wall && s.facing !== undefined && s.facing !== m.offer.wall) continue;
      const looking = !!s.gazeId && lines.includes(s.gazeId);
      if (looking) t.line = s.gazeId!;
      // Just pointed at, or owed and pointed at again: a shorter look is enough.
      const need = (m.kind === 'vignette' || !!m.offer?.wall) && s.now <= t.easyUntil ? Math.min(EASY_LOOK, m.arm) : m.arm;
      if (looking && s.gazeFor >= need && !t.armed) {
        t.armed = true;
        t.away = 0;
        t.left = false;
      }
      if (!t.armed) continue;
      if (looking) t.away = 0;
      else if ((t.away += dt) >= 2) t.left = true;
      if (s.now < t.notBefore || s.now < this.cooldownUntil || !s.free || s.otherMemory || !this.vignetteAllows(m, s)) {
        // Read, but it couldn't play then: remembered, and pointed at once it can (offer()).
        if (m.kind === 'vignette' && this.isAvailable(m.id)) t.owed = true;
        continue;
      }
      if (t.requestedUntil === Infinity) t.requestedUntil = s.now + 10;
      const tapped = s.now <= t.requestedUntil;
      const asked = tapped || ((t.left || !m.lookBack) && looking && s.gazeFor >= (m.lookBack ? m.commit : need));
      if (!asked) continue;
      const start = this.begin(m, s.now, s);
      if (start) return start;
    }
    return null;
  }

  /** A vignette keeps its distance, its phase, and its place (the kitchen is one kitchen). */
  private vignetteAllows(m: SceneMemory, s: Pick<SceneState, 'now' | 'phase' | 'kitchenPlayed' | 'finished'>): boolean {
    if (m.kind !== 'vignette') return true;
    if (m.afterFinished && !(s.finished?.(m.afterFinished) ?? true)) return false;
    if (s.now - this.lastEnded < (this.lastTone === m.tone ? SAME_TONE_APART : VIGNETTE_APART)) return false;
    if (this.vignetteStarts.filter((at) => s.now - at < VIGNETTE_WINDOW).length >= VIGNETTES_IN_WINDOW) return false;
    if (m.phases && s.phase && !m.phases.includes(s.phase as never)) return false;
    if (m.group === 'kitchen' && s.kitchenPlayed) return false;
    if (m.requires && !((this.counts[m.requires.seen] ?? 0) > 0)) return false;
    if (m.maxSeen !== undefined && (this.counts[m.id] ?? 0) >= m.maxSeen) return false;
    return true;
  }

  /** The version of a vignette this visitor meets (painted memories: by how often seen). */
  variantOf(id: string, s?: Pick<SceneState, 'variantCtx'>): string {
    const def = VIGNETTE_BY_ID.get(id);
    const seen = this.counts[id] ?? 0;
    if (!def) {
      const m = ALL_MEMORIES.find((x) => x.id === id)!;
      return seen === 0 ? m.variants.first : m.variants.revisit[(seen - 1) % m.variants.revisit.length] ?? m.variants.first;
    }
    const ctx = s?.variantCtx?.() ?? { visits: 1, field: {}, motifs: [], withdrew: false };
    return chooseVariant(def, { ...ctx, seen });
  }

  /** Something a heard vignette left, now due, if any (the Director decides if it fits now). */
  dueEchoes(now: number): PendingEcho[] {
    this.pending = this.pending.filter((p) => now <= p.until);
    return this.pending.filter((p) => now >= p.at);
  }

  /** An echo has come back (or found no room in time): it doesn't come again. */
  echoDone(p: PendingEcho): void {
    this.pending = this.pending.filter((x) => x !== p);
  }

  /** The visitor is leaving: nothing more comes back. */
  dropEchoes(): void {
    this.pending = [];
  }

  /**
   * Painted memories that may be offered within a minute or so: unplayed, unoffered, their place in
   * the arc open. Their lines are often written only as they are offered, so their art and sound
   * are fetched from here, not from the line (QA, 2026-10-20: the woodland's took 40 s on a slow
   * connection, fetched when its line appeared).
   */
  comingSoon(now: number, kitchenPlayed = false): SceneMemory[] {
    return ALL_MEMORIES.filter((m) => {
      const t = this.tracks.get(m.id)!;
      return m.kind !== 'vignette' && !t.played && !t.offered && now >= this.earliestOf(m) - 60 && this.arcAllows(m, now, kitchenPlayed);
    });
  }

  /** Its place in the arc: company first, absence only after something. */
  private arcAllows(m: SceneMemory, now: number, kitchenPlayed: boolean): boolean {
    if (this.arcEnded(m)) return false;
    // The heart needs nothing before it.
    if (m.id === this.heart) return true;
    // The other hearts don't take its place while it waits (unless it was pointed at long ago and let be).
    if (this.heart && HEARTS.has(m.id) && !this.heartPlayed && !this.heartLapsed(now)) return false;
    // (Another painted memory: a heard vignette doesn't change the visit's arc.)
    const another = kitchenPlayed || [...this.tracks.entries()].some(([id, t]) => id !== m.id && t.played && this.painted(id));
    if (m.arc === 'first') return !another && now <= (m.latest ?? Infinity);
    if (m.arc === 'afterAnother') return another;
    return true;
  }

  /** A memory that ends the arc (`last`) has played: no other painted memory comes this visit. */
  private arcEnded(m: SceneMemory): boolean {
    if (m.kind === 'vignette') return false;
    // After the heart, the visit's painted arc is complete.
    if (this.heart && m.id !== this.heart && this.tracks.get(this.heart)!.played) return true;
    return ALL_MEMORIES.some((x) => x.last && x.id !== m.id && this.tracks.get(x.id)!.played);
  }

  /**
   * A memory playing that the Director didn't begin (the artist's panel, captures): the room
   * still waits with it.
   */
  external(id: string, now: number, voiced = false): void {
    if (!this.active) this.active = { id, since: now, ...(voiced ? { voiced } : {}) };
  }

  private begin(m: SceneMemory, now: number, s?: SceneState): SceneStart | null {
    const variant = this.variantOf(m.id, s);
    if (m.kind === 'vignette') {
      // Voices not yet recorded (or not yet kept by the artist): it waits, unless this version
      // has none.
      const def = VIGNETTE_BY_ID.get(m.id)!;
      if (this.available && !this.available.has(m.id) && spokenLines(def, variant).length > 0) return null;
    }
    const t = this.tracks.get(m.id)!;
    t.played = true;
    t.requestedUntil = -Infinity;
    this.active = { id: m.id, since: now };
    if (m.kind === 'vignette') this.vignetteStarts.push(now);
    // Placed beside the line that was read (its own, or another that opens it).
    // (If that line has gone from the wall since, beside one of its lines still there.)
    const shown = (p: string) => s?.visible(p) ?? true;
    const line = t.line && linesOf(m).includes(t.line) && shown(t.line) ? t.line : linesOf(m).find(shown) ?? m.phraseId;
    if (m.kind === 'vignette') return { id: m.id, phraseId: line, variant, minHold: m.minHold, maxHold: m.maxHold, kind: 'vignette' };
    // Which version of its voices is heard: from what the visitor has done, never by chance.
    const ctx = s?.variantCtx?.() ?? { visits: 1, field: {}, motifs: [], withdrew: false };
    const chosen = chooseVoices(m.id, variant, { ...ctx, seen: this.counts[m.id] ?? 0 });
    const voices = chosen && this.available?.has(voicesId(m.id, variant, chosen)) ? chosen : null;
    if (voices) this.active.voiced = true;
    return { id: m.id, phraseId: m.phraseId, variant, minHold: m.minHold, maxHold: m.maxHold, ...(voices ? { voices } : {}) };
  }

  /** Its cue never found room (something else took the moment): not spent, still armed. */
  cancel(id: string, now: number): void {
    if (this.active?.id !== id) return;
    this.unspend(id, this.active.since);
    this.active = null;
    const t = this.tracks.get(id);
    if (!t) return;
    t.played = false;
    t.left = true; // it was asked for: the next look may begin it
    t.notBefore = Math.max(t.notBefore, now + 2);
  }

  /**
   * The memory has gone. `seen`: it was watched past its first moments. Returns whether it
   * counts as seen (the App persists the count).
   */
  ended(id: string, now: number, seen: boolean, ranToEnd: boolean): boolean {
    if (this.active?.id !== id) return false;
    const since = this.active.since;
    this.active = null;
    if (VIGNETTE_BY_ID.has(id)) this.lastVignetteEnded = now;
    const t = this.tracks.get(id);
    if (!t) return false;
    if (!seen && t.unseen === 0) {
      // Withdrawn before anyone saw it: not spent; offered again once, a little later.
      t.unseen++;
      this.unspend(id, since);
      t.played = false;
      t.armed = false;
      t.left = false;
      t.notBefore = now + 30;
      this.cooldownUntil = now + 30;
      return false;
    }
    this.cooldownUntil = now + (ranToEnd ? 60 : 45);
    this.lastEnded = now;
    // A vignette unseen a second time: spent for this visit, but not heard (nothing counted, and
    // nothing left to come back). (A painting withdrawn twice counts: it was there to be seen.)
    if (!seen && VIGNETTE_BY_ID.has(id)) return false;
    this.counts[id] = (this.counts[id] ?? 0) + 1;
    const def = VIGNETTE_BY_ID.get(id);
    if (def) {
      this.lastTone = def.tone;
      for (const echo of def.echoes ?? []) this.pending.push({ vignette: id, echo, at: now + echo.after[0], until: now + echo.after[1] });
    }
    return true;
  }
}
