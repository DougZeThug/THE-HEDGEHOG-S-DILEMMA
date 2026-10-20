import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { WOODLAND } from '../src/memory/defs';

afterEach(() => vi.unstubAllGlobals());

describe('a memory armed ahead', () => {
  it('fetches its recordings with its art, so beginning it waits on decoding only (QA, 2026-10-19: they had waited until it began)', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const file = `public/${url.replace(/^\.\//, '')}`;
      return existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 });
    });
    const { prefetch } = await import('../src/memory/runtime');
    for (const variant of WOODLAND.variants) {
      asked.length = 0;
      await prefetch('woodland', variant, { quality: 'high', screen: { width: 1280, height: 720 } });
      const recordings = Object.values(WOODLAND.cues(variant).cues).map((c) => c.asset).filter((a) => a.startsWith('music/'));
      expect(recordings.length, variant).toBeGreaterThan(0);
      // (Each once: a second arming finds it fetched.)
      for (const a of recordings) expect(asked.filter((u) => u === `./${a}`).length, `${variant}: ${a}`).toBeLessThanOrEqual(1);
      for (const a of recordings) expect(asked, `${variant}: ${a}`).toContain(`./${a}`);
    }
  });
});
