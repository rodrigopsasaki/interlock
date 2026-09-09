# Brief · node `face-read` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap` (`.interlock/graphs/0001-bootstrap.yaml`), **approved** by Rodrigo
  Sasaki on 2026-09-09 against content sha256 `79521ddccff79088…` (the file on main now). That
  approval is what allows this session to exist. Do not edit the graph file; doing so would stale
  the approval this session runs under.
- **node:** `face-read`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** `ledger` (cleared, PR #4)
- **graph base SHA:** `5778fcf69d3d2f1c3f08851c6ad90fad9e00be48` (main at the time of this brief)
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0001-bootstrap/face-read`. **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> `interlock graph show <id>` renders a graph file plus the journal as a position: nodes in
> dependency order, each with its gate states and outcome, the unweighted critical path, and
> the graph's approval state. `interlock graph approve <id> --by <who> --because <why>` writes
> a human-gate receipt whose identity is the content hash of the graph file. `show` reports
> approved, stale since the file changed, or not approved. Both read the journal through
> replay and write only through the ledger's own append. A malformed graph gets a sentence,
> not a stack trace.

## Gates

Standing gates from `.interlock/config.yaml` plus the node's own:

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate` (still fails closed by design)
- `stale-approval` — `pnpm --filter face test --testNamePattern stale-approval`: editing an
  approved graph flips its approval to stale.

## Read first

1. `AGENTS.md`: axioms, invariants, vocabulary, seams, conventions. Binding. Note the new line
   under Conventions about plans and approval.
2. `docs/design/0001-interlock.md`: D20 (the approval gate), the Gates section (receipt identity,
   spend, derivation), Compatibility, and the bend log.
3. `docs/design/0002-face.md`: D14 (read fresh, own nothing), D15 (verbs dispatch through the
   CLI, the face's process never writes), D18 (one validator, sentence errors), the Views table.
   This node is the first slice of that note: the read side plus the one verb, `approve`, that
   the plan gate needs. It is a CLI, not yet the pane.
4. `packages/ledger/src`: `ledger.ts` (`createLedger`), `replay.ts` (`readReplay`, `ReplayRefusal`),
   `receipt.ts` (`createReceipt`, `receiptId`, `checkStale`), `gate.ts` (`proposeGateMove`),
   `outcome.ts`, `projection.ts` (`LedgerProjection`, `NodeView`), `envelope.ts`, `derivation.ts`.
   Use these; do not reimplement receipt identity or gate transitions.
5. `packages/cli/src/main.ts`: the `[group, action]` dispatch your two commands join. Keep
   `debrief validate` failing closed.
6. `.interlock/graphs/0001-bootstrap.yaml`: the only graph file in existence. Its shape is
   `graph@v0`: `interlock`, `id`, `ask`, `derivation`, `read`, optional graph-level `gates`,
   `nodes[]` with `id`, `acceptance`, `depends_on`, `gates[]`. Your loader reads this shape;
   it does not define a new one.
7. The two prior sessions' debriefs under `.interlock/sessions/0001-bootstrap/`: their
   discoveries about Node's native TypeScript, pnpm, vitest flags and Phyxius are yours to
   build on.

## What face-read is

Two CLI commands and the pure functions behind them. No pane, no verbs beyond `approve`, no
runner, no herdr.

- **Position rendering is pure.** A function from (graph document, projection, current graph
  content hash) to a position value, and a function from a position value to text. Tests hit the
  value, not the text. Topological order by `depends_on`; the unweighted critical path is the
  longest dependency chain by node count; a node's state is its outcome if the projection has
  one, else `ready` when every dependency is cleared, else `blocked on <deps>`; gate states from
  the projection where present, `pending` otherwise. Nothing is guessed: a node the projection
  knows nothing about shows exactly that.
- **The graph's approval is a receipt on the graph's content.** Identity is the ledger's own
  `receiptId(scope, gate)` with scope = the graph file path and gate = `approved`; spend `none`;
  derivation `{ kind: "human", who }`; proof carries the `because`. Reuse the node-level ledger
  machinery by treating the graph itself as a node whose id is the graph id and whose declared
  gates are the graph-level `gates` from the file. Do not add a new event kind: adding one to
  `event@v1` would break every reader of v1 and is a shape change this node is not licensed to
  make. If you find reuse genuinely impossible, stop, write why under `open`, and build the rest.
- **Approval state has three values.** `approved` when a receipt exists whose id equals the
  current content's receipt id; `stale` when a receipt exists for this gate but its id no longer
  matches (the file changed after approval; use `checkStale`); `not approved` otherwise. The
  `stale-approval` test approves a graph, edits one byte of the file, and asserts `stale`.
- **`approve` refuses without a because.** It also refuses a graph file that fails validation,
  and it never writes anything but the receipt and the gate move, through `createLedger` opened
  for the duration of the command and closed after. `show` never writes: it reads through
  `readReplay` only. A test proves `show` opens no ledger for writing.
- **Where the journal lives.** `.interlock/ledger/journal.jsonl` relative to the repository root
  (the nearest ancestor directory containing `.interlock/`). Add `.interlock/ledger/` to
  `.gitignore`: the journal is per-machine state, not a committed artifact, for now. Record this
  as a decision with its because; it is the one decision in this brief that should be revisited
  when the runner exists.
- **Errors are sentences.** A missing graph file, an unknown node in `depends_on`, a cycle, a
  malformed shape tag, a journal `ReplayRefusal`: each produces one sentence naming the file, the
  line where possible, and what was expected. Exit non-zero. No stack traces reach the person.
- **Vocabulary.** Use the AGENTS.md words for every type and module: graph, node, gate, receipt,
  spend, derivation, outcome, position, critical path, cleared, held, stale. `approved` is a gate
  id, not a new noun. A word you need that is in neither the table nor plain programming English
  is a finding for the debrief, not a coinage.

## Out of scope

The pane TUI, the other five verbs, liveness, sessions' five columns, herdr, the runner, the
verifier, the substrate, float (needs a receipt duration that does not exist yet). Four ledger
gaps the face design exposed are NOT yours to fix; if you hit one, record it under `open` and
route around it without working around it: no `Outcome` kind for a voluntary pause; `reset`
carries no because or authority; `Receipt` has no duration; the `Debrief` type lacks the
derivation and SHA fields the YAML carries. Do not edit `AGENTS.md`, either design note, the
graph, `.interlock/config.yaml`, or this brief.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types and module boundaries
  carry the meaning. `// @ts-expect-error` in tests is the test, not a comment.
- Small single-purpose files named for the vocabulary. A reader learns the shape from the tree.
- Strict TypeScript. No `as`, `!`, `any`, `as unknown as`. Narrow or write an adapter. YAML
  parsing needs a library: pick one that is maintained and typed (the `yaml` package is the usual
  answer); validate the parsed value with the same hand-written guards style the ledger uses.
- Package `packages/face` for the pure functions and the loader; `packages/cli` gains the two
  commands and depends on `face` and `ledger`. Keep `cli` thin.
- Node pinned by `.node-version`; run everything through `mise exec --`. pnpm workspace as is.
- Conventional Commits, subject states the why, body justifies. Commit on this branch. **Do not
  push.** End every message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not create files outside this worktree. Do not use `/tmp`. No `rm -rf`.

## Deliverable

1. Commits satisfying the acceptance, gates green under the invocations recorded below.
2. `.interlock/sessions/0001-bootstrap/face-read/notes.yaml` appended **while you work**, at every
   choice and surprise, committed with the code it belongs to (shape `notes@v0`, as the ledger
   session used it).
3. `.interlock/sessions/0001-bootstrap/face-read/debrief.yaml`, shape `debrief@v1` exactly as the
   ledger session's debrief, as the final commit, `head_sha` = last code commit. **Decisions are a
   manifest of the diff:** every changed file appears in some decision's `hunks` or `produces`,
   mechanical ones included. Check that before filing, not after a verifier does.
4. A demonstration in the debrief's `open` or a discovery: the output of `interlock graph show
   0001-bootstrap` against the real journal-less repo (every node ready or blocked on deps, the
   critical path, `not approved`), and after `interlock graph approve 0001-bootstrap --by "Rodrigo
   Sasaki" --because "approved in conversation on 2026-09-09 against 79521ddccff79088"` the same
   command reporting `approved`. That approve is the first real receipt and backfills the record
   in PR #6; run it for real in this worktree.
