# Brief · node `ledger-gaps` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, **approved** on 2026-09-09 against content sha256
  `d650e7738535cd36…` by a receipt written with `interlock graph approve`. Do not edit the graph
  file; doing so would stale the approval this session runs under.
- **node:** `ledger-gaps`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** `ledger` (cleared, PR #4), and the face-read slice that exposed these gaps is
  merged (PR #8).
- **graph base SHA:** `29b0ea4967025644eb912c6f5c87b0c7cf1f1f2f`
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0001-bootstrap/ledger-gaps`. **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> Four gaps the face exposed in the ledger's shapes, closed: an outcome kind for a voluntary
> hold with authority and because and no failure; reset carries because and authority; a
> receipt carries its duration; the debrief type carries derivation, graph base and session
> start SHAs, gates run by the agent, produces on decisions, and a mandatory because on every
> decision. The persisted shape moves to `event@v2` with the `event@v1` upcaster kept and
> proven on a v1 fixture. The journal directory resolves per repository, shared across its
> worktrees, not per worktree.

## Gates

Standing gates plus the node's own:

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate` (still fails closed by design)
- `upcast-v1` — `pnpm --filter ledger test --testNamePattern upcast`

## Read first

1. `AGENTS.md`: vocabulary (note `disposition` and `approved`), the Compatibility convention,
   the plans-and-approval convention.
2. `docs/design/0001-interlock.md`: Gates (receipt identity, spend, duration in the prose),
   Compatibility (versioned journal lines, upcast seam, "a rename is a new version with a reader
   for the old one"), D20, D21, and the bend-log rows dated today, especially the one about the
   per-worktree journal.
3. `docs/design/0002-face.md`: D14 and D15, and the Views table's "exists today?" column, which
   is the list of what this node closes.
4. `packages/ledger/src`, all of it. In particular `envelope.ts` (the upcast table you extend),
   `replay.ts` (`ReplayRefusal`, the truncated-tail rule), `outcome.ts`, `receipt.ts`,
   `debrief.ts`, `event.ts`, `sink.ts`, and `packages/face/src/root.ts` (repository root
   discovery, which currently finds the nearest `.interlock/` and therefore differs per worktree).
5. The three prior debriefs under `.interlock/sessions/0001-bootstrap/`, and the face-read
   session's `open` items, which name these gaps precisely.
6. **The fixture.** A real two-line `event@v1` journal, written by a person with `interlock graph
   approve`, is supplied to you out of band as a file path. Copy it into `packages/ledger/test/`
   as a fixture. It must replay under `event@v2` to a projection in which graph `0001-bootstrap`'s
   `approved` gate is satisfied. That is the `upcast-v1` gate's proof, and it is not synthetic.

## What this node closes, and how

- **A voluntary hold.** An outcome kind for a node held on purpose, by an authority, with a
  because, and no failure. Name it with the vocabulary: `held` already means "waiting at a
  signal"; today's `held` requires a failure. Model the difference as data on `held` (what it is
  waiting on: a failed gate, or a person's decision with authority and because), never as a
  second word. If that cannot be made unrepresentable-when-wrong, say so under `open` and choose
  the closest typed shape.
- **`reset` carries because and authority.** A human-triggered retry leaves a recorded reason. A
  reset without a because cannot be constructed.
- **A receipt carries its duration.** `durationMs`, a plain number, required. The gate ran for a
  measurable time; the design's Gates section names it and the face's float view needs it.
- **The debrief type matches the debrief file.** `derivation`, `graphBaseSha`, `sessionStartSha`,
  `gatesRunByAgent`, `produces` on a decision, and a mandatory `because` on every decision. This
  is the type the future `debrief-schema` node validates files against; make the type say what
  the shape `debrief@v2` will be, and record that `debrief@v2` is now specified by this type.
- **`event@v2`.** Changing `Outcome`, `Receipt` and `Debrief` changes the persisted event bodies.
  A new required field or a new union arm is a new version under the Compatibility rules. Bump
  the envelope to `event@v2`; keep the `event@v1` upcaster in the table and make it produce v2
  events from v1 bodies (duration absent in v1: decide the honest upcast, for instance a receipt
  whose duration is unknown, and make that a typed state rather than a fake zero). Writers write
  v2 only. The fixture proves the seam.
- **Journal per repository.** Resolve the journal directory from the repository's common git
  directory, so every worktree of one repository shares one journal. Today it resolves per
  worktree, and a plan approved in one worktree reads as not approved in another. Decide where
  the shared directory lives (for example under the common git dir's parent, or a path recorded
  in `.interlock/config.yaml`), record the decision with its because, and keep it gitignored.

## Out of scope

The runner, herdr, the sweeper, the verifier, the debrief file validator (that is
`debrief-schema`), the face's TUI, the phone channel, the substrate. Do not edit `AGENTS.md`,
either design note, the graph, `.interlock/config.yaml`, or this brief.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types and module boundaries
  carry the meaning. `// @ts-expect-error` in tests is the test.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`.
- Node pinned by `.node-version`; run everything through `mise exec --`. pnpm workspace as is.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** Every
  message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`.

## Deliverable

1. Commits satisfying the acceptance; all gates green under the invocations recorded.
2. `notes.yaml` beside this brief, appended **while you work** at every choice and surprise,
   committed with the code it belongs to (`notes@v0`).
3. `debrief.yaml` beside this brief, shape `debrief@v1` as the prior sessions used it, final
   commit, `head_sha` = last code commit. **Decisions are a manifest of the diff**: every changed
   file, including this session's own `debrief.yaml` and `notes.yaml`, appears in some decision's
   `hunks` or `produces`. Check before filing.
4. Under `open` or as a discovery: the output of replaying the real fixture under v2 (the
   approval state it yields), and the exact upcast rule you chose for a v1 receipt's missing
   duration.
