import { createHash } from "node:crypto";
import type { QuestionNote } from "./note.ts";
import { isRecord, isString, prop } from "./validate.ts";

export interface AnsweredQuestion {
  readonly at: string;
  readonly asked: string;
}

export interface PersonSaid {
  readonly id: string;
  readonly by: string;
  readonly text: string;
  readonly at: number;
  readonly answers?: AnsweredQuestion;
  readonly because?: string;
}

export interface PersonSaying {
  readonly session: string;
  readonly by: string;
  readonly text: string;
  readonly at: number;
  readonly answers?: QuestionNote;
  readonly because?: string;
}

export function personSaid(saying: PersonSaying): PersonSaid {
  const answers =
    saying.answers === undefined
      ? undefined
      : { at: saying.answers.at, asked: saying.answers.asked };
  const id = createHash("sha256")
    .update(
      JSON.stringify({
        session: saying.session,
        by: saying.by,
        text: saying.text,
        at: saying.at,
        answers,
        because: saying.because,
      }),
    )
    .digest("hex");
  return {
    id,
    by: saying.by,
    text: saying.text,
    at: saying.at,
    ...(answers === undefined ? {} : { answers }),
    ...(saying.because === undefined ? {} : { because: saying.because }),
  };
}

export function answersQuestion(said: PersonSaid, question: QuestionNote): boolean {
  return said.answers?.at === question.at && said.answers.asked === question.asked;
}

function isAnsweredQuestion(value: unknown): value is AnsweredQuestion {
  return isRecord(value) && isString(prop(value, "at")) && isString(prop(value, "asked"));
}

export function isPersonSaid(value: unknown): value is PersonSaid {
  if (!isRecord(value)) return false;
  const id = prop(value, "id");
  const at = prop(value, "at");
  const answers = prop(value, "answers");
  const because = prop(value, "because");
  return (
    isString(id) &&
    /^[a-f0-9]{64}$/.test(id) &&
    isString(prop(value, "by")) &&
    isString(prop(value, "text")) &&
    typeof at === "number" &&
    Number.isFinite(at) &&
    (answers === undefined || isAnsweredQuestion(answers)) &&
    (because === undefined || isString(because))
  );
}
