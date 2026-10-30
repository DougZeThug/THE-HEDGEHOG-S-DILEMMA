#!/usr/bin/env node
// Install the factory into another repository.
//   node factory/install.mjs <target-repo> [--profile generic|floorforge|717rec|nothing-strange-here] [--with-github] [--dry-run]
// Copies portable parts only (agents, skills, guard hook, protocol, CLI, tests); never overwrites an existing profile.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--profile');
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]) : null; };
const dry = !!opt('dry-run'); const profileName = opt('profile') || 'generic';
if (!target) { console.error('Usage: node factory/install.mjs <target-repo> [--profile name] [--with-github] [--dry-run]'); process.exit(1); }
const T = resolve(target);
if (!existsSync(join(T, '.git'))) { console.error(`${T} is not a git repository root.`); process.exit(1); }
const log = (m) => console.log(`${dry ? '[dry-run] ' : ''}${m}`);
const copy = (rel) => { log(`copy ${rel}`); if (!dry) { mkdirSync(dirname(join(T, rel)), { recursive: true }); cpSync(join(SRC, rel), join(T, rel), { recursive: true, filter: (s) => !s.includes('node_modules') }); } };

for (const f of readdirSync(join(SRC, '.claude/agents')).filter((f) => f.startsWith('factory-'))) copy(`.claude/agents/${f}`);
for (const d of readdirSync(join(SRC, '.claude/skills')).filter((d) => d.startsWith('factory-'))) copy(`.claude/skills/${d}`);
copy('.claude/hooks/factory-guard.mjs'); copy('.claude/factory');

// settings: union the permission lists and add the hook; keep everything the target already has
const sp = join(T, '.claude/settings.json'); const base = JSON.parse(readFileSync(join(SRC, '.claude/settings.json'), 'utf8'));
const cur = existsSync(sp) ? JSON.parse(readFileSync(sp, 'utf8')) : {};
const merged = { ...base, ...cur, permissions: { ...base.permissions, ...(cur.permissions ?? {}) }, hooks: { ...(cur.hooks ?? {}) } };
for (const k of ['allow', 'ask', 'deny']) merged.permissions[k] = [...new Set([...(cur.permissions?.[k] ?? []), ...(base.permissions[k] ?? [])])];
const hookCmd = base.hooks.PreToolUse[0].hooks[0].command;
const pre = merged.hooks.PreToolUse ?? [];
if (!JSON.stringify(pre).includes('factory-guard')) pre.push(base.hooks.PreToolUse[0]);
merged.hooks.PreToolUse = pre;
log(`${existsSync(sp) ? 'merge' : 'write'} .claude/settings.json (guard hook: ${hookCmd})`);
if (!dry) { mkdirSync(dirname(sp), { recursive: true }); writeFileSync(sp, JSON.stringify(merged, null, 2) + '\n'); }

// project state: profile (never overwritten), known issues, task dir
const pp = join(T, '.factory/profile.json');
if (existsSync(pp)) log('keep existing .factory/profile.json');
else {
  const tpl = join(SRC, 'factory/templates/profiles', `${profileName}.json`);
  if (!existsSync(tpl)) { console.error(`No profile template "${profileName}".`); process.exit(1); }
  log(`write .factory/profile.json from ${profileName}`); if (!dry) { mkdirSync(join(T, '.factory/tasks'), { recursive: true }); cpSync(tpl, pp); }
}
if (!dry) { mkdirSync(join(T, '.factory/tasks'), { recursive: true }); writeFileSync(join(T, '.factory/tasks/.gitkeep'), ''); }
const ki = join(T, '.factory/known-issues.md');
if (!existsSync(ki) && !dry) writeFileSync(ki, '# Known issues and limitations\n\nOne line each: `- [open|fixed] what (task id or evidence)`.\n');

// CLAUDE.md pointer (short; the protocol is not duplicated here)
const cm = join(T, 'CLAUDE.md'); const marker = '## AI software factory';
const section = `\n${marker}\n\nUse \`/factory-build\`, \`/factory-fix\`, \`/factory-review\`, \`/factory-polish\`, \`/factory-status\`, \`/factory-maintain\`. Procedure: \`.claude/factory/protocol.md\`. Project settings (commands, protected paths, reviewers): \`.factory/profile.json\`. State: \`.factory/tasks/\`. Run \`node --test .claude/factory/test/\` after changing the factory.\n`;
if (!existsSync(cm) || !readFileSync(cm, 'utf8').includes(marker)) { log('append factory section to CLAUDE.md'); if (!dry) writeFileSync(cm, (existsSync(cm) ? readFileSync(cm, 'utf8') : '# Project notes\n') + section); }

if (opt('with-github')) for (const f of readdirSync(join(SRC, 'factory/templates/github'))) { log(`copy .github/workflows/${f} (inert until repo variable is set)`); if (!dry) { mkdirSync(join(T, '.github/workflows'), { recursive: true }); cpSync(join(SRC, 'factory/templates/github', f), join(T, '.github/workflows', f)); } }
console.log(`\nDone. Next: edit .factory/profile.json (commands, protectedPaths), open Claude Code in ${T} once to accept workspace trust, then try /factory-status.`);
