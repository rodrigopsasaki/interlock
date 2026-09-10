import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export type Note =
  | {
      readonly kind: "choice";
      readonly at: string;
      readonly chose: string;
      readonly because: string;
      readonly rejected?: readonly string[];
    }
  | {
      readonly kind: "surprise";
      readonly at: string;
      readonly expected: string;
      readonly observed: string;
    };

export const note = {
  choice: (
    at: string,
    chose: string,
    because: string,
    rejected?: readonly string[],
  ): Note =>
    rejected === undefined
      ? { kind: "choice", at, chose, because }
      : { kind: "choice", at, chose, because, rejected },
  surprise: (at: string, expected: string, observed: string): Note => ({
    kind: "surprise",
    at,
    expected,
    observed,
  }),
};

export function isNote(value: unknown): value is Note {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string" || !isString(prop(value, "at"))) return false;
  switch (kind) {
    case "choice": {
      const rejected = prop(value, "rejected");
      return (
        isString(prop(value, "chose")) &&
        isString(prop(value, "because")) &&
        (rejected === undefined || isStringArray(rejected))
      );
    }
    case "surprise":
      return (
        isString(prop(value, "expected")) && isString(prop(value, "observed"))
      );
    default:
      return false;
  }
}
