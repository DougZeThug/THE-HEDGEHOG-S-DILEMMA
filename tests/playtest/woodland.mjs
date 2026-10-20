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

// 1. The cut, played: every drawn frame either side of 34.5 s, as the renderer drew it (whether the
// people were drawn, and which painting). Software GL is slow, so frames are seconds apart here;
// what matters is that no drawn frame has one without the other.
{
  const { page, errors } = await room();
  const start = await pose(page);
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(33.5));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const a = window.__hedgehog;
    a.__cut = [];
    const sc = a.living.memory.prepared.living.scene;
    const probe = () => {
      if (!a.living) return;
      const pos = a.living.memory.controller.position;
      a.__cut.push({ pos: +pos.toFixed(3), people: sc.m.people.uniforms.uPeople.value, drawn: sc.people.visible, after: sc.m.plate.uniforms.uAfter.value, immerse: +a.inside.eff.toFixed(3) });
      if (pos < 37) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
    a.heldAt(null);
  });
  await page.waitForFunction(() => (window.__hedgehog.living?.memory.controller.position ?? 99) > 36.5, null, { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/played-after-cut.png` });
  const frames = await page.evaluate(() => window.__hedgehog.__cut);
  const mixed = frames.filter((f) => (f.drawn && f.people > 0) !== (f.after < 0.5));
  // Then on, through the return, to the room: back where they stood.
  await page.evaluate(() => {
    window.__hedgehog.heldAt(41.3);
    window.__hedgehog.heldAt(null);
  });
  await page.waitForFunction(() => !window.__hedgehog.living, null, { timeout: 180000 });
  const end = await pose(page);
  report.cut = { frames: frames.length, mixed: mixed.length, around: frames.filter((f) => f.pos > 33.9 && f.pos < 35.2), start, end, restored: Math.abs(start.x - end.x) < 1e-3 && Math.abs(start.z - end.z) < 1e-3 && Math.abs(start.yaw - end.yaw) < 1e-3, errors };
  await page.close();
}

// 2. Leaving by turning away (a mouse look of about 40°), and by a held step.
for (const how of ['turn', 'step']) {
  const { page, errors } = await room();
  const start = await pose(page);
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(13));
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
// 3. The two-shot: a small look round keeps it; past 14° it is the wide (and they are still
// inside: leaving takes 30°); settled facing it again, the two of them close again.
{
  const { page, errors } = await room();
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(12));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__hedgehog.heldAt(16.5));
  await page.waitForTimeout(800);
  const shot = () => page.evaluate(() => window.__hedgehog.living?.memory.prepared.living?.scene.shot ?? -1);
  const turned = () => page.evaluate(() => +((window.__hedgehog.inside.turned * 180) / Math.PI).toFixed(1));
  // (Software GL draws a frame every second or so: wait for two to have been drawn.)
  const drawn = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const look = async (px) => {
    for (let i = 0; i < Math.abs(px) / 20; i++) {
      await page.evaluate((d) => window.__hedgehog.lookBy(d, 0), Math.sign(px) * 20);
      await drawn();
    }
    await drawn();
  };
  const at = { start: await shot() };
  await look(80);
  at.small = { shot: await shot(), turned: await turned() };
  await look(60);
  at.past = { shot: await shot(), turned: await turned() };
  // Turned back to face it (a held memory doesn't spring the turn back: its dt is 0), at a moment
  // a return may land (never within half a second of a beat: her turn's steps are beats too, 18.0,
  // 18.5, 19.0): after 1.2 s settled, the two of them close again (held, any frame).
  await page.evaluate(() => window.__hedgehog.heldAt(20.0));
  await look(-140);
  let back = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const s = await shot();
    if (s === 1) {
      back = { after: (Date.now() - t0) / 1000, turned: await turned() };
      break;
    }
    await page.waitForTimeout(200);
  }
  at.back = back;
  at.locked = await page.evaluate(() => window.__hedgehog.inside.locked);
  // The screen resized while it has the whole view: the canvas stays opaque (its alpha read back
  // after a render; it was 0, the page's paper showing through, until the painting went back).
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__hedgehog.heldAt(20.1));
  await drawn();
  at.alphaAfterResize = await page.evaluate(() => {
    const a = window.__hedgehog, gl = a.renderer.getContext();
    a.post.render();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]].map(([fx, fy]) => {
      const px = new Uint8Array(4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth * fx), Math.floor(gl.drawingBufferHeight * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px[3];
    });
  });
  report.twoShotTurn = { ...at, ok: at.start === 1 && at.small.shot === 1 && at.past.shot === 0 && !!at.back && at.locked && at.alphaAfterResize.every((x) => x === 255), errors };
  await page.close();
}
writeFileSync(`${OUT}/woodland.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
