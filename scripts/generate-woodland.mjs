#!/usr/bin/env node
/**
 * The woodland memory's recorded sounds (ElevenLabs sound generation): raw takes for its
 * afternoon air, its far birds and its evening cicadas, never played as they come. They are laid
 * along the memory's own timeline offline (scripts/woodland-stems.py), at their places and levels,
 * into the stems the memory plays (public/music/woodland-*.mp3), and judged in the film. Asked
 * for close, even and dry: distance, place and the evening's air are made afterwards (prompts that
 * asked for distance came back 30–50 dB down: the sound designer's review, 2026-10-19).
 *
 *   node scripts/generate-woodland.mjs --dry-run [--only=air,evening]
 *   ELEVENLABS_API_KEY=… node scripts/generate-woodland.mjs --budget=2000 [--only=…] [--force]
 *
 * Files: audition/woodland/<id>-<n>.mp3. Costs: scripts/sfx-ledger.json (the account's balance is
 * checked before anything is asked for). A take is never overwritten without --force.
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, balanceAllows, readBalance } from './dialogue-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ONLY = typeof args.only === 'string' ? args.only.split(',') : null;
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !args['dry-run']) {
  console.error('Set ELEVENLABS_API_KEY to generate takes. Nothing was changed.');
  process.exit(1);
}
const OUT = join(ROOT, 'audition/woodland');
const LEDGER = join(ROOT, 'scripts/sfx-ledger.json');
// Measured on this account's sound generations: 11 credits a second; 12 keeps a margin.
const PER_SECOND = 12;

const NOTHING_ELSE = 'no voices, no music, no traffic, no aircraft, no rain, no microphone wind noise, no rumble';

/**
 * [id, prompt, seconds, prompt influence, takes, loop]. Loops (the v2 model's option) have no
 * fade at either end, so two can be laid end to end along the timeline; one-shots are placed.
 */
const TAKES = [
  // The afternoon's air: the warmth the clearing lacked (it measured as a cicada band, nothing
  // between 100 Hz and 2 kHz), and the one sound that crosses the cut.
  ['air', `Wind moving gently through the leaves of a large broadleaf tree and through long summer grass in a quiet woodland clearing on a warm afternoon: soft continuous rustling with slow swells and small lulls, grass brushing, recorded close and clearly audible at an even level, natural. Nothing else: no birds, no insects, no cicadas, ${NOTHING_ELSE}.`, 30, 0.45, 2, true],
  // A few far birds in the afternoon's wides (never a bed).
  ['bird', 'A single small woodland songbird singing one short, relaxed, warbling phrase from a tree on a summer afternoon, then silence. Recorded close with a directional microphone, clearly audible, no other birds, no insects, no wind, no reverb, no music.', 4, 0.55, 3, false],
  // The evening: higurashi in the trees, already singing when it is cut to.
  ['evening', "Evening cicadas (higurashi) at dusk in a Japanese cedar forest: several in the trees, each call a clear, ringing, metallic run of quick notes, 'kana-kana-kana', slowly falling in pitch over about five seconds, the calls overlapping and answering from different trees, a calm evening, recorded clearly at an even level. Nothing else: no other insects, no birds, no wind, no voices, no music, no traffic, no rain.", 24, 0.65, 2, false],
  // (No single calls placed after the cut: the evening is a chorus already going, none of it in
  // front; a falling call foregrounded in the first seconds is a sigh: the reviews of 2026-10-19.)
];

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spent: 0, entries: {} };
const fileOf = (id, i) => `woodland-${id}-${i + 1}.mp3`;
const todo = [];
for (const [id, text, seconds, influence, n, loop] of TAKES) {
  if (ONLY && !ONLY.includes(id)) continue;
  for (let i = 0; i < n; i++) {
    const file = fileOf(id, i);
    if (args.force || !existsSync(join(OUT, file))) todo.push({ id, file, text, seconds, influence, loop });
  }
}
// (The API takes at most 450 characters of description.)
const long = todo.filter((j) => j.text.length > 450);
if (long.length) {
  console.error(`Descriptions over 450 characters: ${[...new Set(long.map((j) => `${j.id} (${j.text.length})`))].join(', ')}. Nothing was generated.`);
  process.exit(1);
}
const estimate = Math.ceil(todo.reduce((a, j) => a + j.seconds * PER_SECOND, 0));
const budget = Number(args.budget ?? 2000);
console.log(`plan: ${todo.length} takes, ~${estimate} credits (budget ${budget})`);
for (const j of todo) console.log(`  ${j.file}  ${j.seconds} s${j.loop ? ', loop' : ''}, influence ${j.influence}`);
if (args['dry-run']) process.exit(0);
if (estimate > budget) {
  console.error('Over budget. Nothing was generated.');
  process.exit(1);
}
const balance = balanceAllows(await readBalance(KEY), estimate);
console.log(`balance: ${balance.note}`);
if (!balance.ok) process.exit(1);

mkdirSync(OUT, { recursive: true });
for (const j of todo) {
  const res = await fetch(`${API}/v1/sound-generation?output_format=mp3_44100_192`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: j.text, duration_seconds: j.seconds, prompt_influence: j.influence, model_id: 'eleven_text_to_sound_v2', ...(j.loop ? { loop: true } : {}) }),
  });
  if (!res.ok) {
    console.error(`✗ ${j.file}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  writeFileSync(join(OUT, j.file), Buffer.from(await res.arrayBuffer()));
  const cost = Number(res.headers.get('character-cost') ?? NaN);
  ledger.entries[j.file] = { key: `woodland:${j.id}`, text: j.text, duration: j.seconds, cost: Number.isFinite(cost) ? cost : null, at: new Date().toISOString(), review: 'pending' };
  if (Number.isFinite(cost)) ledger.spent += cost;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`✓ ${j.file}${Number.isFinite(cost) ? ` (${cost} credits)` : ''}`);
}
