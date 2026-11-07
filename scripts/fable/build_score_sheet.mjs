// Build the "music in the film" page: score.py's three full mixes (A, the locked cut; B, in the
// silences; C, beneath him) inline, with jumps to the three places the music lives.
// Usage: node scripts/fable/build_score_sheet.mjs MIXES_DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [mixes, template, out] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(join(ROOT, 'scripts/fable', f), 'utf8'));
const score = read('score.json'), render = read('score-render.json'), cut = read('radio-cut.json');
const at = (p) => cut.units.find((u) => u.p === p).at;
const uri = (file) => `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`;

// Where each version's music is, in words, for the line under the player.
const places = [
  { label: 'The pond and the ease', from: at(5) - 0.5, to: at(10),
    B: 'two chords in the pauses, then the call and its answer in the ease', C: 'chords under his words, the call and answer in the ease, thinning under the next lines' },
  { label: 'The rest', from: at(16), to: at(17) + 2,
    B: 'the call, then the answer stopped before "But when he stayed quiet"', C: 'the call, then the answer stopped before "But when he stayed quiet"' },
  { label: 'The return', from: at(29) - 1, to: at(33) + 6,
    B: 'two chords in the last pauses, unanswered; nothing on the last line', C: 'the call beneath the saved story, stopped before "Halfway through"' },
];
const data = {
  take: score.take,
  scoreVersion: score.version,
  length: cut.length.withBlack,
  src: Object.fromEntries(['A', 'B', 'C'].map((v) => [v, uri(join(mixes, `${v}.mp3`))])),
  jumps: [{ label: 'The pond', at: Math.floor(at(5) - 1) }, { label: 'The rest', at: Math.floor(at(16) - 0.5) }, { label: 'The return', at: Math.floor(at(28) - 0.5) }],
  places,
  render: Object.fromEntries(Object.entries(render.versions).map(([v, r]) => [v, { musicSeconds: r.musicSeconds }])),
};
const html = readFileSync(template, 'utf8').replace('/*DATA*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
