---
interlock: brief@v1
graph: 0022-context-delivery
node: deliver-context-slice
role: worker
gates: []
scope: []
context_scope:
  - packages/runner/src/contextSlice.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/openingView.ts
  - packages/runner/test/sessionBrief.test.ts
substrate:
  address: none
---

# Make retrieved context reach the session

Read AGENTS.md, the design note and graph acceptance. Implement the narrow
composition fix with regression proof. In the previous real run, context
retrieval succeeded but the canonical brief and opening contained no items:
withRenderedContextSlice returned the source unchanged without its heading.
Keep structure in the runner and knowledge selection in the substrate.

The supplied context may include earlier unratified findings. Check any useful
one against source before relying on it; do not manufacture a use claim. This
source includes the current required heading so the existing composer can supply
context while you repair the unheaded case. Do not alter your started brief.

You own only this task checkout. No other agents, sibling edits, push, merge,
new trust or sandbox changes, live-brain writes or direct network effects.
The harness handles the disposable receiver. No new dependency or standing gate
change. Use mise exec -- pnpm and git -c commit.gpgsign=false. No new source
comments, type assertions or non-null assertions. Run focused tests while
working; do not repeat the full standing suite from the restricted worker.
The harness runs that suite after handoff and alone supplies its receipts.

Append actual-time typed notes. Finalize a truthful debrief naming actual source
and model: codex / gpt-5.6-terra / high. Keep applicability distinct from evidence
location if you declare applies_to; source-check all claims. For a correction,
use the existing debrief revise command with an authored candidate, preserving
old bytes. The implementation head precedes the final artifact commit. Generate
the schema reference if needed, commit cleanly, and finish normally without a
prose checkpoint. Root does not author your debrief.

## Context slice

No substrate is addressed in the authored source. The runner composes this
section before starting the session.
