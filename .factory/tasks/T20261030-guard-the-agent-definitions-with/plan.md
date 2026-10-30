# Plan: guard the agent definitions
Architect: factory-architect (headless, read-only). Size: small, sequential, one new file.
Add `tests/agents.test.ts` (vitest) that reads `.claude/agents/*.md`, parses flat frontmatter (fail loudly on unknown syntax),
and enforces: valid structure; reviewers (profile domainReviewers + factory-architect/reviewer/qa) read-only by declared tools;
only factory-builder/repair/ui may edit; unknown agents default to read-only. Optional one-line note in docs/agents.md.
Known limit (to report, not fix): Bash lets any agent write files, so the test enforces declared policy; real enforcement is the guard hook.
