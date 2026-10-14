/**
 * How reachable the living memories are (docs/reviews/2026-10-living-memories.md, the gate
 * before more scenes): for each persona over seeds 1–8 and 300 s, when cereal opens, and how
 * often each candidate line (the bedroom's, the door's) is looked at for 2 s or more.
 *
 *   npx vite-node scripts/memory-reach.ts
 */
import { PERSONAS } from '../tests/playtest/personas';
import { visit } from '../tests/playtest/measure';
import { Director } from '../src/state/Director';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LINES = ['happiest-unneeded', 'door-open'];
for (const p of PERSONAS) {
  const firsts: (number | null)[] = [];
  const looked: Record<string, number> = Object.fromEntries(LINES.map((l) => [l, 0]));
  for (const s of SEEDS) {
    // Watch the gaze the Director sees.
    const seen: Record<string, number> = {};
    const orig = Director.prototype.tick;
    Director.prototype.tick = function (dt, input, facing) {
      const g = input.gazePhraseId;
      if (g && LINES.includes(g)) seen[g] = Math.max(seen[g] ?? 0, (this as Director).visitor.gazeFor);
      return orig.call(this, dt, input, facing);
    };
    const r = visit(p, 300, s);
    Director.prototype.tick = orig;
    firsts.push(r.devs.find((d) => d.label.startsWith('memory-scene'))?.t ?? null);
    for (const l of LINES) if ((seen[l] ?? 0) >= 2) looked[l]++;
  }
  const got = firsts.filter((x): x is number => x !== null).sort((a, b) => a - b);
  const median = got.length ? got[Math.floor((got.length - 1) / 2)] : null;
  console.log(
    `${p.id.padEnd(9)} cereal in ${got.length}/${SEEDS.length} visits, median ${median ?? '—'} s` +
      LINES.map((l) => `; ${l} read ≥2 s in ${looked[l]}/${SEEDS.length}`).join(''),
  );
}
