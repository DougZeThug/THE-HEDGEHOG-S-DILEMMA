// Save a connector run's audio to audition/ under the names a ledger gives each generation
// (the narration ledger unless another is named).
// Usage: node scripts/fable/save_takes.mjs RUN_STATUS_JSON [LEDGER]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LEDGER = join(ROOT, process.argv[3] ?? 'scripts/fable/narration-ledger.json');
const run = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const byGen = Object.fromEntries(Object.entries(ledger.entries).map(([id, e]) => [e.generation, id]));

for (const g of run.generations) {
  const id = byGen[g.id];
  if (!id) { console.log('not in ledger:', g.id); continue; }
  const e = ledger.entries[id];
  if (e.review === 'approved') { console.log('approved, left alone:', id); continue; }
  if (g.status !== 'completed') { console.log(id, g.status); continue; }
  const res = await fetch(g.content_url);
  if (!res.ok) { console.log(id, 'download failed', res.status); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(ROOT, 'audition', e.file), buf);
  Object.assign(e, { status: 'saved', duration: g.duration_secs, bytes: buf.length, cost: Math.round(g.price.credits * 100) / 100 });
  console.log(id, g.duration_secs + ' s', buf.length + ' bytes');
}
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
