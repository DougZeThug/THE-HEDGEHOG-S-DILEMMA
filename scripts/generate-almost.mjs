#!/usr/bin/env node
/**
 * The recorded sounds of "Almost" (ElevenLabs sound generation): raw takes of the kitchen at night
 * and of the small material sounds of the figures. They are never played as they come.
 * scripts/almost/sound.py lays them along the film's exposure sheet, at the frames where the felt
 * and the wood actually move, at their levels, into the film's one soundtrack. They are asked for
 * close, even and dry; the room is made afterwards (the woodland's lesson, 2026-10-19: prompts that
 * asked for distance came back 30–50 dB down).
 *
 *   node scripts/generate-almost.mjs --dry-run [--only=fridge,clock]
 *   ELEVENLABS_API_KEY=… node scripts/generate-almost.mjs --budget=1000 [--only=…] [--force]
 *
 * Files: audition/almost/<id>-<n>.mp3. Costs: scripts/sfx-ledger.json (the account's balance is
 * checked before anything is asked for). A take is never overwritten without --force. Every take
 * is `review: pending` until the artist has listened.
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
const OUT = join(ROOT, 'audition/almost');
const LEDGER = join(ROOT, 'scripts/sfx-ledger.json');
// Measured on this account's sound generations: 11 credits a second; 12 keeps a margin.
const PER_SECOND = 12;

const DRY = 'recorded very close and dry, no reverb';
const NOTHING_ELSE = 'nothing else: no voices, no music, no traffic, no rain, no microphone noise';

/**
 * [id, prompt, seconds, prompt influence, takes, loop]. Loops have no fade at either end, so they
 * can be laid end to end under the whole film; one-shots are placed on their frames.
 */
const TAKES = [
  // The room's two indifferent clocks: the fridge, which goes on through everything, and the clock.
  ['fridge', `An old domestic refrigerator running in a small quiet kitchen at night: a steady soft low compressor hum with a faint mechanical whirr inside it, constant and even, natural, recorded close at an even level. No clicks, no door, no ice, ${NOTHING_ELSE}.`, 22, 0.5, 1, true],
  ['clock', `A small mechanical wall clock ticking in a quiet room: a steady soft dry tick, tock, once each second, a little wooden case, ${DRY}, ${NOTHING_ELSE}.`, 6, 0.6, 1, false],
  // The figures: felt and wool on wood, as small as they are.
  ['reach', `A hand-knitted wool sleeve moving slowly across a wooden table as an arm reaches out: soft wool brushing lightly over wood, a few small quiet brushes, ${DRY}, ${NOTHING_ELSE}.`, 4, 0.55, 3, false],
  ['touch', `A fingertip lightly touching the folded edge of a felted wool sleeve: one tiny soft touch of wool on wool, barely there, ${DRY}, ${NOTHING_ELSE}.`, 2, 0.6, 2, false],
  ['drag', `A felted wool sleeve pulled quickly back across a wooden kitchen table: one short soft fabric drag on wood, about half a second, ${DRY}, ${NOTHING_ELSE}.`, 2, 0.6, 3, false],
  ['scrape', `A small old wooden chair shifting back a few millimetres on wooden floorboards as someone startles: one short soft wooden scrape with a tiny creak, ${DRY}, ${NOTHING_ELSE}.`, 2, 0.6, 3, false],
  ['settle', `Someone in a wool jumper slowly drawing their arms back from a wooden table into their lap: soft wool moving against wool and a light brush of wood, quiet, ${DRY}, ${NOTHING_ELSE}.`, 3, 0.55, 2, false],
  ['offer', `A felted wool sleeve slid slowly forward across a wooden table: a soft, hesitant fabric slide on wood, stopping, then a little more, ${DRY}, ${NOTHING_ELSE}.`, 3, 0.55, 2, false],
];

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spent: 0, entries: {} };
const fileOf = (id, i) => `almost-${id}-${i + 1}.mp3`;
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
const budget = Number(args.budget ?? 1000);
console.log(`plan: ${todo.length} takes, ~${estimate} credits (budget ${budget})`);
for (const j of todo) console.log(`  ${j.file}  ${j.seconds} s${j.loop ? ', loop' : ''}, influence ${j.influence}`);
if (args['dry-run']) process.exit(0);
if (estimate > budget) {
  console.error('Over budget. Nothing was generated.');
  process.exit(1);
}
const account = await readBalance(KEY);
const balance = balanceAllows(account, estimate);
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
  // (what the take was made with and under which plan: its terms decide what it may be used for)
  ledger.entries[j.file] = {
    key: `almost:${j.id}`, text: j.text, duration: j.seconds, cost: Number.isFinite(cost) ? cost : null, at: new Date().toISOString(), review: 'pending',
    model: 'eleven_text_to_sound_v2', influence: j.influence, loop: !!j.loop, tier: account.known ? account.tier : null, request: res.headers.get('request-id'),
  };
  if (Number.isFinite(cost)) ledger.spent += cost;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`✓ ${j.file}${Number.isFinite(cost) ? ` (${cost} credits)` : ''}`);
}
