// Build the animatic page: the retimed animatic (animatic.py's small MP4 and WebM) inline, jumps to
// places on the locked cut, and the shot names from animatic-timing.json.
// Usage: node scripts/fable/build_animatic_page.mjs DIR TEMPLATE OUT
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const [dir, template, out] = process.argv.slice(2);
const cut = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/radio-cut.json'), 'utf8'));
const timing = JSON.parse(readFileSync(join(ROOT, 'scripts/fable/animatic-timing.json'), 'utf8'));
const at = (p) => cut.units.find((u) => u.p === p).at;
const uri = (file, type) => `data:${type};base64,${readFileSync(join(dir, file)).toString('base64')}`;

const touch = timing.anchors.find(([a]) => Math.abs(a - 169.5) < 0.01)[1];
const data = {
  sources: [
    { type: 'video/mp4; codecs="avc1.640028, mp4a.40.2"', uri: uri('fable-animatic-small.mp4', 'video/mp4') },
    { type: 'video/webm; codecs="vp9, opus"', uri: uri('fable-animatic-small.webm', 'video/webm') },
  ],
  jumps: [
    { label: 'The curtains', at: 0 },
    { label: 'The pond', at: Math.floor(at(5) - 0.5) },
    { label: 'The ease', at: Math.floor(at(7)) },
    { label: 'Too much light', at: Math.floor(at(12) - 0.5) },
    { label: 'The rest', at: Math.floor(at(16) - 0.5) },
    { label: 'The branch', at: Math.floor(at(19) - 1) },
    { label: 'The touch', at: Math.floor(touch - 3) },
    { label: 'Separate nights', at: Math.floor(at(25) - 1) },
    { label: 'The return', at: Math.floor(at(29) - 1) },
  ],
  shots: timing.shots.map((s) => ({ name: s.name, from: s.film[0], to: s.film[1] })),
};
const lede = 'Your package animatic, retimed onto the locked cut, with the soundtrack you approved (mix 1) under it. Three minutes, from the curtains to the black.';
const notes = [
  'Each subtitle is pinned to its line: it comes up as Tom starts saying it and goes as he finishes. Between lines the pictures hold for as long as the film\'s silences last (the ease, the rest, the last glance).',
  'The touch is the one hard sync: the animatic\'s first frame of ripples falls on the frame where the touch is heard.',
  'The picture goes to black with the sound at the cut; the 3 seconds of black are silent, and the title comes from the room.',
  'This is a placement, not the film\'s picture: the subtitles are the animatic\'s own, and the shots are its drawings. Each finished compositor shot replaces its stretch of this, on the same clock.',
];
const html = readFileSync(template, 'utf8')
  .replace('__LEDE__', () => lede)
  .replace('<!--NOTES-->', () => notes.map((n) => `      <li>${n}</li>`).join('\n'))
  .replace('/*DATA*/{}', () => JSON.stringify(data));
writeFileSync(out, html);
console.log(out, (html.length / 1048576).toFixed(2), 'MB');
