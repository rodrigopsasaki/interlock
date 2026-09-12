export interface PriorWork {
  readonly uncommittedPaths: number;
  readonly commitsBeyondBase: number;
}

export function buildOpeningPrompt(graph: string, node: string, priorWork?: PriorWork): string {
  const base =
    `This is an interlock session for node ${node} of graph ${graph}. ` +
    `Your brief is at .interlock/sessions/${graph}/${node}/brief.md in this worktree. ` +
    `Read it first and treat it as binding. Work only in this worktree. ` +
    `Append .interlock/sessions/${graph}/${node}/notes.yaml at every choice and surprise, ` +
    `commit as you go, and file .interlock/sessions/${graph}/${node}/debrief.yaml as your final commit. ` +
    `When the debrief is committed, stop and wait. ` +
    `Keep scratch work under this package's test/.runs/ directory, never /tmp, and remove it ` +
    `with plain rm, never rm -rf. ` +
    `If the connection drops or your turn ends early, the next prompt resumes from git status ` +
    `and notes.yaml.`;

  if (priorWork === undefined) return base;

  return (
    `${base} ` +
    `This worktree carries work from an earlier session of this node: ` +
    `${priorWork.uncommittedPaths} uncommitted path(s) and ${priorWork.commitsBeyondBase} commit(s) beyond the graph base. ` +
    `Read notes.yaml, git status and git log before you continue, and do not redo finished work.`
  );
}
