import { SCENE_MEMORIES, SCENE_BY_PHRASE, type SceneMemory } from '../content/memories';

/**
 * When a living memory may open (docs/memories.md; decisions in
 * docs/reviews/2026-10-living-memories.md). Pure and owned by the Director, which feeds it the
 * room's state each tick and turns a decision into a `memory-scene` cue.
 *
 * - **Armed** by reading the line (a long enough look) or touching it, at any time: a phone
 *   visitor's tap is never lost because it came early.
 * - **Begins** on a later look (or a touch) once it is eligible: past its earliest time, the room
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
  played: boolean;
  unseen: number;
  notBefore: number;
}

export class MemoryDirector {
  private tracks = new Map<string, Track>();
  private pendingTap: string | null = null;
  active: { id: string; since: number } | null = null;
  private cooldownUntil = -Infinity;

  /** `counts`: how many times each memory has been seen on earlier visits (persisted). */
  constructor(private counts: Record<string, number> = {}) {
    for (const m of SCENE_MEMORIES) this.tracks.set(m.id, { armed: false, played: false, unseen: 0, notBefore: m.earliest });
  }

  /** A touch on writing: arms its memory, and asks for it now if it is eligible. */
  tapped(phraseId: string): void {
    const m = SCENE_BY_PHRASE.get(phraseId);
    if (!m) return;
    const t = this.tracks.get(m.id)!;
    if (t.played) return;
    t.armed = true;
    this.pendingTap = phraseId;
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

  update(s: SceneState): SceneStart | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    if (s.departing || this.active) return null;
    for (const m of SCENE_MEMORIES) {
      const t = this.tracks.get(m.id)!;
      if (t.played || !s.visible(m.phraseId)) continue;
      const looking = s.gazeId === m.phraseId;
      if (looking && s.gazeFor >= m.arm) t.armed = true;
      if (!t.armed) continue;
      if (s.now < t.notBefore || s.now < this.cooldownUntil || !s.free || s.otherMemory) continue;
      const asked = tap === m.phraseId || (looking && s.gazeFor >= m.commit);
      if (!asked) continue;
      return this.begin(m, s.now);
    }
    return null;
  }

  private begin(m: SceneMemory, now: number): SceneStart {
    const t = this.tracks.get(m.id)!;
    t.played = true;
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
      t.notBefore = now + 30;
      this.cooldownUntil = now + 30;
      return false;
    }
    this.cooldownUntil = now + (ranToEnd ? 60 : 45);
    this.counts[id] = (this.counts[id] ?? 0) + 1;
    return true;
  }
}
