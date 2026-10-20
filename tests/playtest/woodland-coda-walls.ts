/**
 * How often the line where the woodland's painting was is written (decisions 133, 136, 137), in the
 * browser's own layout early in a visit. "five more minutes" is written where the room writes it
 * (near where the visitor looks, as the memory's offer does) near points across the four walls at
 * eye level; under it, each wording is placed as WallText.writeWithin places it. Counts where it is
 * written, and which lines it keeps back. The painting's place follows its line as in a woodland run
 * (`woodland-coda.mjs`: 6.5 cm along and 11.6 cm down from the line's centre, kept on the wall).
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npx vite-node tests/playtest/woodland-coda-walls.ts
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { PHRASES } from '../../src/content/phrases';

type Got = { du: number; gap: number; kept: string[] } | null;
type Row = { wall: string; at: [number, number]; got: Record<string, Got> };

const require = createRequire(import.meta.url);
let chromium: any;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`));
}
const BASE = process.env.BASE ?? 'http://localhost:4173/';
// The two wordings as the browser measures them (pencil, s: woodland-coda.mjs reports them).
const WORDINGS: Record<string, [number, number]> = { 'we had all afternoon': [1.107, 0.211], 'I thought it would last forever.': [1.632, 0.211] };
const OWN = PHRASES.filter((p) => p.at).map((p) => p.id);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE}?seed=7`);
await page.waitForFunction(() => !(document.getElementById('enter') as HTMLButtonElement).disabled, null, { timeout: 120000 });
await page.click('#enter');
await page.waitForFunction(() => ((window as any).__hedgehog.score?.t ?? 0) > 2, null, { timeout: 60000 });
await page.evaluate(() => {
  const b = document.getElementById('skip');
  if (b && !b.hidden) b.click();
});
await page.waitForFunction(() => (window as any).__hedgehog.score.stage === 'done', null, { timeout: 120000 });
const rows: Row[] = await page.evaluate(({ own, wordings }: { own: string[]; wordings: Record<string, [number, number]> }) => {
  const a = (window as any).__hedgehog, T = a.text, L = T.layout;
  const ownIds = new Set(own);
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const wall of ['north', 'east', 'south', 'west'])
    for (const u of [1.2, 2.0, 2.8, 3.6, 4.4, 5.2])
      for (const v of [1.3, 1.6, 1.9]) {
        const key = `probe:${wall}:${u}:${v}`;
        if (!T.write({ key, text: 'five more minutes', hand: 'pencil', size: 's', surface: wall, near: { u, v }, purpose: 'recall', ttl: 0, now: a.time, source: 'more-minutes', start: false })) continue;
        const an = T.items.get(key).placement;
        const at = `${wall} ${an.u.toFixed(2)} ${an.v.toFixed(2)}`;
        if (!seen.has(at)) {
          seen.add(at);
          // As WallText.writeWithin: places of lines not yet shown give way; a line's own place waits.
          const slots = new Map(), mine = new Map();
          for (const [id, pl] of T.placements) if (!T.items.has(id)) (ownIds.has(id) ? mine : slots).set(pl, id);
          const written = [...T.items.values()].filter((x: any) => x.key !== key && x.placement.surface === wall && (x.vis > 0.05 || x.target > 0)).map((x: any) => x.placement);
          const within = { u: Math.min(Math.max(an.u + 0.065, 1.65), 6.4 - 1.65), v: Math.min(Math.max(an.v - 0.116, 0.95), 3.6 - 0.95), w: 3.2, h: 1.8 };
          const got: Record<string, Got> = {};
          for (const [text, [w, h]] of Object.entries(wordings)) {
            const f = L.findUnder(an, w, h, within, (p: unknown) => slots.has(p), written, (p: unknown) => mine.has(p));
            got[text] = f ? { du: +(f.rect.u - f.rect.w / 2 - (an.u - an.w / 2)).toFixed(2), gap: +(an.v - an.h / 2 - (f.rect.v + f.rect.h / 2)).toFixed(2), kept: f.waiting.map((p: unknown) => mine.get(p)) } : null;
          }
          out.push({ wall, at: [+an.u.toFixed(2), +an.v.toFixed(2)], got });
        }
        L.remove(an);
        T.items.delete(key);
      }
  return out;
}, { own: OWN, wordings: WORDINGS });
for (const r of rows)
  console.log(`${r.wall.padEnd(5)} ${r.at.join(',').padEnd(10)}`, Object.entries(r.got).map(([t, g]) => `${t.slice(0, 12)}: ${g ? `${g.du >= 0 ? '+' : ''}${g.du} along, ${g.gap} under${g.kept.length ? `, keeps back ${g.kept.join(' ')}` : ''}` : '-'}`).join(' | '));
for (const t of Object.keys(WORDINGS)) {
  const w = rows.filter((r) => r.got[t]);
  console.log(`"${t}": written under ${w.length} of the ${rows.length} places "five more minutes" landed; keeps lines back in ${w.filter((r) => r.got[t]!.kept.length).length}`);
}
await browser.close();
