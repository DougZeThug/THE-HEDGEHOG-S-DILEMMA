import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { preloadStages } from '../src/audio/selection';

const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8')) as Record<string, string[]>;
const bytes = (files: string[]) => files.reduce((n, f) => n + statSync(join(ROOT, 'public/voices', f)).size, 0);

describe('loading on a phone', () => {
  it('fetches every sound, and one take of each line, on arrival', () => {
    const { first, rest } = preloadStages(manifest);
    expect(new Set([...first, ...rest]).size).toBe(Object.values(manifest).flat().length);
    for (const [k, files] of Object.entries(manifest)) if (!k.startsWith('phrase:')) for (const f of files) expect(first).toContain(f);
    expect(bytes(first)).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
  it('every line can be heard before the rest arrive', () => {
    const { first } = preloadStages(manifest);
    for (const [k, files] of Object.entries(manifest)) if (k.startsWith('phrase:')) expect(first).toContain(files[0]);
  });
});
