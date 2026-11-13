/**
 * The core-loop battery (docs/reviews/2026-11-core-loop.md): closed-loop visitors
 * (tests/playtest/visitors.ts) drawn from six classes, plus visitors chosen to break things,
 * plus second visits, run through the real Director, for one or more arms (sets of design
 * experiments) on identical visitors and seeds.
 *
 *   npx vite-node scripts/experiment.ts
 *   ARMS='base;A1=approachManner;A2=airLine' npx vite-node scripts/experiment.ts
 *   N=8 SEEDS=3 RETURNS=10 …      (genomes per class, seeds per genome, second-visit pairs)
 *   OUT=test-output/core-loop/base.json …   (every visit's numbers)
 *   REPORT=test-output/core-loop/base.md …   (the printed tables; the files in docs/reviews/core-loop
 *                                              carry notes on top of a run, so copy, don't overwrite)
 *
 * Everything here is simulated: the visitors' reactions are assumptions (visitors.ts). Read the
 * numbers as differences between arms on the same visitors, not as what people feel.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Rng } from '../src/core/rng';
import { Director } from '../src/state/Director';
import { interpretLocally } from '../src/interpret/LocalInterpreter';
import { CLASSES, adversaries, drawGenome, liveVisit, type Genome, type VisitSummary } from '../tests/playtest/visitors';

// (REPORT=file also writes what is printed: the guard forbids redirecting a script's output.)
const printed: string[] = [];
const log = console.log;
console.log = (...xs: unknown[]) => {
  printed.push(xs.join(' '));
  log(...xs);
};
const N = Number(process.env.N ?? 27);
const SEEDS = Number(process.env.SEEDS ?? 5);
const ADV_SEEDS = Number(process.env.ADV_SEEDS ?? 12);
const RETURNS = Number(process.env.RETURNS ?? 30);
const SECONDS = Number(process.env.SECONDS ?? 600);
const ARMS = (process.env.ARMS ?? 'base').split(';').map((a) => {
  const [name, list] = a.includes('=') ? a.split('=') : [a, ''];
  return { name, experiments: list.split(',').filter(Boolean) };
});
// An arm naming an experiment the Director doesn't define would run the same code as the others.
const unknown = [...new Set(ARMS.flatMap((a) => a.experiments))].filter((e) => !Director.EXPERIMENTS.includes(e));
if (unknown.length) throw new Error(`no such experiment: ${unknown.join(', ')} (defined: ${Director.EXPERIMENTS.join(', ') || 'none'})`);

const genomes: Genome[] = [];
const gr = new Rng(20261106);
for (const cls of CLASSES) for (let i = 0; i < N; i++) genomes.push(drawGenome(cls, gr, i));
const advs = adversaries();

const interpretation = interpretLocally('the kettle, and you not saying anything');

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : NaN);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const entropy = (counts: Record<string, number>) => {
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!n) return 0;
  let h = 0;
  for (const c of Object.values(counts)) if (c) h -= (c / n) * Math.log2(c / n);
  return h;
};

const out: Record<string, VisitSummary[]> = {};
const t0 = Date.now();
for (const arm of ARMS) {
  const rows: VisitSummary[] = [];
  for (const g of genomes) for (let s = 1; s <= SEEDS; s++) rows.push(liveVisit(g, s, { seconds: SECONDS, experiments: arm.experiments, arm: arm.name, interpretation }));
  for (const g of advs) for (let s = 1; s <= ADV_SEEDS; s++) rows.push(liveVisit(g, 100 + s, { seconds: SECONDS, experiments: arm.experiments, arm: arm.name, interpretation }));
  // Second visits: the same visitor comes back, with what the first visit left (counts, the trace).
  for (let i = 0; i < RETURNS; i++) {
    const g = genomes[(i * 7) % genomes.length];
    const first = rows.find((r) => r.genome === g.id && r.seed === 1)!;
    rows.push(liveVisit(g, 1000 + i, { seconds: SECONDS, experiments: arm.experiments, arm: arm.name, interpretation, past: { visits: 2, memoryCounts: first.memoryCounts, trace: first.leaving === 'close' ? 'close' : null } }));
  }
  out[arm.name] = rows;
}
const ms = Date.now() - t0;
const total = Object.values(out).reduce((a, r) => a + r.length, 0);
console.log(`${total} visits in ${(ms / 1000).toFixed(1)} s (${(ms / total).toFixed(0)} ms each). Simulated visitors; reactions are assumptions.\n`);

const firsts = (rows: VisitSummary[]) => rows.filter((r) => r.visit === 1);

// ── Agency ──
// (Decide on these: perceptible answers per device against their own placebo. Ignore entropy, field
// deltas and anything an act counts for itself; skeptic review, 2026-11-06.)
console.log('## Is what they do answered, in place, within 8 s? (first visits; caused answers, perceived)\n');
const KINDS = ['meet', 'return', 'tap', 'turn', 'approach', 'kneel', 'tap-chair', 'pause-chair', 'withdraw', 'pause', 'write'];
const PLACEBO_OF: Record<string, string> = { meet: 'meet', return: 'meet', tap: 'meet', turn: 'turn', approach: 'approach', kneel: 'approach', 'tap-chair': 'approach', 'pause-chair': 'approach', withdraw: 'withdraw', pause: 'withdraw', write: 'withdraw' };
console.log(`| arm | device | ${KINDS.map((k) => `${k}: n · caused (placebo)`).join(' | ')} |`);
console.log(`|---|---|${KINDS.map(() => '---').join('|')}|`);
for (const [name, rows] of Object.entries(out)) for (const dev of ['desktop', 'phone'] as const) {
  const rs = firsts(rows).filter((r) => r.device === dev);
  const cells = KINDS.map((k) => {
    let n = 0, c = 0, pn = 0, ph = 0;
    for (const r of rs) {
      const row = r.actions[k];
      if (row) {
        n += row.n;
        c += row.caused;
      }
      const p = r.placeboBy[PLACEBO_OF[k]];
      if (p) {
        pn += p.n;
        ph += p.hit;
      }
    }
    return `${n} · ${pct(c, n)} (${pct(ph, pn)})`;
  });
  console.log(`| ${name} | ${dev} | ${cells.join(' | ')} |`);
}

// ── Coming to the chair ──
console.log('\n## Arriving at the chair: the first, a return after going away, again (first visits)\n');
console.log('| arm | device | first · return · again | answered: first | return | again |');
console.log('|---|---|---|---|---|---|');
for (const [name, rows] of Object.entries(out)) for (const dev of ['desktop', 'phone'] as const) {
  const aps = firsts(rows).filter((r) => r.device === dev).flatMap((r) => r.approaches);
  const by = (m: string) => aps.filter((a) => a.manner === m);
  const ans = (m: string) => `${pct(by(m).filter((a) => a.answer !== 'none').length, by(m).length)} ${JSON.stringify(by(m).reduce((o, a) => ({ ...o, [a.answer]: (o[a.answer] ?? 0) + 1 }), {} as Record<string, number>))}`;
  console.log(`| ${name} | ${dev} | ${by('first').length} · ${by('return').length} · ${by('again').length} | ${ans('first')} | ${ans('return')} | ${ans('again')} |`);
}

// ── Pacing and restraint ──
console.log('\n## Restraint and passivity (first visits; medians unless said)\n');
console.log('| arm | per min | longest seen gap | voices / visit | imposed quiet (mean) | most own in 20 s (max) | overlaps | same-kind repeats | passive 30 s windows | identical answer to a repeated act |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [name, rows] of Object.entries(out)) {
  const r = firsts(rows);
  const pw = r.reduce((p, x) => ({ w: p.w + x.passive.windows, e: p.e + x.passive.empty }), { w: 0, e: 0 });
  console.log(`| ${name} | ${f1(median(r.map((x) => x.perMinute)))} | ${f1(median(r.map((x) => x.longestSeenGap)))} | ${f1(median(r.map((x) => x.voices)))} | ${pct(mean(r.map((x) => x.imposedQuiet)) * 100, 100)} | ${Math.max(...r.map((x) => x.most20))} | ${f1(median(r.map((x) => x.overlaps)))} | ${f1(median(r.map((x) => x.repeatsSameKind)))} | ${pct(pw.e, pw.w)} | ${pct(r.reduce((a, x) => a + x.vending.same, 0), r.reduce((a, x) => a + x.vending.pairs, 0))} of ${r.reduce((a, x) => a + x.vending.pairs, 0)} |`);
}

// ── Reach ──
console.log('\n## What a visit reaches (first visits)\n');
const MEMS = ['cereal', 'woodland', 'almost', 'things', 'shadows', 'drive', 'bedroom', 'door'];
console.log(`| arm | class | n | any painted | kitchen light | ${MEMS.join(' | ')} | vignettes / visit | "stay" finished (median s) | air | held silence | table | first memory (median s) | offers / visit |`);
console.log(`|---|---|---|---|---|${MEMS.map(() => '---').join('|')}|---|---|---|---|---|---|---|`);
for (const [name, rows] of Object.entries(out)) {
  for (const cls of [...CLASSES, 'adversary', 'all']) {
    const r = firsts(rows).filter((x) => cls === 'all' || x.cls === cls);
    if (!r.length) continue;
    const fin = r.filter((x) => x.reach.finishedAt !== null);
    console.log(`| ${name} | ${cls} | ${r.length} | ${pct(r.filter((x) => x.reach.memories.length).length, r.length)} | ${pct(r.filter((x) => x.reach.kitchen).length, r.length)} | ${MEMS.map((m) => pct(r.filter((x) => x.reach.memories.includes(m)).length, r.length)).join(' | ')} | ${f1(mean(r.map((x) => x.reach.vignettes.length)))} | ${pct(fin.length, r.length)} (${f1(median(fin.map((x) => x.reach.finishedAt!)))}) | ${pct(r.filter((x) => x.reach.air).length, r.length)} | ${pct(r.filter((x) => x.reach.held).length, r.length)} | ${pct(r.filter((x) => x.reach.table).length, r.length)} | ${f1(median(r.filter((x) => x.reach.firstMemoryAt !== null).map((x) => x.reach.firstMemoryAt!)))} | ${f1(mean(r.map((x) => x.reach.offers)))} |`);
  }
}

// ── Situations and phases ──
console.log('\n## Situations, phases, leaving (first visits)\n');
for (const [name, rows] of Object.entries(out)) {
  const r = firsts(rows);
  const sit: Record<string, number> = {};
  for (const x of r) for (const s of x.reach.situations) sit[s] = (sit[s] ?? 0) + 1;
  const dep: Record<string, number> = {};
  for (const x of r) dep[x.departure] = (dep[x.departure] ?? 0) + 1;
  const turners = r.filter((x) => x.cls !== 'adversary' && x.genome && rowsLeave(x) === 'turn');
  console.log(`**${name}.** situations ${JSON.stringify(sit)}; contradiction median ${f1(median(r.filter((x) => x.phases.contradiction !== undefined).map((x) => x.phases.contradiction)))} s, transform ${f1(median(r.filter((x) => x.phases.transform !== undefined).map((x) => x.phases.transform)))} s (reached ${pct(r.filter((x) => x.phases.transform !== undefined).length, r.length)}); leaving 'close' ${pct(r.filter((x) => x.leaving === 'close').length, r.length)}; left by the way out: ${turners.filter((x) => x.leftInRoom !== null).length} of ${turners.length} assigned to leave by the door, unintended ${r.filter((x) => x.falseLeave).length}, let-go begun ${r.reduce((a, x) => a + x.ebbs, 0)}`);
  const top = Math.max(...Object.values(dep));
  console.log(`  departure lines (largest share ${pct(top, r.length)}): ${Object.entries(dep).sort((a, b) => b[1] - a[1]).map(([k, v]) => `"${k}" ${v}`).join(', ')}`);
}
function rowsLeave(x: VisitSummary) {
  return [...genomes, ...advs].find((g) => g.id === x.genome)?.leave;
}

// ── Second visits ──
console.log('\n## Coming back (second visits)\n');
console.log('| arm | n | new answers vs first visit | painted memory | new painted memory | vignettes |');
console.log('|---|---|---|---|---|---|');
for (const [name, rows] of Object.entries(out)) {
  const sec = rows.filter((r) => r.visit === 2);
  const novelty: number[] = [];
  let newMem = 0;
  for (const s of sec) {
    const first = rows.find((r) => r.visit === 1 && r.genome === s.genome && r.seed === 1)!;
    const seen = new Set(first.labels);
    novelty.push(s.labels.filter((l) => !seen.has(l)).length / Math.max(1, s.labels.length));
    if (s.reach.memories.some((m) => !first.reach.memories.includes(m))) newMem++;
  }
  console.log(`| ${name} | ${sec.length} | ${pct(mean(novelty) * 100, 100)} | ${pct(sec.filter((x) => x.reach.memories.length).length, sec.length)} | ${pct(newMem, sec.length)} | ${f1(mean(sec.map((x) => x.reach.vignettes.length)))} |`);
}

// ── Adversaries ──
console.log('\n## Visitors chosen to break things\n');
console.log('| arm | visitor | per min | longest seen gap | voices | answered (all actions) | painted | false leave | leaving trace |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [name, rows] of Object.entries(out)) for (const g of advs) {
  const r = rows.filter((x) => x.genome === g.id);
  let n = 0, a = 0;
  for (const x of r) for (const row of Object.values(x.actions)) {
    n += row.n;
    a += row.answered;
  }
  console.log(`| ${name} | ${g.id} | ${f1(median(r.map((x) => x.perMinute)))} | ${f1(median(r.map((x) => x.longestSeenGap)))} | ${f1(median(r.map((x) => x.voices)))} | ${pct(a, n)} | ${pct(r.filter((x) => x.reach.memories.length).length, r.length)} | ${r.filter((x) => x.falseLeave).length} | ${pct(r.filter((x) => x.leaving === 'close').length, r.length)} close |`);
}

for (const f of [process.env.OUT, process.env.REPORT]) if (f) mkdirSync(dirname(f), { recursive: true });
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out));
if (process.env.REPORT) writeFileSync(process.env.REPORT, printed.join('\n') + '\n');
