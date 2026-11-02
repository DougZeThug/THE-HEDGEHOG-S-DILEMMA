// Build the blind audition page: the template with each matched take, the room's first laugh and the
// (encoded) names filled in, all inline so the page needs no other file.
// Usage: node scripts/fable/build_sheet.mjs ROUND MATCHED_DIR TEMPLATE OUT
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [round, matched, template, out] = process.argv.slice(2);
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/narration-ledger.json'), 'utf8'));
const ABOUT = {
  tom: 'light Northern English, middle-aged',
  tanksinker: 'Australian, 67, an ordinary voice',
  simon: 'relaxed Scottish, middle-aged',
  carol: 'older American, slightly Midwestern',
  esjai: 'mature South London',
  penny: 'a New Zealand, Australian and English blend',
};
const uri = (file) => `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`;

const takes = Object.entries(ledger.entries).filter(([, e]) => e.round === round).sort((a, b) => a[1].blind.localeCompare(b[1].blind));
const names = Object.fromEntries(takes.map(([id, e]) => [e.blind, {
  voice: e.voice[0].toUpperCase() + e.voice.slice(1), take: Number(id.split('-').pop()), about: ABOUT[e.voice],
}]));

const laugh = join(dirname(matched), 'laugh-23.mp3');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(ROOT, 'public/voices/dialogue/crumbs--laughing.mp3'),
  '-af', 'loudnorm=I=-23:TP=-1:LRA=11', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', laugh]);

const html = readFileSync(template, 'utf8')
  .replace('/*TAKES*/[]', JSON.stringify(takes.map(([, e]) => ({ letter: e.blind, src: uri(join(matched, `${e.blind}.mp3`)) }))))
  .replace("/*LAUGH*/''", JSON.stringify(uri(laugh)))
  .replace("/*NAMES*/''", JSON.stringify(Buffer.from(JSON.stringify(names), 'utf8').toString('base64')));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
