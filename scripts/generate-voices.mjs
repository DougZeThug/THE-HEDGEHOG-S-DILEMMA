#!/usr/bin/env node
/**
 * Optional, offline asset generation. Renders non-verbal human textures (laughter
 * through a wall, breathing, humming, murmured conversation, whispers) with the
 * ElevenLabs sound-effects API and writes them to public/voices/ with a manifest.
 *
 * The installation never calls any API at runtime; it only plays the files listed in
 * public/voices/manifest.json and falls back to synthesis for anything missing.
 *
 *   node scripts/generate-voices.mjs --dry-run [--only=sfx:switch,sfx:graphite,sfx:eraser]
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
// cost comes back in each response's character-cost header and is recorded). The ledger's first
// nine sounds measured 11 credits a second; 12 keeps a margin.
const PER_SECOND = 12;
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
  // The writing in the air rubbed out as someone comes close: an eraser, not a whoosh.
  'sfx:eraser': [
    [`a soft rubber eraser rubbing out pencil on a plaster wall, three or four short quick strokes, close, dry, quiet, nothing else`, 1.5],
    [`someone quickly erasing a few pencil words with a small eraser on a hard wall, brief rubbing strokes, intimate, dry, no reverb`, 1.5],
    [`gentle eraser strokes on paper against a wall, a short hurried rub then stop, close and quiet, dry`, 1.5],
  ],
  'sfx:graphite': [
    [`a soft graphite pencil writing slowly on a rough plaster wall, a few words with small pauses between them, close, dry, quiet`, 4],
    [`pencil lead scratching lightly on a painted wall, someone writing a short line by hand, unhurried, close, dry`, 4],
    [`slow handwriting with a soft pencil on a hard surface, gentle scratching strokes and pauses, intimate, dry`, 4],
  ],
  'sfx:chair-creak': [
    [`a small old wooden chair creaking once softly as weight shifts, close, quiet room, ${DRY}`, 1.5],
  ],
  // The living memories (docs/memories.md, docs/reviews/2026-10-living-memories.md). Generated
  // close and dry at an even level, with no baked fade: distance, direction and place come from
  // the engine (prompts that ask for distance come back near-silent here: −54 to −64 dB). Beds
  // are asked for as seamless loops; one-shots are placed by each memory's cue sheet.
  'mem:kitchen-air': [
    // (A first take asking for a "far-off hush" came back at −72 dB mean, unusable.)
    [`the room tone of a small sunny kitchen with the window open, recorded at a normal level: soft continuous outdoor air and leaves rustling gently, even and steady, clearly audible, nothing happening, no voices, no music, no ticking`, 8, { loop: true }],
  ],
  'mem:spoon-bowl': [
    [`two metal spoons in two ceramic cereal bowls at a small kitchen table, a few unhurried clinks and soft scrapes, overlapping, no chewing, no voices, ${DRY}`, 3],
    [`a spoon laid down in an empty ceramic bowl, one small clink and a brief rattle as it settles, then nothing, ${DRY}`, 1.5],
  ],
  // The artist turned down the spoons-in-bowls take: three other ways of hearing the meal.
  'mem:eating': [
    [`one person happily eating cereal with milk from a ceramic bowl, a metal spoon dipping in and tapping the rim, a soft crunch of cereal, an easy unhurried rhythm, no voices, ${DRY}`, 3],
    [`two people eating cereal together at a small kitchen table, two spoons clinking against two ceramic bowls at different moments, a little crunch, relaxed and companionable, no voices, ${DRY}`, 3],
    [`dry cereal poured from a cardboard box into a ceramic bowl with a light rattle, then a short pour of milk, the start of a meal, no voices, ${DRY}`, 3],
  ],
  'mem:laugh': [
    [`two people at a kitchen table laughing together at something silly, a short warm unforced burst of shared laughter that trails off, no words, ${DRY}`, 3],
  ],
  'mem:footsteps': [
    [`an adult walking slowly along an old wooden upstairs landing in socks, about five unhurried footsteps roughly a second apart, a small creak under two of them, then the steps stop and stay stopped, recorded close and clearly audible, every step the same loudness, no voices, no breathing, no door, ${DRY}`, 5],
    [`slow careful footsteps on old bare wooden hallway floorboards, someone in socks, five steps about a second apart, then stopping, one small creak as the weight settles on the last step, then stillness, recorded close and clearly audible at an even level, no voices, no breathing, no door, ${DRY}`, 5],
  ],
  'mem:floorboard': [
    [`a single old wooden floorboard creaking once as someone standing still shifts their weight, one slow low creak, then silence, recorded close and clearly audible, no footsteps, no voices, ${DRY}`, 1.5],
    [`one short dry tick and creak of an old wooden floor settling on its own in a still house, nobody walking, recorded close and clearly audible, no voices, ${DRY}`, 1.5],
  ],
  'mem:bird': [
    [`a single small songbird singing one short bright phrase, then silence, recorded close with a directional microphone, clearly audible, no other birds, no wind, no traffic, no reverb, no music`, 2.5],
    [`two short sparrow chirps with a pause between them, then silence, recorded close with a directional microphone, clearly audible, no other birds, no wind, no traffic, no reverb, no music`, 2.5],
  ],
  'mem:curtain-breeze': [
    [`a light cotton curtain lifting once and falling back, a gentle cloth rustle that rises over about a second and settles over two, the hem brushing a wooden sill, recorded close and clearly audible, no wind noise, no rumble, no whoosh, no birds, ${DRY}`, 3],
  ],
  // (No recorded bedroom air: room tone came back as rumble twice; it is made in the engine, src/memory/synthAir.ts.)
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
  for (const [i, [text, duration, opts]] of variants.entries()) {
    const file = fileOf(key, i);
    const path = join(OUT, file);
    if (existsSync(path) && !force) {
      // A take the artist turned down on the audition sheet stays out of the room.
      if (ledger.entries[file]?.review !== 'rejected') files.push(file);
      continue;
    }
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      // A bed asks for a seamless loop (the v2 sound model's option).
      body: JSON.stringify({ text, duration_seconds: duration, prompt_influence: 0.55, ...(opts?.loop ? { loop: true, model_id: 'eleven_text_to_sound_v2' } : {}) }),
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
