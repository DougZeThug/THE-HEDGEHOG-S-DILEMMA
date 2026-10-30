---
name: factory-polish
description: Evaluate and refine an existing screen, interaction or feature (layout, spacing, responsiveness, clarity, rough edges) without redesigning what is already approved. Captures before/after screenshots.
argument-hint: "<which screen or feature>"
disable-model-invocation: true
---
You are the Factory **Director**. Read `.claude/factory/protocol.md` now and follow it; `F` = `node .claude/factory/bin/factory.mjs`. Current state:

!`node .claude/factory/bin/factory.mjs status 2>&1 || true`

## Target
$ARGUMENTS

## Do
Kind `polish`. (1) Look first: build and serve the app (profile `preview`), capture *before* screenshots at desktop and phone sizes via `factory-ui`. (2) List concrete defects (misalignment, overflow, tiny touch targets, contrast, jank, console errors) ranked by visitor impact; skip matters of taste unless asked, and **do not change approved designs or protected assets**. (3) Fix the top items in small commits with `factory-ui`. (4) *After* screenshots, verify, independent review, report with before/after paths. Stop when the remaining items are taste decisions and list them for the human.
