// Loudness-match a round's takes to -23 LUFS for a blind sheet (originals untouched), give each a
// shuffled letter, and record letter, measured loudness and gain in the narration ledger.
// Usage: node scripts/fable/match_takes.mjs ROUND OUT_DIR
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LEDGER = join(ROOT, 'scripts/fable/narration-ledger.json');
const [round, out] = process.argv.slice(2);
const TARGET = -23;
mkdirSync(out, { recursive: true });

// ffmpeg writes its ebur128 summary to stderr
const ffmpegLog = (file) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
  { encoding: 'utf8' }).stderr;
const integrated = (log) => Number(log.match(/I:\s+(-?[\d.]+) LUFS/g).pop().match(/-?[\d.]+/)[0]);
const peak = (log) => Number(log.match(/Peak:\s+(-?[\d.]+) dBFS/g).pop().match(/-?[\d.]+/)[0]);

// mulberry32, seeded from the round name, so the letters are reproducible
let s = [...round].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const ids = Object.keys(ledger.entries).filter((id) => ledger.entries[id].round === round);
for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }

ids.forEach((id, i) => {
  const e = ledger.entries[id];
  const letter = String.fromCharCode(65 + i);
  const src = join(ROOT, 'audition', e.file);
  const before = ffmpegLog(src);
  const gain = TARGET - integrated(before);
  const dst = join(out, `${letter}.mp3`);
  // Plain gain; a limiter at -1 dBFS only catches the peaks a large lift would push past it.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af',
    `volume=${gain.toFixed(2)}dB,alimiter=limit=-1dB:level=false:attack=1:release=50`, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', dst]);
  const after = ffmpegLog(dst);
  e.blind = letter;
  e.loudness = { lufs: integrated(before), peak: peak(before), gain: Number(gain.toFixed(2)), matchedLufs: integrated(after), matchedPeak: peak(after) };
  console.log(letter, id, `${integrated(before)} -> ${integrated(after)} LUFS, peak ${peak(after)} dBFS`);
});
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
