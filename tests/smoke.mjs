// Browser smoke test: builds nothing, expects a server at BASE (default: vite preview on 4173).
// Usage: npm run build && npx vite preview --port 4173 & npm run smoke
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(`${globalRoot}/playwright`));
}

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'test-output';
mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (process.env.VERBOSE) console.log('[console]', m.type(), m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const hh = (fn, arg) => page.evaluate(fn, arg);

await page.goto(BASE + '?debug&seed=7');
await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 60000 });
await shot('00-threshold');
await page.click('#enter');
await wait(10000);
await shot('01-arrival');

// Speed the simulation clock for behaviour checks via the inspector.
const state = await hh(() => {
  const a = window.__hedgehog;
  return { phase: a.director.phase, audio: a.audio?.ctx.state, visible: a.director.visible.size };
});
console.log('after arrival', state);

// Walk toward the chair.
await page.keyboard.down('KeyW');
await wait(1700);
await page.keyboard.up('KeyW');
await wait(2500);
await shot('02-approach');

// Kneel by the chair.
await hh(() => {
  const a = window.__hedgehog;
  a.rig.pos.set(0.05, 0, 0.75);
  a.rig.yaw = 0.0;
  a.rig.pitch = -0.35;
});
await wait(1500);
await shot('03-near-chair');
await page.keyboard.press('KeyK');
await wait(3500);
await shot('04-kneel');
await page.keyboard.press('KeyK');

// Turn to each wall.
for (const [name, yaw, x, z] of [['east', -Math.PI / 2, 0.6, 0.2], ['west', Math.PI / 2, -0.6, 0.2], ['south', Math.PI, 0, -1.2], ['north', 0, 0.2, 1.6]]) {
  await hh(([yaw, x, z]) => {
    const a = window.__hedgehog;
    a.rig.pos.set(x, 0, z);
    a.rig.yaw = yaw;
    a.rig.pitch = 0.05;
  }, [yaw, x, z]);
  await wait(1200);
  await shot(`05-wall-${name}`);
}

// Stay still.
await wait(26000);
await shot('06-still');
const still = await hh(() => {
  const a = window.__hedgehog;
  return { snap: a.director.snapshot(), peak: a.audio ? a.audio.peakDb() : null };
});
console.log('after stillness', JSON.stringify(still.snap.recent), 'peak dB', still.peak);

// Contribute.
await page.keyboard.press('KeyT');
await wait(300);
await page.keyboard.type('I miss who I used to be.');
await page.keyboard.press('Enter');
await hh(() => {
  const a = window.__hedgehog;
  a.rig.pos.set(0, 0, 0.6);
  a.rig.yaw = Math.PI;
  a.rig.pitch = 0.05;
});
await wait(9000);
await shot('07-contribution');

// Settings + departure.
await page.keyboard.press('Escape');
await wait(600);
await shot('08-settings');
await page.click('#leave');
await wait(12000);
await shot('09-departure');
await page.click('#return');
await wait(5000);
await shot('10-return');

const final = await hh(() => {
  const a = window.__hedgehog;
  return { phase: a.director.phase, mode: a.mode, log: a.director.log.length, peak: a.audio ? a.audio.peakDb() : null, contributions: [...a.text.items.values()].filter((i) => i.purpose === 'contribution').length };
});
console.log('final', final);
await browser.close();
if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
