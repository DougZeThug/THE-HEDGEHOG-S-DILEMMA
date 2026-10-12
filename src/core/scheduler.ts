/**
 * EventScheduler — the room's sense of pacing.
 *
 * Events are scheduled on the simulation clock. "Major" events (voices, music entries,
 * silences, large reveals) are spaced by `majorGap` seconds so the room never piles
 * gestures on top of each other; a due major event that would crowd the last one is
 * deferred, not dropped (unless it has expired).
 */
export interface ScheduledEvent<T> {
  id: number;
  at: number;
  payload: T;
  major: boolean;
  priority: number;
  /** Drop the event if it cannot fire before this time. */
  expires?: number;
  key?: string;
}

export interface ScheduleOptions {
  major?: boolean;
  priority?: number;
  /** Seconds after `at` the event may still fire if deferred. */
  ttl?: number;
  /** If set, an existing pending event with the same key is replaced. */
  key?: string;
}

export class EventScheduler<T> {
  private queue: ScheduledEvent<T>[] = [];
  private nextId = 1;
  private lastMajorAt = -Infinity;
  private cooldowns = new Map<string, number>();

  constructor(public majorGap = 7) {}

  schedule(at: number, payload: T, opts: ScheduleOptions = {}): number {
    if (opts.key) this.cancelKey(opts.key);
    const ev: ScheduledEvent<T> = {
      id: this.nextId++,
      at,
      payload,
      major: !!opts.major,
      priority: opts.priority ?? 0,
      expires: opts.ttl !== undefined ? at + opts.ttl : undefined,
      key: opts.key,
    };
    this.queue.push(ev);
    this.queue.sort((a, b) => a.at - b.at || b.priority - a.priority || a.id - b.id);
    return ev.id;
  }

  cancel(id: number): void {
    this.queue = this.queue.filter((e) => e.id !== id);
  }

  cancelKey(key: string): void {
    this.queue = this.queue.filter((e) => e.key !== key);
  }

  cancelWhere(fn: (payload: T) => boolean): void {
    this.queue = this.queue.filter((e) => !fn(e.payload));
  }

  pending(): readonly ScheduledEvent<T>[] {
    return this.queue;
  }

  hasPending(key: string): boolean {
    return this.queue.some((e) => e.key === key);
  }

  /** Cooldown helpers for rules: ready() is true if `key` has not fired within `seconds`. */
  ready(key: string, now: number, seconds: number): boolean {
    const last = this.cooldowns.get(key);
    return last === undefined || now - last >= seconds;
  }
  mark(key: string, now: number): void {
    this.cooldowns.set(key, now);
  }
  lastFired(key: string): number | undefined {
    return this.cooldowns.get(key);
  }

  /** Can a major event fire right now? */
  majorFree(now: number): boolean {
    return now - this.lastMajorAt >= this.majorGap;
  }

  /** Pop every event due at `now`, respecting major spacing. */
  tick(now: number): T[] {
    const out: T[] = [];
    const keep: ScheduledEvent<T>[] = [];
    // Highest priority majors first among the due ones.
    const due = this.queue.filter((e) => e.at <= now);
    const later = this.queue.filter((e) => e.at > now);
    due.sort((a, b) => b.priority - a.priority || a.at - b.at || a.id - b.id);
    for (const ev of due) {
      if (ev.expires !== undefined && now > ev.expires) continue;
      if (ev.major) {
        if (!this.majorFree(now)) {
          if (ev.expires === undefined || now <= ev.expires) keep.push(ev);
          continue;
        }
        this.lastMajorAt = now;
      }
      out.push(ev.payload);
    }
    this.queue = [...keep, ...later].sort((a, b) => a.at - b.at || b.priority - a.priority || a.id - b.id);
    return out;
  }

  /** Serializable snapshot (for the debug inspector). */
  snapshot(now: number) {
    return this.queue.map((e) => ({ in: +(e.at - now).toFixed(1), major: e.major, key: e.key, payload: e.payload }));
  }
}
