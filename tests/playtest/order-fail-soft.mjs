// Browser-level degraded-path check for the order-map fail-soft fix
// (docs/reviews/2026-10-woodland.md, the unit test's browser counterpart).
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/order-fail-soft.mjs
//
// Blocks `afternoon/order.webp` at the network layer, then plays the woodland afternoon memory
// and asserts: the living scene plays (not the wall poster), no console/page errors beyond the
// expected warnings, no leak between two plays, and the memory disposes.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  ({ chromium, devices } = require(`${require('node:child_process').execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output/review/order-fail-soft/run';
mkdirSync(OUT, { recursive: true });
const MEMORY = 'woodland', VARIANT = 'afternoon', PHRASE = 'more-minutes';
const STAGES = [['00-untouched', null], ['03-colour', 6.5], ['07-two', 16.5], ['13-empty-dusk', 39.5], ['15-wall', 47.5]];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const report = { at: new Date().toISOString(), profiles: {} };
for (const profile of ['desktop']) {
  const opts = profile === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } };
  const ctx = await browser.newContext(opts);
  // Block the order map at the network layer: a 404 from the server, as a flaky fetch would see.
  await ctx.route('**/woodland/afternoon/order.webp', (r) => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // A real regression on the degraded path would surface as a `console.error` (e.g. an uncaught
    // TypeError, or a page-level error). The blocked `order.webp` 404s do NOT log as console
    // errors in Chromium (fetch() 404s aren't sub-resource failures, and the app's `fetchBlob`
    // rejects via `Promise.reject`, caught by the fix's `.catch(() => null)`); so any error here
    // is genuine. Keep the location filter as a guard against any future browser that does log it.
    let loc = '';
    try { loc = m.location()?.url ?? ''; } catch { loc = ''; }
    const isOrder404 = m.type() === 'error' && /order\.webp/.test(loc);
    if (m.type() === 'error' && !isOrder404) errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('order.webp')) return; // expected: the blocked request
    errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  });
  // Also capture the response status to suppress the order.webp 404 from being recorded as an
  // error: a 404 response triggers the browser's "Failed to load resource" console error with no
  // URL in the text, so count them and allow up to that many order.webp 404s.
  let order404s = 0;
  page.on('response', (r) => { if (r.url().includes('order.webp') && r.status() === 404) order404s++; });
  await page.goto(`${BASE}?seed=7`);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
  await page.click('#enter');
  await page.waitForFunction(() => (window.__hedgehog.score?.t ?? 0) > 2, null, { timeout: 60000 });
  await page.evaluate(() => {
    const b = document.getElementById('skip');
    if (b && !b.hidden) b.click();
  });
  await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async (phrase) => {
    const a = window.__hedgehog;
    if (!a.text.anchorOf(phrase)) a.text.setShown(phrase);
    for (let i = 0; i < 100 && !a.text.anchorOf(phrase); i++) await new Promise((r) => setTimeout(r, 50));
    const an = a.text.anchorOf(phrase), it = a.text.items.get(an.key);
    const c = it.centre, n = it.normal;
    a.rig.cancelAttend(); a.rig.stand?.();
    const f = [c.x + n.x * 2.4, 0, c.z + n.z * 2.4];
    a.rig.pos.set(f[0], 0, f[2]);
    const eye = a.rig.eyeHeight ?? 1.58;
    const dx = c.x - f[0], dy = c.y - 0.1 - eye, dz = c.z - f[2];
    a.rig.yaw = Math.atan2(-dx, -dz);
    a.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, PHRASE);
  await page.waitForTimeout(2500);
  const textures0 = await page.evaluate(() => window.__hedgehog.renderer.info.memory.textures);
  const programs0 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
  const shots = [];
  let orderIsNull = false, living = false;
  for (const [name, pos] of STAGES) {
    if (pos === null) {
      await page.screenshot({ path: `${OUT}/${profile}-${name}.png`, timeout: 180000 });
      const ok = await page.evaluate(([m, v, p]) => window.__hedgehog.playMemory(m, p, v), [MEMORY, VARIANT, PHRASE]);
      if (!ok) throw new Error('memory did not start');
      shots.push(name);
      continue;
    }
    const st = await page.evaluate((p) => window.__hedgehog.heldAt(p), pos);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${profile}-${name}.png`, timeout: 180000 });
    // The living scene plays, not the poster; and the order map degrades to null.
    const probe = await page.evaluate(() => {
      const pl = window.__hedgehog.living?.memory.prepared.living;
      return {
        living: !!pl,
        order: pl ? pl.order : undefined,
        shot: pl?.scene.shot ?? -1,
        blank: (() => {
          const sc = pl?.scene; if (!sc) return false;
          const T = sc.target, b = new Uint8Array(4); let most = 0;
          for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
            window.__hedgehog.renderer.readRenderTargetPixels(T, Math.floor((T.width * i) / 6), Math.floor((T.height * j) / 6), 1, 1, b);
            most = Math.max(most, b[0], b[1], b[2]);
          }
          return most < 8;
        })(),
      };
    });
    if (!probe.living) errors.push(`${name}: living scene is null (poster fallback ran)`);
    if (probe.living && probe.order !== null) errors.push(`${name}: order is ${probe.order}, expected null`);
    if (probe.blank) errors.push(`${name}: living scene is blank`);
    if (name === '03-colour') { living = probe.living; orderIsNull = probe.order === null; }
    shots.push(`${name} (${st.state} @ ${st.position})`);
  }
  const programs1 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
  await page.evaluate(() => { window.__hedgehog.heldAt(null); window.__hedgehog.endLivingMemory('depart'); });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({ textures: window.__hedgehog.renderer.info.memory.textures, living: !!window.__hedgehog.living }));
  // Second play: leak guard (the degraded load must not leak between plays).
  await page.evaluate(([m, v, p]) => window.__hedgehog.playMemory(m, p, v), [MEMORY, VARIANT, PHRASE]);
  for (const p of [2.5, 6.5, 16.5]) { await page.evaluate((x) => window.__hedgehog.heldAt(x), p); await page.waitForTimeout(800); }
  await page.evaluate(() => { window.__hedgehog.heldAt(null); window.__hedgehog.endLivingMemory('depart'); });
  await page.waitForTimeout(3000);
  after.texturesAfterSecond = await page.evaluate(() => window.__hedgehog.renderer.info.memory.textures);
  report.profiles[profile] = { shots, living, orderIsNull, programsAtBoot: programs0, programsAfter: programs1, texturesBefore: textures0, texturesAfter: after.textures, texturesAfterSecond: after.texturesAfterSecond, stillLiving: after.living, errors, order404s, warnings: warnings.length };
  console.log(profile, JSON.stringify({ ...report.profiles[profile], warnings: warnings.slice(0, 3) }));
  await ctx.close();
}
writeFileSync(`${OUT}/order-fail-soft.json`, JSON.stringify(report, null, 2));
await browser.close();
const failed = Object.entries(report.profiles).filter(([, p]) =>
  p.errors.length > 0 || p.programsAfter !== p.programsAtBoot || p.texturesAfterSecond !== p.texturesAfter || p.stillLiving || !p.living || !p.orderIsNull);
if (failed.length) { console.error(`failed: ${failed.map(([k]) => k).join(', ')}`); process.exitCode = 1; }
else console.log('order-fail-soft ok');
