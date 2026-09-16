import type { SessionStartRecoveryInput } from "debrief";
import { deriveSessionStart, gitAncestor, gitCommit } from "./sessionIdentity.ts";

export async function recoverSessionStart(
  input: SessionStartRecoveryInput,
): Promise<string | undefined> {
  const { repoRoot, graph, node, brief, briefBytes, current, candidate } = input;
  if (gitCommit(repoRoot, current.sessionStartSha))
    return "recovery requires the current session_start_sha not to name a commit";
  const derived = await deriveSessionStart(
    repoRoot,
    graph,
    node,
    brief,
    briefBytes,
    candidate.headSha,
  );
  if (derived.kind === "refusal") return `recovery ${derived.because}`;
  if (candidate.sessionStartSha !== derived.sha)
    return "candidate session_start_sha does not match the recovered session start";
  if (!gitAncestor(repoRoot, derived.sha, candidate.headSha))
    return "candidate head_sha is not descended from the recovered session start";
  return undefined;
}
