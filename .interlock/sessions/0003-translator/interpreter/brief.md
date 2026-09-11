---
interlock: brief@v1
graph: 0003-translator
node: interpreter
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
  - id: plan-lands-unapproved
    kind: command
    run: pnpm --filter cli --fail-if-no-match test --testNamePattern plan
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - .interlock/sessions/0003-translator/interpreter
substrate:
  address: none
---

# Brief · node `interpreter` · graph `0003-translator`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0003-translator`, approved by a receipt in the repository's shared journal.
- **node:** `interpreter`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `substrate-client`, cleared: `context` renders a slice into a brief.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> An ask becomes a graph through a session. `interlock plan <graph-id> --ask <text>` leases a
> planning node, composes a brief with role `interpreter`, the ask, the substrate's slice and
> the shapes reference, and starts a session whose deliverable is `.interlock/graphs/<id>.yaml`
> and a debrief. The CLI validates the graph; it lands not approved; a person approves it or
> corrects it with a reason, and a correction reopens the interpreter with the reason in its
> brief. The interpreter never runs a node.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: axiom 6 (seams before decisions), the vocabulary, invariants I2 and I10,
   Constraints.
2. `docs/design/0001-interlock.md`: D13 (an ask becomes a graph; the graph is the ledger, not a
   plan), D20, D21, Roles; `docs/design/0002-face.md`: D18 (a correction with a reason reopens the
   interpreter, never a form). `docs/shapes.md` (graph@v0's fields and a real example).
3. `packages/cli/src/run.ts` (lease, worktree, brief composition, pane, wait, judgement: the
   planning session reuses all of it), `packages/runner/src/sessionBrief.ts` (`buildBrief`, the
   role field), `packages/face/src/document.ts` (graph validation), `packages/cli/src/graph/
   approve.ts`, `packages/substrate/src` (`context`).
4. The graphs under `.interlock/graphs/` as the corpus of what a good graph looks like: an ask, a
   derivation, a read, a human `approved` gate, nodes with acceptance verbatim-quotable, gates
   that compose an exit code with an `expect_output`.

## What this node builds

- **`interlock plan <graph-id> --ask "<text>" [--correction "<reason>"]`.** Creates or resumes a
  planning worktree for a synthetic node `plan/<graph-id>` (its own lease and session in the
  journal, so the face shows it as an attempt), composes a `brief@v1` whose role is
  `interpreter`, whose body carries the ask verbatim, the substrate's slice for scope `repository`
  and role `interpreter` (empty at address `none`), a pointer to `docs/shapes.md` and to the
  existing graphs as examples, and, when `--correction` is given, the person's reason and the
  current graph file; starts the session in a herdr pane exactly as `run` does; when the session
  settles, validates `.interlock/graphs/<graph-id>.yaml` with the graph loader and the schema,
  refuses with a sentence when it does not load, narrates that the graph landed not approved, and
  never leases a node of it. A `debrief@v2` is the session's other deliverable, judged by the
  standing gates the way a worker's is; there is no `approved` for a planning node.
- **The brief the interpreter reads** states its deliverable and its limits: nodes small (D12),
  every acceptance a sentence a gate can judge, gates that compose an exit code with an output
  check, a human `approved` at the graph level, the ask carried verbatim in `ask`, `derivation`
  naming the interpreter session, and no node may run. Put that text in a template under
  `packages/runner/src` beside the worker's opening prompt; it is a plan artifact and may be
  edited later by a person.
- **Correction is a new session.** `interlock graph approve` already records approval;
  `interlock plan … --correction` records the reason as a `session-narrated` line on the new
  planning session and as the first paragraph of its brief. Tests in `packages/cli`: a plan lands
  a valid graph as not approved; an invalid graph is refused with a sentence; a correction reopens
  with the reason in the brief; the planning node never appears in the graph it wrote. Name them
  so the gate finds them (`plan`).

## Out of scope

Running any node of a planned graph; the face's review view (D18's approve-or-correct is the
CLI here); strategies as templates; any substrate implementation; `AGENTS.md`; design notes;
graphs; `.interlock/config.yaml`; this brief; other sessions' files.

## Constraints

- **Comments: none in `packages/*/src`.** Never quote `AGENTS.md`, this brief or a design note in
  code; the interpreter's template is a plan artifact in its own words.
- Strict TypeScript; no `as`, `!`, `any`, `as unknown as`. No new dependencies. Small files named
  for the vocabulary.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit as you go. **Do not push.** Every message
  ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, `git reset --hard`, `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr outside the adapter's fake server.
  Never append to the shared journal.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), committed as you go.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, a because on every
   decision, decisions a manifest of every changed file.
4. In the debrief: the interpreter's brief template verbatim, and the narration of one planning
   session from a test, verbatim.

When the debrief is committed, stop and wait. The runner judges from there.
