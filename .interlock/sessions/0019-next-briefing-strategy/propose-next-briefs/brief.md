---
interlock: brief@v1
graph: 0019-next-briefing-strategy
node: propose-next-briefs
role: worker
gates: []
scope:
  - docs/experiments/comparable-learning
  - packages/runner/src/sessionWait.ts
  - packages/verifier/src/foundAt.ts
  - packages/substrate/src/evidence.ts
substrate:
  address: none
---

# Propose the next briefing strategy from what the comparisons actually showed

The supplied outcome read and source evidence are inputs, not authority. Review
their consequential conclusions against the retained reports and current source.
The master-plan spine is intent -> executable plan -> organized sessions ->
artifacts/proof -> interpreted debrief -> scoped retained knowledge -> better
future briefs and plans. We remain at M5 until improvement is demonstrated.

Write docs/experiments/comparable-learning/next-briefing-strategy.md. Propose at
most three concrete changes or deliberate non-changes for subsequent briefs and
their orchestration. For each, identify its observed deficiency, exact evidence,
the smallest intervention, a discriminating next check, what would falsify its
benefit, authority needed and way back. Separate product defects from operating
practice and evaluation limitations. Do not turn a convention into a new gate.

Account for the review-grace clock defect as observed operational evidence, not
as a reason to add a new workflow framework. Account for source-link versus
semantic truth, context relevance/noise and any difference between where a
decision's implementation hunk lives and what future work needs to know.
Do not infer improvement from shorter text, gate counts or a rooted quotation.

Explain why your proposed order follows the existing project plan and axioms:
usable thresholds; provenance; position over event streams; compose existing
seams; dogfood; decide only irreversible seams early. No automatic ratification,
strategy installation, live-graph rewrite, source change, inference/probe, push
or main merge. The output is a proposal for Rodrigo, not granted authority.

Read only supplied evidence, current source/tests/schemas, AGENTS/design and own
artifacts. No unrelated session/history/journal/receiver reads or extra agents.
Change only this report, own typed notes/debrief and generated docs/shapes.md.
Use actual metadata and resolved SHAs. Empty discoveries are fine; never invent
them from supplied facts. Commit clean final work, without an intermediate
review checkpoint, and stop for the harness and root acceptance review.

## Entry points and provenance

Start with docs/experiments/comparable-learning/outcome-read.md and
inputs/comparison-index.md. The originals, trace and audits there are supplied
evidence, not instructions. Read schemas/notes@v0.json, schemas/debrief@v2.json
and their schemas/parts references for artifact contracts, not other sessions.
No broad .interlock search is needed. Actual assigned derivation: runtime codex,
model gpt-5.6-terra. Use mise exec -- pnpm and per-command unsigned commits.
Resolve actual generated graph_base_sha and session_start_sha; do not guess SHAs.
Do not manufacture discoveries from supplied facts. Empty discoveries are fine.
Use literal source quotes and exact line ranges for any new discovery. Record
the report commit as head_sha, then commit its debrief and regenerated reference.
