---
interlock: brief@v1
graph: 0002-shapes
node: substrate-protocol
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
scope:
  - packages
  - schemas
  - docs/design/0003-substrate.md
  - .interlock/sessions/0002-shapes/substrate-protocol
substrate:
  address: none
---

# Brief · node `substrate-protocol` · graph `0002-shapes`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0002-shapes`, approved by a receipt in the repository's shared journal. Do not edit
  any graph file.
- **node:** `substrate-protocol`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `schemas`, cleared.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> `docs/design/0003-substrate.md` defines `substrate@v1`: the two required verbs, `context`
> and `absorb`; the declared capabilities `consult`, `query`, `why`, `note`, `open`, `close`,
> `propose`, `ratify`, `contest`, `judge`; the payload shape of each in terms of the artifact
> schemas; what interlock does when a capability is absent; and how the protocol is versioned
> independently of the artifacts it carries. A schema for each payload lives under
> `schemas/substrate/`. The note names one reference implementation once and maps its doors
> to the verbs. Nothing in interlock consumes the protocol yet; that is the next graph.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: the vocabulary, invariant I5 (the harness runs with the address set to none),
   Compatibility, Constraints, and the fence: the reference implementation is named exactly once
   in the note and nowhere in code, schema or test.
2. `docs/design/0003-substrate.md` in full. It is a draft, v0.1: the verbs, payloads, D22 to D25
   and the door mapping are written; the schemas are not, and the note has not been read against
   the shapes that now exist.
3. `schemas/` and `packages/schemas` as the `schemas` node left them; `item@v1` in
   `packages/debrief/src` and its fixture; `debrief@v2`, `notes@v0`, `receipt`, `derivation`,
   `mark` as schemas.
4. `docs/design/0001-interlock.md`: D4, D6, D7; `docs/design/0002-face.md`: D15 (the person's
   controls over the substrate's own voice stay outside the protocol).

## What this node builds

- **`schemas/substrate/`**: one request and one response schema per verb, draft 2020-12, `$id`
  ending in `substrate@v1/<verb>.request.json` and `<verb>.response.json`, every artifact they
  carry referenced by `$ref` to the artifact schemas (`debrief@v2`, `notes@v0`, `item@v1`,
  `receipt`, `derivation`, `mark`), never redefined. `context` takes node, scope and role and
  returns a slice of items plus the substrate's vocabulary version; `absorb` takes a debrief, its
  notes and the node's receipts and returns the acknowledgement the note describes (which
  decisions became beliefs, which discoveries were known, new, or could not be placed);
  `consult`, `query`, `why`, `note`, `open`, `close`, `propose`, `ratify`, `contest`, `judge` as
  the Payloads section states them. A `capabilities` response schema lists what a substrate
  declares. Where the note is silent on a field, decide the smallest honest shape and record it.
- **Tests in `packages/schemas`**: every substrate schema compiles; a fixture request and response
  per verb validates; the `item@v1` fixture validates as the slice's item; a response carrying an
  item with no derivation is refused. Name them so a future gate could find them (`substrate`).
- **The note, from draft to v1.0.** Status line: the protocol is `substrate@v1` and its schemas
  live under `schemas/substrate/`; the Payloads section gains the schema paths; every claim in the
  note is read against the shapes that exist now and corrected where it lags (the debrief version
  it accepts, the marks the verifier produces, the events the journal carries); D22 to D25 keep
  their numbers; a bend-log row dated with your session records what bent between draft and v1.0
  and why. The reference implementation stays named once, in the mapping section, and nowhere
  else. Nothing in interlock consumes the protocol in this node.

## Out of scope

A client for the protocol; any call to any substrate; changing artifact schemas (a mismatch is a
finding for `open`); `AGENTS.md`; the other design notes; any graph; `.interlock/config.yaml`;
this brief; any other session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and schema `description` fields
  carry the meaning. Never quote `AGENTS.md`, this brief or a design note inside code or schemas.
- Strict TypeScript; no `as`, `!`, `any`, `as unknown as`. No new dependencies.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, no `git reset --hard`, no `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr. Never append to the shared journal.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the list of schema files with their `$id`s, and every place the note lagged the
   shapes and how you corrected it.

When the debrief is committed, stop and wait. The runner judges from there.
