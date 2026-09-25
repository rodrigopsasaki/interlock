---
interlock: brief@v1
graph: 0045-session-facts
node: dogfood-codex-facts
role: worker
gates: []
scope: []
substrate:
  address: none
---

This node is the proof of graph 0045 and its work is to be observed, not to change source. You are
running as codex (luna), started unattended by the runner built from this graph's own plan branch. Read the
acceptance of node `dogfood-codex-facts` in `.interlock/graphs/0045-session-facts.yaml` and AGENTS.md.

Do exactly this: append one note to .interlock/sessions/0045-session-facts/dogfood-codex-facts/notes.yaml recording
that you received this brief and your runtime and model as you know them; run
`pnpm interlock session show 0045-session-facts dogfood-codex-facts` and record in a second note what it shows for
Prompt received, Last activity, Usage, Quota and Delivery basis at that moment (it may still read
unknown while your turn is in progress; say so rather than guessing); commit; then file your debrief
as your final commit and stop. Make no changes outside this node's session directory. Do not re-run
or edit gates. If anything contradicts the acceptance (for example your own session reads
Delivery basis: status), record it as a surprise with expected and observed; that is the finding this
node exists to surface. No push, no merge.
