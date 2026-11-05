import { isQuestionNote, type Note, type QuestionNote } from "ledger";

export type Asking =
  | {
      readonly asked: string;
      readonly options?: readonly string[];
      readonly at: string;
    }
  | {
      readonly asked: null;
      readonly because: string;
      readonly at: string;
    };

function latestQuestion(notes: readonly Note[]): QuestionNote | undefined {
  return notes.filter(isQuestionNote).at(-1);
}

export function askingOf(
  notes: readonly Note[],
  attemptEnded: boolean,
  blockedObservedAtWallMs: number,
): Asking {
  const at = new Date(blockedObservedAtWallMs).toISOString();
  const question = latestQuestion(notes);
  if (question === undefined) {
    return {
      asked: null,
      because: "the session is blocked and wrote no question note before it stopped",
      at,
    };
  }
  if (attemptEnded) {
    return {
      asked: null,
      because: `the session is blocked, and its last question, at ${question.at}, counts as answered because the attempt ended`,
      at,
    };
  }
  return question.options === undefined
    ? { asked: question.asked, at: question.at }
    : { asked: question.asked, options: question.options, at: question.at };
}
