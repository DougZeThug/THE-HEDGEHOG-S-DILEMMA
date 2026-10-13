/**
 * Accelerated playtest report: five personas × several seeds through the real Director.
 *   npx vite-node scripts/playtest.ts            (summary table)
 *   npx vite-node scripts/playtest.ts -- --log   (also each persona's first 180 s, seed 1)
 * Writes the same report as Markdown when OUT=<file> is set.
 */
import { writeFileSync } from 'node:fs';
import { PERSONAS } from '../tests/playtest/personas';
import { visit, summarise, WINDOWS, meaningful } from '../tests/playtest/measure';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const out: string[] = [];
const say = (s = '') => {
  out.push(s);
  console.log(s);
};

say('# Pacing playtest (engine time, median of ' + SEEDS.length + ' seeds)\n');
for (const p of PERSONAS) {
  const runs = SEEDS.map((s) => visit(p, 300, s));
  say(`## ${p.label} (${p.device})\n`);
  say('| window | first response | first anything | per min | voices (recorded) | other sound/music | writing (unseen) | silences | longest gap (seen/heard) | overlaps | reads | meetings (returns) | approaches | taps |');
  say('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const w of WINDOWS) {
    const s = summarise(runs, w);
    const r = runs[0].recognised[w];
    const fr = (x: number) => (x > w ? '—' : `${x}s`);
    say(`| ${w}s | ${fr(s.firstResponse)} | ${fr(s.firstAnything)} | ${s.perMinute} | ${s.voices} (${s.recordedVoices}) | ${s.otherSounds} | ${s.text} (${s.textUnseen}) | ${s.silences} | ${s.longestGap}s (${s.longestSeenGap}s) | ${s.overlaps} | ${r.reads} | ${r.meetings} (${r.returns}) | ${r.approaches} | ${r.taps} |`);
  }
  const ph = runs.map((r) => r.phases.map((x) => `${x.phase[0]}@${Math.round(x.t)}`).join(' ')).slice(0, 4);
  say(`\nphases (first 4 seeds): ${ph.join(' · ')}`);
  const interrupts = runs.reduce((a, r) => a + r.interruptions, 0);
  say(`interruptions (stopVoice), all seeds: ${interrupts}\n`);
  if (process.argv.includes('--log')) {
    say('```');
    for (const d of runs[0].devs.filter((x) => x.t <= 180)) say(`${String(d.t).padStart(6)}  ${d.responsive ? '•' : ' '} ${d.kind.padEnd(7)} ${d.rule.padEnd(28)} ${d.label}${d.seen ? '' : '  (unseen)'}`);
    say('```\n');
  }
  void meaningful;
}
if (process.env.OUT) writeFileSync(process.env.OUT, out.join('\n') + '\n');
