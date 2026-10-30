#!/usr/bin/env node
// Factory state machine: task records, verification runs, repair bounds, status.
// Zero dependencies. Portable: all project specifics come from .factory/profile.json.
// The LLM agents decide *what* to build; this script keeps the facts (what ran, what passed, how many tries).
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(process.env.FACTORY_ROOT ?? execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim());
const FACTORY = join(ROOT, '.factory');
const TASKS = join(FACTORY, 'tasks');
const ACTIVE = ['building', 'verifying', 'repairing', 'in-review'];
const STATUSES = ['planned', ...ACTIVE, 'ready', 'delivered', 'blocked', 'escalated', 'abandoned'];
const DEFAULTS = { maxConcurrentTasks: 1, maxRepairAttempts: 3, sameFailureEscalates: 2 };

const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const now = () => new Date().toISOString();
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };

export function loadProfile() {
  const p = join(FACTORY, 'profile.json');
  if (!existsSync(p)) die('No .factory/profile.json. Run: node .claude/factory/bin/factory.mjs init');
  const prof = JSON.parse(readFileSync(p, 'utf8'));
  prof.limits = { ...DEFAULTS, ...(prof.limits ?? {}) };
  return prof;
}
const taskDir = (id) => join(TASKS, id);
const taskFile = (id) => join(taskDir(id), 'task.json');
export function readTask(id) {
  if (!existsSync(taskFile(id))) die(`No such task: ${id}`);
  return JSON.parse(readFileSync(taskFile(id), 'utf8'));
}
export function saveTask(t) { t.updated = now(); writeFileSync(taskFile(t.id), JSON.stringify(t, null, 2) + '\n'); }
export function allTasks() {
  if (!existsSync(TASKS)) return [];
  return readdirSync(TASKS).filter((d) => existsSync(taskFile(d))).map((d) => JSON.parse(readFileSync(taskFile(d), 'utf8')));
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
const head = () => sh('git rev-parse HEAD');
const dirty = () => sh('git status --porcelain -- . ":(exclude).factory"') !== '';

/** A short stable fingerprint of a failure: first error-looking lines with numbers/paths-with-lines stripped. */
export function failureSignature(output) {
  const lines = output.split('\n').filter((l) => /(error|fail|✗|×|assert|expected)/i.test(l)).slice(0, 8)
    .map((l) => l.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim());
  return createHash('sha1').update(lines.join('|') || output.slice(-300)).digest('hex').slice(0, 10);
}

/** Decide whether another repair attempt is allowed. Pure function so it is unit-tested. */
export function repairDecision(task, signature, limits = DEFAULTS) {
  const reps = task.repairs ?? [];
  if (reps.length >= limits.maxRepairAttempts) return { proceed: false, reason: `repair budget spent (${reps.length}/${limits.maxRepairAttempts})` };
  const tail = reps.slice(-(limits.sameFailureEscalates - 1)).map((r) => r.signature);
  if (limits.sameFailureEscalates > 1 && tail.length === limits.sameFailureEscalates - 1 && tail.every((s) => s === signature))
    return { proceed: false, reason: `same failure (${signature}) survived ${limits.sameFailureEscalates - 1} repair(s) in a row` };
  return { proceed: true, reason: `attempt ${reps.length + 1}/${limits.maxRepairAttempts}` };
}

/** The "ready" gate. Pure function over a task + repo facts so it is unit-tested. */
export function readyGate(task, facts) {
  const problems = [];
  const v = [...(task.verifications ?? [])].pop();
  if (task.risk === 'trivial') { if (!v || !v.passed) problems.push('no passing verification run'); return problems; }
  if (!v) problems.push('no verification run recorded (factory verify)');
  else {
    if (!v.passed) problems.push(`latest verification failed (${v.results.filter((r) => !r.ok).map((r) => r.name).join(', ')})`);
    if (v.sha !== facts.head || facts.dirty) problems.push('code changed after the last verification (re-run factory verify on a clean tree)');
    if (v.tier !== 'full' && !task.allowQuickReady) problems.push('latest verification was not the full tier');
  }
  const reviews = (task.reviews ?? []).filter((r) => r.sha === facts.head);
  if (!reviews.length) problems.push('no independent review recorded for the current commit (factory review)');
  for (const r of reviews) if (r.verdict !== 'pass' || r.p0 > 0 || r.p1 > 0) problems.push(`review by ${r.reviewer} has open findings (P0=${r.p0}, P1=${r.p1})`);
  if (reviews.length && reviews.every((r) => r.reviewer === task.builder)) problems.push('review was by the builder itself');
  if (!(task.acceptance ?? []).length) problems.push('no acceptance criteria recorded');
  return problems;
}

function parseFlags(args) {
  const flags = {}; const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const k = args[i].slice(2);
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) flags[k] = true; else flags[k] = args[++i];
    } else rest.push(args[i]);
  }
  return { flags, rest };
}

const commands = {
  init() {
    mkdirSync(TASKS, { recursive: true });
    const p = join(FACTORY, 'profile.json');
    if (!existsSync(p)) {
      writeFileSync(p, JSON.stringify({
        project: resolve(ROOT).split('/').pop(),
        productionBranches: ['main', 'master', 'production'],
        commands: { typecheck: 'npx tsc --noEmit', unit: 'npm test' },
        tiers: { quick: ['typecheck', 'unit'], full: ['typecheck', 'unit'] },
        preview: null, protectedPaths: [], forbiddenCommands: [], domainReviewers: [],
        limits: DEFAULTS, notes: 'Edit me: see factory/README.md "Adapting to a repository".',
      }, null, 2) + '\n');
      console.log('Wrote .factory/profile.json stub.');
    }
    if (!existsSync(join(FACTORY, 'known-issues.md'))) writeFileSync(join(FACTORY, 'known-issues.md'), '# Known issues and limitations\n\nOne line each: `- [open|fixed] what (task id or evidence)`.\n');
    console.log('Factory scaffolding ready.');
  },

  new(args) {
    const { flags, rest } = parseFlags(args);
    const title = rest.join(' ').trim() || die('Usage: new "<title>" [--kind build|fix|polish|maintain|review] [--risk trivial|normal|high] [--issue N]');
    const id = `T${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slug(title)}`;
    if (existsSync(taskFile(id))) die(`Task already exists: ${id}`);
    mkdirSync(join(taskDir(id), 'evidence'), { recursive: true });
    saveTask({
      id, title, kind: flags.kind ?? 'build', risk: flags.risk ?? 'normal', status: 'planned', created: now(), updated: now(),
      issue: flags.issue ? Number(flags.issue) : null, branch: sh('git rev-parse --abbrev-ref HEAD'), baseSha: head(),
      acceptance: [], builder: null, verifications: [], repairs: [], reviews: [], interventions: [], usage: {}, log: [],
    });
    console.log(id);
  },

  start(args) {
    const [id] = args; const t = readTask(id); const prof = loadProfile();
    const active = allTasks().filter((x) => ACTIVE.includes(x.status) && x.id !== id);
    if (active.length >= prof.limits.maxConcurrentTasks) die(`Concurrency ceiling reached (${active.length}/${prof.limits.maxConcurrentTasks}): ${active.map((x) => x.id).join(', ')}. Finish or park one first.`, 3);
    t.status = 'building'; t.startedAt ??= now(); saveTask(t); console.log(`${id} -> building`);
  },

  accept(args) { // accept <id> "criterion" ...
    const [id, ...crit] = args; const t = readTask(id);
    t.acceptance.push(...crit.filter(Boolean)); saveTask(t); console.log(`${t.acceptance.length} criteria recorded`);
  },

  set(args) {
    const { flags, rest } = parseFlags(args); const [id, status] = rest; const t = readTask(id);
    if (!STATUSES.includes(status)) die(`Status must be one of: ${STATUSES.join(', ')}`);
    if (status === 'ready' || status === 'delivered') {
      const problems = readyGate(t, { head: head(), dirty: dirty() });
      if (problems.length && !(status === 'delivered' && t.status === 'ready')) die(`Refusing "${status}":\n - ${problems.join('\n - ')}`, 4);
    }
    if (flags.builder) t.builder = flags.builder;
    t.status = status; if (flags.note) t.log.push({ at: now(), note: String(flags.note) });
    saveTask(t); console.log(`${id} -> ${status}`);
  },

  note(args) {
    const { flags, rest } = parseFlags(args); const [id, ...text] = rest; const t = readTask(id);
    const entry = { at: now(), note: text.join(' ') };
    (flags.intervention ? t.interventions : t.log).push(entry); saveTask(t);
  },

  usage(args) { // usage <id> --tokens N --usd X --agents N   (accumulates)
    const { flags, rest } = parseFlags(args); const t = readTask(rest[0]);
    for (const k of ['tokens', 'usd', 'agents', 'toolUses']) if (flags[k] !== undefined) t.usage[k] = (t.usage[k] ?? 0) + Number(flags[k]);
    saveTask(t);
  },

  verify(args) {
    const { flags, rest } = parseFlags(args); const [id] = rest; const t = readTask(id); const prof = loadProfile();
    const tier = flags.tier ?? 'quick';
    const names = flags.only ? String(flags.only).split(',') : (prof.tiers?.[tier] ?? die(`Unknown tier ${tier}`));
    const n = t.verifications.length + 1; const logs = join(taskDir(id), 'evidence', `verify-${n}`); mkdirSync(logs, { recursive: true });
    const results = []; const t0 = Date.now();
    for (const name of names) {
      const cmd = prof.commands[name] ?? die(`profile.commands has no "${name}"`);
      const s = Date.now(); const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const out = (r.stdout ?? '') + (r.stderr ?? ''); writeFileSync(join(logs, `${name}.log`), out);
      const tests = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(out);
      const res = { name, cmd, ok: r.status === 0, ms: Date.now() - s, ...(tests ? { testsPassed: Number(tests[2]), testsFailed: Number(tests[1] ?? 0) } : {}), ...(r.status === 0 ? {} : { signature: failureSignature(out) }) };
      results.push(res); console.log(`${res.ok ? 'PASS' : 'FAIL'} ${name} (${(res.ms / 1000).toFixed(1)}s)${res.testsPassed ? ` ${res.testsPassed} tests` : ''}`);
      if (!res.ok && !flags['keep-going']) break;
    }
    const passed = results.length === names.length && results.every((r) => r.ok);
    t.verifications.push({ n, tier, passed, sha: head(), dirty: dirty(), at: now(), ms: Date.now() - t0, results });
    t.status = passed ? 'verifying' : 'repairing'; saveTask(t);
    console.log(passed ? `VERIFIED (run ${n}, ${tier})` : `FAILED (run ${n}); logs in ${logs}. Next: factory repair-check ${id}`);
    process.exit(passed ? 0 : 1);
  },

  'repair-check'(args) { // decide proceed|escalate for the latest failure
    const [id] = args; const t = readTask(id); const prof = loadProfile();
    const v = t.verifications.at(-1); const failed = v?.results.find((r) => !r.ok);
    if (!failed) die('Latest verification has no failure; nothing to repair.');
    const d = repairDecision(t, failed.signature, prof.limits);
    console.log(`${d.proceed ? 'PROCEED' : 'ESCALATE'}: ${d.reason} [failing: ${failed.name}, signature ${failed.signature}]`);
    if (!d.proceed) { t.status = 'escalated'; t.log.push({ at: now(), note: `escalated: ${d.reason}` }); saveTask(t); process.exit(5); }
  },

  'repair-log'(args) { // repair-log <id> "what was tried"
    const [id, ...text] = args; const t = readTask(id);
    const failed = t.verifications.at(-1)?.results.find((r) => !r.ok);
    t.repairs.push({ n: t.repairs.length + 1, at: now(), signature: failed?.signature ?? null, failing: failed?.name ?? null, note: text.join(' ') });
    saveTask(t); console.log(`repair ${t.repairs.length} logged`);
  },

  review(args) { // review <id> --reviewer name --verdict pass|fail --p0 n --p1 n --p2 n [--file path]
    const { flags, rest } = parseFlags(args); const t = readTask(rest[0]);
    if (!flags.reviewer || !['pass', 'fail'].includes(flags.verdict)) die('Usage: review <id> --reviewer <agent> --verdict pass|fail --p0 N --p1 N --p2 N [--file report.md]');
    if (dirty()) die('Working tree has uncommitted changes; commit first so the review is tied to a commit.');
    t.reviews.push({ reviewer: flags.reviewer, verdict: flags.verdict, p0: +flags.p0 || 0, p1: +flags.p1 || 0, p2: +flags.p2 || 0, sha: head(), at: now(), file: flags.file ?? null });
    t.status = 'in-review'; saveTask(t); console.log('review recorded');
  },

  status(args) {
    const { flags } = parseFlags(args); const prof = existsSync(join(FACTORY, 'profile.json')) ? loadProfile() : null;
    const tasks = allTasks(); const facts = { head: head(), dirty: dirty() };
    const out = {
      branch: sh('git rev-parse --abbrev-ref HEAD'), head: facts.head.slice(0, 7), dirty: facts.dirty,
      unpushed: sh('git log @{u}..HEAD --oneline 2>/dev/null').split('\n').filter(Boolean).length,
      ceiling: prof?.limits.maxConcurrentTasks ?? null,
      tasks: tasks.map((t) => {
        const v = t.verifications.at(-1); const flagsOut = [];
        if (['ready', 'delivered'].includes(t.status)) { const p = readyGate(t, facts); if (p.length && t.status === 'ready') flagsOut.push(`CLAIMED READY BUT UNVERIFIED NOW: ${p.join('; ')}`); }
        if (ACTIVE.includes(t.status) && Date.now() - Date.parse(t.updated) > 48 * 3600e3) flagsOut.push('stale >48h');
        return { id: t.id, title: t.title, kind: t.kind, status: t.status, repairs: t.repairs.length, lastVerify: v ? `${v.passed ? 'pass' : 'FAIL'}/${v.tier}@${v.sha.slice(0, 7)}` : 'none', flags: flagsOut };
      }),
      knownIssuesOpen: existsSync(join(FACTORY, 'known-issues.md')) ? (readFileSync(join(FACTORY, 'known-issues.md'), 'utf8').match(/^- \[open\]/gm) ?? []).length : 0,
    };
    if (flags.json) return console.log(JSON.stringify(out, null, 2));
    console.log(`Branch ${out.branch} @ ${out.head}${out.dirty ? ' (uncommitted changes)' : ''}${out.unpushed ? `, ${out.unpushed} unpushed` : ''}; ceiling ${out.ceiling ?? '?'} active task(s); ${out.knownIssuesOpen} open known issue(s)`);
    if (!out.tasks.length) console.log('No tasks recorded.');
    for (const t of out.tasks) console.log(`- ${t.id} [${t.status}] ${t.title} — verify:${t.lastVerify} repairs:${t.repairs}${t.flags.length ? '\n    ! ' + t.flags.join('\n    ! ') : ''}`);
    const next = out.tasks.find((t) => ['repairing', 'escalated'].includes(t.status)) ?? out.tasks.find((t) => ACTIVE.includes(t.status)) ?? out.tasks.find((t) => t.status === 'ready');
    if (next) console.log(`Next: ${{ repairing: 'repair-check then repair', escalated: 'needs a human decision', ready: 'awaiting your approval', building: 'continue/verify', verifying: 'review', 'in-review': 'finish review, then set ready' }[next.status]} → ${next.id}`);
  },

  metrics(args) {
    const t = readTask(args[0]); const vs = t.verifications;
    const m = {
      id: t.id, elapsedMin: Math.round((Date.parse(t.updated) - Date.parse(t.startedAt ?? t.created)) / 6000) / 10,
      verificationRuns: vs.length, verificationPassRate: vs.length ? `${vs.filter((v) => v.passed).length}/${vs.length}` : 'n/a',
      testsPassedLastRun: vs.at(-1)?.results.reduce((a, r) => a + (r.testsPassed ?? 0), 0) ?? 0,
      repairAttempts: t.repairs.length, humanInterventions: t.interventions.length, reviews: t.reviews.length, usage: t.usage, status: t.status,
    };
    console.log(JSON.stringify(m, null, 2));
  },

  issue(args) { // issue "text" — append to known-issues
    appendFileSync(join(FACTORY, 'known-issues.md'), `- [open] ${args.join(' ')}\n`); console.log('recorded');
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!cmd || !commands[cmd]) die(`factory.mjs <${Object.keys(commands).join('|')}>`);
  commands[cmd](args);
}
