---
interlock: brief@v1
graph: 0045-session-facts
node: session-facts-seam
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `session-facts-seam` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary; the unmatched becomes a gap, never a coinage)
and docs/design/0001-interlock.md for the decisions this node touches.

This node defines the contract every later node consumes: the fact labels committed in node
prompt-delivery-facts (`Prompt received: yes|unknown`, `Last activity: <RFC3339>|unknown`,
`Usage: <raw counters>|unknown`, `Quota: <raw window and used percentage>|unknown`, `Delivery
basis: record|status`) must be representable by what you define here. Look first at how graph 0043
added `runtime: { name, kind, model }` to the session-opening event with an upcaster
(packages/ledger, event@v6); follow that precedent rather than inventing a new persistence path.

Strict TypeScript: no `as`, no `any`, no non-null operators. Vendor knowledge only inside its adapter
(I6). The harness runs with the substrate address set to none (I5). Preserve every historical brief,
debrief, note, receipt and journal fixture. Keep scratch under the package's `test/.runs/`, never
/tmp, removed with plain rm, never rm -rf. Run through the pinned toolchain (`mise exec --`).
Commit on this node's branch with Conventional Commits whose subjects state why. No push, no merge,
no deployment; the human merges. Append typed notes for every choice and surprise; file the debrief
as your final commit, then stop and wait.
