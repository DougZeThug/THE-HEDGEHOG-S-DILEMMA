/**
 * The woodland's score against its picture (scripts/woodland-score/; decisions 65–69 and 77–83 of
 * docs/reviews/2026-10-woodland.md): no note begins on any of the picture's moments (as measured
 * on the film's drawings, not as authored); the same tune both times, one level, one bass note a
 * bar, played by hands (never a copy to the millisecond); home once, between the looks; the second
 * time, the last note a little before the cut, and the cut before home. Heard only in the afternoon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CUT, MEMORIES, SCORE_FROM, SHOTS, TURN_STEPS, TWO_SHOT, WOODLAND as DEF } from '../src/memory/defs';
import { WOODLAND } from '../src/memory/living/woodland';
import { TIMES } from '../src/memory/synthWoods';

interface Score {
  from: number;
  cut: number;
  beat: number;
  statements: [number, number];
  notes: { t: number; midi: number; vel: number; dur: number; hand: 'r' | 'l' }[];
  /** Struck before the file begins: still ringing as it comes up (the go-round already under way). */
  ringing: { t: number; midi: number }[];
}
const score = JSON.parse(readFileSync('scripts/woodland-score/notes.json', 'utf8')) as Score;
const melody = score.notes.filter((n) => n.hand === 'r');
const HOME = 73; // D♭5
const [S1, S2] = score.statements;

describe("the woodland's score", () => {
  it('is the file the memory plays: from where its cue begins to the cut, and nothing after it', () => {
    expect(score.from).toBe(SCORE_FROM);
    expect(score.cut).toBe(CUT);
    for (const n of score.notes) expect(n.t).toBeGreaterThanOrEqual(SCORE_FROM);
    for (const n of score.notes) expect(n.t).toBeLessThan(CUT);
    // What is ringing when it begins was struck within a second and a half before: the last chord
    // of a go-round (and no more).
    for (const n of score.ringing) expect(SCORE_FROM - n.t).toBeLessThan(1.5);
  });

  it("no note begins on any of the picture's moments", () => {
    const settled = TWO_SHOT.herTurn + TURN_STEPS.length / 12;
    const moments: [number, number, string][] = [
      // (As the film's drawings show them: the painting comes to rest at 9.75–9.83; the gust is seen
      // from 11.75 and heard from 11.9: the cinematic director's evaluation, 2026-10-19.)
      [9.6, 10.0, 'the painting coming to rest'],
      ...WOODLAND.gusts.map((g): [number, number, string] => [g.at + 0.1, g.at + 0.5, 'the gust arriving']),
      ...WOODLAND.blinks.a.map((b): [number, number, string] => [b - 0.2, b + 0.4, 'his blink']),
      [SHOTS.two - 0.7, SHOTS.two + 0.7, 'the cut to the two of them'],
      [TWO_SHOT.herEyes - 0.5, settled + 0.5, 'her look'],
      [TWO_SHOT.hisEyes - 0.5, TWO_SHOT.hisRoll + 1, 'his look'],
      [SHOTS.wideAgain - 0.7, SHOTS.wideAgain + 0.7, 'the cut back to the wide'],
      [TIMES.near[2][0] - 0.2, TIMES.near[2][0] + 0.2, "the near cicada's return"],
    ];
    for (const n of score.notes) for (const [a, b, what] of moments) expect(n.t >= a && n.t < b, `${n.t.toFixed(2)} s: ${what}`).toBe(false);
    // Both looks fall inside long notes: the last struck before each is still held when it ends
    // (she looks, and he does, while the music simply goes on).
    for (const [from, to] of [[TWO_SHOT.herEyes, settled], [TWO_SHOT.hisEyes, TWO_SHOT.hisRoll + 0.5]]) {
      const held = melody.filter((n) => n.t < from).at(-1)!;
      expect(held.t + held.dur, `the note before ${from} s`).toBeGreaterThan(to);
    }
  });

  it('is the same tune both times, as hands play it, at one level, one bass note a bar (V–I in the last)', () => {
    // (The first time it comes in a little early, its first two notes; from its third, the same.)
    const at = (from: number, to: number) => melody.filter((n) => n.t >= from + 3 * score.beat && n.t < to - 0.05).map((n) => ({ beat: (n.t - from) / score.beat, midi: n.midi }));
    const first = at(S1, S2), second = at(S2, CUT);
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
    expect(vel(S2, CUT)).toBeLessThanOrEqual(vel(S1, S2) + 0.5);
    // The left hand: a bass note and a tenth, together; one a bar, two in the last (V, then I).
    const chords = [...new Set(score.notes.filter((n) => n.hand === 'l').map((n) => Math.round((n.t - S1) / score.beat)))];
    const bars = new Map<number, number>();
    for (const b of chords) bars.set(Math.floor(b / 4), (bars.get(Math.floor(b / 4)) ?? 0) + 1);
    for (const [bar, count] of bars) expect(count, `bar ${bar}`).toBeLessThanOrEqual(bar % 4 === 3 ? 2 : 1);
  });

  it('comes home once, between her look and his; the second time the cut takes the note before home', () => {
    const homes = melody.filter((n) => n.midi === HOME);
    expect(homes.length).toBe(1);
    expect(homes[0].t).toBeGreaterThan(TWO_SHOT.herTurn + TURN_STEPS.length / 12 + 2);
    expect(homes[0].t).toBeLessThan(TWO_SHOT.hisEyes - 2);
    // The second time: its last note struck about half a second before the cut, home due just after.
    const last = melody[melody.length - 1];
    expect(CUT - last.t).toBeGreaterThan(0.5);
    expect(CUT - last.t).toBeLessThan(0.7);
    const due = S2 + (homes[0].t - S1);
    expect(due).toBeGreaterThan(CUT + 0.15);
    expect(due).toBeLessThan(CUT + 0.5);
    // The note before home is the one before it the first time.
    const before = melody.filter((n) => n.t < homes[0].t).at(-1)!;
    expect(last.midi).toBe(before.midi);
  });

  it('is heard only in the afternoon: no other memory, variant or the revisit plays it', () => {
    for (const m of Object.values(MEMORIES))
      for (const v of m.variants)
        for (const c of Object.values(m.cues(v).cues)) if (c.asset === 'music/woodland-score.mp3') expect(`${m.id}-${v}`).toBe('woodland-afternoon');
    expect(Object.values(DEF.cues('afternoon').cues).filter((c) => c.asset === 'music/woodland-score.mp3').length).toBe(1);
  });
});
