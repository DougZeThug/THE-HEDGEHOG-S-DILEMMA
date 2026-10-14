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
const PROFILES = (process.env.PROFILES ?? 'desktop,phone').split(','); // also: phone3
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
  // The same bare patch of wall, once at the centre of the frame and once near its top-left
  // corner: a look that is light, not a filter, gives it the same value in both.
  ['inv-centre', [1.0, 0, 0.5], [1.0, 1.6, -3.2]],
  ['inv-corner', [1.0, 0, 0.5], [2.9, 0.55, -3.2]],
];
/** Named places to measure, projected each frame. */
const PLACES = {
  backWall: [0, 1.6, -3.2],
  backTopLeft: [-2.9, 2.9, -3.2],
  backTopRight: [2.9, 2.9, -3.2],
  ceiling: [0, 3.1, -0.2],
  floorPool: [0.5, 0, -0.15],
  chairShadow: [0, 0, 0.14],
  panel: [0.1, 3.08, -0.95],
  floorFront: [0, 0, 2.1],
  floorEdge: [-2.6, 0, 1.2],
  sideWall: [-3.2, 1.5, 0.8],
  seat: [0, 0.345, 0.05],
  invPoint: [1.0, 1.6, -3.2],
};

const stand = (page, from, to) =>
  page.evaluate(
    ([f, t]) => {
      const a = window.__hedgehog;
      a.rig.cancelAttend();
      // Fixed views are from standing height (the opening leaves the visitor seated until they walk).
      a.rig.stand?.();
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
  // 'phone' at pixel ratio 1 (fast); 'phone3' as a real iPhone renders it (ratio 1.5 on low quality).
  const opts = profile === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : profile === 'phone3' ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 800 } };
  for (const style of STYLES) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
    // The opening runs on the wall clock, and software GL is slow: to see a stage at an exact
    // moment, the clock is frozen there (frames keep rendering, nothing advances), then let go.
    // Once the visitor has entered, time also runs on a virtual clock: a tenth of a second per
    // frame (the app's own longest step) however long the frame took, so a stage lands on the
    // same frame on any machine.
    await ctx.addInitScript(() => {
      const real = performance.now.bind(performance);
      let virt = null, frozen = null, lastTs = -1;
      performance.now = () => frozen ?? virt ?? real();
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        raf((ts) => {
          if (virt !== null && frozen === null && ts !== lastTs) virt += 100;
          lastTs = ts;
          cb(performance.now());
        });
      window.__virtual = () => (virt = real());
      window.__freeze = (ms) => (frozen = ms);
      window.__nowMs = () => performance.now();
      window.__thaw = () => {
        if (virt !== null) virt = frozen;
        frozen = null;
      };
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}?seed=7&style=${style}`);
    await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
    const programs0 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
    await page.evaluate(() => window.__virtual());
    await page.click('#enter');
    const shot = async (name) => {
      const file = `${profile}-${style}-${name}.png`;
      await page.screenshot({ path: `${OUT}/${file}`, timeout: 120000 });
      const m = await measure(page);
      result.frames.push({ profile, style, name, file, ...m });
    };
    if (process.env.OPENING !== '0') {
      // The opening's stages (the score's own times; a phone's score is shorter): first light,
      // the chair alone, the room arriving, the first stroke.
      const times = profile.startsWith('phone') ? [6.2, 8.1, 11.0, 12.0] : [7.2, 9.5, 12.9, 14.1];
      for (const [i, name] of ['open-first-light', 'open-chair-alone', 'open-room-arrives', 'open-first-stroke'].entries()) {
        const t = times[i];
        await page.waitForFunction((t) => (window.__hedgehog.score?.t ?? 0) >= t - 0.45, t, { timeout: 120000, polling: 50 });
        await page.evaluate((t) => {
          const cur = window.__hedgehog.score.t;
          const now = window.__nowMs();
          window.__freeze(cur < t ? now + (t - cur) * 1000 : now);
        }, t);
        await page.waitForTimeout(2500);
        // Frozen where asked, or the frame is of another stage (software GL is slow to catch up).
        const at = await page.evaluate(() => window.__hedgehog.score.t);
        if (Math.abs(at - t) > 0.15) console.warn(`${profile} ${style} ${name}: frozen at ${at.toFixed(2)} s, wanted ${t}`);
        await shot(name);
        result.frames[result.frames.length - 1].scoreT = +at.toFixed(2);
        await page.evaluate(() => window.__thaw());
      }
    } else {
      await page.waitForFunction(() => (window.__hedgehog.score.t ?? 0) > 2, null, { timeout: 60000 });
      await page.click('#skip');
    }
    await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    // The hand-off, still seen from where the opening put the visitor (low and centred, as the
    // artist's reference is framed: they haven't taken a step yet).
    if (process.env.OPENING !== '0') await shot('open-handoff');
    for (const [name, from, to] of VIEWS) {
      // The invariance pair measures the light, so the grade's vignette is off for it.
      const inv = name.startsWith('inv-');
      if (inv) await page.evaluate(() => { window.__hedgehog.post.vignette = 0; });
      await stand(page, from, to);
      await page.waitForTimeout(1000);
      await shot(name);
      if (inv) await page.evaluate(() => { const a = window.__hedgehog; a.post.vignette = a.look.vignette; });
    }
    // The chair turned and moved (the Director's nudge): its shadow and contacts must follow.
    await stand(page, VIEWS[1][1], VIEWS[1][2]);
    await page.evaluate(() => {
      const a = window.__hedgehog;
      a.chair.nudge(0.12, -0.05, 0.5);
    });
    await page.waitForTimeout(1500);
    await shot('chair-moved');
    // The same frame with the shadow forced to redraw: if it differs, the shadow was stale.
    await page.evaluate(() => window.__hedgehog.lighting.invalidateShadow());
    await page.waitForTimeout(1500);
    await shot('chair-moved-redrawn');
    await page.evaluate(() => window.__hedgehog.chair.nudge(-0.12, 0.05, -0.5));
    // The GL context lost and restored (a phone backgrounding the tab): the room must come back whole.
    await page.evaluate(() => {
      const d = window.__hedgehog.director;
      const f = d.computeEnv.bind(d);
      d.computeEnv = () => ({ ...f(), shadowDrift: 0 });
      window.__hedgehog.lighting.cur.drift = 0;
    });
    await page.waitForTimeout(1500);
    await shot('ctx-before');
    await page.evaluate(async () => {
      const gl = window.__hedgehog.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 1500));
      ext.restoreContext();
      await new Promise((r) => setTimeout(r, 4000));
    });
    await shot('ctx-after');
    await page.evaluate(() => delete window.__hedgehog.director.computeEnv);
    // The room's own range, under this look, from the reference pose: the light cooled as when
    // the visitor comes close (lightWarmth -0.6), and the room taken back to the chair (a dim).
    await stand(page, VIEWS[0][1], VIEWS[0][2]);
    // Settled at once (software GL would take many seconds of engine time to approach it).
    await page.evaluate(() => {
      const a = window.__hedgehog;
      const d = a.director;
      const f = d.computeEnv.bind(d);
      d.computeEnv = () => ({ ...f(), lightWarmth: -0.6 });
      a.lighting.cur.warmth = -0.6;
    });
    await page.waitForTimeout(1500);
    await shot('cool');
    // The Director's own depth for its dims (the held silence, the turn to the last phase).
    await page.evaluate(() => {
      const a = window.__hedgehog;
      delete a.director.computeEnv;
      a.lighting.dimToChair(0.15, 40, a.time);
    });
    await page.waitForFunction(() => window.__hedgehog.lighting.roomLight < 0.16, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    await shot('dim');
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
