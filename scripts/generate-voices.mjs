#!/usr/bin/env node
/**
 * Optional, offline asset generation. Renders non-verbal human textures (laughter
 * through a wall, breathing, humming, murmured conversation, whispers) with the
 * ElevenLabs sound-effects API and writes them to public/voices/ with a manifest.
 *
 * The installation never calls any API at runtime; it only plays the files listed in
 * public/voices/manifest.json and falls back to synthesis for anything missing.
 *
 *   node scripts/generate-voices.mjs --dry-run [--only=sfx:switch,sfx:graphite]
 *   ELEVENLABS_API_KEY=… node scripts/generate-voices.mjs --only=sfx:switch --budget=600 [--force]
 *
 * Costs are recorded in scripts/sfx-ledger.json; the account's balance is checked first.
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { balanceAllows, readBalance } from './dialogue-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ONLY = typeof args.only === 'string' ? args.only.split(',') : null;
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !args['dry-run']) {
  console.error('Set ELEVENLABS_API_KEY to generate assets. Nothing was changed.');
  process.exit(1);
}
const OUT = new URL('../public/voices/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const force = !!args.force;
// Sound generation is billed by length; this is the assumption used for estimates (the real
// cost comes back in each response's character-cost header and is recorded).
const PER_SECOND = 40;
const LEDGER = new URL('./sfx-ledger.json', import.meta.url).pathname;
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spent: 0, entries: {} };

const DRY = 'dry, intimate, close, natural home recording, no music, no reverb tail';
const WALL = 'muffled through a closed wall in the next room, quiet, no music';
const ASSETS = {
  'vf-laugh-next-room': [
    [`two friends laughing warmly together at a private joke, ${WALL}`, 4.5],
    [`one person laughing softly and helplessly, then catching their breath, ${WALL}`, 4],
  ],
  'vf-two-voices': [
    [`two people having a calm, quiet conversation, words unintelligible, ${WALL}`, 7],
    [`a man and a woman talking softly late at night, unintelligible murmur, ${WALL}`, 7],
  ],
  'vf-breath': [
    [`a single person breathing slowly and softly very close to the listener, a little nervous, ${DRY}`, 6],
    [`one calm, slow inhale and a long tired exhale right beside the ear, ${DRY}`, 5],
  ],
  'vf-hum': [
    [`a person absent-mindedly humming a simple wandering tune to themselves while doing dishes, ${WALL}`, 7],
    [`someone softly humming a lullaby-like melody, unhurried, ${WALL}`, 7],
  ],
  'style:whisper': [
    [`a person whispering a short sentence very softly and indistinctly close to the ear, words not understandable, ${DRY}`, 3],
    [`a gentle intimate whisper of a few unintelligible words, ${DRY}`, 3],
    [`a hesitant breathy whisper, a few soft unintelligible words, ${DRY}`, 3],
  ],
  'sfx:door': [
    [`a wooden interior door closing gently somewhere down a hallway in a quiet house, soft thud and latch click, distant, ${WALL}`, 2],
    [`a bedroom door quietly pulled shut in another room, single soft click, far away`, 2],
  ],
  'sfx:cup': [
    [`a ceramic mug set down gently on a wooden kitchen table in the next room, single soft clink`, 1.5],
    [`a teacup placed on a saucer, one quiet ceramic tap, domestic, slightly distant`, 1.5],
  ],
  // The opening: a light switched on by the door, and graphite on plaster for a hand writing
  // when nobody is speaking (docs/reviews/2026-10-cinematic-opening.md).
  'sfx:switch': [
    [`an old wall light switch clicked on once in a silent room, a single dry plastic click, close, no reverb, no hum`, 1.0],
    [`one firm click of a household light switch being pressed on, quiet empty room, dry, single click only`, 1.0],
    [`a light switch on a plaster wall flicked on, one soft mechanical click, nothing else, dry`, 1.0],
  ],
  'sfx:graphite': [
    [`a soft graphite pencil writing slowly on a rough plaster wall, a few words with small pauses between them, close, dry, quiet`, 4],
    [`pencil lead scratching lightly on a painted wall, someone writing a short line by hand, unhurried, close, dry`, 4],
    [`slow handwriting with a soft pencil on a hard surface, gentle scratching strokes and pauses, intimate, dry`, 4],
  ],
  'sfx:chair-creak': [
    [`a small old wooden chair creaking once softly as weight shifts, close, quiet room, ${DRY}`, 1.5],
  ],
  'style:distant': [
    // (A first variant here consistently came back near-silent and was removed.)
    [`someone calling out a few quiet words from down a hallway, unintelligible, distant`, 3],
  ],
};

const manifestPath = join(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

// Plan and estimate first.
const fileOf = (key, i) => `${key.replace(':', '-')}-${i + (key === 'style:distant' ? 2 : 1)}.mp3`;
const todo = [];
for (const [key, variants] of Object.entries(ASSETS)) {
  if (ONLY && !ONLY.includes(key)) continue;
  for (const [i, [, duration]] of variants.entries()) if (force || !existsSync(join(OUT, fileOf(key, i)))) todo.push({ key, i, duration });
}
const estimate = Math.ceil(todo.reduce((a, j) => a + Math.max(1, j.duration) * PER_SECOND, 0));
const budget = Number(args.budget ?? 1000);
console.log(`plan: ${todo.length} sounds, ~${estimate} credits (budget ${budget})`);
for (const j of todo) console.log(`  ${fileOf(j.key, j.i)} (${j.duration} s)`);
if (args['dry-run']) process.exit(0);
if (estimate > budget) {
  console.error('Over budget. Nothing was generated.');
  process.exit(1);
}
const balance = balanceAllows(await readBalance(KEY), estimate);
console.log(`balance: ${balance.note}`);
if (!balance.ok) process.exit(1);

for (const [key, variants] of Object.entries(ASSETS)) {
  if (ONLY && !ONLY.includes(key)) continue;
  const files = [];
  for (const [i, [text, duration]] of variants.entries()) {
    const file = fileOf(key, i);
    const path = join(OUT, file);
    if (existsSync(path) && !force) {
      files.push(file);
      continue;
    }
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.55 }),
    });
    if (!res.ok) {
      console.error(`✗ ${file}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    files.push(file);
    const cost = Number(res.headers.get('character-cost') ?? NaN);
    ledger.entries[file] = { key, text, duration, cost: Number.isFinite(cost) ? cost : null, at: new Date().toISOString(), review: 'pending' };
    if (Number.isFinite(cost)) ledger.spent += cost;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
    console.log(`✓ ${file}${Number.isFinite(cost) ? ` (${cost} credits)` : ''}`);
  }
  if (files.length) manifest[key] = files;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest:', Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.length])));
