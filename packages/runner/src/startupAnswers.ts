import { err, ok, type Result } from "@phyxiusjs/fp";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export interface StartupAnswer {
  readonly matches: string;
  readonly keys: readonly string[];
}

const REGEX_LITERAL = /^\/(.*)\/([a-z]*)$/s;

function parseRegexLiteral(
  pattern: string,
): { readonly body: string; readonly flags: string } | undefined {
  const parsed = REGEX_LITERAL.exec(pattern);
  if (parsed === null) return undefined;
  const body = parsed[1];
  const flags = parsed[2];
  return body === undefined || flags === undefined ? undefined : { body, flags };
}

export function isValidStartupAnswerMatcher(pattern: string): boolean {
  const literal = parseRegexLiteral(pattern);
  if (literal === undefined) return true;
  try {
    new RegExp(literal.body, literal.flags);
    return true;
  } catch {
    return false;
  }
}

export function matchesScreen(pattern: string, screen: string): boolean {
  const literal = parseRegexLiteral(pattern);
  return literal === undefined
    ? screen.includes(pattern)
    : new RegExp(literal.body, literal.flags).test(screen);
}

export function parseStartupAnswers(
  value: unknown,
  fieldPath: string,
): Result<readonly StartupAnswer[], string> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value)) {
    return err(`"${fieldPath}" must be a list`);
  }

  const answers: StartupAnswer[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return err(`"${fieldPath}[${index}]" is not a mapping`);
    }
    const matches = prop(entry, "matches");
    if (!isString(matches) || !isValidStartupAnswerMatcher(matches)) {
      return err(`"${fieldPath}[${index}].matches" must be a string or a valid /regex/`);
    }
    const keys = prop(entry, "keys");
    if (!isStringArray(keys) || keys.length === 0) {
      return err(`"${fieldPath}[${index}].keys" must be a non-empty list of strings`);
    }
    answers.push({ matches, keys });
  }
  return ok(answers);
}
