import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryAudio, type MemoryAudioHost } from '../src/memory/MemoryAudio';
import { MemoryClock } from '../src/memory/clock';
import { CueDispatch } from '../src/memory/cueDispatch';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { FULL } from '../src/memory/compose';
import type { CueSheet } from '../src/memory/cueSheet';
import type { Marker, TimelineSource } from '../src/memory/types';

import { FakeCtx, FakeNode, FakeParam, FakeSource } from './fakeAudio';

const SHEET: CueSheet = {
  room: [0.5, 2, 0.2],
  cues: {
    'bed:kitchen': { asset: 'mem:kitchen-evening', gainDb: -40, place: { u: 0, v: 0, d: 1 }, fadeIn: 3, fadeOut: 5 },
    'sfx:spoon': { asset: 'mem:spoon-bowl', gainDb: -30, place: { u: 0, v: -0.25, d: 0.5 }, caption: '[two spoons in bowls]' },
    'sfx:steps': { asset: 'mem:footsteps', gainDb: -30, place: { u: 0, v: 0, d: 0.5 }, to: { u: 0, v: 0, d: 6 }, lowpass: 6000, lowpassTo: 1500, cutOnInterrupt: true },
    'music:kitchen': { asset: 'music/memory-kitchen.mp3', gainDb: -31, place: { u: -0.3, v: 0, d: 1 }, fadeIn: 4, fadeOut: 6 },
  },
};
const MARKERS: Marker[] = [
  { label: 'bed:kitchen', position: 2 },
  { label: 'sfx:spoon', position: 6.5 },
  { label: 'sfx:steps', position: 8 },
  { label: 'music:kitchen', position: 9 },
];
const DURATION: Record<string, number> = { 'mem:kitchen-evening': 8, 'mem:spoon-bowl': 3, 'mem:footsteps': 5, 'music/memory-kitchen.mp3': 30 };

function setup() {
  const ctx = new FakeCtx();
  const captions: string[] = [];
  const bus = new FakeNode(ctx);
  const host: MemoryAudioHost = {
    ctx: ctx as unknown as BaseAudioContext,
    out: bus as unknown as AudioNode,
    load: async (asset) => ({ duration: DURATION[asset] }) as AudioBuffer,
    impulse: () => ({}) as AudioBuffer,
    intensity: 1,
    where: (p) => ('at' in p ? [0, 0, 0] : [p.u, p.v, -p.d]),
    caption: (t) => captions.push(t),
  };
  const baseline = ctx.nodes.size;
  const audio = new MemoryAudio(host, SHEET, MARKERS);
  return { ctx, audio, captions, baseline };
}

/** Play the memory forward from `from` to `to` (sequence seconds), as the controller would. */
function playThrough(ctx: FakeCtx, audio: MemoryAudio, d: CueDispatch, from: number, to: number, dt = 1 / 30) {
  for (let p = from; p <= to + 1e-9; p += dt) {
    const due = d.advance(p);
    if (due.length) audio.play(due);
    ctx.advance(dt);
    // (A caption is shown as its sound is heard: on a timer, when the test's timers are fake.)
    if (vi.isFakeTimers()) vi.advanceTimersByTime(dt * 1000);
  }
}

afterEach(() => vi.useRealTimers());

describe('memory audio: scheduled on the audio clock, never twice, nothing left behind', () => {
  it('schedules each event at its marker time, ahead of when it is handed out', async () => {
    vi.useFakeTimers();
    const { ctx, audio, captions } = setup();
    await audio.prepare();
    expect(audio.ready).toBe(true);
    playThrough(ctx, audio, new CueDispatch(MARKERS), 0, 10);
    const starts = ctx.sources.map((s) => s.startAt![0]);
    // Each starts within a frame of its marker's place on the clock (sequence time = context time here).
    expect(starts.map((t) => Math.round(t * 10) / 10)).toEqual([2, 6.5, 8, 9]);
    expect(captions).toEqual(['[two spoons in bowls]']);
    // The bed loops with trimmed ends; music is placed, the bed is wide.
    expect(ctx.sources[0].loop).toBe(true);
    expect(ctx.sources[0].loopStart).toBeGreaterThan(0);
  });

  it('a seek (held by hand) is silent; playing on brings back the bed and the music part-way in, never a one-shot it passed', async () => {
    const { ctx, audio } = setup();
    await audio.prepare();
    const d = new CueDispatch(MARKERS);
    playThrough(ctx, audio, d, 0, 3);
    const bed = ctx.sources[0];
    d.seek(15);
    audio.seek(15);
    expect(ctx.sources.length).toBe(1); // nothing new while held
    expect(bed.stopAt).not.toBeNull(); // the bed fades while held
    ctx.advance(2);
    audio.resync(15);
    const back = ctx.sources.slice(1);
    expect(back.map((x) => x.loop)).toEqual([true, false]); // the bed, then the music
    // 15 − 9 s into the music, from a render quantum ahead (it was already due).
    expect(back[1].startAt![1]).toBeCloseTo(6 + 128 / ctx.sampleRate, 6);
    playThrough(ctx, audio, d, 15, 18);
    expect(ctx.sources.length).toBe(3); // the spoon and the steps behind the seek never sounded
  });

  it('scrubbing back and forth with the real audio starts nothing at all', async () => {
    const { ctx, audio } = setup();
    await audio.prepare();
    for (const p of [5, 18, 2, 23, 0, 12]) {
      audio.seek(p);
      ctx.advance(0.5);
    }
    expect(ctx.sources.length).toBe(0);
  });

  it('pause takes back what had not sounded, fades beds and music; resume continues them where they were', async () => {
    const { ctx, audio } = setup();
    await audio.prepare();
    const d = new CueDispatch(MARKERS);
    playThrough(ctx, audio, d, 0, 6.3); // the spoon (6.5) is handed out, scheduled 0.2 s ahead
    const spoon = ctx.sources[1];
    expect(spoon.startAt![0]).toBeGreaterThan(ctx.currentTime);
    const back = audio.pause();
    expect(back.map((m) => m.label)).toEqual(['sfx:spoon']);
    expect(ctx.sources[0].stopAt).toBeCloseTo(ctx.currentTime + 0.42, 6);
    ctx.advance(5); // in settings
    audio.resume();
    const bedAgain = ctx.sources[2];
    expect(bedAgain.loop).toBe(true);
    expect(bedAgain.startAt![0]).toBeCloseTo(ctx.currentTime + 128 / ctx.sampleRate, 6);
    // It carries on from about 4.3 s into the bed's own timeline (loop-wrapped into the file).
    expect(bedAgain.startAt![1]).toBeCloseTo(0.05 + ((6.3 + 1 / 30 - 2) % 7.9), 1);
  });

  it('a suspended context misses events instead of bursting them later', async () => {
    const { ctx, audio } = setup();
    await audio.prepare();
    ctx.state = 'suspended';
    playThrough(ctx, audio, new CueDispatch(MARKERS), 0, 10);
    expect(ctx.sources.length).toBe(0);
  });

  it('leaving: beds and music fade on their own time, a clink rings on, footsteps are cut on an interrupt', async () => {
    const { ctx, audio } = setup();
    await audio.prepare();
    const d = new CueDispatch(MARKERS);
    playThrough(ctx, audio, d, 0, 9.5);
    const [bed, spoon, steps, music] = ctx.sources;
    audio.release('interrupt', 1.2);
    const now = ctx.currentTime;
    expect(bed.stopAt).toBeCloseTo(now + 1.2 + 0.02, 6);
    expect(music.stopAt).toBeCloseTo(now + 1.2 + 1.5 + 0.02, 6); // the radio recedes just after the picture
    expect(steps.stopAt).toBeCloseTo(now + 0.32, 6);
    expect(spoon.stopAt).toBeNull();
    // Nothing that stays (beds, music) starts after letting go.
    audio.play([{ marker: { label: 'bed:kitchen', position: 12 }, delay: 0 }]);
    expect(ctx.sources.length).toBe(4);
  });

  it('dispose leaves no source sounding and no node connected', async () => {
    const { ctx, audio, baseline } = setup();
    await audio.prepare();
    playThrough(ctx, audio, new CueDispatch(MARKERS), 0, 9.5);
    audio.dispose(0.3);
    ctx.advance(2);
    await new Promise((r) => setTimeout(r, 1100));
    expect(audio.sounding).toBe(0);
    expect(ctx.nodes.size).toBe(baseline);
  });
});

describe('a cut on one instant of the audio clock (the woodland: the afternoon stops, the evening begins)', () => {
  const CUT = 34.5;
  const sheet: CueSheet = {
    room: [0.4, 3, 0.06],
    cues: {
      'music:air': { asset: 'air', gainDb: -20, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true },
      'music:score': { asset: 'score', gainDb: -24, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, until: CUT, fadeOut: 3 },
      'music:day': { asset: 'day', gainDb: -20, place: { u: -0.3, v: 0.25, d: 1.5 }, until: CUT },
      'music:evening': { asset: 'evening', gainDb: -20, place: { u: 0, v: 0, d: 2 }, wide: true, offset: 3, fadeIn: 0.012 },
    },
  };
  const markers: Marker[] = [
    { label: 'music:air', position: 0.05 },
    { label: 'music:day', position: 0.05 },
    { label: 'music:score', position: 3.4 },
    { label: 'music:evening', position: CUT },
  ];
  const lengths: Record<string, number> = { air: 47, day: 40, score: 32, evening: 20 };
  function run(stallAt: number | null, stall = 1.5) {
    const ctx = new FakeCtx();
    ctx.sampleRate = 48000; // (a real context's rate: a render quantum of 2.7 ms)
    const host: MemoryAudioHost = {
      ctx: ctx as unknown as BaseAudioContext,
      out: new FakeNode(ctx) as unknown as AudioNode,
      load: async (asset) => ({ duration: lengths[asset] }) as AudioBuffer,
      impulse: () => ({}) as AudioBuffer,
      intensity: 1,
      where: () => [0, 0, 0],
    };
    const audio = new MemoryAudio(host, sheet, markers);
    // Each source's own gain (made just after it), kept: a source that has ended is disconnected.
    const gains = new Map<FakeSource, FakeParam>();
    let last: FakeSource | null = null;
    const mk = ctx.createBufferSource.bind(ctx), mg = ctx.createGain.bind(ctx);
    ctx.createBufferSource = () => (last = mk());
    ctx.createGain = () => {
      const g = mg();
      if (last && !gains.has(last)) gains.set(last, g.gain);
      return g;
    };
    return { ctx, audio, gains, go: () => {
      // As the App steps it: the memory clock on the audio clock, frames of a sixtieth, one stall.
      const clock = new MemoryClock(), d = new CueDispatch(markers);
      ctx.currentTime = 100;
      let pos = 0, real = 1000;
      clock.tick(real, ctx.currentTime, true);
      while (pos < 38) {
        const frame = stallAt !== null && pos >= stallAt && pos < stallAt + 1 / 60 ? stall : 1 / 60;
        ctx.advance(frame);
        real += frame;
        pos += clock.tick(real, ctx.currentTime, true);
        const due = d.advance(pos);
        if (due.length) audio.play(due);
      }
    } };
  }
  /** The audio time a source is silent from (its cut). */
  const silentAt = (g: FakeParam) => {
    const ramp = g.events.filter((e) => e[0] === 'ramp').at(-1);
    return ramp ? ramp[2] : Infinity;
  };
  for (const stallAt of [null, 20, 33]) {
    it(`the afternoon is cut where the evening begins, to the millisecond${stallAt ? ` (a ${1.5} s stall at ${stallAt} s)` : ''}`, async () => {
      const { ctx, audio, gains, go } = run(stallAt);
      await audio.prepare();
      go();
      const by = (a: string) => ctx.sources.filter((s) => s.buffer && (s.buffer as { duration: number }).duration === lengths[a]);
      const evening = by('evening');
      expect(evening.length).toBe(1);
      const begins = evening[0].startAt![0];
      // Already under way: three seconds into its take.
      // (Joined a render quantum ahead when a stall made it late: as far into its take.)
      expect(evening[0].startAt![1] - (evening[0].startAt![0] - (100 + CUT))).toBeCloseTo(3, 6);
      for (const a of ['score', 'day']) {
        const [s] = by(a);
        expect(Math.abs(silentAt(gains.get(s)!) - begins), a).toBeLessThan(0.003);
        expect(s.stopAt! - begins, a).toBeLessThan(0.03);
      }
      // The air goes on across it.
      expect(by('air')[0].stopAt).toBeNull();
      // And it falls where the picture's cut is: 34.5 s of memory on the audio clock (the
      // memory's position and the audio clock never part, a stall or not).
      expect(Math.abs(begins - (100 + CUT))).toBeLessThan(0.02);
    });
  }
  it('paused just before the cut, the afternoon does not come back for a moment; the evening does', async () => {
    const { ctx, audio } = run(null);
    await audio.prepare();
    const d = new CueDispatch(markers);
    playThrough(ctx, audio, d, 0, 34.45);
    for (const m of audio.pause()) d.unfire(m);
    ctx.advance(5);
    const before = ctx.sources.length;
    audio.resume();
    // Nothing of the score or the day comes back with 0.05 s left before its cut.
    expect(ctx.sources.slice(before).filter((s) => [32, 40].includes((s.buffer as { duration: number }).duration)).length).toBe(0);
  });
});

describe('the memory clock', () => {
  it('follows the audio clock while it runs, real time while suspended, nothing while paused', () => {
    const c = new MemoryClock();
    expect(c.tick(10, 100, true)).toBe(0);
    expect(c.tick(10.25, 100.05, true)).toBeCloseTo(0.05, 9); // a slow frame doesn't speed the memory
    expect(c.tick(10.5, 100.05, false)).toBeCloseTo(0.25, 9);
    expect(c.tick(10.6, 100.05, false, true)).toBe(0);
    expect(c.tick(14, 100.05, false)).toBe(1); // a long stall becomes a jump, capped
  });
  it('primed where the memory begins, its first frame moves by the time since (its first sounds were scheduled from there)', () => {
    const c = new MemoryClock();
    c.prime(10, 100, true);
    expect(c.tick(10.07, 100.07, true)).toBeCloseTo(0.07, 9);
    // (Reset instead, the first frame would not move, and the picture would trail its first sounds.)
    const r = new MemoryClock();
    expect(r.tick(10.07, 100.07, true)).toBe(0);
  });
  it("a vignette's clock keeps its cap of a second (a stall makes it late rather than pass a line by)", () => {
    const c = new MemoryClock(1);
    c.tick(10, 100, true);
    expect(c.tick(12, 102, true)).toBe(1);
    expect(c.tick(12.02, 102.02, true)).toBeCloseTo(0.02, 9);
  });
  it('the image catches up with the sound after a stall while it runs (never left behind it)', () => {
    const c = new MemoryClock();
    c.tick(10, 100, true);
    expect(c.tick(10.02, 100.02, true)).toBeCloseTo(0.02, 9);
    // A 1.5 s frame while the sound played on: all of it.
    expect(c.tick(11.52, 101.52, true)).toBeCloseTo(1.5, 9);
    // Back from suspended (no audio time on the frame before): one frame of real time.
    c.tick(11.6, 101.52, false);
    expect(c.tick(11.62, 101.53, true)).toBeCloseTo(0.02, 9);
  });
});

describe("the woodland's cut, driven as the App drives it (one reading of the audio clock a frame)", () => {
  afterEach(() => vi.useRealTimers());
  const CUT = 34.5;
  const SILENT = 1e-4;
  const sheet: CueSheet = {
    room: [0.4, 3, 0.06],
    cues: {
      'music:air': { asset: 'air', gainDb: -20, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true },
      'music:day': { asset: 'day', gainDb: -20, place: { u: -0.3, v: 0.25, d: 1.5 }, dry: true, until: CUT, fadeOut: 3 },
      'music:score': { asset: 'score', gainDb: -24, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, until: CUT, fadeOut: 3 },
      'music:evening': { asset: 'evening', gainDb: -32, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, offset: 0.03, fadeIn: 0.04, fadeOut: 4, caption: '[evening]', captionAt: 1.54 },
    },
  };
  const markers: Marker[] = [
    { label: 'music:air', position: 0.05 },
    { label: 'music:day', position: 0.05 },
    { label: 'music:score', position: 8.2 },
    { label: 'music:evening', position: CUT - 0.04 },
  ];
  // The files as the woodland's are: the day's insects and the score end on the cut.
  const lengths: Record<string, number> = { air: 47, day: CUT, score: CUT - 8.2, evening: 20 };
  const level = { day: 0.1, score: Math.pow(10, -24 / 20) };

  function rig(latency = 0) {
    vi.useFakeTimers();
    const ctx = new FakeCtx();
    // (A context that reports its way to the ear: its buffering and its output's latency.)
    Object.assign(ctx, { baseLatency: latency ? 0.02 : 0, outputLatency: latency ? latency - 0.02 : 0 });
    const captions: [string, number][] = [];
    let c: MemoryPlaybackController | null = null;
    const host: MemoryAudioHost = {
      ctx: ctx as unknown as BaseAudioContext,
      out: new FakeNode(ctx) as unknown as AudioNode,
      load: async (asset) => ({ duration: lengths[asset] }) as AudioBuffer,
      impulse: () => ({}) as AudioBuffer,
      intensity: 1,
      where: () => [0, 0, 0],
      caption: (t) => captions.push([t, c!.position]),
    };
    const audio = new MemoryAudio(host, sheet, markers);
    const gains = new Map<FakeSource, FakeParam>();
    let last: FakeSource | null = null;
    const mk = ctx.createBufferSource.bind(ctx), mg = ctx.createGain.bind(ctx);
    ctx.createBufferSource = () => (last = mk());
    ctx.createGain = () => {
      const g = mg();
      if (last && !gains.has(last)) gains.set(last, g.gain);
      return g;
    };
    const timeline: TimelineSource = { sections: { active: 6, exit: 42.5, residue: 49.5, end: 53 }, markers, at: () => ({}), dispose() {} };
    c = new MemoryPlaybackController({ timeline, audio, weights: FULL, reduced: false, entrance: 2, sways: [], exit: 3, maxHold: 60, tail: 2, living: true });
    const by = (a: string) => ctx.sources.filter((x) => x.buffer && (x.buffer as { duration: number }).duration === lengths[a]);
    return { ctx, audio, c, gains, captions, by };
  }

  interface Drive {
    /** How long the memory's first frame takes (QA measured 70 ms). */
    first?: number;
    /** A long frame: [at position, seconds]. */
    stall?: [number, number];
    /** Settings opened (or the tab hidden): [at position, for seconds]; how long the frame it is
     *  opened on takes (frames are uneven: QA measured the cut 0.3 s out from one). */
    pause?: [number, number];
    pauseFrame?: number;
    /** Held by hand (the editor) at 30 s, at this position, then played on. */
    seek?: number;
    /** Let go (looked away from) at this position. */
    letGo?: number;
    /** The context stops (a phone's call): [at position, for seconds of wall time]; its clock
     *  stands still meanwhile, and the App holds the memory until it runs again. */
    suspend?: [number, number];
    /** The context isn't running yet as the memory begins: for this many seconds. */
    startSuspended?: number;
  }
  /** Steps it as App.stepLivingMemory does; returns the audio time the picture reached the cut
   *  (and when its sound came back, if it stopped). */
  let resumedAt = -Infinity;
  function drive(r: ReturnType<typeof rig>, o: Drive = {}): number | null {
    resumedAt = -Infinity;
    const { ctx, c } = r;
    const clock = new MemoryClock();
    ctx.currentTime = 100;
    let real = 1000, first = true, stalled = false, pausedFor = 0, seeked = false, released: number | null = null;
    let pictureCut: number | null = null, downUntil = -Infinity, suspended = false;
    if (o.startSuspended) {
      ctx.state = 'suspended';
      downUntil = real + o.startSuspended;
    }
    // The memory begins: its first sounds scheduled at once, its clock primed with the same instant.
    clock.prime(real, ctx.currentTime, ctx.state === 'running');
    c.start(ctx.currentTime);
    for (let i = 0; i < 20000 && c.state !== 'complete'; i++) {
      if (released === null ? c.position >= 38 : real > released + 6) break;
      let frame = 1 / 60;
      if (first) frame = o.first ?? frame;
      first = false;
      if (o.stall && !stalled && c.position >= o.stall[0]) {
        frame = o.stall[1];
        stalled = true;
      }
      if (o.pause && o.pauseFrame && pausedFor === 0 && c.position >= o.pause[0]) frame = o.pauseFrame;
      if (o.suspend && !suspended && c.position >= o.suspend[0]) {
        suspended = true;
        ctx.state = 'suspended';
        downUntil = real + o.suspend[1];
      }
      if (ctx.state === 'suspended' && real >= downUntil) {
        ctx.state = 'running';
        resumedAt = ctx.currentTime;
      }
      // (A suspended context's clock stands still.)
      if (ctx.state === 'running') ctx.advance(frame);
      real += frame;
      vi.advanceTimersByTime(frame * 1000);
      const now = ctx.currentTime, running = ctx.state === 'running';
      const paused = (!!o.pause && c.position >= o.pause[0] && pausedFor < o.pause[1]) || !running;
      if (paused) pausedFor += frame;
      if (paused !== c.isPaused) paused ? c.pause() : c.resume(now);
      if (o.seek !== undefined && !seeked && c.position >= 30) {
        seeked = true;
        c.scrub(o.seek);
        clock.reset(); // (App.heldAt(null): plays on with no stale time from the hold)
        continue;
      }
      if (o.letGo !== undefined && released === null && c.position >= o.letGo) {
        released = real;
        c.release('look-away');
      }
      const before = c.position;
      c.step(clock.tick(real, now, running, paused), now);
      if (pictureCut === null && before < CUT && c.position >= CUT) pictureCut = now - (c.position - CUT);
    }
    return pictureCut;
  }

  /** The audio time a source falls silent: its cut (a ramp to silence), or its file's end. */
  const silentAt = (g: FakeParam) => g.events.filter((e) => e[0] === 'ramp' && e[1] <= SILENT + 1e-9).at(-1)?.[2] ?? Infinity;
  const endsAt = (r: ReturnType<typeof rig>, s: FakeSource) =>
    Math.min(silentAt(r.gains.get(s)!), s.startAt![0] + (s.buffer as { duration: number }).duration - s.startAt![1], s.stopAt ?? Infinity);

  const cases: [string, Drive][] = [
    ['a slow first frame (70 ms)', { first: 0.07 }],
    ['a first frame of 100 ms and a 1.5 s stall at 20 s', { first: 0.1, stall: [20, 1.5] }],
    ['a 1.5 s stall just before the cut', { stall: [32.5, 1.5] }],
    ['paused for 2 s at 33.55 s', { pause: [33.55, 2] }],
    ['paused for 5 s at 12 s', { pause: [12, 5] }],
    ['paused for 2 s at 33.0 s, opened on a 0.3 s frame', { pause: [33.0, 2], pauseFrame: 0.3 }],
    ['held by hand at 33.0 s and played on', { seek: 33.0 }],
    ['held by hand at 33.2 s and played on', { seek: 33.2 }],
    ['the sound stopped 5 s at 31 s (a call), the memory waiting for it', { suspend: [31, 5] }],
    ['the sound stopped 2 s at 34.2 s', { suspend: [34.2, 2] }],
    ['begun with its sound not yet running (2 s)', { startSuspended: 2 }],
    ['a 0.6 s frame at 34.1 s', { stall: [34.1, 0.6] }],
    ['a 0.35 s frame at 34.12 s', { stall: [34.12, 0.35] }],
  ];
  for (const latency of [0, 0.12, 0.32]) {
    for (const [what, o] of cases) {
      it(`the afternoon stops where the evening is full, on the picture's cut: ${what}${latency ? ', sound reaching the ear 0.12 s late' : ''}`, async () => {
        const r = rig(latency);
        await r.audio.prepare();
        const cut = drive(r, o);
        expect(cut).not.toBeNull();
        // Sent ahead of the picture by the sound's own way to the ear (less a frame and a half of
        // the picture's, at most 0.3 s), so the two are met there.
        const lead = latency ? Math.min(0.3, latency - 0.025) : 0;
        // (The sound stopping round the cut: what began before it, ahead of the picture by the
        // lead, is taken back and begins again with the picture, never overlapping itself.)
        const evening = r.by('evening').filter((e) => e.stopAt === null || e.stopAt > e.startAt![0]);
        const last = evening.at(-1)!;
        for (const e of evening.slice(0, -1)) expect(silentAt(r.gains.get(e)!)).toBeLessThanOrEqual(last.startAt![0] + 0.005);
        if (!o.suspend) expect(evening.length).toBe(1);
        const due = cut! - lead - 0.04;
        if (resumedAt > due) {
          // Its sound came back after the evening was due (sent ahead by the lead, the sound had
          // passed the cut when it stopped): nothing of the afternoon comes back, and the evening
          // joins as far into its take as the picture's clock says.
          for (const a of ['day', 'score'] as const) for (const x of r.by(a)) expect(silentAt(r.gains.get(x)!), a).toBeLessThanOrEqual(resumedAt + 0.05);
          expect(last.startAt![1] - 0.03).toBeCloseTo(last.startAt![0] - due, 3);
        } else {
          expect(Math.abs(last.startAt![0] - due)).toBeLessThan(0.002);
          for (const a of ['day', 'score'] as const) {
            const x = r.by(a).at(-1)!;
            expect(Math.abs(endsAt(r, x) - (cut! - lead)), a).toBeLessThan(0.002);
          }
        }
        // Cues marked at one position start together (one reading of the clock); and what was due
        // as it began is heard, however long its sound took to run.
        if (!o.seek && !o.pause && !o.suspend) expect(r.by('air')[0].startAt![0]).toBe(r.by('day')[0].startAt![0]);
        expect(r.by('air').length).toBeGreaterThan(0);
        // Named a second and a half after the cut, as the picture has it.
        const named = r.captions.find(([t]) => t === '[evening]');
        expect(named).toBeDefined();
        expect(Math.abs(named![1] - (CUT + 1.5))).toBeLessThan(1 / 60 + 1e-6);
      });
    }
  }

  it('a stall across the cut: the afternoon is cut on time (scheduled before it), the evening comes in on the first frame after, as far in as the picture is', async () => {
    const r = rig();
    await r.audio.prepare();
    const cut = drive(r, { stall: [33.2, 1.5] })!;
    const day = r.by('day').at(-1)!;
    expect(Math.abs(endsAt(r, day) - cut)).toBeLessThan(0.002);
    const [e] = r.by('evening');
    // Its file's place at its start is where the timeline has got to: offset, then the time since its marker.
    expect(e.startAt![1] - 0.03).toBeCloseTo(e.startAt![0] - (cut - 0.04), 6);
  });

  it('resumed just before the cut, the afternoon rises from where it was and is cut from there: no silence, no burst', async () => {
    for (const at of [33.45, 33.55, 33.9, 34.2]) {
      const r = rig();
      await r.audio.prepare();
      drive(r, { pause: [at, 2] });
      for (const a of ['day', 'score'] as const) {
        const srcs = r.by(a);
        const back = srcs.at(-1)!;
        if (srcs.length < 2) continue; // (too close to the cut to come back at all)
        const g = r.gains.get(back)!, from = back.startAt![0], to = endsAt(r, back);
        // Sampled as the context computes it (its events in time order): never a step.
        let prev = g.valueAt(from), worst = 0;
        for (let t = from; t <= to + 0.01; t += 0.001) {
          const v = g.valueAt(t);
          worst = Math.max(worst, Math.abs(v - prev));
          prev = v;
        }
        expect(worst, `${a}, resumed at ${at}`).toBeLessThan(level[a] * 0.03);
        expect(g.valueAt(to - 0.041), `${a}, resumed at ${at}`).toBeGreaterThan(0);
        // (The day's file runs past the cut, which silences it; the score's ends on it.)
        if (a === 'day') expect(g.valueAt(to + 0.001)).toBeLessThanOrEqual(SILENT + 1e-9);
      }
    }
  });

  it('let go in the instant before the cut (the evening already sent ahead by the lead), the evening goes at once, unseen', async () => {
    const r = rig(0.12);
    await r.audio.prepare();
    drive(r, { letGo: 34.42 });
    for (const e of r.by('evening')) expect(e.stopAt! - e.startAt![0], 'the evening').toBeLessThan(0.15);
  });

  it('back from a hidden tab, what faded for the pause is gone before its restart sounds', async () => {
    const r = rig();
    await r.audio.prepare();
    drive(r, { pause: [20, 3] });
    const [first, again] = r.by('day');
    expect(again).toBeDefined();
    // (Its fade had been cut short by the context suspending with it; it stops as the restart begins.)
    expect(first.stopAt!).toBeLessThanOrEqual(again.startAt![0] + 0.05);
  });

  it('let go in the last seconds, the afternoon fades out by the end of its files, never stopped part-way down', async () => {
    for (const at of [31.6, 33.07, 34.2]) {
      const r = rig();
      await r.audio.prepare();
      drive(r, { letGo: at });
      // The evening never sounds (one already scheduled is stopped before it begins).
      for (const e of r.by('evening')) expect(e.stopAt!, `let go at ${at}`).toBeLessThanOrEqual(e.startAt![0] + 1e-9);
      for (const a of ['day', 'score'] as const) {
        const s = r.by(a).at(-1)!;
        const end = s.startAt![0] + lengths[a] - s.startAt![1];
        const g = r.gains.get(s)!;
        // Faded to silence by the file's end (not stopped by it part-way down).
        expect(silentAt(g), `${a}, let go at ${at}`).toBeLessThanOrEqual(end + 1e-6);
        expect(g.valueAt(end - 1e-3), `${a}, let go at ${at}`).toBeLessThan(level[a] * 0.05);
        expect(s.stopAt!, `${a}, let go at ${at}`).toBeLessThanOrEqual(end + 0.021);
      }
    }
  });
});

describe('captions: each shown as its sound is heard, with the picture', () => {
  afterEach(() => vi.useRealTimers());
  // (QA, 2026-10-20: handed out 0.75 s ahead, a caption without its own moment came up that much
  // before its sound, in every memory.)
  for (const latency of [0, 0.12]) {
    it(`with its own moment or without, within a frame of the picture reaching it (output latency ${latency} s)`, async () => {
      vi.useFakeTimers();
      const sheet: CueSheet = {
        room: [0.4, 3, 0.06],
        cues: {
          'music:woods': { asset: 'woods', gainDb: -14, place: { u: 0, v: 0, d: 2 }, wide: true, dry: true, until: 34.5, fadeOut: 3, caption: '[cicadas in the trees; a piano]', captionAt: 9.85 },
          'sfx:mid': { asset: 'mid', gainDb: -20, place: { u: 0, v: 0, d: 1 }, caption: '[a floorboard, just outside]' },
          'sfx:cicada-last': { asset: 'last', gainDb: -41, place: { u: 0.2, v: 0.3, d: 6 }, lowpass: 5000, caption: '[an evening cicada, far off]' },
          'voice:line': { asset: 'line', gainDb: -12, place: { u: 0, v: 0, d: 1 }, text: 'Five more minutes.' },
        },
      };
      const markers: Marker[] = [
        { label: 'music:woods', position: 0.05 },
        { label: 'sfx:mid', position: 20.0 },
        { label: 'voice:line', position: 30.0 },
        { label: 'sfx:cicada-last', position: 48.5 },
      ];
      const lengths: Record<string, number> = { woods: 34.5, last: 4.5, mid: 2, line: 1.5 };
      const ctx = new FakeCtx();
      Object.assign(ctx, { baseLatency: latency ? 0.02 : 0, outputLatency: latency ? latency - 0.02 : 0 });
      const shown = new Map<string, number>();
      let c: MemoryPlaybackController | null = null;
      const host: MemoryAudioHost = {
        ctx: ctx as unknown as BaseAudioContext, out: new FakeNode(ctx) as unknown as AudioNode,
        load: async (asset) => ({ duration: lengths[asset] }) as AudioBuffer, impulse: () => ({}) as AudioBuffer,
        intensity: 1, where: () => [0, 0, 0], caption: (t) => void (shown.has(t) || shown.set(t, c!.position)),
      };
      const audio = new MemoryAudio(host, sheet, markers);
      const timeline: TimelineSource = { sections: { active: 6, exit: 42.5, residue: 49.5, end: 53 }, markers, at: () => ({}), dispose() {} };
      c = new MemoryPlaybackController({ timeline, audio, weights: FULL, reduced: false, entrance: 2, sways: [], exit: 3, maxHold: 60, tail: 2, living: true });
      await audio.prepare();
      const clock = new MemoryClock();
      ctx.currentTime = 100;
      let real = 1000;
      clock.prime(real, ctx.currentTime, true);
      c.start(ctx.currentTime);
      for (let i = 0; i < 20000 && c.state !== 'complete' && c.position < 50; i++) {
        const frame = 1 / 60;
        ctx.advance(frame);
        real += frame;
        vi.advanceTimersByTime(frame * 1000);
        c.step(clock.tick(real, ctx.currentTime, true, false), ctx.currentTime);
      }
      for (const [text, at] of [['[cicadas in the trees; a piano]', 9.9], ['[a floorboard, just outside]', 20.0], ['Five more minutes.', 30.0], ['[an evening cicada, far off]', 48.5]] as const) {
        expect(shown.get(text), text).toBeGreaterThan(at - 0.05);
        expect(shown.get(text), text).toBeLessThan(at + 0.05);
      }
    });
  }
});
