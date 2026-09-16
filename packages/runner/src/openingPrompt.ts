export interface PriorWork {
  readonly uncommittedPaths: number;
  readonly commitsBeyondBase: number;
}

export function buildOpeningPrompt(
  graph: string,
  node: string,
  priorWork?: PriorWork,
  role = "worker",
  openingView?: string,
): string {
  const roleSentence =
    role === "interpreter"
      ? `This session produces .interlock/graphs/${graph}.yaml for a person to approve or ` +
        "correct; it never leases or runs a node. "
      : "";
  const derivedFilingSentence =
    role === "worker"
      ? `For a first filing, run interlock debrief prepare ${graph} ${node} --to <candidate-path> --agent-runtime <runtime> --agent-model <model>, or replace both agent flags with --human <name>; author its claims and reports, then run ` +
        `interlock debrief preview --file <candidate-path> to inspect it read-only if useful before interlock debrief file-derived ${graph} ${node} --from <candidate-path>. After source changes, commit, prepare a fresh candidate, author it, inspect it if useful, and file it. `
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
    `commit as you go, and file .interlock/sessions/${graph}/${node}/debrief.yaml as your final commit. ` +
    derivedFilingSentence +
    previewSentence +
    `When correcting an authored debrief, keep the correction in this session directory and run ` +
    `interlock debrief revise ${graph} ${node} --from <candidate-path> to select it. ` +
    `When the debrief is committed, stop and wait. ` +
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
