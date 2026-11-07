// Build the takes sheet for a production round: each group's cut takes at -23 LUFS, and for the
// fable's last group the ending as the film has it: the take, then 3 s of silence before the silent
// title. Nothing of the room follows (the artist, 2026-11-07). All inline, so the page needs no other file.
// Usage: node scripts/fable/build_takes_sheet.mjs ROUND CUT_DIR TEMPLATE OUT
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LEDGER = join(ROOT, 'scripts/fable/narration-ledger.json');
const [roundId, cut, template, out] = process.argv.slice(2);
const TARGET = -23, SILENCE = 3;
const LABEL = { g1: 'The opening', g6: 'The ending' };
const PARAGRAPHS = readFileSync(join(ROOT, 'references/fable/narration.txt'), 'utf8').replace(/\r/g, '').trim().split(/\n\n+/).length;
const sheet = join(cut, 'sheet');
mkdirSync(sheet, { recursive: true });

// ffmpeg writes its ebur128 summary to stderr
const measure = (file) => {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const last = (re) => Number(log.match(re).pop().match(/-?[\d.]+/)[0]);
  return { lufs: last(/I:\s+(-?[\d.]+) LUFS/g), peak: last(/Peak:\s+(-?[\d.]+) dBFS/g) };
};
const gainTo = (target, lufs) => `volume=${(target - lufs).toFixed(2)}dB,alimiter=limit=-1dB:level=false:attack=1:release=50`;
const uri = (file) => `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`;
const mp3 = ['-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k'];

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const round = ledger.rounds[roundId];
const groups = Object.entries(round.groups).map(([key, g]) => {
  const lines = g.text.split('\n\n');
  if (g.cut.head) lines.shift();
  if (g.cut.tail) lines.pop();
  const ending = Number(g.paragraphs.split('-').pop()) === PARAGRAPHS;
  const takes = Object.entries(ledger.entries).filter(([, e]) => e.round === roundId && e.group === key && e.cut)
    .sort(([a], [b]) => a.localeCompare(b)).map(([id, e]) => {
      const src = join(cut, `${id}.wav`);
      const before = measure(src);
      const dst = join(sheet, `${id}.mp3`);
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af', gainTo(TARGET, before.lufs), ...mp3, dst]);
      e.loudness = { lufs: before.lufs, peak: before.peak, gain: Number((TARGET - before.lufs).toFixed(2)), matchedLufs: measure(dst).lufs };
      let play = dst;
      if (ending) {
        play = join(sheet, `${id}-ending.mp3`);
        // The silence counts from his last word, so the take's own room tone is part of it.
        const pad = Math.max(0, SILENCE - (e.cut.duration - e.cut.voiceEnds)).toFixed(3);
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af',
          `${gainTo(TARGET, before.lufs)},apad=pad_dur=${pad}`, ...mp3, play]);
      }
      console.log(id, `${before.lufs} -> ${e.loudness.matchedLufs} LUFS`, ending ? '(then the silence)' : '');
      return { id, n: Number(id.split('-').pop()), seconds: e.cut.duration, src: uri(play) };
    });
  return { key, label: LABEL[key] ?? `Group ${key.slice(1)}`, paragraphs: g.paragraphs, lines, ending, takes };
});

// The page's words for this round (title, heading, lede, listening notes) live with the round in the ledger.
const s = round.sheet;
const html = readFileSync(template, 'utf8')
  .replace('__TITLE__', () => s.title)
  .replace('__HEADING__', () => s.heading)
  .replace('__LEDE__', () => s.lede)
  .replace('<!--NOTES-->', () => s.notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*GROUPS*/[]', JSON.stringify(groups))
  .replace("/*ROUND*/''", JSON.stringify(roundId));
writeFileSync(out, html);
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
