# Brief · node `scaffold` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not edit it.

## Node

- **graph:** `0001-bootstrap` (`.interlock/graphs/0001-bootstrap.yaml`)
- **node:** `scaffold`
- **depends on:** nothing
- **base SHA:** `de6e0499541bbc3999fc97ba2aef46849fa23818` on branch `graph/0001-bootstrap/scaffold`
- **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> A pnpm workspace on the pinned Node with strict TypeScript, vitest, and @phyxiusjs/*
> dependencies, where `pnpm typecheck` and `pnpm test` run green on an empty package and
> `pnpm interlock debrief validate` exists as a stub that fails closed.

"Fails closed" means: the command exits non-zero with a message saying validation is not
implemented yet. It must never exit zero until a validator exists.

## Gates

Standing gates from `.interlock/config.yaml`. The harness runs these at your final commit, not you.
Run them yourself as often as you like; your runs are informational and go in the debrief.

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate` (expected to FAIL closed for this node; the
  gate is recorded as held-by-design, since the stub is the deliverable)

## Read first

1. `AGENTS.md` — axioms, invariants, vocabulary, conventions. Binding.
2. `docs/design/0001-interlock.md` — sections "The shape", "Seams", "Two seams that cannot be
   retrofitted". You are laying the floor the `ledger` node will build on: the ledger will be a
   Phyxius journal with typed handlers, clock, and effect. Choose dependencies and layout so that
   node does not have to fight you.
3. `~/dev/private/phyxius` — the Phyxius monorepo. Read `packages/*/package.json` and each
   package's README or docs to learn which `@phyxiusjs/*` packages exist and what they are for.
   Verify each one you add is published on npm (`npm view <name> version`). Add only packages
   the ledger node will plausibly need. Record the choice and why in the debrief.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types and module boundaries
  carry the meaning. A comment is allowed only where the code genuinely cannot say it (a
  non-obvious why, an external constraint). No banner comments, no restating the code, no
  section markers, no JSDoc on things whose name and type already say it.
- Clean, readable, modularized. Small files with one purpose, named for what they are.
- Strict TypeScript. No `as`, no `!`, no `as unknown as`, no `any`. Narrow or write a real adapter.
- Node pinned by `.node-version` (24.14.0). If `node -v` disagrees, run through `mise exec --`.
  Do not change the pin.
- pnpm workspace. Match conventions in `~/dev/private/phyxius` where they apply (tsup, vitest,
  strict tsconfig). Do not add Nx or any task runner unless you can justify it in one sentence
  in the debrief; a plain pnpm workspace is preferred at this size.
- No README, no docs files, no CHANGELOG. `AGENTS.md` and the design note already exist and are
  not yours to edit.
- Do not build anything from later nodes: no ledger, no runner, no herdr adapter, no verifier.
  A package directory for the CLI stub is expected; a package for the ledger is not.
- Conventional Commits. Subject states the *why*; body justifies the choice and tradeoffs.
  Commit on this branch. **Do not push.**
- Do not create files outside this worktree. Do not use `/tmp`. No `rm -rf`.

## Deliverable

1. Commits on this branch that satisfy the acceptance.
2. `.interlock/sessions/0001-bootstrap/scaffold/debrief.yaml` in the shape below, committed as
   the final commit, with `head_sha` set to the commit before it (the last code commit).

## Debrief shape (`debrief@v0`)

This is the first debrief ever written. If the shape cannot express something you need to say,
put it under `open` and say what the shape lacks. That is a finding, not a failure.

```yaml
interlock: debrief@v0
graph: 0001-bootstrap
node: scaffold
base_sha: de6e0499541bbc3999fc97ba2aef46849fa23818
head_sha: <sha of your last code commit>
derivation:
  kind: agent
  runtime: <e.g. claude-code>
  model: <the model id you are running as, as best you know it>
discoveries:
  # Things you had to find out that this brief did not tell you.
  # Every discovery is a brief deficiency; be generous.
  - id: d1
    what: <one sentence>
    found_at: <path[:lines] | command you ran | url>
    mattered_because: <one sentence>
decisions:
  # Every choice you made. Every hunk in your diff should be explained by at least one decision.
  - id: c1
    what: <one sentence>
    rests_on: [<d-id> | brief:<section name>]
    hunks: [<path> | <path:start-end>]
    rejected: <alternatives considered, optional>
gates_run_by_agent:
  - { id: typecheck, result: pass | fail, note: <optional> }
  - { id: test, result: pass | fail }
  - { id: debrief-valid, result: fail, note: fails closed by design }
open:
  # Anything unresolved, anything the acceptance or this brief got wrong, anything the debrief
  # shape could not express.
  - <one sentence each>
```
