#!/usr/bin/env node
/**
 * Music fragments for auditioning (ElevenLabs Music), never played in the room until the
 * artist keeps one. Music in this work is someone else's: a piano in another room, heard
 * through the wall — never score laid over the visitor, never under a voice, never in the
 * first two minutes (docs/reviews/2026-10-cinematic-opening.md).
 *
 *   node scripts/generate-music.mjs --dry-run
 *   ELEVENLABS_API_KEY=… node scripts/generate-music.mjs --budget=1000 [--only=piano-warm]
 *
 * Files: audition/music/<id>.mp3. Ledger: scripts/music-ledger.json (cost, request id, review).
 * Licence (ElevenLabs music terms, Creator plan, October 2026): online and offline commercial
 * use permitted except film, TV, radio and studio games; individual use; no attribution
 * required. Interactive installations are not named explicitly.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, balanceAllows, readBalance } from './dialogue-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const LEDGER = join(ROOT, 'scripts/music-ledger.json');
const OUT = join(ROOT, 'audition/music');
// Published estimate: about 900 credits per minute of music (not confirmed by the API docs).
const PER_SECOND = 15;

const FRAGMENTS = [
  {
    id: 'piano-warm',
    seconds: 24,
    for: 'Warmth late in a visit, through the wall where the laughter lives (the next-room situation).',
    prompt: 'An old upright piano heard through a wall from the next room of a quiet house. Someone plays a simple warm melody for themselves, unhurried, a little out of tune, with small hesitations and a held note at the end. Solo piano only, instrumental, no drums, no strings, no reverb wash, intimate and domestic, recorded from the next room.',
  },
  {
    id: 'piano-unresolved',
    seconds: 24,
    for: 'Contradiction: a phrase that starts warmly and does not resolve, then stops.',
    prompt: 'An upright piano in another room. A sparse, uncertain phrase in a major key that keeps not resolving, long pauses between notes, quiet, slightly dissonant on the last chord, then it simply stops mid-phrase. Solo piano only, instrumental, no drums, no strings, muffled as if heard through a closed door.',
  },
];

// The living memories' music (docs/memories.md): heard inside the remembered place, never a
// score over the room. Drafts for the sound designer's review before the dry run.
FRAGMENTS.push(
  {
    id: 'memory-kitchen',
    seconds: 35,
    for: 'Memory: "We ate cereal for dinner and it was perfect." Ordinary happiness, enters once the kitchen has formed.',
    prompt: 'A small, warm, unhurried tune played on an old upright piano in a home kitchen in the early evening, simple and happy, like someone playing for the people they love while dinner is cleared. Gentle, light-hearted, a little imperfect, relaxed tempo, ends softly on a resolved chord. Solo piano only, instrumental, no drums, no strings, no swell, not sentimental, heard from the next room.',
  },
  {
    id: 'memory-bedroom',
    seconds: 35,
    for: 'Memory: "I was happiest when nobody needed anything from me." Peace, solitude, morning light.',
    prompt: 'Tranquil, airy, sparse music for a quiet sunlit bedroom in the morning with the window open: a few slow sustained notes on a soft felt piano with long silences between them, unhurried, peaceful and spacious, no melody that insists, no build. Instrumental, no drums, no strings, no pads, intimate and still.',
  },
);

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spent: 0, entries: {} };
const only = typeof args.only === 'string' ? args.only.split(',') : null;
const todo = FRAGMENTS.filter((f) => (!only || only.includes(f.id)) && (args.force || !existsSync(join(OUT, `${f.id}.mp3`))));
const estimate = Math.ceil(todo.reduce((a, f) => a + f.seconds * PER_SECOND, 0));
const budget = Number(args.budget ?? 1000);
console.log(`plan: ${todo.length} fragments, ~${estimate} credits (budget ${budget})`);
for (const f of todo) console.log(`  ${f.id} (${f.seconds} s): ${f.for}`);
if (args['dry-run']) process.exit(0);
if (estimate > budget) {
  console.error('Over budget. Nothing was generated.');
  process.exit(1);
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY (environment only; never commit it). Nothing was generated.');
  process.exit(1);
}
const balance = balanceAllows(await readBalance(key), estimate);
console.log(`balance: ${balance.note}`);
if (!balance.ok) process.exit(1);
mkdirSync(OUT, { recursive: true });
for (const f of todo) {
  const before = await readBalance(key);
  const res = await fetch(`${API}/v1/music?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: f.prompt, music_length_ms: f.seconds * 1000, force_instrumental: true }),
  });
  if (!res.ok) {
    console.error(`${f.id}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    if ([401, 402, 403, 429].includes(res.status)) break;
    continue;
  }
  writeFileSync(join(OUT, `${f.id}.mp3`), Buffer.from(await res.arrayBuffer()));
  const header = Number(res.headers.get('character-cost') ?? NaN);
  const after = await readBalance(key);
  const measured = before.known && after.known ? after.used - before.used : NaN;
  const cost = Number.isFinite(header) ? header : Number.isFinite(measured) && measured > 0 ? measured : null;
  ledger.entries[f.id] = { file: `music/${f.id}.mp3`, prompt: f.prompt, seconds: f.seconds, for: f.for, cost, requestId: res.headers.get('request-id') ?? undefined, at: new Date().toISOString(), review: 'pending' };
  if (cost) ledger.spent += cost;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`  ${f.id}: ${cost ?? '?'} credits`);
}
console.log(`music so far: ${ledger.spent} credits`);
