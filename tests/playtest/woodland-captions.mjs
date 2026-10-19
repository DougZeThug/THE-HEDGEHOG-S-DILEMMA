// Each of the woodland's captions as a visitor sees it (the app's own stylesheet, a 1280×720
// landscape screen), on a transparent ground, to lay over the film.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)); }
const ROOT = process.cwd();
const css = readdirSync(`${ROOT}/dist/assets`).find((f) => f.endsWith('.css'));
const OUT = process.argv[2] ?? 'test-output/review/woodland/sound/caps';
// (In the order of tests/playtest/woodland-film.py's CAPS: the woodland's captions, src/memory/defs.ts.)
const caps = process.argv[3] ? JSON.parse(process.argv[3]) : ['[cicadas, beyond the wall]', '[a piano]', '[the piano has stopped; evening cicadas]', '[an evening cicada, far off]'];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [i, text] of caps.entries()) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file://${ROOT}/dist/assets/${css}">
<style>html,body{background:transparent!important;margin:0}.captions .cap{transition:none!important}</style></head>
<body><div class="captions" id="captions"><span class="cap sound on">${text}</span></div></body></html>`;
  writeFileSync(`${OUT}/cap.html`, html);
  await page.goto(`file://${ROOT}/${OUT}/cap.html`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/cap-${i}.png`, omitBackground: true });
}
await browser.close();
console.log('captions:', caps.length);
