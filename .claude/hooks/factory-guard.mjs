#!/usr/bin/env node
// PreToolUse guard. Reads the hook JSON on stdin; exit 2 + stderr message blocks the call.
// Generic rules live here; project rules come from .factory/profile.json (protectedPaths, forbiddenCommands).
// Bash matching is best-effort (commands are free text); permissions.deny in settings.json and GitHub branch
// protection are the other layers. Humans can set FACTORY_ALLOW_PROTECTED=1 when launching Claude to edit guarded files.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { join, relative, isAbsolute, resolve, dirname, basename } from 'node:path';

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/, /xi-api-key\s*[:=]\s*['"]?[A-Za-z0-9]{16,}/i, /AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9/+_-]{24,}['"]/i,
];
const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'production', 'prod', 'release'];
// The profile feeds the guard its project rules and task.json holds the gate's facts, so agents may not edit either.
const ALWAYS_PROTECTED_PATHS = ['.env', '.env.*', '**/.env', '**/.env.*', '.git/**', '.claude/settings.json', '.claude/settings.local.json', '.claude/hooks/**', '.claude/factory/bin/**', '.factory/profile.json', '.factory/tasks/*/task.json'];
// Credential stores, as they appear in a shell command (home-relative or absolute).
const CRED_PATH = String.raw`(?:~|\$HOME|\$\{HOME\}|/home/[^/\s]+|/root|/Users/[^/\s]+)?/?\.(?:ssh|aws|gnupg|kube|azure|docker/config\.json|config/(?:gh|gcloud|hub)|netrc|git-credentials|npmrc|pypirc)\b|(?:^|[\s@='"/])\.env(?:\b|\.)`;

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

// Outside the repository, edits are allowed (scratch folders, temp files) except where credentials or the
// system live. Matched against the absolute path.
const OUTSIDE_REPO_BLOCKED = [
  /(?:^|\/)\.(?:ssh|aws|gnupg|docker|kube|azure)(?:\/|$)/, /(?:^|\/)\.config\/(?:gh|gcloud|hub)(?:\/|$)/,
  /(?:^|\/)\.(?:npmrc|netrc|pypirc|git-credentials|claude\.json)$/, /(?:^|\/)\.env(?:\.[^/]*)?$/,
  /(?:^|\/)\.claude\/(?:settings(?:\.local)?\.json|hooks\/)/, /(?:^|\/)\.gitconfig$/, /(?:^|\/)\.(?:bash|zsh)rc$|(?:^|\/)\.(?:bash_)?profile$/,
  /^\/(?:etc|usr|bin|sbin|boot|sys|proc)(?:\/|$)/,
];

/**
 * Mask the inside of quoted phrases and heredoc bodies so words in a commit message, an echo or a here-document
 * ("don't git push origin main") are not read as commands. Same length as the input so positions still line up.
 * Kept unmasked: single-word quoted arguments ('/', "public/voices/a.mp3"), double-quoted text that expands
 * variables or commands, and anything handed to a shell or eval (bash -c '...', sh <<EOF).
 */
export function maskQuoted(cmd) {
  const out = cmd.split('');
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = '_'; };
  const runsCode = (i) => /(?:\b(?:bash|sh|zsh|dash)\s+-\w*c|\beval|\b(?:node|perl|ruby)\s+-e|\bpython3?\s+-c)\s*$/.test(cmd.slice(0, i));
  let i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === '\\') { i += 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < cmd.length && cmd[j] !== c) { if (c === '"' && cmd[j] === '\\') j++; j++; }
      const body = cmd.slice(i + 1, j);
      const expands = c === '"' && /[$`]/.test(body);
      if (/\s/.test(body) && !expands && !runsCode(i)) blank(i + 1, j);
      i = j + 1; continue;
    }
    const hd = /^<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(cmd.slice(i));
    if (hd) {
      const lineStart = cmd.lastIndexOf('\n', i) + 1;
      const bodyStart = cmd.indexOf('\n', i);
      const markerLine = cmd.slice(i, bodyStart === -1 ? cmd.length : bodyStart);
      const toShell = /\b(?:bash|sh|zsh|dash|eval)\b[^|;&]*$/.test(cmd.slice(lineStart, i)) || /\|\s*(?:\S*\/)?(?:bash|sh|zsh|dash|xargs|node|python3?|perl|ruby)\b/.test(markerLine);
      if (bodyStart === -1) { i += hd[0].length; continue; }
      const endRe = new RegExp(`\\n\\t*${hd[2]}(?=\\n|$)`); const m = endRe.exec(cmd.slice(bodyStart));
      const bodyEnd = m ? bodyStart + m.index : cmd.length;
      if (!toShell) blank(bodyStart + 1, bodyEnd);
      i = m ? bodyEnd + m[0].length : cmd.length; continue;
    }
    i++;
  }
  return out.join('');
}

/** Only the lines a staged diff adds: removing a credential must not be blocked for containing it. */
export function addedLines(diff) {
  return diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
}

function branchRe(branches) { return `(?:${branches.map((b) => b.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})`; }

/** Returns a reason string if the Bash command must be blocked, else null. */
export function checkBash(cmd, ctx) {
  const { protectedBranches, currentBranch, forbidden = [], protectedPaths = [], stagedDiff = '', branchOf } = ctx;
  const B = branchRe(protectedBranches);
  // Project rules (forbiddenCommands) are matched on the raw text, quotes included, and ignore case: SQL in a quoted
  // argument is still SQL.
  for (const raw of cmd.split(/&&|\|\||;|\n/)) for (const f of forbidden) if (new RegExp(f.pattern, 'i').test(raw)) return `Blocked: ${f.reason}`;
  const segs = maskQuoted(cmd).split(/&&|\|\||;|\n/).map((s) => s.trim()).filter((s) => s && !/^_+$/.test(s));
  for (const s of segs) {
    const gitC = /\bgit\s+-C\s+(\S+)/.exec(s);
    const branch = gitC && branchOf ? branchOf(gitC[1].replace(/^['"]|['"]$/g, '')) : currentBranch;
    if (/\bgit\s+(?:-C\s+\S+\s+)?push\b/.test(s)) {
      if (/(?:^|\s)(?:--force(?![-\w])|-f(?![-\w])|--mirror\b|--delete\b)/.test(s)) return 'Blocked: force/mirror/delete pushes are not allowed. Use --force-with-lease on your own feature branch only.';
      if (new RegExp(`(?:\\s|:|/)${B}(?:\\s|$)`).test(s.replace(/^.*git\s+push/, ''))) return `Blocked: pushing to a production branch (${protectedBranches.join('/')}). Push a feature branch and open a pull request.`;
      if (protectedBranches.includes(branch) && !/\S+\s+\S*[:\w/-]+/.test(s.replace(/^.*git\s+push\s*(-u\s*)?/, ''))) return `Blocked: bare "git push" while on ${branch}.`;
    }
    if (/\bgit\s+(?:-C\s+\S+\s+)?(commit|merge|rebase|cherry-pick|revert|reset\s+--hard|pull)\b/.test(s) && protectedBranches.includes(branch)) return `Blocked: ${branch} is a production branch. Create a feature branch first (git switch -c ...).`;
    if (/\bgh\s+pr\s+merge\b|\bgh\s+release\b|\bgh\s+repo\s+delete\b/.test(s)) return 'Blocked: merging/releasing needs human approval.';
    if (/\b(vercel|netlify|firebase|wrangler|fly|flyctl|railway|heroku)\b.*(?:\s|^)(deploy|publish|--prod|promote)(?![\w-])/.test(s) || /\bnpm\s+publish\b/.test(s)) return 'Blocked: production deploys/publishes need human approval.';
    if (/\bsupabase\s+(db\s+(push|reset|remote)|migration\s+(up|repair)|functions\s+deploy|secrets|link)\b/.test(s) || /\b(prisma\s+migrate\s+(deploy|reset)|prisma\s+db\s+push|drizzle-kit\s+(push|migrate)|knex\s+migrate:(latest|rollback)|rails\s+db:migrate|alembic\s+upgrade)\b/.test(s)) return 'Blocked: database migrations need human approval. Write the migration file and describe it in the report.';
    if (/\b(psql|pg_dump|mysql|mongosh)\b.*(supabase\.co|amazonaws|prod|\.neon\.tech|\.planetscale)/.test(s)) return 'Blocked: direct connections to hosted databases are not allowed.';
    if (/\brm\s+(-\w*[rf]\w*\s+)+(["']?)(\/|~|\$HOME|\.git\/?|\.|\*)\2(\s|$)/.test(s) || /\bgit\s+clean\s+-\w*[fdx]/.test(s) && /-\w*x/.test(s)) return 'Blocked: destructive delete.';
    if (new RegExp(String.raw`\b(?:cat|less|more|head|tail|grep|rg|awk|sed|cut|sort|strings|base64|xxd|od|source|cp|scp|rsync|curl|wget|tar|zip|jq)\b[^|;]*?(?:${CRED_PATH})`).test(s)
      || /^\s*(printenv|env|set|export\s+-p|declare\s+-x)\s*$/.test(s) || /\b(?:printenv|env)\b[^|;]*\b\w*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\w*/i.test(s)
      || /\b(?:env|printenv|set)\s*\|\s*(?:grep|rg|cat|tee|curl)/.test(s)
      || /\becho\s+["']?\$\{?\w*(KEY|SECRET|TOKEN|PASSWORD)\w*/i.test(s)) return 'Blocked: reading credentials/environment secrets. Name the variable you need instead.';
    if (/\brg\b[^|;]*(?:\s-\w*u\w*u|\s--no-ignore\b|\s--hidden\b)/.test(s)) return 'Blocked: searching hidden and ignored files can read .env and other credentials. Search tracked files (git grep) or drop -uu/--hidden/--no-ignore.';
    if (/\b(?:curl|wget|http|xh)\b[^|;]*\bhttps?:\/\/[^\s/'"?#]*@/.test(s)) return 'Blocked: a URL with "user@" in its host part can send the request somewhere other than it appears.';
    if (/\bgit\s+add\b.*(?:\s-f\b|--force|\.env)/.test(s)) return 'Blocked: never stage .env files or force-add ignored files.';
    if (/(?:>|>>|\btee\b|\bsed\s+-i\S*|\bmv\b|\bcp\b|\brm\b|\btruncate\b)[^|;&]*/.test(s) && protectedPaths.length) {
      for (const g of protectedPaths) {
        const lit = g.replace(/\/?\*\*.*$/, '').replace(/\*.*$/, '');
        if (lit && lit.length > 2 && s.includes(lit) && /(?:>|>>|\btee\b|\bsed\s+-i|\bmv\b|\brm\b|\btruncate\b)/.test(s)) return `Blocked: modifying protected path "${g}" via shell. Protected assets are only changed by their owner's scripts or by a human.`;
      }
    }
    if (/\bgit\s+commit\b/.test(s)) {
      const added = addedLines(stagedDiff);
      for (const p of SECRET_PATTERNS) { const m = p.exec(added); if (m) return `Blocked: staged changes look like they contain a credential (${p.source.slice(0, 24)}…). Unstage and remove it.`; }
    }
  }
  return null;
}

/** Returns a reason string if the file edit must be blocked, else null. ctx.absPath is the absolute path. */
export function checkEdit(relPath, ctx) {
  const globs = [...ALWAYS_PROTECTED_PATHS, ...(ctx.protectedPaths ?? [])];
  if (relPath === '..' || relPath.startsWith('../')) {
    const abs = ctx.absPath ?? relPath;
    if (OUTSIDE_REPO_BLOCKED.some((re) => re.test(abs))) return `Blocked: ${abs} is outside the repository and holds credentials or system files.`;
  } else if (matchesAny(relPath, globs)) return `Blocked: ${relPath} is protected (credentials, factory guard/settings, or approved project assets). Ask the human; they can relaunch Claude with FACTORY_ALLOW_PROTECTED=1.`;
  if (ctx.content) for (const p of SECRET_PATTERNS) if (p.test(ctx.content)) return `Blocked: the content being written looks like a credential (${p.source.slice(0, 24)}…).`;
  return null;
}

/** The path with symlinks resolved; for a file that does not exist yet, its nearest existing parent is resolved. */
export function realTarget(p) {
  const rest = [];
  for (let cur = p; ; cur = dirname(cur)) {
    try { return join(realpathSync(cur), ...rest.reverse()); } catch { /* not there yet */ }
    if (dirname(cur) === cur) return p;
    rest.push(basename(cur));
  }
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
    const commitIn = /\bgit\s+(?:-C\s+(\S+)\s+)?commit\b/.exec(cmd);
    const diffCwd = commitIn?.[1] ? resolve(cwd, commitIn[1].replace(/^['"]|['"]$/g, '')) : cwd;
    reason = checkBash(cmd, {
      // A profile adds production branches; it cannot remove the defaults.
      protectedBranches: [...new Set([...DEFAULT_PROTECTED_BRANCHES, ...(profile.productionBranches ?? [])])],
      currentBranch: sh('git rev-parse --abbrev-ref HEAD', cwd).trim(),
      branchOf: (dir) => sh('git rev-parse --abbrev-ref HEAD', resolve(cwd, dir)).trim(),
      forbidden: profile.forbiddenCommands ?? [], protectedPaths,
      stagedDiff: commitIn ? sh('git diff --cached -U0', diffCwd) : '',
    });
    if (reason && override && /protected path/.test(reason)) reason = null;
  } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name)) {
    const fp = String(ti.file_path ?? ti.notebook_path ?? ''); if (!fp) process.exit(0);
    // Judge the real target: a symlink inside the repo must not lead an edit into a protected or credential path.
    const abs = realTarget(isAbsolute(fp) ? fp : resolve(root, fp)); const rel = relative(realTarget(root), abs);
    const content = [ti.content, ti.new_string, ti.new_source, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])].filter((x) => typeof x === 'string').join('\n');
    reason = checkEdit(rel, { absPath: abs, protectedPaths, content });
    if (override && reason && /is protected/.test(reason)) reason = null; // path rules only; credential-content rule stays on
  }
  if (reason) { process.stderr.write(`[factory-guard] ${reason}\n`); process.exit(2); }
}
// Compare real file paths: a URL comparison fails for paths with spaces or on Windows, and would silently disable the guard.
if (process.argv[1] && realTarget(resolve(process.argv[1])) === realTarget(fileURLToPath(import.meta.url))) main();
