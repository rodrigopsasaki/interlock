---
interlock: brief@v1
graph: 0045-session-facts
node: runner-artifact-boundary
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `runner-artifact-boundary` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary; the unmatched becomes a gap, never a coinage)
and docs/design/0001-interlock.md for the decisions this node touches.

Start from packages/runner/src/sessionScreen.ts (writes .interlock/sessions/<graph>/<node>/screen.txt
into the worktree), packages/runner/src/judgeWorktree.ts (holds on any uncommitted path) and commit
92f9d5e (which only fixed interlock's own .gitignore). The field failure happened in an unrelated
repository (jev-patterns) with no ignore rule. Keep the capture available for drilldown at a
runner-owned location; do not change what gates judge.

Strict TypeScript: no `as`, no `any`, no non-null operators. Vendor knowledge only inside its adapter
(I6). The harness runs with the substrate address set to none (I5). Preserve every historical brief,
debrief, note, receipt and journal fixture. Keep scratch under the package's `test/.runs/`, never
/tmp, removed with plain rm, never rm -rf. Run through the pinned toolchain (`mise exec --`).
Commit on this node's branch with Conventional Commits whose subjects state why. No push, no merge,
no deployment; the human merges. Append typed notes for every choice and surprise; file the debrief
as your final commit, then stop and wait.
