/**
 * The woodland's score against its picture (scripts/woodland-score/; decisions 65–69 and 77–83 of
 * docs/reviews/2026-10-woodland.md). It was composed and rendered for the painted rig's 53 s
 * timeline (audition/woodland/woodland-score-53s.mp3, its notes in notes.json): the same tune both
 * times, one level, one bass note a bar, played by hands. Since 2026-10-24 the memory plays it
 * joined for the film's timeline (scripts/woodland-score/retime.py, retimed.json): one join of whole
 * beats in the quiet, a quarter second given back in a decay, the rest exactly 4 s earlier, so it
 * still stops on the cut a note before home; her glance falls inside its long high note.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CUT, MEMORIES, SCORE_FROM, SHOTS, WOODLAND as DEF, WOODLAND_FILM } from '../src/memory/defs';
import { TIMES } from '../src/memory/synthWoods';

type Note = { t: number; midi: number; vel: number; dur: number; hand: 'r' | 'l' };
interface Score {
  from: number;
  cut: number;
  beat: number;
  statements: [number, number];
  notes: Note[];
  /** Struck before the file begins: still ringing as it comes up (the go-round already under way). */
  ringing: { t: number; midi: number }[];
  /** The mechanism heard: each key in its bed, each pedal down and up. */
  mechanism: { t: number; kind: string }[];
  /** The recording's crackle: each tick, in dB re their median. */
  crackle: { t: number; db: number }[];
  /** The crackle's median tick under the melody's median attack (dB). */
  crackleDb: number;
  /** The file these notes are of (the first 16 of its SHA-256). */
  sha256: string;
}
interface Retimed {
  from: number;
  cut: number;
  source_sha256: string;
  join: { from: number; to: number; beats: number; fade: number; level_db: { before: number; after: number } };
  given: { from: number; to: number; seconds: number; ratio: number; fade: number; level_db: number };
  shift_after: number;
  notes: Note[];
  dropped: Note[];
  crackle: { t: number; db: number }[];
  mechanism: { t: number; kind: string }[];
  glance_above500_db: number[];
  peak_dbfs: number;
  samples: number;
  sha256: string;
}
const score = JSON.parse(readFileSync('scripts/woodland-score/notes.json', 'utf8')) as Score;
const re = JSON.parse(readFileSync('scripts/woodland-score/retimed.json', 'utf8')) as Retimed;
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const melody = score.notes.filter((n) => n.hand === 'r');
const played = re.notes.filter((n) => n.hand === 'r');
const HOME = 73; // D♭5
const [S1, S2] = score.statements;
const G = WOODLAND_FILM.glance;
/** The film's moments, as its shots show them: no note begins in one. */
const moments: [number, number, string][] = [
  [9.6, 10.0, 'the way in coming to rest'],
  // (The turn's first note comes 0.28 s after this cut: the price of her glance's place in the
  // high note. Nothing comes in the 0.7 s before it, nor the first quarter second after.)
  [SHOTS.two - 0.7, SHOTS.two + 0.25, 'the cut to the two of them'],
  [G.eyes - 0.2, G.turned + 0.15, 'her glance'],
  [SHOTS.wideAgain - 0.7, SHOTS.wideAgain + 0.7, 'the cut back to the wide'],
  [TIMES.near[2][0] - 0.2, TIMES.near[2][0] + 0.2, "the near cicada's return"],
  [CUT - 0.5, CUT, 'the stillness before the cut'],
];

describe("the woodland's score", () => {
  it('the render is the file its notes describe; the memory plays it joined, from where its cue begins to the cut, and nothing after it', () => {
    expect(sha('audition/woodland/woodland-score-53s.mp3')).toBe(score.sha256);
    expect(score.from).toBe(SCORE_FROM);
    expect(score.cut).toBe(34.5);
    for (const n of score.ringing) expect(SCORE_FROM - n.t).toBeLessThan(1.5);
    expect(re.source_sha256).toBe(score.sha256);
    expect(sha('public/music/woodland-score.mp3')).toBe(re.sha256);
    expect(re.from).toBe(SCORE_FROM);
    expect(re.cut).toBe(CUT);
    expect(re.samples).toBe(Math.round((CUT - SCORE_FROM) * 48000));
    for (const n of re.notes) expect(n.t).toBeGreaterThanOrEqual(SCORE_FROM);
    for (const n of re.notes) expect(n.t).toBeLessThan(CUT);
    expect(re.peak_dbfs).toBeLessThan(-1);
  });

  it('is joined on whole beats, in the quiet, and given back where only a decay is heard; after it, exactly 4 s earlier', () => {
    expect(re.join.beats).toBe(5);
    // (Bass to bass as played: within a player's 25 ms of five beats.)
    expect(Math.abs(re.join.to - re.join.from - 5 * score.beat)).toBeLessThan(0.025);
    expect(re.join.fade).toBeLessThanOrEqual(0.02);
    // Into the silence before the chord, out of the dampers' fall.
    expect(re.join.level_db.after).toBeLessThan(-45);
    expect(re.join.level_db.before).toBeLessThan(-20);
    expect(re.given.level_db).toBeLessThan(-40);
    expect(re.given.ratio).toBeLessThan(1.2);
    expect(re.join.to - re.join.from - re.given.seconds).toBeCloseTo(re.shift_after, 6);
    expect(re.shift_after).toBeCloseTo(34.5 - CUT, 6);
    // Only beat 4's chord and its F were taken (the long F of the first time).
    expect(re.dropped.map((n) => n.midi).sort()).toEqual([41, 61, 77]);
    for (const n of re.dropped) expect(n.t >= re.join.from && n.t < re.join.to).toBe(true);
    // Every other note as played, at its new time.
    const map = (t: number) => (t < re.join.from ? t : t < re.given.from ? t - (re.join.to - re.join.from) : t - re.shift_after);
    const kept = score.notes.filter((n) => !(n.t >= re.join.from && n.t < re.join.to));
    expect(re.notes.length).toBe(kept.length);
    kept.forEach((n, i) => {
      expect(re.notes[i].midi).toBe(n.midi);
      expect(re.notes[i].t).toBeCloseTo(map(n.t), 3);
    });
    // (Nothing is struck while the decay is being given back.)
    for (const n of score.notes) expect(n.t >= re.given.from && n.t < re.given.to, `${n.t}`).toBe(false);
  });

  it("no note begins on any of the film's moments, nor does the instrument sound on them", () => {
    for (const n of re.notes) for (const [a, b, what] of moments) expect(n.t >= a && n.t < b, `${n.t.toFixed(2)} s: ${what}`).toBe(false);
    for (const m of re.mechanism) for (const [a, b, what] of moments) expect(m.t >= a && m.t < b, `${m.kind} at ${m.t.toFixed(2)} s: ${what}`).toBe(false);
  });

  it('her glance falls inside its long high note, and nothing in it swells', () => {
    // The last note struck before her eyes go is still held when her head has turned (she looks,
    // and the music simply goes on): the second time's A-flat.
    const held = played.filter((n) => n.t < G.eyes).at(-1)!;
    expect(held.midi).toBe(80);
    expect(G.eyes - held.t).toBeGreaterThan(0.15);
    expect(held.t + held.dur).toBeGreaterThan(G.turned);
    // Through it the piano above 500 Hz only falls (in 400 ms blocks, as decision 125 measured).
    const b = re.glance_above500_db;
    expect(b.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < b.length; i++) expect(b[i], `block ${i}`).toBeLessThanOrEqual(b[i - 1] + 0.5);
    // None of the recording's crackle in it.
    for (const k of re.crackle) expect(k.t >= G.eyes && k.t < G.settled, `a tick at ${k.t.toFixed(2)} s`).toBe(false);
  });

  it('as rendered, is the same tune both times, as hands play it, at one level, one bass note a bar (V–I in the last)', () => {
    // (The first time it comes in a little early, its first two notes; from its third, the same.)
    const at = (from: number, to: number) => melody.filter((n) => n.t >= from + 3 * score.beat && n.t < to - 0.05).map((n) => ({ beat: (n.t - from) / score.beat, midi: n.midi }));
    const first = at(S1, S2), second = at(S2, score.cut);
    expect(second.length).toBeGreaterThan(5);
    let same = 0;
    second.forEach((n, i) => {
      expect(n.midi).toBe(first[i].midi);
      // Within a player's 25 ms either way, and never the same to the millisecond throughout.
      expect(Math.abs(n.beat - first[i].beat)).toBeLessThan(0.07);
      if (Math.abs(n.beat - first[i].beat) * score.beat < 0.002) same++;
    });
    expect(same).toBeLessThan(second.length / 2);
    const v = melody.map((n) => n.vel), mean = v.reduce((a, b) => a + b, 0) / v.length;
    for (const x of v) expect(Math.abs(x - mean)).toBeLessThanOrEqual(6);
    const vel = (from: number, to: number) => {
      const s = melody.filter((n) => n.t >= from && n.t < to).map((n) => n.vel);
      return s.reduce((a, b) => a + b, 0) / s.length;
    };
    expect(vel(S2, score.cut)).toBeLessThanOrEqual(vel(S1, S2) + 0.5);
    // The left hand: a bass note and a tenth, together; one a bar, two in the last (V, then I).
    const chords = [...new Set(score.notes.filter((n) => n.hand === 'l').map((n) => Math.round((n.t - S1) / score.beat)))];
    const bars = new Map<number, number>();
    for (const b of chords) bars.set(Math.floor(b / 4), (bars.get(Math.floor(b / 4)) ?? 0) + 1);
    for (const [bar, count] of bars) expect(count, `bar ${bar}`).toBeLessThanOrEqual(bar % 4 === 3 ? 2 : 1);
  });

  it("the recording's crackle, as joined: about two ticks a second, never two together, never periodic, none in the last second", () => {
    const ticks = re.crackle;
    expect(ticks.length / (CUT - SCORE_FROM)).toBeGreaterThan(1);
    expect(ticks.length / (CUT - SCORE_FROM)).toBeLessThan(3);
    for (const k of ticks) expect(k.db).toBeLessThanOrEqual(2);
    expect(score.crackleDb + Math.max(...ticks.map((k) => k.db))).toBeLessThanOrEqual(-30);
    expect(CUT - Math.max(...ticks.map((k) => k.t))).toBeGreaterThan(1);
    const times = ticks.map((k) => k.t).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.0299);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    expect(sd / mean, 'never periodic').toBeGreaterThan(0.5);
  });

  it('comes home once, before her glance; the second time the cut takes the note before home', () => {
    const homes = played.filter((n) => n.midi === HOME);
    expect(homes.length).toBe(1);
    expect(homes[0].t).toBeLessThan(G.eyes - 1.5);
    expect(homes[0].t).toBeGreaterThan(SHOTS.two + 1);
    // The second time: its last note struck about half a second before the cut, home due just after.
    const last = played[played.length - 1];
    expect(CUT - last.t).toBeGreaterThan(0.5);
    expect(CUT - last.t).toBeLessThan(0.7);
    const homeThen = melody.find((n) => n.midi === HOME)!.t;
    const due = S2 + (homeThen - S1) - re.shift_after;
    expect(due).toBeGreaterThan(CUT + 0.15);
    expect(due).toBeLessThan(CUT + 0.5);
    // The note before home is the one before it the first time.
    const before = played.filter((n) => n.t < homes[0].t).at(-1)!;
    expect(last.midi).toBe(before.midi);
  });

  it('is heard only in the afternoon: no other memory, variant or the revisit plays it', () => {
    for (const m of Object.values(MEMORIES))
      for (const v of m.variants)
        for (const c of Object.values(m.cues(v).cues)) if (c.asset === 'music/woodland-score.mp3') expect(`${m.id}-${v}`).toBe('woodland-afternoon');
    expect(Object.values(DEF.cues('afternoon').cues).filter((c) => c.asset === 'music/woodland-score.mp3').length).toBe(1);
  });
});
