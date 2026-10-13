#!/usr/bin/env node
/**
 * Bespoke voices with ElevenLabs Voice Design, auditioned before anything is saved.
 *
 *   node scripts/design-voices.mjs --dry-run                 what would be designed, and the estimate
 *   ELEVENLABS_API_KEY=… node scripts/design-voices.mjs --budget=400 [--only=tired-man,whisperer]
 *   ELEVENLABS_API_KEY=… node scripts/design-voices.mjs --save=whisperer-2:whisperer   (after the artist keeps it)
 *   ELEVENLABS_API_KEY=… node scripts/design-voices.mjs --library [--only=lib-lyan] [--dry-run]
 *     one sample of each shortlisted library voice reading the same text, for comparison; a voice
 *     is added to the account (one voice slot) only if the API will not speak it otherwise
 *
 * Direction: scripts/voice-designs.json. Ledger: scripts/voice-design-ledger.json.
 * Previews:  audition/design/<design>-<n>.mp3 (never shipped; the room only plays public/voices).
 * Voice Design reports no cost, so the ledger holds an estimate (one credit per character of
 * preview text). Saving a voice uses one of the account's custom voice slots and costs nothing.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balanceAllows, readBalance, transcribe, wordErrorRate } from './dialogue-lib.mjs';

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

if (args.library) {
  ledger.library ??= {};
  const todo = (direction.library ?? []).filter((v) => (!only || only.includes(v.id)) && !ledger.library[v.id]);
  const textFor = (v) => v.text ?? direction.text;
  const budget = Number(args.budget ?? 1800);
  let planned = 0;
  const run = [];
  for (const v of todo) {
    if (planned + textFor(v).length > budget) break;
    planned += textFor(v).length;
    run.push(v);
  }
  console.log(`plan: ${todo.length} library samples; budget ${budget} → running ${run.length} (~${planned} credits)`);
  for (const v of run) console.log(`  ${v.id} (${v.name}): ${v.why}`);
  if (args['dry-run']) process.exit(0);
  if (!key) {
    console.error('Set ELEVENLABS_API_KEY (environment only; never commit it). Nothing was generated.');
    process.exit(1);
  }
  const balance = balanceAllows(await readBalance(key), planned);
  console.log(`balance: ${balance.note}`);
  if (!balance.ok) {
    console.error('Not enough credits left for these samples. Nothing was generated.');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const speak = (voiceId, text) => fetch(`${API}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: direction.libraryModel, voice_settings: { stability: direction.libraryStability }, seed: 9001 }),
  });
  for (const v of run) {
    let added = false;
    let res = await speak(v.voiceId, textFor(v));
    if (!res.ok && [400, 402, 404].includes(res.status)) {
      // Not usable straight from the library: add it to the account (one voice slot), then retry.
      const first = (await res.text()).slice(0, 200);
      const add = await fetch(`${API}/v1/voices/add/${v.publicOwnerId}/${v.voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: `Hedgehog audition — ${v.name}` }),
      });
      if (!add.ok) {
        console.error(`${v.id}: could not speak (${res.status} ${first}) or add (${add.status} ${(await add.text()).slice(0, 200)})`);
        continue;
      }
      added = true;
      res = await speak(v.voiceId, textFor(v));
    }
    if (!res.ok) {
      console.error(`${v.id}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      if ([401, 402, 403, 429].includes(res.status)) break;
      continue;
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    const file = `design/${v.id}.mp3`;
    writeFileSync(join(ROOT, 'audition', file), audio);
    const cost = Number(res.headers.get('character-cost') ?? textFor(v).length);
    const heard = await transcribe({ fetch, key, audio });
    const wer = heard.ok ? wordErrorRate(textFor(v), heard.text) : null;
    ledger.library[v.id] = {
      at: new Date().toISOString(), voiceId: v.voiceId, added, model: direction.libraryModel, text: textFor(v), file,
      cost, requestId: res.headers.get('request-id') ?? undefined, transcript: heard.ok ? heard.text : undefined, wer,
      status: wer !== null && wer <= 0.25 ? 'validated' : 'needs-review',
    };
    ledger.spent.library = (ledger.spent.library ?? 0) + cost;
    save();
    console.log(`  ${v.id}: ${ledger.library[v.id].status}, ${cost} credits${added ? ', added to the account' : ''} — heard: "${heard.text ?? '?'}"`);
  }
  console.log(`library samples so far: ${ledger.spent.library ?? 0} credits`);
  process.exit(0);
}

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

const balance = balanceAllows(await readBalance(key), planned);
console.log(`balance: ${balance.note}`);
if (!balance.ok) {
  console.error('Not enough credits left for these previews. Nothing was designed.');
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
