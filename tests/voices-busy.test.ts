import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Voices } from '../src/audio/Voices';
import type { AudioEngine } from '../src/audio/AudioEngine';

// The room's voices say when they will have finished, so that a memory can wait for them
// (App.playVignette): wordless ones too, a hum or a breath is as audible as a sentence.

/** An audio engine that accepts every Web Audio call and sounds nothing. */
const anything = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : anything()), apply: () => anything(), set: () => true });
const silentEngine = () => new Proxy({ intensity: 1, isMuted: true, vol: 0 } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : anything()) }) as unknown as AudioEngine;

describe('when the room is still sounding a voice', () => {
  const place = { kind: 'beyond' } as never;
  // A browser without speech synthesis.
  beforeEach(() => void vi.stubGlobal('window', {}));
  afterEach(() => void vi.unstubAllGlobals());
  const sounding = async (kind: 'whisper' | 'hum', text: string | null) => {
    const voices = new Voices(silentEngine());
    const before = performance.now() / 1000;
    const played = await voices.playLine(kind, text, place, 1);
    return { played, held: voices.busyUntil - before };
  };

  it('a spoken line holds it for as long as the line lasts', async () => {
    const { played, held } = await sounding('whisper', 'hello');
    expect(played.duration).toBeGreaterThan(0);
    expect(held).toBeGreaterThanOrEqual(played.duration);
  });

  it('a wordless voice (a hum, a breath) holds it too', async () => {
    const { played, held } = await sounding('hum', null);
    expect(played.duration).toBeGreaterThan(0);
    expect(held).toBeGreaterThanOrEqual(played.duration);
  });
});
