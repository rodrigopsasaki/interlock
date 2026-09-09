# Brief · node `ledger` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap` (`.interlock/graphs/0001-bootstrap.yaml`)
- **node:** `ledger`
- **role:** worker. Supplied here, not chosen by you. You build to an acceptance you may challenge
  with evidence and may not weaken.
- **depends on:** `scaffold` (cleared, merged as PR #2)
- **graph base SHA:** `fd2ba0bdece8842a17bd137e19089cd5ce4ee5bd` (main at the time of this brief)
- **session start SHA:** the commit that contains this brief; run `git rev-parse HEAD` before you
  change anything and record it in the debrief as `session_start_sha`.
- **branch:** `graph/0001-bootstrap/ledger`. **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> The ledger as a Phyxius journal. Types for graph, node, brief, note, debrief, gate state,
> receipt, spend, derivation, lease and outcome where `cleared` cannot be constructed without
> one satisfied-or-waived receipt per declared gate, no receipt or mark can be constructed
> without a derivation, and no receipt without a spend. State is a projection over the journal.
> A process killed mid-write replays to the same projection.

## Gates

Standing gates from `.interlock/config.yaml` plus the node's own, from the graph:

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate` (still fails closed; recorded as held-by-design
  until the `debrief-schema` node lands)
- `replay` — `pnpm test --filter ledger -- --grep replay`
- `illegal-states` — `pnpm test --filter ledger -- --grep unrepresentable`

The last two are professed commands that have never run. Verify them literally. If the literal
invocation cannot work (pnpm option order, vitest flag names), do **not** edit the graph. Write the
invocation that does work under `open` in the debrief, with the reason. The harness bends the graph,
not the worker.

## Read first

1. `AGENTS.md` — axioms, invariants, vocabulary, conventions. Binding. The vocabulary table is
   the list of nouns your types are named after. Do not coin others.
2. `docs/design/0001-interlock.md` — sections "Node lifecycle", "Gates", "The verifier",
   "Derivation", "Seams" and the bend log. The bend log rows dated today are requirements for
   this node: receipts addressed by the content hash of the node's scope paths; a decision can
   own generated hunks; the brief supplies the role.
3. `.interlock/sessions/0001-bootstrap/scaffold/debrief.yaml` — the previous session's
   discoveries about Phyxius are yours to build on: journal is in-memory; `Journal` needs a
   `Clock`; `ControlledClock.advanceBy` takes `ms()`; `@phyxiusjs/handler` needs a schema library.
4. `~/dev/private/phyxius` — the Phyxius monorepo. Read the READMEs and `src/` of `journal`,
   `clock`, `drain`, `atom` (in `packages/core`) and `durable-step`, `handler`, `observe` (in
   `packages/components`). `@phyxiusjs/durable-step` is published (0.1.1) and was not known to the
   scaffold session; it is a compare-and-set state machine with a pluggable store and is the
   natural home for node and gate transitions. Verify every package you add with
   `npm view <name> version`.
5. A reference implementation of exactly this ledger's laws exists and will be supplied to you
   out of band as file paths. It runs on the same Phyxius primitives. Read it as prior art: keep
   its laws and its test cases, rename its nouns to this repository's vocabulary, import nothing
   from it, and copy no paragraph of it. When you cite it in the debrief, cite it as
   "reference implementation, supplied out of band" plus the file's basename only. Its paths
   never appear in this repository.

## What the ledger is

A library, not a service. It owns the shape of the work and its history, and nothing else.

- **Events, not rows.** Every change is an appended journal event: a node created, a lease taken
  or renewed or expired, a session started, a note appended, a debrief filed, a gate moved, a
  receipt written, an outcome set, an outbox intent recorded. State is a projection computed from
  the events. There is no mutable state that is not derivable from the journal.
- **Durability is a sink.** `@phyxiusjs/journal` is in-memory. Durability comes from draining to
  an append-only sink and replaying from it on start. For this node the sink is append-only
  file(s) under a configurable directory. No database dependency. The sink is a seam; choose
  the file format for replay and inspection, not for speed.
- **Crash-only.** The only recovery path is the normal start path: read the sink, rebuild the
  journal, project. A process killed after any prefix of writes must replay to a projection that
  is either identical to the pre-kill projection or identical to the projection with the last
  partial write dropped. Prove this with a test that truncates the sink at every byte boundary
  of a recorded run.
- **Illegal states unrepresentable.** `cleared` carries one satisfied-or-waived receipt per
  declared gate and cannot be built short. A receipt cannot exist without `spend` and
  `derivation`. A mark cannot exist without `derivation`. A gate is in exactly one of pending,
  satisfied, blocked, waived, superseded, and waived and superseded require an authority and a
  because. An outcome records failure, disposition and because as three fields. Where the
  compiler can enforce it, the compiler does; where it cannot, a constructor returns a typed
  refusal, never throws for a domain reason, and a test proves the refusal.
- **Receipt identity.** A receipt is addressed by the content hash of the paths in the node's
  scope at the time the gate ran, plus the gate id. The commit SHA is carried as history, not
  identity. Same content and gate, same receipt.
- **Spend.** `none | metered | local`. It is a field on the receipt today; the revival rule that
  reads it belongs to the runner node, not this one.
- **Lease.** A claim on a node with a typed expiry, renewed by heartbeat. This node models the
  lease and its expiry as events and projection. Nobody sweeps yet; the sweeper is the runner's.
- **Derivation.** Required on receipts and marks: `{ kind: "gate", gate, version, runner } |
  { kind: "model", model, promptId, lens } | { kind: "human", who }`. Never optional. Never
  defaulted.
- **Vocabulary.** graph, node, brief, note, debrief, discovery, decision, gate, receipt, spend,
  derivation, mark, outcome, lease, session, mandate, gap, and the words for states: cleared,
  held, stale, cancelled, superseded, interrupted. Use these as type and module names. A type that
  needs a word not in `AGENTS.md` is a finding for the debrief, not a coinage.

## Out of scope

No runner, no herdr, no sweeper, no verifier logic, no CLI commands, no substrate client, no
interpreter. The `debrief validate` stub stays a stub. Do not edit `AGENTS.md`, the design note,
the graph, `.interlock/config.yaml`, or this brief.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types and module boundaries
  carry the meaning. `// @ts-expect-error` directives in tests that prove a construction is
  refused by the compiler are not comments; they are the test.
- Small single-purpose files named for what they are. A reader should learn the ledger's shape
  from the file tree.
- Strict TypeScript. No `as`, no `!`, no `as unknown as`, no `any`. Narrow or write an adapter.
- Package: rename `packages/core` to `packages/ledger` (git mv, keep the wiring test, package name
  `ledger`). If `@phyxiusjs/handler` is used, adding `zod` is acceptable; if it is not used, remove
  the dependency rather than leave it declared and idle.
- Node pinned by `.node-version`; run everything through `mise exec --`. pnpm workspace as
  scaffolded. No Nx.
- Conventional Commits, subject states the why, body justifies. Commit on this branch. **Do not
  push.** End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not create files outside this worktree. Do not use `/tmp`. No `rm -rf`.

## Deliverable

1. Commits on this branch that satisfy the acceptance, with `pnpm typecheck` and `pnpm test` green
   and the replay and illegal-states tests present and passing under whatever invocation works.
2. `.interlock/sessions/0001-bootstrap/ledger/notes.yaml`, appended **while you work**, at every
   choice and every surprise, in the shape below. Commit it with the code commits it belongs to,
   not at the end.
3. `.interlock/sessions/0001-bootstrap/ledger/debrief.yaml` in the shape below, as the final
   commit, with `head_sha` set to the last code commit.

## Notes shape (`notes@v0`)

```yaml
interlock: notes@v0
node: ledger
entries:
  - kind: choice
    at: <ISO time>
    chose: <one sentence>
    because: <one sentence, mandatory>
    rejected: [<optional>]
  - kind: surprise
    at: <ISO time>
    expected: <one sentence>
    observed: <one sentence>
```

## Debrief shape (`debrief@v1`)

Changes from v0, all from the scaffold session's findings: `base_sha` is now `session_start_sha`;
`graph_base_sha` is added; a decision may carry `produces` for generated hunks it owns.

```yaml
interlock: debrief@v1
graph: 0001-bootstrap
node: ledger
role: worker
graph_base_sha: fd2ba0bdece8842a17bd137e19089cd5ce4ee5bd
session_start_sha: <full sha of the commit containing this brief>
head_sha: <full sha of your last code commit>
derivation:
  kind: agent
  runtime: <e.g. claude-code>
  model: <the model id you are running as, as best you know it>
discoveries:
  - id: d1
    what: <one sentence>
    found_at: <path[:lines] | command you ran | "reference implementation, supplied out of band: <basename>">
    mattered_because: <one sentence>
decisions:
  - id: c1
    what: <one sentence>
    rests_on: [<d-id> | brief:<section> | notes:<index>]
    hunks: [<path> | <path:start-end>]
    produces: [<generated path, e.g. pnpm-lock.yaml>]   # optional
    rejected: <alternatives considered, optional>
gates_run_by_agent:
  - { id: typecheck, result: pass | fail }
  - { id: test, result: pass | fail }
  - { id: debrief-valid, result: fail, note: fails closed by design until debrief-schema }
  - { id: replay, result: pass | fail, invocation: <the command that actually ran> }
  - { id: illegal-states, result: pass | fail, invocation: <the command that actually ran> }
open:
  - <anything unresolved, anything this brief or the acceptance got wrong, anything the shapes
    could not express>
```
