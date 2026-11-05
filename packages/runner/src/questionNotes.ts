import { isDeepStrictEqual } from "node:util";
import { isErr } from "@phyxiusjs/fp";
import { notesFilePath, readNotesFile } from "debrief";
import { isQuestionNote, type Ledger, type Node, type Note } from "ledger";

function isRecordedQuestion(candidate: Note, recorded: readonly Note[]): boolean {
  return isQuestionNote(candidate) && recorded.some((entry) => isDeepStrictEqual(entry, candidate));
}

export function appendUnrecordedNotes(
  ledger: Ledger,
  session: string,
  notes: readonly Note[],
): void {
  const recorded = ledger.projection().sessions.get(session)?.notes ?? [];
  for (const entry of notes) {
    if (isRecordedQuestion(entry, recorded)) continue;
    ledger.append({ kind: "note-appended", session, note: entry });
  }
}

export async function recordQuestionNotes(
  ledger: Ledger,
  session: string,
  worktree: string,
  node: Node,
): Promise<void> {
  const read = await readNotesFile(notesFilePath(worktree, node.graph, node.id));
  if (isErr(read)) return;
  appendUnrecordedNotes(ledger, session, read.value.filter(isQuestionNote));
}
