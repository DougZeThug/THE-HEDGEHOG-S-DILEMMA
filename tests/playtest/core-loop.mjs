// The core loop, observed (docs/reviews/2026-11-core-loop.md): a desktop visit in a real browser
// that does the things the engine battery measured, with the real keyboard, and records what the
// room did in answer: every cue with its wall-clock and room time, the light on the chair (its key
// level and warmth) and the room tone, a screenshot a moment after each act.
//
//   BASE=http://localhost:4173/ OUT=dir node tests/playtest/core-loop.mjs   (EXP=name,… for a future `?exp=`)
//
// Software rendering runs at about 10–18 fps here: room time runs slower than the clock, so read
// timings as upper bounds; what was emitted, and in what order, is what this shows.
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE, launch } from './browser-lib.mjs';

const EXP = process.env.EXP ?? '';
const OUT = process.env.OUT ?? 'test-output/core-loop/observed';
const SEED = process.env.SEED ?? '7';
mkdirSync(OUT, { recursive: true });

const browser = await launch({
});
// Small and at low quality: software rendering is the bottleneck, and room time only runs as fast as frames come.
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
// Let the opening run to its hand-off (a real visitor sees it); skip if it is slow here.
const t0 = Date.now();
await page.waitForFunction(() => window.__hedgehog?.director && !window.__hedgehog.director.held, null, { timeout: 120000 }).catch(async () => {
  await page.click('#skip').catch(() => {});
});
const handedOff = await page.waitForFunction(() => window.__hedgehog?.director && !window.__hedgehog.director.held, null, { timeout: 15000 }).then(() => true, () => false);
if (!handedOff) throw new Error('the opening never handed the room over (nor did Skip)');
console.log(`hand-off after ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Sampling: the room's cues since the last sample, the light on the chair, the room tone.
const timeline = [];
const marks = [];
async function sample(label) {
  const s = await hh((from) => {
    const a = window.__hedgehog;
    const log = a.director.log;
    const all = log.map((c) => ({ t: c.t, rule: c.rule, type: c.cue.type, what: c.cue.phraseId ?? c.cue.text ?? c.cue.kind ?? c.cue.mood ?? c.cue.id ?? '', depth: c.cue.depth, amount: c.cue.amount }));
    const p = a.rig.pos;
    const cx = a.chair.group.position.x, cz = a.chair.group.position.z;
    return {
      now: +a.director.now.toFixed(2),
      d: +Math.hypot(p.x - cx, p.z - cz).toFixed(2),
      key: +a.lighting.keyLevel.toFixed(3),
      warm: +a.lighting.warmthNow.toFixed(3),
      cold: +(a.lighting.cur?.extraCold ?? 0).toFixed(3),
      warmX: +(a.lighting.cur?.extraWarm ?? 0).toFixed(3),
      hum: +(a.director.env.hum ?? 0).toFixed(2),
      field: { warmth: +a.director.field.v.warmth.toFixed(2), exposure: +a.director.field.v.exposure.toFixed(2) },
      caption: document.getElementById('captions')?.textContent ?? '',
      fps: Math.round(a.fps),
      all,
    };
  });
  const fresh = s.all.filter((c) => c.t > (timeline.at(-1)?.lastT ?? -1));
  const lastT = s.all.at(-1)?.t ?? -1;
  timeline.push({ wall: +((Date.now() - t0) / 1000).toFixed(1), label, now: s.now, d: s.d, key: s.key, warm: s.warm, cold: s.cold, warmX: s.warmX, hum: s.hum, field: s.field, caption: s.caption, fps: s.fps, cues: fresh, lastT });
  return s;
}
/** Stay for `ms` of the room's time (not the clock's: software rendering runs it slower). */
async function hold(ms, label, every = 250) {
  const start = (await sample(label)).now;
  const end = Date.now() + ms * 12;
  while (Date.now() < end) {
    const s = await sample(label);
    if (s.now - start >= ms / 1000) return true;
    await sleep(every);
  }
  // (The room's time ran too slowly to hold this long: what follows came sooner than it says.)
  console.warn(`hold '${label}': cut short at ${(((await sample(label)).now - start) * 1000).toFixed(0)} of ${ms} ms of room time`);
  return false;
}
async function mark(name) {
  marks.push(name);
  await page.screenshot({ path: `${OUT}/${String(marks.length).padStart(2, '0')}-${name}.png` });
}
async function place(x, z, yaw, pitch = -0.08) {
  await hh(([x, z, yaw, pitch]) => {
    const a = window.__hedgehog;
    const c = a.chair.group.position;
    a.rig.pos.set(c.x + x, 0, c.z + z);
    a.rig.yaw = yaw;
    a.rig.pitch = pitch;
  }, [x, z, yaw, pitch]);
}
async function walkUntil(key, test, shift = false, limit = 9000) {
  if (shift) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down(key);
  const end = Date.now() + limit;
  let reached = false;
  while (Date.now() < end) {
    const s = await sample(`walk ${key}${shift ? '+shift' : ''}`);
    if ((reached = test(s))) break;
    await sleep(60);
  }
  await page.keyboard.up(key);
  if (shift) await page.keyboard.up('ShiftLeft');
  if (!reached) console.warn(`walk ${key}: limit reached before the target (timings after this are suspect)`);
  return reached;
}
const faceChair = () => page.keyboard.press('KeyC');

await page.locator('canvas').first().click({ position: { x: 640, y: 380 } }).catch(() => {});
await hold(3000, 'arrived');
await mark('arrived');

// 1. Straight at the chair, at walking pace.
await place(0, 2.6, 0, -0.2);
await hold(4000, 'at the door, facing the chair');
await mark('before-rush');
await walkUntil('KeyW', (s) => s.d < 0.95);
await hold(1200, 'rushed: just arrived');
await mark('rushed-1s');
await hold(6000, 'rushed: staying');
await mark('rushed-7s');

// 2. Back out.
await walkUntil('KeyS', (s) => s.d > 2.5);
await hold(8000, 'stepped back');
await mark('stepped-back');

// 3. Gently: stop at the edge, then slowly in.
await faceChair();
await walkUntil('KeyW', (s) => s.d < 1.9);
await hold(2500, 'paused at the edge');
await walkUntil('KeyW', (s) => s.d < 0.95, true);
await hold(1200, 'gentle: just arrived');
await mark('gentle-1s');
await hold(6000, 'gentle: staying');

// 4. Kneel.
await page.keyboard.press('Space');
await hold(9000, 'kneeling');
await mark('kneeling');
await page.keyboard.press('Space');

// 5. A line on the east wall: look at it, then click it.
await place(1.7, 0.3, -Math.PI / 2, 0.02);
await hold(6000, 'reading the east wall');
await mark('reading');
await page.mouse.click(640, 380);
await hold(6000, 'clicked a line');
await mark('clicked');

// 6. Turn to the door and stand there (does the room let them go?).
await place(0.3, 2.4, Math.PI, -0.05);
await hold(22000, 'standing at the door, facing out');
await mark('at-the-door');

const summary = timeline.flatMap((s) => s.cues.map((c) => `${String(s.wall).padStart(6)}s  room ${String(c.t).padStart(6)}  ${s.label.padEnd(34)} ${c.rule.padEnd(22)} ${c.type} ${String(c.what).slice(0, 48)}${c.depth !== undefined ? ` depth ${c.depth}` : ''}${c.amount !== undefined ? ` amount ${c.amount}` : ''}`));
console.log(summary.join('\n'));
// The light on the chair through each act (min/max of key level and warmth).
const acts = [...new Set(timeline.map((s) => s.label))];
for (const a of acts) {
  const xs = timeline.filter((s) => s.label === a);
  const r = (k) => `${Math.min(...xs.map((s) => s[k])).toFixed(2)}–${Math.max(...xs.map((s) => s[k])).toFixed(2)}`;
  console.log(`${a.padEnd(36)} key ${r('key')}  warmth ${r('warm')}  cold ${r('cold')}  warm+ ${r('warmX')}  hum ${r('hum')}  fps ${xs[0].fps}`);
}
console.log(`errors: ${errors.length}${errors.length ? '\n' + errors.join('\n') : ''}`);
writeFileSync(`${OUT}/core-loop.json`, JSON.stringify({ exp: EXP, timeline, errors }, null, 1));
} finally {
  await browser.close();
}
