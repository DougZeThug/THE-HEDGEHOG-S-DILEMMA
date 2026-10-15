// Every vignette, played as a preview (?vignette=<id>&variant=<v>) on desktop and an emulated
// phone: nothing recorded yet, so each line is a wordless voice with its caption, at its time.
// Checks: no errors, no shader compiled after entry, every line captioned in order, the
// vignette ends on its own, textures back to baseline; for one, a hidden tab mid-line (paused,
// then ended uncounted) and leaving mid-line (nothing left playing).
//
//   npm run build && npx vite preview --port 4173 &
//   node tests/playtest/vignettes.mjs       (ONLY=charger,gone-quiet  PROFILES=desktop  REDUCED=1)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch {
  ({ chromium, devices } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output/review/vignettes';
const PROFILES = (process.env.PROFILES ?? 'desktop,phone').split(',');
const ONLY = process.env.ONLY?.split(',');
const DATA = JSON.parse(readFileSync(new URL('../../src/content/vignettes.json', import.meta.url), 'utf8'));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const report = { at: new Date().toISOString(), runs: [] };
let failed = 0;

async function open(profile, id, variant) {
  const opts = profile === 'phone' ? { ...devices['iPhone 13'], deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } };
  const ctx = await browser.newContext({ ...opts, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${BASE}?seed=7&vignette=${id}&variant=${variant}`);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 120000 });
  await page.click('#enter');
  await page.waitForFunction(() => (window.__hedgehog.score?.t ?? 0) > 2, null, { timeout: 60000 });
  await page.evaluate(() => {
    const b = document.getElementById('skip');
    if (b && !b.hidden) b.click();
  });
  await page.waitForFunction(() => window.__hedgehog.score.stage === 'done', null, { timeout: 120000 });
  // Captions, as they appear.
  await page.evaluate(() => {
    window.__caps = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) window.__caps.push({ t: performance.now() / 1000, text: n.textContent, cls: n.className });
    }).observe(document.getElementById('captions'), { childList: true });
  });
  return { ctx, page, errors };
}

const state = (page) => page.evaluate(() => {
  const a = window.__hedgehog;
  return { playing: !!a.vignette, position: a.vignette?.player.position ?? null, paused: a.vignette?.player.isPaused ?? null, programs: a.renderer.info.programs.length, textures: a.renderer.info.memory.textures, sounding: a.vignette?.player.audio.sounding ?? 0 };
});

for (const def of DATA.vignettes) {
  if (ONLY && !ONLY.includes(def.id)) continue;
  for (const variant of Object.keys(def.variants)) {
    for (const profile of PROFILES) {
      if (profile === 'phone' && variant !== 'first') continue; // the phone: each first version
      const score = def.variants[variant];
      const { ctx, page, errors } = await open(profile, def.id, variant);
      await page.waitForFunction(() => !!window.__hedgehog.vignette, null, { timeout: 30000 });
      const s0 = await state(page);
      await page.waitForFunction(() => !window.__hedgehog.vignette, null, { timeout: (score.span + 40) * 1000 });
      await page.waitForTimeout(3000);
      const s1 = await state(page);
      const caps = await page.evaluate(() => window.__caps);
      const spoken = caps.filter((c) => !/sound/.test(c.cls)).map((c) => c.text);
      const lines = score.events.filter((e) => e.line).map((e) => {
        const t = def.lines.find((l) => l.id === e.line).text;
        return e.end === 'cut' && !/[—-]$/.test(t) ? t.replace(/[.…]+$/, '') + '—' : t;
      });
      const problems = [];
      if (errors.length) problems.push(`errors: ${errors.join(' | ')}`);
      if (s1.programs !== s0.programs) problems.push(`programs ${s0.programs} → ${s1.programs}`);
      if (s1.textures > s0.textures + 2) problems.push(`textures ${s0.textures} → ${s1.textures}`);
      if (JSON.stringify(spoken) !== JSON.stringify(lines)) problems.push(`captions ${JSON.stringify(spoken)} ≠ ${JSON.stringify(lines)}`);
      const run = { id: def.id, variant, profile, problems, captions: caps.map((c) => c.text) };
      report.runs.push(run);
      console.log(`${problems.length ? '✗' : '✓'} ${def.id}/${variant} ${profile}${problems.length ? ': ' + problems.join('; ') : ''}`);
      if (problems.length) failed++;
      await ctx.close();
    }
  }
}

// Interruptions, on one: a hidden tab mid-line pauses it; back after 12 s, it has ended uncounted.
// Leaving mid-line leaves nothing sounding.
if (!ONLY || ONLY.includes('charger')) {
  const { ctx, page, errors } = await open('desktop', 'charger', 'first');
  await page.waitForFunction(() => (window.__hedgehog.vignette?.player.position ?? 0) > 3, null, { timeout: 40000 });
  const hide = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await hide(true);
  const pos = (await state(page)).position;
  await page.waitForTimeout(2000);
  const held = await state(page);
  await page.waitForTimeout(10500);
  await hide(false);
  await page.waitForTimeout(4000);
  const after = await state(page);
  const problems = [];
  if (!held.paused || Math.abs(held.position - pos) > 0.2) problems.push(`not paused while hidden (${pos} → ${held.position})`);
  if (after.playing) problems.push('still playing after 12 s hidden');
  const counts = await page.evaluate(() => JSON.parse(localStorage.getItem('hh.memories') ?? '{}'));
  if (counts.charger) problems.push('counted as heard');
  console.log(`${problems.length ? '✗' : '✓'} hidden tab mid-line${problems.length ? ': ' + problems.join('; ') : ''}`);
  if (problems.length) failed++;
  await ctx.close();
  const b = await open('desktop', 'charger', 'first');
  await b.page.waitForFunction(() => (window.__hedgehog.vignette?.player.position ?? 0) > 3, null, { timeout: 40000 });
  await b.page.evaluate(() => window.__hedgehog.depart());
  await b.page.waitForTimeout(2500);
  const gone = await state(b.page);
  const p2 = gone.playing ? ['still playing after leaving'] : [];
  if (b.errors.length || errors.length) p2.push(`errors: ${[...errors, ...b.errors].join(' | ')}`);
  console.log(`${p2.length ? '✗' : '✓'} leaving mid-line${p2.length ? ': ' + p2.join('; ') : ''}`);
  if (p2.length) failed++;
  await b.ctx.close();
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
