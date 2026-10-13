#!/usr/bin/env node
/**
 * Build the listening index for recorded performances: every take, grouped by line, with
 * its direction, unspoken scene, transcript, detected laughs/sighs and acoustic
 * measurements, and keep / not this / unsure controls.
 *
 *   node scripts/audition.mjs                 → audition/index.html (open it from a static server at the repo root,
 *                                                e.g. `npx vite` then /audition/, or `npx serve .`)
 *   node scripts/audition.mjs --out=<dir>     → a self-contained folder (page + audio/) to publish or share
 *
 * Decisions made on the page become: node scripts/generate-dialogue.mjs --approve=… --reject=…
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from './voice-analysis.mjs';
import { words } from './dialogue-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const OUT = arg('out');

const direction = JSON.parse(readFileSync(join(ROOT, 'src/content/dialogue.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(ROOT, 'scripts/dialogue-ledger.json'), 'utf8'));
const lab = existsSync(join(ROOT, 'scripts/voice-lab.json')) ? JSON.parse(readFileSync(join(ROOT, 'scripts/voice-lab.json'), 'utf8')) : { performances: [], voices: {} };
const labLedger = existsSync(join(ROOT, 'scripts/voice-lab-ledger.json')) ? JSON.parse(readFileSync(join(ROOT, 'scripts/voice-lab-ledger.json'), 'utf8')) : { entries: {} };

const voiceName = (dir, key) => (dir.voices[key]?.library ?? key).replace(/ \(.*\)$/, '');
const sceneText = (s) => (s ? [s.before, s.after && `after: ${s.after}`].filter(Boolean).join('  ') : undefined);

const FIRST = ['stay', 'love-go-away', 'happy-then'];
const takes = [];
const add = (perf, dir, e, opts) => {
  const path = opts.lab ? join(ROOT, 'audition', perf.file) : join(ROOT, 'public/voices', perf.file);
  if (!existsSync(path) || !e) return;
  takes.push({
    id: perf.id, group: opts.group, groupLabel: opts.groupLabel, line: perf.text, phraseId: perf.phraseId,
    interpretation: perf.interpretation ?? perf.direction, voice: voiceName(dir, perf.voice), model: perf.model ?? dir.model,
    stability: perf.stability ?? dir.voices[perf.voice]?.stability ?? 0.5, input: perf.input, scene: sceneText(perf.scene), leadIn: perf.leadIn,
    question: perf.question, variantOf: perf.variantOf, generation: perf.generation ?? 1, retired: !!perf.retired, audition: !!perf.audition, lab: !!opts.lab, edit: e.edit,
    status: e.status, review: e.review, transcript: e.transcript, events: e.events, extra: e.extraWords,
    m: analyse(path, words(perf.text).length), path, src: OUT ? `audio/${basename(perf.file)}` : opts.lab ? perf.file : `../public/voices/${perf.file}`,
  });
};

const phrases = [...new Set(direction.performances.map((p) => p.phraseId))];
phrases.sort((a, b) => (FIRST.includes(a) ? FIRST.indexOf(a) : 99) - (FIRST.includes(b) ? FIRST.indexOf(b) : 99) ||
  Number(direction.performances.some((p) => p.phraseId === b && p.generation === 2)) - Number(direction.performances.some((p) => p.phraseId === a && p.generation === 2)));
for (const id of phrases) {
  const all = direction.performances.filter((p) => p.phraseId === id);
  const ordered = all.filter((p) => !p.variantOf).sort((a, b) => (b.generation ?? 1) - (a.generation ?? 1) || Number(!!a.retired) - Number(!!b.retired));
  // Other seeds of the same direction sit right after it: pick the best of them.
  const perfs = ordered.flatMap((p) => [p, ...all.filter((v) => v.variantOf === p.id)]);
  const fresh = perfs.some((p) => p.generation === 2);
  const label = FIRST.includes(id) ? 'readings side by side, with leaner alternatives and the older takes' : fresh ? 'new reading, against the older take' : 'older take, not yet re-directed';
  for (const p of perfs) add(p, direction, ledger.entries[p.id], { group: id, groupLabel: label });
}
for (const p of lab.performances) add(p, lab, labLedger.entries[p.id], { group: 'lab', groupLabel: 'lab: how the method was chosen', lab: true });
// The rejected first take of happy-then--lost, kept to show what a spoken tag sounds like.
const spoken = join(ROOT, 'audition/lab/rejected-happy-then--lost-spoken-tag.mp3');
if (existsSync(spoken)) {
  const p = direction.performances.find((x) => x.id === 'happy-then--lost');
  takes.push({
    id: 'rejected-happy-then--lost-spoken-tag', group: 'lab', groupLabel: 'lab: how the method was chosen', line: 'Lab experiments', phraseId: 'happy-then',
    interpretation: 'Rejected automatically: the tag was spoken aloud', voice: voiceName(direction, p.voice), model: 'eleven_v4', stability: 0.25,
    input: '[quietly, the smile fading] I think I was happy then. [breath catches]', generation: 2, retired: true, lab: true, status: 'needs-review', review: 'rejected',
    transcript: 'The smile fading. I think I was happy then.', extra: ['the', 'smile', 'fading'], m: analyse(spoken, 6), path: spoken,
    src: OUT ? 'audio/rejected-happy-then--lost-spoken-tag.mp3' : 'lab/rejected-happy-then--lost-spoken-tag.mp3',
  });
}
for (const t of takes) if (t.group === 'lab') t.line = 'Lab experiments';

// Voices made with Voice Design: previews only, saved to the account if the artist keeps one.
const designs = existsSync(join(ROOT, 'scripts/voice-designs.json')) ? JSON.parse(readFileSync(join(ROOT, 'scripts/voice-designs.json'), 'utf8')) : { designs: [] };
const designLedger = existsSync(join(ROOT, 'scripts/voice-design-ledger.json')) ? JSON.parse(readFileSync(join(ROOT, 'scripts/voice-design-ledger.json'), 'utf8')) : { entries: {} };
const designTakes = [];
for (const d of designs.designs) {
  for (const p of designLedger.entries[d.id]?.previews ?? []) {
    const path = join(ROOT, 'audition', p.file);
    if (!existsSync(path)) continue;
    designTakes.push({
      id: p.id, group: 'voices', groupLabel: 'new voices, made to order (three previews each; keep at most one of each)', line: 'New voices',
      interpretation: d.description, voice: `${d.id} · preview ${p.id.split('-').pop()}`, model: designs.model, stability: '—', input: designLedger.entries[d.id].text,
      question: `For: ${d.for}`, generation: 2, lab: false, audition: true, design: true, status: 'preview', review: 'pending',
      m: analyse(path, words(designLedger.entries[d.id].text).length), path, src: OUT ? `audio/${basename(p.file)}` : p.file,
    });
  }
}
for (const v of designs.library ?? []) {
  const e = designLedger.library?.[v.id];
  const path = e && join(ROOT, 'audition', e.file);
  if (!e || !existsSync(path)) continue;
  designTakes.push({
    id: v.id, group: 'voices', groupLabel: '', line: 'New voices',
    interpretation: v.why, voice: `library voice: ${v.name}`, model: e.model, stability: designs.libraryStability, input: e.text,
    question: `For: ${v.for}`, generation: 2, lab: false, audition: true, design: true, status: e.status, review: 'pending',
    transcript: e.transcript, m: analyse(path, words(e.text).length), path, src: OUT ? `audio/${basename(e.file)}` : e.file,
  });
}
const nDesigned = designs.designs.length, nLibrary = designTakes.filter((t) => t.id.startsWith('lib-')).length;
for (const t of designTakes) t.groupLabel = `new voices: ${nDesigned} made to order (three previews each), ${nLibrary} from the ElevenLabs library — keep only a few`;
// New voices first: the casting decides who reads everything else.
takes.unshift(...designTakes);

const tpl = readFileSync(join(ROOT, 'audition/page.html'), 'utf8');
const data = JSON.stringify({ built: new Date().toISOString(), takes: takes.map(({ path, ...t }) => t) }).replace(/</g, '\\u003c');
const page = tpl.replace('/*DATA*/', data);
if (OUT) {
  mkdirSync(join(OUT, 'audio'), { recursive: true });
  for (const t of takes) copyFileSync(t.path, join(OUT, 'audio', basename(t.path)));
  writeFileSync(join(OUT, 'index.html'), page);
  console.log(`${takes.length} takes → ${OUT}/index.html (+ audio/)`);
} else {
  writeFileSync(join(ROOT, 'audition/index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${page}</body></html>\n`);
  console.log(`${takes.length} takes → audition/index.html`);
}
