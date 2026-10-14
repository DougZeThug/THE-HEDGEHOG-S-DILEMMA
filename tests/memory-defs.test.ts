import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORIES, sheetId } from '../src/memory/defs';
import { memorySchema } from '../src/memory/sheets';
import { cueKind } from '../src/memory/cueSheet';
import state from '../src/memory/theatre-state.json';

const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8')) as Record<string, string[]>;

describe('the living memories, as defined and committed', () => {
  for (const def of Object.values(MEMORIES)) {
    it(`${def.id}: every authored prop exists, every layer has art, every sound marker has a cue`, () => {
      const schema = memorySchema(def.layers);
      const art = JSON.parse(readFileSync(join(ROOT, 'public/memories', def.art, 'manifest.json'), 'utf8'));
      for (const v of def.variants) {
        const seed = def.seed(v);
        for (const path of Object.keys(seed.tracks)) {
          const dot = path.lastIndexOf('.');
          expect(schema[path.slice(0, dot)]?.[path.slice(dot + 1)], path).toBeDefined();
        }
        // The art: the same layers, in the same order, at both sizes.
        expect(art.variants[v].map((l: { name: string }) => l.name)).toEqual(def.layers);
        for (const l of art.variants[v]) for (const s of ['', '@low']) expect(existsSync(join(ROOT, 'public/memories', def.art, `${l.file}${s}.webp`)), l.file).toBe(true);
        // Every sound marker on the timeline has a cue; every recorded cue exists.
        const cues = def.cues(v);
        for (const m of seed.markers) if (cueKind(m.label)) expect(cues.cues[m.label], m.label).toBeDefined();
        for (const c of Object.values(cues.cues)) if (!c.asset.startsWith('music/')) expect(manifest[c.asset]?.length, c.asset).toBeGreaterThan(0);
        // And the committed timeline has the sheet (production never plays the fallbacks).
        expect((state as { sheetsById: Record<string, unknown> }).sheetsById[sheetId(def.id, v)]).toBeDefined();
      }
    });
  }
});
