// Build the music takes page: each palette's prompt and takes, each take heard alone and under
// Tom (music_takes.py's copies), all inline.
// Usage: node scripts/fable/build_music_sheet.mjs ROUND COPIES_DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [roundId, copies, template, out] = process.argv.slice(2);
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/music-ledger.json'), 'utf8'));
const round = ledger.rounds[roundId];
const uri = (file) => `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`;

const palettes = Object.entries(round.nodes).map(([key, n]) => ({
  key,
  label: n.label,
  prompt: n.prompt,
  takes: Object.entries(ledger.entries).filter(([, e]) => e.round === roundId && e.palette === key).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, e]) => ({
      id,
      label: `${key.toUpperCase()}${id.split('-').pop()}`,
      nearSilence: e.facts.nearSilence,
      longestGap: e.facts.longestGap,
      alone: uri(join(copies, `${id}-alone.mp3`)),
      withTom: uri(join(copies, `${id}-with-tom.mp3`)),
    })),
}));
// The page's words for this round (title, heading, lede, listening notes) live with the round in the ledger.
const s = round.sheet;
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => s.title)
  .replace('__HEADING__', () => s.heading)
  .replace('__LEDE__', () => s.lede)
  .replace('<!--NOTES-->', () => s.notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*PALETTES*/[]', () => JSON.stringify(palettes))
  .replace("/*ROUND*/''", () => JSON.stringify(roundId));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
