import { describe, it, expect } from 'vitest';
import { openingScore, levelsAt, stageAt, OPENING_UNFINISHED } from '../src/state/OpeningScore';
import { speechPlan, handAt } from '../src/world/WallText';
import { handTiming, speechTiming } from '../src/world/handwriting';
import { bakeStrokes, type CharBox } from '../src/world/strokes';
import { Director } from '../src/state/Director';
import timings from '../src/content/voice-timings.json';
import dialogue from '../src/content/dialogue.json';
import type { VisitorInput } from '../src/state/VisitorModel';

const T = timings as unknown as Record<string, { hash: string; text: string; chars: [number, number][] }>;
const sample = (s: ReturnType<typeof openingScore>, step = 0.1) => {
  const out: { t: number; lv: ReturnType<typeof levelsAt>; stage: string }[] = [];
  for (let t = 0; t <= s.handoff + 1; t += step) out.push({ t, lv: levelsAt(s, t), stage: stageAt(s, t) });
  return out;
};

describe('the opening: darkness, a name, light, the chair, the room, writing, a voice', () => {
  for (const touch of [false, true]) {
    const s = openingScore({ returning: false, touch });
    const frames = sample(s);
    const label = touch ? 'phone' : 'desktop';

    it(`${label}: the title fades in on black, holds, and fades out once`, () => {
      const title = frames.map((f) => f.lv.title);
      expect(title[0]).toBe(0);
      const held = frames.filter((f) => f.lv.title >= 0.9).map((f) => f.t);
      expect(held[held.length - 1] - held[0]).toBeGreaterThanOrEqual(touch ? 1.5 : 2.5);
      // Rises once and falls once.
      let turns = 0;
      for (let i = 2; i < title.length; i++) if (Math.sign(title[i] - title[i - 1]) * Math.sign(title[i - 1] - title[i - 2]) < 0) turns++;
      expect(turns).toBeLessThanOrEqual(2);
      // The screen stays black while the title is up, and the title is gone before any light.
      for (const f of frames) if (f.lv.title > 0.02) expect(f.lv.black).toBe(1);
      const firstLight = frames.find((f) => f.lv.key > 0.01)!.t;
      expect(frames.find((f) => f.t >= firstLight)!.lv.title).toBeLessThan(0.02);
    });

    it(`${label}: the chair is lit before the room, and the room never by a spotlight alone`, () => {
      const chair = frames.find((f) => f.lv.key >= 0.3)!.t;
      const walls = frames.find((f) => f.lv.area >= 0.3)!.t;
      expect(walls - chair).toBeGreaterThanOrEqual(2);
      for (const f of frames) {
        if (f.lv.key > 0) expect(f.lv.cone).toBeGreaterThanOrEqual(0.5);
        if (f.lv.key > 0) expect(f.lv.hemi).toBeGreaterThan(0);
      }
      // A sound in the dark before the light.
      const sounds = s.events.filter((e) => e.kind === 'sound').map((e) => e.at);
      expect(Math.min(...sounds)).toBeLessThan(frames.find((f) => f.lv.key > 0.01)!.t);
    });

    it(`${label}: something perceptible every few seconds, writing and a voice by about 20 s, the room theirs by 25 s`, () => {
      // (The title itself is what is perceptible while it holds.)
      const marks = [...s.stages.map(([, at]) => at), ...s.events.map((e) => e.at), ...s.keys.title.map(([at]) => at)].sort((a, b) => a - b);
      for (let i = 1; i < marks.length; i++) expect(marks[i] - marks[i - 1], `gap before ${marks[i]}`).toBeLessThanOrEqual(5);
      const write = s.events.find((e) => e.kind === 'write')!;
      const voice = s.events.find((e) => e.kind === 'voice')!;
      expect(write.at).toBeLessThan(voice.at);
      expect(voice.at).toBeLessThanOrEqual(touch ? 18 : 21);
      expect(s.handoff).toBeLessThanOrEqual(touch ? 22.5 : 25.5);
      // Looking around comes with the chair; walking a few seconds later.
      const look = frames.find((f) => f.lv.look > 0.5)!.t;
      const walk = frames.find((f) => f.lv.walk > 0.5)!.t;
      expect(look).toBeLessThanOrEqual(touch ? 7.5 : 8.5);
      expect(walk).toBeLessThanOrEqual(touch ? 11 : 12.5);
      expect(frames[frames.length - 1].lv.area).toBe(1);
    });
  }

  it('returning visitors go straight to the light, and the room is theirs within about ten seconds', () => {
    const s = openingScore({ returning: true, touch: true });
    expect(levelsAt(s, 0).title).toBe(0);
    expect(s.handoff).toBeLessThanOrEqual(10);
    expect(s.events.some((e) => e.kind === 'voice')).toBe(false);
  });

  it('the first line is left unfinished, and the voice that follows is one the artist kept', () => {
    const s = openingScore({ returning: false, touch: false });
    const w = s.events.find((e) => e.kind === 'write');
    expect(w && w.kind === 'write' && w.upto).toBe(4);
    expect(OPENING_UNFINISHED).toContain(w && w.kind === 'write' ? w.phrase : '');
    const v = s.events.find((e) => e.kind === 'voice');
    const file = v && v.kind === 'voice' ? v.file : '';
    const perf = (dialogue.performances as { file: string; retired?: boolean; audition?: boolean }[]).find((p) => p.file === file);
    expect(perf && !perf.retired && !perf.audition).toBe(true);
    expect(T[file]).toBeTruthy();
  });
});

describe('the Director waits for the opening', () => {
  const still: VisitorInput = { x: 0.15, z: 2.55, yaw: 0, pitch: -0.15, gazePhraseId: null, gazeChair: true, nearSurface: null, kneeling: false };
  it('while held, nothing of its own happens and no time passes for it; afterwards, nothing is owed', () => {
    const d = new Director({ seed: 3, visits: 2 });
    d.hold();
    for (let t = 0; t < 25; t += 0.1) expect(d.tick(0.1, still, 'north')).toEqual([]);
    expect(d.now).toBe(0);
    d.release({ written: ['stay'], spoken: ['crumbs'], unfinished: ['stay'] });
    expect(d.visitor.stillFor).toBe(0);
    const first: number[] = [];
    for (let t = 0; t < 12; t += 0.1) for (const c of d.tick(0.1, still, 'north')) if (c.cue.type !== 'hide') first.push(d.now);
    // No burst at the hand-off: nothing for the first moments, and never three things at once.
    expect(Math.min(...first)).toBeGreaterThanOrEqual(2);
    for (let i = 2; i < first.length; i++) expect(first[i] - first[i - 2]).toBeGreaterThan(1.5);
  });

  it('the room begins nearly empty and fills: a few lines within ten seconds, more within a minute', () => {
    const d = new Director({ seed: 4 });
    d.release({ written: ['stay'], spoken: ['crumbs'] });
    const shown = () => [...d.visible.values()].filter((v) => v.mode === 'shown').length;
    const start = shown();
    expect(start).toBeLessThanOrEqual(4); // the opening's line and the floor writing by the chair
    for (let t = 0; t < 60; t += 0.1) d.tick(0.1, { ...still, yaw: Math.sin(t * 0.2) }, t % 30 < 15 ? 'north' : 'east');
    // At least six readable lines within the first minute after the hand-off, still sparse.
    expect(shown()).toBeGreaterThanOrEqual(6);
    expect(shown() - start).toBeGreaterThanOrEqual(2);
    expect(shown()).toBeLessThanOrEqual(12);
  });

  it('a long look at the unfinished line is answered: the sentence is said and finished', () => {
    const d = new Director({ seed: 5 });
    d.release({ written: ['stay'], unfinished: ['stay'] });
    const cues = [];
    for (let t = 0; t < 40; t += 0.1) cues.push(...d.tick(0.1, { ...still, gazePhraseId: 'stay', gazeChair: false }, 'north'));
    const fin = cues.find((c) => c.cue.type === 'voice' && c.cue.finish);
    expect(fin).toBeTruthy();
    expect(fin!.rule).toBe('finish-look');
  });
});

describe('writing follows a voice with a hand, not as captions', () => {
  const takes = ['dialogue/crumbs--laughing.mp3', 'dialogue/stay--breaking.mp3', 'dialogue/stay--after-silence.mp3', 'dialogue/closer--held.mp3'];
  for (const f of takes) {
    it(`${f}: each word starts when it is heard, never before; the line ends within a second of the voice`, () => {
      const e = T[f];
      const own = handTiming(e.text, f.includes('crumbs') ? 'crayon' : 'pencil', 'k');
      const plan = speechPlan(e.text, own.words.map((w) => [w.start, w.end]), e.chars, 10);
      const words = [...e.text.matchAll(/\S+/g)].map((m) => [m.index!, m.index! + m[0].length]);
      plan.forEach(([start], k) => expect(start).toBeGreaterThanOrEqual(10 + e.chars[words[k][0]][0] - 1e-6));
      const speechEnd = 10 + e.chars[e.chars.length - 1][1];
      expect(plan[plan.length - 1][1]).toBeLessThanOrEqual(speechEnd + 1.0);
      // Not caption-locked: no word is written in exactly the time it takes to say.
      const same = plan.filter(([a, b], k) => Math.abs(b - a - (e.chars[words[k][1] - 1][1] - e.chars[words[k][0]][0])) < 0.02).length;
      expect(same).toBeLessThan(plan.length);
      // The hand never goes backwards.
      let prev = -1;
      for (let t = 9; t < speechEnd + 2; t += 0.02) {
        const h = handAt({ start: 0, segments: plan, floor: 0, cap: own.duration }, t);
        expect(h).toBeGreaterThanOrEqual(prev);
        prev = h;
      }
    });
  }

  it('the hand writes on its own at a human pace: slower for wide letters, pausing at commas and stops', () => {
    const a = handTiming('mmmm iiii', 'pen', 'x');
    expect(a.chars[1][1] - a.chars[1][0]).toBeGreaterThan(a.chars[6][1] - a.chars[6][0]);
    const b = handTiming('one, two. three', 'pen', 'y');
    expect(b.words[1].start - b.words[0].end).toBeGreaterThan(0.3);
    expect(b.words[2].start - b.words[1].end).toBeGreaterThan(0.5);
    // Deterministic.
    expect(handTiming('same words', 'pencil', 'k')).toEqual(handTiming('same words', 'pencil', 'k'));
    expect(speechTiming('ab', 'pen', 'k', [[0, 0.1], [0.1, 0.2]]).speech).toBe(true);
  });
});

describe('stroke order', () => {
  it('ink is reached in order along a stroke; dots come after their word; every pixel has a time', () => {
    // Two letters: an "l"-like bar, and an "i" (a stem and a dot above it).
    const W = 40, H = 30;
    const a = new Uint8Array(W * H);
    for (let y = 5; y < 25; y++) a[y * W + 8] = a[y * W + 9] = 255; // l
    for (let y = 14; y < 25; y++) a[y * W + 24] = a[y * W + 25] = 255; // i stem
    for (let y = 7; y < 10; y++) a[y * W + 24] = a[y * W + 25] = 255; // i dot
    const boxes: CharBox[] = [
      { i: 0, x0: 4, x1: 16, yTop: 2, yBottom: 28, base: 25, xHeight: 10 },
      { i: 1, x0: 18, x1: 32, yTop: 2, yBottom: 28, base: 25, xHeight: 10 },
    ];
    const timing = handTiming('li', 'pencil', 'test');
    const b = bakeStrokes(a, W, H, boxes, timing, () => 0);
    const at = (x: number, y: number) => b.time[y * W + x];
    // Down the l from its top.
    expect(at(8, 6)).toBeLessThan(at(8, 15));
    expect(at(8, 15)).toBeLessThan(at(8, 24));
    // The l before the i; the i's dot after its stem.
    expect(at(8, 24)).toBeLessThanOrEqual(at(24, 16));
    expect(at(24, 8)).toBeGreaterThan(at(24, 24));
    expect(b.words[0][1]).toBeGreaterThanOrEqual(at(24, 8));
    for (let p = 0; p < W * H; p++) expect(Number.isFinite(b.time[p])).toBe(true);
  });
});

describe('voice timings', () => {
  it('every recording in the room has character timings that match its text and fit inside it', () => {
    const manifest = Object.entries((require('../public/voices/manifest.json') as Record<string, string[]>)).filter(([k]) => k.startsWith('phrase:')).flatMap(([, v]) => v);
    for (const f of manifest) {
      const e = T[f];
      expect(e, f).toBeTruthy();
      const perf = (dialogue.performances as { file: string; text: string }[]).find((p) => p.file === f)!;
      expect(e.text).toBe(perf.text);
      expect(e.chars.length).toBe(perf.text.length);
      for (let i = 1; i < e.chars.length; i++) expect(e.chars[i][0], f).toBeGreaterThanOrEqual(e.chars[i - 1][0] - 1e-6);
    }
  });
});

describe('comfort', () => {
  it('the system reduced-motion setting is followed unless the visitor chose otherwise', async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as Storage;
    let reduce = true;
    (globalThis as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({ matches: q.includes('reduced-motion') ? reduce : false });
    const { loadPrefs, savePrefs } = await import('../src/ui/prefs');
    // A volume change once saved every preference, freezing reduced motion as it was then.
    reduce = false;
    savePrefs({ ...loadPrefs(), volume: 0.4 });
    reduce = true;
    expect(loadPrefs().reducedMotion).toBe(true);
    // A choice the visitor made is kept.
    savePrefs({ ...loadPrefs(), reducedMotion: false, reducedMotionChosen: true });
    expect(loadPrefs().reducedMotion).toBe(false);
  });
});
