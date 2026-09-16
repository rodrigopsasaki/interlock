import { type Derivation, type Mark, mark } from "ledger";
import { fileContentAt, pathExistsAt } from "./git.ts";

const PATH_CHARS = /[A-Za-z0-9_./-]+/g;
const TRAILING_PUNCTUATION = /[.,;:]+$/;
const HAS_KNOWN_EXTENSION = /\.(ts|tsx|json|ya?ml|md|js)$/;
const STARTS_A_COMMAND = /^\$\s/m;
const EXPLICIT_LOCATION = /([A-Za-z0-9_./-]+):([^\s`"]*)/g;
const WHOLE_EXPLICIT_LOCATION = /^([A-Za-z0-9_./-]+):([^\s`"]*)$/;

interface ExplicitLocation {
  readonly source: string;
  readonly path: string;
  readonly suffix: string;
  readonly locatorQuote?: {
    readonly start: number;
    readonly end: number;
  };
}

interface LineRange {
  readonly start: number;
  readonly end: number;
}

function candidatePaths(text: string): readonly string[] {
  const raw = text.match(PATH_CHARS) ?? [];
  return raw
    .map((token) => token.replace(TRAILING_PUNCTUATION, ""))
    .filter((token) => token.length > 0)
    .filter((token) => token.includes("/") || HAS_KNOWN_EXTENSION.test(token));
}

function pathLike(candidate: string): boolean {
  return candidate.includes("/") || HAS_KNOWN_EXTENSION.test(candidate);
}

function explicitLocations(text: string): readonly ExplicitLocation[] {
  const locations: ExplicitLocation[] = [];
  let cursor = 0;

  function addLocation(
    path: string,
    suffix: string,
    firstToken: boolean,
    locatorQuote?: ExplicitLocation["locatorQuote"],
  ): void {
    if (!pathLike(path) && !firstToken) return;
    locations.push({ source: `${path}:${suffix}`, path, suffix, locatorQuote });
  }

  while (cursor < text.length) {
    const delimiter = text[cursor];
    if (delimiter === '"' || delimiter === "`") {
      const end = text.indexOf(delimiter, cursor + 1);
      if (end === -1) {
        break;
      }
      if (delimiter === "`" && locations.length === 0) {
        const locator = text.slice(cursor + 1, end).match(WHOLE_EXPLICIT_LOCATION);
        const path = locator?.[1];
        const suffix = locator?.[2];
        if (path !== undefined && suffix !== undefined) {
          addLocation(path, suffix, text.slice(0, cursor).trim().length === 0, {
            start: cursor,
            end,
          });
        }
      }
      cursor = end + 1;
      continue;
    }

    const nextQuote = text.slice(cursor).search(/["`]/);
    const end = nextQuote === -1 ? text.length : cursor + nextQuote;
    const segment = text.slice(cursor, end);
    for (const found of segment.matchAll(EXPLICIT_LOCATION)) {
      const path = found[1];
      const suffix = found[2];
      const index = found.index;
      if (path === undefined || suffix === undefined || index === undefined) continue;
      addLocation(path, suffix, text.slice(0, cursor + index).trim().length === 0);
    }
    cursor = end;
  }

  return locations;
}

function quotedSubstrings(
  text: string,
  explicitLocation: ExplicitLocation | undefined,
): readonly string[] {
  const quotes: string[] = [];
  let start = 0;
  while (start < text.length) {
    const delimiter = text[start];
    if (delimiter !== '"' && delimiter !== "`") {
      start += 1;
      continue;
    }
    const end = text.indexOf(delimiter, start + 1);
    if (end === -1) {
      start += 1;
      continue;
    }
    const quote = text.slice(start + 1, end);
    const locatorQuote = explicitLocation?.locatorQuote;
    if (
      delimiter !== "`" ||
      locatorQuote === undefined ||
      locatorQuote.start !== start ||
      locatorQuote.end !== end
    ) {
      quotes.push(quote);
    }
    start = end + 1;
  }
  return quotes.filter((quote) => quote.trim().length > 0);
}

function parseLineRange(suffix: string): LineRange | undefined {
  if (!/^\d+(?:-\d+)?[.,;!?]?$/.test(suffix)) return undefined;
  const range = /[.,;!?]$/.test(suffix) ? suffix.slice(0, -1) : suffix;
  const values = range.split("-").map((value) => Number(value));
  const start = values[0];
  const end = values[1] ?? start;
  if (
    start === undefined ||
    end === undefined ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start
  ) {
    return undefined;
  }
  return { start, end };
}

function linesIn(content: string): readonly string[] {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "" && /\r$|\n$/.test(content)) lines.pop();
  return lines;
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

  const locations = explicitLocations(trimmed);
  if (locations.length !== 0) {
    if (locations.length !== 1) {
      return mark.unrooted(derivation, "found_at names multiple explicit locations");
    }
    const location = locations[0];
    if (location === undefined) {
      return mark.unrooted(derivation, "found_at names no explicit location");
    }
    const range = parseLineRange(location.suffix);
    if (range === undefined) {
      return mark.unrooted(derivation, `"${location.source}" has an invalid numeric line range`);
    }
    const resolved = resolveCandidate(repoRoot, headSha, graph, location.path);
    if (resolved === undefined) {
      return mark.unrooted(
        derivation,
        `"${location.source}" names no path that exists at ${headSha}`,
      );
    }
    const quotes = quotedSubstrings(trimmed, location);
    if (quotes.length !== 1) {
      return mark.unrooted(
        derivation,
        `"${location.source}" requires exactly one separate nonblank quotation`,
      );
    }
    const content = fileContentAt(repoRoot, headSha, resolved);
    if (content === undefined) {
      return mark.unrooted(derivation, `"${resolved}" could not be read at ${headSha}`);
    }
    const lines = linesIn(content);
    if (range.end > lines.length) {
      return mark.unrooted(
        derivation,
        `"${location.source}" is outside ${resolved}'s ${lines.length} line(s) at ${headSha}`,
      );
    }
    const quote = quotes[0];
    if (quote === undefined) {
      return mark.unrooted(derivation, `"${location.source}" has no quotation`);
    }
    const sourceRange = lines.slice(range.start - 1, range.end).join("\n");
    return sourceRange.includes(quote)
      ? mark.rooted(derivation, resolved)
      : mark.unrooted(
          derivation,
          `"${location.source}" does not contain its quoted extract within that line range`,
        );
  }

  const quotes = quotedSubstrings(trimmed, undefined);
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
