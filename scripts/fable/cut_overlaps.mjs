// Cut away the borrowed sentences of decision 16: a group's head (the previous group's last sentence)
// and tail (the next group's first, or the throwaway after the last line). Scribe's word timings find
// the gap; the cut falls on the quietest 20 ms inside it, with a short fade so it never clicks.
// Writes OUT_DIR/<take>.wav at the take's own level and the cut points to the ledger.
// Usage: node scripts/fable/cut_overlaps.mjs ROUND OUT_DIR
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LEDGER = join(ROOT, 'scripts/fable/narration-ledger.json');
const [roundId, out] = process.argv.slice(2);
const RATE = 44100;
mkdirSync(out, { recursive: true });

const words = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
const pcm = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 28 });
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
};
// Centre of the quietest 20 ms window between a and b (seconds), and its level in dBFS.
const quietest = (x, a, b) => {
  const n = Math.round(0.02 * RATE), hop = Math.round(0.005 * RATE);
  let best = { t: (a + b) / 2, db: Infinity };
  for (let i = Math.round(a * RATE); i + n <= Math.round(b * RATE); i += hop) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += x[j] * x[j];
    const db = 10 * Math.log10(s / n + 1e-12);
    if (db < best.db) best = { t: (i + n / 2) / RATE, db };
  }
  return { t: Number(best.t.toFixed(3)), db: Number(best.db.toFixed(1)) };
};

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const round = ledger.rounds[roundId];
for (const [id, e] of Object.entries(ledger.entries)) {
  if (e.round !== roundId || e.status !== 'validated') continue;
  const g = round.groups[e.group];
  const timed = JSON.parse(readFileSync(join(ROOT, 'audition', e.file.replace(/\.mp3$/, '.words.json')), 'utf8'));
  const headN = g.cut.head ? words(g.cut.head).length : 0;
  const tailN = g.cut.tail ? words(g.cut.tail).length : 0;
  const first = timed[headN], last = timed[timed.length - tailN - 1];
  const src = join(ROOT, 'audition', e.file);
  const x = pcm(src);
  const length = x.length / RATE;
  // Keep 50 ms clear of the words on either side; Scribe's timings are good to about that.
  const cin = headN ? quietest(x, timed[headN - 1].end + 0.05, first.start - 0.05) : { t: 0, db: null };
  const cout = tailN ? quietest(x, last.end + 0.05, timed[timed.length - tailN].start - 0.05) : { t: length, db: null };
  const dur = cout.t - cin.t;
  // Where his voice really stops: Scribe can run a held last word on past the sound by a third of a second.
  let voiceEnds = cout.t;
  for (let t = cout.t - 0.01; t > last.start; t -= 0.01) {
    let s = 0;
    for (let j = Math.round(t * RATE), k = 0; k < 441; k++) s += x[j + k] * x[j + k];
    if (10 * Math.log10(s / 441 + 1e-12) > -55) { voiceEnds = t + 0.01; break; }
  }
  // Trim inside the filter graph, so the fades are timed on the cut and not on the whole take.
  const chain = [`atrim=start=${cin.t}:end=${cout.t}`, 'asetpts=PTS-STARTPTS',
    headN ? 'afade=t=in:d=0.015' : null, tailN ? `afade=t=out:st=${(dur - 0.03).toFixed(3)}:d=0.03` : null].filter(Boolean);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af', chain.join(','),
    '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', join(out, `${id}.wav`)]);
  e.cut = { in: cin.t, out: Number(cout.t.toFixed(3)), duration: Number(dur.toFixed(3)), inDb: cin.db, outDb: cout.db,
    firstWord: first.text, lastWord: last.text, voiceEnds: Number((voiceEnds - cin.t).toFixed(3)) };
  console.log(id, `${cin.t}-${e.cut.out} s (${e.cut.duration} s)`, `"${first.text} … ${last.text}"`, `cut levels ${cin.db ?? '-'} / ${cout.db ?? '-'} dBFS`);
}
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
