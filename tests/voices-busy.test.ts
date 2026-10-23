import { describe, it, expect } from 'vitest';
import { Voices } from '../src/audio/Voices';

// The room's voices say when they will have finished, so that a memory can wait for them
// (App.playVignette): wordless ones too, a hum or a breath is as audible as a sentence.

describe('when the room is still sounding a voice', () => {
  const voices = () => {
    const v = new Voices({} as never);
    (v as unknown as { play_: () => Promise<{ duration: number }> }).play_ = async () => ({ duration: 6 });
    return v;
  };
  const place = { kind: 'beyond' } as never;

  it('a spoken line holds it', async () => {
    const v = voices();
    await v.playLine('whisper' as never, 'hello', place, 1);
    expect(v.busyUntil - performance.now() / 1000).toBeGreaterThan(5);
  });

  it('a wordless voice (a hum, a breath) holds it too', async () => {
    const v = voices();
    await v.playLine('hum' as never, null, place, 1);
    expect(v.busyUntil - performance.now() / 1000).toBeGreaterThan(5);
  });
});
