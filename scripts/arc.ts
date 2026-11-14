/**
 * The emotional arc battery (docs/reviews/2026-11-emotional-arc.md): the same closed-loop visitors
 * as the core-loop battery (tests/playtest/visitors.ts), run at several visit lengths, for arms that
 * change how the visit's strongest memories are reached, what they leave, and how the visit ends.
 *
 *   npx vite-node scripts/arc.ts
 *   ARMS='before=noHeart;after' HORIZONS=180,300,600 N=12 SEEDS=3 RETURNS=40 npx vite-node scripts/arc.ts
 *   REPORT=test-output/arc/arms.md …
 *
 * Everything here is simulated. The visitors' reactions are assumptions; "met" means a simulated
 * gaze rested on a line, not that anyone was moved. Read differences between arms on the same
 * visitors and seeds, never the numbers as what people feel.
 */
import { Rng } from '../src/core/rng';
import { interpretLocally } from '../src/interpret/LocalInterpreter';
import { readArms, startCapture, writeReport } from './lib/report';
import { CLASSES, adversaries, drawGenome, liveVisit, type Genome, type VisitSummary } from '../tests/playtest/visitors';

const N = Number(process.env.N ?? 12);
const SEEDS = Number(process.env.SEEDS ?? 3);
const ADV_SEEDS = Number(process.env.ADV_SEEDS ?? 4);
const RETURNS = Number(process.env.RETURNS ?? 40);
// (Each once, in the order given: a repeated length would be simulated twice and reported once.)
const HORIZONS = [...new Set((process.env.HORIZONS ?? '180,300,600').split(',').map(Number))];
if (!HORIZONS.length || HORIZONS.some((h) => !Number.isFinite(h) || h <= 0)) throw new Error(`HORIZONS must be visit lengths in seconds, greater than 0: ${process.env.HORIZONS}`);
startCapture();
const ARMS = readArms();

const genomes: Genome[] = [];
const gr = new Rng(20261106);
for (const cls of CLASSES) for (let i = 0; i < N; i++) genomes.push(drawGenome(cls, gr, i));
const advs = adversaries();
const interpretation = interpretLocally('the kettle, and you not saying anything');

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : NaN);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
// (A median of -0.4 s is 0 s, not "-0".)
const f0 = (x: number) => (Number.isFinite(x) ? (Math.round(x) || 0).toFixed(0) : '—');
const f1 = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10 || 0).toFixed(1) : '—');
const STRONG = ['almost', 'things', 'woodland', 'shadows', 'drive'];

const t0 = Date.now();
const runs: Record<string, Record<number, VisitSummary[]>> = {};
for (const arm of ARMS) {
  runs[arm.name] = {};
  for (const seconds of HORIZONS) {
    const rows: VisitSummary[] = [];
    const opt = { seconds, experiments: arm.experiments, arm: arm.name, interpretation };
    for (const g of genomes) for (let s = 1; s <= SEEDS; s++) rows.push(liveVisit(g, s, opt));
    for (const g of advs) for (let s = 1; s <= ADV_SEEDS; s++) rows.push(liveVisit(g, 100 + s, opt));
    // Second visits (at the longest horizon only): the same visitor, with what the first left.
    if (seconds === Math.max(...HORIZONS)) {
      for (let i = 0; i < RETURNS; i++) {
        const g = genomes[(i * 7) % genomes.length];
        const first = rows.find((r) => r.genome === g.id && r.seed === 1)!;
        rows.push(liveVisit(g, 1000 + i, { ...opt, past: { visits: 2, memoryCounts: first.memoryCounts, trace: first.leaving === 'close' ? 'close' : null, answer: first.reach.left } }));
      }
    }
    runs[arm.name][seconds] = rows;
  }
}
const total = Object.values(runs).flatMap((h) => Object.values(h)).reduce((a, r) => a + r.length, 0);
console.log(`${total} visits in ${((Date.now() - t0) / 1000).toFixed(1)} s. Simulated visitors; their reactions are assumptions.\n`);

const firsts = (rows: VisitSummary[]) => rows.filter((r) => r.visit === 1);

console.log('## Does a visit reach one of the strongest memories, and when? (first visits)\n');
console.log(`| arm | length | n | any of ${STRONG.join('/')} | ${STRONG.join(' | ')} | door | bedroom | cereal | kitchen light | painted / visit | first strong (median s) |`);
console.log(`|---|---|---|---|${STRONG.map(() => '---').join('|')}|---|---|---|---|---|---|`);
for (const [name, h] of Object.entries(runs)) for (const [sec, rows] of Object.entries(h)) {
  const r = firsts(rows);
  const strongAt = r.map((x) => x.reach.memories.find((m) => STRONG.includes(m))).filter(Boolean);
  // (The first of them to begin, heart or not: the before arm reaches them without one.)
  const firstStrong: number[] = [];
  for (const x of r) {
    const ts = STRONG.map((m) => x.reach.memoryAt[m]).filter((t) => t !== undefined);
    if (ts.length) firstStrong.push(Math.min(...ts));
  }
  console.log(`| ${name} | ${sec} s | ${r.length} | ${pct(strongAt.length, r.length)} | ${STRONG.map((m) => pct(r.filter((x) => x.reach.memories.includes(m)).length, r.length)).join(' | ')} | ${pct(r.filter((x) => x.reach.memories.includes('door')).length, r.length)} | ${pct(r.filter((x) => x.reach.memories.includes('bedroom')).length, r.length)} | ${pct(r.filter((x) => x.reach.memories.includes('cereal')).length, r.length)} | ${pct(r.filter((x) => x.reach.kitchen).length, r.length)} | ${f1(mean(r.map((x) => x.reach.memories.length + (x.reach.kitchen ? 1 : 0))))} | ${f0(median(firstStrong))} |`);
}

console.log('\n## By kind of visitor, at each length: reached any strongest memory\n');
console.log(`| arm | length | ${[...CLASSES, 'adversary'].join(' | ')} |`);
console.log(`|---|---|${[...CLASSES, 'adversary'].map(() => '---').join('|')}|`);
for (const [name, h] of Object.entries(runs)) for (const [sec, rows] of Object.entries(h)) {
  const r = firsts(rows);
  console.log(`| ${name} | ${sec} s | ${[...CLASSES, 'adversary'].map((c) => { const rs = r.filter((x) => x.cls === c); return pct(rs.filter((x) => x.reach.memories.some((m) => STRONG.includes(m))).length, rs.length); }).join(' | ')} |`);
}

console.log('\n## The heart: chosen, seen, what it left, whether they came back to it (first visits)\n');
console.log('| arm | length | heart chosen | heart seen | which (seen) | recoiled at | Almost, of those recoiled at | recoil → Almost (median s) | pointed at, never begun | answer written | answer in view (card ends on it) | left for the next visit | north-wall lines after the answer (mean) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [name, h] of Object.entries(runs)) for (const [sec, rows] of Object.entries(h)) {
  const r = firsts(rows);
  const chosen = r.filter((x) => x.reach.heart);
  const seen = chosen.filter((x) => x.reach.memories.includes(x.reach.heart!));
  const which: Record<string, number> = {};
  for (const x of seen) which[x.reach.heart!] = (which[x.reach.heart!] ?? 0) + 1;
  const recoiled = r.filter((x) => x.reach.recoiledAt !== null);
  const almost = recoiled.filter((x) => x.reach.memories.includes('almost'));
  const lag = almost.map((x) => x.reach.heart === 'almost' && x.reach.heartAt !== null ? x.reach.heartAt - x.reach.recoiledAt! : NaN).filter(Number.isFinite);
  const pointed = r.filter((x) => x.reach.heartOfferedAt !== null);
  const never = pointed.filter((x) => !x.reach.memories.includes(x.reach.heart!));
  const written = r.filter((x) => x.reach.answerAt !== null);
  // (In view: the Director's own measure, the answer's wall faced in the simulation, a frustum test
  // in the browser. The simulated visitors can't perceive a later annotation, so "looked at" is not measured.)
  const read = written.filter((x) => x.reach.answerRead !== null);
  const left = r.filter((x) => x.reach.left !== null);
  console.log(`| ${name} | ${sec} s | ${pct(chosen.length, r.length)} | ${pct(seen.length, r.length)} | ${JSON.stringify(which)} | ${pct(recoiled.length, r.length)} | ${pct(almost.length, recoiled.length)} | ${f0(median(lag))} | ${pct(never.length, pointed.length)} | ${pct(written.length, r.length)} | ${pct(read.length, r.length)} | ${pct(left.length, r.length)} | ${f1(mean(written.map((x) => x.reach.northAfter)))} |`);
}

console.log('\n## Restraint (first visits; medians unless said)\n');
console.log('| arm | length | developments / min | voices | overlaps | imposed quiet (mean) | passive 30 s windows (outside memories) | held silence | vignettes / visit |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [name, h] of Object.entries(runs)) for (const [sec, rows] of Object.entries(h)) {
  const r = firsts(rows);
  const pw = r.reduce((p, x) => ({ w: p.w + x.passive.windows, e: p.e + x.passive.empty, wo: p.wo + x.passive.windows - x.passive.inMemory, eo: p.eo + x.passive.emptyOutside }), { w: 0, e: 0, wo: 0, eo: 0 });
  console.log(`| ${name} | ${sec} s | ${f1(median(r.map((x) => x.perMinute)))} | ${f1(median(r.map((x) => x.voices)))} | ${f1(mean(r.map((x) => x.overlaps)))} | ${pct(mean(r.map((x) => x.imposedQuiet)) * 100, 100)} | ${pct(pw.e, pw.w)} (${pct(pw.eo, pw.wo)}) | ${pct(r.filter((x) => x.reach.held).length, r.length)} | ${f1(mean(r.map((x) => x.reach.vignettes.length)))} |`);
}

console.log('\n## How the visit ends (first visits, by the menu at that length)\n');
for (const [name, h] of Object.entries(runs)) for (const [sec, rows] of Object.entries(h)) {
  const r = firsts(rows);
  const dep: Record<string, number> = {};
  for (const x of r) dep[x.departure.replace('\n', ' / ')] = (dep[x.departure.replace('\n', ' / ')] ?? 0) + 1;
  const top = Math.max(...Object.values(dep));
  console.log(`**${name}, ${sec} s** (largest share ${pct(top, r.length)}): ${Object.entries(dep).sort((a, b) => b[1] - a[1]).map(([k, v]) => `"${k}" ${v}`).join(', ')}`);
}

console.log('\n## Coming back (second visits)\n');
// (Back on the wall: the room wrote it there, `heart-kept`; not a look at it, which isn't simulated.)
console.log('| arm | n | last visit\'s answer back on the wall (of those that left one) | a heart seen | a different heart from last time | same heart again | painted / visit |');
console.log('|---|---|---|---|---|---|---|');
for (const [name, h] of Object.entries(runs)) {
  const rows = h[Math.max(...HORIZONS)];
  const sec = rows.filter((r) => r.visit === 2);
  let diff = 0, same = 0, hadAnswer = 0;
  for (const s of sec) {
    const first = rows.find((r) => r.visit === 1 && r.genome === s.genome && r.seed === 1)!;
    if (first.reach.left) hadAnswer++;
    const now = s.reach.heart && s.reach.memories.includes(s.reach.heart) ? s.reach.heart : null;
    const then = first.reach.heart && first.reach.memories.includes(first.reach.heart) ? first.reach.heart : null;
    if (now && then && now !== then) diff++;
    if (now && then && now === then) same++;
  }
  console.log(`| ${name} | ${sec.length} | ${sec.filter((x) => x.reach.kept).length} of ${hadAnswer} | ${pct(sec.filter((x) => x.reach.heart && x.reach.memories.includes(x.reach.heart)).length, sec.length)} | ${diff} | ${same} | ${f1(mean(sec.map((x) => x.reach.memories.length + (x.reach.kitchen ? 1 : 0))))} |`);
}

writeReport();
