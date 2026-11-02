// Run: node --test .claude/factory/test/factory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBash, checkEdit, globToRegex, maskQuoted, addedLines, realTarget } from '../../hooks/factory-guard.mjs';

process.env.FACTORY_ROOT = process.cwd();
const { repairDecision, readyGate, failureSignature } = await import('../bin/factory.mjs');

const FAKE_KEY = ['sk', 'x'.repeat(30)].join('-'); // built at runtime so the test file itself never looks like a leaked key
const ctx = { protectedBranches: ['main', 'production'], currentBranch: 'feat/x', forbidden: [{ pattern: 'generate-voices\\.mjs(?!.*--dry-run)', reason: 'paid' }], protectedPaths: ['public/voices/**'], stagedDiff: '' };

test('guard blocks production pushes, force pushes, merges, deploys, migrations', () => {
  for (const c of ['git push origin main', 'git push -u origin HEAD:main', 'git push --force origin feat/x', 'git push -f', 'gh pr merge 3', 'vercel --prod', 'vercel deploy --prod', 'npm publish', 'supabase db push', 'npx prisma migrate deploy', 'cat .env', 'printenv', 'echo $ELEVENLABS_API_KEY', 'rm -rf /', 'git add .env', 'node scripts/generate-voices.mjs --batch 3', 'echo x > public/voices/a.mp3', 'sed -i s/a/b/ public/voices/a.json'])
    assert.ok(checkBash(c, ctx), `should block: ${c}`);
});
test('guard allows ordinary work', () => {
  for (const c of ['git push -u origin claude/feature-1', 'git push --force-with-lease origin feat/x', 'git commit -m "x"', 'npx vitest run', 'npm run build && npm test', 'node scripts/generate-voices.mjs --dry-run', 'git switch -c feat/y', 'cat src/main.ts', 'rm -rf node_modules/.vite', 'echo hi > /tmp/x'])
    assert.equal(checkBash(c, ctx), null, `should allow: ${c}`);
});
test('guard blocks committing on a production branch', () => {
  assert.ok(checkBash('git commit -m x', { ...ctx, currentBranch: 'main' }));
  assert.ok(checkBash('git push', { ...ctx, currentBranch: 'main' }));
});
test('guard scans staged diff for credentials', () => {
  const diff = `+const k = "${FAKE_KEY}"`;
  assert.ok(checkBash('git commit -m x', { ...ctx, stagedDiff: diff }));
  assert.equal(checkBash('git commit -m x', { ...ctx, stagedDiff: '+const a = 1' }), null);
});
test('guard lets a commit remove a credential (only added lines are scanned)', () => {
  const diff = `--- a/src/k.ts\n+++ b/src/k.ts\n-const k = "${FAKE_KEY}"\n+const k = process.env.KEY`;
  assert.equal(checkBash('git commit -m "use env"', { ...ctx, stagedDiff: diff }), null);
  assert.equal(addedLines(diff), 'const k = process.env.KEY');
});
test('guard ignores command words inside quoted prose and heredocs', () => {
  for (const c of [
    'git commit -m "Docs: never git push origin main or vercel --prod"',
    "git commit -m 'explain why rm -rf / is blocked; git push --force too'",
    'echo "do not run supabase db push" >> notes.md',
    'git commit -m "update public/voices notes"',
    "cat > notes.md <<'EOF'\ngit push --force origin main\nnpm publish\nEOF",
    'git commit -F - <<EOF\nWhy gh pr merge needs a human\nEOF',
    'node .claude/factory/bin/factory.mjs note T1 "checked that npm publish is blocked"',
    'gh pr create --title "Guard: block git push origin main" --body "never vercel --prod"',
  ]) assert.equal(checkBash(c, ctx), null, `should allow: ${c}`);
  for (const c of [
    "bash -c 'git push --force origin feat/x'",
    'sh -c "npm publish"',
    "bash <<'EOF'\ngit push --force\nEOF",
    'echo x > "public/voices/a.mp3"',
    'rm -rf "/"',
    "cat <<'EOF' | env bash\ngit push --force\nEOF",
    "cat <<EOF | sudo sh\nnpm publish\nEOF",
    'echo "git push --force origin feat/x" | env bash',
    'env bash -c "npm publish"',
    'cat "/home/My Name/.ssh/id_ed25519"',
    'cp "/Users/a b/.aws/credentials" /tmp/x',
    'git commit -m "x" && git push origin main',
    'echo "$ELEVENLABS_API_KEY"',
  ]) assert.ok(checkBash(c, ctx), `should block: ${c}`);
  assert.equal(maskQuoted('a "b c" d').length, 'a "b c" d'.length);
});
test('guard: heredocs fed to a shell, git -C, credential reads, hidden search, URL userinfo, quoted SQL', () => {
  for (const c of [
    "cat <<'EOF' | bash\ngit push --force origin feat/x\nEOF",
    'cat <<EOF | sh -s\nnpm publish\nEOF',
    'git -C ../other commit -m x',
    'cat ~/.aws/credentials', 'cat /home/u/.ssh/id_ed25519', 'cat $HOME/.config/gh/hosts.yml', 'base64 .env', 'curl -s http://localhost:4173 -d @.env',
    'printenv ELEVENLABS_API_KEY', 'env | grep KEY',
    'rg -uuu KEY .', 'rg --hidden --no-ignore token',
    'curl -s http://localhost@attacker.example/x',
  ]) assert.ok(checkBash(c, { ...ctx, branchOf: (d) => (d === '../other' ? 'main' : 'feat/x') }), `should block: ${c}`);
  assert.ok(checkBash('mv new.psd art/old.psd', { ...ctx, protectedPaths: ['**/*.psd'] }), 'glob without a literal prefix');
  assert.ok(checkBash('rm src/ui/hero.psd', { ...ctx, protectedPaths: ['**/*.psd'] }));
  assert.equal(checkBash('rm src/ui/hero.png', { ...ctx, protectedPaths: ['**/*.psd'] }), null);
  for (const c of ['git -C ../other commit -m x', 'rg TODO src', 'curl -s http://localhost:4173/', 'cat src/env.ts', 'printenv PATH'])
    assert.equal(checkBash(c, { ...ctx, branchOf: () => 'feat/x' }), null, `should allow: ${c}`);
  const sql = { ...ctx, forbidden: [{ pattern: 'DELETE\\s+FROM|DROP\\s+TABLE', reason: 'destructive SQL' }] };
  for (const c of ['psql -c "delete from games where 1=1"', "psql -c 'DROP TABLE teams'"]) assert.ok(checkBash(c, sql), `should block: ${c}`);
});
test('edit guard follows symlinks to their real target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  mkdirSync(join(dir, 'repo')); mkdirSync(join(dir, 'secret', '.ssh'), { recursive: true });
  symlinkSync(join(dir, 'secret', '.ssh'), join(dir, 'repo', 'keys'));
  const abs = realTarget(join(dir, 'repo', 'keys', 'authorized_keys'));
  assert.match(abs, /secret\/\.ssh\/authorized_keys$/);
  assert.ok(checkEdit('../secret/.ssh/authorized_keys', { absPath: abs, protectedPaths: [] }));
});
test('guard hook runs from a path with spaces (and blocks)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard space-'));
  const hook = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'factory-guard.mjs');
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true }); cpSync(hook, join(dir, '.claude', 'hooks', 'factory-guard.mjs'));
  const r = spawnSync('node', [join(dir, '.claude', 'hooks', 'factory-guard.mjs')], { input: JSON.stringify({ tool_name: 'Bash', cwd: dir, tool_input: { command: 'npm publish' } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /factory-guard/);
});
test('guard hook scans MultiEdit content for credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  const hook = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'factory-guard.mjs');
  const r = spawnSync('node', [hook], { input: JSON.stringify({ tool_name: 'MultiEdit', cwd: dir, tool_input: { file_path: join(dir, 'a.ts'), edits: [{ old_string: 'x', new_string: `const k = "${FAKE_KEY}"` }] } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  assert.equal(r.status, 2, r.stderr);
});
test('edit guard protects secrets, hooks, settings, and profile paths', () => {
  const c = { protectedPaths: ['public/voices/**', 'references/**'] };
  for (const p of ['.env', 'a/.env.local', '.claude/settings.json', '.claude/hooks/factory-guard.mjs', 'public/voices/dialogue/a.mp3', 'references/woodland/x.png'])
    assert.ok(checkEdit(p, c), `should block ${p}`);
  // Outside the repo: scratch and temp files are fine, credential and system locations are not.
  for (const a of ['/etc/passwd', '/home/u/.ssh/id_ed25519', '/home/u/.aws/credentials', '/home/u/.npmrc', '/home/u/.config/gh/hosts.yml', '/home/u/other/.env', '/home/u/.claude/settings.json'])
    assert.ok(checkEdit('../x', { ...c, absPath: a }), `should block ${a}`);
  for (const a of ['/tmp/claude-0/scratchpad/run-agent.sh', '/tmp/x.txt', '/home/u/other-repo/src/a.ts'])
    assert.equal(checkEdit('../x', { ...c, absPath: a }), null, `should allow ${a}`);
  assert.ok(checkEdit('../tmp/x.ts', { ...c, absPath: '/tmp/x.ts', content: `const k = "${FAKE_KEY}"` }), 'credential content is blocked anywhere');
  for (const p of ['.factory/profile.json', '.factory/tasks/T1-x/task.json'])
    assert.ok(checkEdit(p, c), `agents may not edit the guard's rules or the gate's facts: ${p}`);
  for (const p of ['src/App.ts', '.factory/tasks/T1-x/plan.md', 'docs/x.md', '.claude/agents/factory-builder.md'])
    assert.equal(checkEdit(p, c), null, `should allow ${p}`);
  assert.ok(checkEdit('src/a.ts', { ...c, content: `const k = "${FAKE_KEY}"` }));
});
test('glob matching', () => {
  assert.ok(globToRegex('public/**/*.mp3').test('public/a/b/c.mp3'));
  assert.ok(globToRegex('public/**/*.mp3').test('public/c.mp3'));
  assert.ok(!globToRegex('public/*.mp3').test('public/a/c.mp3'));
});

test('repair budget and repeated-failure escalation', () => {
  const lim = { maxRepairAttempts: 3, sameFailureEscalates: 2 };
  const t = (sigs) => ({ repairs: sigs.map((s) => ({ signature: s })) });
  assert.equal(repairDecision(t([]), 'a', lim).proceed, true);
  assert.equal(repairDecision(t(['a']), 'b', lim).proceed, true);
  assert.equal(repairDecision(t(['a']), 'a', lim).proceed, false, 'same failure twice escalates');
  assert.equal(repairDecision(t(['a', 'b', 'c']), 'd', lim).proceed, false, 'budget spent');
});
test('failure signature ignores numbers but not content', () => {
  assert.equal(failureSignature('Error: x at line 10'), failureSignature('Error: x at line 99'));
  assert.notEqual(failureSignature('Error: x'), failureSignature('Error: y'));
});
test('ready gate demands verification, current commit, independent review, acceptance', () => {
  const facts = { head: 'abc', dirty: false };
  const good = { risk: 'normal', builder: 'factory-builder', acceptance: ['x'], verifications: [{ passed: true, tier: 'full', sha: 'abc', results: [] }], reviews: [{ reviewer: 'factory-reviewer', verdict: 'pass', p0: 0, p1: 0, sha: 'abc' }] };
  assert.deepEqual(readyGate(good, facts), []);
  assert.ok(readyGate({ ...good, verifications: [] }, facts).length);
  assert.ok(readyGate(good, { head: 'def', dirty: false }).length, 'stale verification');
  assert.ok(readyGate(good, { head: 'abc', dirty: true }).length, 'dirty tree');
  assert.ok(readyGate({ ...good, reviews: [] }, facts).length);
  assert.ok(readyGate({ ...good, reviews: [{ ...good.reviews[0], p1: 1 }] }, facts).length, 'open P1');
  assert.ok(readyGate({ ...good, reviews: [{ ...good.reviews[0], reviewer: 'factory-builder' }] }, facts).length, 'self-review');
  assert.ok(readyGate({ ...good, acceptance: [] }, facts).length);
  assert.ok(readyGate({ ...good, verifications: [{ ...good.verifications[0], tier: 'quick' }] }, facts).length, 'quick tier is not enough');
  assert.ok(readyGate({ ...good, verifications: [{ ...good.verifications[0], dirty: true }] }, facts).length, 'verified on uncommitted changes');
  assert.ok(readyGate({ ...good, verifications: [{ ...good.verifications[0], partial: true }] }, facts).length, '--only run is not the full tier');
  const ran = (...names) => ({ ...good, verifications: [{ ...good.verifications[0], results: names.map((name) => ({ name, ok: true })) }] });
  assert.ok(readyGate(ran('ok'), { ...facts, requiredChecks: ['ok', 'bad'] }).length, 'a full check missing');
  assert.deepEqual(readyGate(ran('ok', 'bad'), { ...facts, requiredChecks: ['ok', 'bad'] }), []);
  const moved = { ...good, verifications: [{ ...good.verifications[0], sha: 'rec', codeSha: 'abc' }], reviews: [{ ...good.reviews[0], sha: 'rec', codeSha: 'abc' }] };
  assert.deepEqual(readyGate(moved, facts), [], 'records matched on the code commit, not HEAD');
});

test('CLI end to end in a scratch repo: ceiling, failing verify, escalation, ready refusal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-'));
  const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'factory.mjs');
  const run = (...a) => spawnSync('node', [bin, ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, FACTORY_ROOT: dir } });
  execSync('git init -q -b work && git config user.email a@b.c && git config user.name t && git commit -q --allow-empty -m init', { cwd: dir });
  assert.equal(run('init').status, 0);
  writeFileSync(join(dir, '.factory', 'profile.json'), JSON.stringify({ project: 't', commands: { ok: 'true', bad: 'echo "Error: boom 42"; exit 1' }, tiers: { quick: ['ok'], full: ['ok', 'bad'] }, limits: { maxConcurrentTasks: 1, maxRepairAttempts: 3, sameFailureEscalates: 2 } }));
  const id1 = run('new', 'First thing').stdout.trim(); const id2 = run('new', 'Second thing').stdout.trim();
  assert.equal(run('start', id1).status, 0);
  assert.equal(run('start', id2).status, 3, 'concurrency ceiling');
  assert.equal(run('verify', id1, '--tier', 'full').status, 1, 'failing verify exits 1');
  assert.match(run('repair-check', id1).stdout, /PROCEED/);
  run('repair-log', id1, 'tried A');
  run('verify', id1, '--tier', 'full');
  run('repair-log', id1, 'tried B');
  run('verify', id1, '--tier', 'full');
  const rc = run('repair-check', id1);
  assert.equal(rc.status, 5, 'same failure escalates'); assert.match(rc.stdout, /ESCALATE/);
  assert.equal(run('set', id1, 'ready').status, 4, 'ready is refused');
  assert.match(run('status').stdout, /escalated/);
});

test('CLI: --only cannot stand in for the full tier; committing task records keeps ready valid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-'));
  const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'factory.mjs');
  const run = (...a) => spawnSync('node', [bin, ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, FACTORY_ROOT: dir } });
  const git = (c) => execSync(c, { cwd: dir, encoding: 'utf8' });
  git('git init -q -b work && git config user.email a@b.c && git config user.name t && git commit -q --allow-empty -m init');
  run('init');
  const prof = (full) => writeFileSync(join(dir, '.factory', 'profile.json'), JSON.stringify({ project: 't', commands: { ok: 'true', bad: 'exit 1' }, tiers: { quick: ['ok'], full }, limits: { maxConcurrentTasks: 1, maxRepairAttempts: 3, sameFailureEscalates: 2 } }));
  prof(['ok', 'bad']);
  writeFileSync(join(dir, 'a.txt'), 'a'); git('git add -A && git commit -qm code');
  const id = run('new', 'Thing').stdout.trim(); run('start', id); run('accept', id, 'works');
  git('git add -A && git commit -qm records');
  assert.equal(run('verify', id, '--tier', 'full', '--only', 'ok').status, 0);
  git('git add -A && git commit -qm records');
  assert.equal(run('review', id, '--reviewer', 'factory-reviewer', '--verdict', 'pass').status, 0);
  git('git add -A && git commit -qm records');
  const refused = run('set', id, 'ready');
  assert.equal(refused.status, 4, 'partial full run refused'); assert.match(refused.stderr, /--only/);
  prof(['ok']); // now the full tier really is just "ok"
  git('git add -A && git commit -qm records');
  assert.equal(run('verify', id, '--tier', 'full').status, 0);
  git('git add -A && git commit -qm "task records"');
  assert.equal(run('review', id, '--reviewer', 'factory-reviewer', '--verdict', 'pass').status, 0);
  git('git add -A && git commit -qm "task records"');
  const ok = run('set', id, 'ready');
  assert.equal(ok.status, 0, ok.stderr);
  git('git add -A && git commit -qm "task records"');
  assert.doesNotMatch(run('status').stdout, /UNVERIFIED/, 'committing records after ready is not a false alarm');
  writeFileSync(join(dir, 'a.txt'), 'b'); git('git add -A && git commit -qm "code change"');
  assert.match(run('status').stdout, /UNVERIFIED/, 'a real code change still invalidates ready');
});
