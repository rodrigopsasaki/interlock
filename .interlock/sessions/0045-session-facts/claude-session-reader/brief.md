---
interlock: brief@v1
graph: 0045-session-facts
node: claude-session-reader
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `claude-session-reader` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary) and consume the session-facts contract that
node session-facts-seam defined in packages/ledger/src/sessionFacts.ts and the SessionFactsReader seam
in packages/runner/src/runtime.ts. Use that contract as it stands on this branch; do not redefine it.

Confirm before you parse. Nothing about Claude Code's session record is verified on this machine yet.
Candidates to check, not assume: herdr's Claude integration (`herdr integration status`; the hook
script under ~/.claude/hooks/) reports a session id and a transcript path at SessionStart; Claude Code
transcripts commonly live under ~/.claude/projects/<escaped cwd>/<session id>.jsonl with per-message
usage on assistant turns (input_tokens, cache_read_input_tokens, cache_creation_input_tokens,
output_tokens) and no rate-limit or quota field. Start one unattended session through the existing
catalogue (`--runtime sonnet`) in a scratch worktree or read herdr's own record of an existing Claude
pane, resolve its agent_session to a file, and quote what you observed in notes before writing a
parser. If the record cannot be resolved, follow the acceptance: keep unknown, record the evidence
gap, and leave the node held; a guessed parser does not clear it.

Fixtures are committed and synthetic: construct minimal records in the vendor's real shape, with no
real prompts, repository content, credentials or account identifiers. Strict TypeScript: no `as`, no
`any`, no non-null operators. Vendor knowledge only inside its adapter (I6). Preserve every
historical artifact and fixture. Keep scratch under the package's `test/.runs/`, never /tmp, removed
with plain rm, never rm -rf. Run through `mise exec --` and run the full `pnpm test` before handoff,
not only this node's gate. Commit with Conventional Commits whose subjects state why. No push, no
merge. Append typed notes for every choice and surprise; file the debrief as your final commit, then
stop and wait.
