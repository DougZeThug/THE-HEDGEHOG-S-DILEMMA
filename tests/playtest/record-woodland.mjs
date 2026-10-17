// A film of the woodland memory for the artist to review (docs/reviews/2026-10-woodland.md).
// Software GL can't play it in real time, so every frame is the memory held at its exact
// position (the controller's scrub, as the editor does: the same values as played), captured,
// then joined with the memory's own sound (mixed offline: tests/playtest/woodland-audio.ts).
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/record-woodland.mjs     (FPS=12 W=1280 H=720 PROFILE=desktop|phone)
//
// Slow under software GL (seconds a frame): it can be recorded in parts, START to END seconds
// (START=0 END=27, then START=27, which joins the film when it reaches the end).
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  ({ chromium, devices } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
// 12 a second: the memory's own drawings are on twos (12 a second); encoded at 24.
const FPS = Number(process.env.FPS ?? 12);
const PROFILE = process.env.PROFILE ?? 'desktop';
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 720);
const VARIANT = process.env.VARIANT ?? 'afternoon';
const OUT = process.env.OUT ?? 'test-output/review/woodland/film';
const PRE = 2; // seconds of the room before it begins
const LAST = VARIANT === 'empty' ? 28 : 53;
const START = Number(process.env.START ?? 0);
const END = Number(process.env.END ?? LAST);
const frames = `${OUT}/frames-${PROFILE}-${VARIANT}`;
// (A whole film starts clean; a part writes over its own frames only, so parts can run at once.)
if (START === 0 && END === LAST) rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const opts = PROFILE === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 2 } : { viewport: { width: W, height: H } };
const page = await browser.newPage(opts);
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
// The line written, the visitor standing 2.4 m from it, looking at it; no hints, no captions.
await page.evaluate(async () => {
  const a = window.__hedgehog;
  a.text.setShown('more-minutes');
  for (let i = 0; i < 100 && !a.text.anchorOf('more-minutes'); i++) await new Promise((r) => setTimeout(r, 50));
  const an = a.text.anchorOf('more-minutes');
  const it = a.text.items.get(an.key);
  const c = it.centre, n = it.normal;
  a.rig.cancelAttend();
  a.rig.stand?.();
  const x = c.x + n.x * 2.4, z = c.z + n.z * 2.4;
  const eye = a.rig.eyeHeight ?? 1.58;
  a.rig.place(x, z, Math.atan2(n.x, n.z), Math.atan2(c.y - 0.15 - eye, 2.4));
  for (const id of ['hint', 'captions', 'menu-btn', 'write-btn']) {
    const el = document.getElementById(id);
    if (el) el.style.visibility = 'hidden';
  }
});
await page.waitForTimeout(3000);
const raf = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
let k = START > 0 ? Math.round((PRE + START) * FPS) : 0;
const shot = async () => {
  // (Generous: under load, software GL can take most of a minute for a frame.)
  await page.screenshot({ path: `${frames}/${String(k++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92, timeout: 180000 });
};
// The room, before.
for (let i = 0; START === 0 && i < PRE * FPS; i++) {
  await raf();
  await shot();
}
await page.evaluate((v) => window.__hedgehog.playMemory('woodland', 'more-minutes', v), VARIANT);
// (A later part: the way in held through first, so the visitor is where they would be.)
for (let t = 0; t < START; t += 0.5) {
  await page.evaluate((p) => window.__hedgehog.heldAt(p), t);
  await raf();
}
const t0 = Date.now();
for (let i = Math.round(START * FPS); i < END * FPS; i++) {
  const t = i / FPS;
  await page.evaluate((p) => window.__hedgehog.heldAt(p), t);
  await raf();
  await shot();
  if (i % (FPS * 2) === 0) console.log(`${t.toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s elapsed)`);
}
await browser.close();
if (END < LAST) {
  console.log(JSON.stringify({ part: [START, END], frames: k, errors }));
  process.exit(0);
}
// Join the frames with the sound.
const audio = `${OUT}/woodland-${VARIANT}-audio.wav`;
const video = `${OUT}/woodland-${VARIANT}-${PROFILE}.mp4`;
const withAudio = existsSync(audio) ? `-i ${audio} -c:a aac -b:a 192k -shortest` : '';
execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${frames}/%05d.jpg ${withAudio} -c:v libx264 -r 24 -pix_fmt yuv420p -crf 18 -movflags +faststart ${video}`);
console.log(JSON.stringify({ video, frames: k, errors }));
