import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const designs = JSON.parse(readFileSync(join(ROOT, 'scripts/voice-designs.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/voice-design-ledger.json'), 'utf8'));

describe('new voices for auditioning', () => {
  it('every library voice says which voice it is, why it was chosen and what it is for', () => {
    for (const v of designs.library) {
      expect(v.voiceId, v.id).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(v.publicOwnerId, v.id).toMatch(/^[0-9a-f]{64}$/);
      expect(v.why.length, v.id).toBeGreaterThan(10);
      expect(v.for.length, v.id).toBeGreaterThan(3);
      // Childlike voices are labelled as performed or designed, never as real children.
      if (v.childlike) expect(v.why).toContain('not a real child');
    }
  });
  it('every sample and preview in the ledger is on disk, and none is in the room', () => {
    const manifest = readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8');
    const files = [...Object.values(ledger.library ?? {}).map((e: any) => e.file), ...Object.values(ledger.entries).flatMap((e: any) => e.previews.map((p: any) => p.file))];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(existsSync(join(ROOT, 'audition', f)), f).toBe(true);
      expect(manifest).not.toContain(f.split('/').pop());
    }
  });
});
