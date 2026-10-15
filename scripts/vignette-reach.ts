/**
 * How many vignettes a visit meets (docs/vignettes.md): each persona over seeds 1–8 and 600 s,
 * all recordings assumed kept. The personas' scripts end after two to four minutes; here each
 * keeps going by repeating the middle of its own script (60–240 s), so a ten-minute visit is
 * someone still moving about rather than someone standing frozen where their script ran out.
 *
 *   npx vite-node scripts/vignette-reach.ts
 */
import { PERSONAS, type Persona } from '../tests/playtest/personas';
import { visit } from '../tests/playtest/measure';
import { VIGNETTES } from '../src/content/vignettes';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SECONDS = Number(process.env.SECONDS ?? 600);
const looped = (p: Persona): Persona => ({ ...p, frame: (t) => p.frame(t < 240 ? t : 60 + ((t - 240) % 180)) });

const total: Record<string, number> = Object.fromEntries(VIGNETTES.map((v) => [v.id, 0]));
let all = 0;
for (const p of PERSONAS) {
  const per: number[] = [];
  const met: Record<string, number> = {};
  for (const s of SEEDS) {
    const r = visit(process.env.NOLOOP ? p : looped(p), SECONDS, s);
    const vs = r.devs.filter((d) => d.label.startsWith('vignette '));
    per.push(vs.length);
    for (const d of vs) {
      const id = d.label.slice(9);
      met[id] = (met[id] ?? 0) + 1;
      total[id]++;
    }
  }
  const n = per.reduce((a, b) => a + b, 0);
  all += n;
  console.log(`${p.id.padEnd(9)} ${n} in ${SEEDS.length} visits (${per.join(' ')}): ${Object.entries(met).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`);
}
console.log(`all       ${all} in ${PERSONAS.length * SEEDS.length} visits: ${Object.entries(total).map(([k, v]) => `${k} ${v}`).join(', ')}`);
