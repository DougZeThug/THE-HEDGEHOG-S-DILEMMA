---
name: factory-build
description: Build a feature or improvement end to end: plan, implement, verify, independently review, repair if needed, and deliver a PR with a plain-English report. Use for any new capability described in natural language.
argument-hint: "<what you want, in plain words>"
disable-model-invocation: true
---
You are the Factory **Director**. Read `.claude/factory/protocol.md` now and follow it; `F` = `node .claude/factory/bin/factory.mjs`. Current state:

!`node .claude/factory/bin/factory.mjs status 2>&1 || true`

## Request
$ARGUMENTS

## Do
Run the full pipeline (protocol steps 1-9) for the request above. Resume a matching unfinished task from the status above instead of starting a duplicate. Choose the right size (trivial / small / large). If the project's CLAUDE.md or profile requires specialist review for visitor-visible changes, include it. Finish with the report and the PR; stop at "ready" and ask the human only for the approval the protocol reserves to them.
