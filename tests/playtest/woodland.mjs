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

// 1. The cut, played (the afternoon is a film since 2026-10-24): every drawn frame either side of
// the cut at 30.5 s, as the room drew it: the timeline's frame, the frame the video is on and the
// frame last sent to the screen. Software GL is slow, so frames are far apart here; what matters is
// that the picture is the film's own frame for the time, never the afternoon after the cut or the
// dusk before it, and that the video keeps up with the clock (its drift, in frames).
{
  const { page, errors } = await room();
  const start = await pose(page);
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(28.5));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const a = window.__hedgehog;
    a.__cut = [];
    const sc = a.living.memory.prepared.living.scene;
    const v = sc.art.video;
    const probe = () => {
      if (!a.living) return;
      const pos = a.living.memory.controller.position;
      const want = Math.floor(Math.max(0, Math.min(29.5 - 1e-6, pos - 9.5)) * 24 + 1e-6);
      a.__cut.push({ pos: +pos.toFixed(3), want, video: Math.floor(v.currentTime * 24 + 1e-6), shown: sc.uploaded, playing: !v.paused, seeking: v.seeking, immerse: +a.inside.eff.toFixed(3) });
      if (pos < 33.5) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
    a.heldAt(null);
  });
  await page.waitForFunction(() => (window.__hedgehog.living?.memory.controller.position ?? 99) > 33.0, null, { timeout: 180000 });
  await page.screenshot({ path: `${OUT}/played-after-cut.png` });
  const frames = await page.evaluate(() => window.__hedgehog.__cut);
  // (A frame shown is the dusk's from 504 on: never a dusk frame before the cut's time, nor an
  // afternoon one well after it.)
  const wrongSide = frames.filter((f) => (f.pos < 30.5 - 0.25 && f.shown >= 504) || (f.pos > 30.5 + 0.25 && f.shown < 504));
  const drift = frames.filter((f) => f.playing && !f.seeking).map((f) => f.video - f.want);
  // Then on, through the return, to the room: back where they stood.
  await page.evaluate(() => {
    window.__hedgehog.heldAt(38.3);
    window.__hedgehog.heldAt(null);
  });
  await page.waitForFunction(() => !window.__hedgehog.living, null, { timeout: 180000 });
  const end = await pose(page);
  report.cut = {
    frames: frames.length, wrongSide: wrongSide.length, drift: drift.length ? { min: Math.min(...drift), max: Math.max(...drift), mean: +(drift.reduce((x, y) => x + y, 0) / drift.length).toFixed(2) } : null,
    around: frames.filter((f) => f.pos > 30.0 && f.pos < 31.0), start, end,
    restored: Math.abs(start.x - end.x) < 1e-3 && Math.abs(start.z - end.z) < 1e-3 && Math.abs(start.yaw - end.yaw) < 1e-3, errors,
  };
  await page.close();
}

// 2. Leaving by turning away (a mouse look of about 40°), and by a held step.
// (Let go before the cut, the film goes back to its first frame, the painting's own, as its pencil
// draws it: src/memory/living/woodlandFilm.ts `leave`. Once from the first wide, once from inside
// the close-up.)
for (const [how, at] of [['turn', 13], ['step', 13], ['turn-in-close', 20]]) {
  const { page, errors } = await room();
  const start = await pose(page);
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate((t) => window.__hedgehog.heldAt(t), at);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__hedgehog.heldAt(null));
  await page.waitForTimeout(500);
  const inside = await pose(page);
  if (how.startsWith('turn')) {
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
  // (The frame the film shows as it goes back: waited for while the memory is still there.)
  let film = null;
  for (let i = 0; i < 40 && film === null; i++) {
    film = await page.evaluate(() => {
      const sc = window.__hedgehog.living?.memory.prepared.living?.scene;
      return sc && !sc.art.video.seeking && sc.uploaded === 0 ? 0 : null;
    });
    if (film === null) await page.waitForTimeout(250);
  }
  const shown = await page.evaluate(() => window.__hedgehog.living?.memory.prepared.living?.scene.uploaded ?? 'gone');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/left-by-${how}.png` });
  report[how] = { start, inside, back, after: await pose(page), wentBackToFirstFrame: film === 0, shown, errors };
  await page.close();
}
// 3. The close-up (the film's): framed as close while it is on (a film has no other shot to give
// way to: a look round changes nothing), held frames exact when sought back and forth across the
// cut, the canvas opaque through a resize; then played a second time from the start (replay): the
// film's first frame again, nothing left of the first play.
{
  const { page, errors } = await room();
  await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  await page.evaluate(() => window.__hedgehog.heldAt(12));
  await page.waitForTimeout(800);
  const shot = () => page.evaluate(() => {
    const a = window.__hedgehog;
    return { close: a.post.close, frame: a.living?.memory.prepared.living?.scene.uploaded ?? null };
  });
  const drawn = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // (Held until the video has landed on the frame asked for, as the recorder holds it.)
  const holdAt = (t) => page.evaluate(async (pos) => {
    const a = window.__hedgehog;
    const held = a.heldAt(pos);
    const sc = a.living.memory.prepared.living.scene, v = sc.art.video;
    const want = sc.frameAt(held.final);
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      a.heldAt(pos);
      if (!v.seeking && Math.floor(v.currentTime * 24 + 1e-6) === want && sc.uploaded === want) return { want, ms: i };
    }
    return { want, ms: -1 };
  }, t);
  const at = {};
  at.wide = { ...(await holdAt(12)), ...(await shot()) };
  at.close = { ...(await holdAt(20.0)), ...(await shot()) };
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__hedgehog.lookBy(20, 0));
    await drawn();
  }
  at.closeLooked = await shot();
  at.seek = [];
  for (const t of [30.48, 30.52, 29.0, 35.0, 30.45, 15.01, 25.24, 25.26]) at.seek.push({ t, ...(await holdAt(t)) });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(600);
  await holdAt(20.1);
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
  // Let go, and played again from the start.
  await page.evaluate(() => window.__hedgehog.heldAt(null));
  await page.evaluate(() => window.__hedgehog.endLivingMemory?.('interrupt'));
  await page.waitForFunction(() => !window.__hedgehog.living, null, { timeout: 60000 });
  const again = await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
  at.replay = { started: !!again, first: again ? await holdAt(3) : null, close: again ? await holdAt(16) : null };
  at.ok = at.wide.close === 0 && at.close.close === 1 && at.closeLooked.close === 1 && at.seek.every((x) => x.ms >= 0) && at.alphaAfterResize.every((x) => x === 255) && !!at.replay.first && at.replay.first.want === 0 && at.replay.first.ms >= 0 && at.replay.close.ms >= 0;
  report.close = { ...at, errors };
  await page.close();
}
writeFileSync(`${OUT}/woodland.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
