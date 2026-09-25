---
interlock: brief@v1
graph: 0045-session-facts
node: prompt-delivery-facts
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `prompt-delivery-facts` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary). This branch already contains the cleared
work of session-facts-seam (packages/ledger/src/sessionFacts.ts: Known/Unknown facts, delivery as a
record|status union), codex-session-reader (packages/runner/src/herdr/codex.ts) and
claude-session-reader (packages/runner/src/claude/adapter.ts). Read their notes.yaml and debriefs
under .interlock/sessions/0045-session-facts/ before you start; they record surprises you inherit.

Review of the two cleared readers found that neither can work in a live run yet, and wiring them is
this node's job ('wire the session identity and reader through the runner adapter boundary'):
(1) Both readers read only `AgentIdentity.sessionPath`, but herdr reports only an id for both
runtimes on this machine (`"agent_session": {"source":"herdr:codex","kind":"id","value":...}`, same for
herdr:claude; herdr's Claude hook sends a path only when Claude's SessionStart payload carries
transcript_path, which it did not here; see claude-session-reader's notes). Resolve the record path
inside each vendor's adapter from what was observed on this machine: Codex by id under the Codex
home's sessions tree (`~/.codex/sessions/YYYY/MM/DD/rollout-<local timestamp>-<id>.jsonl`, honouring
CODEX_HOME), Claude at `~/.claude/projects/<cwd with / and . replaced by ->/<id>.jsonl` (verify the
escaping against a real file on this machine; honour CLAUDE_CONFIG_DIR), and prefer a path herdr
reports whenever it reports one. (2) The herdr adapter wires the Codex reader for every pane; select
the reader by the agent's kind (codex, claude), and a runtime kind with no reader gets no reader, so
delivery uses the status rule and records deliveryBasis status. (3) A reader whose record does not
exist yet is the normal state for Codex before its first prompt lands (the field failure is exactly
that), so it must keep the prompt untaken and let the existing retry and grace decide; test that a
record that appears late is taken within grace, and that the herdr session id itself may be absent
until the prompt lands. Test (1) and (2) against fixture homes under test/.runs, never the real home.

Strict TypeScript: no `as`, no `any`, no non-null operators. Vendor knowledge only inside its adapter
(I6). The harness runs with the substrate address set to none (I5). Preserve every historical
artifact and fixture. Keep scratch under the package's `test/.runs/`, never /tmp, removed with plain
rm, never rm -rf. Run through `mise exec --` and run the full `pnpm test` before handoff, not only
this node's gate. Commit with Conventional Commits whose subjects state why. No push, no merge. Append
typed notes for every choice and surprise; file the debrief as your final commit, then stop and wait.
