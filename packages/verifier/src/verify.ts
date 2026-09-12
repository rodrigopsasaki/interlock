import { err, ok, type Result } from "@phyxiusjs/fp";
import { type Debrief, type Decision, type Discovery, derivation, type Mark } from "ledger";
import { checkFoundAt } from "./foundAt.ts";
import { diffFiles, isAncestor, isCommit } from "./git.ts";
import { checkHunkCitation } from "./hunkCitation.ts";
import { unexplainedMarks } from "./inverse.ts";
import { vocabularyGaps } from "./vocabulary.ts";

export const VERIFIER_GATE_ID = "verifier-hunks";
export const VERIFIER_VERSION = "verifier@0";

export interface VerifyOptions {
  readonly runner?: string;
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

export interface DecisionMarks {
  readonly decision: Decision;
  readonly marks: readonly Mark[];
}

export interface DiscoveryMark {
  readonly discovery: Discovery;
  readonly mark: Mark;
}

export interface VerifyResult {
  readonly marks: readonly Mark[];
  readonly decisionMarks: readonly DecisionMarks[];
  readonly discoveryMarks: readonly DiscoveryMark[];
}

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

  const decisionMarks = debrief.decisions.map((decision) => ({
    decision,
    marks: decision.hunks.map((citation) => checkHunkCitation(citation, files, deriv)),
  }));
  const hunkMarks = decisionMarks.flatMap((entry) => entry.marks);

  const discoveryMarks = debrief.discoveries.map((discovery) => ({
    discovery,
    mark: checkFoundAt(discovery.foundAt, repoRoot, headSha, graph, deriv),
  }));
  const discoveryFoundAtMarks = discoveryMarks.map((entry) => entry.mark);

  const inverse = unexplainedMarks(files, debrief.decisions, deriv);

  const gaps = vocabularyGaps(files, repoRoot, options.professedDomainVocabulary ?? [], deriv);

  return ok({
    marks: [...hunkMarks, ...discoveryFoundAtMarks, ...inverse, ...gaps],
    decisionMarks,
    discoveryMarks,
  });
}
