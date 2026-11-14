// Are the generated assets still the ones their generators and the source describe?
//
// These checks used to live in the test suite. They are build-artefact freshness and asset audits,
// not behaviour: they change when someone re-runs a Python pipeline or the artist adds a recording,
// not when the room's behaviour regresses. Plain node, no vitest; it prints every problem and
// exits 1 if there is any. Run by `npm run build` and CI.
//
//   node scripts/check-assets.mjs
//
// Reads only. Needs Node 22.18+ (it imports the beat tables from src/ as TypeScript, which older
// Node only does with --experimental-strip-types).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildManifest, mp3Info, planJobs } from './dialogue-lib.mjs';

{
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18)) {
    console.error(`check-assets needs Node 22.18 or newer (this is ${process.versions.node}): it imports src/*.ts directly. Use \`nvm use 22\` or run it with --experimental-strip-types.`);
    process.exit(1);
  }
}

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
const pyNumber = (src, name, file = 'the Python script') => {
  const m = src.match(new RegExp(`^${name} = ([\\d.]+)`, 'm'));
  if (!m) throw new Error(`expected a line \`${name} = <number>\` in ${file}; if it was renamed or reformatted, update the pattern in scripts/check-assets.mjs`);
  return Number(m[1]);
};
/** The first capture of a regex over a source file, or a message naming the file and what was looked for. */
const grab = (src, re, file, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`could not find ${what} in ${file}; if it moved or was reformatted, update the pattern in scripts/check-assets.mjs`);
  return m;
};
/** One named check; a throw is one problem, and the other sections still run. */
const section = async (name, fn) => {
  const before = problems.length;
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: could not run (${e.message})`);
  }
  if (problems.length === before) console.log(`ok   ${name}`);
};

const beat = (f) => import(`../src/memory/beats/${f}.ts`);
const HOW = '(run the generator named in the message, or fix the table in src/memory/beats/)';

await section('the Drive Home film was cut on the timeline that plays', async () => {
  // The room's cut begins where film.py says; the indicator is film.py's.
  const D = await beat('drive');
  const film = read('scripts/the-drive-home/film.py');
  const drive = json('public/memories/drive/manifest.json');
  const from = pyNumber(film, 'ROOM_FROM', 'scripts/the-drive-home/film.py');
  check(from === D.DRIVE_FROM, `drive: film.py ROOM_FROM ${from} is not DRIVE_FROM ${D.DRIVE_FROM} ${HOW}`);
  const blink = Number(grab(film, /^BLINK_ON, BLINK_HZ = ([\d.]+)/m, 'scripts/the-drive-home/film.py', 'the line `BLINK_ON, BLINK_HZ = <number>, ...`')[1]);
  check(blink === D.DRIVE_BEATS.indicator, `drive: film.py BLINK_ON ${blink} is not DRIVE_BEATS.indicator ${HOW}`);
  check(near(drive.living.film.frames / drive.living.film.fps, D.DRIVE_SECONDS), 'drive: the film manifest length is not DRIVE_SECONDS (re-run scripts/the-drive-home/film.py)');
});

await section("Almost's sounds were laid from the exposure sheet and mix as they are now", async () => {
  const A = await beat('almost');
  const sound = read('scripts/almost/sound.py');
  const almost = json('public/music/almost-sound.json');
  check(almost.xsheet === sha16('scripts/almost/xsheet.py'), 'almost: the exposure sheet changed since its sounds were made (run scripts/almost/sound.py --publish)');
  check(almost.sound === sha16('scripts/almost/sound.py'), 'almost: sound.py changed since its sounds were made (run it with --publish)');
  check(pyNumber(sound, 'FILM_AT', 'scripts/almost/sound.py') === A.FILM_AT, "almost: sound.py FILM_AT is not the timeline's FILM_AT (src/memory/beats/almost.ts)");
  // TODO(merge main): once beats/almost.ts exports KITCHEN_AT, import it here instead of reading the marker.
  const kitchen = grab(read('src/memory/memories/almost.ts'), /label: 'music:kitchen', position: ([\d.]+)/, 'src/memory/memories/almost.ts', "the marker written as `label: 'music:kitchen', position: <number>` on one line")[1];
  check(pyNumber(sound, 'KITCHEN_AT', 'scripts/almost/sound.py') === Number(kitchen), 'almost: sound.py KITCHEN_AT is not the music:kitchen marker');
});

await section("Things I Should Have Said: its sound is from its story, and its beats are the sheet's", async () => {
  const T = await beat('things');
  const things = json('public/music/things-sound.json');
  for (const f of ['story', 'foley', 'soundscape'])
    check(things[f] === sha16(`scripts/things/${f}.py`), `things: scripts/things/${f}.py changed since its sound was made (run scripts/things/soundscape.py)`);
  check(things.mix === 'b', `things: the room's mix is the artist's B, not '${things.mix}'`);
  check(JSON.stringify(Object.keys(things.beats).sort()) === JSON.stringify(Object.keys(T.THINGS_BEATS).sort()), "things: the sound's beats and THINGS_BEATS name different moments (src/memory/beats/things.ts)");
  for (const [k, at] of Object.entries(T.THINGS_BEATS)) check(Math.abs(at - things.beats[k]) <= 1 / 24, `things: beat ${k} is ${at} s in src, ${things.beats[k]} s on the exposure sheet`);
  check(near(things.seconds.film, T.THINGS_SECONDS, 1e-3), 'things: the film sound is not THINGS_SECONDS long (run scripts/things/soundscape.py)');
  const thingsFilm = json('public/memories/things/manifest.json').living.film;
  check(T.THINGS_SECONDS * thingsFilm.fps === thingsFilm.frames, 'things: the film manifest length is not THINGS_SECONDS');
});

await section("Memory VII's film moments are render.py's keys", async () => {
  const S = await beat('shadows');
  const render = read('scripts/memory-vii/render.py');
  const shadows = json('public/memories/shadows/manifest.json');
  const keysOf = (name) => [...grab(render, new RegExp(`^${name} = \\[(.*)\\]$`, 'm'), 'scripts/memory-vii/render.py', `the list \`${name} = [(t, v), ...]\``)[1].matchAll(/\(([\d.]+), ([-\d.]+)\)/g)].map((m) => Number(m[1]));
  for (const [name, t] of [['LIGHT_I', S.SHADOWS_BEATS.light], ['LIGHT_I', S.SHADOWS_BEATS.dark], ['GAP', S.SHADOWS_BEATS.meet], ['GAP', S.SHADOWS_BEATS.hold], ['GAP', S.SHADOWS_BEATS.part], ['BRIDGE', S.SHADOWS_BEATS.thread], ['A_ARM', S.SHADOWS_BEATS.reach]])
    check(keysOf(name).some((k) => near(k, t)), `shadows: render.py ${name} has no key at ${t} s (src/memory/beats/shadows.ts or scripts/memory-vii/render.py)`);
  check(S.SHADOWS_SECONDS * shadows.living.film.fps === shadows.living.film.frames, 'shadows: the film manifest length is not SHADOWS_SECONDS');
});

await section("the living memories' order maps were timed on the committed timeline", () => {
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
    const [, a, b, ease] = grab(read(script), new RegExp(`^${name} = \\(([\\d.]+), ([\\d.]+), '(\\w+)'\\)`, 'm'), script, `the line \`${name} = (<start>, <end>, '<ease>')\``);
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

await section("the woodland's score is the file its notes describe, and plays against its picture", async () => {
  // The score was composed for the painted rig's 53 s timeline (scripts/woodland-score/notes.json) and
  // the memory plays it joined for the film's timeline (retime.py, retimed.json): one join of whole
  // beats in the quiet, a quarter second given back in a decay, the rest 4 s earlier, so it stops on
  // the cut a note before home and her glance falls inside its long high note.
  const hint = '(re-run scripts/woodland-score/retime.py, or the picture moved: src/memory/beats/woodland.ts)';
  const W = await beat('woodland');
  const { CUT, SCORE_FROM, SHOTS, WOODLAND_FILM } = W;
  const G = WOODLAND_FILM.glance;
  const score = json('scripts/woodland-score/notes.json');
  const re = json('scripts/woodland-score/retimed.json');

  check(re.source_sha256 === score.sha256, 'woodland score: retimed.json was made from a different render than notes.json (re-run scripts/woodland-score/retime.py)');
  check(sha16('public/music/woodland-score.mp3') === re.sha256, 'woodland score: public/music/woodland-score.mp3 is not the file retimed.json describes (re-run scripts/woodland-score/retime.py)');
  const render = 'audition/woodland/woodland-score-53s.mp3';
  if (existsSync(abs(render))) check(sha16(render) === score.sha256, `woodland score: ${render} is not the render notes.json describes`);
  else console.log(`skip ${render} is not here`);

  const melody = score.notes.filter((n) => n.hand === 'r');
  const played = re.notes.filter((n) => n.hand === 'r');

  // From where its cue begins to the cut, and nothing after it.
  check(re.from === SCORE_FROM && re.cut === CUT, `woodland score: retimed.json runs ${re.from}-${re.cut} s, the timeline plays it ${SCORE_FROM}-${CUT} s ${hint}`);
  check(re.samples === Math.round((CUT - SCORE_FROM) * 48000), 'woodland score: the retimed file is not the length of the cue ' + hint);
  check(re.notes.every((n) => n.t >= SCORE_FROM && n.t < CUT), 'woodland score: a note is struck outside the cue ' + hint);
  check(re.peak_dbfs < -1, `woodland score: the retimed file peaks at ${re.peak_dbfs} dBFS, too close to clipping`);

  // Joined on whole beats, in the quiet, and given back where only a decay is heard.
  check(Math.abs(re.join.to - re.join.from - re.join.beats * score.beat) < 0.025, 'woodland score: the join is not on whole beats (within a player\'s 25 ms)');
  check(re.join.fade <= 0.02 && re.join.level_db.after < -45 && re.join.level_db.before < -20 && re.given.level_db < -40 && re.given.ratio < 1.2, 'woodland score: the join or the decay given back is audible ' + hint);
  check(near(re.join.to - re.join.from - re.given.seconds, re.shift_after, 1e-6), 'woodland score: the join and the decay given back do not add up to the shift ' + hint);
  check(!score.notes.some((n) => n.t >= re.given.from && n.t < re.given.to), 'woodland score: a note is struck while the decay is being given back');

  // No note begins on any of the film's moments, nor does the instrument sound on them.
  const moments = [
    [9.6, 10.0, 'the way in coming to rest'],
    [SHOTS.two - 0.7, SHOTS.two + 0.25, 'the cut to the two of them'],
    [G.eyes - 0.2, G.turned + 0.15, 'her glance'],
    [SHOTS.wideAgain - 0.7, SHOTS.wideAgain + 0.7, 'the cut back to the wide'],
    [CUT - 0.5, CUT, 'the stillness before the cut'],
  ];
  for (const [a, b, what] of moments) {
    for (const n of re.notes) check(!(n.t >= a && n.t < b), `woodland score: a note is struck at ${n.t.toFixed(2)} s, in ${what} ${hint}`);
    for (const m of re.mechanism) check(!(m.t >= a && m.t < b), `woodland score: the ${m.kind} sounds at ${m.t.toFixed(2)} s, in ${what} ${hint}`);
  }

  // Her glance falls inside its long high note, and nothing in it swells or crackles.
  const held = played.filter((n) => n.t < G.eyes).at(-1);
  check(held && G.eyes - held.t > 0.15 && held.t + held.dur > G.turned, `woodland score: no note is held through her glance ${hint}`);
  const b = re.glance_above500_db;
  check(b.length >= 5 && b.every((x, i) => i === 0 || x <= b[i - 1] + 0.5), 'woodland score: the piano swells while she glances ' + hint);
  check(!re.crackle.some((k) => k.t >= G.eyes && k.t < G.settled), 'woodland score: the recording crackles through her glance ' + hint);

  // The same tune both times, as hands play it, at one level.
  const [S1, S2] = score.statements;
  const at = (from, to) => melody.filter((n) => n.t >= from + 3 * score.beat && n.t < to - 0.05).map((n) => ({ beat: (n.t - from) / score.beat, midi: n.midi }));
  const first = at(S1, S2), second = at(S2, score.cut);
  check(second.length > 5 && second.every((n, i) => first[i] && n.midi === first[i].midi && Math.abs(n.beat - first[i].beat) < 0.07), 'woodland score: the second time is not the first time\'s tune, within a player\'s 25 ms (re-render with scripts/woodland-score/)');
  const v = melody.map((n) => n.vel), mean = v.reduce((x, y) => x + y, 0) / v.length;
  check(v.every((x) => Math.abs(x - mean) <= 6), 'woodland score: the melody is not at one level (re-render with scripts/woodland-score/)');

  // The recording's crackle: about two ticks a second, never two together, never periodic, none in the last second.
  const ticks = re.crackle, rate = ticks.length / (CUT - SCORE_FROM);
  check(rate > 1 && rate < 3, `woodland score: the crackle is ${rate.toFixed(2)} ticks a second, not about two`);
  check(ticks.every((k) => k.db <= 2) && score.crackleDb + Math.max(...ticks.map((k) => k.db)) <= -30, 'woodland score: a crackle tick is too loud');
  check(CUT - Math.max(...ticks.map((k) => k.t)) > 1, 'woodland score: the crackle runs into the last second');
  const times = ticks.map((k) => k.t).sort((x, y) => x - y), gaps = times.slice(1).map((t, i) => t - times[i]);
  const gmean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((x, y) => x + (y - gmean) ** 2, 0) / gaps.length);
  check(Math.min(...gaps) >= 0.0299 && sd / gmean > 0.5, 'woodland score: the crackle is doubled or periodic');

  // It comes home once, before her glance.
  const homes = played.filter((n) => n.midi === 73);
  check(homes.length === 1 && homes[0].t < G.eyes - 1.5 && homes[0].t > SHOTS.two + 1, 'woodland score: it does not come home exactly once between the cut to the two of them and her glance ' + hint);

  // Heard only in the afternoon, once.
  const users = readdirSync(abs('src/memory/memories')).filter((f) => f.endsWith('.ts')).filter((f) => read(`src/memory/memories/${f}`).includes('music/woodland-score.mp3'));
  check(users.length === 1 && users[0] === 'woodland.ts', `woodland score: it is played by ${users.join(', ') || 'no memory'}, not only the woodland's afternoon`);
});

await section('the voice recordings, ledger and manifest agree', async () => {
  const { PHRASE_BY_ID } = await import('../src/content/phrases.ts');
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

await section("every recording in the room has character timings that match its text (for writing it as it is said)", () => {
  const timings = json('src/content/voice-timings.json');
  const direction = json('src/content/dialogue.json');
  const manifest = json('public/voices/manifest.json');
  for (const f of Object.entries(manifest).filter(([k]) => k.startsWith('phrase:')).flatMap(([, v]) => v)) {
    const e = timings[f];
    const perf = direction.performances.find((p) => p.file === f);
    check(e && perf, `timings: ${f} has no timings, or no direction (run scripts/align-voices.mjs)`);
    if (!e || !perf) continue;
    check(e.text === perf.text && e.chars.length === perf.text.length, `timings: ${f} is timed for different words than the direction has`);
    for (let i = 1; i < e.chars.length; i++) check(e.chars[i][0] >= e.chars[i - 1][0] - 1e-6, `timings: ${f} has characters out of order at ${i}`);
  }
});

await section('the memories have every file they draw', () => {
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

await section("the woodland's rig fits the shader, and her turn's drawings are the ones her-turn.py drew", async () => {
  const { DEFORMERS } = await import('../src/world/living/shaders.ts');
  const { TURN } = await import('../src/memory/living/woodlandRig.ts');
  const deformers = json('public/memories/woodland/manifest.json').rig.afternoon.figures.deformers.length;
  check(deformers <= DEFORMERS, `woodland: the manifest names ${deformers} deformers, the shader has room for ${DEFORMERS} (raise DEFORMERS in src/world/living/shaders.ts, or draw fewer)`);
  // TURN: two eye drawings, then one for each of the turn's twelfths.
  const shown = TURN.eyes.length + TURN.drawings;
  const drawn = Object.keys(json('references/woodland/drawings/turn/turn.json').drawings).length;
  check(drawn === shown, `woodland: her-turn.py drew ${drawn} drawings, not the ${shown} the timeline shows (re-run scripts/her-turn.py, or fix TURN in src/memory/living/woodlandRig.ts)`);
});

await section('no API key is committed, and the browser never talks to ElevenLabs', () => {
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
    // A key's shapes: ElevenLabs' `sk_` + hex, or a long hex value assigned to something named like a key.
    // (A 64-hex hash in a doc, or a library voice's public owner id, is not one.)
    const text = readFileSync(p, 'utf8');
    check(!/\bsk_[a-f0-9]{24,}|(?:api[_-]?key|xi-api-key|secret|token)["']?\s*[:=]\s*["']?[a-f0-9]{32,}/i.test(text), `credentials: ${p.slice(ROOT.length + 1)} looks like it holds an API key (remove it, rotate the key, and keep it in the environment only)`);
  });
  walk(abs('src'), (p) => check(!/api\.elevenlabs\.io|xi-api-key/i.test(readFileSync(p, 'utf8')), `browser code talks to ElevenLabs: ${p.slice(ROOT.length + 1)}`));
});

await section('the voice library is described', () => {
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
