/**
 * Captions (and any other thing) still to come, each tied to the sound `T` it belongs to: shown
 * when their time comes, or, as the sound is let go, paused, seeked or ended, kept, shown at once
 * or dropped with it.
 */
export class CaptionTimers<T> {
  private timers = new Map<ReturnType<typeof setTimeout>, { f: () => void; owner: T }>();

  /** Run `f` in `seconds` (at once if that is about now), as long as `owner` is kept. */
  later(seconds: number, f: () => void, owner: T): void {
    if (seconds <= 0.02) return f();
    const h = setTimeout(() => {
      this.timers.delete(h);
      f();
    }, seconds * 1000);
    this.timers.set(h, { f, owner });
  }

  /**
   * The ones still to come, when the memory lets go, pauses, seeks or ends: those whose sound will
   * still be heard as it was (`keep`) wait for it; those whose sound has begun and is heard on a
   * moment more (`now`) are shown at once; the rest go with their sound (QA, 2026-10-20: a
   * sentence let go gracefully just before it was said was heard, uncaptioned).
   */
  settle(keep: (owner: T) => boolean = () => false, now: (owner: T) => boolean = () => false): void {
    for (const [h, t] of [...this.timers]) {
      if (keep(t.owner)) continue;
      clearTimeout(h);
      this.timers.delete(h);
      if (now(t.owner)) t.f();
    }
  }
}
