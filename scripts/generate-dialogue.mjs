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
 *   node scripts/generate-dialogue.mjs --adopt=lab-stay-d-v4-scene-prose:stay--breaking   (a lab take identical to a performance)
 *   … --proposed   also generate takes marked "proposed" (the next batch, written but not yet paid for)
 *
 * Direction:  src/content/dialogue.json   (authored)
 * Ledger:     scripts/dialogue-ledger.json (status, hashes, costs, transcripts, review)
 *
 * --vignettes: the vignettes' lines (src/content/vignettes.dialogue.json, words from
 * src/content/vignettes.json; ledger scripts/vignette-ledger.json; files public/voices/vignettes/).
 * Every take waits for the artist: only approved takes enter the manifest (`vig:` keys).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBudget, balanceAllows, readBalance, buildManifest, buildVignetteManifest, buildVignettePreview, emptyLedger, performanceHash, planJobs, runJobs, validateDirection } from './dialogue-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
// --lab: experiments for auditioning (scripts/voice-lab.json → audition/lab/), never shipped.
const LAB = !!args.lab;
const VIGNETTES = !!args.vignettes;
const DIRECTION = join(ROOT, LAB ? 'scripts/voice-lab.json' : VIGNETTES ? 'src/content/vignettes.dialogue.json' : 'src/content/dialogue.json');
const LEDGER = join(ROOT, LAB ? 'scripts/voice-lab-ledger.json' : VIGNETTES ? 'scripts/vignette-ledger.json' : 'scripts/dialogue-ledger.json');
const VOICES = join(ROOT, LAB ? 'audition' : 'public/voices');
const MANIFEST = join(ROOT, 'public/voices/manifest.json');
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
// A vignette's lines: their words are in vignettes.json and nowhere else.
const lines = new Map();
for (const v of JSON.parse(readFileSync(join(ROOT, 'src/content/vignettes.json'), 'utf8')).vignettes) for (const l of v.lines) lines.set(`${v.id}/${l.id}`, l.text);
const problems = VIGNETTES
  ? validateDirection(direction, (_, p) => lines.get(`${p.vignette}/${p.line}`), { sad: true })
  : validateDirection(direction, (id) => texts.get(id));
if (problems.length) {
  console.error('Direction file problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

function writeManifest() {
  if (LAB) return;
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const next = VIGNETTES ? buildVignetteManifest(manifest, direction, ledger, fileExists) : buildManifest(manifest, direction, ledger, fileExists);
  writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n');
  // The artist's previews hear every take not turned down; visitors only the kept ones (above).
  if (VIGNETTES) writeFileSync(join(ROOT, 'public/voices/vignette-preview.json'), JSON.stringify(buildVignettePreview(direction, ledger, fileExists), null, 2) + '\n');
  const keys = Object.keys(next).filter((k) => k.startsWith(VIGNETTES ? 'vig:' : 'phrase:'));
  console.log(`manifest: ${keys.length} ${VIGNETTES ? 'vignette lines with kept takes' : 'phrases with recorded performances'}`);
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
  // An approved older or alternative take returns to the room as a full candidate, not a last resort.
  let changed = false;
  for (const id of list(args.approve) ?? []) {
    const perf = direction.performances.find((p) => p.id === id);
    if (perf && (perf.retired || perf.audition)) {
      delete perf.retired;
      delete perf.audition;
      changed = true;
      console.log(`${id}: back in the room`);
    }
  }
  // A rejected take leaves the room's ranking too, so the Director never reaches for it.
  for (const id of list(args.reject) ?? []) {
    const perf = direction.performances.find((p) => p.id === id);
    if (perf && !perf.retired) {
      perf.retired = true;
      changed = true;
    }
  }
  if (changed && !LAB) writeFileSync(DIRECTION, JSON.stringify(direction, null, 2) + '\n');
  await saveLedger(ledger);
  writeManifest();
  process.exit(0);
}
// Adopt a lab take as a performance: only if the request was identical (same hash), so nothing is paid twice.
if (args.adopt) {
  const [labId, perfId] = String(args.adopt).split(':');
  const lab = JSON.parse(readFileSync(join(ROOT, 'scripts/voice-lab.json'), 'utf8'));
  const labLedger = JSON.parse(readFileSync(join(ROOT, 'scripts/voice-lab-ledger.json'), 'utf8'));
  const q = lab.performances.find((x) => x.id === labId), p = direction.performances.find((x) => x.id === perfId);
  if (!q || !p || !labLedger.entries[labId]) {
    console.error(`unknown lab take or performance: ${args.adopt}`);
    process.exit(1);
  }
  if (performanceHash(q, lab) !== performanceHash(p, direction)) {
    console.error(`${labId} and ${perfId} are not the same request (voice, model, input, settings, scene and seed must match)`);
    process.exit(1);
  }
  copyFileSync(join(ROOT, 'audition', q.file), join(VOICES, p.file));
  const e = labLedger.entries[labId];
  ledger.entries[perfId] = { ...e, adoptedFrom: labId, cost: 0, estimate: 0, labCost: e.cost };
  await saveLedger(ledger);
  writeManifest();
  console.log(`${perfId}: adopted from ${labId} (no new credits)`);
  process.exit(0);
}
if (args['manifest-only']) {
  writeManifest();
  process.exit(0);
}

const budget = Number(args.budget ?? 1500);
const { jobs, skipped } = planJobs(direction, ledger, { only: list(args.only), regenerate: list(args.regenerate) ?? [], pilot: !!args.pilot, proposed: !!args.proposed, fileExists });
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
// The real balance, checked before anything is spent. Never buys credits or changes the plan.
const balance = balanceAllows(await readBalance(key), estimate);
console.log(`balance: ${balance.note}`);
if (!balance.ok) {
  console.error('Not enough credits left for this batch. Nothing was generated (lower --budget, or wait for the reset).');
  process.exit(1);
}
for (const q of queued) ledger.entries[q.perf.id] = { ...(ledger.entries[q.perf.id] ?? {}), status: ledger.entries[q.perf.id]?.status ?? 'queued', queuedReason: 'budget' };

mkdirSync(join(VOICES, LAB ? 'lab' : VIGNETTES ? 'vignettes' : 'dialogue'), { recursive: true });
/**
 * Cut a spoken lead-in off the start of a take: decode to PCM, find the quietest 10 ms in
 * the 350 ms before the line begins (so the cut never lands inside a breath or a word), cut
 * there with a 10 ms fade, and encode once. No other processing.
 */
const trim = async (audio, from) => {
  const tmp = join(tmpdir(), `hh-trim-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(`${tmp}.in.mp3`, audio);
    const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', `${tmp}.in.mp3`, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
    const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const sr = 44100, win = Math.round(sr * 0.01), lineAt = Math.round((from + 0.14) * sr);
    let best = Math.max(0, lineAt - win), bestE = Infinity;
    for (let s = Math.max(0, lineAt - Math.round(0.35 * sr)); s + win <= lineAt; s += Math.round(win / 2)) {
      let e = 0;
      for (let i = s; i < s + win; i++) e += x[i] * x[i];
      if (e < bestE) {
        bestE = e;
        best = s;
      }
    }
    const cut = (best + win / 2) / sr;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', '-', '-af', `atrim=start=${cut.toFixed(4)},afade=t=in:d=0.01`, '-b:a', '128k', `${tmp}.out.mp3`], { input: Buffer.from(raw) });
    return new Uint8Array(readFileSync(`${tmp}.out.mp3`));
  } finally {
    for (const f of [`${tmp}.in.mp3`, `${tmp}.out.mp3`]) if (existsSync(f)) rmSync(f);
  }
};
const result = await runJobs({
  jobs: run,
  direction,
  ledger,
  key,
  fetch,
  writeFile: async (f, data) => writeFileSync(join(VOICES, f), data),
  trim,
  saveLedger,
  log: (s) => console.log(s),
  stt: !args['no-stt'],
});
writeManifest();
console.log(`run: ${result.generated} generated, ${result.failed} failed, ${result.queued} queued; ${result.credits} credits (ledger total ${ledger.spent.credits})${result.stopped ? `; stopped: ${result.stopped}` : ''}`);
