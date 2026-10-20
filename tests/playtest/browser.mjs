// Real-time playtest in a browser, as a phone: mobile viewport, touch emulation, real
// swipes and taps (CDP touch events), wall-clock time. Records what the Director did,
// when, against the clock the visitor lives in — including the time spent fading in.
//
//   BASE=http://localhost:4173/ PERSONA=phone SECONDS=120 OUT=dir node tests/playtest/browser.mjs
//   PERSONA: phone (touch explorer) | still (enters and does nothing) | desktop (mouse, reads)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  const root = execSync('npm root -g').toString().trim();
  ({ chromium, devices } = require(`${root}/playwright`));
}

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const PERSONA = process.env.PERSONA ?? 'phone';
const SECONDS = Number(process.env.SECONDS ?? 120);
const OUT = process.env.OUT ?? 'test-output/playtest';
const SEED = process.env.SEED ?? '7';
mkdirSync(OUT, { recursive: true });

// (Captions are off by default, a choice in settings: these runs check them, as a visitor who chose them.)
const chooseCaptions = () => {
  try {
    const p = JSON.parse(localStorage.getItem('hh.prefs.v1') ?? '{}');
    localStorage.setItem('hh.prefs.v1', JSON.stringify({ ...p, captions: true, captionsChosen: true }));
  } catch {}
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});
const mobile = PERSONA !== 'desktop';
const ctx = await browser.newContext(
  mobile ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 760 } },
);
await ctx.addInitScript(chooseCaptions);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const cdp = await ctx.newCDPSession(page);
const W = mobile ? 390 : 1280, H = mobile ? 664 : 760;

await page.goto(`${BASE}?seed=${SEED}`);
await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 90000 });
const vp = page.viewportSize();

// ── gestures ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function touchDrag(x0, y0, x1, y1, ms = 600, hold = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  const n = Math.max(4, Math.round(ms / 40));
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, id: 1 }] });
    await sleep(ms / n);
  }
  if (hold) await sleep(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tap(x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
  await sleep(70);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Visible writing on screen, nearest the centre first. */
const onScreen = () =>
  page.evaluate(() => {
    const a = window.__hedgehog;
    const cam = a.rig.camera;
    const out = [];
    for (const it of a.text.items.values()) {
      if (it.vis < 0.5 || it.uniforms.uOpacity.value < 0.2) continue;
      const v = it.centre.clone().project(cam);
      if (v.z > 1 || Math.abs(v.x) > 0.85 || Math.abs(v.y) > 0.8) continue;
      out.push({ key: it.key, x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, d: Math.hypot(v.x, v.y) });
    }
    return out.sort((p, q) => p.d - q.d);
  });
const chairOnScreen = () =>
  page.evaluate(() => {
    const a = window.__hedgehog;
    const v = a.chair.group.position.clone().setY(0.4).project(a.rig.camera);
    return v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 ? { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight } : null;
  });
const look = (dx, dy = 0) => touchDrag(vp.width * 0.72, vp.height * 0.5, vp.width * 0.72 + dx, vp.height * 0.5 + dy, 700);
const walk = (ms, dx = 0) => touchDrag(vp.width * 0.25, vp.height * 0.7, vp.width * 0.25 + dx, vp.height * 0.7 - 70, 300, ms);

// ── sampling ────────────────────────────────────────────────────────────────
const t0 = Date.now();
const samples = [];
const actions = [];
const act = (what) => actions.push({ wall: +((Date.now() - t0) / 1000).toFixed(1), what });
async function sample() {
  const s = await page.evaluate(() => {
    const a = window.__hedgehog;
    const cap = document.getElementById('captions');
    return {
      dnow: a.director.now, white: a.post.white, fps: a.fps, caption: cap?.textContent?.trim() ?? '', logLen: a.director.log.length,
      phase: a.director.phase, src: a.voices?.lastSource ?? null, gaze: a.gazeId, x: a.rig.pos.x, z: a.rig.pos.z,
    };
  });
  samples.push({ wall: +((Date.now() - t0) / 1000).toFixed(1), ...s });
}
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    await sample().catch(() => {});
    await sleep(500);
  }
})();

// ── enter ───────────────────────────────────────────────────────────────────
if (mobile) {
  const b = await page.locator('#enter').boundingBox();
  await tap(b.x + b.width / 2, b.y + b.height / 2);
} else await page.click('#enter');
act('go in');

const until = (sec) => sleep(Math.max(0, t0 + sec * 1000 - Date.now()));
async function tapWriting() {
  const items = await onScreen();
  const it = items.find((i) => !i.key.startsWith('contrib')) ?? items[0];
  if (!it) {
    act('tap writing: none on screen');
    return;
  }
  await tap(it.x, it.y);
  act(`tap writing ${it.key}`);
}
async function tapChair() {
  const c = await chairOnScreen();
  if (!c) {
    act('tap chair: not on screen');
    return;
  }
  await tap(c.x, c.y);
  act('tap chair');
}

if (PERSONA === 'phone') {
  // An ordinary, curious phone visit: look, tap what catches the eye, wander, go to the chair.
  const L = (dx) => async () => (await look(dx), act(`look ${dx > 0 ? 'right' : 'left'}`));
  const Wk = (ms, dx = 0) => async () => (await walk(ms, dx), act('walk'));
  const plan = [
    [3, L(-90)], [6, tapWriting], [13, L(160)], [16, tapWriting], [24, L(-200)], [27, tapChair],
    [36, tapChair], [44, L(240)], [47, tapWriting], [55, Wk(1200)], [59, tapWriting], [66, L(-260)],
    [69, tapWriting], [77, L(120)], [80, tapChair], [88, tapChair], [104, L(300)], [107, tapWriting],
    [115, Wk(1500, 40)], [119, L(-150)], [122, tapWriting], [132, L(200)], [135, tapWriting],
    [146, tapChair], [158, L(-300)], [161, tapWriting], [172, tapWriting],
  ];
  for (const [at, fn] of plan) {
    if (at > SECONDS) break;
    await until(at);
    await fn();
  }
} else if (PERSONA === 'desktop') {
  for (const [at, fn] of [[5, () => page.keyboard.press('Tab')], [15, () => page.keyboard.press('Tab')], [25, () => page.keyboard.press('Tab')], [35, () => page.keyboard.press('KeyF')]]) {
    await until(at);
    await fn();
    act('key');
  }
}
await until(SECONDS);
sampling = false;
await sampler;

const result = await page.evaluate(() => {
  const a = window.__hedgehog;
  return { log: a.director.log.map((c) => ({ t: c.t, rule: c.rule, type: c.cue.type, text: c.cue.text ?? c.cue.caption ?? c.cue.phraseId ?? c.cue.kind ?? '', perf: c.cue.performance ?? null })), visitor: a.director.visitor.snapshot() };
});
await page.screenshot({ path: `${OUT}/${PERSONA}-end.png` });
await browser.close();

// Map Director time to wall time through the samples.
const toWall = (dt) => {
  const s = samples.find((x) => x.dnow >= dt);
  return s ? s.wall : null;
};
const firstVisible = samples.find((s) => s.white < 0.5)?.wall ?? null;
const firstTick = samples.find((s) => s.dnow > 0)?.wall ?? null;
const events = result.log.filter((e) => !['hide', 'stopVoice'].includes(e.type)).map((e) => ({ ...e, wall: toWall(e.t) }));
const captions = [];
for (const s of samples) if (s.caption && captions[captions.length - 1]?.text !== s.caption) captions.push({ wall: s.wall, text: s.caption, src: s.src });
const fps = samples.filter((s) => s.wall > 10).map((s) => s.fps);
const report = {
  persona: PERSONA, seconds: SECONDS, mobile, errors, firstVisible, firstTick,
  fpsMedian: fps.length ? +fps.sort((a, b) => a - b)[Math.floor(fps.length / 2)].toFixed(1) : null,
  directorSecondsAtEnd: samples[samples.length - 1]?.dnow ?? 0,
  events, captions, actions, visitor: result.visitor,
};
writeFileSync(`${OUT}/${PERSONA}.json`, JSON.stringify(report, null, 1));
console.log(`${PERSONA}: visible at ${firstVisible}s, engine from ${firstTick}s, fps ~${report.fpsMedian}, engine ${report.directorSecondsAtEnd.toFixed(0)}s of ${SECONDS}s, ${events.length} events, errors ${errors.length}`);
for (const e of events) console.log(`  ${String(e.wall).padStart(6)}s  ${e.rule.padEnd(26)} ${e.type.padEnd(8)} ${String(e.text).slice(0, 50)}`);
console.log('  captions:', captions.map((c) => `${c.wall}s ${c.text}`).join(' | '));
