// The opening, in real time, in a browser: a phone (touch) without the autoplay override,
// so the tap on the black threshold really is what lets the room be heard.
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/opening.mjs            (BASE=… to point elsewhere; OUT=… for frames)
//
// Checks (brief §12; docs/reviews/2026-10-cinematic-opening.md):
//   the title fades in and out on black; the chair is lit before the walls; the room starts
//   sparsely written; the first line is written over time (not revealed at once) and stops
//   unfinished; the voice's line is written as it is heard; nothing of the Director's happens
//   before the hand-off; audio runs after the tap; the hand-off comes by ~25 s; Skip works at
//   any time; touch looks and walks afterwards. Frames go to OUT for people to look at.
// Software rendering here is slow (~10 fps): times are read from the score's own clock.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  ({ chromium, devices } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output/opening';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};
const newPhone = async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => errors.push(`failed: ${r.url()}`));
  await page.goto(`${BASE}?seed=7`);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
  return { ctx, page, errors };
};
const state = (page) => page.evaluate(() => {
  const a = window.__hedgehog;
  const s = a.score;
  const items = [...a.text.items.values()];
  return {
    t: s.t, stage: s.stage, planned: s.handoffAt, title: +(document.getElementById('title').style.opacity || 0), black: a.post.black,
    key: a.lighting.score.key, area: a.lighting.score.area,
    stay: a.text.writtenFraction('stay'), crumbs: a.text.writtenFraction('opening:crumbs'),
    visible: items.filter((i) => i.vis > 0.5 && i.purpose === 'phrase' && i.placement.surface !== 'floor').length,
    ctx: a.audio?.ctx.state ?? null, log: a.director.log.length, caption: document.getElementById('captions').textContent.trim(),
  };
});

// ── A first visit, watched through ──────────────────────────────────────────
{
  const { ctx, page, errors } = await newPhone();
  const before = await page.evaluate(() => ({ ctx: window.__hedgehog.audio?.ctx.state ?? 'none', title: document.getElementById('title').textContent }));
  check(before.ctx === 'none', 'no audio before the tap');
  check(/Hedgehog/.test(before.title), 'the threshold carries the title');
  await page.tap('#enter');
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const s = await state(page);
    samples.push(s);
    if (s.stage === 'done') break;
    // Frames for people to look at (not while the voice is writing: a screenshot here stalls the sampling).
    if ([3, 11].some((x) => s.t > x && s.t < x + 0.6) && !samples.some((p) => p.shot === Math.round(s.t))) {
      s.shot = Math.round(s.t);
      await page.screenshot({ path: `${OUT}/first-${s.shot}s.png`, timeout: 120000 });
    }
    await page.waitForTimeout(120);
  }
  const during = samples.filter((s) => s.t !== null);
  const handoff = during[during.length - 1];
  await page.screenshot({ path: `${OUT}/first-handoff.png`, timeout: 120000 });
  check(during.some((s) => s.title > 0.9) && during.filter((s) => s.t > 7).every((s) => s.title < 0.05), 'the title appears, holds, and is gone');
  check(during.filter((s) => s.title > 0.05).every((s) => s.black > 0.99), 'the title is on black');
  // Robust to sampling gaps (a screenshot stalls the sampler): a moment seen with the chair lit and the walls still dark.
  const chairAlone = during.filter((s) => s.key > 0.2 && s.area < 0.05 && s.black < 0.01);
  check(chairAlone.length >= 2 && during.findIndex((s) => s.key > 0.2) < during.findIndex((s) => s.area > 0.3), `the chair is lit before the walls (${chairAlone.length} samples of the chair alone)`);
  check(during.filter((s) => s.area > 0.5 && s.stage === 'room').every((s) => s.visible <= 1), 'the room comes up nearly empty');
  const stay = [...new Set(during.map((s) => +s.stay.toFixed(2)))].filter((x) => x > 0 && x < 0.78);
  check(stay.length >= 3, `the first line is written over time (${stay.length} partial states seen)`);
  check(Math.max(...during.map((s) => s.stay)) < 0.95, 'and left unfinished');
  const crumbs = [...new Set(during.map((s) => +s.crumbs.toFixed(2)))].filter((x) => x > 0 && x < 1);
  check(crumbs.length >= 2, `the voice's words are written as they are heard (${crumbs.length} partial states seen)`);
  check(during.some((s) => /crumbs/.test(s.caption)), 'the voice is captioned');
  check(during.every((s) => s.log === 0), 'nothing of the Director before the hand-off');
  check(during.filter((s) => s.t > 1).every((s) => s.ctx === 'running'), 'audio runs after the tap (no autoplay override)');
  check(handoff.planned < 25 && Date.now() - t0 < 45000, `the room is the visitor's by ~25 s (score hand-off ${handoff.planned.toFixed(1)} s)`);
  // Touch after the transition.
  const cdp = await ctx.newCDPSession(page);
  const drag = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 10, y: y0 + ((y1 - y0) * i) / 10, id: 1 }] });
      await page.waitForTimeout(60);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const r0 = await page.evaluate(() => ({ yaw: window.__hedgehog.rig.yaw, z: window.__hedgehog.rig.pos.z }));
  await drag(300, 400, 160, 400);
  await drag(90, 500, 90, 300);
  await page.waitForTimeout(2500);
  const r1 = await page.evaluate(() => ({ yaw: window.__hedgehog.rig.yaw, z: window.__hedgehog.rig.pos.z }));
  check(Math.abs(r1.yaw - r0.yaw) > 0.2, 'touch looks around after the opening');
  check(Math.abs(r1.z - r0.z) > 0.2, 'touch walks after the opening');
  check(errors.length === 0, `no errors (${errors.slice(0, 3).join(' | ')})`);
  writeFileSync(`${OUT}/first.json`, JSON.stringify(samples, null, 1));
  await ctx.close();
}

// ── Skip, at once ───────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await newPhone();
  await page.tap('#enter');
  await page.waitForFunction(() => window.__hedgehog.score.t > 2, null, { timeout: 60000 });
  await page.tap('#skip');
  await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 15000 }).catch(() => {});
  const s = await state(page);
  check(s.stage === 'done', 'Skip ends the opening within seconds');
  check(s.stay > 0.5, 'what the opening would have written is there');
  check(await page.evaluate(() => window.__hedgehog.rig.enabled && window.__hedgehog.rig.walk), 'and the visitor can move');
  check(errors.length === 0, 'no errors when skipping');
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nopening ok');
