// The redesigned core loop, observed in a real browser (docs/reviews/2026-11-core-loop.md):
// a return to the chair (the recoil, framed and measured), a second return, kneeling, a read line
// keeping its trace, a touch on writing, and the way out: touched and kept (turning back), then
// touched and taken. Real keyboard and clicks; positions set between acts. Frames for measuring
// in OUT; cues and the room's state in OUT/after.json.
//
//   BASE=http://localhost:4173/ OUT=dir node tests/playtest/core-loop-after.mjs
// (EXP=name,… passes `?exp=` for a future experiment; this build defines none.)
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
const EXP = process.env.EXP ?? '';
const OUT = process.env.OUT ?? 'test-output/core-loop/observed-after';
const SEED = process.env.SEED ?? '7';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});
try {
const ctx = await browser.newContext({ viewport: { width: 880, height: 520 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('hh.prefs.v1', JSON.stringify({ captions: true, captionsChosen: true, quality: 'low' }));
  } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hh = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`${BASE}?seed=${SEED}${EXP ? `&exp=${EXP}` : ''}`);
await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 90000 });
await page.click('#enter');
await page.waitForFunction(() => window.__hedgehog?.director && !window.__hedgehog.director.held, null, { timeout: 120000 }).catch(async () => page.click('#skip').catch(() => {}));
if (!(await page.waitForFunction(() => window.__hedgehog?.director && !window.__hedgehog.director.held, null, { timeout: 15000 }).then(() => true, () => false))) throw new Error('the opening never handed the room over (nor did Skip)');

const log = [];
let lastT = -1;
const state = () => hh(() => {
  const a = window.__hedgehog;
  const p = a.rig.pos, c = a.chair.group.position;
  return {
    now: +a.director.now.toFixed(2), d: +Math.hypot(p.x - c.x, p.z - c.z).toFixed(2), phase: a.director.phase, mode: a.mode,
    room: +a.lighting.roomLight.toFixed(3), caption: document.getElementById('captions')?.textContent ?? '',
    departure: document.getElementById('departure-line')?.textContent ?? '',
    cues: a.director.log.map((c) => ({ t: c.t, rule: c.rule, type: c.cue.type, what: c.cue.phraseId ?? c.cue.text ?? c.cue.kind ?? c.cue.id ?? '', amount: c.cue.amount, dim: c.cue.dim })),
  };
});
async function sample(label) {
  const s = await state();
  for (const c of s.cues) if (c.t > lastT) log.push({ label, ...c });
  lastT = Math.max(lastT, ...s.cues.map((c) => c.t));
  return s;
}
/** Stay for `secs` of the room's time. */
async function hold(secs, label) {
  const start = (await sample(label)).now;
  const end = Date.now() + secs * 15000;
  while (Date.now() < end) {
    const s = await sample(label);
    if (s.now - start >= secs || s.mode !== 'room') return s;
    await sleep(120);
  }
  return sample(label);
}
const frames = [];
async function shot(name) {
  const s = await sample(name);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  frames.push({ name, now: s.now, room: s.room });
}
async function place(x, z, yaw, pitch = -0.2) {
  await hh(([x, z, yaw, pitch]) => {
    const a = window.__hedgehog;
    const c = a.chair.group.position;
    a.rig.pos.set(c.x + x, 0, c.z + z);
    a.rig.yaw = yaw;
    a.rig.pitch = pitch;
  }, [x, z, yaw, pitch]);
}
async function walkUntil(key, test, limit = 30000) {
  await page.keyboard.down(key);
  const end = Date.now() + limit;
  let reached = false;
  while (Date.now() < end) {
    const s = await sample(`walk ${key}`);
    if ((reached = test(s))) break;
    await sleep(40);
  }
  await page.keyboard.up(key);
  if (!reached) console.warn(`walk ${key}: limit reached before the target (what follows is suspect)`);
  return reached;
}
/** Look at a line (its centre in the middle of the view) from where they stand (after a frame has moved the eye there). */
async function lookAt(phraseId) {
  await sleep(400);
  return hh((id) => {
    const a = window.__hedgehog;
    const key = [...a.text.items.keys()].find((k) => a.text.phraseOf(k) === id);
    if (!key) return null;
    const c = a.text.centreOf(key);
    const e = a.rig.camera.position;
    a.rig.yaw = Math.atan2(-(c.x - e.x), -(c.z - e.z));
    a.rig.pitch = Math.atan2(c.y - e.y, Math.hypot(c.x - e.x, c.z - e.z));
    return { key, surface: a.text.items.get(key).placement.surface, at: [c.x, c.y, c.z] };
  }, phraseId);
}

// 1. To the chair, the first time.
await place(0, 2.6, 0, -0.2);
await hold(3, 'at the door');
await walkUntil('KeyW', (s) => s.d < 0.95);
await hold(6, 'first arrival');
await shot('01-first-arrival');
// 2. Away, looking back at it.
await walkUntil('KeyS', (s) => s.d > 2.5);
await hold(8, 'stepped back, looking at it');
await shot('02-stepped-back');
// 3. Back: the recoil, framed as it comes.
await walkUntil('KeyW', (s) => s.d < 1.3);
await shot('03-return-0');
await walkUntil('KeyW', (s) => s.d < 0.95);
for (const [i, secs] of [[1, 0.6], [2, 0.6], [3, 0.8], [4, 1.5], [5, 4]]) {
  await hold(secs, 'returned');
  await shot(`03-return-${i}`);
}
// 4. Away and back again: the second, the chair's own light (the key level on the chair is sampled).
await walkUntil('KeyS', (s) => s.d > 2.5);
await hold(6, 'away again');
await walkUntil('KeyW', (s) => s.d < 0.95);
const keyBefore = await hh(() => window.__hedgehog.lighting.keyLevel);
let keyMin = keyBefore;
for (let i = 0; i < 12; i++) {
  await hold(0.25, 'returned again');
  keyMin = Math.min(keyMin, await hh(() => window.__hedgehog.lighting.keyLevel));
  if (i === 5) await shot('04-second-return');
}
await hold(5, 'returned again');
// 5. Kneeling by it.
await page.keyboard.press('Space');
await hold(8, 'kneeling');
await shot('05-kneeling');
await page.keyboard.press('Space');
// 6. A line read, then looked away from: does it keep a trace?
const target = await hh(() => {
  const a = window.__hedgehog;
  const k = [...a.text.items.keys()].find((k) => a.text.items.get(k).placement?.surface === 'east' && a.text.phraseOf(k) && a.text.items.get(k).vis > 0.9);
  return k ? a.text.phraseOf(k) : null;
});
await place(1.4, 0.3, -Math.PI / 2, 0.02);
const aimed = target ? await lookAt(target) : null;
await hold(6, 'reading');
const reading = await hh((id) => {
  const a = window.__hedgehog;
  const key = [...a.text.items.keys()].find((k) => a.text.phraseOf(k) === id);
  const it = key && a.text.items.get(key);
  return it ? { attention: a.text.phraseOf(a.text.attention(a.rig.camera)), emphasis: +it.emphasis.toFixed(3), handled: +(it.handled ?? 0).toFixed(3) } : null;
}, target);
await shot('06-reading');
await hh(() => {
  window.__hedgehog.rig.yaw += 1.2;
});
await hold(8, 'looked away');
const handled = await hh((id) => {
  const a = window.__hedgehog;
  const key = [...a.text.items.keys()].find((k) => a.text.phraseOf(k) === id);
  const it = key && a.text.items.get(key);
  return it ? { emphasis: +it.emphasis.toFixed(3), handled: +(it.handled ?? 0).toFixed(3) } : null;
}, target);
// 7. A touch on it (a click on the middle of the view, as it takes the mouse).
if (target) await lookAt(target);
await hold(1.5, 'back to it');
await page.mouse.click(440, 260);
await sleep(250);
const pressed = await hh((id) => {
  const a = window.__hedgehog;
  const key = [...a.text.items.keys()].find((k) => a.text.phraseOf(k) === id);
  return key ? +(a.text.items.get(key).pressed ?? 0).toFixed(3) : null;
}, target);
await shot('07-touched');
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);
if (await hh(() => window.__hedgehog.mode === 'settings')) await page.click('#resume').catch(() => {});
// 8. The way out: wait until it may be taken (the visit turned; not inside a held silence).
await hh(() => {
  const a = window.__hedgehog;
  if (a.director.now < 125) a.advance(125 - a.director.now);
});
for (let i = 0; i < 40; i++) {
  const ok = await hh(() => {
    const d = window.__hedgehog.director;
    return d.visible.has('party-early') && (d.phase === 'contradiction' || d.phase === 'transform') && !d.pacing.holding(d.now) && !d.aftermath() && !d.scenes.active;
  });
  if (ok) break;
  await hh(() => window.__hedgehog.advance(5));
}
for (let i = 0; i < 40 && !(await hh(() => window.__hedgehog.director.exitOpen())); i++) await hh(() => window.__hedgehog.advance(3));
await place(0.3, 1.9, Math.PI, 0.02);
const exit = await lookAt('party-early');
await hold(1.5, 'facing the way out');
await shot('08-the-way-out');
// Touched (a click on the middle of the view, facing the words), then turned back: kept.
await page.mouse.click(440, 260);
await hold(4, 'touched the way out');
await shot('08-letting-go');
await hh(() => {
  const a = window.__hedgehog;
  a.rig.yaw = Math.atan2(-(a.chair.group.position.x - a.rig.pos.x), -(a.chair.group.position.z - a.rig.pos.z));
  a.rig.pitch = -0.15;
});
await hold(1.6, 'turned back');
await shot('09-turned-back');
await hold(8, 'kept');
await shot('09-kept');
// After a while, touched again, and left alone: gone.
await hh(() => window.__hedgehog.advance(95));
for (let i = 0; i < 40 && !(await hh(() => window.__hedgehog.director.exitOpen())); i++) await hh(() => window.__hedgehog.advance(3));
await place(0.3, 1.9, Math.PI, 0.02);
await lookAt('party-early');
await hold(1.5, 'facing the way out again');
await page.mouse.click(440, 260);
// The room begins to let them go once they stand there after the touch; seen, they touch it again.
for (let i = 0; i < 40 && !(await hh(() => !!window.__hedgehog.director.letGo)); i++) await hold(0.3, 'touched: settling');
await hold(3, 'touched: the room letting go');
await shot('10-letting-go-again');
// Touched again: nothing (the explorer's reflex never ends the visit).
await page.mouse.click(440, 260);
await hold(1.5, 'touched again');
const afterSecondTouch = await hh(() => window.__hedgehog.mode);
// Walking on, toward the wall: gone.
await walkUntil('KeyW', (s) => s.mode !== 'room', 8000);
const left = await hold(2, 'walked on');
await sleep(5000);
await shot('10-gone');
const end = await sample('end');

const summary = {
  exp: EXP, read: target, aimed, reading, handled, pressed, exit, keyBefore, keyMin, afterSecondTouch, mode: end.mode, departure: end.departure,
  recoils: log.filter((c) => c.type === 'flinch'), leaving: log.filter((c) => /^leaving/.test(c.rule) || c.type === 'leave'),
  air: log.filter((c) => c.type === 'air'), frames, errors,
};
for (const c of log) console.log(`room ${String(c.t).padStart(7)}  ${c.label.padEnd(28)} ${c.rule.padEnd(20)} ${c.type} ${String(c.what).slice(0, 40)}${c.amount !== undefined ? ` amount ${c.amount}` : ''}${c.dim !== undefined ? ` dim ${c.dim}` : ''}`);
console.log(JSON.stringify({ ...summary, frames: undefined }, null, 1));
writeFileSync(`${OUT}/after.json`, JSON.stringify({ summary, log }, null, 1));
void left;
} finally {
  await browser.close();
}
