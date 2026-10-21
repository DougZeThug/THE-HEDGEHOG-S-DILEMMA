// End-to-end probe for the character-box overlap fix. Bakes the bug report's exact cases
// ('Tb' typed, 'hb' pencil) through the REAL `textTexture` in a browser with the real fonts
// loaded, then verifies that each glyph's ink — including the left strip a couple of px into
// the pad (lsb < 0.04 em), the strip the overlap used to steal — is timed within that glyph's
// own character window. Runs against `vite dev` (which serves the source modules). Expects a
// server at PROBE (default http://localhost:5173/tests/playtest/handwriting-probe.html).
//
// Usage: npx vite --port 5173 & node tests/playtest/handwriting-probe.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(`${globalRoot}/playwright`));
}

const PROBE = process.env.PROBE ?? 'http://localhost:5173/tests/playtest/handwriting-probe.html';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(PROBE, { waitUntil: 'load' });

const report = await page.evaluate(async () => {
  // Dynamic imports resolve through vite dev (source TS, on the fly).
  const tex = await import('/src/world/textures.ts');
  const hb = await import('/src/world/handwriting.ts');
  // The @font-face rules come from the <link> tags in probe.html; make sure those families
  // are actually loaded before baking (textTexture rasterizes synchronously with fillText).
  await Promise.all([
    document.fonts.load('600 200px "Cormorant Garamond"'),
    document.fonts.load('400 200px "Reenie Beanie"'),
    document.fonts.load('400 200px "Nothing You Could Do"'),
    document.fonts.load('400 200px "Caveat"'),
  ]);
  await document.fonts.ready;

  const PX_PER_M = 700; // textures.ts
  const cases = [
    { text: 'Tb', hand: 'typed' },
    { text: 'hb', hand: 'pencil' },
    { text: 'hl', hand: 'typed' },
    { text: 'hl', hand: 'pencil' },
  ];
  const out = [];
  for (const { text, hand } of cases) {
    const key = 'probe-' + text + '-' + hand;
    const st = tex.HANDS[hand];
    // textTexture clamps huge canvases; for these short words no scale is applied (wantW << 2048).
    const bake = tex.textTexture(text, hand, 'm', key);
    const W = bake.tex.image.width, H = bake.tex.image.height, data = bake.tex.image.data;
    const tm = hb.handTiming(text, hand, key);
    const dur = Math.max(1e-3, bake.duration);
    const px = tex.SIZE_EM['m'] * st.scale * PX_PER_M; // scale == 1 here
    // Reconstruct the boxes exactly as textTexture does (via charBox), using the same
    // measureText widths, so the advance boundary is the real one baked into the texture.
    const g = document.createElement('canvas').getContext('2d');
    g.font = `${st.italic ? 'italic ' : ''}${st.weight} ${px}px "${st.font}", "Segoe Print", "Bradley Hand", cursive`;
    const x = px * 0.15, y = px * 1.0; // textTexture's line origin (wobble is y-only, irrelevant to the boundary)
    let cx = 0;
    const boxes = [];
    for (let k = 0; k < text.length; k++) {
      const cw = st.tracking ? g.measureText(text[k]).width + st.tracking * px : g.measureText(text.slice(0, k + 1)).width - cx;
      boxes.push(tex.charBox(k, x, cx, cw, px, y, 0, k === 0, k === text.length - 1, hand));
      cx += cw;
    }
    const boundary = boxes[1].x0; // == boxes[0].x1 (advance boundary of glyph 0)
    const overlap = boxes[0].x1 - boxes[1].x0; // must be ~0 (no overlap)
    const [s0, e0] = tm.chars[0];
    const [s1, e1] = tm.chars[1];
    let leftInk = 0, rightInk = 0, leftInGlyph0 = 0, rightInGlyph1 = 0, strayRight = 0, strayLeft = 0;
    let leftStripInB = []; // times of the few ink pixels just right of the boundary (the strip)
    const strayLeftSamples = [];
    const strayRightSamples = [];
    for (let yy = 0; yy < H; yy++) {
      for (let xx = 0; xx < W; xx++) {
        const dataRow = H - 1 - yy; // rows are bottom-up in the DataTexture
        const idx = (dataRow * W + xx) * 4;
        if (data[idx + 3] < 24) continue;
        const t = (data[idx] / 255) * dur;
        if (xx < boundary) {
          leftInk++;
          if (t >= s0 - 1e-3 && t <= e0 + 1e-3) leftInGlyph0++;
          else { strayLeft++; if (strayLeftSamples.length < 8) strayLeftSamples.push({ x: xx, t: +t.toFixed(4), a: data[idx+3] }); }
        } else {
          rightInk++;
          if (t >= s1 - 1e-3 && t <= e1 + 1e-3) rightInGlyph1++;
          else { strayRight++; if (strayRightSamples.length < 8) strayRightSamples.push({ x: xx, t: +t.toFixed(4), a: data[idx+3] }); }
          if (xx - boundary < 6) leftStripInB.push(t);
        }
      }
    }
    out.push({
      text, hand, W, H, dur, boundary, overlap,
      chars: [[s0, e0], [s1, e1]],
      leftInk, rightInk, leftInGlyph0, rightInGlyph1, strayLeft, strayRight,
      leftStripTimes: leftStripInB.slice(0, 5).map((t) => +t.toFixed(4)),
      leftStripMin: leftStripInB.length ? Math.min(...leftStripInB) : null,
      leftStripMax: leftStripInB.length ? Math.max(...leftStripInB) : null,
      strayLeftSamples,
      strayRightSamples,
    });
  }
  return out;
});

console.log(JSON.stringify(report, null, 2));

await browser.close();
if (errors.length) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}

// Behavioural assertions for THIS bug (adjacent character boxes stealing the next glyph's
// left strip): the boxes must meet at the advance boundary (no overlap); every ink pixel right
// of the boundary — including the strip a few px into the pad (lsb < 0.04 em) that the overlap
// used to steal — must be timed within glyph 1's window; and that strip must NOT be written
// before glyph 0 ends (the "whole character early" symptom). Deferred marks after the word
// (an i-dot, a t-bar, or a stylistic flick of the previous glyph, e.g. 'T's serif or 'h's
// ascending flick in Reenie Beanie) are intended `bakeStrokes` behaviour and are allowed:
// they are ink left of the boundary (so owned by glyph 0 already) timed after the word, not
// glyph 1's strip written early or deferred via the overlap.
let failures = 0;
for (const r of report) {
  if (Math.abs(r.overlap) > 0.5) { console.error(`FAIL ${r.text}|${r.hand}: boxes overlap by ${r.overlap}`); failures++; }
  if (r.strayRight > 0) { console.error(`FAIL ${r.text}|${r.hand}: ${r.strayRight}/${r.rightInk} ink right of the boundary (glyph 1's, incl. its left strip) not in glyph 1's window`); failures++; }
  if (r.leftStripMin !== null) {
    const [, e0] = r.chars[0];
    const [s1, e1] = r.chars[1];
    if (r.leftStripMin < e0 - 1e-3) { console.error(`FAIL ${r.text}|${r.hand}: strip just right of boundary (min ${r.leftStripMin}) written before glyph 0 ends (${e0})`); failures++; }
    if (r.leftStripMin < s1 - 2e-3 || r.leftStripMax > e1 + 2e-3) { console.error(`FAIL ${r.text}|${r.hand}: strip (min ${r.leftStripMin}, max ${r.leftStripMax}) outside glyph 1's window [${s1}, ${e1}]`); failures++; }
  }
}
if (failures) { console.error(`\n${failures} end-to-end check(s) failed`); process.exit(1); }
console.log('handwriting probe ok');
