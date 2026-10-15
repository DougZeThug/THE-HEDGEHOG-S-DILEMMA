import { describe, it, expect, vi, afterEach } from 'vitest';
import { VignettePlayer, type VignetteHost } from '../src/memory/VignettePlayer';
import type { Effect, GapKind, VignetteDef } from '../src/content/vignettes';
import type { Cue } from '../src/memory/cueSheet';
import { FakeCtx, FakeNode } from './fakeAudio';

/** A small vignette: two people, a pause, one line cut off, a light, a deliberate silence. */
const DEF: VignetteDef = {
  id: 'test',
  title: 'Test',
  tone: 'sad',
  intent: 'A test.',
  speakers: { a: { voice: 'sarah', who: 'the writer' }, b: { voice: 'liam', who: 'someone' } },
  anchor: { phrase: 'ordinary' },
  earliest: 150,
  arm: 2.5,
  commit: 1,
  lookBack: true,
  room: [0.4, 2, 0.15],
  hush: 0.7,
  lines: [
    { id: 'ask', speaker: 'b', text: 'Have you seen my charger?' },
    { id: 'answer', speaker: 'a', text: 'By the toaster.' },
    { id: 'kind', speaker: 'a', text: "Hang on, I'll look." },
  ],
  variants: {
    first: {
      span: 14,
      events: [
        { at: 0.5, line: 'ask', place: { at: 'beyond' } },
        { at: 3, line: 'answer', place: { at: 'close' } },
        { at: 5, gap: 'pause', seconds: 1.5 },
        { at: 6.5, fx: { kind: 'dim', to: 0.9, seconds: 6 } },
        { at: 7, line: 'kind', place: { at: 'close' }, end: 'cut', stopAfter: 0.9 },
        { at: 8, gap: 'silence', seconds: 6 },
      ],
    },
    quiet: { span: 8, events: [{ at: 1, fx: { kind: 'dim', to: 0.5, seconds: 6 } }, { at: 2, gap: 'silence', seconds: 6 }] },
  },
  rules: [],
  describe: 'Someone looking for a charger.',
};

const LEN: Record<string, number> = { 'vig:test:ask': 1.8, 'vig:test:answer': 1.2, 'vig:test:kind': 1.6 };

function setup(missing: string[] = []) {
  const ctx = new FakeCtx();
  const bus = new FakeNode(ctx);
  const captions: [string, boolean, string | undefined][] = [];
  const fx: [Effect, number][] = [];
  const gaps: GapKind[] = [];
  const fallbacks: Cue[] = [];
  let letGo: string | null = null;
  const host: VignetteHost = {
    ctx: ctx as unknown as BaseAudioContext,
    out: bus as unknown as AudioNode,
    load: async (asset) => (missing.includes(asset) || !LEN[asset] ? null : ({ duration: LEN[asset] } as AudioBuffer)),
    impulse: () => ({}) as AudioBuffer,
    intensity: 1,
    where: () => [0, 1.5, 0],
    caption: (t, _s, speech, side) => captions.push([t, !!speech, side]),
    fallback: (cue) => fallbacks.push(cue),
    effect: (f, d) => fx.push([f, d]),
    gap: (g) => gaps.push(g),
    letGo: (m) => (letGo = m),
  };
  const baseline = ctx.nodes.size;
  return { ctx, host, captions, fx, gaps, fallbacks, baseline, letGo: () => letGo };
}

/** Run the player for `seconds` in steps of `dt`, the audio clock moving with it. */
function run(p: VignettePlayer, ctx: FakeCtx, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    p.step(dt);
    ctx.advance(dt);
  }
}

afterEach(() => vi.useRealTimers());

describe('a vignette, played', () => {
  it('says each line once, at its time on the audio clock, captioned as speech', async () => {
    const s = setup();
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 10);
    const starts = s.ctx.sources.map((x) => x.startAt![0]);
    expect(starts).toHaveLength(3);
    // Scheduled ahead, on the context's clock, where the score puts them (within a frame).
    expect(starts[0]).toBeCloseTo(0.5, 1);
    expect(starts[1]).toBeCloseTo(3, 1);
    expect(starts[2]).toBeCloseTo(7, 1);
    expect(s.captions.map((c) => c[0])).toEqual(['Have you seen my charger?', 'By the toaster.', "Hang on, I'll look—"]);
    expect(s.captions.every((c) => c[1])).toBe(true);
  });

  it('a line written to stop is cut where the score says', async () => {
    const s = setup();
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 9);
    const cut = s.ctx.sources[2];
    expect(cut.stopAt).toBeCloseTo(cut.startAt![0] + 0.9 + 0.02, 2);
  });

  it("hands the room its effects and gaps, each once, and tells a pause from a silence", async () => {
    const s = setup();
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 14);
    expect(s.fx.map(([f]) => f.kind)).toEqual(['dim']);
    expect(s.gaps).toEqual(['pause', 'silence']);
  });

  it('ends on its own after its span, counts as heard, and leaves nothing sounding or connected', async () => {
    vi.useFakeTimers();
    const s = setup();
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 17);
    expect(p.done).toBe(true);
    expect(p.seen).toBe(true);
    expect(p.releasedHow).toBe('natural');
    expect(p.audio.sounding).toBe(0);
    p.dispose(0);
    vi.advanceTimersByTime(2000);
    expect(s.ctx.nodes.size).toBe(s.baseline);
  });

  it('interrupted, the sentence being said is cut and nothing more begins', async () => {
    const s = setup();
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 3.3); // the answer has begun
    p.release('interrupt');
    expect(s.letGo()).toBe('interrupt');
    const answer = s.ctx.sources[1];
    expect(answer.stopAt).not.toBeNull();
    expect(answer.stopAt!).toBeLessThan(s.ctx.currentTime + 0.4);
    run(p, s.ctx, 6);
    expect(s.ctx.sources).toHaveLength(2);
    expect(p.done).toBe(true);
    expect(p.releasedHow).toBe('interrupt');
  });

  it('paused mid-sentence, it is said again from its start (once) when the room comes back', async () => {
    const s = setup();
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 3.4);
    p.pause();
    run(p, s.ctx, 5); // in settings: nothing moves
    expect(p.position).toBeCloseTo(3.4, 1);
    p.resume();
    run(p, s.ctx, 2);
    const answers = s.ctx.sources.filter((x) => x.buffer?.duration === 1.2);
    expect(answers).toHaveLength(2);
    expect(s.ctx.sources.filter((x) => x.buffer?.duration === 1.8)).toHaveLength(1);
  });

  it('a voice not recorded yet goes to the fallback (previews), with its words', async () => {
    const s = setup(['vig:test:answer']);
    const p = new VignettePlayer(DEF, 'first', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 5);
    expect(s.fallbacks.map((c) => c.text)).toEqual(['By the toaster.']);
    expect(s.ctx.sources).toHaveLength(1);
  });

  it('a version without voices plays with nothing recorded at all', async () => {
    const s = setup(Object.keys(LEN));
    const p = new VignettePlayer(DEF, 'quiet', s.host);
    await p.prepare();
    p.start();
    run(p, s.ctx, 10);
    expect(s.fx.map(([f]) => f.kind)).toEqual(['dim']);
    expect(s.fallbacks).toHaveLength(0);
    expect(p.done).toBe(true);
  });

  it('a hundred starts and stops leave nothing behind', async () => {
    vi.useFakeTimers();
    const s = setup();
    for (let i = 0; i < 100; i++) {
      const p = new VignettePlayer(DEF, 'first', s.host);
      await p.prepare();
      p.start();
      run(p, s.ctx, (i % 7) + 0.4, 0.1);
      p.release(i % 2 ? 'interrupt' : 'natural');
      run(p, s.ctx, 3, 0.1);
      p.dispose(0);
    }
    s.ctx.advance(30);
    vi.advanceTimersByTime(5000);
    expect(s.ctx.nodes.size).toBe(s.baseline);
  });
});
