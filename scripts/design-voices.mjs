#!/usr/bin/env node
/**
 * Bespoke voices with ElevenLabs Voice Design, auditioned before anything is saved.
 *
 *   node scripts/design-voices.mjs --dry-run                 what would be designed, and the estimate
 *   ELEVENLABS_API_KEY=… node scripts/design-voices.mjs --budget=400 [--only=tired-man,whisperer]
 *   ELEVENLABS_API_KEY=… node scripts/design-voices.mjs --save=whisperer-2:whisperer   (after the artist keeps it)
 *
 * Direction: scripts/voice-designs.json. Ledger: scripts/voice-design-ledger.json.
 * Previews:  audition/design/<design>-<n>.mp3 (never shipped; the room only plays public/voices).
 * Voice Design reports no cost, so the ledger holds an estimate (one credit per character of
 * preview text). Saving a voice uses one of the account's custom voice slots and costs nothing.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.elevenlabs.io';
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const DIRECTION = join(ROOT, 'scripts/voice-designs.json');
const LEDGER = join(ROOT, 'scripts/voice-design-ledger.json');
const OUT = join(ROOT, 'audition/design');

const direction = JSON.parse(readFileSync(DIRECTION, 'utf8'));
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spent: { estimate: 0 }, entries: {}, saved: {} };
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
const key = process.env.ELEVENLABS_API_KEY;

if (args.save) {
  const [previewId, voiceKey] = String(args.save).split(':');
  const designId = previewId.replace(/-\d+$/, '');
  const preview = ledger.entries[designId]?.previews.find((p) => p.id === previewId);
  const design = direction.designs.find((d) => d.id === designId);
  if (!preview || !design || !voiceKey) {
    console.error(`unknown preview or missing voice key: ${args.save}`);
    process.exit(1);
  }
  if (!key) {
    console.error('Set ELEVENLABS_API_KEY (environment only; never commit it). Nothing was saved.');
    process.exit(1);
  }
  const res = await fetch(`${API}/v1/text-to-voice`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ voice_name: `Hedgehog — ${voiceKey}`, voice_description: design.description, generated_voice_id: preview.generatedVoiceId }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`could not save ${previewId}: ${res.status} ${detail.slice(0, 300)}`);
    process.exit(1);
  }
  const { voice_id } = await res.json();
  ledger.saved[voiceKey] = { voiceId: voice_id, from: previewId, at: new Date().toISOString() };
  save();
  console.log(`${previewId} saved as "${voiceKey}" (${voice_id}); add it to the voices in src/content/dialogue.json`);
  process.exit(0);
}

const only = typeof args.only === 'string' ? args.only.split(',') : null;
const todo = direction.designs.filter((d) => (!only || only.includes(d.id)) && !ledger.entries[d.id]);
const textFor = (d) => d.text ?? direction.text;
const estimate = (d) => textFor(d).length;
const budget = Number(args.budget ?? 400);
let planned = 0;
const run = [];
for (const d of todo) {
  if (planned + estimate(d) > budget) break;
  planned += estimate(d);
  run.push(d);
}
console.log(`plan: ${todo.length} designs to preview; budget ${budget} → running ${run.length} (~${planned} credits, estimated)`);
for (const d of run) console.log(`  ${d.id}: ${d.description}`);
if (args['dry-run']) process.exit(0);
if (!key) {
  console.error('Set ELEVENLABS_API_KEY (environment only; never commit it). Nothing was designed.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const d of run) {
  const res = await fetch(`${API}/v1/text-to-voice/design?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ voice_description: d.description, model_id: direction.model, text: textFor(d) }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`${d.id}: ${res.status} ${detail.slice(0, 300)}`);
    // Quota, permission or plan problems stop the run: nothing after this would succeed.
    if ([401, 402, 403, 429].includes(res.status)) break;
    continue;
  }
  const body = await res.json();
  const previews = body.previews.map((p, i) => {
    const id = `${d.id}-${i + 1}`;
    const file = `design/${id}.mp3`;
    writeFileSync(join(ROOT, 'audition', file), Buffer.from(p.audio_base_64, 'base64'));
    return { id, file, generatedVoiceId: p.generated_voice_id, duration: +(p.duration_secs ?? 0).toFixed(2) };
  });
  ledger.entries[d.id] = { at: new Date().toISOString(), model: direction.model, text: textFor(d), estimate: estimate(d), previews };
  ledger.spent.estimate += estimate(d);
  save();
  console.log(`${d.id}: ${previews.length} previews (~${estimate(d)} credits)`);
}
console.log(`ledger: ~${ledger.spent.estimate} credits on voice design so far (estimated)`);
