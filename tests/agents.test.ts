import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Guards the declared policy in .claude/agents/*.md. Bash lets any agent write files, so this
// checks declared tools only; real enforcement is the guard hook (.claude/hooks/factory-guard.mjs).

const ROOT = join(__dirname, '..');
const AGENT_DIR = join(ROOT, '.claude', 'agents');
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
// Add a new agent here only when it is meant to change files.
const MAY_EDIT = ['factory-builder', 'factory-repair', 'factory-ui'];
const FACTORY_READ_ONLY = ['factory-architect', 'factory-reviewer', 'factory-qa'];

type Agent = { file: string; fm: Record<string, string> };

function parseFrontmatter(file: string, text: string): Record<string, string> {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') throw new Error(`${file}: frontmatter must start with '---' on line 1`);
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error(`${file}: frontmatter is not closed with '---'`);
  const fm: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) throw new Error(`${file}: unsupported frontmatter syntax on line ${i + 1}: ${JSON.stringify(lines[i])}`);
    if (m[1] in fm) throw new Error(`${file}: duplicate frontmatter key '${m[1]}'`);
    if (/^[|>]/.test(m[2])) throw new Error(`${file}: multi-line value for '${m[1]}' is not supported`);
    fm[m[1]] = m[2].trim();
  }
  return fm;
}

const files = readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md')).sort();
const agents: Agent[] = files.map((file) => ({ file, fm: parseFrontmatter(file, readFileSync(join(AGENT_DIR, file), 'utf8')) }));
const toolsOf = (a: Agent) => (a.fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const profile = JSON.parse(readFileSync(join(ROOT, '.factory', 'profile.json'), 'utf8'));
const domainReviewers: string[] = profile.domainReviewers.agents;

describe('agent definitions', () => {
  it('finds at least 13 agent files', () => {
    expect(agents.length).toBeGreaterThanOrEqual(13);
  });

  it('every file has non-empty name, description and tools, and the name matches the filename', () => {
    for (const a of agents) {
      for (const key of ['name', 'description', 'tools']) {
        expect(a.fm[key], `${a.file}: missing or empty '${key}'`).toBeTruthy();
      }
      expect(a.fm.name, `${a.file}: name '${a.fm.name}' does not match filename`).toBe(a.file.replace(/\.md$/, ''));
    }
  });

  it('names are unique', () => {
    const names = agents.map((a) => a.fm.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `duplicate agent names: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every profile domain reviewer has an agent file', () => {
    const names = new Set(agents.map((a) => a.fm.name));
    for (const r of domainReviewers) expect(names.has(r), `profile reviewer '${r}' has no .claude/agents/${r}.md`).toBe(true);
  });

  it('reviewers are read-only by declared tools', () => {
    for (const name of [...domainReviewers, ...FACTORY_READ_ONLY]) {
      const a = agents.find((x) => x.fm.name === name);
      expect(a, `${name}: agent file missing`).toBeDefined();
      const extra = toolsOf(a!).filter((t) => !READ_ONLY_TOOLS.includes(t));
      expect(extra, `${a!.file}: reviewer declares non-read-only tools: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('only the builder, repair and ui agents may edit; unknown agents default to read-only', () => {
    for (const a of agents) {
      if (MAY_EDIT.includes(a.fm.name)) continue;
      const editing = toolsOf(a).filter((t) => EDIT_TOOLS.includes(t));
      expect(editing, `${a.file}: not on the may-edit list but declares ${editing.join(', ')}`).toEqual([]);
    }
  });
});
