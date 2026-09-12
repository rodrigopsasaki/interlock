import { isOk } from "@phyxiusjs/fp";
import { type Decision, type Derivation, type Mark, mark } from "ledger";
import type { FileDiff } from "./git.ts";
import { parseHunkCitation } from "./hunkCitation.ts";

// Every file changed in the range is covered by some decision's hunks or produces, or it is
// marked unexplained. A malformed hunk citation covers nothing; that citation is already
// unrooted on its own account, and the file it failed to name stays uncovered here.
export function unexplainedMarks(
  files: readonly FileDiff[],
  decisions: readonly Decision[],
  derivation: Derivation,
): readonly Mark[] {
  const covered = new Set<string>();
  for (const decision of decisions) {
    for (const citation of decision.hunks) {
      const parsed = parseHunkCitation(citation);
      if (isOk(parsed)) covered.add(parsed.value.path);
    }
    for (const produced of decision.produces ?? []) covered.add(produced);
  }

  return files
    .filter((file) => !covered.has(file.path))
    .map((file) => mark.unexplained(derivation, file.path));
}
