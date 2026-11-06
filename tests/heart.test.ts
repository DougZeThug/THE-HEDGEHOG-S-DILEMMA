import { describe, it, expect } from 'vitest';
import { MemoryDirector, HEART_LAPSE, HEART_REINK } from '../src/state/MemoryDirector';
import { HEART_ANSWER, HEART_BY_SHAPE, HEART_EARLIEST } from '../src/content/memories';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { Rng } from '../src/core/rng';
import { CLASSES, drawGenome, liveVisit, type VisitSummary } from './playtest/visitors';

/**
 * The visit's heart (docs/reviews/2026-11-emotional-arc.md): one painted memory a visit, reachable
 * early, chosen from what happened at the chair; the recoil leads to Almost, which leaves one line
 * beside the room's first, ends the visit's card and is found on the next visit.
 */
const offerAt = (md: MemoryDirector, now: number, o: { free?: boolean; heartFree?: boolean; facing?: (id: string) => boolean; phase?: string } = {}) =>
  md.offer({ now, phase: o.phase ?? 'arrival', free: o.free ?? false, heartFree: o.heartFree ?? true, visibleFacing: o.facing ?? (() => false), departing: false, otherMemory: false });

describe('the heart, in the memory director', () => {
  it('is pointed at once it may come, in any phase, with nothing before it, in a busy room that is locally quiet', () => {
    const md = new MemoryDirector();
    md.setHeart('almost', 100);
    expect(offerAt(md, 90)).toBeNull();
    const o = offerAt(md, 101);
    expect(o?.id).toBe('almost');
    expect(o?.reink).toBeFalsy();
    // Not while the room isn't quiet for it either.
    const md2 = new MemoryDirector();
    md2.setHeart('almost', 100);
    expect(offerAt(md2, 101, { heartFree: false })).toBeNull();
  });

  it('never before HEART_EARLIEST, whatever it is given', () => {
    const md = new MemoryDirector();
    md.setHeart('woodland', 0);
    expect(offerAt(md, HEART_EARLIEST - 1)).toBeNull();
    expect(offerAt(md, HEART_EARLIEST)?.id).toBe('woodland');
  });

  it('may change until its line is pointed at, not after', () => {
    const md = new MemoryDirector();
    md.setHeart('woodland', 0);
    md.setHeart('almost', 80);
    expect(md.heart).toBe('almost');
    expect(offerAt(md, 81)?.id).toBe('almost');
    md.setHeart('things', 0);
    expect(md.heart).toBe('almost');
  });

  it('keeps the other hearts back while it waits, until it lapses', () => {
    const md = new MemoryDirector({});
    md.setHeart('almost', 80);
    expect(offerAt(md, 81)?.id).toBe('almost');
    // Woodland and Things may not be pointed at while Almost waits (even in their own phase).
    for (let t = 90; t < 81 + HEART_LAPSE; t += 10) {
      const o = offerAt(md, t, { free: true, phase: 'transform' });
      if (o) expect(['woodland', 'things']).not.toContain(o.id);
    }
  });

  it('is written again once, on its wall, if it was not taken up', () => {
    const md = new MemoryDirector();
    md.setHeart('almost', 80);
    expect(offerAt(md, 81)?.id).toBe('almost');
    const line = (id: string) => id === 'your-hand';
    expect(offerAt(md, 81 + HEART_REINK - 1, { facing: line })).toBeNull();
    const again = offerAt(md, 81 + HEART_REINK, { facing: line });
    expect(again?.id).toBe('almost');
    expect(again?.reink).toBe(true);
    expect(offerAt(md, 81 + HEART_REINK + 40, { facing: line })?.reink).toBeFalsy();
  });

  it('once it has played, no other painted memory claims its line', () => {
    const md = new MemoryDirector();
    md.setHeart('almost', 80);
    const start = md.update({ now: 81, visible: () => true, gazeId: null, gazeFor: 0, free: true, otherMemory: false, departing: false });
    expect(start).toBeNull();
    md.tapped('your-hand');
    const s = md.update({ now: 82, visible: () => true, gazeId: 'your-hand', gazeFor: 3, free: true, otherMemory: false, departing: false });
    expect(s?.id).toBe('almost');
    md.ended('almost', 120, true, true);
    for (const id of ['more-minutes', 'didnt-know-say', 'happiest-unneeded', 'door-open', 'cereal']) expect(md.claims(id), id).toBe(false);
  });

  it('only Almost leaves a line, and that line is the room\'s own pencil', () => {
    expect(Object.keys(HEART_ANSWER)).toEqual(['almost']);
    const a = PHRASE_BY_ID.get(HEART_ANSWER.almost)!;
    expect(a.tier).toBe('annotation');
    expect(a.text).toBe('I took my hand back.');
    expect(HEART_BY_SHAPE.recoiled).toBe('almost');
  });
});

describe('the heart, through whole visits', () => {
  const gr = new Rng(20261106);
  const genomes = CLASSES.flatMap((c) => [0, 1, 2].map((i) => drawGenome(c, gr, i)));
  const runs: VisitSummary[] = genomes.map((g) => liveVisit(g, 1, { seconds: 420 }));

  it('reaches the strongest memories, where the room before it seldom did', { timeout: 120_000 }, () => {
    const before = genomes.map((g) => liveVisit(g, 1, { seconds: 420, experiments: ['noHeart'] }));
    const strong = (r: VisitSummary) => r.reach.memories.some((m) => ['almost', 'things', 'woodland'].includes(m));
    expect(runs.filter(strong).length).toBeGreaterThan(before.filter(strong).length + 3);
    expect(before.every((r) => r.reach.heart === null)).toBe(true);
  });

  it('nothing painted begins after the heart, and the answer comes only after Almost, beside the first line', () => {
    for (const r of runs) {
      const h = r.reach.heart;
      if (h && r.reach.memories.includes(h)) expect(r.reach.memories[r.reach.memories.length - 1], r.genome).toBe(h);
      if (r.reach.answer) {
        expect(h).toBe('almost');
        expect(r.reach.memories).toContain('almost');
        expect(r.reach.answerAt!).toBeGreaterThan(r.reach.heartAt!);
      }
    }
  });

  it('the card is the visit\'s sentence only when the wall has the answer', () => {
    let couplets = 0;
    for (const r of runs) {
      if (r.reach.answer) {
        couplets++;
        expect(r.departure).toMatch(/^I wanted you to( stay\.)?\nI took my hand back\.$/);
      } else expect(r.departure).not.toContain('\n');
    }
    expect(couplets).toBeGreaterThan(0);
  });

  it('a returning visitor finds the last answer beside the first line', { timeout: 60_000 }, () => {
    const r = runs.find((x) => x.reach.answer)!;
    const g = genomes.find((x) => x.id === r.genome)!;
    const back = liveVisit(g, 7, { seconds: 120, past: { visits: 2, memoryCounts: r.memoryCounts, trace: null, answer: r.reach.answer } });
    expect(back.reach.kept).toBe(true);
    // And not on a first visit, nor from an id that isn't one of the room's answers.
    expect(runs.every((x) => !x.reach.kept)).toBe(true);
    const odd = liveVisit(g, 7, { seconds: 120, past: { visits: 2, memoryCounts: {}, trace: null, answer: 'didnt-know-how' } });
    expect(odd.reach.kept).toBe(false);
  });
});
