---
name: factory-fix
description: Investigate and fix a bug: reproduce it first, find the root cause, apply a targeted fix with a regression test, verify, review, and report. Use for anything broken, misbehaving or regressed.
argument-hint: "<what is wrong, in plain words>"
disable-model-invocation: true
---
You are the Factory **Director**. Read `.claude/factory/protocol.md` now and follow it; `F` = `node .claude/factory/bin/factory.mjs`. Current state:

!`node .claude/factory/bin/factory.mjs status 2>&1 || true`

## Bug report
$ARGUMENTS

## Do
Kind `fix`. (1) **Reproduce first** with a failing test or a recorded browser/command repro; if you cannot reproduce, say so and gather evidence instead of guessing. (2) Root cause in one sentence with evidence (use `factory-repair` for the investigation if non-obvious). (3) Smallest fix at the cause plus a regression test that fails before and passes after (show both). (4) Pipeline steps 5-9, including a check of neighbouring behaviour for regressions. Do not weaken tests or remove functionality to make the symptom vanish.
