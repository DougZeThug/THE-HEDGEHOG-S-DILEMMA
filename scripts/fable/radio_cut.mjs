// The radio cut of decision 16: the approved reading (the ledger's `reading`), each paragraph lifted
// from its take at the pauses, joined by the silences of decisions 9, 11, 12 and 17, over night air
// made in code. Then the cut, and the app's 3 s of black, so the end is heard as it will be.
// Writes the stems and the mix to OUT_DIR, and the timeline to scripts/fable/radio-cut.json.
// Usage: node scripts/fable/radio_cut.mjs OUT_DIR
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/narration-ledger.json'), 'utf8'));
const TEXT = readFileSync(join(ROOT, 'references/fable/narration.txt'), 'utf8').replace(/\r/g, '').trim().split(/\n\n+/);
const [out] = process.argv.slice(2);
const RATE = 44100;
const VERSION = 1;
mkdirSync(out, { recursive: true });

// Silences, voice to voice, in seconds. Decision 12: time goes only to the bible's three silences,
// the ease, the waiting, the end hold and the curtains; every other gap is 1 s or less. The slowness
// is made in the edit (decision 16), so ordinary gaps sit at that 1 s.
const LEAD_IN = [6, 'the curtains'];
const GAP = 1.0;
const AFTER = {
  3: [1.3, 'the waiting'], // "The moon began waiting for him." lands (decision 17: 1–1.5 s)
  7: [6, 'the ease'], // "For many nights, they were happy.": an unhurried image of ease (bible)
  15: [3, 'his request'], // her dimming inside it (decision 17: 2.5–3.5 s)
  16: [6, 'the rest'], // "For a while, they rested together.": their real relief (decision 17: 5–7 s)
  21: [3.5, 'her obscured reflection'], // decision 17: 3–4 s
  33: [4.5, 'the last glance'], // then image and night cut together (decision 11: about 4.5 s)
};
// Paragraphs split at their first sentence: his paw touches the water in a gap of about a second (decision 9).
const SPLIT = { 23: [1.0, 'the touch'] };
const BLACK = 3; // the app's true silence before the title (decision 11)
const CEILING = 210; // decision 12: 3:30 to the cut
const NARRATION_LUFS = -23.5; // about 2–3 LU over the room's first voice (decision 17), to be measured in the room
// Night alone in the silences counts in the loudness range: at -42 the mix measured 12 LU, at -45 it
// is inside decision 17's 8 LU. Raise it only together with that limit.
const NIGHT_LUFS = -45;
const VOICE_DB = -55; // what counts as voice when finding where a line starts and stops
const PRE = 0.03, POST = 0.08; // kept around each line, inside its gaps

const words = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
const pcm = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 28 });
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
};
const level = (x, t, n = 441) => {
  const i = Math.round(t * RATE);
  let s = 0;
  for (let k = 0; k < n; k++) s += (x[i + k] ?? 0) ** 2;
  return 10 * Math.log10(s / n + 1e-12);
};
// Centre of the quietest 20 ms between a and b: where a pause is split.
const quietest = (x, a, b) => {
  let best = { t: (a + b) / 2, db: Infinity };
  for (let t = a; t + 0.02 <= b; t += 0.005) {
    const db = level(x, t, 882);
    if (db < best.db) best = { t: t + 0.01, db };
  }
  return best.t;
};
const measure = (file) => {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const last = (re) => Number(log.match(re).pop().match(/-?[\d.]+/)[0]);
  return { lufs: last(/I:\s+(-?[\d.]+) LUFS/g), lra: last(/LRA:\s+(-?[\d.]+) LU/g), truePeak: last(/Peak:\s+(-?[\d.]+) dBFS/g) };
};
const fixed = (n, d = 3) => Number(n.toFixed(d));

// 1. Every line of the reading, found in its take.
const units = [];
for (const [g, id] of Object.entries(ledger.reading).filter(([k]) => /^g\d$/.test(k))) {
  const e = ledger.entries[id];
  const group = ledger.rounds[e.round].groups[g];
  const timed = JSON.parse(readFileSync(join(ROOT, 'audition', e.file.replace(/\.mp3$/, '.words.json')), 'utf8'));
  const x = pcm(join(ROOT, 'audition', e.file));
  const gain = 10 ** ((NARRATION_LUFS - e.loudness.lufs) / 20);
  const [a, b] = group.paragraphs.split('-').map(Number);
  let w = group.cut.head ? words(group.cut.head).length : 0;
  const lines = [];
  for (let p = a; p <= b; p++) {
    const parts = SPLIT[p] ? [TEXT[p - 1].match(/^.*?[.!?](\s|$)/)[0].trim(), TEXT[p - 1].replace(/^.*?[.!?]\s+/, '')] : [TEXT[p - 1]];
    parts.forEach((text, k) => {
      const n = words(text).length;
      const said = timed.slice(w, w + n);
      if (words(said.map((s) => s.text).join(' ')).join(' ') !== words(text).join(' ')) throw new Error(`${id} ¶${p}: words don't line up`);
      lines.push({ p, part: parts.length > 1 ? 'ab'[k] : '', text, said });
      w += n;
    });
  }
  // Split each pause at its quietest point, searching from inside the word before it (Scribe's word
  // ends can run on into the pause); the group's own ends are its cut points.
  lines.forEach((l, i) => {
    l.from = i ? lines[i - 1].to : e.cut.in;
    l.to = i < lines.length - 1 ? quietest(x, l.said.at(-1).start + 0.1, lines[i + 1].said[0].start - 0.05) : e.cut.out;
  });
  for (const l of lines) {
    let v0 = l.from, v1 = l.to - 0.01;
    while (v0 < l.to && level(x, v0) <= VOICE_DB) v0 += 0.01;
    while (v1 > v0 && level(x, v1) <= VOICE_DB) v1 -= 0.01;
    v1 += 0.01;
    units.push({ ...l, take: id, x, gain, v0, v1 });
  }
}
const spoken = units.flatMap((u) => words(u.text)).join(' ');
if (spoken !== words(TEXT.join(' ')).join(' ')) throw new Error('the reading is not narration.txt, in order');

// 2. The timeline: each line's voice placed so the silences between voices are exactly the plan's.
const gapAfter = (u) => (u.part === 'a' ? SPLIT[u.p] : AFTER[u.p] ?? [GAP, null]);
let cursor = LEAD_IN[0];
for (const u of units) {
  u.at = cursor;
  u.end = cursor + (u.v1 - u.v0);
  u.gap = gapAfter(u);
  cursor = u.end + u.gap[0];
}
const cut = cursor; // the last gap is the end hold; the cut falls at its end
const total = cut + BLACK;
const narration = new Float32Array(Math.ceil(total * RATE));
const fade = Math.round(0.005 * RATE);
for (const u of units) {
  const s0 = Math.max(u.from, u.v0 - PRE), s1 = Math.min(u.to, u.v1 + POST);
  const i0 = Math.round(s0 * RATE), i1 = Math.round(s1 * RATE), at = Math.round((u.at - (u.v0 - s0)) * RATE);
  for (let i = i0; i < i1; i++) {
    const edge = Math.min(1, (i - i0) / fade, (i1 - 1 - i) / fade);
    narration[at + i - i0] += u.x[i] * u.gain * edge;
  }
}
const raw = join(out, 'narration.f32');
writeFileSync(raw, Buffer.from(narration.buffer));
// The high-pass (decision 17: about 90 Hz) takes a little level with it, so the stem is set to its
// target after it.
const narrationHp = join(out, 'narration-hp.wav');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', raw,
  '-af', 'highpass=f=90', '-c:a', 'pcm_f32le', narrationHp]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', narrationHp,
  '-af', `volume=${(NARRATION_LUFS - measure(narrationHp).lufs).toFixed(2)}dB`, '-c:a', 'pcm_s16le', join(out, 'narration.wav')]);

// 3. Night air (decision 17: below 1 kHz, made in code): pink noise kept to 110–900 Hz, breathing
// slowly, from the first frame to the cut, where it stops with the image. Seeded, so it repeats.
const nightRaw = join(out, 'night-raw.wav');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `anoisesrc=d=${cut.toFixed(3)}:c=pink:r=${RATE}:a=0.5:s=7`,
  '-af', "highpass=f=110,lowpass=f=900,volume='0.72+0.28*sin(2*PI*t/11)*sin(2*PI*t/29+1)':eval=frame", '-ac', '1', '-c:a', 'pcm_s16le', nightRaw]);
const nightGain = NIGHT_LUFS - measure(nightRaw).lufs;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', nightRaw,
  '-af', `volume=${nightGain.toFixed(2)}dB,afade=t=in:d=2,afade=t=out:st=${(cut - 0.02).toFixed(3)}:d=0.02,apad=whole_dur=${total.toFixed(3)}`,
  '-ac', '1', '-c:a', 'pcm_s16le', join(out, 'night.wav')]);

// 4. The mix: no normalising in the sum, peaks held under -3 dBFS (decision 17's -3 dBTP, checked below).
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(out, 'narration.wav'), '-i', join(out, 'night.wav'),
  '-filter_complex', '[0][1]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=-3.5dB:level=false:attack=1:release=50',
  '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', join(out, 'radio-cut.wav')]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(out, 'radio-cut.wav'), '-c:a', 'libmp3lame', '-b:a', '128k', join(out, 'radio-cut.mp3')]);
const loud = { narration: measure(join(out, 'narration.wav')), night: measure(join(out, 'night.wav')), mix: measure(join(out, 'radio-cut.wav')) };

const edl = {
  version: VERSION,
  note: 'Written by scripts/fable/radio_cut.mjs from the ledger reading. Times in seconds on the film; take times are in the original take file.',
  reading: ledger.reading,
  plan: { leadIn: LEAD_IN, gap: GAP, after: AFTER, split: SPLIT, black: BLACK, ceiling: CEILING, narrationLufs: NARRATION_LUFS, nightLufs: NIGHT_LUFS },
  length: { toCut: fixed(cut), withBlack: fixed(total), voice: fixed(units.reduce((s, u) => s + u.end - u.at, 0)) },
  loudness: loud,
  units: units.map((u) => ({ p: u.p, part: u.part || undefined, take: u.take, from: fixed(u.v0), to: fixed(u.v1), at: fixed(u.at),
    end: fixed(u.end), gapAfter: fixed(u.gap[0], 2), why: u.gap[1] ?? undefined, text: u.text })),
};
writeFileSync(join(ROOT, 'scripts/fable/radio-cut.json'), JSON.stringify(edl, null, 1) + '\n');

const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
for (const u of edl.units) console.log(`${mmss(u.at)}  ¶${u.p}${u.part ?? ''}`.padEnd(14), `${(u.end - u.at).toFixed(1)} s`.padStart(7),
  `+${u.gapAfter.toFixed(1)}${u.why ? ` ${u.why}` : ''}`.padEnd(30), u.text.slice(0, 50));
console.log(`to the cut ${mmss(cut)} (ceiling ${mmss(CEILING)})${cut > CEILING ? '  <- OVER THE CEILING' : ''}, with the black ${mmss(total)}`);
console.log('loudness', JSON.stringify(loud));
