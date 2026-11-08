import { defaultRoleTable } from "debrief";
import type { NodeRole } from "face";
import type { CommitMode } from "./runtimeCatalogue.ts";

export type SessionRole = "worker" | "interpreter" | NodeRole;

const HEAVY_COMMAND_INSTRUCTION =
  "Run one heavy command at a time, never several in parallel or in the background; never pipe a test runner into head or tail.";

function roleSentenceFor(graph: string, role: SessionRole, roleParagraph?: string): string {
  switch (role) {
    case "worker":
      return "";
    case "interpreter":
      return (
        `This session produces .interlock/graphs/${graph}.yaml for a person to approve or ` +
        "correct; it never leases or runs a node. "
      );
    default:
      return `${roleParagraph ?? defaultRoleTable[role].prompt} `;
  }
}

export interface PriorWork {
  readonly uncommittedPaths: number;
  readonly commitsBeyondBase: number;
}

export function buildOpeningPrompt(
  graph: string,
  node: string,
  priorWork?: PriorWork,
  role: SessionRole = "worker",
  openingView?: string,
  roleParagraph?: string,
  commits: CommitMode = "agent",
): string {
  const commitInstruction =
    commits === "runner"
      ? `Do not commit. Leave your changes in the worktree and write commits.yaml beside the brief, shaped commits@v0 with ordered entries [{message, paths}], fallback_subject for remaining code paths, and optional co_authored_by. The runner owns all commits for this attempt; this instruction replaces commit instructions in the brief. Stop after code and commits.yaml; wait for the runner to give you the code HEAD before preparing or filing your debrief. `
      : `commit as you go, and file .interlock/sessions/${graph}/${node}/debrief.yaml as your final commit. `;
  const roleSentence = roleSentenceFor(graph, role, roleParagraph);
  const derivedFilingSentence =
    role !== "interpreter"
      ? `For a first filing, run interlock debrief prepare ${graph} ${node} --to <candidate-path> --agent-runtime <runtime> --agent-model <model>, or replace both agent flags with --human <name>; author its claims and reports, then run ` +
        `interlock debrief preview --file <candidate-path> to inspect it read-only if useful before interlock debrief file-derived ${graph} ${node} --from <candidate-path>. After source changes, ${commits === "runner" ? "wait for the runner to commit code, then" : "commit,"} prepare a fresh candidate, author it, inspect it if useful, and file it. `
      : "";
  const previewSentence =
    role === "interpreter"
      ? "Before filing a candidate, optionally inspect it read-only with interlock debrief preview --file <candidate-path>. "
      : "";
  const briefSentence =
    openingView === undefined
      ? `Your brief is at .interlock/sessions/${graph}/${node}/brief.md in this worktree. ` +
        `Read it first and treat it as binding. `
      : `Your canonical brief is at .interlock/sessions/${graph}/${node}/brief.md in this worktree. ` +
        `Read the derived opening view included below first; the canonical brief remains binding and is available on demand. `;
  const base =
    `This is an interlock session for node ${node} of graph ${graph}. ` +
    `${briefSentence}Work only in this worktree. ` +
    roleSentence +
    `Append .interlock/sessions/${graph}/${node}/notes.yaml at every choice and surprise, ` +
    commitInstruction +
    `Before you stop to wait for a person in your pane, append a question note to that notes.yaml ` +
    `(kind: question, at, asked in the words you would say to the person, and optional options, ` +
    `the short answers you would accept), then ask in the pane as you do today. ` +
    derivedFilingSentence +
    previewSentence +
    `When correcting an authored debrief, keep the correction in this session directory and run ` +
    `interlock debrief revise ${graph} ${node} --from <candidate-path> to select it. ` +
    `${HEAVY_COMMAND_INSTRUCTION} ` +
    (commits === "runner"
      ? `When the debrief is filed, stop and wait without committing. `
      : `When the debrief is committed, stop and wait. `) +
    `Keep scratch work under this package's test/.runs/ directory, never /tmp, and remove it ` +
    `with plain rm, never rm -rf. ` +
    `If the connection drops or your turn ends early, the next prompt resumes from git status ` +
    `and notes.yaml.`;

  const withPriorWork =
    priorWork === undefined
      ? base
      : `${base} ` +
        `This worktree carries work from an earlier session of this node: ` +
        `${priorWork.uncommittedPaths} uncommitted path(s) and ${priorWork.commitsBeyondBase} commit(s) beyond the graph base. ` +
        `Read notes.yaml, git status and git log before you continue, and do not redo finished work.`;
  return openingView === undefined ? withPriorWork : `${withPriorWork}\n\n${openingView}`;
}
