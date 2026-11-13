import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORIES, defineMemory, filmSpecOf, memoryEntry } from '../src/memory/registry';
import { sheetId } from '../src/memory/memoryDef';
import { memorySchema } from '../src/memory/sheets';
import { cueKind } from '../src/memory/cueSheet';
import state from '../src/memory/theatre-state.json';
import { SYNTH_KINDS } from '../src/memory/synthSounds';
import { WOODS_KINDS } from '../src/memory/synthWoods';

const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8')) as Record<string, string[]>;

describe('the living memories, as defined and committed', () => {
  it('the registry knows every memory by id, and an unknown id is an error', () => {
    for (const id of Object.keys(MEMORIES)) expect(memoryEntry(id).def.id).toBe(id);
    expect(() => memoryEntry('nope')).toThrow(/No memory/);
    expect(() => filmSpecOf('cereal')).toThrow(/no film spec/);
    // A living memory must say how its picture sits; a plain one must not pretend to.
    expect(() => defineMemory({ def: { ...MEMORIES.drive } })).toThrow(/no film or rig/);
    expect(() => defineMemory({ def: MEMORIES.cereal, film: filmSpecOf('drive') })).toThrow(/not living/);
  });
  for (const def of Object.values(MEMORIES)) {
    it(`${def.id}: every authored prop exists, every layer has art, every sound marker has a cue`, () => {
      const schema = memorySchema(def.layers, def.living);
      const art = JSON.parse(readFileSync(join(ROOT, 'public/memories', def.art, 'manifest.json'), 'utf8'));
      for (const v of def.variants) {
        const seed = def.seed(v);
        for (const path of Object.keys(seed.tracks)) {
          const dot = path.lastIndexOf('.');
          expect(schema[path.slice(0, dot)]?.[path.slice(dot + 1)], path).toBeDefined();
        }
        // The art: the same layers, in the same order, at both sizes.
        expect(art.variants[v].map((l: { name: string }) => l.name)).toEqual(def.layers);
                // Every sound marker on the timeline has a cue; every recorded cue exists.
        const cues = def.cues(v);
        for (const m of seed.markers) if (cueKind(m.label)) expect(cues.cues[m.label], m.label).toBeDefined();
        for (const c of Object.values(cues.cues))
          if (c.asset.startsWith('synth:')) expect(['air', ...SYNTH_KINDS, ...WOODS_KINDS], c.asset).toContain(c.asset.slice(6)); // made in the engine
          else if (!c.asset.startsWith('music/')) expect(manifest[c.asset]?.length, c.asset).toBeGreaterThan(0);
        // A living variant: the timeline never asks for what the picture doesn't have (its files: scripts/check-assets.mjs).
        const lm = art.living?.[v];
        if (def.living && lm?.kind === 'film') {
          for (const [t, f] of (seed.tracks['scene.film'] ?? []) as [number, number][]) expect(f * lm.fps, `scene.film at ${t}`).toBeLessThanOrEqual(lm.frames);
        } else if (def.living && lm) {
          const near = lm.near as { file: string; lids: string; maps: string; heads: { file: string; cells: number }; ground: { file: string } } | undefined;
          for (const [t, shot] of (seed.tracks['scene.shot'] ?? []) as [number, number][]) expect(shot, `scene.shot at ${t}`).toBeLessThanOrEqual(near ? 1 : 0);
          // (Her turn shows whichever of her drawings is nearest, so any of it needs her drawing.)
          for (const [t, f] of (seed.tracks['figure:b.turn'] ?? []) as [number, number][]) expect(f, `figure:b.turn at ${t}`).toBeLessThanOrEqual(near && near.heads.cells >= 2 ? 1 : 0);
        }
        // And the committed timeline has the sheet (production never plays the fallbacks).
        expect((state as { sheetsById: Record<string, unknown> }).sheetsById[sheetId(def.id, v)]).toBeDefined();
      }
    });
  }
});

describe("the woodland's line where the painting was", () => {
  it('only after its afternoon, once the room’s writing is back, before the memory ends', () => {
    const def = MEMORIES.woodland;
    expect(def.coda?.variant).toBe('afternoon');
    const sketch = def.seed('afternoon').tracks['window.sketch'] as [number, number][];
    // (The pencil has sunk and the room's writing is back a second before it is written.)
    expect(sketch[sketch.length - 1][1]).toBe(0);
    expect(def.coda!.at).toBeGreaterThanOrEqual(sketch[sketch.length - 1][0] + 1);
    expect(def.coda!.at).toBeLessThan(def.sections.end);
    for (const m of Object.values(MEMORIES)) if (m.id !== 'woodland') expect(m.coda, m.id).toBeUndefined();
  });
});

