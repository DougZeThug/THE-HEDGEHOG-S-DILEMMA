import { describe, it, expect } from 'vitest';
import { MemoryAudio, type MemoryAudioHost } from '../src/memory/MemoryAudio';
import { MemoryClock } from '../src/memory/clock';
import { CueDispatch } from '../src/memory/cueDispatch';
import type { CueSheet } from '../src/memory/cueSheet';
import type { Marker } from '../src/memory/types';

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
  }
}

describe('memory audio: scheduled on the audio clock, never twice, nothing left behind', () => {
  it('schedules each event at its marker time, ahead of when it is handed out', async () => {
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
    expect(back[1].startAt![1]).toBeCloseTo(6, 6); // 15 − 9 s into the music
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
    expect(bedAgain.startAt![0]).toBeCloseTo(ctx.currentTime, 6);
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
      expect(evening[0].startAt![1]).toBeCloseTo(3, 6);
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
