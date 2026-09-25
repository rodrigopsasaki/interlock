---
interlock: brief@v1
graph: 0045-session-facts
node: session-facts-position
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `session-facts-position` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary). This branch already contains the cleared
work of session-facts-seam (packages/ledger/src/sessionFacts.ts: Known/Unknown facts, delivery as a
record|status union), codex-session-reader (packages/runner/src/herdr/codex.ts) and
claude-session-reader (packages/runner/src/claude/adapter.ts). Read their notes.yaml and debriefs
under .interlock/sessions/0045-session-facts/ before you start; they record surprises you inherit.

Render the facts with the exact labels the graph commits to (`Prompt received: yes|unknown`,
`Last activity: <RFC3339>|unknown`, `Usage: <raw counters>|unknown`, `Quota: <raw window and used
percentage>|unknown`, `Delivery basis: record|status`); the dogfood nodes' gates match those words in
`interlock session show` output with the regex
'Prompt received: yes[\s\S]*Last activity: \d{4}-\d{2}-\d{2}T[^\n]+[\s\S]*Usage: (?!unknown)[^\n]+[\s\S]*Quota: [^\n]+',
so a correct Codex session must render all five lines in that order in session show. Usage renders the
raw counters (and may name input/output/cached/reasoning first); never convert tokens to money.

Strict TypeScript: no `as`, no `any`, no non-null operators. Vendor knowledge only inside its adapter
(I6). The harness runs with the substrate address set to none (I5). Preserve every historical
artifact and fixture. Keep scratch under the package's `test/.runs/`, never /tmp, removed with plain
rm, never rm -rf. Run through `mise exec --` and run the full `pnpm test` before handoff, not only
this node's gate. Commit with Conventional Commits whose subjects state why. No push, no merge. Append
typed notes for every choice and surprise; file the debrief as your final commit, then stop and wait.
