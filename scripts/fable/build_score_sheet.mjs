// Build a "music in the film" page from a page config (score-sheet-*.json): full-length mixes inline,
// one transport that switches versions keeping the place, jumps to places in the fable, and the
// questions. Places and jumps name paragraphs of the locked cut, so they follow its timing.
// Usage: node scripts/fable/build_score_sheet.mjs CONFIG MIXES_DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [config, mixes, template, out] = process.argv.slice(2);
const page = JSON.parse(readFileSync(config, 'utf8'));
const cut = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/radio-cut.json'), 'utf8'));
const at = (p) => cut.units.find((u) => u.p === p).at;
const time = ([p, offset]) => Math.max(0, at(p) + offset);
const uri = (file) => `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`;

// The questions: a page lists its own `asks`; the music pages asked whether the instruments belong,
// then their `choose`.
const BELONGS = {
  key: 'belongs', title: "Do these instruments belong with Tom's voice?", short: 'Instruments belong with Tom',
  options: [{ value: 'yes', label: 'Yes', keep: true }, { value: 'not quite', label: 'Not quite' }, { value: 'no', label: 'No' }],
};
const data = {
  key: page.key,
  length: cut.length.withBlack,
  versions: page.versions.map(({ key, label }) => ({ key, label })),
  start: page.start,
  asks: page.asks ?? [BELONGS, { key: 'choice', ...page.choose }],
  notesHint: page.notesHint ?? 'A place that wants more or less, the level, the instruments, anything that pulls you out.',
  copyTitle: page.copyTitle,
  src: Object.fromEntries(page.versions.map((v) => [v.key, uri(join(mixes, v.file))])),
  jumps: page.jumps.map((j) => ({ label: j.label, at: Math.floor('at' in j ? j.at : at(j.p) + j.offset) })),
  places: page.places.map(({ from, to, ...rest }) => ({ ...rest, from: time(from), to: time(to) })),
};
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => page.title)
  .replace('__HEADING__', () => page.heading)
  .replace('__LEDE__', () => page.lede)
  .replace('<!--NOTES-->', () => page.notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*DATA*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
