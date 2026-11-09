/**
 * How many vignettes a visit meets (docs/vignettes.md): each persona over seeds 1–40 (`N=…`
 * for another count) and 600 s, with the vignettes visitors can meet now (every line kept, from
 * public/voices/manifest.json; `ALL=1`: as if all were; `LIVE=rain,…`: these too). Eight seeds
 * were too few: counts moved by several for no reason (interaction review, 2026-10-27). The personas' scripts end after two to four minutes; here each
 * keeps going by repeating the middle of its own script (60–240 s), so a ten-minute visit is
 * someone still moving about rather than someone standing frozen where their script ran out.
 *
 *   npx vite-node scripts/vignette-reach.ts
 */
import { PERSONAS, type Persona } from '../tests/playtest/personas';
import { visit } from '../tests/playtest/measure';
import { readFileSync } from 'node:fs';
import { VIGNETTES, VIGNETTE_BY_ID, spokenLines, lineKey } from '../src/content/vignettes';
import { MemoryDirector } from '../src/state/MemoryDirector';
import { allVersions, versionKeys, voicesId } from '../src/content/memory-voices';

// What the App does (vignettesAvailable): a vignette plays only once every line it may say is kept.
const manifest = JSON.parse(readFileSync('public/voices/manifest.json', 'utf8')) as Record<string, string[]>;
const live = new Set(VIGNETTES.filter((def) => Object.keys(def.variants).flatMap((k) => spokenLines(def, k)).every((l) => manifest[lineKey(def, l)]?.length)).map((d) => d.id));
for (const id of (process.env.LIVE ?? '').split(',').filter(Boolean)) live.add(id);
if (!process.env.ALL) {
  const orig = MemoryDirector.prototype.isAvailable;
  MemoryDirector.prototype.isAvailable = function (id: string) {
    return orig.call(this, id) && (!VIGNETTE_BY_ID.has(id) || live.has(id));
  };
  // And what the App tells the Director (setAvailable), which begin() reads: the live vignettes, and
  // the painted memories' voices whose every line is kept.
  const may = new Set<string>([...live, ...allVersions().filter((v) => versionKeys(v.id, v.variant, v.version).every((k) => manifest[k]?.length)).map((v) => voicesId(v.id, v.variant, v.version))]);
  const update = MemoryDirector.prototype.update;
  MemoryDirector.prototype.update = function (st) {
    if (!(this as unknown as { available: Set<string> | null }).available) this.setAvailable(may);
    return update.call(this, st);
  };
  console.log(`live: ${[...live].join(', ')}`);
}

const SEEDS = Array.from({ length: Number(process.env.N ?? 40) }, (_, i) => i + 1);
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
// (Five scripted behaviours: the seeds vary the room, not the visitor. Read anything under about
// 10 in 200 as "rare", not as a number to tune against; NOTICE=… moves the whole table.)
console.log('(5 scripted behaviours; seeds vary the room, not the visitor; under ~10/200 is "rare")');
