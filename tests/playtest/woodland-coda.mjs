// The line written where the woodland's painting was (decisions 119–124): the woodland played from
// inside to its end, then the wall after it; when the line began (the memory's position), where it
// went (under its own line, inside the painting's place) and what a screen reader was told.
// LINE='…' replaces the words in the page, for the artist to compare. STAY=1 first puts "I wanted
// you to" on the wall under "five more minutes", as the review film had it (the hardest layout:
// the opening's own unfinished line sits under that phrase's place). WALL=east writes the woodland's
// line on that wall instead, as the room writes it where the visitor looks: near NEAR='u,v' (metres
// along and up the wall; 3.2,1.6 by default, its middle).
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/woodland-coda.mjs          (OUT=test-output/review/woodland/coda NAME=ours)
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
const OUT = process.env.OUT ?? 'test-output/review/woodland/coda';
const NAME = process.env.NAME ?? 'ours';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
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
await page.evaluate(async ({ stay, wall, near }) => {
  const a = window.__hedgehog;
  if (wall) a.text.write({ key: 'memory:more-minutes', text: 'five more minutes', hand: 'pencil', size: 's', surface: wall, near: { u: near[0], v: near[1] }, purpose: 'recall', ttl: 0, now: a.time, source: 'more-minutes', start: false }), a.text.writeOn('memory:more-minutes', { instant: true });
  else a.text.setShown('more-minutes');
  if (stay) a.text.writeOn('stay', { upto: 4, instant: true });
  for (let i = 0; i < 100 && !a.text.anchorOf('more-minutes'); i++) await new Promise((r) => setTimeout(r, 50));
  const it = a.text.items.get(a.text.anchorOf('more-minutes').key);
  const c = it.centre, n = it.normal;
  a.rig.cancelAttend();
  a.rig.pos.set(c.x + n.x * 2.4, 0, c.z + n.z * 2.4);
  a.rig.yaw = Math.atan2(n.x, n.z);
  a.rig.pitch = 0.1;
}, { stay: !!process.env.STAY, wall: process.env.WALL ?? '', near: (process.env.NEAR ?? '3.2,1.6').split(',').map(Number) });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/${NAME}-0-before.png` });
await page.evaluate(() => window.__hedgehog.playMemory('woodland', 'more-minutes', 'afternoon'));
await page.evaluate((line) => {
  const d = window.__hedgehog.living.memory.prepared.def;
  if (line) d.coda = { ...d.coda, text: line };
}, process.env.LINE ?? '');
// Taken in as it is authored (played from its start, facing it: a jump past the way in misses it
// under software GL's slow frames), then on to the return. Not taken in, nothing should be written.
const inside = await page.waitForFunction(() => window.__hedgehog.inside.entered, null, { timeout: 40000 }).then(() => true, () => false);
await page.evaluate(() => {
  const a = window.__hedgehog;
  a.__coda = null;
  const probe = () => {
    if (!a.living) return;
    if (!a.__coda && a.text.items.has('coda:woodland')) a.__coda = { at: +a.living.memory.controller.position.toFixed(2), sr: document.getElementById('memory-sr')?.textContent ?? null, painting: { ...a.memoryWindow.painting } };
    requestAnimationFrame(probe);
  };
  requestAnimationFrame(probe);
  a.heldAt(41.3);
  a.heldAt(null);
});
await page.waitForFunction(() => !window.__hedgehog.living, null, { timeout: 240000 });
// The hand finishes (about 3 s from when it began), then the wall is seen as the visitor stands.
await page.waitForFunction(() => (window.__hedgehog.text.writtenFraction?.('coda:woodland') ?? 1) >= 1, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${NAME}-1-after.png` });
const report = await page.evaluate(() => {
  const a = window.__hedgehog;
  const it = a.text.items.get('coda:woodland');
  const own = a.text.items.get(a.text.anchorOf('more-minutes')?.key ?? 'more-minutes');
  const pl = it?.placement, an = own?.placement;
  // The nearest other place on its wall, written or kept for a line (it keeps 20 cm from them all).
  let nearest = null;
  if (pl) {
    const ids = new Map([...a.text.placements].map(([id, p]) => [p, id]));
    for (const [k, x] of a.text.items) ids.set(x.placement, k);
    for (const q of a.text.layout.placed.get(pl.surface)) {
      if (q === pl || q === an || (q.u === pl.u && q.v === pl.v)) continue;
      const gap = Math.max(Math.abs(q.u - pl.u) - (q.w + pl.w) / 2, Math.abs(q.v - pl.v) - (q.h + pl.h) / 2);
      if (!nearest || gap < nearest.gap) nearest = { gap: +gap.toFixed(3), what: ids.get(q) ?? 'a drawing or other place', written: a.text.items.has(ids.get(q)) };
    }
  }
  return {
    nearest,
    written: !!it, text: it?.mesh.userData.text ?? null, coda: a.__coda,
    line: pl ? { surface: pl.surface, u: +pl.u.toFixed(3), v: +pl.v.toFixed(3), w: +pl.w.toFixed(3), h: +pl.h.toFixed(3) } : null,
    under: an ? { surface: an.surface, u: +an.u.toFixed(3), v: +an.v.toFixed(3), w: +an.w.toFixed(3), h: +an.h.toFixed(3) } : null,
    gap: pl && an ? +((an.v - an.h / 2) - (pl.v + pl.h / 2)).toFixed(3) : null,
  };
});
writeFileSync(`${OUT}/${NAME}.json`, JSON.stringify({ inside, ...report, errors }, null, 1));
console.log(JSON.stringify({ inside, ...report, errors }, null, 1));
await browser.close();
