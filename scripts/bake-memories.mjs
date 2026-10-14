/**
 * Bake the memories' code-painted stand-in layers (src/memory/paint) to WebP files, in a real
 * browser canvas (Playwright's Chromium), so the shipped app never carries the painters.
 *
 *   npm run bake:memories [-- --only=cereal]
 *
 * Writes public/memories/<id>/<variant>/<layer>.webp (1200 px wide) and <layer>@low.webp
 * (768 px, phones), and public/memories/<id>/manifest.json. A layer can be replaced by any image
 * of the same aspect, RGBA, sRGB, transparent where nothing is painted: drop it in under the
 * same name (docs/memories.md). A layer whose manifest entry says `source: "artist"` is never
 * overwritten by a bake.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = args.only ? args.only.split(',') : null;
const VARIANTS = { cereal: ['first', 'later'], bedroom: ['morning', 'dusk'], door: ['passing', 'approach'] };
const SIZES = { '': 1200, '@low': 768 };

const bundle = await build({ entryPoints: [join(ROOT, 'src/memory/paint/index.ts')], bundle: true, write: false, format: 'iife', globalName: 'Painters', target: 'es2020' });
const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : {});
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

for (const [id, variants] of Object.entries(VARIANTS)) {
  if (only && !only.includes(id)) continue;
  const dir = join(ROOT, 'public/memories', id);
  const manifestPath = join(dir, 'manifest.json');
  const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const info = await page.evaluate((id) => {
    const p = window.Painters.PAINTERS[id];
    return { size: p.SIZE, layers: p.LAYERS, kinds: p.KINDS, pane: p.SUN_PANE ?? null, band: p.BAND ?? null };
  }, id);
  // The painting's size; the band at its top kept for the words; the sun's pane (where the
  // memory's light leaves the room's light, the bleed).
  const manifest = { size: info.size, band: info.band, pane: info.pane, variants: {} };
  const seen = new Map();
  for (const v of variants) {
    mkdirSync(join(dir, v), { recursive: true });
    manifest.variants[v] = [];
    for (const [suffix, width] of Object.entries(SIZES)) {
      const layers = await page.evaluate(
        ([id, v, ppm]) => {
          const out = window.Painters.PAINTERS[id].paint(v, ppm);
          return Object.fromEntries(Object.entries(out).map(([k, c]) => [k, c.toDataURL('image/webp', 0.9)]));
        },
        [id, v, width / info.size[0]],
      );
      for (const name of info.layers) {
        const prev = old?.variants?.[v]?.find((l) => l.name === name);
        let file = `${v}/${name}`;
        if (prev?.source === 'artist') console.log(`  kept (artist's): ${file}${suffix}.webp`);
        else {
          const bytes = Buffer.from(layers[name].split(',')[1], 'base64');
          // A layer the same as one an earlier variant has is shared, not downloaded twice.
          const hash = createHash('sha1').update(bytes).digest('hex') + suffix;
          if (seen.has(hash)) {
            file = seen.get(hash);
            rmSync(join(dir, `${v}/${name}${suffix}.webp`), { force: true });
          } else {
            seen.set(hash, file);
            writeFileSync(join(dir, `${file}${suffix}.webp`), bytes);
          }
        }
        if (!suffix) manifest.variants[v].push({ name, kind: info.kinds[name], file, source: prev?.source === 'artist' ? 'artist' : 'code-painted stand-in' });
      }
    }
    console.log(`✓ ${id}/${v}: ${info.layers.join(', ')}`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
await browser.close();
