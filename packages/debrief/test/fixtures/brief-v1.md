---
interlock: brief@v1
graph: 0002-shapes
node: fixture-node
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: fixture-gate
    kind: command
    run: pnpm test
    expect_output: 'Tests +[1-9][0-9]* passed'
scope:
  - packages/debrief/src/brief.ts
  - packages/debrief/test/fixtures/brief-v1.md
substrate:
  address: none
---

## Acceptance

> A fixture node used only to exercise the brief@v1 reader and the interlock brief validate
> command.

## Context slice

No substrate is configured; this brief carries no context slice.

## Constraints

Read-only fixture. Nothing under this node is ever run.

## Deliverable

Nothing. This file exists so the reader has a real brief@v1 file to parse.
