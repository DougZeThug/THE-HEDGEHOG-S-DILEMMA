// The room's look, compared: every style preset, on desktop and an emulated phone, from fixed
// places (one framed like the artist's reference image), through the opening, and up close to
// the writing. Writes PNGs, a contact sheet beside the reference, and measurements.
//
//   npm run build && npx vite preview --port 4180 --strictPort &
//   BASE=http://localhost:4180/ OUT=test-output/review/style/<label> node tests/playtest/style.mjs
//
// Env: STYLES=original,subtle,reference (default all), PROFILES=desktop,phone, OPENING=0 to
// skip the opening frames, REDUCED=1 for reduced motion.
// Measurements (OUT/style.json): for each frame, the projected screen boxes of named places
// (back wall, its top corners, ceiling, floor pool, floor foreground, chair) and of the writing
// in view, so tests/playtest/style-metrics.py can read their luminance and the ink's contrast.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  ({ chromium, devices } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output/review/style/run';
const STYLES = (process.env.STYLES ?? 'original,subtle,reference').split(',');
const PROFILES = (process.env.PROFILES ?? 'desktop,phone').split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

/** Fixed views: where the visitor stands and what they look at (world metres). */
const VIEWS = [
  // As the reference is framed: centred, from near the south wall, the chair low in the middle.
  ['reference', [0.0, 0, 2.95], [0.0, 1.05, -3.2]],
  ['chair', [0.35, 0, 1.15], [0, 0.4, 0]],
  ['east', [-1.6, 0, 0.3], [3.2, 1.3, 0.3]],
  ['west', [1.6, 0, -0.3], [-3.2, 1.0, -0.3]],
  ['north-writing', [-0.6, 0, -1.4], [-0.6, 1.5, -3.2]],
];
/** Named places to measure, projected each frame. */
const PLACES = {
  backWall: [0, 1.6, -3.2],
  backTopLeft: [-2.9, 2.9, -3.2],
  backTopRight: [2.9, 2.9, -3.2],
  ceiling: [0, 3.1, -0.2],
  floorPool: [0.25, 0, 0.45],
  floorFront: [0, 0, 2.1],
  floorEdge: [-2.6, 0, 1.2],
  sideWall: [-3.2, 1.5, 0.8],
  seat: [0, 0.345, 0.05],
};

const stand = (page, from, to) =>
  page.evaluate(
    ([f, t]) => {
      const a = window.__hedgehog;
      a.rig.cancelAttend();
      a.rig.pos.set(f[0], 0, f[2]);
      const eye = a.rig.eye ?? 1.58;
      const dx = t[0] - f[0], dy = t[1] - eye, dz = t[2] - f[2];
      a.rig.yaw = Math.atan2(-dx, -dz);
      a.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    [from, to],
  );

/** Screen boxes (CSS px) of the named places and of the writing in view. */
const measure = (page) =>
  page.evaluate((places) => {
    const a = window.__hedgehog;
    const cam = a.rig.camera;
    cam.updateMatrixWorld();
    const W = innerWidth, H = innerHeight;
    const V = cam.position.constructor;
    const proj = (p) => {
      const v = new V(p[0], p[1], p[2]).project(cam);
      return v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 ? [Math.round((v.x * 0.5 + 0.5) * W), Math.round((-v.y * 0.5 + 0.5) * H)] : null;
    };
    const pts = {};
    for (const [k, p] of Object.entries(places)) pts[k] = proj(p);
    const ink = [];
    for (const it of a.text.items.values()) {
      if (it.vis < 0.5 || !it.mesh?.visible || it.placement.surface === 'floor' || it.placement.surface === 'ceiling') continue;
      it.mesh.updateMatrixWorld();
      const cs = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, y]) => new V(x, y, 0).applyMatrix4(it.mesh.matrixWorld).project(cam));
      if (cs.some((v) => v.z >= 1)) continue;
      const xs = cs.map((v) => (v.x * 0.5 + 0.5) * W), ys = cs.map((v) => (-v.y * 0.5 + 0.5) * H);
      const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round);
      if (box[0] < 0 || box[1] < 0 || box[2] > W || box[3] > H || box[2] - box[0] < 24) continue;
      ink.push({ key: it.key, hand: it.hand ?? null, purpose: it.purpose, opacity: +it.uniforms.uOpacity.value.toFixed(3), box });
    }
    return { W, H, pts, ink, programs: a.renderer.info.programs.length };
  }, PLACES);

const result = { base: BASE, at: new Date().toISOString(), frames: [] };
for (const profile of PROFILES) {
  const opts = profile === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } };
  for (const style of STYLES) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}?seed=7&style=${style}`);
    await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
    const programs0 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
    await page.click('#enter');
    const shot = async (name) => {
      const file = `${profile}-${style}-${name}.png`;
      await page.screenshot({ path: `${OUT}/${file}`, timeout: 120000 });
      const m = await measure(page);
      result.frames.push({ profile, style, name, file, ...m });
    };
    if (process.env.OPENING !== '0') {
      // The opening on its own clock: black, the chair alone, the room arriving, the hand-off.
      for (const [name, t] of [['open-3s', 3], ['open-7s', 7], ['open-11s', 11]]) {
        await page.waitForFunction((t) => (window.__hedgehog.score.t ?? 0) >= t, t, { timeout: 120000 });
        await shot(name);
      }
    } else {
      await page.waitForFunction(() => (window.__hedgehog.score.t ?? 0) > 2, null, { timeout: 60000 });
      await page.click('#skip');
    }
    await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    for (const [name, from, to] of VIEWS) {
      await stand(page, from, to);
      await page.waitForTimeout(1000);
      await shot(name);
    }
    // Switching presets live must compile nothing.
    const switched = await page.evaluate((styles) => {
      const a = window.__hedgehog;
      if (!a.setStyle) return null;
      const before = new Set(a.renderer.info.programs.map((p) => p.cacheKey));
      for (const s of styles) {
        a.setStyle(s);
        a.post.render();
      }
      return a.renderer.info.programs.filter((p) => !before.has(p.cacheKey)).length;
    }, ['original', 'subtle', 'reference', STYLES[0]]);
    const programs1 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
    result.frames.push({ profile, style, name: 'summary', programsAtThreshold: programs0, programsAfter: programs1, compiledBySwitching: switched, errors });
    console.log(profile, style, JSON.stringify({ programs0, programs1, compiledBySwitching: switched, errors: errors.length }));
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/style.json`, JSON.stringify(result, null, 1));

// A contact sheet: the reference beside each preset's reference-framed view, then the rest.
const ref = 'test-output/review/style/reference.png';
if (existsSync(ref)) copyFileSync(ref, `${OUT}/reference.png`);
const names = [...new Set(result.frames.filter((f) => f.file).map((f) => f.name))];
const cell = (f) => (f ? `<figure><img src="${f}" loading="lazy"><figcaption>${f}</figcaption></figure>` : '<figure></figure>');
let html = `<!doctype html><meta charset="utf-8"><title>Style comparison</title><style>
body{font:13px system-ui;background:#1b1a19;color:#ddd;margin:16px}h2{font-weight:500;margin:24px 0 8px}
.row{display:grid;grid-template-columns:repeat(${STYLES.length + 1},1fr);gap:8px}
figure{margin:0}img{width:100%;display:block}figcaption{opacity:.6;margin-top:2px}</style>
<h1>The room against the reference</h1>`;
for (const profile of PROFILES)
  for (const n of names) {
    html += `<h2>${profile} · ${n}</h2><div class="row">${n === 'reference' ? cell('reference.png') : '<figure></figure>'}`;
    for (const s of STYLES) html += cell(result.frames.find((f) => f.profile === profile && f.style === s && f.name === n)?.file);
    html += '</div>';
  }
writeFileSync(`${OUT}/index.html`, html);
console.log(`style → ${OUT}/index.html`);
