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
