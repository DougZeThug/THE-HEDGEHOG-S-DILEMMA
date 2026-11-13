// Are the generated assets still the ones their generators and the source describe?
//
// These checks used to live in the test suite. They are build-artefact freshness and asset audits,
// not behaviour: they change when someone re-runs a Python pipeline or the artist adds a recording,
// not when the room's behaviour regresses. Plain node, no vitest; it prints every problem and
// exits 1 if there is any. Run by `npm run build` and CI.
//
//   node scripts/check-assets.mjs
//
// Reads only. Needs Node 22+ (it imports the beat tables from src/ as TypeScript).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildManifest, mp3Info, planJobs } from './dialogue-lib.mjs';

const ROOT = join(import.meta.dirname, '..');
const abs = (f) => join(ROOT, f);
const read = (f) => readFileSync(abs(f), 'utf8');
const json = (f) => JSON.parse(read(f));
const sha16 = (f) => createHash('sha256').update(readFileSync(abs(f))).digest('hex').slice(0, 16);
const problems = [];
const check = (ok, msg) => {
  if (!ok) problems.push(msg);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
/** A `NAME = number` line of a Python script. */
const pyNumber = (src, name) => {
  const m = src.match(new RegExp(`^${name} = ([\\d.]+)`, 'm'));
  return m ? Number(m[1]) : NaN;
};
const section = (name, fn) => {
  const before = problems.length;
  try {
    fn();
  } catch (e) {
    problems.push(`${name}: could not run (${e.message})`);
  }
  if (problems.length === before) console.log(`ok   ${name}`);
};

const beat = (f) => import(`../src/memory/beats/${f}.ts`);
const { PHRASE_BY_ID } = await import('../src/content/phrases.ts');

await (async () => {
  const before = problems.length;
  try {
    // The Drive Home: the room's cut begins where film.py says; the indicator is film.py's.
    const D = await beat('drive');
    const film = read('scripts/the-drive-home/film.py');
    const drive = json('public/memories/drive/manifest.json');
    check(pyNumber(film, 'ROOM_FROM') === D.DRIVE_FROM, `drive: film.py ROOM_FROM ${pyNumber(film, 'ROOM_FROM')} is not DRIVE_FROM ${D.DRIVE_FROM}`);
    check(Number(film.match(/^BLINK_ON, BLINK_HZ = ([\d.]+)/m)?.[1]) === D.DRIVE_BEATS.indicator, 'drive: film.py BLINK_ON is not DRIVE_BEATS.indicator');
    check(near(drive.living.film.frames / drive.living.film.fps, D.DRIVE_SECONDS), 'drive: the film manifest length is not DRIVE_SECONDS');

    // Almost: sound.py laid its sounds from the exposure sheet and the mix as they are now.
    const A = await beat('almost');
    const sound = read('scripts/almost/sound.py');
    const almost = json('public/music/almost-sound.json');
    check(almost.xsheet === sha16('scripts/almost/xsheet.py'), 'almost: the exposure sheet changed since its sounds were made (run scripts/almost/sound.py --publish)');
    check(almost.sound === sha16('scripts/almost/sound.py'), 'almost: sound.py changed since its sounds were made (run it with --publish)');
    check(pyNumber(sound, 'FILM_AT') === A.FILM_AT, 'almost: sound.py FILM_AT is not the timeline\'s FILM_AT');
    const kitchen = read('src/memory/memories/almost.ts').match(/label: 'music:kitchen', position: ([\d.]+)/)?.[1];
    check(pyNumber(sound, 'KITCHEN_AT') === Number(kitchen), 'almost: sound.py KITCHEN_AT is not the music:kitchen marker');

    // Things I Should Have Said: its sound from its story, Foley and soundscape; its beats the sheet's.
    const T = await beat('things');
    const things = json('public/music/things-sound.json');
    for (const [k, f] of [['story', 'story'], ['foley', 'foley'], ['soundscape', 'soundscape']])
      check(things[k] === sha16(`scripts/things/${f}.py`), `things: scripts/things/${f}.py changed since its sound was made (run soundscape.py)`);
    check(things.mix === 'b', `things: the room's mix is the artist's B, not '${things.mix}'`);
    check(JSON.stringify(Object.keys(things.beats).sort()) === JSON.stringify(Object.keys(T.THINGS_BEATS).sort()), 'things: the sound\'s beats and THINGS_BEATS name different moments');
    for (const [k, at] of Object.entries(T.THINGS_BEATS)) check(Math.abs(at - things.beats[k]) <= 1 / 24, `things: beat ${k} is ${at} s in src, ${things.beats[k]} s on the exposure sheet`);
    check(near(things.seconds.film, T.THINGS_SECONDS, 1e-3), 'things: the film sound is not THINGS_SECONDS long');
    const thingsFilm = json('public/memories/things/manifest.json').living.film;
    check(T.THINGS_SECONDS * thingsFilm.fps === thingsFilm.frames, 'things: the film manifest length is not THINGS_SECONDS');

    // Memory VII: the film's moments are render.py's keys; the film is as long as the timeline says.
    const S = await beat('shadows');
    const render = read('scripts/memory-vii/render.py');
    const shadows = json('public/memories/shadows/manifest.json');
    const keysOf = (name) => [...render.match(new RegExp(`^${name} = \\[(.*)\\]$`, 'm'))[1].matchAll(/\(([\d.]+), ([-\d.]+)\)/g)].map((m) => Number(m[1]));
    for (const [name, t] of [['LIGHT_I', S.SHADOWS_BEATS.light], ['LIGHT_I', S.SHADOWS_BEATS.dark], ['GAP', S.SHADOWS_BEATS.meet], ['GAP', S.SHADOWS_BEATS.hold], ['GAP', S.SHADOWS_BEATS.part], ['BRIDGE', S.SHADOWS_BEATS.thread], ['A_ARM', S.SHADOWS_BEATS.reach]])
      check(keysOf(name).some((k) => near(k, t)), `shadows: render.py ${name} has no key at ${t} s`);
    check(S.SHADOWS_SECONDS * shadows.living.film.fps === shadows.living.film.frames, 'shadows: the film manifest length is not SHADOWS_SECONDS');
  } catch (e) {
    problems.push(`film pipelines: could not run (${e.message})`);
  }
  if (problems.length === before) console.log('ok   the film pipelines were run on the timelines that play');
})();

section("the living memories' order maps were timed on the committed timeline", () => {
  const state = json('src/memory/theatre-state.json');
  const ORDER_SCRIPTS = {
    woodland: 'scripts/stroke-order.py',
    almost: 'scripts/almost/emergence.py',
    things: 'scripts/things/emergence.py',
    shadows: 'scripts/memory-vii/order.py',
    drive: 'scripts/the-drive-home/order.py',
  };
  // A window track's first segment: [start, end, ease]. A straight one leaves its key with handle (1/3, 1/3).
  const committed = (sheet, prop) => {
    const o = state.sheetsById[sheet].sequence.tracksByObject.window;
    const [a, b] = o.trackData[o.trackIdByPropPath[`["${prop}"]`]].keyframes;
    return [a.position, b.position, Math.abs(a.handles[3] - 1 / 3) < 1e-6 ? 'linear' : 'soft'];
  };
  const clock = (script, name) => {
    const [, a, b, ease] = read(script).match(new RegExp(`^${name} = \\(([\\d.]+), ([\\d.]+), '(\\w+)'\\)`, 'm'));
    return [Number(a), Number(b), ease];
  };
  for (const memory of readdirSync(abs('public/memories'))) {
    const manifest = json(`public/memories/${memory}/manifest.json`);
    for (const [variant, lm] of Object.entries(manifest.living ?? {})) {
      const clocks = lm?.orderClocks;
      if (!clocks) continue;
      const script = ORDER_SCRIPTS[memory];
      check(script, `${memory}: it has an order map but no script is known to bake it (add it to ORDER_SCRIPTS in scripts/check-assets.mjs)`);
      if (!script) continue;
      const sheet = `${memory}-${variant}`;
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      check(same(clocks.drawn, committed(sheet, 'sketch')), `${sheet}: the baked order map's drawn clock is not the committed timeline's (run ${script})`);
      check(same(clocks.coloured, committed(sheet, 'reveal')), `${sheet}: the baked order map's coloured clock is not the committed timeline's (run ${script})`);
      check(same(clock(script, 'DRAWN'), committed(sheet, 'sketch')), `${script}: DRAWN is not the committed timeline's`);
      check(same(clock(script, 'COLOURED'), committed(sheet, 'reveal')), `${script}: COLOURED is not the committed timeline's`);
    }
  }
});

section("the woodland's score is the file its notes describe", () => {
  const score = json('scripts/woodland-score/notes.json');
  const re = json('scripts/woodland-score/retimed.json');
  check(re.source_sha256 === score.sha256, 'woodland score: retimed.json was made from a different render than notes.json');
  check(sha16('public/music/woodland-score.mp3') === re.sha256, 'woodland score: public/music/woodland-score.mp3 is not the file retimed.json describes');
  const render = 'audition/woodland/woodland-score-53s.mp3';
  if (existsSync(abs(render))) check(sha16(render) === score.sha256, `woodland score: ${render} is not the render notes.json describes`);
  else console.log(`skip ${render} is not here`);
});

section('the voice recordings, ledger and manifest agree', () => {
  const direction = json('src/content/dialogue.json');
  const ledger = json('scripts/dialogue-ledger.json');
  const manifest = json('public/voices/manifest.json');
  const exists = (f) => existsSync(abs(`public/voices/${f}`));
  check(planJobs(direction, ledger, { fileExists: exists }).jobs.length === 0, 'voices: the ledger is behind the direction; generate-dialogue would bill something (run it with --dry-run)');
  for (const p of direction.performances) {
    const e = ledger.entries[p.id];
    check(e?.status === 'validated', `voices: ${p.id} is not validated in the ledger`);
    if (!e || !exists(p.file)) {
      check(exists(p.file), `voices: ${p.file} is missing`);
      continue;
    }
    const info = mp3Info(new Uint8Array(readFileSync(abs(`public/voices/${p.file}`))));
    check(info.valid && info.seconds > 0.6 && info.seconds < 6, `voices: ${p.file} is not valid audio of a sensible length`);
    check(Math.abs(info.seconds - e.seconds) < 0.05, `voices: ${p.file} is not the length the ledger recorded`);
    check(e.wer <= 0.25, `voices: ${p.id} was heard as "${e.transcript}" (word error ${e.wer})`);
    check((e.spokenTags ?? []).length === 0, `voices: ${p.id} spoke a direction aloud`);
  }
  for (const [k, files] of Object.entries(manifest)) {
    for (const f of files) check(exists(f), `voices: manifest ${k} lists ${f}, which is not on disk`);
    if (k.startsWith('phrase:')) check(PHRASE_BY_ID.has(k.slice(7)), `voices: manifest ${k} is not a phrase`);
  }
  check(isDeepStrictEqual(buildManifest(manifest, direction, ledger), manifest), 'voices: the manifest is not what the ledger and direction build');
  // The room fetches every sound and one take of each line on arrival: a phone's budget.
  const bytes = Object.entries(manifest)
    .filter(([k]) => !k.startsWith('mem:') && !k.startsWith('vig:') && !k.startsWith('phrase:'))
    .flatMap(([, f]) => f)
    .reduce((n, f) => n + (exists(f) ? statSync(abs(`public/voices/${f}`)).size : 0), 0);
  check(bytes <= 3 * 1024 * 1024, `voices: the sounds fetched on arrival are ${(bytes / 1048576).toFixed(2)} MiB, over the 3 MiB phone budget (raise it on purpose in scripts/check-assets.mjs)`);
});

section('the memories have every file they draw', () => {
  for (const art of readdirSync(abs('public/memories'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const manifest = json(`public/memories/${art}/manifest.json`);
    const has = (f) => existsSync(abs(`public/memories/${art}/${f}`));
    for (const [v, layers] of Object.entries(manifest.variants ?? {}))
      for (const l of layers) for (const s of ['', '@low']) check(has(`${l.file}${s}.webp`), `${art}/${v}: ${l.file}${s}.webp is missing`);
    for (const [v, lm] of Object.entries(manifest.living ?? {})) {
      if (!lm) continue;
      if (lm.kind !== 'film') {
        // A painted living variant: every file its scene draws, at the sizes it loads.
        const files = [[lm.plate, ['', '@low']], [lm.maps, ['']]];
        if (lm.grade) files.push([lm.grade, ['']]);
        if (lm.sky) files.push([lm.sky.file, ['']]);
        if (lm.figures) for (const f of [lm.figures.file, lm.figures.lids]) files.push([f, ['', '@low']]);
        if (lm.after) files.push([lm.after, ['', '@low']]);
        if (lm.flowers) files.push([lm.flowers.file, ['', '@low']]);
        if (lm.clouds) for (const f of [lm.clouds.mask, lm.clouds.file, lm.clouds.after]) files.push([f, ['']]);
        if (lm.order) files.push([lm.order, ['']]);
        if (lm.near) {
          for (const f of [lm.near.file, lm.near.lids, lm.near.heads.file, lm.figures.heads.file]) files.push([f, ['', '@low']]);
          for (const f of [lm.near.ground.file, lm.near.maps]) files.push([f, ['']]);
        }
        for (const [f, sizes] of files) for (const s of sizes) check(has(`${f}${s}.webp`), `${art}/${v}: ${f}${s}.webp is missing`);
        continue;
      }
      for (const s of ['', '@low']) for (const ext of ['webm', 'mp4']) check(has(`${lm.film}${s}.${ext}`), `${art}/${v}: ${lm.film}${s}.${ext} is missing`);
      if (lm.order) check(has(`${lm.order}.webp`), `${art}/${v}: the order map ${lm.order}.webp is missing`);
    }
  }
  for (const m of readdirSync(abs('src/memory/memories')).filter((f) => f.endsWith('.ts'))) {
    for (const [, asset] of read(`src/memory/memories/${m}`).matchAll(/asset: '(music\/[^']+)'/g)) check(existsSync(abs(`public/${asset}`)), `${m}: its cue plays public/${asset}, which is missing`);
  }
});

section("the woodland's rig fits the shader, and her turn's drawings are the ones her-turn.py drew", () => {
  const max = Number(read('src/world/living/shaders.ts').match(/export const DEFORMERS = (\d+)/)[1]);
  const deformers = json('public/memories/woodland/manifest.json').rig.afternoon.figures.deformers.length;
  check(deformers <= max, `woodland: the manifest names ${deformers} deformers, the shader has room for ${max}`);
  // TURN in src/memory/living/woodlandRig.ts: two eye drawings, then one for each of the turn's twelfths.
  const turn = read('src/memory/living/woodlandRig.ts').match(/export const TURN = \{ eyes: \[([^\]]*)\].*drawings: (\d+)/);
  const spec = json('references/woodland/drawings/turn/turn.json');
  check(Object.keys(spec.drawings).length === turn[1].split(',').length + Number(turn[2]), `her-turn.py drew ${Object.keys(spec.drawings).length} drawings, not the ${turn[1].split(',').length + Number(turn[2])} the timeline shows`);
});

section('no API key is committed, and the browser never talks to ElevenLabs', () => {
  const walk = (dir, visit) => {
    for (const f of readdirSync(dir)) {
      if (['node_modules', 'dist', '.git', 'test-output', '.claude', '.factory'].includes(f)) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, visit);
      else visit(p, f);
    }
  };
  walk(ROOT, (p, f) => {
    if (!/\.(ts|mjs|mts|js|json|md|html|css)$/.test(f)) return;
    // A library voice's public owner id is a 64-hex identifier from the public voice library, not a secret.
    const text = readFileSync(p, 'utf8').replace(/"publicOwnerId": "[a-f0-9]{64}"/g, '');
    check(!/sk_[a-f0-9]{24,}|[a-f0-9]{64}/.test(text), `credentials: ${p.slice(ROOT.length + 1)} looks like it holds an API key`);
  });
  walk(abs('src'), (p) => check(!/api\.elevenlabs\.io|xi-api-key/i.test(readFileSync(p, 'utf8')), `browser code talks to ElevenLabs: ${p.slice(ROOT.length + 1)}`));
});

section('the voice library is described', () => {
  const designs = json('scripts/voice-designs.json');
  for (const v of designs.library) {
    check(/^[A-Za-z0-9]{20}$/.test(v.voiceId), `voice-designs: ${v.id} has no voiceId`);
    check(/^[0-9a-f]{64}$/.test(v.publicOwnerId), `voice-designs: ${v.id} has no publicOwnerId`);
    check(v.why?.length > 10 && v.for?.length > 3, `voice-designs: ${v.id} does not say why it was chosen and what it is for`);
    if (v.childlike) check(v.why.includes('not a real child'), `voice-designs: ${v.id} is childlike and must say 'not a real child'`);
  }
  const ledger = json('scripts/voice-design-ledger.json');
  const manifest = read('public/voices/manifest.json');
  const files = [...Object.values(ledger.library ?? {}).map((e) => e.file), ...Object.values(ledger.entries).flatMap((e) => e.previews.map((p) => p.file))];
  for (const f of files) {
    check(existsSync(abs(`audition/${f}`)), `voice-design-ledger: audition/${f} is missing`);
    check(!manifest.includes(f.split('/').pop()), `voice-design-ledger: audition sample ${f} is in the room's manifest`);
  }
});

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} with the generated assets:`);
  for (const p of problems) console.error(`  x ${p}`);
  process.exit(1);
}
console.log('assets: everything generated matches what made it');
