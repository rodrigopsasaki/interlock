import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { type Derivation, type Mark, mark } from "ledger";
import type { FileDiff } from "./git.ts";

export interface HunkCitation {
  readonly path: string;
  readonly range?: { readonly start: number; readonly end: number };
}

export interface HunkCitationRefusal {
  readonly kind: "malformed";
  readonly citation: string;
  readonly reason: string;
}

const RANGE_SUFFIX = /^(\d+)(?:-(\d+))?$/;

export function parseHunkCitation(citation: string): Result<HunkCitation, HunkCitationRefusal> {
  const trimmed = citation.trim();
  if (trimmed.length === 0) {
    return err({ kind: "malformed", citation, reason: "empty citation" });
  }

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return ok({ path: trimmed });

  const suffix = trimmed.slice(lastColon + 1);
  const rangeMatch = RANGE_SUFFIX.exec(suffix);
  if (rangeMatch === null) return ok({ path: trimmed });

  const path = trimmed.slice(0, lastColon);
  if (path.length === 0) {
    return err({
      kind: "malformed",
      citation,
      reason: "no path before the line range",
    });
  }

  const start = Number(rangeMatch[1]);
  const end = rangeMatch[2] === undefined ? start : Number(rangeMatch[2]);
  if (end < start) {
    return err({
      kind: "malformed",
      citation,
      reason: `range end ${end} is before start ${start}`,
    });
  }

  return ok({ path, range: { start, end } });
}

function overlaps(
  range: { readonly start: number; readonly end: number },
  hunk: { readonly start: number; readonly end: number },
): boolean {
  return range.start <= hunk.end && hunk.start <= range.end;
}

export function checkHunkCitation(
  citation: string,
  files: readonly FileDiff[],
  derivation: Derivation,
): Mark {
  const parsed = parseHunkCitation(citation);
  if (isErr(parsed)) {
    return mark.unrooted(
      derivation,
      `malformed hunk citation "${citation}": ${parsed.error.reason}`,
    );
  }

  const { path, range } = parsed.value;
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) {
    return mark.unrooted(derivation, `"${path}" is not a file changed in this range`);
  }

  if (range === undefined) return mark.rooted(derivation, citation);

  const hit = file.hunks.some((hunk) => overlaps(range, hunk));
  if (!hit) {
    return mark.unrooted(
      derivation,
      `"${path}" changed in this range, but lines ${range.start}-${range.end} overlap no added hunk`,
    );
  }
  return mark.rooted(derivation, citation);
}
