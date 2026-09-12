import { err, ok, type Result } from "@phyxiusjs/fp";
import { type Debrief, derivation, type Mark } from "ledger";
import { checkFoundAt } from "./foundAt.ts";
import { diffFiles, isAncestor, isCommit } from "./git.ts";
import { checkHunkCitation } from "./hunkCitation.ts";
import { unexplainedMarks } from "./inverse.ts";
import { vocabularyGaps } from "./vocabulary.ts";

export const VERIFIER_GATE_ID = "verifier-hunks";
export const VERIFIER_VERSION = "verifier@0";

export interface VerifyOptions {
  readonly runner?: string;
  // The team's professed domain vocabulary. Always empty today: no config shape carries one
  // yet (see this session's debrief, under `open`).
  readonly professedDomainVocabulary?: readonly string[];
}

export interface VerifyRefusal {
  readonly kind: "range-not-in-history";
  readonly sessionStartSha: string;
  readonly headSha: string;
}

export function explainVerifyRefusal(refusal: VerifyRefusal): string {
  return `${refusal.sessionStartSha}..${refusal.headSha} is not a range in this repository's history.`;
}

export interface VerifyResult {
  readonly marks: readonly Mark[];
}

// Deterministic. No model is called anywhere: every mark here traces to the diff, the
// workspace at head_sha, or AGENTS.md's own vocabulary table.
export async function verifyDebrief(
  repoRoot: string,
  debrief: Debrief,
  options: VerifyOptions = {},
): Promise<Result<VerifyResult, VerifyRefusal>> {
  const { sessionStartSha, headSha, graph } = debrief;

  if (
    !isCommit(repoRoot, sessionStartSha) ||
    !isCommit(repoRoot, headSha) ||
    !isAncestor(repoRoot, sessionStartSha, headSha)
  ) {
    return err({ kind: "range-not-in-history", sessionStartSha, headSha });
  }

  const deriv = derivation.gate(
    VERIFIER_GATE_ID,
    VERIFIER_VERSION,
    options.runner ?? "interlock-verify",
  );
  const files = diffFiles(repoRoot, sessionStartSha, headSha);

  const hunkMarks = debrief.decisions.flatMap((decision) =>
    decision.hunks.map((citation) => checkHunkCitation(citation, files, deriv)),
  );

  const discoveryMarks = debrief.discoveries.map((discovery) =>
    checkFoundAt(discovery.foundAt, repoRoot, headSha, graph, deriv),
  );

  const inverse = unexplainedMarks(files, debrief.decisions, deriv);

  const gaps = vocabularyGaps(files, repoRoot, options.professedDomainVocabulary ?? [], deriv);

  return ok({
    marks: [...hunkMarks, ...discoveryMarks, ...inverse, ...gaps],
  });
}
