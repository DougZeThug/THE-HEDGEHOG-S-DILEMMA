# Report: guard the agent definitions with a test

**Outcome:** a new test (`tests/agents.test.ts`, 8 checks) now fails if any agent file in `.claude/agents/` is malformed or if a read-only reviewer is given edit powers. Ready for your review; nothing is merged.

**What changed (plain terms):** the seven specialist reviewers and the factory's architect, QA and reviewer can only look, never edit. Only the builder, repair and UI agents may edit. A new agent defaults to read-only until someone deliberately adds it to the list.

**Evidence**
- Full checks on the final commit: typecheck, lint, 588 unit tests, factory tests (10), production build all passed (`evidence/verify-4/*.log`).
- Mutation checks (the builder and two reviewer rounds each tried to defeat the test): adding `Edit` or `mcp__x__write` to a reviewer, deleting `tools`, renaming `name`, duplicating `tools`, adding `permissionMode: acceptEdits`, `disallowedTools`, `model: opus`, `tools: Read, edit` all make the test fail with a message naming the file.
- No screenshots: the change has no visual behaviour.

**What the process caught**
- The independent reviewer failed the builder's first version (P1): `permissionMode: acceptEdits` on a reviewer would have passed. Repair attempt 1 fixed it plus two P2s; round 2 passed (P0=0, P1=0).

**Not verified / limits**
- The test checks *declared* tools. An agent with Bash can still write files; real enforcement is the guard hook and permissions.
- The round-1 reviewer could not run commands (headless allowlist stall), so it reviewed by reading; round 2 ran the test and its own mutations.
- Open P2: nested folders under `.claude/agents` are not scanned (`known-issues.md`).

**Needs you:** nothing for this change. The factory itself has three open issues listed in `.factory/known-issues.md`; one needs your one-time approval to edit a protected file (ready-gate commit comparison).

**Next:** review the PR; then try `/factory-build` on a real request.
