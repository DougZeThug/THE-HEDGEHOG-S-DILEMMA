// Check each take's Scribe transcript against the text it was given: word error rate on normalised
// words, the transcript and its word timings kept beside the take, the result in the ledger.
// Usage: node scripts/fable/check_transcripts.mjs RUN_STATUS_JSON MAP_JSON   (MAP: transcription generation id -> take id)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LEDGER = join(ROOT, 'scripts/fable/narration-ledger.json');
const run = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const map = JSON.parse(process.argv[3]);
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));

const words = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

for (const t of run.transcripts) {
  const id = map[t.generation_id];
  if (!id) { console.log('unmapped', t.generation_id); continue; }
  const e = ledger.entries[id];
  const round = ledger.rounds[e.round];
  const ref = words(e.group ? round.groups[e.group].text : round.text);
  const hyp = words(t.text);
  const wer = distance(ref, hyp) / ref.length;
  const spoken = t.words.filter((w) => w.type === undefined || w.type === 'word');
  writeFileSync(join(ROOT, 'audition', e.file.replace(/\.mp3$/, '.words.json')), JSON.stringify(spoken, null, 1) + '\n');
  Object.assign(e, { transcript: t.text, wer: Number(wer.toFixed(3)), status: wer === 0 ? 'validated' : 'needs-review' });
  console.log(id, 'wer', wer.toFixed(3), wer ? `| ${t.text.replace(/\n+/g, ' / ')}` : '');
}
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
