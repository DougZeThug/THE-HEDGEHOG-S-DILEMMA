import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/app/audioHost', () => ({
  memoryAudioHost: () => ({ where: () => [0, 0, 0] }),
  previewWhisper: vi.fn(),
}));

import { Vignettes } from '../src/app/vignettes';
import { flashHint } from '../src/app/presentation';
import { CLASS } from '../src/ui/dom';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', { search: '' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a vignette effect is delivered to the run that asked for it', () => {
  it('a replay of the same vignette inside the delay does not receive the first run\'s effect', () => {
    const dimmed: unknown[] = [];
    const first = { id: 'x' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = {
      vignette: null,
      time: 0,
      prefs: { intensity: 'full', reducedMotion: false },
      lighting: { dimToChair: (...a: unknown[]) => dimmed.push(a) },
      voices: { filesOf: () => [], voicedLevel: () => 1 },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vignettes = new Vignettes(ctx, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const host = (vignettes as any).vignetteHost(() => ctx.vignette?.player === first);
    ctx.vignette = { id: 'x', player: first, preview: false };
    host.effect({ kind: 'dim', to: 0.3, seconds: 2 }, 5);
    // The run ends and the same vignette plays again within the delay.
    ctx.vignette = { id: 'x', player: { id: 'x' }, preview: false };
    vi.advanceTimersByTime(6000);
    expect(dimmed).toHaveLength(0);
    // The run that asked for it still gets it.
    ctx.vignette = { id: 'x', player: first, preview: false };
    host.effect({ kind: 'dim', to: 0.3, seconds: 2 }, 1);
    vi.advanceTimersByTime(1100);
    expect(dimmed).toHaveLength(1);
  });
});

describe('flashHint', () => {
  const el = () => {
    const on = new Set<string>();
    return { textContent: '', classList: { add: (c: string) => on.add(c), remove: (c: string) => on.delete(c), contains: (c: string) => on.has(c) } } as unknown as HTMLElement;
  };
  const shown = (e: HTMLElement) => e.classList.contains(CLASS.on);

  it('a second flash is not cut short by the first one\'s timer', () => {
    const e = el();
    flashHint(e, 'one', 1000);
    vi.advanceTimersByTime(800);
    flashHint(e, 'two', 1000);
    vi.advanceTimersByTime(500); // 1300 ms after the first: its timer has passed
    expect(shown(e)).toBe(true);
    vi.advanceTimersByTime(600);
    expect(shown(e)).toBe(false);
  });
});
