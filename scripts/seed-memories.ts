/**
 * Write the memories' first authored timelines into src/memory/theatre-state.json, for sheets
 * that aren't there yet. Once the artist has saved from Theatre Studio, that file is the source
 * of truth: this never touches an existing sheet unless asked (`--force=<sheet>` or `--force`),
 * which discards authored work.
 *
 *   npm run memories:seed [-- --force=cereal-first]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORIES, sheetId } from '../src/memory/defs';
import { seedState, type TheatreState } from '../src/memory/seed';

const path = join(__dirname, '../src/memory/theatre-state.json');
const state = JSON.parse(readFileSync(path, 'utf8')) as TheatreState;
const force = process.argv.find((a) => a.startsWith('--force'));
const forced = force?.includes('=') ? force.split('=')[1].split(',') : force ? 'all' : [];

const seeds: Parameters<typeof seedState>[0] = {};
for (const def of Object.values(MEMORIES))
  for (const v of def.variants) {
    const id = sheetId(def.id, v);
    if (state.sheetsById[id] && !(forced === 'all' || forced.includes(id))) {
      console.log(`  kept (authored): ${id}`);
      continue;
    }
    seeds[id] = def.seed(v);
  }
const fresh = seedState(seeds, `seed-${Date.now().toString(36)}`);
for (const [id, sheet] of Object.entries(fresh.sheetsById)) {
  state.sheetsById[id] = sheet;
  console.log(`✓ seeded ${id}`);
}
writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
