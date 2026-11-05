import {
  answersQuestion,
  isQuestionNote,
  type Note,
  type QuestionNote,
  type SaidView,
} from "ledger";

export type Asking =
  | {
      readonly asked: string;
      readonly options?: readonly string[];
      readonly because?: string;
      readonly at: string;
    }
  | {
      readonly asked: null;
      readonly because: string;
      readonly at: string;
    };

export interface Heard {
  readonly by: string;
  readonly text: string;
  readonly at: number;
}

function latestQuestion(notes: readonly Note[]): QuestionNote | undefined {
  return notes.filter(isQuestionNote).at(-1);
}

function isAcknowledged(entry: SaidView): boolean {
  return entry.delivery?.state === "acknowledged";
}

function answersTo(question: QuestionNote, said: readonly SaidView[]): readonly SaidView[] {
  return said.filter((entry) => answersQuestion(entry.said, question));
}

export function openQuestionOf(
  notes: readonly Note[],
  said: readonly SaidView[],
): QuestionNote | undefined {
  const question = latestQuestion(notes);
  if (question === undefined) return undefined;
  return answersTo(question, said).some(isAcknowledged) ? undefined : question;
}

export function heardOf(said: readonly SaidView[]): Heard | undefined {
  const latest = said.filter(isAcknowledged).at(-1);
  return latest === undefined
    ? undefined
    : { by: latest.said.by, text: latest.said.text, at: latest.said.at };
}

function undeliveredBecause(answer: SaidView): string {
  const doubt =
    answer.delivery === undefined
      ? "no delivery was recorded after the words were"
      : answer.delivery.because;
  return `${answer.said.by}'s answer at ${new Date(answer.said.at).toISOString()} is not known to have reached the pane (${doubt}), so the question stays open`;
}

export function askingOf(
  notes: readonly Note[],
  said: readonly SaidView[],
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
  const answers = answersTo(question, said);
  const heard = answers.filter(isAcknowledged).at(-1);
  if (heard !== undefined) {
    return {
      asked: null,
      because: `the session is blocked, and its last question, at ${question.at}, was answered by ${heard.said.by} at ${new Date(heard.said.at).toISOString()}`,
      at,
    };
  }
  const doubted = answers.at(-1);
  const open = {
    asked: question.asked,
    ...(question.options === undefined ? {} : { options: question.options }),
    at: question.at,
  };
  return doubted === undefined ? open : { ...open, because: undeliveredBecause(doubted) };
}
