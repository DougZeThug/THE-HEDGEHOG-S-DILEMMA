import { describe, it, expect } from 'vitest';
import { FakeCtx, FakeNode, FakeParam } from './fakeAudio';
import { AudioEngine } from '../src/audio/AudioEngine';
import { Music } from '../src/audio/Music';

// The room's shared signal chain (src/audio/AudioEngine.ts), on a fake context: what is connected
// to what, and what is scheduled.

// (The engine makes its context from the window's.)
(globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };

type Gains = Record<'duck' | 'memoryDuck' | 'memoryMusic' | 'musicReverb' | 'reverbIn', FakeNode & { gain: FakeParam }>;
const engine = () => {
  const a = new AudioEngine();
  const g = a as unknown as Gains;
  // (A new gain starts open, as a real one does.)
  for (const k of ['duck', 'memoryDuck', 'memoryMusic', 'musicReverb'] as const) g[k].gain.value = 1;
  return { a, g };
};

/** Every path from `from` to `to`, as the set of nodes on it. */
function paths(from: FakeNode, to: FakeNode): Set<FakeNode>[] {
  const out: Set<FakeNode>[] = [];
  const walk = (n: FakeNode, on: FakeNode[]) => {
    if (n === to) return void out.push(new Set(on));
    if (on.includes(n)) return;
    for (const m of n.out) walk(m, [...on, n]);
  };
  walk(from, []);
  return out;
}

const last = (p: FakeParam) => p.events[p.events.length - 1];

describe("the room's music stops under a memory, its reverb with it", () => {
  it('the music reaches the reverb only through a gate that a memory closes', () => {
    const { a, g } = engine();
    const music = new Music(a) as unknown as { out: FakeNode };
    const via = paths(music.out, g.reverbIn);
    expect(via.length).toBeGreaterThan(0);
    for (const p of via) expect(p.has(g.musicReverb)).toBe(true);
  });

  it("a memory closes the gate as it stops the dry music, and opens it again after; the room's own silences leave it be", () => {
    const { a, g } = engine();
    a.memoryHush(0.95, 2.5);
    expect(last(g.musicReverb.gain)).toEqual(last(g.memoryMusic.gain));
    expect(last(g.musicReverb.gain)[1]).toBe(0);
    for (const k of ['memoryMusic', 'musicReverb'] as const) g[k].gain.value = 0;
    a.memoryHush(0, 20);
    expect(g.musicReverb.gain.events.slice(-2)).toEqual(g.memoryMusic.gain.events.slice(-2));
    const before = g.musicReverb.gain.events.length;
    a.silence(0.9, 6);
    a.lift(2);
    expect(g.musicReverb.gain.events.length).toBe(before);
  });

  it('the hum comes back evenly in loudness over its seconds, not two thirds of it in the first', () => {
    const { a, g } = engine();
    // Deep inside the painting, then the painting goes back to the wall.
    g.memoryDuck.gain.value = 0.05;
    a.memoryHush(0.7, 4.5);
    const [set, rise] = g.memoryDuck.gain.events.slice(-2);
    expect(set).toEqual(['set', 0.05, 0]);
    expect(rise[0]).toBe('exp');
    expect(rise[1]).toBeCloseTo(0.3, 9);
    expect(rise[2]).toBe(4.5);
    // Going down it still falls at once (the hush engages under the painting's opening).
    a.memoryHush(0.95, 2.5);
    expect(last(g.memoryDuck.gain)[0]).toBe('target');
    // Given back after the memory: the hum evenly over its 20 s; the music's gates on the plain
    // curve (an even rise from silence could stall them).
    g.memoryDuck.gain.value = 0.3;
    for (const k of ['memoryMusic', 'musicReverb'] as const) g[k].gain.value = 0;
    a.memoryHush(0, 20);
    expect(g.memoryDuck.gain.events.slice(-2)).toEqual([['set', 0.3, 0], ['exp', 1, 20]]);
    for (const k of ['memoryMusic', 'musicReverb'] as const) expect(g[k].gain.events.slice(-2)).toEqual([['set', 0, 0], ['target', 1, 0]]);
  });

  it('the room given back twice (at the residue and at the end) rises once, not over again', () => {
    const { a, g } = engine();
    const ctx = a.ctx as unknown as FakeCtx;
    g.memoryDuck.gain.value = 0.3;
    a.memoryHush(0, 20);
    const n = g.memoryDuck.gain.events.length;
    ctx.currentTime = 4;
    a.memoryHush(0, 20);
    expect(g.memoryDuck.gain.events.length).toBe(n);
    // (Once it is there, asking again is harmless; another depth is heard at once.)
    ctx.currentTime = 25;
    g.memoryDuck.gain.value = 1;
    a.memoryHush(0, 20);
    a.memoryHush(0.7, 1.4);
    expect(last(g.memoryDuck.gain)).toEqual(['target', 0.30000000000000004, 25]);
  });
});

describe("the room's silences inside one another", () => {
  it('a deeper, shorter silence inside a longer one returns to the longer one, not to the full room (sound review, 2026-11-06)', () => {
    const { a, g } = engine();
    const ctx = a.ctx as unknown as FakeCtx;
    ctx.currentTime = 10;
    a.silence(0.4, 12);
    ctx.currentTime = 12;
    // A recoil: deep, fast, short.
    a.silence(0.62, 1.2, 0.07, 1.5);
    const ev = g.duck.gain.events.slice(-3);
    expect(ev[0][0]).toBe('target');
    expect(ev[0][1]).toBeCloseTo(0.38, 9);
    // Back to the first silence's depth when it ends, and up only when the first one would have.
    expect(ev[1][0]).toBe('target');
    expect(ev[1][1]).toBeCloseTo(0.6, 9);
    expect(ev[1][2]).toBeCloseTo(13.2, 9);
    expect(ev[2]).toEqual(['target', 1, 22]);
    // A third, deeper still, inside both: when it ends, back to the second; then the first; then the room.
    ctx.currentTime = 12.5;
    a.silence(0.8, 0.3, 0.07, 1);
    const three = g.duck.gain.events.slice(-4);
    expect(three[0][1]).toBeCloseTo(0.2, 9);
    expect([three[1][1], three[1][2]]).toEqual([expect.closeTo(0.38, 9), expect.closeTo(12.8, 9)]);
    expect([three[2][1], three[2][2]]).toEqual([expect.closeTo(0.6, 9), expect.closeTo(13.2, 9)]);
    expect(three[3]).toEqual(['target', 1, 22]);
    // Between the two ends, the longer silence still holds: a shallower one doesn't lift it.
    ctx.currentTime = 15;
    const n = g.duck.gain.events.length;
    a.silence(0.2, 3);
    expect(g.duck.gain.events.length).toBe(n);
  });
});
