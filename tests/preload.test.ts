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
    const room = Object.entries(manifest).filter(([k]) => !k.startsWith('mem:') && !k.startsWith('vig:'));
    expect(new Set([...first, ...rest]).size).toBe(room.flatMap(([, f]) => f).length);
    for (const [k, files] of room) if (!k.startsWith('phrase:')) for (const f of files) expect(first).toContain(f);
    expect(bytes(first)).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
  it("a memory's sounds wait until the memory is prepared", () => {
    const { first, rest } = preloadStages({ ...manifest, 'mem:spoon-bowl': ['mem-spoon-bowl-1.mp3'] });
    expect([...first, ...rest]).not.toContain('mem-spoon-bowl-1.mp3');
    // A vignette's voices too: fetched when it is prepared, let go after.
    for (const [k, files] of Object.entries(manifest)) if (k.startsWith('vig:')) for (const f of files) expect([...first, ...rest]).not.toContain(f);
  });
  it('every line can be heard before the rest arrive', () => {
    const { first } = preloadStages(manifest);
    for (const [k, files] of Object.entries(manifest)) if (k.startsWith('phrase:')) expect(first).toContain(files[0]);
  });
});
