// Run: node --test .claude/factory/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBash, checkEdit, globToRegex } from '../../hooks/factory-guard.mjs';

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
test('edit guard protects secrets, hooks, settings, and profile paths', () => {
  const c = { protectedPaths: ['public/voices/**', 'references/**'] };
  for (const p of ['.env', 'a/.env.local', '.claude/settings.json', '.claude/hooks/factory-guard.mjs', 'public/voices/dialogue/a.mp3', 'references/woodland/x.png', '../etc/passwd'])
    assert.ok(checkEdit(p, c), `should block ${p}`);
  for (const p of ['src/App.ts', '.factory/profile.json', 'docs/x.md', '.claude/agents/factory-builder.md'])
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
