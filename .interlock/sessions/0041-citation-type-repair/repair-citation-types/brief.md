---
interlock: brief@v1
graph: 0041-citation-type-repair
node: repair-citation-types
role: worker
gates: []
scope: []
context_scope:
  - packages/verifier/src/foundAt.ts
  - packages/verifier/test/foundAt.test.ts
  - packages/runner/test/debriefAuthoringGuidance.test.ts
substrate:
  address: none
---

## Task

Complete the graph's narrow type repair. The baseline is the held citation
candidate, not accepted product. Read AGENTS and the exact acceptance. The
known TS2379 is at the explicitLocations addLocation push: absent locatorQuote
must be omitted. Do not change runtime behavior or old artifacts.

Actual authorship is codex/gpt-5.6-terra. Use date -u for note timestamps,
full Git IDs, and mise exec for the pinned toolchain. Run full typecheck before
handoff as well as both focused tests and lint. Retain yielded command handles;
do not blindly duplicate a running check. Use normal prepare, author, preview,
file-derived and validate. If signing is unavailable, per-command unsigned
commits are permitted. One25-minute attempt; no subagents or permission/config
changes. Stop after the committed canonical debrief; the harness judges it.
