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
