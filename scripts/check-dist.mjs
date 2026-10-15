// After a build: nothing for authoring may ship (Theatre Studio, the Memory Editor, the dev
// save endpoint, the memory painters). Fails the build if any of it is in dist/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '../dist/assets');
const FORBIDDEN = [
  ['Theatre Studio', /theatrejs:0\.4|createContentOfSaveFile/],
  ['the Memory Editor', /memory-editor|hedgehog-memories/],
  ['the dev save endpoint', /__memory\/save/],
  ['the memory painters', /sunPane|bowlOutside/],
];
let bad = 0;
for (const f of readdirSync(DIST).filter((f) => f.endsWith('.js'))) {
  const s = readFileSync(join(DIST, f), 'utf8');
  for (const [what, re] of FORBIDDEN)
    if (re.test(s)) {
      console.error(`✗ ${what} is in dist/assets/${f}`);
      bad++;
    }
}
if (bad) process.exit(1);
console.log('dist: nothing for authoring shipped');
