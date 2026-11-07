// Build the radio cut's listening page: the mix inline, the script line by line with each silence
// between the lines, and a mark for any silence that feels long or short.
// Usage: node scripts/fable/build_radio_sheet.mjs CUT_DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [cut, template, out] = process.argv.slice(2);
const edl = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/radio-cut.json'), 'utf8'));
const data = {
  version: edl.version,
  length: edl.length,
  leadIn: edl.plan.leadIn,
  black: edl.plan.black,
  units: edl.units.map(({ p, part, at, end, gapAfter, why, text }) => ({ p, part, at, end, gapAfter, why, text })),
  src: `data:audio/mpeg;base64,${readFileSync(join(cut, 'radio-cut.mp3')).toString('base64')}`,
};
const html = readFileSync(template, 'utf8').replace('/*CUT*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
