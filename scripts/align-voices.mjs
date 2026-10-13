#!/usr/bin/env node
/**
 * Character timings for recorded performances, so writing can appear as the words are heard.
 *
 *   node scripts/align-voices.mjs --dry-run       which recordings still need timings
 *   ELEVENLABS_API_KEY=… node scripts/align-voices.mjs [--all] [--only=stay--breaking]
 *
 * Uses ElevenLabs forced alignment (the recording plus its authored text → a start and end
 * time for every character). Results go to src/content/voice-timings.json, keyed by file,
 * with the file's hash so a changed recording is re-aligned. Runs offline; the browser only
 * reads the JSON. By default only recordings in the room (public/voices/manifest.json) are
 * aligned; --all also aligns takes still waiting on the audition sheet.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, balanceAllows, readBalance } from './dialogue-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const OUT = join(ROOT, 'src/content/voice-timings.json');
const direction = JSON.parse(readFileSync(join(ROOT, 'src/content/dialogue.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/voices/manifest.json'), 'utf8'));
const timings = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const inRoom = new Set(Object.entries(manifest).filter(([k]) => k.startsWith('phrase:')).flatMap(([, v]) => v));
const only = typeof args.only === 'string' ? args.only.split(',') : null;
const hash = (f) => createHash('sha256').update(readFileSync(join(ROOT, 'public/voices', f))).digest('hex').slice(0, 16);
const todo = direction.performances.filter((p) => {
  if (only && !only.includes(p.id)) return false;
  if (!existsSync(join(ROOT, 'public/voices', p.file))) return false;
  if (!args.all && !inRoom.has(p.file)) return false;
  return timings[p.file]?.hash !== hash(p.file);
});
console.log(`${todo.length} recordings to align${args.all ? ' (including audition takes)' : ''}`);
if (args['dry-run']) {
  for (const p of todo) console.log(`  ${p.id}`);
  process.exit(0);
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY (environment only; never commit it). Nothing was aligned.');
  process.exit(1);
}
// Alignment is billed lightly if at all; still, check the balance before a run.
const balance = balanceAllows(await readBalance(key), todo.length * 5);
console.log(`balance: ${balance.note}`);
if (!balance.ok) process.exit(1);

for (const p of todo) {
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(join(ROOT, 'public/voices', p.file))], { type: 'audio/mpeg' }), 'line.mp3');
  fd.append('text', p.text);
  const r = await fetch(`${API}/v1/forced-alignment`, { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  if (!r.ok) {
    console.error(`${p.id}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    if ([401, 402, 403, 429].includes(r.status)) break;
    continue;
  }
  const j = await r.json();
  const chars = (j.characters ?? []).map((c) => [+c.start.toFixed(3), +c.end.toFixed(3)]);
  if (chars.length !== p.text.length) {
    console.error(`${p.id}: ${chars.length} timed characters for ${p.text.length} in the text; skipped`);
    continue;
  }
  timings[p.file] = { hash: hash(p.file), text: p.text, loss: +(j.loss ?? 0).toFixed(3), chars };
  writeFileSync(OUT, JSON.stringify(timings) + '\n');
  console.log(`  ${p.id}: ${chars[0][0]}–${chars[chars.length - 1][1]} s, loss ${timings[p.file].loss}`);
}
console.log(`${Object.keys(timings).length} recordings have timings`);
