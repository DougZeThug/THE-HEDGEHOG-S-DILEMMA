import { SCENE_MEMORIES, SCENE_BY_PHRASE, type SceneMemory } from '../content/memories';

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
}

export interface SceneStart {
  id: string;
  phraseId: string;
  variant: string;
  minHold: number;
  maxHold: number;
}

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

  /** `counts`: how many times each memory has been seen on earlier visits (persisted). */
  constructor(private counts: Record<string, number> = {}) {
    for (const m of SCENE_MEMORIES) this.tracks.set(m.id, { armed: false, away: 0, left: false, offered: false, requestedUntil: -Infinity, played: false, unseen: 0, notBefore: m.earliest });
  }

  /** A touch on writing: arms its memory, and asks for it now if it is eligible. */
  tapped(phraseId: string): void {
    const m = SCENE_BY_PHRASE.get(phraseId);
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
    const m = SCENE_BY_PHRASE.get(phraseId);
    return !!m && !this.tracks.get(m.id)!.played;
  }

  /** Has any scene played (or is one playing) this visit? */
  get anyPlayed(): boolean {
    return !!this.active || [...this.tracks.values()].some((t) => t.played);
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
    for (const m of SCENE_MEMORIES) {
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
    for (const m of SCENE_MEMORIES) {
      const t = this.tracks.get(m.id)!;
      if (t.played || !s.visible(m.phraseId)) continue;
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
      if (t.requestedUntil === Infinity) t.requestedUntil = s.now + 10;
      const tapped = s.now <= t.requestedUntil;
      const asked = tapped || ((t.left || !m.lookBack) && looking && s.gazeFor >= (m.lookBack ? m.commit : m.arm));
      if (!asked) continue;
      return this.begin(m, s.now);
    }
    return null;
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

  private begin(m: SceneMemory, now: number): SceneStart {
    const t = this.tracks.get(m.id)!;
    t.played = true;
    t.requestedUntil = -Infinity;
    this.active = { id: m.id, since: now };
    const seen = this.counts[m.id] ?? 0;
    const variant = seen === 0 ? m.variants.first : m.variants.revisit[(seen - 1) % m.variants.revisit.length] ?? m.variants.first;
    return { id: m.id, phraseId: m.phraseId, variant, minHold: m.minHold, maxHold: m.maxHold };
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
    return true;
  }
}
