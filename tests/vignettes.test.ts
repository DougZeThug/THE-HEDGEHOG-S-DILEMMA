import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VIGNETTES, chooseVariant, scoreMarkers, spokenLines, toCueSheet, vignetteKeys, lineKey, type VignetteDef } from '../src/content/vignettes';
import { SCENE_MEMORIES, VIGNETTE_MEMORIES } from '../src/content/memories';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { MemoryDirector, VIGNETTE_APART, type SceneState } from '../src/state/MemoryDirector';
import { Director } from '../src/state/Director';
import { SYNTH_KINDS, render } from '../src/memory/synthSounds';

const DIRECTION = JSON.parse(readFileSync('src/content/dialogue.json', 'utf8')) as { voices: Record<string, unknown> };
const DESIGNS = JSON.parse(readFileSync('scripts/voice-designs.json', 'utf8')) as { designs: { id: string }[] };
const CAST = new Set([...Object.keys(DIRECTION.voices), ...DESIGNS.designs.map((d) => d.id)]);
const MANIFEST = JSON.parse(readFileSync('public/voices/manifest.json', 'utf8')) as Record<string, string[]>;

describe('the vignettes, as written', () => {
  it('each is whole: its lines cast, its scores speaking only its own lines, its places known', () => {
    const ids = new Set<string>();
    for (const v of VIGNETTES) {
      expect(ids.has(v.id), v.id).toBe(false);
      ids.add(v.id);
      expect(v.variants.first, v.id).toBeDefined();
      for (const s of Object.values(v.speakers)) expect(CAST.has(s.voice), `${v.id}: ${s.voice}`).toBe(true);
      for (const l of v.lines) {
        expect(v.speakers[l.speaker], `${v.id}/${l.id}`).toBeDefined();
        expect(l.text.trim().length).toBeGreaterThan(0);
        if (l.phraseId) expect(PHRASE_BY_ID.get(l.phraseId)?.text).toBe(l.text);
      }
      for (const [name, s] of Object.entries(v.variants))
        for (const e of s.events) {
          if ('line' in e) expect(v.lines.some((l) => l.id === e.line), `${v.id}/${name}: ${e.line}`).toBe(true);
          expect(e.at, `${v.id}/${name}`).toBeLessThanOrEqual(s.span);
        }
      for (const r of v.rules) expect(v.variants[r.variant], `${v.id}: ${r.variant}`).toBeDefined();
      expect(v.describe.length).toBeGreaterThan(10);
    }
  });

  it('open from lines the room really writes, never one a painted memory already opens from', () => {
    const painted = new Set(SCENE_MEMORIES.map((m) => m.phraseId));
    const anchors = new Set<string>();
    for (const v of VIGNETTES) {
      const a = v.anchor;
      expect(!!a.phrase !== !!a.chair, v.id).toBe(true);
      if (!a.phrase) continue;
      expect(PHRASE_BY_ID.has(a.phrase), `${v.id}: ${a.phrase}`).toBe(true);
      expect(painted.has(a.phrase), v.id).toBe(false);
      expect(anchors.has(a.phrase), v.id).toBe(false);
      anchors.add(a.phrase);
    }
  });

  it('are late in a visit, never inside cereal\'s window', () => {
    const cereal = SCENE_MEMORIES.find((m) => m.id === 'cereal')!;
    for (const v of VIGNETTES) expect(v.earliest, v.id).toBeGreaterThanOrEqual(cereal.latest!);
  });

  it('never leave the visitor in an unauthored hole: every stretch over 8 s is a chosen silence or a wait', () => {
    for (const v of VIGNETTES)
      for (const [name, s] of Object.entries(v.variants)) {
        const ends = s.events.map((e) => e.at + ('gap' in e ? e.seconds : 0));
        const starts = [...s.events.map((e) => e.at), s.span].sort((a, b) => a - b);
        for (let i = 1; i < starts.length; i++) {
          const covered = Math.max(starts[i - 1], ...ends.filter((_, k) => s.events[k].at <= starts[i - 1]));
          expect(starts[i] - covered, `${v.id}/${name} before ${starts[i]}`).toBeLessThanOrEqual(8);
        }
        // An authored wait or silence is short enough to read as chosen (a held silence is the room's).
        for (const e of s.events) if ('gap' in e) expect(e.seconds, `${v.id}/${name}`).toBeLessThanOrEqual(8);
        expect(s.span, `${v.id}/${name}`).toBeLessThanOrEqual(30);
      }
  });

  it('no direction makes them cry or whisper: the room learns to sound ordinary here', () => {
    // (Performance direction for these lines lives with the recordings; the scripts carry none.)
    for (const v of VIGNETTES) for (const l of v.lines) expect(l.text, `${v.id}/${l.id}`).not.toMatch(/\[(whisper|crying|sob|voice cracking|holding back tears)/i);
  });

  it('the sounds they use exist: recorded, made in the engine, or the room air', () => {
    for (const v of VIGNETTES)
      for (const s of Object.values(v.variants))
        for (const e of s.events) {
          if (!('sfx' in e) && !('bed' in e)) continue;
          const a = e.asset;
          if (a.startsWith('synth:')) expect(a === 'synth:air' || SYNTH_KINDS.includes(a.slice(6) as never), a).toBe(true);
          else expect(MANIFEST[a]?.length, a).toBeGreaterThan(0);
        }
  });

  it('a score becomes markers and a cue sheet, one cue per sound and each line with its words', () => {
    for (const v of VIGNETTES)
      for (const s of Object.values(v.variants)) {
        const markers = scoreMarkers(s);
        expect(markers).toHaveLength(s.events.length);
        const sheet = toCueSheet(v, s);
        for (const m of markers) if (/^(voice|sfx|bed):/.test(m.label)) expect(sheet.cues[m.label], m.label).toBeDefined();
        for (const [label, cue] of Object.entries(sheet.cues)) if (label.startsWith('voice:')) expect(cue.text).toBeTruthy();
      }
    expect(vignetteKeys(VIGNETTES[0]).every((k) => k.startsWith('vig:') || k.startsWith('phrase:') || MANIFEST[k])).toBe(true);
  });

  it('a version is chosen from what the visitor did, the same way every time', () => {
    const base = { visits: 1, field: {}, motifs: [] as string[], withdrew: false };
    for (const v of VIGNETTES) {
      expect(chooseVariant(v, { ...base, seen: 0 })).toBe(chooseVariant(v, { ...base, seen: 0 }));
      expect(v.variants[chooseVariant(v, { ...base, seen: 3 })]).toBeDefined();
    }
    const car = VIGNETTES.find((v) => v.id === 'back-seat')!;
    expect(chooseVariant(car, { ...base, seen: 0 })).toBe('first');
    expect(chooseVariant(car, { ...base, seen: 0, motifs: ['distance'] })).toBe('pause');
    const party = VIGNETTES.find((v) => v.id === 'gone-quiet')!;
    // "Nobody even asks" is the second time: never a first meeting, whatever the visitor did.
    expect(chooseVariant(party, { ...base, seen: 0, withdrew: true })).toBe('first');
    expect(chooseVariant(party, { ...base, seen: 1 })).toBe('nobody');
  });

  it('its everyday sounds are made in the engine: real samples, within level, nothing a phone can\'t play', () => {
    for (const k of SYNTH_KINDS) {
      const x = render(k, 22050, 1);
      expect(x.length, k).toBeGreaterThan(1000);
      const peak = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
      expect(peak, k).toBeGreaterThan(0);
      expect(peak, k).toBeLessThanOrEqual(1);
      expect(render(k, 22050, 1)).toEqual(x);
    }
  });
});

/** The room's state, as the Director feeds the memories each tick. */
const state = (o: Partial<SceneState> = {}): SceneState => ({
  now: 300, visible: () => true, gazeId: null, gazeFor: 0, free: true, otherMemory: false, departing: false, phase: 'contradiction', finished: () => true, ...o,
});

function read(m: MemoryDirector, phraseId: string, from: number, seconds = 3, o: Partial<SceneState> = {}) {
  for (let t = 0; t <= seconds + 1e-9; t += 0.1) {
    const s = m.update(state({ now: from + t, gazeId: phraseId, gazeFor: t, ...o }));
    if (s) return s;
  }
  return null;
}

describe('when a vignette opens', () => {
  it('a read of its line (or a touch) begins it once it may play; never before its time', () => {
    const m = new MemoryDirector();
    expect(read(m, 'jumper', 100)).toBeNull();
    const s = read(m, 'jumper', 160);
    expect(s?.id).toBe('a-bag');
    expect(s?.kind).toBe('vignette');
    expect(s?.variant).toBe('first');
  });

  it('only once its voices are recorded and kept, unless the version chosen has none', () => {
    const m = new MemoryDirector();
    m.setAvailable(new Set());
    expect(read(m, 'jumper', 160)).toBeNull();
    // Five minutes, heard before: its second version has no voices at all.
    const back = new MemoryDirector({ 'five-minutes': 1 });
    back.setAvailable(new Set());
    expect(back.update(state({ now: 200, chairDistance: 0.8, stillFor: 9 }))?.variant).toBe('again');
  });

  it('keeps its distance from any other memory, more from one of its own tone', () => {
    const m = new MemoryDirector();
    expect(read(m, 'jumper', 160)?.id).toBe('a-bag');
    m.ended('a-bag', 175, true, true);
    // Cooled down, but not yet 90 s on.
    expect(read(m, 'ordinary', 175 + 61)).toBeNull();
    expect(read(m, 'ordinary', 175 + VIGNETTE_APART + 1)?.id).toBe('charger');
    m.ended('charger', 290, true, true);
    // Two sad ones in a row wait longer.
    expect(read(m, 'lonely-birthday', 290 + VIGNETTE_APART + 1)).toBeNull();
    expect(read(m, 'lonely-birthday', 290 + 151)?.id).toBe('gone-quiet');
  });

  it('the chair\'s opens from stillness by the chair, only once "stay" has been finished', () => {
    const m = new MemoryDirector();
    expect(m.update(state({ now: 200, chairDistance: 0.8, stillFor: 9, finished: (id) => id !== 'stay' }))).toBeNull();
    expect(m.update(state({ now: 201, chairDistance: 2, stillFor: 9 }))).toBeNull();
    expect(m.update(state({ now: 202, chairDistance: 0.8, stillFor: 3 }))).toBeNull();
    expect(m.update(state({ now: 203, chairDistance: 0.8, stillFor: 9 }))?.id).toBe('five-minutes');
  });

  it('the room\'s kneeling voice keeps quiet while the chair\'s vignette may still come', () => {
    const m = new MemoryDirector();
    expect(m.claimsChair()).toBe(true);
    m.update(state({ now: 203, chairDistance: 0.8, stillFor: 9 }));
    expect(m.claimsChair()).toBe(false);
  });

  it('offers a rarely written line at most twice a visit, counting every memory\'s offers', () => {
    const offer = (m: MemoryDirector, now: number, kitchenOffered = false) =>
      m.offer({ now, phase: 'transform', free: true, visibleFacing: () => false, departing: false, otherMemory: false, facing: 'east', kitchenOffered });
    const m = new MemoryDirector();
    const got = [offer(m, 400), offer(m, 401), offer(m, 402), offer(m, 403)].filter(Boolean).map((x) => x!.id);
    expect(got.length).toBeLessThanOrEqual(2);
    const k = new MemoryDirector();
    const withKitchen = [offer(k, 400, true), offer(k, 401, true), offer(k, 402, true)].filter(Boolean).map((x) => x!.id);
    expect(withKitchen.filter((id) => VIGNETTE_MEMORIES.some((v) => v.id === id)).length).toBeLessThanOrEqual(1);
    // Far enough apart that only the cap can refuse: the third vignette offer never comes.
    const c = new MemoryDirector();
    c.setAvailable(null);
    const all = [400, 540, 680, 820, 960].map((t) => offer(c, t)).filter(Boolean).map((x) => x!.id);
    // (The bedroom's offer counts too: two in all, and none after.)
    expect(all.filter((id) => VIGNETTE_MEMORIES.some((v) => v.id === id)).length + all.filter((id) => id === 'bedroom').length).toBe(2);
  });

  it('what it leaves comes back later only if it was heard, and never after the visitor has gone', () => {
    const m = new MemoryDirector();
    read(m, 'ordinary', 160);
    m.ended('charger', 176, false, false); // unseen: not spent, nothing left behind
    expect(m.dueEchoes(400)).toHaveLength(0);
    read(m, 'ordinary', 210);
    m.ended('charger', 226, true, true);
    expect(m.dueEchoes(250)).toHaveLength(0);
    expect(m.dueEchoes(300).map((e) => e.echo.id)).toEqual(['tomorrow']);
    m.dropEchoes();
    expect(m.dueEchoes(300)).toHaveLength(0);
  });

  it('a vignette never stops the kitchen-light memory or the painted arc', () => {
    const m = new MemoryDirector();
    read(m, 'jumper', 160);
    m.ended('a-bag', 175, true, true);
    expect(m.anyPlayed).toBe(true);
    expect(m.paintedPlayed).toBe(false);
  });
});

describe('the Director and its vignettes', () => {
  it('nothing else sounds while one plays', () => {
    const d = new Director({ seed: 5 });
    // A vignette playing (as the App reports it).
    d.memoryExternal('a-bag');
    const accept = (d as unknown as { accept(c: unknown, r: string): boolean }).accept.bind(d);
    expect(accept({ type: 'voice', kind: 'laugh', text: null, caption: '', position: { kind: 'beyond', surface: 'north' }, gain: 0.5 }, 'sit:next-room')).toBe(false);
    expect(accept({ type: 'sound', kind: 'cup', position: { kind: 'chair' }, gain: 0.5 }, 'respond-sound')).toBe(false);
    expect(accept({ type: 'music', mood: 'warm', notes: 4, truncate: false }, 'music')).toBe(false);
  });

  it('a line the vignette speaks itself is not said by the room first; lines that only open one are', () => {
    const m = new MemoryDirector();
    for (const v of VIGNETTES) if (v.anchor.phrase) expect(m.claimsVoice(v.anchor.phrase), v.id).toBe(VIGNETTES.some((w) => w.lines.some((l) => l.phraseId === v.anchor.phrase)));
  });

  it('every line has a manifest key of its own (or its phrase\'s)', () => {
    for (const v of VIGNETTES as VignetteDef[]) for (const l of v.lines) expect(lineKey(v, l)).toMatch(l.phraseId ? /^phrase:/ : new RegExp(`^vig:${v.id}:`));
    for (const v of VIGNETTES) expect(spokenLines(v, 'first').length).toBeGreaterThan(0);
  });
});

import { wordBand, recedeStep, type RecedeState } from '../src/world/WallText';

describe('what a vignette leaves on the walls', () => {
  it("a lost word's band runs from halfway into the gap before it to halfway into the gap after", () => {
    // "I was loneliest at…": words at their hand-times (seconds), over 4 s.
    const words: [number, number][] = [[0, 0.2], [0.4, 0.8], [1.0, 1.9], [2.1, 2.3]];
    const [lo, hi] = wordBand(words, 4, 2);
    expect(lo).toBeCloseTo(0.9 / 4);
    expect(hi).toBeCloseTo(2.0 / 4);
    // Nothing of a neighbour is caught.
    expect(lo).toBeGreaterThan(0.8 / 4);
    expect(hi).toBeLessThan(2.1 / 4);
    // At the ends, the band runs off the piece.
    expect(wordBand(words, 4, 0)[0]).toBeLessThan(0);
    expect(wordBand(words, 4, 3)[1]).toBeGreaterThan(1);
  });

  it('receding writing answers being come close to: a beat, a withdrawal, a slow and reluctant return', () => {
    let r: RecedeState = { amount: 1, k: 0, near: 0, far: 0, away: false, once: false };
    const walk = (dist: number, secs: number) => {
      for (let t = 0; t < secs; t += 0.05) r = recedeStep(r, dist, 0.05);
      return r.k;
    };
    expect(walk(2, 10)).toBe(0); // reading from 2 m: whole
    expect(walk(1.4, 0.5)).toBe(0); // not at once
    expect(walk(1.4, 2.5)).toBeGreaterThan(0.4); // the first time slowly
    expect(walk(1.4, 10)).toBeGreaterThan(0.95);
    expect(walk(2.3, 10)).toBeGreaterThan(0.95); // a step back is not enough
    expect(walk(3, 1.4)).toBeGreaterThan(0.95); // nor a moment further
    expect(walk(3, 3)).toBeLessThan(0.6);
    walk(3, 20);
    walk(1.4, 0.6);
    expect(walk(1.4, 2)).toBeGreaterThan(0.75); // afterwards it goes more readily
  });

  it("J's return takes 'loneliest' from its line, which is there to lose it", () => {
    const party = VIGNETTES.find((v) => v.id === 'gone-quiet')!;
    const lose = party.variants.nobody.events.find((e) => 'fx' in e && e.fx.kind === 'loseWord');
    expect(lose && 'fx' in lose && lose.fx.kind === 'loseWord' && PHRASE_BY_ID.get(lose.fx.phraseId)!.text.split(/\s+/)).toContain(lose && 'fx' in lose && lose.fx.kind === 'loseWord' ? lose.fx.word : '');
  });
});

describe('ending without being heard', () => {
  it('a vignette unseen twice is spent for the visit, but not counted and leaves nothing behind', () => {
    const m = new MemoryDirector();
    read(m, 'ordinary', 160);
    expect(m.ended('charger', 170, false, false)).toBe(false);
    read(m, 'ordinary', 210);
    expect(m.ended('charger', 220, false, false)).toBe(false);
    expect(m.dueEchoes(400)).toHaveLength(0);
    expect(read(m, 'ordinary', 400)).toBeNull();
  });

  it("the chair's claim on the room's kneeling voice starts only when its vignette could", () => {
    const m = new MemoryDirector();
    expect(m.claimsChair(30)).toBe(false);
    expect(m.claimsChair(200, (id) => id !== 'stay')).toBe(false);
    expect(m.claimsChair(200)).toBe(true);
  });
});

import { readingTake } from '../src/content/vignettes';
import { voicedGain } from '../src/audio/Voices';

describe('after the evaluation', () => {
  it("five minutes' heard-before version is heard once: after that the chair is the room's again", () => {
    const m = new MemoryDirector({ 'five-minutes': 2 });
    m.setAvailable(new Set());
    expect(m.update(state({ now: 200, chairDistance: 0.8, stillFor: 9 }))).toBeNull();
    expect(m.claimsChair(200)).toBe(false);
  });

  it('a version asks for a reading by name; any kept reading stands in if that one was not kept', () => {
    const files = ['vignettes/back-seat--no--tired.mp3', 'vignettes/back-seat--no--quick-b.mp3'];
    expect(readingTake(files, 'quick')).toBe(1);
    expect(readingTake(files, 'tired')).toBe(0);
    expect(readingTake(files, 'fond')).toBeUndefined();
    const def = VIGNETTES.find((v) => v.id === 'back-seat')!;
    const sheet = toCueSheet(def, def.variants.first, undefined, (k) => (k === 'vig:back-seat:no' ? files : []));
    const no = Object.entries(sheet.cues).find(([k]) => k.startsWith('voice:no@'))![1];
    expect(no.take).toBe(1);
  });

  it("the one remembering is heard straight ahead, never at one ear (only the rehearsed call is held to it)", () => {
    for (const v of VIGNETTES)
      for (const s of Object.values(v.variants))
        for (const e of s.events) if ('line' in e && e.place.at === 'close') expect(v.id).toBe('practice');
  });

  it('spoken lines are levelled by the voiced part: a short word with silence round it is not boosted for the silence', () => {
    const rate = 8000;
    const make = (voiced: number, total: number) => {
      const d = new Float32Array(rate * total);
      for (let i = 0; i < rate * voiced; i++) d[i] = 0.1 * Math.sin(i * 0.3);
      return { sampleRate: rate, getChannelData: () => d } as unknown as AudioBuffer;
    };
    const word = voicedGain(make(0.4, 3)), sentence = voicedGain(make(2.8, 3));
    expect(Math.abs(20 * Math.log10(word / sentence))).toBeLessThan(0.5);
  });
});
