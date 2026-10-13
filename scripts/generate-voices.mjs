#!/usr/bin/env node
/**
 * Optional, offline asset generation. Renders non-verbal human textures (laughter
 * through a wall, breathing, humming, murmured conversation, whispers) with the
 * ElevenLabs sound-effects API and writes them to public/voices/ with a manifest.
 *
 * The installation never calls any API at runtime; it only plays the files listed in
 * public/voices/manifest.json and falls back to synthesis for anything missing.
 *
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-voices.mjs [--force]
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY to generate assets. Nothing was changed.');
  process.exit(1);
}
const OUT = new URL('../public/voices/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const force = process.argv.includes('--force');

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

for (const [key, variants] of Object.entries(ASSETS)) {
  const files = [];
  for (const [i, [text, duration]] of variants.entries()) {
    const file = `${key.replace(':', '-')}-${i + (key === 'style:distant' ? 2 : 1)}.mp3`;
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
    console.log(`✓ ${file}`);
  }
  if (files.length) manifest[key] = files;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest:', Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, v.length])));
