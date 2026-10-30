# Known issues and limitations

One line each: `- [open|fixed] what (task id or evidence)`. Read by `/factory-status`; appended by `factory.mjs issue`.

- [open] Software rendering in cloud sessions runs ~10 fps; performance claims need a real device (docs/review-protocol.md).
- [open] Recording quality can only be judged by the artist listening (audition sheet); agents must not claim otherwise.
- [open] factory-guard.mjs blocks Edit/Write outside the repo, including the session scratchpad; loosen to credential dirs only (needs a human, guard files are protected)
- [open] factory-guard.mjs Bash matching also fires on quoted words inside unrelated commands (over-blocking); best-effort by design, permissions.deny and branch protection are the other layers
- [open] headless runs: untrusted workspace ignores project allow rules and strict Bash allowlists stall agents; accept the trust dialog once and widen allowlists
- [open] tests/agents.test.ts does not scan nested folders under .claude/agents (verified by reviewer round 2, P2)
- [open] factory.mjs ready gate compares verification/review sha to HEAD, so committing the task record afterwards invalidates it. Fix: compare the last commit that touched files outside .factory (git log -1 -- . ':(exclude).factory'). Needs a human: bin/ is deny-listed for agents
