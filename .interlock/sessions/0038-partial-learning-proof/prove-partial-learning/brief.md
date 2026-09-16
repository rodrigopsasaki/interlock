---
interlock: brief@v1
graph: 0038-partial-learning-proof
node: prove-partial-learning
role: worker
gates: []
scope: []
context_scope:
  - packages/runner/test/absorbOutbox.test.ts
  - packages/runner/src/gateJudge.ts
  - packages/verifier/src/verify.ts
substrate:
  address: none
---

## Task

Deliver the complete approved proof repair. Read AGENTS and the current sources;
received hypotheses are provisional and no-use is valid. Do not edit older
sessions or production behavior. Actual authorship is codex/gpt-5.6-terra.
Use date -u for actual note times, full Git IDs, mise exec for commands; retain
yielded exec handles, one local check at a time. Prefer focused tests plus lint;
the harness independently runs all declared gates. Use normal prepare/author/
file-derived handoff after source commit, preserve candidates, and stop once
the canonical debrief is committed. No agents, dependencies, configuration,
trust/permission changes, push, merge, deployment, external inference or live
brain access. Per-command unsigned commits are allowed if signing is unavailable.
