---
interlock: brief@v1
graph: 0002-shapes
node: schemas
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
  - id: corpus-agrees
    kind: command
    run: pnpm --filter schemas --fail-if-no-match test --testNamePattern corpus
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - schemas
  - .interlock/sessions/0002-shapes/schemas
substrate:
  address: none
---

# Brief · node `schemas` · graph `0002-shapes`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0002-shapes`, approved by a receipt in the repository's shared journal. Do not edit
  any graph file.
- **node:** `schemas`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `brief-shape`, cleared.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> A JSON Schema for every artifact shape and version interlock reads or writes today, under
> `schemas/`: graph@v0, brief@v0 and brief@v1, notes@v0, debrief@v0, debrief@v1, debrief@v2,
> event@v1 and event@v2 with receipt, derivation, mark, outcome, gate and lease, config@v0,
> local@v0. Every real file under `.interlock/` and every line of the repository's journal
> validates against its schema, and a test proves the TypeScript guards and the schemas agree
> on the corpus: what one accepts the other accepts. A schema names its shape tag and version
> in its `$id`.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: Compatibility (shape and version on line one; readers accept every prior version
   forever), the vocabulary, Constraints.
2. `docs/design/0001-interlock.md`: Compatibility, D5, D7. `docs/design/0002-face.md`: D17 (a
   later renderer reads the same functions). `docs/design/0003-substrate.md`: Payloads, D25.
3. Every guard in `packages/ledger/src` (`isLedgerEvent`, `isReceipt`, `isDerivation`, `isMark`,
   `isOutcome`, `isGate`, `isLease`, `isDebrief`, `isNote`, `isBrief`) and the upcasters under
   `packages/ledger/src/upcast/` (v1, v2, v3: what each version looked like); the readers in
   `packages/debrief/src` (brief@v0 and v1, notes@v0, debrief@v0, v1, v2, item@v1); the loaders in
   `packages/face/src/document.ts` (graph@v0) and `position.ts` (position@v1);
   `packages/runner/src/localConfig.ts` (local@v0) and `standingGates.ts` (config@v0).
4. The corpus: every file under `.interlock/` (graphs, config, the example local file, every
   session's brief, notes and debrief) and the journal at `.interlock/ledger/journal.jsonl`,
   which today carries `event@v1`, `v2`, `v3` and `v4` lines side by side. The acceptance lists
   the versions that existed when the graph was written; the rule is every version interlock
   reads or writes today, so `event@v3`, `event@v4` and `position@v1` are in.

## What this node builds

- **`schemas/`** at the repository root, one JSON Schema (draft 2020-12) per shape and version:
  `graph@v0`, `brief@v0`, `brief@v1`, `notes@v0`, `debrief@v0`, `debrief@v1`, `debrief@v2`,
  `event@v1`, `event@v2`, `event@v3`, `event@v4`, `config@v0`, `local@v0`, `position@v1`,
  `item@v1`; the parts events carry (`receipt`, `derivation`, `mark`, `outcome`, `gate`, `lease`,
  `session`, `note`) as their own files each event version references by `$ref`, versioned
  where the part changed between event versions and shared where it did not. Each schema's `$id`
  is a URI that ends in the shape tag, e.g. `…/schemas/event@v4.json`; a `title` names the
  shape; `additionalProperties` is false wherever the TypeScript type is closed.
- **`packages/schemas`**, a workspace package whose tests are the proof: for every file under
  `.interlock/` and every line of the journal, the schema for its tag accepts it; for every guard
  in the packages above, a generated corpus of accepted and refused values (take the fixtures the
  packages already have, plus each test's own) gets the same verdict from the guard and from the
  schema. Name the tests so the gate finds them: every one of them contains `corpus`.
  Validation needs a JSON Schema validator; `ajv` is the one to take, as a dev dependency of this
  package only, after you verify it on npm, and you record in the debrief why a hand-rolled
  validator would have been the wrong call. No other new dependency.
- **A small script**, `packages/schemas/src/validate.ts`, exposed as `interlock schema validate
  <file>` in `packages/cli`: reads the shape tag on line one (or `interlock:` for YAML), picks the
  schema, prints one sentence per finding with the JSON pointer, exits non-zero on a refusal.
  Legacy versions validate as legacy-valid, the same words the readers use.

## Out of scope

`docs/shapes.md` (the next node generates it from these schemas); the substrate payload schemas
(the `substrate-protocol` node); changing any TypeScript type or guard to fit a schema (a
disagreement between a guard and its schema is a finding: record it, make the schema follow the
guard, and list it under `open` if the guard looks wrong). Do not edit `AGENTS.md`, any design
note, any graph, `.interlock/config.yaml`, this brief, or any other session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. A why that a name cannot carry goes in the commit body. Never quote `AGENTS.md`, this
  brief or a design note inside code or schema descriptions.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Discriminated unions for states with names.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, no `git reset --hard`, no `git clean`
  (the person's permission rules stall a run on them); `rmSync` on a test's own directory only.
  Never touch herdr. Never append to the shared journal; read it as a fixture copy.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the count of corpus files and journal lines validated per shape tag, and every
   disagreement between a guard and its schema you found, with the side you took and why.

When the debrief is committed, stop and wait. The runner judges from there.
