export function buildOpeningPrompt(graph: string, node: string): string {
  return (
    `This is an interlock session for node ${node} of graph ${graph}. ` +
    `Your brief is at .interlock/sessions/${graph}/${node}/brief.md in this worktree. ` +
    `Read it first and treat it as binding. Work only in this worktree. ` +
    `Append .interlock/sessions/${graph}/${node}/notes.yaml at every choice and surprise, ` +
    `commit as you go, and file .interlock/sessions/${graph}/${node}/debrief.yaml as your final commit. ` +
    `When the debrief is committed, stop and wait.`
  );
}
