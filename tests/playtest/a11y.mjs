// Automated accessibility scan of the DOM (threshold and overlays) with axe-core.
// Expects a server at BASE (default: vite preview on 4173). The WebGL canvas is not audited by axe.
// Usage: npm run build && npx vite preview --port 4173 & npm run a11y
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE, launch } from './browser-lib.mjs';

const require = createRequire(import.meta.url);
const { AxeBuilder } = require('@axe-core/playwright');

const OUT = process.env.OUT ?? 'test-output';
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
const page = await context.newPage();
await page.goto(BASE);
await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 60000 });
const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
writeFileSync(`${OUT}/a11y.json`, JSON.stringify(violations, null, 2));
for (const v of violations) console.log(`✗ ${v.id} (${v.impact}): ${v.help}, ${v.nodes.length} node(s)`);
console.log(violations.length ? `${violations.length} violation(s), see ${OUT}/a11y.json` : 'axe: no WCAG A/AA violations on the threshold');
await browser.close();
process.exit(violations.length ? 1 : 0);
