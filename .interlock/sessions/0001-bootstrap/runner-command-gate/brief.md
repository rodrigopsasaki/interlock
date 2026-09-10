# Brief · node `runner-command-gate` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, **approved** against content sha256 `d650e7738535cd36…` by a
  receipt in the repository's shared journal. Do not edit the graph file; doing so would stale
  the approval this session runs under.
- **node:** `runner-command-gate`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** `ledger-gaps` (cleared, PR #10).
- **graph base SHA:** `1833f7950a28cf17ea02790cf7b13e70471ee323`
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0001-bootstrap/runner`. **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> A runner that claims a node under a lease, opens a worktree at the graph's base SHA, starts
> the configured agent in a herdr pane through the socket API behind a typed Runner interface,
> writes the brief into the worktree, waits for idle, blocked or done, runs the node's command
> gates at the debriefed SHA, and appends content-addressed receipts with spend, duration and
> derivation. A sweeper, not the worker, notices an expired lease and writes abandoned; a
> re-run re-earns only receipts whose spend was none. herdr is touched in exactly one adapter
> file. The tmux fallback compiles and is not wired. Its first act is to re-run the standing
> gates for every node already cleared in the repository at main and write their receipts, so
> the position stops depending on pull-request bodies.

## Gates

Standing gates plus the node's own:

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate` (still fails closed by design)
- `one-adapter` — `pnpm --filter runner test --testNamePattern adapter-boundary`: fails if any
  file outside the single herdr adapter references the herdr socket, its methods, or its CLI.
- `receipt-idempotent` — `pnpm --filter runner test --testNamePattern idempotent`: running the
  same gate twice over the same content writes one receipt identity and no duplicate fact.

## Read first

1. `AGENTS.md`, all of it. The Conventions lines about plans, approval, and professed gate
   commands are binding on you.
2. `docs/design/0001-interlock.md`: D1, D3, D5, D8, D11, D12, D20, D21; the Gates section
   (receipt identity, spend, duration, failure/disposition/because, the healing loop); the
   liveness table (progressing, blocked, stalled, dead; the lease bounds silence); the two
   non-retrofittable seams; every bend-log row dated today.
3. `docs/design/0002-face.md`: D15 (verbs dispatch through the CLI) and D16 (the herdr
   adapter is shared by face and runner; the runner reports a pane's agent and session identity
   to herdr with `source: "interlock"`; the face never writes herdr).
4. `packages/ledger/src`, all of it: `createLedger`, `readReplay`, `createReceipt`/`receiptId`
   with repository-relative scope, `checkStale`, `proposeGateMove`, `Outcome` and `HeldOn`,
   `Lease` events, `Spend`, `Duration`, `Derivation` (kind `gate` carries `gate`, `version`,
   `runner`), `envelope.ts`, `upcast/v1.ts`. `packages/face/src/root.ts`
   (`sharedJournalDirectory`, repository root). `packages/cli/src/main.ts` and
   `packages/cli/src/graph/*.ts` for the dispatch and for how a command opens and closes a
   ledger.
5. The four prior debriefs under `.interlock/sessions/0001-bootstrap/`. Their discoveries about
   Node's native TypeScript, pnpm, vitest, mise and the journal are yours to build on.
6. **herdr, out of band.** herdr 0.8.2 (protocol 20) is installed on this machine at
   `/opt/homebrew/bin/herdr`; its server starts only when a client is attached, so during your
   session there may be no socket at `~/.config/herdr/herdr.sock`. Its full socket API schema
   (JSON, 117 method and event constants) is supplied to you as a file path out of band. Copy
   it into `packages/runner/test/fixtures/` under a neutral name and never write its origin
   path anywhere. The protocol is newline-delimited JSON-RPC over a Unix socket:
   `{"id":"req_1","method":"agent.start","params":{...}}` with matching `id` in the response,
   no initialize handshake. Methods you will use: `workspace.create` or `pane.split` (a pane
   with `cwd` at the worktree), `agent.start` (`name`, `kind`, `pane`), `pane.report_agent` and
   `pane.report_agent_session` (`source: "interlock"`, agent label `<graph>/<node>/<session>`),
   `agent.wait` (`until` one or more of `idle`, `blocked`, `done`; a timeout), `agent.read`,
   `agent.list`, `pane.close`, `events.subscribe` for `pane.agent_status_changed`. herdr's
   status vocabulary is `working | blocked | idle | done | unknown`. The CLI mirrors of these
   (`herdr agent start`, `herdr agent wait`) exist and are the debugging fallback, never the
   adapter's transport.

## What the runner is

A library in `packages/runner` and three CLI commands in `packages/cli`. Plain code. No model is
called anywhere in it.

- **`interlock run <graph> <node>`.** Refuses unless the graph reads `approved` for its current
  content and the node's dependencies are cleared in the projection. Refuses unless a brief
  exists at `.interlock/sessions/<graph>/<node>/brief.md` (brief authoring is not the runner's;
  a missing brief is a sentence, not a stub). Then: takes a lease on the node (typed expiry,
  heartbeat at a third of it, on the ledger's clock); creates a git worktree for the node's
  branch at the graph base SHA under a directory the configuration names; copies nothing, the
  brief is already in the tree; opens a herdr pane with `cwd` at the worktree, starts the
  configured agent in it, reports the pane's agent and session identity to herdr with source
  `interlock`; waits until `idle`, `blocked` or `done` with a wall timeout; then runs the gates
  and records the outcome.
- **Gates run by the runner, at the debriefed SHA, in that worktree.** For each gate in the
  standing table and the node: spawn the command with the pinned toolchain (through mise, as
  every session has), measure its duration, and write a receipt whose identity is the content
  hash of the node's scope, whose spend is `none`, whose duration is measured, and whose
  derivation is `{ kind: "gate", gate, version, runner }` where `runner` identifies this runner
  process and run. `proof` carries exit code and an output hash, never the output. A failing
  gate holds the node on that gate with failure, disposition and because recorded separately.
  All gates passing clears the node: one satisfied receipt per declared gate, through the
  ledger's own constructors.
- **Cleared is decided only by the runner's own run.** When a node is judged, the runner ignores
  any gate receipt in the journal whose derivation is not its own run, and re-runs. A receipt
  already present with the same identity and spend `none` is re-earned by re-running, exactly
  as D8 says; a receipt with metered or local spend is kept. Nothing an agent can write into the
  journal changes what the runner concludes.
- **The journal has one writer per repository: the runner.** The agent's pane is given a
  worktree, not the journal. Mechanically, on one machine and one user, this cannot yet be
  enforced by the operating system; it is enforced by the rule above (foreign receipts are
  ignored, and cleared comes only from a re-run) and by the runner recording which receipts it
  wrote in which run. Say this plainly in the debrief as the current honest state.
- **`interlock sweep`.** Reads the projection, finds leases whose expiry has passed with no
  outcome, and writes `abandoned` for them, with the sweeper as derivation. It never revives; a
  re-run is a person's `interlock run`. It is idempotent: a second sweep writes nothing new.
- **`interlock backfill <graph>`, the first act.** For every node whose session directory holds
  a `debrief.yaml`, and whose dependencies are cleared, run the standing gates and the node's
  gates at the current main content and write their receipts and outcome, so the position stops
  depending on pull-request bodies. On this repository that is four nodes today: `scaffold`,
  `ledger`, `face-read`, `ledger-gaps`. Run it for real in this worktree against the
  repository's shared journal before you file the debrief, and capture `interlock graph show
  0001-bootstrap` before and after: the four nodes should move from ready/blocked to cleared,
  and the critical path should now begin at this node. If a gate fails for a cleared node, that
  is a real finding: record it under `open`, do not force the receipt.
- **Configuration.** Standing gates stay in `.interlock/config.yaml`. Per-machine choices live
  in `.interlock/local.yaml`, gitignored: the runtime (`kind: claude` and its arguments), the
  worktree root directory, the lease length, the run wall timeout, the substrate address
  (unused here, present so the shape is one). A missing `local.yaml` is a sentence naming the
  fields and their meaning, not a stack trace. Add a `local.example.yaml` that is committed.
- **One adapter.** Everything herdr lives in one file, `packages/runner/src/herdr/adapter.ts`
  or a single module directory if the type surface needs a second file for types alone, behind
  a typed `Runtime` interface the rest of the runner uses: open a pane at a cwd, start an agent
  of a kind, report identity, wait until states, read, close. A `tmux` implementation of the
  same interface exists, compiles, has a unit test for its command shapes, and is not selected
  by any configuration. The `adapter-boundary` test greps every other file under
  `packages/runner/src` and `packages/cli/src` for herdr's method names, socket path, and CLI
  name and fails on any hit.
- **Tests without a live herdr.** A fake herdr socket server in `packages/runner/test`,
  implementing the subset of methods the adapter uses with the schema's request and response
  shapes as the contract, over a real Unix socket in a temporary directory inside the worktree.
  Lease and heartbeat on a controlled clock. The sweeper on a projection with an expired lease.
  Idempotent receipts. Backfill on a fixture repository whose gates are trivial commands. One
  live smoke that connects to `~/.config/herdr/herdr.sock` if it exists and is skipped with a
  sentence if it does not; do not try to start herdr yourself.
- **Errors are sentences.** No socket, no brief, unapproved graph, uncleared dependency, missing
  local configuration, agent kind unknown to herdr, timeout: each names what was expected and
  what was found. Exit non-zero.
- **Vocabulary.** graph, node, brief, session, lease, gate, receipt, spend, duration,
  derivation, outcome, cleared, held, abandoned, disposition, because, position. The herdr
  states are herdr's words and stay inside the adapter; the runner's own words for a session's
  state are the ledger's.

## Out of scope

The face's pane TUI and the other five verbs; liveness derivation beyond lease expiry (stalled
is the face's read over progress edges, later); debrief ingestion and validation (that is
`debrief-schema`, which the runner only checks for presence); the verifier; the substrate; the
phone channel; review, shape and human gates as gate kinds (command gates only in this node);
starting or configuring herdr on the machine. Do not edit `AGENTS.md`, either design note, the
graph, `.interlock/config.yaml`, or this brief.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types and module boundaries
  carry the meaning; a comment exists only where the code cannot say it. `// @ts-expect-error`
  in tests is the test.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Narrow or write an adapter.
- Node pinned by `.node-version`; run everything through `mise exec --`. pnpm workspace as is.
  Any new dependency is verified on npm and justified in the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** Every
  message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. The fake socket server's temporary
  directory lives under this worktree and is gitignored.

## Deliverable

1. Commits satisfying the acceptance; all gates green under the invocations recorded.
2. `notes.yaml` beside this brief, appended **while you work** at every choice and surprise,
   committed with the code it belongs to (`notes@v0`).
3. `debrief.yaml` beside this brief, shape `debrief@v1` as prior sessions used it, final
   commit, `head_sha` = last code commit. **Decisions are a manifest of the diff**: every changed
   file, including `notes.yaml`, `debrief.yaml`, fixtures and `local.example.yaml`, appears in
   some decision's `hunks` or `produces`. Check before filing.
4. In the debrief: the `interlock graph show 0001-bootstrap` output before and after the real
   backfill, verbatim; the list of receipts the backfill wrote with their gate ids and durations;
   the exact `local.yaml` fields; and the honest state of the one-writer guard.
