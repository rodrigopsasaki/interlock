---
interlock: brief@v1
graph: 0011-concise-opening
node: project-opening-view
role: worker
gates: []
scope:
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/sessionDrive.ts
  - packages/runner/src/openingPrompt.ts
  - packages/runner/test/sessionBrief.test.ts
  - packages/runner/test/openingPrompt.test.ts
  - packages/cli/test/run.test.ts
substrate:
  address: none
---

# Keep the brief, shorten the opening view

Read AGENTS.md, docs/design/0001-interlock.md and this node's graph acceptance.
The graph acceptance is the bounded contract; this brief names entry points.
Before code, append a short acceptance-to-assertion map in your notes.
Start at sessionBrief.ts where final context and frontmatter are rendered.
Derive the view from that final canonical content, never from the authored
source. Return an optional view beside path/narration, carry it through
sessionDrive only after canonical commit, and append it in openingPrompt.
No view must preserve the current prompt exactly, including interpreter.
A small local formatter is allowed; no new persisted format or schema.

The view's only omission is the enumerated scope. Keep every other generated
frontmatter field and exact final body/context. Declare scope_count and
scope_sha256 = SHA256 of UTF-8 JSON.stringify(the exact authoritative scope
array in committed order). Give its canonical relative path. Canonical brief
remains binding; label this a derived opening view with the inventory
available on demand. Do not tell the worker to dump the full canonical brief
immediately anyway. Preserve role, recovery, stop and safety instructions.

In CLI run.test.ts use a real committed fixture with3000 inventory paths,
capture the actual fake-runtime prompt, and verify the canonical file was
committed before prompt, its parsed scope and session-started ledger scope
are complete, and a sentinel inventory-only path is absent from the prompt.
Body paths are not inventory-only: retain them. Assert gates/commands/role/
graph/node/runner metadata, count/hash/path and body. sessionBrief tests
cover rendered context verbatim and none; openingPrompt tests cover exact
legacy fallback, recovery and interpreter. Do not alter substrate queries
or acceptance/receipt/gate scope to make the prompt smaller.

## Environment and completion

Use mise exec -- pnpm, Node24.14.0. The default shell Node is26.
Local listeners/process inspection can be denied; do not retry EPERM,
increase timeouts or invent workarounds. Deterministic focused tests are fine;
the harness runs standing gates. No new dependencies, other agents, external
services, graph/brief edits, prior-session artifact edits, gate waivers,
push, main/remote merge or global configuration changes.

Read current source/tests rather than other sessions for artifact examples.
For artifact shapes, use schemas/notes@v0.json and schemas/debrief@v2.json
and current debrief reader. Read only your own notes/debrief as they appear.
Every choice and surprise gets actual UTC from a clock, not an estimated time.
Record runtime codex/model gpt-5.6-terra. graph_base_sha comes from the
generated brief; session_start_sha is its initial commit. head_sha is the
last implementation commit before final artifacts, not an invented HEAD.
Use Conventional why-commits; per-command commit.gpgsign=false is allowed.

Write final artifact content, then run the existing CLI schema reference
generator and --check in this node worktree. Do not hand-edit docs/shapes.md,
run the generator against a controller's ignored local state, or change
artifacts again without regenerating. Final debrief says which acceptance
is met or unmet and cites actual proof limitations. Commit and stop.

## Context slice

No substrate address is required for this implementation. Absence is valid.

