// Build the sound-effects takes page: each cue's place, prompt and takes, each take heard alone and
// in the film (sfx_takes.py's copies), all inline.
// Usage: node scripts/fable/build_sfx_sheet.mjs ROUND COPIES_DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [roundId, copies, template, out] = process.argv.slice(2);
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/sfx-ledger.json'), 'utf8'));
const round = ledger.rounds[roundId];
const uri = (file) => `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const one = (x) => x.toFixed(1);

// One plain line per take from its measured facts: what the ear should check.
function note(cue, e) {
  const f = e.facts;
  const i = e.inFilm;
  if (cue === 'curtains') return `loudest at ${one(f.peakAt)} s, over by ${one(f.tail)} s`;
  if (cue === 'branch') return `over by ${one(f.tail)} s, longest dip ${one(f.longestDrop)} s`;
  if (cue === 'touch') {
    const sharp = i.windowTruePeak > -3 ? `, sharp attack (peak ${one(i.windowTruePeak)} dBTP at this level)` : '';
    return `${f.events === 1 ? 'one event' : `${f.events} events`}, over by ${one(f.tail)} s${sharp}`;
  }
  return `the seam steps ${one(Math.abs(f.seam.levelStepDb))} dB in level, ${f.seam.wrapStepVsInside < 1 ? 'no click' : 'may click'}`;
}

const s = round.sheet;
const cues = Object.entries(round.nodes).map(([key, n]) => ({
  key,
  label: n.label,
  place: s.places[key],
  prompt: n.prompt,
  window: `${clock(ledger.entries[`${roundId}-${key}-1`].inFilm.window[0])} to ${clock(ledger.entries[`${roundId}-${key}-1`].inFilm.window[1])}`,
  takes: Object.entries(ledger.entries).filter(([, e]) => e.round === roundId && e.cue === key).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, e]) => ({
      id,
      n: id.split('-').pop(),
      note: note(key, e),
      alone: uri(join(copies, `${id}-alone.mp3`)),
      film: uri(join(copies, `${id}-in-film.mp3`)),
    })),
}));
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => s.title)
  .replace('__HEADING__', () => s.heading)
  .replace('__LEDE__', () => s.lede)
  .replace('<!--NOTES-->', () => s.notes.map((x) => `      <li>${x}</li>`).join('\n'))
  .replace('/*CUES*/[]', () => JSON.stringify(cues))
  .replace("/*ROUND*/''", () => JSON.stringify(roundId));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
