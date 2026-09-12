import { type Derivation, type Mark, mark } from "ledger";
import { fileContentAt, pathExistsAt } from "./git.ts";

const PATH_CHARS = /[A-Za-z0-9_./-]+/g;
const TRAILING_PUNCTUATION = /[.,;:]+$/;
const HAS_KNOWN_EXTENSION = /\.(ts|tsx|json|ya?ml|md|js)$/;
const STARTS_A_COMMAND = /^\$\s/m;

function candidatePaths(text: string): readonly string[] {
  const raw = text.match(PATH_CHARS) ?? [];
  return raw
    .map((token) => token.replace(TRAILING_PUNCTUATION, ""))
    .filter((token) => token.length > 0)
    .filter((token) => token.includes("/") || HAS_KNOWN_EXTENSION.test(token));
}

function quotedSubstrings(text: string): readonly string[] {
  const quotes: string[] = [];
  for (const found of text.matchAll(/"([^"]+)"/g)) quotes.push(found[1] ?? "");
  for (const found of text.matchAll(/`([^`]+)`/g)) quotes.push(found[1] ?? "");
  return quotes.filter((quote) => quote.trim().length > 0);
}

// A path candidate may be repo-root-relative (how every decision's hunks read) or, in prose
// that names a sibling session in passing ("ledger-gaps/notes.yaml"), relative to this
// graph's own sessions directory. Both are real conventions in the corpus this node ships
// against; a candidate resolves against whichever root actually holds it.
function resolveCandidate(
  repoRoot: string,
  headSha: string,
  graph: string,
  candidate: string,
): string | undefined {
  if (pathExistsAt(repoRoot, headSha, candidate)) return candidate;
  const siblingRelative = `.interlock/sessions/${graph}/${candidate}`;
  if (pathExistsAt(repoRoot, headSha, siblingRelative)) return siblingRelative;
  return undefined;
}

// found_at names a path, a path with a quoted excerpt, a command (a line starting "$ "), or a
// quoted out-of-band citation (a quote with no resolvable path beside it). The three recognized
// forms are rooted by form; only the path form is checked further, against the quoted content
// when a quote is given.
export function checkFoundAt(
  foundAt: string,
  repoRoot: string,
  headSha: string,
  graph: string,
  derivation: Derivation,
): Mark {
  const trimmed = foundAt.trim();

  if (STARTS_A_COMMAND.test(trimmed)) {
    return mark.rooted(derivation, "command");
  }

  const quotes = quotedSubstrings(trimmed);
  const resolved = candidatePaths(trimmed)
    .map((candidate) => resolveCandidate(repoRoot, headSha, graph, candidate))
    .find((candidate): candidate is string => candidate !== undefined);

  if (resolved !== undefined) {
    if (quotes.length === 0) return mark.rooted(derivation, resolved);
    const content = fileContentAt(repoRoot, headSha, resolved);
    const quoteFound = content !== undefined && quotes.some((quote) => content.includes(quote));
    return quoteFound
      ? mark.rooted(derivation, resolved)
      : mark.unrooted(derivation, `"${resolved}" exists, but none of the quoted content is in it`);
  }

  if (quotes.length > 0) {
    return mark.rooted(derivation, "out-of-band citation");
  }

  return mark.unrooted(
    derivation,
    `found_at names no path that exists at ${headSha}, no command, and no quoted citation`,
  );
}
