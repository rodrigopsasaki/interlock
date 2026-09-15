---
interlock: brief@v1
graph: 0023-debrief-validation
node: validate-current-debrief
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/debrief/validate.ts
  - packages/schemas/test/corpus.files.test.ts
  - packages/debrief/src/revise.ts
  - schemas/parts/debrief-derivation.json
substrate:
  address: none
---

# Current validity and retained history are different obligations

Read AGENTS.md, the design note and graph acceptance. This is implementation,
not another report. The prior worker's debrief validate command accepted extra
derivation metadata, while the full corpus test and real receiver rejected it.
After correction through debrief revise, the receiver accepted the new artifact
but the corpus now rejected the exact bad bytes kept under revisions/. Never
delete or rewrite the evidence to make a test pass.

The rejected source is available in this repository's existing Git objects:
3dc10b7bf3950c1447ce6792e1a21c43429caabf:.interlock/sessions/0022-context-delivery/deliver-context-slice/debrief.yaml.
The preserved copy at a7ff29adddff239eee2f799b7cb112f989f984d0 is under that
session's revisions/81ee5f0dd6dc50a26cb3d6f620309fe5ec16b96a1a2c8e3f06e6860f5305d6d3.yaml.
Read those objects for the reproduction; do not edit the other checkout or
merge its unaccepted branch. Root owns later assembly and actual-case judgment.

Use the schema package already depended on by CLI, only at the advertised v2
validation door. Do not tighten shared readers: the repair operation still
needs to read old invalid bytes. Keep the history check narrow and affirmative:
prove custody by exact SHA-256, and leave every non-history artifact under its
normal schema checks. Add tests that would fail if a canonical bad file were
merely moved, renamed or silently exempted. No new dependency or substrate verb.

You own only this checkout. No extra agents, sibling edits, push, merge, new
trust, sandbox edits or network effects. The runner owns the disposable substrate
exchange. Use mise exec -- pnpm and git -c commit.gpgsign=false. No new source
comments or type/non-null assertions. Focused tests while working; the harness
alone runs standing gates and produces their receipts. No gate-command changes.

Keep actual-time typed notes and a truthful debrief. Agent derivation has exactly
kind, runtime and model; this runtime is codex / gpt-5.6-terra. Attribute root
reports as reports in notes, not as gates you ran. Verify any incoming hypothesis
against source; do not invent a use claim. Use the revision tool for corrections,
validate the final candidate with the published schema as well, commit cleanly,
then finish normally. Keep started brief bytes immutable.

## Context slice

The runner supplies any selected context here before starting the session.
