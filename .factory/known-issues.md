# Known issues and limitations

One line each: `- [open|fixed] what (task id or evidence)`. Read by `/factory-status`; appended by `factory.mjs issue`.

- [open] Software rendering in cloud sessions runs ~10 fps; performance claims need a real device (docs/review-protocol.md).
- [open] Recording quality can only be judged by the artist listening (audition sheet); agents must not claim otherwise.
- [fixed] factory-guard.mjs blocks Edit/Write outside the repo, including the session scratchpad; loosen to credential dirs only (needs a human, guard files are protected)
- [fixed] factory-guard.mjs Bash matching also fires on quoted words inside unrelated commands (over-blocking); best-effort by design, permissions.deny and branch protection are the other layers
- [open] headless runs: untrusted workspace ignores project allow rules and strict Bash allowlists stall agents; accept the trust dialog once and widen allowlists
- [fixed] tests/agents.test.ts now fails if .claude/agents has subfolders, and checks every may-edit agent exists (cubic review, PR #54)
- [fixed] factory.mjs ready gate compares verification/review sha to HEAD, so committing the task record afterwards invalidates it. Fix: compare the last commit that touched files outside .factory (git log -1 -- . ':(exclude).factory'). Needs a human: bin/ is deny-listed for agents
- [fixed] factory.mjs `verify --tier full --only X` counted as a full verification; partial runs are now flagged and the gate requires every full-tier check (Codex review, PR #54)
- [fixed] factory.mjs ready gate accepted a verification recorded on a dirty tree (Codex review, PR #54)
- [fixed] factory-guard.mjs credential scan blocked commits that remove a secret; it now scans added lines only (Codex review, PR #54)
- [open] Read-only agents (factory-architect, factory-qa, factory-reviewer, the 7 specialists) have Bash, which can write files; the guard does not tell agents apart, so read-only is by instruction (cubic review, PR #54)
- [open] An agent with Bash can still write .factory/tasks/*/task.json or .factory/profile.json directly; only Edit/Write are blocked (cubic review, PR #54)
- [fixed] Guard: heredoc piped into a shell, git -C on a production branch, home/absolute credential paths, printenv NAME, rg -uu, curl user@host URLs, quoted/lowercase SQL in forbiddenCommands, symlinked edit targets, MultiEdit/NotebookEdit content, guard silently off in paths with spaces (cubic review, PR #54)
- [fixed] Workflow templates: CI repair limited to same-repo branches, checks out the failed commit and skips if the branch moved; issue queue only for issues by owners/members/collaborators; no persisted token during npm ci (cubic review, PR #54; still untested)
