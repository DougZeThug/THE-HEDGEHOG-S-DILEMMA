// What the vignettes leave in the room, captured (for the artistic evaluation): J's lost word
// ("loneliest" fading from its line), E's line receding up close and returning at a distance,
// and F's room going down to the chair. Desktop and an emulated phone.
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/vignette-traces.mjs     (OUT=test-output/review/vignettes/traces)
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
const OUT = process.env.OUT ?? 'test-output/review/vignettes/traces';
const PROFILES = (process.env.PROFILES ?? 'desktop,phone').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const report = {};

async function enter(profile) {
  const opts = profile === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } };
  const ctx = await browser.newContext({ ...opts, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
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
  return { ctx, page, errors };
}

/** Show a line and stand `d` m in front of it, looking at it. */
const stand = (page, phrase, d) => page.evaluate(async ([phrase, d]) => {
  const a = window.__hedgehog;
  if (!a.text.anchorOf(phrase)) a.text.setShown(phrase);
  for (let i = 0; i < 100 && !a.text.anchorOf(phrase); i++) await new Promise((r) => setTimeout(r, 50));
  const it = a.text.items.get(a.text.anchorOf(phrase).key);
  const c = it.centre, n = it.normal;
  a.rig.cancelAttend();
  a.rig.stand?.();
  const f = [c.x + n.x * d, 0, c.z + n.z * d];
  a.rig.pos.set(f[0], 0, f[2]);
  const eye = a.rig.eyeHeight ?? 1.58;
  a.rig.yaw = Math.atan2(-(c.x - f[0]), -(c.z - f[2]));
  a.rig.pitch = Math.atan2(c.y - 0.1 - eye, Math.hypot(c.x - f[0], c.z - f[2]));
  return it.key;
}, [phrase, d]);

const shot = async (page, name) => {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

for (const profile of PROFILES) {
  const r = (report[profile] = {});
  // J: the word goes.
  {
    const { ctx, page, errors } = await enter(profile);
    const programs0 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
    await stand(page, 'lonely-birthday', 1.8);
    await shot(page, `${profile}-word-before`);
    await page.evaluate(() => {
      const a = window.__hedgehog;
      for (const k of a.text.keysOf('lonely-birthday')) {
        a.text.loseWord(k, 'loneliest', 1);
        // (Gone: the fade runs on scene time, which crawls under software rendering.)
        a.text.items.get(k).gap.gone = 1;
      }
    });
    await page.waitForTimeout(3000);
    await shot(page, `${profile}-word-gone`);
    await stand(page, 'lonely-birthday', 4.2);
    await shot(page, `${profile}-word-gone-far`);
    r.word = { errors, programs: [programs0, await page.evaluate(() => window.__hedgehog.renderer.info.programs.length)] };
    await ctx.close();
  }
  // E: the line recedes.
  {
    const { ctx, page, errors } = await enter(profile);
    await stand(page, 'far-enough', 3.6);
    await page.evaluate(() => {
      const a = window.__hedgehog;
      for (const k of a.text.keysOf('far-enough')) a.text.recede(k, 1);
    });
    await shot(page, `${profile}-recede-far`);
    await stand(page, 'far-enough', 1.25);
    await page.waitForTimeout(2500);
    await shot(page, `${profile}-recede-near`);
    await stand(page, 'far-enough', 3.6);
    await page.waitForTimeout(4000);
    await shot(page, `${profile}-recede-back`);
    r.recede = { errors };
    await ctx.close();
  }
  // F: the room goes down to the chair.
  {
    const { ctx, page, errors } = await enter(profile);
    await page.evaluate(() => {
      const a = window.__hedgehog;
      a.rig.cancelAttend();
      a.rig.pos.set(0.2, 0, 2.2);
      a.rig.yaw = 0;
      a.rig.pitch = -0.3;
    });
    await shot(page, `${profile}-chair-before`);
    await page.evaluate(() => window.__hedgehog.playVignette('five-minutes', 'first', true));
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/${profile}-chair-bedtime.png` });
    r.dim = { errors };
    await ctx.close();
  }
  console.log(profile, JSON.stringify(r));
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
