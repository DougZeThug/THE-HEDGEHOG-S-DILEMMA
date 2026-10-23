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
  /** Of the room's own accord (not answering the visitor): spaced by `roomGap`. */
  room: boolean;
  /** Its source (a rule): cues of the one that last went are part of that one event, not spaced from it. */
  group?: string;
  /** Never held for the room's gap, but the room's next own event waits the gap after it. */
  marks?: boolean;
  priority: number;
  /** Drop the event if it cannot fire before this time. */
  expires?: number;
  key?: string;
}

export interface ScheduleOptions {
  major?: boolean;
  room?: boolean;
  group?: string;
  marks?: boolean;
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
  private lastRoomAt = -Infinity;
  private lastRoomGroup: string | undefined;
  private cooldowns = new Map<string, number>();
  /** Events that expired (could not fire in time) on the last tick. */
  expired: T[] = [];
  /** The events that came due on the last tick, by payload (to put one back as it was). */
  private dueEvents = new Map<T, ScheduledEvent<T>>();

  /** The gap after one of the room's own events before the next (a number, or drawn each time). */
  private nextRoomGap: number;
  /** Never two of the room's own events at once: the next is kept until the gap has passed. */
  constructor(public majorGap = 7, private roomGap: number | (() => number) = 2.5) {
    this.nextRoomGap = typeof roomGap === 'number' ? roomGap : 0;
  }

  schedule(at: number, payload: T, opts: ScheduleOptions = {}): number {
    if (opts.key) this.cancelKey(opts.key);
    const ev: ScheduledEvent<T> = {
      id: this.nextId++,
      at,
      payload,
      major: !!opts.major,
      room: !!opts.room,
      group: opts.group,
      marks: !!opts.marks,
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

  /**
   * How an event that came due on the last tick was scheduled, to put it back the same: with its
   * priority and key, and its time to live from the new time. (Its key only if no newer event has
   * taken it since. Not its major spacing: it has waited already, and the room's gap spaces it.)
   */
  optsOf(payload: T): ScheduleOptions {
    const ev = this.dueEvents.get(payload);
    if (!ev) return {};
    return {
      priority: ev.priority,
      ...(ev.key && !this.queue.some((e) => e.key === ev.key) ? { key: ev.key } : {}),
      ...(ev.expires !== undefined ? { ttl: Math.max(1, ev.expires - ev.at) } : {}),
    };
  }

  /** Can a major event fire right now? */
  majorFree(now: number): boolean {
    return now - this.lastMajorAt >= this.majorGap;
  }

  /** Pop every event due at `now`, respecting major spacing. */
  tick(now: number): T[] {
    const out: T[] = [];
    const keep: ScheduledEvent<T>[] = [];
    this.expired = [];
    // Highest priority majors first among the due ones.
    const due = this.queue.filter((e) => e.at <= now);
    this.dueEvents = new Map(due.map((e) => [e.payload, e]));
    const later = this.queue.filter((e) => e.at > now);
    due.sort((a, b) => b.priority - a.priority || a.at - b.at || a.id - b.id);
    for (const ev of due) {
      if (ev.expires !== undefined && now > ev.expires) {
        this.expired.push(ev.payload);
        continue;
      }
      // (Both spacings are checked before either is spent: one held back takes no slot.)
      // (Within the gap, a cue of the rule that last went is part of that same event.)
      const inGap = now - this.lastRoomAt < this.nextRoomGap;
      const sameEvent = ev.room && inGap && ev.group !== undefined && ev.group === this.lastRoomGroup;
      if ((ev.major && !this.majorFree(now)) || (ev.room && inGap && !sameEvent)) {
        keep.push(ev);
        continue;
      }
      if (ev.major) this.lastMajorAt = now;
      // (An event's later cue keeps the next one waiting from there.)
      if (ev.room && sameEvent) this.lastRoomAt = now;
      if ((ev.room && !sameEvent) || (ev.marks && !ev.room)) {
        this.lastRoomAt = now;
        this.lastRoomGroup = ev.group;
        this.nextRoomGap = typeof this.roomGap === 'number' ? this.roomGap : this.roomGap();
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
