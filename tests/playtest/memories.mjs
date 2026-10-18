// A living memory, captured: the cereal memory on desktop and an emulated phone, from the
// untouched wall to what stays after it (docs/memories.md). Each stage is held exactly (the
// controller's scrub, as the editor does), so frames are the same on any machine.
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/memories.mjs          (OUT=test-output/review/memories/run)
//
// Also checks: no shader compiles after entry; textures back to baseline when it has gone.
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
const OUT = process.env.OUT ?? `test-output/review/memories/${process.env.MEMORY ?? 'cereal'}`;
const PROFILES = (process.env.PROFILES ?? 'desktop,phone').split(',');
const MEMORY = process.env.MEMORY ?? 'cereal';
const VARIANT = process.env.VARIANT ?? { cereal: 'first', bedroom: 'morning', door: 'approach', woodland: 'afternoon' }[MEMORY];
const PHRASE = { cereal: 'cereal', bedroom: 'happiest-unneeded', door: 'door-open', woodland: 'more-minutes' }[MEMORY];
// Stages: [name, sequence position or null for the untouched wall], per memory.
const STAGES = {
  cereal: [['0-untouched', null], ['1-first-drawing', 1.8], ['2-developing', 3.8], ['3-active', 9], ['4-active-late', 20], ['5-dissolving', 24.5], ['6-drawing-alone', 26.2], ['7-residue', 29]],
  bedroom: [['0-untouched', null], ['1-first-drawing', 2.6], ['2-developing', 5.5], ['3-active', 9], ['4-curtain', 11.4], ['5-active-late', 22], ['6-dissolving', 28.5], ['7-drawing-alone', 30.6]],
  door: [['0-untouched', null], ['1-first-drawing', 1.6], ['2-developing', 3.4], ['3-active', 6.5], ['4-shadow', 11], ['5-weight', 14.3], ['6-dissolving', 19.5], ['7-drawing-alone', 21]],
  // The woodland (docs/reviews/2026-10-woodland.md): the artist's eight shots.
  woodland: VARIANT === 'empty'
    ? [['0-untouched', null], ['1-first-drawing', 2.6], ['2-developing', 5], ['3-active', 10], ['4-dissolving', 18], ['5-drawing-alone', 20.6]]
    : [['00-untouched', null], ['01-pencil', 2.5], ['02-pencil-more', 4.5], ['03-colour', 6.5], ['04-carried', 8.5], ['05-crossing', 9.6], ['06-wide', 12.3], ['07-two', 16.5], ['08-her-look', 19.5], ['09-his-look', 25.5], ['10-wide-again', 31.0],
       // The cut (34.5 s): the last frame before it and the first after it, then the empty clearing.
       ['11-last-frame-before-cut', 34.5 - 1 / 60], ['12-first-frame-after-cut', 34.5], ['13-empty-dusk', 39.5], ['14-returning', 44.5], ['15-wall', 47.5], ['16-white-room', 51.0]],
}[MEMORY];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const report = { at: new Date().toISOString(), memory: MEMORY, variant: VARIANT, profiles: {} };
for (const profile of PROFILES) {
  const opts = profile === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } };
  const ctx = await browser.newContext({ ...opts, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}?seed=7`);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
  const programs0 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
  await page.click('#enter');
  await page.waitForFunction(() => (window.__hedgehog.score?.t ?? 0) > 2, null, { timeout: 60000 });
  // (On a loaded machine the opening may already be over: skip only if it is still there.)
  await page.evaluate(() => {
    const b = document.getElementById('skip');
    if (b && !b.hidden) b.click();
  });
  await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  // Write the line, and stand 2.4 m in front of it, looking at it.
  const where = await page.evaluate(async (phrase) => {
    const a = window.__hedgehog;
    // The door's line is written beneath the room's drawn door, as the Director offers it.
    if (phrase === 'door-open') a.apply({ type: 'write', key: 'memory:door-open', text: 'the door, slightly open', hand: 'pencil', size: 's', surface: 'south', under: 'ghost-door', purpose: 'recall', ttl: 0, source: 'door-open' });
    else if (!a.text.anchorOf(phrase)) a.text.setShown(phrase);
    for (let i = 0; i < 100 && !a.text.anchorOf(phrase); i++) await new Promise((r) => setTimeout(r, 50));
    const an = a.text.anchorOf(phrase);
    const it = a.text.items.get(an.key);
    const c = it.centre, n = it.normal;
    a.rig.cancelAttend();
    a.rig.stand?.();
    const f = [c.x + n.x * 2.4, 0, c.z + n.z * 2.4];
    a.rig.pos.set(f[0], 0, f[2]);
    const eye = a.rig.eyeHeight ?? 1.58;
    const dx = c.x - f[0], dy = c.y - 0.1 - eye, dz = c.z - f[2];
    a.rig.yaw = Math.atan2(-dx, -dz);
    a.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return { key: an.key, surface: it.placement.surface, centre: [c.x, c.y, c.z] };
  }, PHRASE);
  await page.waitForTimeout(2500);
  const textures0 = await page.evaluate(() => window.__hedgehog.renderer.info.memory.textures);
  const shots = [];
  for (const [name, pos] of STAGES) {
    if (pos === null) {
      await page.screenshot({ path: `${OUT}/${profile}-${name}.png` });
      shots.push(name);
      // Now it begins.
      const ok = await page.evaluate(([m, v, p]) => window.__hedgehog.playMemory(m, p, v), [MEMORY, VARIANT, PHRASE]);
      if (!ok) throw new Error('memory did not start');
      continue;
    }
    const st = await page.evaluate((p) => window.__hedgehog.heldAt(p), pos);
    await page.waitForTimeout(name.includes('residue') || name.includes('alone') ? 3000 : 1200);
    await page.screenshot({ path: `${OUT}/${profile}-${name}.png` });
    // A living scene drawn black (nothing reached its target) is a failure, whatever the frame.
    const blank = await page.evaluate(() => {
      const a = window.__hedgehog;
      const sc = a.living?.memory.prepared.living?.scene;
      if (!sc) return false;
      const T = sc.target, b = new Uint8Array(4);
      let most = 0;
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
        a.renderer.readRenderTargetPixels(T, Math.floor((T.width * i) / 6), Math.floor((T.height * j) / 6), 1, 1, b);
        most = Math.max(most, b[0], b[1], b[2]);
      }
      return most < 8;
    });
    if (blank) errors.push(`the living scene is blank at ${name}`);
    // The woodland's two-shot is shown (not silently the wide).
    const want = { '07-two': 1, '08-her-look': 1, '09-his-look': 1 }[name];
    if (want) {
      const shown = await page.evaluate(() => window.__hedgehog.living?.memory.prepared.living?.scene.shot ?? -1);
      if (shown !== want) errors.push(`${name} shows shot ${shown}, not ${want}`);
    }
    shots.push(`${name} (${st.state} @ ${st.position})`);
  }
  const programs1 = await page.evaluate(() => window.__hedgehog.renderer.info.programs.length);
  // Let it go, and see that it leaves nothing behind.
  await page.evaluate(() => {
    window.__hedgehog.heldAt(null);
    window.__hedgehog.endLivingMemory('depart');
  });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({ textures: window.__hedgehog.renderer.info.memory.textures, living: !!window.__hedgehog.living }));
  // Again, start to finish: what a memory leaves behind must not grow (the window's own noise and
  // blank textures are uploaded once, the first time it is drawn).
  await page.evaluate(([m, v, p]) => window.__hedgehog.playMemory(m, p, v), [MEMORY, VARIANT, PHRASE]);
  await page.evaluate(() => window.__hedgehog.heldAt(12));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__hedgehog.heldAt(null);
    window.__hedgehog.endLivingMemory('depart');
  });
  await page.waitForTimeout(3000);
  after.texturesAfterSecond = await page.evaluate(() => window.__hedgehog.renderer.info.memory.textures);
  report.profiles[profile] = { where, shots, programsAtBoot: programs0, programsAfter: programs1, texturesBefore: textures0, texturesAfter: after.textures, texturesAfterSecond: after.texturesAfterSecond, stillLiving: after.living, errors };
  console.log(profile, JSON.stringify(report.profiles[profile]));
  await ctx.close();
}
writeFileSync(`${OUT}/memories.json`, JSON.stringify(report, null, 2));
await browser.close();
// It fails (exits non-zero) on an error, a program compiled after entry, what a memory leaves
// behind growing, or a memory still living after it was let go.
const failed = Object.entries(report.profiles).filter(([, p]) => p.errors.length || p.programsAfter !== p.programsAtBoot || p.texturesAfterSecond !== p.texturesAfter || p.stillLiving);
if (failed.length) {
  console.error(`failed: ${failed.map(([k]) => k).join(', ')}`);
  process.exitCode = 1;
}
