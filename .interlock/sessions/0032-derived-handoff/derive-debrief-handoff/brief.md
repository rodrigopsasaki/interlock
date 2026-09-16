---
interlock: brief@v1
graph: 0032-derived-handoff
node: derive-debrief-handoff
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/debrief/recoverSessionStart.ts
  - packages/debrief/src/revise.ts
  - packages/ledger/src/debrief.ts
  - packages/runner/src/openingPrompt.ts
substrate:
  address: none
---

# Derive the identity; leave the judgment authored

Read AGENTS.md and the approved graph acceptance. Deliver its complete
prepare → author candidate → file-derived first filing workflow. Ordinary
revise stays compatible; a source head below later metadata commits is valid
there. Extract the common journal/brief/Git evidence checks out of recovery;
do not call its repair-only wrapper with a fake current debrief. Preserve that
wrapper's requirement that the mistaken old start not name a real commit.
First filing must be atomic and no-clobber, including a concurrent canonical
appearance. Reject canonical debrief.yaml as a preparation target explicitly.
The model declaration is authored input, never observed identity.

Prefer existing path/read/serialization/custody seams. No parallel parser,
dependencies, event/schema change, permission change, external effect, or
old-session modification. Keep failure paths honest, with original/candidate
bytes intact. Root will review code and run the declared gates after handoff.

One 25-minute implementation attempt. No extra agents or post-handoff edits.
Run at most one local check at a time. Retain the complete exec result including
session_id and poll a yielded process; never rerun because it yielded. Leave
full suites to the harness. If sandbox restrictions prevent a check, record it
and continue with a truthful handoff rather than changing permissions. Use
mise exec -- pnpm --silent interlock for THIS checkout's CLI; the global
interlock executable points at an older checkout. A per-command unsigned
commit is permitted if the signing key is inaccessible; don't change config.

Provisional context is a pointer to check, not a rule or proof of benefit.
Record its actual use, rejection or irrelevance honestly. Use date -u and
actual full Git hashes: the generated session brief commit is session_start_sha,
not this older template. Authorship is agent/codex/gpt-5.6-terra. Commit source
before preparing the debrief. If your new workflow is complete and safe, use it
for this session's own first handoff; otherwise leave that demonstration open.
Never overwrite an authored current debrief. Validate, commit cleanly, and stop.
