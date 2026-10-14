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

// The living memories' music (docs/memories.md), heard inside the remembered place, never a
// score over the room. The kitchen's is its radio, as the artist chose: an ordinary song,
// generated full-range (the engine makes it a small radio on the windowsill: band-limited,
// placed, in the kitchen's own room). Its length is the memory's authored span from the scene
// forming to its last sound. The bedroom's is generated only after the kitchen's has been heard.
// Memory pieces go to public/music/ as pending takes so they can be judged in place.
FRAGMENTS.push(
  {
    id: 'memory-radio',
    seconds: 28,
    memory: true,
    for: 'Memory: "We ate cereal for dinner and it was perfect." The kitchen radio, on from the moment the scene has formed.',
    prompt: 'An ordinary cheerful song playing on the radio in a sunny kitchen: a light, easy-going 1970s soft-pop instrumental with strummed acoustic guitar, a round bass line, brushed drums and a little electric piano, major key, relaxed mid tempo, warm and happy, nothing dramatic. It starts straight away in the middle of the song, no intro, no build and no ending, it simply carries on. Instrumental, no vocals.',
  },
  {
    id: 'memory-bedroom',
    seconds: 26,
    memory: true,
    for: 'Memory: "I was happiest when nobody needed anything from me." Someone downstairs playing for themselves, from 8 s until the memory has gone (the engine puts it below, through the floor).',
    // The sound designer's prompt (approach review): someone else, content, needing nothing.
    prompt: 'Someone downstairs playing an upright piano for themselves on a bright morning: an easy, contented little tune in a major key, walking tempo, simple, a couple of small slips carried on through. Starts straight away with the tune, no intro, no ending. Solo piano, instrumental, close home recording, dry.',
  },
  // The artist turned down the 1970s soft-pop radio and asked for gentle acoustic folk, several
  // options to choose from (four, up to 1,150 credits). Long enough for the radio's span in the memory.
  {
    id: 'memory-radio-folk-a',
    seconds: 19,
    memory: true,
    for: 'Memory: cereal. The kitchen radio, option A (harmonica): gentle acoustic folk. Not yet in the memory: keep the one you want.',
    prompt: 'Playing on the radio in a sunny kitchen, a 1970s folk song on the radio: strummed and lightly picked steel-string acoustic guitar with a simple, cheerful harmonica melody over it, major key, easy walking tempo, sunny and unhurried. It starts straight away in the middle of the song, no intro, no build and no ending, it simply carries on. Instrumental, no vocals, nothing dramatic, warm and happy.',
  },
  {
    id: 'memory-radio-folk-b',
    seconds: 19,
    memory: true,
    for: 'Memory: cereal. The kitchen radio, option B (fingerpicked): gentle acoustic folk. Not yet in the memory: keep the one you want.',
    prompt: 'Playing on the radio in a sunny kitchen, a gentle folk tune on the radio: a single steel-string acoustic guitar, fingerpicked with an alternating thumb bass, a bright simple melody in a major key, relaxed tempo, homely and content. It starts straight away in the middle of the song, no intro, no build and no ending, it simply carries on. Instrumental, no vocals, nothing dramatic, warm and happy.',
  },
  {
    id: 'memory-radio-folk-c',
    seconds: 19,
    memory: true,
    for: 'Memory: cereal. The kitchen radio, option C (waltz): gentle acoustic folk. Not yet in the memory: keep the one you want.',
    prompt: 'Playing on the radio in a sunny kitchen, a gentle folk waltz on the radio in three-four time: acoustic guitar and a soft fiddle playing a sweet, lilting melody, major key, unhurried, like a song everyone in the family knows. It starts straight away in the middle of the song, no intro, no build and no ending, it simply carries on. Instrumental, no vocals, nothing dramatic, warm and happy.',
  },
  {
    id: 'memory-radio-folk-d',
    seconds: 19,
    memory: true,
    for: 'Memory: cereal. The kitchen radio, option D (mandolin): gentle acoustic folk. Not yet in the memory: keep the one you want.',
    prompt: 'Playing on the radio in a sunny kitchen, an easy-going acoustic folk song on the radio: two acoustic guitars and a mandolin playing together, a light upright bass, a bright singable melody, major key, relaxed mid tempo, sunny. It starts straight away in the middle of the song, no intro, no build and no ending, it simply carries on. Instrumental, no vocals, nothing dramatic, warm and happy.',
  },

);

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spent: 0, entries: {} };
const only = typeof args.only === 'string' ? args.only.split(',') : null;
const outOf = (f) => (f.memory ? join(ROOT, 'public/music') : OUT);
const todo = FRAGMENTS.filter((f) => !f.deferred && (!only || only.includes(f.id)) && (args.force || !existsSync(join(outOf(f), `${f.id}.mp3`))));
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
mkdirSync(join(ROOT, 'public/music'), { recursive: true });
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
  writeFileSync(join(outOf(f), `${f.id}.mp3`), Buffer.from(await res.arrayBuffer()));
  const header = Number(res.headers.get('character-cost') ?? NaN);
  const after = await readBalance(key);
  const measured = before.known && after.known ? after.used - before.used : NaN;
  const cost = Number.isFinite(header) ? header : Number.isFinite(measured) && measured > 0 ? measured : null;
  ledger.entries[f.id] = { file: f.memory ? `public/music/${f.id}.mp3` : `music/${f.id}.mp3`, prompt: f.prompt, seconds: f.seconds, for: f.for, cost, requestId: res.headers.get('request-id') ?? undefined, at: new Date().toISOString(), review: 'pending' };
  if (cost) ledger.spent += cost;
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`  ${f.id}: ${cost ?? '?'} credits`);
}
console.log(`music so far: ${ledger.spent} credits`);
