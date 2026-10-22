import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Voices, type Played } from '../src/audio/Voices';

/**
 * `busyUntil` is what `App.playVignette` waits on before a vignette begins ("nothing sounds
 * over a memory"). It must record every room voice — spoken or wordless (hum, laugh, murmur,
 * breath, all played with `text: null`) — not only lines with words.
 *
 * `play_` is stubbed so the bookkeeping can be checked with no Web Audio, and fake timers
 * neutralize the `setTimeout` `playLine` schedules in its `finally`.
 */
type Stub = () => Promise<Played>;

const make = (durations: number[]): Voices => {
  const v = new Voices({} as never);
  const q = [...durations];
  (v as unknown as { play_: Stub }).play_ = async () => ({ duration: q.shift() ?? 0 });
  return v;
};

const now = () => performance.now() / 1000;
/** Set the number of voices already in the room (the crowd guard reads `active >= 4`). */
const crowd = (v: Voices, n: number) => ((v as unknown as { active: number }).active = n);
/** `App.playVignette`'s pre-vignette wait for a still-sounding room voice, capped at 4 s. */
const wait = (v: Voices) => Math.min(4, Math.max(0, v.busyUntil - now()));

describe('Voices.busyUntil tracks every room voice, wordless ones included', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a spoken line advances busyUntil by its duration (no regression)', async () => {
    const v = make([7]);
    const start = now();
    await v.playLine('tender', 'hello', {}, 1);
    expect(v.busyUntil).toBeCloseTo(start + 7, 1);
  });

  it('a wordless voice (text: null) advances busyUntil too', async () => {
    const v = make([10]);
    const start = now();
    await v.playLine('hum', null, {}, 1, undefined, { melody: [0, 2, 4] });
    expect(v.busyUntil).toBeCloseTo(start + 10, 1);
  });

  it('busyUntil holds the latest of several voices (the max), not the most recent', async () => {
    const v = make([5, 10, 2]);
    const start = now();
    await v.playLine('tender', 'hello', {}, 1);                          // -> start + 5
    await v.playLine('hum', null, {}, 1, undefined, { melody: [0, 2] }); // -> max(start+5, start+10)
    expect(v.busyUntil).toBeCloseTo(start + 10, 1);
    await v.playLine('breath', null, {}, 1);                              // shorter: must not reduce it
    expect(v.busyUntil).toBeCloseTo(start + 10, 1);
  });

  it('the playVignette wait is non-zero while a wordless voice sounds, capped at 4 s', async () => {
    const v = make([10]);
    await v.playLine('hum', null, {}, 1, undefined, { melody: [0, 2, 4] });
    expect(wait(v)).toBe(4); // ~10 s hum: the vignette waits the full cap, not 0
  });

  it('a voice refused for the crowd does not claim to be busy (no over-tracking)', async () => {
    const v = make([17]);
    crowd(v, 4);
    const out = await v.playLine('hum', null, {}, 1);
    expect(out.duration).toBe(0);
    expect(v.busyUntil).toBe(0); // nothing played, so nothing extends the wait
  });
});
