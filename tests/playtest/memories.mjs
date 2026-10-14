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
const VARIANT = process.env.VARIANT ?? { cereal: 'first', bedroom: 'morning', door: 'approach' }[MEMORY];
const PHRASE = { cereal: 'cereal', bedroom: 'happiest-unneeded', door: 'door-open' }[MEMORY];
// Stages: [name, sequence position or null for the untouched wall], per memory.
const STAGES = {
  cereal: [['0-untouched', null], ['1-first-drawing', 1.8], ['2-developing', 3.8], ['3-active', 9], ['4-active-late', 20], ['5-dissolving', 24.5], ['6-drawing-alone', 26.2], ['7-residue', 29]],
  bedroom: [['0-untouched', null], ['1-first-drawing', 2.6], ['2-developing', 5.5], ['3-active', 9], ['4-curtain', 11.4], ['5-active-late', 22], ['6-dissolving', 28.5], ['7-drawing-alone', 30.6]],
  door: [['0-untouched', null], ['1-first-drawing', 1.6], ['2-developing', 3.4], ['3-active', 6.5], ['4-shadow', 11], ['5-weight', 14.3], ['6-dissolving', 19.5], ['7-drawing-alone', 21]],
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
