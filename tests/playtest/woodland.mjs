// The woodland memory, played (not held): the cut in real time, and the two ways of leaving it
// from inside (a turn away, a step held). docs/reviews/2026-10-woodland.md.
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/woodland.mjs          (OUT=test-output/review/woodland/played)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output/review/woodland/played';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function room() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?seed=7`);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
  await page.click('#enter');
  await page.waitForFunction(() => (window.__hedgehog.score?.t ?? 0) > 2, null, { timeout: 60000 });
  await page.evaluate(() => {
    const b = document.getElementById('skip');
    if (b && !b.hidden) b.click();
  });
  await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 120000 });
  await page.evaluate(async () => {
    const a = window.__hedgehog;
    a.text.setShown('more-minutes');
    for (let i = 0; i < 100 && !a.text.anchorOf('more-minutes'); i++) await new Promise((r) => setTimeout(r, 50));
    const an = a.text.anchorOf('more-minutes');
    const it = a.text.items.get(an.key);
    const c = it.centre, n = it.normal;
    a.rig.cancelAttend();
    a.rig.pos.set(c.x + n.x * 2.4, 0, c.z + n.z * 2.4);
    a.rig.yaw = Math.atan2(n.x, n.z);
    a.rig.pitch = 0.1;
  });
  await page.waitForTimeout(1000);
  return { page, errors };
}
const pose = (page) => page.evaluate(() => ({ x: +window.__hedgehog.rig.pos.x.toFixed(3), z: +window.__hedgehog.rig.pos.z.toFixed(3), yaw: +window.__hedgehog.rig.yaw.toFixed(3), locked: window.__hedgehog.inside.locked, eff: +window.__hedgehog.inside.eff.toFixed(3), state: window.__hedgehog.living?.memory.state ?? null, pos: +(window.__hedgehog.living?.memory.controller.position ?? -1).toFixed(2) }));
const report = {};

// 1. The cut, played: every drawn frame either side of 31.5 s, as the renderer drew it (whether the
// people were drawn, and which painting). Software GL is slow, so frames are seconds apart here;
// what matters is that no drawn frame has one without the other.
{
  const { page, errors } = await room();
  const start = await pose(page);
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(30.5));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const a = window.__hedgehog;
    a.__cut = [];
    const sc = a.living.memory.prepared.living.scene;
    const probe = () => {
      if (!a.living) return;
      const pos = a.living.memory.controller.position;
      a.__cut.push({ pos: +pos.toFixed(3), people: sc.m.people.uniforms.uPeople.value, drawn: sc.people.visible, after: sc.m.plate.uniforms.uAfter.value, immerse: +a.inside.eff.toFixed(3) });
      if (pos < 34) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
    a.heldAt(null);
  });
  await page.waitForFunction(() => (window.__hedgehog.living?.memory.controller.position ?? 99) > 33.5, null, { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/played-after-cut.png` });
  const frames = await page.evaluate(() => window.__hedgehog.__cut);
  const mixed = frames.filter((f) => (f.drawn && f.people > 0) !== (f.after < 0.5));
  // Then on, through the return, to the room: back where they stood.
  await page.evaluate(() => {
    window.__hedgehog.heldAt(38.3);
    window.__hedgehog.heldAt(null);
  });
  await page.waitForFunction(() => !window.__hedgehog.living, null, { timeout: 180000 });
  const end = await pose(page);
  report.cut = { frames: frames.length, mixed: mixed.length, around: frames.filter((f) => f.pos > 30.9 && f.pos < 32.2), start, end, restored: Math.abs(start.x - end.x) < 1e-3 && Math.abs(start.z - end.z) < 1e-3 && Math.abs(start.yaw - end.yaw) < 1e-3, errors };
  await page.close();
}

// 2. Leaving by turning away (a mouse look of about 40°), and by a held step.
for (const how of ['turn', 'step']) {
  const { page, errors } = await room();
  const start = await pose(page);
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(16));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__hedgehog.heldAt(null));
  await page.waitForTimeout(500);
  const inside = await pose(page);
  if (how === 'turn') {
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.__hedgehog.lookBy(30, 0));
      await page.waitForTimeout(40);
    }
  } else {
    // (Held long enough for several of software GL's slow frames to see it: on a device, 0.35 s.)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
  }
  const t0 = Date.now();
  let back = null;
  while (Date.now() - t0 < 15000) {
    const p = await pose(page);
    if (!p.locked) {
      back = { ...p, after: (Date.now() - t0) / 1000 };
      break;
    }
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/left-by-${how}.png` });
  report[how] = { start, inside, back, after: await pose(page), errors };
  await page.close();
}
writeFileSync(`${OUT}/woodland.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
