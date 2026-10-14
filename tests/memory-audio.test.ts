import { describe, it, expect } from 'vitest';
import { MemoryAudio, type MemoryAudioHost } from '../src/memory/MemoryAudio';
import { MemoryClock } from '../src/memory/clock';
import { CueDispatch } from '../src/memory/cueDispatch';
import type { CueSheet } from '../src/memory/cueSheet';
import type { Marker } from '../src/memory/types';

/** Just enough of Web Audio to see what is scheduled, when, and what is left connected. */
class FakeParam {
  value = 0;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    this.value = v;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['ramp', v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
  }
  setTargetAtTime(v: number, t: number) {
    this.events.push(['target', v, t]);
  }
  cancelScheduledValues() {}
}
class FakeNode {
  out = new Set<FakeNode>();
  constructor(public ctx: FakeCtx) {
    ctx.nodes.add(this);
  }
  connect(n: FakeNode) {
    this.out.add(n);
    return n;
  }
  disconnect() {
    this.out.clear();
    this.ctx.nodes.delete(this);
  }
}
class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startAt: [number, number] | null = null;
  stopAt: number | null = null;
  onended: (() => void) | null = null;
  start(t: number, offset: number) {
    this.startAt = [t, offset];
    this.ctx.sources.push(this);
  }
  stop(t = this.ctx.currentTime) {
    this.stopAt = t;
  }
}
class FakeCtx {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  nodes = new Set<FakeNode>();
  sources: FakeSource[] = [];
  createBufferSource() {
    return new FakeSource(this);
  }
  createGain() {
    return Object.assign(new FakeNode(this), { gain: new FakeParam() });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(this), { type: '', Q: new FakeParam(), frequency: new FakeParam() });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(this), { pan: new FakeParam() });
  }
  createPanner() {
    return Object.assign(new FakeNode(this), { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam() });
  }
  createConvolver() {
    return Object.assign(new FakeNode(this), { buffer: null });
  }
  /** Advance the clock, ending every source whose stop time (or natural end) has passed. */
  advance(dt: number) {
    this.currentTime += dt;
    for (const s of this.sources) {
      const end = s.stopAt ?? (s.loop ? Infinity : s.startAt![0] + s.buffer!.duration - s.startAt![1]);
      if (s.onended && end <= this.currentTime) s.onended();
    }
  }
}

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
    where: (p) => [p.u, p.v, -p.d],
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

describe('the memory clock', () => {
  it('follows the audio clock while it runs, real time while suspended, nothing while paused', () => {
    const c = new MemoryClock();
    expect(c.tick(10, 100, true)).toBe(0);
    expect(c.tick(10.25, 100.05, true)).toBeCloseTo(0.05, 9); // a slow frame doesn't speed the memory
    expect(c.tick(10.5, 100.05, false)).toBeCloseTo(0.25, 9);
    expect(c.tick(10.6, 100.05, false, true)).toBe(0);
    expect(c.tick(14, 100.05, false)).toBe(1); // a long stall becomes a jump, capped
  });
});
