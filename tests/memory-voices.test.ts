import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEMORY_VOICES, chooseVoices, memoryLineKey, versionKeys, voicesId, withVoices } from '../src/content/memory-voices';
import { MemoryDirector, type SceneState } from '../src/state/MemoryDirector';
import { MemoryAudio, type MemoryAudioHost } from '../src/memory/MemoryAudio';
import { MemoryPlaybackController } from '../src/memory/MemoryPlaybackController';
import { FULL } from '../src/memory/compose';
import type { CueSheet } from '../src/memory/cueSheet';
import type { Marker, TimelineSource } from '../src/memory/types';
import { FakeCtx, FakeNode, FakeSource } from './fakeAudio';
import { VIGNETTES } from '../src/content/vignettes';
import { SCENE_MEMORIES } from '../src/content/memories';
import { MEMORIES } from '../src/memory/defs';
import { BRIGHT_TAGS } from '../scripts/dialogue-lib.mjs';

const DIRECTION = JSON.parse(readFileSync('src/content/vignettes.dialogue.json', 'utf8')) as {
  voices: Record<string, unknown>;
  performances: { vignette: string; line: string; text: string; input: string; voice: string }[];
};
const MANIFEST = JSON.parse(readFileSync('public/voices/manifest.json', 'utf8')) as Record<string, string[]>;
const TIMINGS = JSON.parse(readFileSync('src/content/voice-timings.json', 'utf8')) as Record<string, { chars: [number, number][] }>;
/**
 * How long a line is said (s): its kept takes' measured speech, the longest of them, once there are
 * any; until then a typical reading (kept short takes: about 1.1 s for three words, 1.6 for four;
 * the skeptic's measure, 2026-10-27). The audition decides the real gaps.
 */
const said = (key: string, text: string) => {
  const ends = (MANIFEST[key] ?? []).map((f) => TIMINGS[f]?.chars.at(-1)?.[1]).filter((x): x is number => x !== undefined);
  return ends.length ? Math.max(...ends) : 0.2 + 0.3 * text.split(/\s+/).length;
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
            const line = m.lines.find((x) => x.id === b.line)!;
            const where = `${m.id}/${variant}/${name}: ${b.line}`;
            // The visual leads: nothing said in the first second and a half of the formed scene.
            expect(b.at, where).toBeGreaterThanOrEqual(active + 1.5);
            expect(b.at, where).toBeGreaterThanOrEqual(free);
            free = b.at + said(memoryLineKey(m, line), line.text);
            // And the light and its afterglow are left to themselves.
            expect(free, where).toBeLessThanOrEqual(exit - 2);
            for (const [from, to] of vv.quiet ?? []) expect(free <= from || b.at >= to, `${where} speaks in ${from}–${to}`).toBe(true);
          }
        }
    }
  });

  it('mute and re-level only sounds the memory has', () => {
    for (const m of MEMORY_VOICES)
      for (const [variant, vv] of Object.entries(m.variants))
        for (const v of Object.values(vv.versions)) {
          for (const label of v.mute ?? []) expect(MEMORIES[m.id].markers.map((x) => x.label), `${m.id}/${variant}: ${label}`).toContain(label);
          for (const label of Object.keys(v.gains ?? {})) expect(MEMORIES[m.id].cues(variant).cues[label], `${m.id}/${variant}: ${label}`).toBeDefined();
        }
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
          // Its own sounds are left as they were (but for a level the version sets).
          for (const [label, cue] of Object.entries(sheet.cues))
            if (v.gains?.[label] === undefined) expect(out.cues[label]).toBe(cue);
            else expect(out.cues[label]).toEqual({ ...cue, gainDb: v.gains[label] });
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

  it('the Director counts a version as speaking only once the App says every line of it is kept', () => {
    const begin = (available: Set<string> | null) => {
      const m = new MemoryDirector();
      m.setAvailable(available);
      const base = (o: Partial<SceneState>): SceneState => ({ now: 30, visible: (id) => id === 'cereal', gazeId: null, gazeFor: 0, free: true, otherMemory: false, departing: false, ...o });
      m.tapped('cereal');
      const st = m.update(base({ now: 32.1 }));
      return st ? { start: st, active: m.active } : null;
    };
    // Nothing kept (or nothing said): wordless, to the Director as to the App.
    for (const r of [begin(new Set()), begin(null)]) {
      expect(r?.start.id).toBe('cereal');
      expect(r?.start.voices).toBeUndefined();
      expect(r?.active?.voiced).toBeFalsy();
    }
    const kept = begin(new Set([voicesId('cereal', 'first', 'default')]));
    expect(kept?.start.voices).toBe('default');
    expect(kept?.active?.voiced).toBe(true);
  });

  it('a painted memory with voices still opens as it did (its line, its variants)', () => {
    for (const m of MEMORY_VOICES) expect(SCENE_MEMORIES.some((s) => s.id === m.id), m.id).toBe(true);
  });
});

describe('the painted memories\' voices, interrupted', () => {
  // Two lines and the laugh after them, as cereal's (durations tell the sources apart).
  const sheet: CueSheet = {
    room: [0.5, 3, 0.18],
    cues: {
      'music:radio': { asset: 'radio', gainDb: -18, place: { u: 0.4, v: 0, d: 0.8 }, fadeIn: 1.5, fadeOut: 4 },
      'sfx:eating': { asset: 'eating', gainDb: 0, place: { u: 0, v: -0.25, d: 0.5 } },
      'voice:my-bowl@0': { asset: 'a', gainDb: -3, place: { u: -0.08, v: -0.15, d: 0.8 }, text: "That's my bowl.", side: 'left', cutOnInterrupt: true },
      'voice:clean-one@1': { asset: 'b', gainDb: -3, place: { u: 0.13, v: -0.15, d: 0.8 }, text: "It's the clean one.", side: 'right', cutOnInterrupt: true },
      'sfx:laugh': { asset: 'laugh', gainDb: -12, place: { u: 0.02, v: -0.15, d: 0.9 } },
    },
  };
  const markers: Marker[] = [
    { label: 'music:radio', position: 5.5 },
    { label: 'sfx:eating', position: 7.3 },
    { label: 'voice:my-bowl@0', position: 7.4 },
    { label: 'voice:clean-one@1', position: 8.8 },
    { label: 'sfx:laugh', position: 10.5 },
  ];
  const lengths: Record<string, number> = { radio: 19, eating: 3, a: 1.05, b: 1.25, laugh: 3.05 };

  /** Played a frame at a time; paused at `pause[0]` for `pause[1]` s, or let go there. */
  async function play(o: { pause?: [number, number]; release?: [number, 'look-away' | 'switch'] }) {
    const ctx = new FakeCtx();
    const host: MemoryAudioHost = {
      ctx: ctx as unknown as BaseAudioContext, out: new FakeNode(ctx) as unknown as AudioNode,
      load: async (asset) => ({ duration: lengths[asset] }) as AudioBuffer, impulse: () => ({}) as AudioBuffer,
      intensity: 1, where: () => [0, 0, 0],
    };
    const audio = new MemoryAudio(host, sheet, markers);
    const timeline: TimelineSource = { sections: { active: 5.5, exit: 22, residue: 28, end: 32 }, markers, at: () => ({}), dispose() {} };
    const c = new MemoryPlaybackController({ timeline, audio, weights: FULL, reduced: false, entrance: 2, sways: [], exit: 2.4, maxHold: 22, tail: 3, living: false });
    await audio.prepare();
    ctx.currentTime = 100;
    c.start(ctx.currentTime);
    let pausedFor = -1, released = false;
    for (let i = 0; i < 2400 && c.state !== 'complete'; i++) {
      const dt = 1 / 60;
      ctx.advance(dt);
      if (o.pause && pausedFor < 0 && c.position >= o.pause[0]) {
        c.pause();
        pausedFor = 0;
      }
      if (pausedFor >= 0 && pausedFor < o.pause![1]) {
        pausedFor += dt;
        if (pausedFor >= o.pause![1]) c.resume(ctx.currentTime);
        continue;
      }
      if (o.release && !released && c.position >= o.release[0]) {
        c.release(o.release[1]);
        released = true;
      }
      c.step(dt, ctx.currentTime);
    }
    const of = (a: string) => ctx.sources.filter((x) => (x.buffer as { duration: number } | null)?.duration === lengths[a]) as FakeSource[];
    return { of };
  }

  it('paused mid-sentence, the sentence is said again from its start, and nothing already heard is', async () => {
    const { of } = await play({ pause: [7.9, 3] });
    const a = of('a'), b = of('b');
    expect(a.length).toBe(2);
    expect(a[0].stopAt).not.toBeNull();
    expect(b.length).toBe(1);
    expect(of('eating').length).toBe(1);
    expect(of('laugh').length).toBe(1);
    // The answer still comes after the question, said whole.
    expect(b[0].startAt![0]).toBeGreaterThanOrEqual(a[1].startAt![0] + lengths.a - 0.05);
  });

  it('looked away from mid-sentence, the sentence is finished and nothing more is said', async () => {
    const { of } = await play({ release: [7.9, 'look-away'] });
    const [a] = of('a');
    expect(a.stopAt === null || a.stopAt >= a.startAt![0] + lengths.a - 0.01).toBe(true);
    expect(of('b').length).toBe(0);
  });

  it('a hard release (another memory, leaving) cuts it', async () => {
    const { of } = await play({ release: [7.9, 'switch'] });
    const [a] = of('a');
    expect(a.stopAt).not.toBeNull();
    expect(a.stopAt!).toBeLessThan(a.startAt![0] + lengths.a - 0.1);
    expect(of('b').length).toBe(0);
  });
});
