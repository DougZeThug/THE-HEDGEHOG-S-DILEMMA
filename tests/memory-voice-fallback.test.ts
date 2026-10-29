import { describe, it, expect } from 'vitest';
import { MemoryAudio, type MemoryAudioHost } from '../src/memory/MemoryAudio';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { withVoices } from '../src/content/memory-voices';
import { CEREAL } from '../src/memory/defs';
import { FULL } from '../src/memory/compose';
import type { TimelineSource } from '../src/memory/types';
import { FakeCtx, FakeNode } from './fakeAudio';

// The cereal memory, first sitting, with its (kept) voice version laid in — as runtime.prepare
// builds it. `filesOf` reports the kept files (so memoryVoices would approve the version for a
// visitor); whether each take actually decodes is what the host's `load` decides below.
const FILES: Record<string, string[]> = {
  'vig:cereal:my-bowl': ['vignettes/cereal--my-bowl-b.mp3'],
  'vig:cereal:clean-one': ['vignettes/cereal--clean-one.mp3'],
};
const SECTIONS = { active: 5.5, exit: 22, residue: 28, end: 32 };
// How long each asset's (fake) decoded buffer is, so the scheduled sources can be told apart.
const LEN: Record<string, number> = {
  'synth:air': 8, 'mem:eating': 3, 'mem:laugh': 3.05, 'mem:spoon-bowl': 1.5, 'music/memory-radio-folk-c.mp3': 19,
  'vig:cereal:my-bowl': 1.05, 'vig:cereal:clean-one': 1.25,
};

/** A fresh voiced cereal sheet + markers (a version of its own, never shared between runs:
 *  `dropFailedVoices` mutates the sheet it is given). */
function voicedSheet() {
  return withVoices(CEREAL.cues('first'), CEREAL.markers, 'cereal', 'first', 'default', (k) => FILES[k] ?? []);
}

/** A memory audio host whose `load` fails for `missing` assets (a transient 404 or decode error)
 *  and decodes the rest; `fallback` records what the stand-in whisper would have spoken. */
function hostWith(ctx: FakeCtx, missing: Set<string>, fallbacks: { text?: string }[]): MemoryAudioHost {
  return {
    ctx: ctx as unknown as BaseAudioContext,
    out: new FakeNode(ctx) as unknown as AudioNode,
    load: async (asset) => (missing.has(asset) ? null : ({ duration: LEN[asset] ?? 1 }) as AudioBuffer),
    impulse: () => ({}) as AudioBuffer,
    intensity: 1,
    where: (p) => ('at' in p ? [0, 0, 0] : [p.u, p.v, -p.d]),
    fallback: (cue) => fallbacks.push(cue),
  };
}

interface Run {
  fallbacks: { text?: string }[];
  ctx: FakeCtx;
  /** Whether the runtime would keep the version (`prepared.voices !== null`): false means the
   *  memory is laid down wordless (wordless hold, the Director told it is unvoiced). */
  voiced: boolean;
}

/**
 * Plays cereal forward as the App plays it. `fix` applies runtime.prepare's verify-before-attach
 * gate: a visitor's version with any take that failed to load is dropped wordless. `preview` is a
 * `?memory=` preview, where a line without a take is still heard as the stand-in whisper. `missing`
 * are assets whose fetch/decode fails — exactly what a transient 404 or decode error produces.
 */
async function run(opts: { fix: boolean; missing?: string[]; preview?: boolean }): Promise<Run> {
  const missing = new Set(opts.missing ?? []);
  const ctx = new FakeCtx();
  const fallbacks: { text?: string }[] = [];
  const sound = voicedSheet();
  const audio = new MemoryAudio(hostWith(ctx, missing, fallbacks), sound.sheet, sound.markers, 1);
  await audio.prepare();
  // runtime.prepare's gate: previews keep their unrecorded lines (the fallback speaks them); a
  // visitor's version is laid down wordless if any take failed to load.
  let voiced = true;
  if (opts.fix && !opts.preview && audio.dropFailedVoices()) voiced = false;
  // LivingMemory builds the timeline with the version's voice markers, unless voices was nulled.
  const timeline: TimelineSource = { sections: SECTIONS, markers: voiced ? sound.markers : CEREAL.markers, at: () => ({}), dispose() {} };
  const c = new MemoryPlaybackController({ timeline, audio, weights: FULL, reduced: false, entrance: 2, sways: [], exit: 2.4, maxHold: 22, tail: 3, living: false });
  ctx.currentTime = 100;
  c.start(ctx.currentTime);
  for (let i = 0; i < 1500 && c.state !== 'complete' && c.position < 12; i += 1) {
    const dt = 1 / 60;
    ctx.advance(dt);
    c.step(dt, ctx.currentTime);
  }
  return { fallbacks, ctx, voiced };
}

describe('a painted memory whose kept voice take fails to load', () => {
  it('before the fix, the stand-in whisper + caption reach an ordinary visitor (the bug)', async () => {
    const r = await run({ fix: false, missing: ['vig:cereal:my-bowl'] });
    // The missing line's stand-in is dispatched to the host, exactly as a preview would.
    expect(r.fallbacks.map((c) => c.text)).toEqual(["That's my bowl."]);
    // The line that did load plays as a recording (the version was not dropped).
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:clean-one'])).toBe(true);
    expect(r.voiced).toBe(true);
  });

  it('plays wordless to a visitor: no stand-in whisper, no caption, no voice source', async () => {
    const r = await run({ fix: true, missing: ['vig:cereal:my-bowl'] });
    expect(r.fallbacks).toHaveLength(0);
    // The whole version is wordless: neither line plays, not even the one that loaded.
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:my-bowl'])).toBe(false);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:clean-one'])).toBe(false);
    // The runtime lays it down without voices: wordless hold, and the Director hears it as wordless.
    expect(r.voiced).toBe(false);
  });

  it('drops the whole version when either line fails (one loaded, the other not, still wordless)', async () => {
    const r = await run({ fix: true, missing: ['vig:cereal:clean-one'] });
    expect(r.fallbacks).toHaveLength(0);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:my-bowl'])).toBe(false);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:clean-one'])).toBe(false);
    expect(r.voiced).toBe(false);
  });

  it('a version whose takes all loaded still plays, with no stand-in (no regression)', async () => {
    const r = await run({ fix: true });
    expect(r.fallbacks).toHaveLength(0);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:my-bowl'])).toBe(true);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:clean-one'])).toBe(true);
    expect(r.voiced).toBe(true);
  });

  it('a ?memory= preview keeps the stand-in for a line that did not load (previews only)', async () => {
    const r = await run({ fix: true, preview: true, missing: ['vig:cereal:my-bowl'] });
    expect(r.fallbacks.map((c) => c.text)).toEqual(["That's my bowl."]);
    // The line that did load still plays as a recording.
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['vig:cereal:clean-one'])).toBe(true);
    expect(r.voiced).toBe(true);
  });

  it("wordless still plays the memory's own sounds (no regression to the bed, radio, eating, laugh)", async () => {
    const r = await run({ fix: true, missing: ['vig:cereal:my-bowl'] });
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['synth:air'])).toBe(true);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['music/memory-radio-folk-c.mp3'])).toBe(true);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['mem:eating'])).toBe(true);
    expect(r.ctx.sources.some((s) => s.buffer?.duration === LEN['mem:laugh'])).toBe(true);
  });
});

describe('MemoryAudio.dropFailedVoices', () => {
  it('drops only the voice cues that did not decode, and reports whether any were dropped', async () => {
    const ctx = new FakeCtx();
    const sound = voicedSheet();
    const host: MemoryAudioHost = {
      ctx: ctx as unknown as BaseAudioContext, out: new FakeNode(ctx) as unknown as AudioNode,
      load: async (asset) => (asset === 'vig:cereal:my-bowl' ? null : ({ duration: LEN[asset] ?? 1 }) as AudioBuffer),
      impulse: () => ({}) as AudioBuffer, intensity: 1, where: () => [0, 0, 0],
    };
    const audio = new MemoryAudio(host, sound.sheet, sound.markers, 1);
    await audio.prepare();
    expect(audio.dropFailedVoices()).toBe(true);
    const markers = (audio as unknown as { markers: { label: string }[] }).markers;
    expect(markers.some((m) => m.label === 'voice:my-bowl@0')).toBe(false);
    expect(markers.some((m) => m.label === 'voice:clean-one@1')).toBe(true);
    // Calling again is idempotent: nothing more to drop.
    expect(audio.dropFailedVoices()).toBe(false);
  });

  it('drops nothing when every voice line decoded', async () => {
    const ctx = new FakeCtx();
    const sound = voicedSheet();
    const host: MemoryAudioHost = {
      ctx: ctx as unknown as BaseAudioContext, out: new FakeNode(ctx) as unknown as AudioNode,
      load: async (asset) => ({ duration: LEN[asset] ?? 1 }) as AudioBuffer,
      impulse: () => ({}) as AudioBuffer, intensity: 1, where: () => [0, 0, 0],
    };
    const audio = new MemoryAudio(host, sound.sheet, sound.markers, 1);
    await audio.prepare();
    expect(audio.dropFailedVoices()).toBe(false);
    const markers = (audio as unknown as { markers: { label: string }[] }).markers;
    expect(markers.some((m) => m.label === 'voice:my-bowl@0')).toBe(true);
    expect(markers.some((m) => m.label === 'voice:clean-one@1')).toBe(true);
  });

  it('leaves a non-voice cue that failed to decode where it is (voice-only, no fallback for the rest)', async () => {
    const ctx = new FakeCtx();
    const sound = voicedSheet();
    const host: MemoryAudioHost = {
      ctx: ctx as unknown as BaseAudioContext, out: new FakeNode(ctx) as unknown as AudioNode,
      load: async (asset) => (asset === 'mem:laugh' ? null : ({ duration: LEN[asset] ?? 1 }) as AudioBuffer),
      impulse: () => ({}) as AudioBuffer, intensity: 1, where: () => [0, 0, 0],
    };
    const audio = new MemoryAudio(host, sound.sheet, sound.markers, 1);
    await audio.prepare();
    // Both voice lines decoded; only the laugh (a non-voice) failed. dropFailedVoices is voice-only.
    expect(audio.dropFailedVoices()).toBe(false);
    const cues = (audio as unknown as { sheet: { cues: Record<string, unknown> } }).sheet.cues;
    expect(cues['sfx:laugh']).toBeDefined();
  });
});
