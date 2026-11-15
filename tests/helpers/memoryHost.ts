import type { MemoryAudioHost } from '../../src/memory/MemoryAudio';
import { FakeNode, type FakeCtx } from '../fakeAudio';

/**
 * The engine a memory's sound is played through, backed by a fake audio context: every recording
 * loads (with the length `lengths` gives it, 4 s if it does not say), nothing is captioned unless
 * asked, and anything else the host offers is passed in `over`.
 */
export function fakeHost<H extends MemoryAudioHost = MemoryAudioHost>(ctx: FakeCtx, lengths: Record<string, number> = {}, over: Partial<H> = {}): H {
  return {
    ctx: ctx as unknown as BaseAudioContext,
    out: new FakeNode(ctx) as unknown as AudioNode,
    load: async (asset: string) => ({ duration: lengths[asset] ?? 4 }) as AudioBuffer,
    impulse: () => ({}) as AudioBuffer,
    intensity: 1,
    where: () => [0, 0, 0],
    ...over,
  } as unknown as H;
}
