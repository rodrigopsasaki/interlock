---
interlock: brief@v1
graph: 0045-session-facts
node: brief-authoring-path
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `brief-authoring-path` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary; the unmatched becomes a gap, never a coinage)
and docs/design/0001-interlock.md for the decisions this node touches.

Field evidence: a person running a node in another repository met 'no brief; brief authoring is not
the runner's' and had to reverse-engineer brief@v1 from a sibling repository, including that the
runner rewrites the brief's gates and scope from its own view while the body carries the
instructions. Document what is actually true in code today (read packages/runner/src/sessionBrief.ts,
briefRewrite.ts and packages/cli/src/run.ts), not an aspiration.

Strict TypeScript: no `as`, no `any`, no non-null operators. Vendor knowledge only inside its adapter
(I6). The harness runs with the substrate address set to none (I5). Preserve every historical brief,
debrief, note, receipt and journal fixture. Keep scratch under the package's `test/.runs/`, never
/tmp, removed with plain rm, never rm -rf. Run through the pinned toolchain (`mise exec --`).
Commit on this node's branch with Conventional Commits whose subjects state why. No push, no merge,
no deployment; the human merges. Append typed notes for every choice and surprise; file the debrief
as your final commit, then stop and wait.
