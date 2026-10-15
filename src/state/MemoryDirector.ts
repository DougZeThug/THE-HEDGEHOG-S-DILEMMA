import { ALL_MEMORIES, MEMORY_BY_PHRASE, type SceneMemory } from '../content/memories';
import { VIGNETTE_BY_ID, chooseVariant, spokenLines, type Echo, type VariantContext } from '../content/vignettes';

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
}

export interface SceneStart {
  id: string;
  phraseId: string;
  variant: string;
  minHold: number;
  maxHold: number;
  kind?: 'vignette';
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
}

export class MemoryDirector {
  private tracks = new Map<string, Track>();
  active: { id: string; since: number } | null = null;
  private cooldownUntil = -Infinity;
  private last: number | null = null;
  /** When the last memory (any) ended; kitchen-light's too, reported by the Director. */
  lastEnded = -Infinity;
  /** The tone of the last vignette heard this visit. */
  private lastTone: string | null = null;
  /** Vignettes whose voices are recorded and approved (null: all, as in tests and previews). */
  private available: Set<string> | null = null;
  private pending: PendingEcho[] = [];

  /** `counts`: how many times each memory has been seen on earlier visits (persisted). */
  constructor(private counts: Record<string, number> = {}) {
    for (const m of ALL_MEMORIES) this.tracks.set(m.id, { armed: false, away: 0, left: false, offered: false, requestedUntil: -Infinity, played: false, unseen: 0, notBefore: m.earliest });
  }

  /** Which vignettes may speak (their recordings approved); the rest wait, or play voiceless. */
  setAvailable(ids: Set<string> | null): void {
    this.available = ids;
  }

  /** A touch on writing: arms its memory, and asks for it now if it is eligible. */
  tapped(phraseId: string): void {
    const m = MEMORY_BY_PHRASE.get(phraseId);
    if (!m) return;
    const t = this.tracks.get(m.id)!;
    if (t.played) return;
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
    return !!m && !this.tracks.get(m.id)!.played;
  }

  /** Has any scene played (or is one playing) this visit? */
  get anyPlayed(): boolean {
    return !!this.active || [...this.tracks.values()].some((t) => t.played);
  }

  /** Has a painted memory played (or is one playing)? (Vignettes don't change the visit's arc.) */
  get paintedPlayed(): boolean {
    const painted = (id: string) => ALL_MEMORIES.find((m) => m.id === id)?.kind !== 'vignette';
    return (!!this.active && painted(this.active.id)) || [...this.tracks.entries()].some(([id, t]) => t.played && painted(id));
  }

  /** A memory of the kitchen has been heard this visit (the kitchen-light memory then waits). */
  get kitchenTaken(): boolean {
    return ALL_MEMORIES.some((m) => m.group === 'kitchen' && this.tracks.get(m.id)!.played);
  }

  /** A vignette's line, kept from the room's voices until its vignette has been heard. */
  claimsVoice(phraseId: string): boolean {
    const m = MEMORY_BY_PHRASE.get(phraseId);
    return !!m && m.kind === 'vignette' && !this.tracks.get(m.id)!.played;
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
  }): SceneMemory | null {
    if (s.departing || this.active || !s.free || s.otherMemory) return null;
    if (s.now < this.cooldownUntil || s.now - this.lastEnded < 0) return null;
    for (const m of ALL_MEMORIES) {
      const t = this.tracks.get(m.id)!;
      if (!m.offer || t.played || t.offered || s.now < m.earliest || !m.offer.phases.includes(s.phase as never)) continue;
      if (s.now - this.lastEnded < m.offer.apart) continue;
      if (!this.arcAllows(m, s.now, !!s.kitchenPlayed)) continue;
      if (m.offer.wall && s.facing !== m.offer.wall) continue;
      // The pale morning answers the dark: a few seconds after the held silence lifts.
      if (m.offer.afterDark && !(s.darkEnded != null ? s.now >= s.darkEnded + 8 : s.now >= 200)) continue;
      // Already where they are looking: no need to write it again (unless it has its own place).
      if (!m.offer.wall && s.visibleFacing(m.phraseId)) {
        t.offered = true;
        continue;
      }
      t.offered = true;
      return m;
    }
    return null;
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
      if (!s.visible(m.phraseId)) continue;
      if (!this.arcAllows(m, s.now, !!s.kitchenPlayed)) continue;
      // A memory with its own place (the door, under the room's drawn door) begins only there.
      if (m.offer?.wall && s.facing !== undefined && s.facing !== m.offer.wall) continue;
      const looking = s.gazeId === m.phraseId;
      if (looking && s.gazeFor >= m.arm && !t.armed) {
        t.armed = true;
        t.away = 0;
        t.left = false;
      }
      if (!t.armed) continue;
      if (looking) t.away = 0;
      else if ((t.away += dt) >= 2) t.left = true;
      if (s.now < t.notBefore || s.now < this.cooldownUntil || !s.free || s.otherMemory) continue;
      if (!this.vignetteAllows(m, s)) continue;
      if (t.requestedUntil === Infinity) t.requestedUntil = s.now + 10;
      const tapped = s.now <= t.requestedUntil;
      const asked = tapped || ((t.left || !m.lookBack) && looking && s.gazeFor >= (m.lookBack ? m.commit : m.arm));
      if (!asked) continue;
      const start = this.begin(m, s.now, s);
      if (start) return start;
    }
    return null;
  }

  /** A vignette keeps its distance, its phase, and its place (the kitchen is one kitchen). */
  private vignetteAllows(m: SceneMemory, s: SceneState): boolean {
    if (m.kind !== 'vignette') return true;
    if (s.now - this.lastEnded < (this.lastTone === m.tone ? SAME_TONE_APART : VIGNETTE_APART)) return false;
    if (m.phases && s.phase && !m.phases.includes(s.phase as never)) return false;
    if (m.group === 'kitchen' && s.kitchenPlayed) return false;
    if (m.requires && !((this.counts[m.requires.seen] ?? 0) > 0)) return false;
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

  /** Its place in the arc: company first, absence only after something. */
  private arcAllows(m: SceneMemory, now: number, kitchenPlayed: boolean): boolean {
    const another = kitchenPlayed || [...this.tracks.entries()].some(([id, t]) => id !== m.id && t.played);
    if (m.arc === 'first') return !another && now <= (m.latest ?? Infinity);
    if (m.arc === 'afterAnother') return another;
    return true;
  }

  /**
   * A memory playing that the Director didn't begin (the artist's panel, captures): the room
   * still waits with it.
   */
  external(id: string, now: number): void {
    if (!this.active) this.active = { id, since: now };
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
    return { id: m.id, phraseId: m.phraseId, variant, minHold: m.minHold, maxHold: m.maxHold, ...(m.kind === 'vignette' ? { kind: 'vignette' as const } : {}) };
  }

  /** Its cue never found room (something else took the moment): not spent, still armed. */
  cancel(id: string, now: number): void {
    if (this.active?.id !== id) return;
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
    this.active = null;
    const t = this.tracks.get(id);
    if (!t) return false;
    if (!seen && t.unseen === 0) {
      // Withdrawn before anyone saw it: not spent; offered again once, a little later.
      t.unseen++;
      t.played = false;
      t.armed = false;
      t.left = false;
      t.notBefore = now + 30;
      this.cooldownUntil = now + 30;
      return false;
    }
    this.cooldownUntil = now + (ranToEnd ? 60 : 45);
    this.lastEnded = now;
    this.counts[id] = (this.counts[id] ?? 0) + 1;
    const def = VIGNETTE_BY_ID.get(id);
    if (def) {
      this.lastTone = def.tone;
      for (const echo of def.echoes ?? []) this.pending.push({ vignette: id, echo, at: now + echo.after[0], until: now + echo.after[1] });
    }
    return true;
  }
}
