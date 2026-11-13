import { describe, it, expect } from 'vitest';
import { MemoryDirector } from '../src/state/MemoryDirector';
import { HEART_ANSWER, HEART_BY_SHAPE, HEART_EARLIEST, HEART_LAPSE, HEART_REINK } from '../src/content/memories';
import { PHRASE_BY_ID } from '../src/content/phrases';
import { Rng } from '../src/core/rng';
import { Director } from '../src/state/Director';
import { OPENING_WRITTEN, OPENING_SPOKEN, OPENING_UNFINISHED } from '../src/state/OpeningScore';
import { AVAILABLE, CLASSES, drawGenome, liveVisit, type VisitSummary } from './playtest/visitors';
import { classify } from './playtest/measure';

/**
 * The visit's heart (docs/reviews/2026-11-emotional-arc.md): one painted memory a visit, reachable
 * early, chosen from what happened at the chair; the recoil leads to Almost, which leaves one line
 * beside the room's first, ends the visit's card and is found on the next visit.
 */
const offerAt = (md: MemoryDirector, now: number, o: { free?: boolean; heartFree?: boolean; facing?: (id: string) => boolean; wall?: string; phase?: string } = {}) =>
  md.offer({ now, phase: o.phase ?? 'arrival', free: o.free ?? false, heartFree: o.heartFree ?? true, visibleFacing: o.facing ?? (() => false), facing: o.wall ?? 'north', departing: false, otherMemory: false });

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
    // It lapses only once HEART_LAPSE has gone by, not at it.
    expect(md.heartLapsed(81 + HEART_LAPSE)).toBe(false);
    expect(md.heartLapsed(81 + HEART_LAPSE + 1)).toBe(true);
    // The same visit, with another painted memory behind it (the others' own gate): at the boundary
    // the woodland is still kept back; just after, it may be pointed at.
    const visit = () => {
      const m = new MemoryDirector({});
      m.setHeart('almost', 80);
      expect(offerAt(m, 81)?.id).toBe('almost');
      return m;
    };
    const after = (m: MemoryDirector, now: number) => m.offer({ now, phase: 'transform', free: true, heartFree: true, visibleFacing: () => false, departing: false, otherMemory: false, kitchenPlayed: true, prefer: ['woodland'] });
    expect(after(visit(), 81 + HEART_LAPSE)?.id).not.toBe('woodland');
    expect(after(visit(), 81 + HEART_LAPSE + 1)?.id).toBe('woodland');
  });

  it('is written again once, on the wall it was written on, if it was not taken up', () => {
    const md = new MemoryDirector();
    md.setHeart('almost', 80);
    // Written where the visitor looked: the east wall, not its phrase's own (the north).
    expect(PHRASE_BY_ID.get('your-hand')!.surface).toBe('north');
    expect(offerAt(md, 81, { wall: 'east' })?.id).toBe('almost');
    expect(offerAt(md, 81 + HEART_REINK - 1, { wall: 'east' })).toBeNull();
    // Facing the phrase's own wall, nothing: the line written there would be another one.
    const own = (id: string) => id === 'your-hand';
    expect(offerAt(md, 81 + HEART_REINK, { wall: 'north', facing: own })).toBeNull();
    // Back on the wall it was written on: that line, written again (not the phrase in its own place).
    const again = offerAt(md, 81 + HEART_REINK + 1, { wall: 'east' });
    expect(again?.id).toBe('almost');
    expect(again?.reink).toBe(true);
    expect(again?.key).toBe('memory:your-hand');
    expect(offerAt(md, 81 + HEART_REINK + 40, { wall: 'east' })?.reink).toBeFalsy();
  });

  it('written again, it is measured on the wall it was written on, not its phrase\'s own', () => {
    const where = (id: string) => (id === 'your-hand' ? 'east' as const : undefined);
    expect(classify({ type: 'redraw', phraseId: 'your-hand', key: 'memory:your-hand', seconds: 3 }, where)?.surface).toBe('east');
    // The phrase in its own place stays where it is authored.
    expect(classify({ type: 'redraw', phraseId: 'your-hand', seconds: 3 }, where)?.surface).toBe('north');
  });

  it('written again, a shorter look begins it; written the first time, it takes the usual look', () => {
    const look = (md: MemoryDirector, now: number, gazeFor: number) =>
      md.update({ now, visible: () => true, gazeId: 'your-hand', gazeFor, free: true, otherMemory: false, departing: false, facing: 'east' });
    const md = new MemoryDirector();
    md.setHeart('almost', 80);
    expect(offerAt(md, 81, { wall: 'east' })?.id).toBe('almost');
    expect(look(md, 90, 1.6)).toBeNull();
    expect(offerAt(md, 81 + HEART_REINK, { wall: 'east' })?.reink).toBe(true);
    expect(look(md, 81 + HEART_REINK + 1, 1.6)?.id).toBe('almost');
  });

  it('a line that found no room is not spent: it is pointed at again', () => {
    const md = new MemoryDirector();
    md.setHeart('almost', 80);
    expect(offerAt(md, 81)?.id).toBe('almost');
    md.offerFailed('your-hand');
    expect(md.heartDue(82)).toBe(true);
    expect(offerAt(md, 130)?.id).toBe('almost');
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
    const strong = (r: VisitSummary) => r.reach.memories.some((m) => ['almost', 'things', 'woodland', 'shadows', 'drive'].includes(m));
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

  it('the card is the visit\'s sentence only when the answer is on the wall and has been in view', () => {
    let couplets = 0;
    for (const r of runs) {
      if (r.reach.answerRead) {
        couplets++;
        expect(r.reach.answer).toBe(r.reach.answerRead);
        expect(r.departure).toMatch(/^I wanted you to( stay\.)?\nI took my hand back\.$/);
      } else expect(r.departure).not.toContain('\n');
    }
    expect(couplets).toBeGreaterThan(0);
  });

  it('once Almost has been seen, its answer is left for the next visit, written yet or not', { timeout: 60_000 }, () => {
    for (const r of runs) {
      if (r.reach.answer) expect(r.reach.left).toBe(r.reach.answer);
      if (r.reach.left) expect(r.reach.memories).toContain('almost');
      if (r.reach.heart !== 'almost' || !r.reach.memories.includes('almost')) expect(r.reach.left).toBeNull();
    }
    // A short visit that ends in the memory's quiet leaves it too.
    const short = genomes.map((g) => liveVisit(g, 1, { seconds: 200 })).filter((r) => r.reach.left && !r.reach.answer);
    expect(short.length).toBeGreaterThan(0);
    for (const r of short) expect(r.reach.left).toBe('took-hand-back');
  });

  it('after the answer, nothing new is written on the north wall', () => {
    const answered = runs.filter((r) => r.reach.answer);
    expect(answered.length).toBeGreaterThan(0);
    for (const r of answered) expect(r.reach.northAfter, r.genome).toBe(0);
  });

  it('an answer that finds no room is not spent: the wall is held for it and it is written later', { timeout: 60_000 }, () => {
    // (Codex, PR #57: the wall full, the answer was lost and the north wall held for nothing.)
    const r = runs.find((x) => x.reach.answerAt !== null && x.reach.answerAt < 300)!;
    const g = genomes.find((x) => x.id === r.genome)!;
    const f = liveVisit(g, 1, { seconds: 420, failOnce: 'heart:' });
    expect(f.reach.answer).toBe('took-hand-back');
    expect(f.reach.answerAt!).toBeGreaterThan(r.reach.answerAt!);
    expect(f.reach.northAfter).toBe(0);
  });

  it('the last answer is not found while a memory plays (nothing is written then): it is found after', () => {
    // (CodeRabbit, PR #57: found during a memory, its line was refused and never looked for again.)
    const d = new Director({ seed: 3, visits: 2, memoryCounts: {}, trace: null, answer: 'took-hand-back' });
    d.scenes.setAvailable(AVAILABLE);
    d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
    d.memoryExternal('woodland');
    const still = { x: 0, z: 1.5, yaw: Math.PI / 2, pitch: -0.04, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false };
    const found = (n: number) => {
      let kept = false;
      for (let i = 0; i < n; i++) kept = d.tick(0.1, still, 'east').some((c) => c.rule === 'heart-kept') || kept;
      return kept;
    };
    expect(found(40)).toBe(false);
    d.memoryEnded('woodland', true, true);
    expect(found(20)).toBe(true);
  });

  it('nothing is offered on the north wall while it is held: the heart waits for another wall, not spent', () => {
    // (CodeRabbit, PR #57: offered there, its line was refused by the hold and the offer spent.)
    const d = new Director({ seed: 3, visits: 2, memoryCounts: {}, trace: null, answer: 'took-hand-back' });
    d.scenes.setAvailable(AVAILABLE);
    d.release({ written: OPENING_WRITTEN, spoken: OPENING_SPOKEN, unfinished: OPENING_UNFINISHED });
    const at = (yaw: number) => ({ x: 0, z: 1.5, yaw, pitch: -0.04, gazePhraseId: null, gazeChair: false, nearSurface: null, kneeling: false });
    const run = (s: number, facing: 'north' | 'east') => {
      const out: string[] = [];
      for (let t = 0; t < s; t += 0.1) for (const c of d.tick(0.1, at(facing === 'east' ? Math.PI / 2 : 0), facing)) out.push(c.rule);
      return out;
    };
    // The last visit's answer is found, then finds no room: the north wall is held for it (20 s).
    expect(run(HEART_EARLIEST, 'east')).toContain('heart-kept');
    d.writeFailed('heart:took-hand-back');
    d.scenes.setHeart('almost', 0);
    expect(d.scenes.heartDue(d.now)).toBe(true);
    expect(run(15, 'north')).not.toContain('memory-offer');
    expect(d.scenes.heartDue(d.now)).toBe(true);
    // Turned to another wall, it is offered there.
    expect(run(30, 'east')).toContain('memory-offer');
  });

  it('Almost let go unseen twice leaves nothing: its answer is about what happens in it', () => {
    // (CodeRabbit, PR #57: a painting withdrawn unseen twice counts as played, and its answer was left.)
    const d = new Director({ seed: 3 });
    d.scenes.setHeart('almost', 0);
    const counted = [1, 2].map(() => {
      d.memoryExternal('almost');
      return d.memoryEnded('almost', false, false);
    });
    // (The second time it counts as played: it was there to be seen.)
    expect(counted).toEqual([false, true]);
    expect(d.heartLeft()).toBeNull();
    // Cut off while it plays, already past its heart (a tab closed): it was seen, and it is left.
    const e = new Director({ seed: 3 });
    e.scenes.setHeart('almost', 0);
    expect(e.heartLeft()).toBeNull();
    expect(e.heartLeft('almost')).toBe(HEART_ANSWER.almost);
    expect(e.heartLeft('woodland')).toBeNull();
  });

  it('a returning visitor finds the last answer beside the first line', { timeout: 120_000 }, () => {
    const r = runs.find((x) => x.reach.answer)!;
    const g = genomes.find((x) => x.id === r.genome)!;
    const back = liveVisit(g, 7, { seconds: 120, past: { visits: 2, memoryCounts: r.memoryCounts, trace: null, answer: r.reach.left } });
    expect(back.reach.kept).toBe(true);
    // And not on a first visit, nor from an id that isn't one of the room's answers.
    expect(runs.every((x) => !x.reach.kept)).toBe(true);
    const odd = liveVisit(g, 7, { seconds: 120, past: { visits: 2, memoryCounts: {}, trace: null, answer: 'didnt-know-how' } });
    expect(odd.reach.kept).toBe(false);
    // A kept line that found no room is looked for again.
    const full = liveVisit(g, 7, { seconds: 120, past: { visits: 2, memoryCounts: r.memoryCounts, trace: null, answer: r.reach.left }, failOnce: 'heart:' });
    expect(full.reach.kept).toBe(true);
    // While it waits, the wall is held for it: nothing new is written or revealed there (cubic,
    // PR #57; without the hold, 34 of 72 such simulated returns wrote there in the wait).
    const waits = genomes.map((x) => liveVisit(x, 7, { seconds: 240, past: { visits: 2, memoryCounts: {}, trace: null, answer: 'took-hand-back' }, failOnce: 'heart:' }));
    expect(waits.filter((w) => w.reach.kept).length).toBeGreaterThan(waits.length / 2);
    for (const w of waits) expect(w.reach.northWhileKept, w.genome).toBe(0);
    // Forgotten, it isn't written, nor tried again (cubic, PR #57): "forget" pressed before it is found, or in the wait.
    const past = { visits: 2, memoryCounts: {}, trace: null, answer: 'took-hand-back' };
    for (const x of genomes.slice(0, 6)) expect(liveVisit(x, 7, { seconds: 240, past, forgetAt: 0 }).reach.kept, x.id).toBe(false);
    for (const w of waits.filter((x) => x.reach.kept && x.reach.keptFailedAt !== null).slice(0, 6)) {
      const g2 = genomes.find((x) => x.id === w.genome)!;
      const f = liveVisit(g2, 7, { seconds: 240, past, failOnce: 'heart:', forgetAt: w.reach.keptFailedAt! + 1 });
      expect(f.reach.keptFailedAt, w.genome).toBe(w.reach.keptFailedAt);
      expect(f.reach.kept, w.genome).toBe(false);
    }
  });
});
