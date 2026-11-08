// Build a puppet-kit page: the reference's detail against the new, each take with its note and a
// mark, and the round's questions, all images inline. Words and choices come from the round's
// `sheet` in art-ledger.json; images from IMAGES_DIR (<take>-view.jpg and the detail crops).
// Usage: node scripts/fable/build_kit_sheet.mjs ROUND IMAGES_DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [roundId, dir, template, out] = process.argv.slice(2);
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/art-ledger.json'), 'utf8'));
const round = ledger.rounds[roundId];
const s = round.sheet;
const uri = (file) => `data:image/jpeg;base64,${readFileSync(join(dir, file)).toString('base64')}`;

// A round's page shows either its own takes or, when its sheet lists `images`, those (a composite
// and what it was made from), each <id>-view.jpg in IMAGES_DIR.
const takes = s.images ? s.images.map((im) => ({ ...im, src: uri(`${im.id}-view.jpg`) })) : Object.entries(ledger.entries).filter(([, e]) => e.round === roundId).map(([id, e]) => {
  const node = round.nodes[e.node];
  return {
    id,
    label: s.labels[id],
    model: node.model === 'gemini-3-pro-image' ? 'Nano Banana Pro' : node.model === 'gpt-image-2.6-sunburst' ? 'GPT Image 2.6' : node.model,
    size: `${e.size[0]} by ${e.size[1]}`,
    note: s.takeNotes[id],
    src: uri(`${id}-view.jpg`),
  };
});
const data = {
  key: roundId,
  copyTitle: s.copyTitle,
  detail: s.detail.map((d) => ({ caption: d.caption, src: uri(d.file) })),
  takes,
  mark: s.mark ?? { label: 'Him?', options: [{ value: 'yes', label: 'Yes', keep: true }, { value: 'close', label: 'Close' }, { value: 'no', label: 'No' }] },
  asks: s.asks,
};
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => s.title)
  .replace('__HEADING__', () => s.heading)
  .replace('__LEDE__', () => s.lede)
  .replace('<!--NOTES-->', () => s.notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*DATA*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
