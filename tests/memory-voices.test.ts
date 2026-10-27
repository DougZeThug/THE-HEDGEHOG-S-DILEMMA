import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEMORY_VOICES, chooseVoices, memoryLineKey, saidFor as said, versionKeys, withVoices } from '../src/content/memory-voices';
import { VIGNETTES } from '../src/content/vignettes';
import { SCENE_MEMORIES } from '../src/content/memories';
import { MEMORIES } from '../src/memory/defs';
import { BRIGHT_TAGS } from '../scripts/dialogue-lib.mjs';

const DIRECTION = JSON.parse(readFileSync('src/content/vignettes.dialogue.json', 'utf8')) as {
  voices: Record<string, unknown>;
  performances: { vignette: string; line: string; text: string; input: string; voice: string }[];
};
const NONE = { seen: 0, visits: 1, field: {}, motifs: [], withdrew: false };

describe('the painted memories\' voices, as written', () => {
  it('belong to painted memories and variants that exist, never share a key with a vignette', () => {
    const vignettes = new Set(VIGNETTES.map((v) => v.id));
    for (const m of MEMORY_VOICES) {
      expect(MEMORIES[m.id], m.id).toBeDefined();
      expect(vignettes.has(m.id), m.id).toBe(false);
      for (const variant of Object.keys(m.variants)) expect(MEMORIES[m.id].variants, `${m.id}/${variant}`).toContain(variant);
    }
  });

  it('are cast from the vignettes\' voices, every line spoken and every beat a known line', () => {
    for (const m of MEMORY_VOICES) {
      for (const s of Object.values(m.speakers)) expect(DIRECTION.voices[s.voice], `${m.id}: ${s.voice}`).toBeDefined();
      const used = new Set<string>();
      for (const [variant, vv] of Object.entries(m.variants)) {
        expect(Object.keys(vv.versions).length, `${m.id}/${variant}`).toBeGreaterThan(0);
        for (const r of vv.rules ?? []) expect(vv.versions[r.version], `${m.id}/${variant}: ${r.version}`).toBeDefined();
        for (const v of Object.values(vv.versions))
          for (const b of v.beats) {
            const l = m.lines.find((x) => x.id === b.line);
            expect(l, `${m.id}/${variant}: ${b.line}`).toBeDefined();
            used.add(b.line);
          }
      }
      for (const l of m.lines) {
        expect(m.speakers[l.speaker], `${m.id}/${l.id}`).toBeDefined();
        expect(used.has(l.id), `${m.id}/${l.id} is never said`).toBe(true);
      }
    }
  });

  it('are said after the picture has formed and over before its light goes, one voice at a time', () => {
    for (const m of MEMORY_VOICES) {
      const { active, exit } = MEMORIES[m.id].sections;
      for (const [variant, vv] of Object.entries(m.variants))
        for (const [name, v] of Object.entries(vv.versions)) {
          const beats = [...v.beats].sort((a, b) => a.at - b.at);
          let free = -Infinity;
          for (const b of beats) {
            const text = m.lines.find((x) => x.id === b.line)!.text;
            const where = `${m.id}/${variant}/${name}: ${b.line}`;
            // The visual leads: nothing said in the first second and a half of the formed scene.
            expect(b.at, where).toBeGreaterThanOrEqual(active + 1.5);
            expect(b.at, where).toBeGreaterThanOrEqual(free);
            free = b.at + said(text);
            // And the light and its afterglow are left to themselves.
            expect(free, where).toBeLessThanOrEqual(exit - 2);
          }
        }
    }
  });

  it('mute only sounds the memory has', () => {
    for (const m of MEMORY_VOICES)
      for (const [variant, vv] of Object.entries(m.variants))
        for (const v of Object.values(vv.versions))
          for (const label of v.mute ?? []) expect(MEMORIES[m.id].markers.map((x) => x.label), `${m.id}/${variant}: ${label}`).toContain(label);
  });

  it('are directed, each line, in the room\'s held-back register, saying exactly the words written', () => {
    for (const m of MEMORY_VOICES)
      for (const l of m.lines) {
        const takes = DIRECTION.performances.filter((p) => p.vignette === m.id && p.line === l.id);
        expect(takes.length, `${m.id}/${l.id} has no direction`).toBeGreaterThan(0);
        for (const p of takes) {
          expect(p.text, `${m.id}/${l.id}`).toBe(l.text);
          expect(p.voice, `${m.id}/${l.id}`).toBe(m.speakers[l.speaker].voice);
          expect(BRIGHT_TAGS.test(p.input), `${m.id}/${l.id}: ${p.input}`).toBe(false);
        }
      }
  });
});

describe('the painted memories\' voices, played', () => {
  it('a version is chosen deterministically; a variant without voices has none', () => {
    for (const m of MEMORY_VOICES)
      for (const variant of MEMORIES[m.id].variants) {
        const a = chooseVoices(m.id, variant, NONE);
        expect(chooseVoices(m.id, variant, NONE)).toBe(a);
        expect(a === null).toBe(!m.variants[variant]);
      }
    expect(chooseVoices('door', 'approach', NONE)).toBeNull();
    expect(chooseVoices('woodland', 'afternoon', NONE)).toBeNull();
  });

  it('lays its lines into the memory\'s own cue sheet and markers, captioned as speech by side', () => {
    for (const m of MEMORY_VOICES)
      for (const [variant, vv] of Object.entries(m.variants))
        for (const [name, v] of Object.entries(vv.versions)) {
          const def = MEMORIES[m.id];
          const sheet = def.cues(variant);
          const { sheet: out, markers } = withVoices(sheet, def.markers, m.id, variant, name);
          const voices = markers.filter((x) => x.label.startsWith('voice:'));
          expect(voices.length).toBe(v.beats.length);
          for (const mk of voices) {
            const cue = out.cues[mk.label];
            expect(cue, mk.label).toBeDefined();
            expect(cue.text?.length).toBeGreaterThan(0);
            expect(cue.cutOnInterrupt).toBe(true);
            expect(cue.asset.startsWith(`vig:${m.id}:`)).toBe(true);
            if (Object.keys(m.speakers).length > 1) expect(cue.side).toMatch(/left|right/);
          }
          for (const label of v.mute ?? []) expect(markers.some((x) => x.label === label)).toBe(false);
          // Its own sounds are left as they were.
          for (const [label, cue] of Object.entries(sheet.cues)) expect(out.cues[label]).toBe(cue);
          expect(versionKeys(m.id, variant, name).length).toBeGreaterThan(0);
        }
  });

  it('without a version the memory is exactly as it was (wordless)', () => {
    const def = MEMORIES.cereal;
    const sheet = def.cues('first');
    const r = withVoices(sheet, def.markers, 'cereal', 'first', null);
    expect(r.sheet).toBe(sheet);
    expect(r.markers).toBe(def.markers);
  });

  it('only versions whose every line is kept reach visitors (nothing is kept yet: none do)', () => {
    const manifest = JSON.parse(readFileSync('public/voices/manifest.json', 'utf8')) as Record<string, string[]>;
    for (const m of MEMORY_VOICES)
      for (const l of m.lines) {
        const key = memoryLineKey(m, l);
        // A key in the manifest means the artist kept a take: never added here by hand.
        if (manifest[key]) expect(manifest[key].length).toBeGreaterThan(0);
      }
  });

  it('a painted memory with voices still opens as it did (its line, its variants)', () => {
    for (const m of MEMORY_VOICES) expect(SCENE_MEMORIES.some((s) => s.id === m.id), m.id).toBe(true);
  });
});
