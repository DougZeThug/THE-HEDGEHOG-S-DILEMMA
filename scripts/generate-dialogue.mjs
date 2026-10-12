#!/usr/bin/env node
/**
 * Generate recorded voice performances for selected phrases, offline, with ElevenLabs.
 * The installation never calls ElevenLabs at runtime: it only plays the files listed in
 * public/voices/manifest.json.
 *
 *   node scripts/generate-dialogue.mjs --dry-run            plan + cost estimate (no key needed)
 *   ELEVENLABS_API_KEY=… node scripts/generate-dialogue.mjs --pilot
 *   ELEVENLABS_API_KEY=… node scripts/generate-dialogue.mjs --budget=1200
 *   … --only=stay--tender,crumbs   … --regenerate=stay--tender   … --no-stt
 *   node scripts/generate-dialogue.mjs --approve=stay--tender --reject=closer--flat   (after listening)
 *   node scripts/generate-dialogue.mjs --manifest-only
 *
 * Direction:  src/content/dialogue.json   (authored)
 * Ledger:     scripts/dialogue-ledger.json (status, hashes, costs, transcripts, review)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBudget, buildManifest, emptyLedger, planJobs, runJobs, validateDirection } from './dialogue-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTION = join(ROOT, 'src/content/dialogue.json');
const LEDGER = join(ROOT, 'scripts/dialogue-ledger.json');
const VOICES = join(ROOT, 'public/voices');
const MANIFEST = join(VOICES, 'manifest.json');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

const direction = JSON.parse(readFileSync(DIRECTION, 'utf8'));
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : emptyLedger();
const saveLedger = async (l) => writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
const fileExists = (f) => existsSync(join(VOICES, f));

// Authored phrase texts, read from the corpus source so captions and recordings can be checked against it.
const src = readFileSync(join(ROOT, 'src/content/phrases.ts'), 'utf8');
const texts = new Map();
for (const m of src.matchAll(/p\('([^']+)',\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
  const raw = m[2];
  texts.set(m[1], raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'"));
}
const problems = validateDirection(direction, (id) => texts.get(id));
if (problems.length) {
  console.error('Direction file problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

function writeManifest() {
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const next = buildManifest(manifest, direction, ledger, fileExists);
  writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n');
  const phrases = Object.keys(next).filter((k) => k.startsWith('phrase:'));
  console.log(`manifest: ${phrases.length} phrases with recorded performances`);
}

// Review decisions are made by a person who has listened.
for (const [flag, value] of [['approve', 'approved'], ['reject', 'rejected']]) {
  for (const id of list(args[flag]) ?? []) {
    if (!ledger.entries[id]) {
      console.error(`no recording for ${id}`);
      continue;
    }
    ledger.entries[id].review = value;
    console.log(`${id}: ${value}`);
  }
}
if (args.approve || args.reject) {
  await saveLedger(ledger);
  writeManifest();
  process.exit(0);
}
if (args['manifest-only']) {
  writeManifest();
  process.exit(0);
}

const budget = Number(args.budget ?? 1500);
const { jobs, skipped } = planJobs(direction, ledger, { only: list(args.only), regenerate: list(args.regenerate) ?? [], pilot: !!args.pilot, fileExists });
const { run, queued, estimate } = applyBudget(jobs, budget);
console.log(`plan: ${jobs.length} to generate (~${jobs.reduce((s, j) => s + j.estimate, 0)} credits), ${skipped.length} skipped; budget ${budget} → running ${run.length} (~${estimate} credits), ${queued.length} left queued`);
for (const s of skipped) console.log(`  skip ${s.id}: ${s.reason}`);
for (const q of queued) console.log(`  queued (budget) ${q.perf.id}: ~${q.estimate}`);
if (args['dry-run']) {
  for (const j of run) console.log(`  would generate ${j.perf.id} [${j.perf.voice}] ~${j.estimate}: ${j.perf.input}`);
  process.exit(0);
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY (environment only; never commit it). Nothing was generated.');
  process.exit(1);
}
for (const q of queued) ledger.entries[q.perf.id] = { ...(ledger.entries[q.perf.id] ?? {}), status: ledger.entries[q.perf.id]?.status ?? 'queued', queuedReason: 'budget' };

mkdirSync(join(VOICES, 'dialogue'), { recursive: true });
const result = await runJobs({
  jobs: run,
  direction,
  ledger,
  key,
  fetch,
  writeFile: async (f, data) => writeFileSync(join(VOICES, f), data),
  saveLedger,
  log: (s) => console.log(s),
  stt: !args['no-stt'],
});
writeManifest();
console.log(`run: ${result.generated} generated, ${result.failed} failed, ${result.queued} queued; ${result.credits} credits (ledger total ${ledger.spent.credits})${result.stopped ? `; stopped: ${result.stopped}` : ''}`);
