#!/usr/bin/env node
// PreToolUse guard. Reads the hook JSON on stdin; exit 2 + stderr message blocks the call.
// Generic rules live here; project rules come from .factory/profile.json (protectedPaths, forbiddenCommands).
// Bash matching is best-effort (commands are free text); permissions.deny in settings.json and GitHub branch
// protection are the other layers. Humans can set FACTORY_ALLOW_PROTECTED=1 when launching Claude to edit guarded files.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative, isAbsolute } from 'node:path';

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/, /xi-api-key\s*[:=]\s*['"]?[A-Za-z0-9]{16,}/i, /AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9/+_-]{24,}['"]/i,
];
const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'production', 'prod', 'release'];
const ALWAYS_PROTECTED_PATHS = ['.env', '.env.*', '**/.env', '**/.env.*', '.git/**', '.claude/settings.json', '.claude/settings.local.json', '.claude/hooks/**', '.claude/factory/bin/**'];

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) { return globs.some((g) => globToRegex(g).test(path)); }

function branchRe(branches) { return `(?:${branches.map((b) => b.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})`; }

/** Returns a reason string if the Bash command must be blocked, else null. */
export function checkBash(cmd, ctx) {
  const { protectedBranches, currentBranch, forbidden = [], protectedPaths = [], stagedDiff = '' } = ctx;
  const B = branchRe(protectedBranches);
  const segs = cmd.split(/&&|\|\||;|\n/).map((s) => s.trim()).filter(Boolean);
  for (const s of segs) {
    if (/\bgit\s+(?:-C\s+\S+\s+)?push\b/.test(s)) {
      if (/(?:^|\s)(?:--force(?![-\w])|-f(?![-\w])|--mirror\b|--delete\b)/.test(s)) return 'Blocked: force/mirror/delete pushes are not allowed. Use --force-with-lease on your own feature branch only.';
      if (new RegExp(`(?:\\s|:|/)${B}(?:\\s|$)`).test(s.replace(/^.*git\s+push/, ''))) return `Blocked: pushing to a production branch (${protectedBranches.join('/')}). Push a feature branch and open a pull request.`;
      if (protectedBranches.includes(currentBranch) && !/\S+\s+\S*[:\w/-]+/.test(s.replace(/^.*git\s+push\s*(-u\s*)?/, ''))) return `Blocked: bare "git push" while on ${currentBranch}.`;
    }
    if (/\bgit\s+(commit|merge|rebase|cherry-pick|revert|reset\s+--hard)\b/.test(s) && protectedBranches.includes(currentBranch)) return `Blocked: ${currentBranch} is a production branch. Create a feature branch first (git switch -c ...).`;
    if (/\bgh\s+pr\s+merge\b|\bgh\s+release\b|\bgh\s+repo\s+delete\b/.test(s)) return 'Blocked: merging/releasing needs human approval.';
    if (/\b(vercel|netlify|firebase|wrangler|fly|flyctl|railway|heroku)\b.*(?:\s|^)(deploy|publish|--prod|promote)(?![\w-])/.test(s) || /\bnpm\s+publish\b/.test(s)) return 'Blocked: production deploys/publishes need human approval.';
    if (/\bsupabase\s+(db\s+(push|reset|remote)|migration\s+(up|repair)|functions\s+deploy|secrets|link)\b/.test(s) || /\b(prisma\s+migrate\s+(deploy|reset)|prisma\s+db\s+push|drizzle-kit\s+(push|migrate)|knex\s+migrate:(latest|rollback)|rails\s+db:migrate|alembic\s+upgrade)\b/.test(s)) return 'Blocked: database migrations need human approval. Write the migration file and describe it in the report.';
    if (/\b(psql|pg_dump|mysql|mongosh)\b.*(supabase\.co|amazonaws|prod|\.neon\.tech|\.planetscale)/.test(s)) return 'Blocked: direct connections to hosted databases are not allowed.';
    if (/\brm\s+(-\w*[rf]\w*\s+)+(\/|~|\$HOME|\.git\/?|\.|\*)(\s|$)/.test(s) || /\bgit\s+clean\s+-\w*[fdx]/.test(s) && /-\w*x/.test(s)) return 'Blocked: destructive delete.';
    if (/\b(cat|less|more|head|tail|grep|source|printenv|env)\b[^|;]*\s(~\/\.ssh|\.env\b|\.env\.|\.aws\/credentials|\.npmrc)/.test(s) || /^\s*(printenv|env)\s*$/.test(s) || /\becho\s+["']?\$\{?\w*(KEY|SECRET|TOKEN|PASSWORD)\w*/i.test(s)) return 'Blocked: reading credentials/environment secrets. Name the variable you need instead.';
    if (/\bgit\s+add\b.*(?:\s-f\b|--force|\.env)/.test(s)) return 'Blocked: never stage .env files or force-add ignored files.';
    if (/(?:>|>>|\btee\b|\bsed\s+-i\S*|\bmv\b|\bcp\b|\brm\b|\btruncate\b)[^|;&]*/.test(s) && protectedPaths.length) {
      for (const g of protectedPaths) {
        const lit = g.replace(/\/?\*\*.*$/, '').replace(/\*.*$/, '');
        if (lit && lit.length > 2 && s.includes(lit) && /(?:>|>>|\btee\b|\bsed\s+-i|\bmv\b|\brm\b|\btruncate\b)/.test(s)) return `Blocked: modifying protected path "${g}" via shell. Protected assets are only changed by their owner's scripts or by a human.`;
      }
    }
    if (/\bgit\s+commit\b/.test(s)) {
      for (const p of SECRET_PATTERNS) { const m = p.exec(stagedDiff); if (m) return `Blocked: staged changes look like they contain a credential (${p.source.slice(0, 24)}…). Unstage and remove it.`; }
    }
    for (const f of forbidden) if (new RegExp(f.pattern).test(s)) return `Blocked: ${f.reason}`;
  }
  return null;
}

/** Returns a reason string if the file edit must be blocked, else null. */
export function checkEdit(relPath, ctx) {
  const globs = [...ALWAYS_PROTECTED_PATHS, ...(ctx.protectedPaths ?? [])];
  if (relPath.startsWith('../')) return `Blocked: ${relPath} is outside the repository.`;
  if (matchesAny(relPath, globs)) return `Blocked: ${relPath} is protected (credentials, factory guard/settings, or approved project assets). Ask the human; they can relaunch Claude with FACTORY_ALLOW_PROTECTED=1.`;
  if (ctx.content) for (const p of SECRET_PATTERNS) if (p.test(ctx.content)) return `Blocked: the content being written looks like a credential (${p.source.slice(0, 24)}…).`;
  return null;
}

function sh(cmd, cwd) { try { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16e6 }); } catch { return ''; } }

function main() {
  let input; try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  let profile = {}; const pf = join(root, '.factory', 'profile.json');
  if (existsSync(pf)) try { profile = JSON.parse(readFileSync(pf, 'utf8')); } catch { /* a broken profile must not disable the generic rules */ }
  const protectedPaths = profile.protectedPaths ?? [];
  const override = process.env.FACTORY_ALLOW_PROTECTED === '1';
  const ti = input.tool_input ?? {}; let reason = null;
  if (input.tool_name === 'Bash') {
    const cmd = String(ti.command ?? ''); const cwd = input.cwd || root;
    reason = checkBash(cmd, {
      protectedBranches: profile.productionBranches ?? DEFAULT_PROTECTED_BRANCHES,
      currentBranch: sh('git rev-parse --abbrev-ref HEAD', cwd).trim(),
      forbidden: profile.forbiddenCommands ?? [], protectedPaths,
      stagedDiff: /\bgit\s+commit\b/.test(cmd) ? sh('git diff --cached -U0', cwd) : '',
    });
    if (reason && override && /protected path/.test(reason)) reason = null;
  } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name)) {
    const fp = String(ti.file_path ?? ti.notebook_path ?? ''); if (!fp) process.exit(0);
    const rel = isAbsolute(fp) ? relative(root, fp) : fp;
    reason = checkEdit(rel, { protectedPaths, content: String(ti.content ?? ti.new_string ?? '') });
    if (override && reason && /is protected/.test(reason)) reason = null; // path rules only; credential-content rule stays on
  }
  if (reason) { process.stderr.write(`[factory-guard] ${reason}\n`); process.exit(2); }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
