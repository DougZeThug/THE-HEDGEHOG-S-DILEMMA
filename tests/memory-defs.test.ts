import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORIES, sheetId } from '../src/memory/defs';
import { memorySchema } from '../src/memory/sheets';
import { cueKind } from '../src/memory/cueSheet';
import state from '../src/memory/theatre-state.json';
import { SYNTH_KINDS } from '../src/memory/synthSounds';
import { WOODS_KINDS } from '../src/memory/synthWoods';

const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8')) as Record<string, string[]>;

describe('the living memories, as defined and committed', () => {
  // What plays (the committed timeline), as [start, end, ease] of a window track's first segment.
  type Key = { position: number; handles: number[] };
  const committed = (id: string, prop: string) => {
    const sheet = (state as unknown as { sheetsById: Record<string, { sequence: { tracksByObject: Record<string, { trackData: Record<string, { keyframes: Key[] }>; trackIdByPropPath: Record<string, string> }> } }> }).sheetsById[id];
    const o = sheet.sequence.tracksByObject.window;
    const [a, b] = o.trackData[o.trackIdByPropPath[`["${prop}"]`]].keyframes;
    // (A straight segment leaves its key with the handle (1/3, 1/3).)
    return [a.position, b.position, Math.abs(a.handles[3] - 1 / 3) < 1e-6 ? 'linear' : 'soft'];
  };
  // A script's own copy of the clocks, so running it again keeps them.
  const scriptClock = (file: string, name: string) => {
    const py = readFileSync(join(ROOT, file), 'utf8');
    const [, a, b, ease] = py.match(new RegExp(`^${name} = \\(([\\d.]+), ([\\d.]+), '(\\w+)'\\)`, 'm'))!;
    return [Number(a), Number(b), ease];
  };
  for (const [id, art, variant, script] of [
    ['woodland-afternoon', 'woodland', 'afternoon', 'scripts/stroke-order.py'],
  ]) {
    it(`${id}: the order map's two clocks were timed on the timeline that plays`, () => {
      // What the baked map was timed on (the script writes it to the manifest).
      const manifest = JSON.parse(readFileSync(join(ROOT, `public/memories/${art}/manifest.json`), 'utf8'));
      const clocks = manifest.living[variant].orderClocks as { drawn: unknown[]; coloured: unknown[] };
      expect(clocks.drawn).toEqual(committed(id, 'sketch'));
      expect(clocks.coloured).toEqual(committed(id, 'reveal'));
      expect(scriptClock(script, 'DRAWN')).toEqual(committed(id, 'sketch'));
      expect(scriptClock(script, 'COLOURED')).toEqual(committed(id, 'reveal'));
    });
  }
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
        for (const l of art.variants[v]) for (const s of ['', '@low']) expect(existsSync(join(ROOT, 'public/memories', def.art, `${l.file}${s}.webp`)), l.file).toBe(true);
        // Every sound marker on the timeline has a cue; every recorded cue exists.
        const cues = def.cues(v);
        for (const m of seed.markers) if (cueKind(m.label)) expect(cues.cues[m.label], m.label).toBeDefined();
        for (const c of Object.values(cues.cues))
          if (c.asset.startsWith('synth:')) expect(['air', ...SYNTH_KINDS, ...WOODS_KINDS], c.asset).toContain(c.asset.slice(6)); // made in the engine
          else if (c.asset.startsWith('music/')) expect(existsSync(join(ROOT, 'public', c.asset)), c.asset).toBe(true);
          else expect(manifest[c.asset]?.length, c.asset).toBeGreaterThan(0);
        // A living variant: every file its scene draws, at the sizes it loads.
        const lm = art.living?.[v];
        if (def.living && lm?.kind === 'film') {
          // A film (src/memory/living/FilmScene.ts): both kinds at both sizes, its order map; and
          // the timeline never asks for a frame it doesn't have.
          for (const s of ['', '@low']) for (const ext of ['webm', 'mp4']) expect(existsSync(join(ROOT, 'public/memories', def.art, `${lm.film}${s}.${ext}`)), `${lm.film}${s}.${ext}`).toBe(true);
          if (lm.order) expect(existsSync(join(ROOT, 'public/memories', def.art, `${lm.order}.webp`)), lm.order).toBe(true);
          for (const [t, f] of (seed.tracks['scene.film'] ?? []) as [number, number][]) expect(f * lm.fps, `scene.film at ${t}`).toBeLessThanOrEqual(lm.frames);
        } else if (def.living && lm) {
          const files: [string, string[]][] = [[lm.plate, ['', '@low']], [lm.maps, ['']]];
          if (lm.grade) files.push([lm.grade, ['']]);
          if (lm.sky) files.push([lm.sky.file, ['']]);
          if (lm.figures) for (const f of [lm.figures.file, lm.figures.lids]) files.push([f, ['', '@low']]);
          if (lm.after) files.push([lm.after, ['', '@low']]);
          if (lm.flowers) files.push([lm.flowers.file, ['', '@low']]);
          if (lm.clouds) for (const f of [lm.clouds.mask, lm.clouds.file, lm.clouds.after]) files.push([f, ['']]);
          if (lm.order) files.push([lm.order, ['']]);
          // The two-shot and her look (scripts/two-shot.py): every file of it, at the sizes it
          // loads; the timeline asks for it only if it is there, and for her head's drawings only
          // as many as there are.
          const near = lm.near as { file: string; lids: string; maps: string; heads: { file: string; cells: number }; ground: { file: string } } | undefined;
          if (near) {
            for (const f of [near.file, near.lids, near.heads.file, lm.figures.heads.file]) files.push([f, ['', '@low']]);
            for (const f of [near.ground.file, near.maps]) files.push([f, ['']]);
          }
          for (const [t, shot] of (seed.tracks['scene.shot'] ?? []) as [number, number][]) expect(shot, `scene.shot at ${t}`).toBeLessThanOrEqual(near ? 1 : 0);
          // (Her turn shows whichever of her drawings is nearest, so any of it needs her drawing.)
          for (const [t, f] of (seed.tracks['figure:b.turn'] ?? []) as [number, number][]) expect(f, `figure:b.turn at ${t}`).toBeLessThanOrEqual(near && near.heads.cells >= 2 ? 1 : 0);
          for (const [f, sizes] of files) for (const s of sizes) expect(existsSync(join(ROOT, 'public/memories', def.art, `${f}${s}.webp`)), f + s).toBe(true);
        }
        // And the committed timeline has the sheet (production never plays the fallbacks).
        expect((state as { sheetsById: Record<string, unknown> }).sheetsById[sheetId(def.id, v)]).toBeDefined();
      }
    });
  }
});

describe("the woodland's line where the painting was (decisions 119–123)", () => {
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

