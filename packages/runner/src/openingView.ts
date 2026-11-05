import { createHash } from "node:crypto";
import { BRIEF_V1, type BriefFrontMatter } from "debrief";
import { stringify } from "yaml";
import { ACCEPTANCE_TITLE, hasAcceptanceSection } from "./acceptanceSection.ts";

function gateRecord(gate: BriefFrontMatter["gates"][number]): Record<string, string> {
  return {
    id: gate.id,
    kind: gate.kind,
    ...(gate.run === undefined ? {} : { run: gate.run }),
    ...(gate.expectOutput === undefined ? {} : { expect_output: gate.expectOutput }),
  };
}

export function renderOpeningView(
  frontMatter: BriefFrontMatter,
  body: string,
  canonicalPath: string,
): string {
  const scope = JSON.stringify(frontMatter.scope);
  const fields: Record<string, unknown> = {
    interlock: BRIEF_V1,
    graph: frontMatter.graph,
    node: frontMatter.node,
    role: frontMatter.role,
    gates: frontMatter.gates.map(gateRecord),
    substrate: {
      address: frontMatter.substrate.address,
      ...(frontMatter.substrate.handle === undefined
        ? {}
        : { handle: frontMatter.substrate.handle }),
    },
    ...(frontMatter.walk === undefined ? {} : { walk: frontMatter.walk }),
    ...(frontMatter.runner.kind === "worktree"
      ? {
          graph_base_sha: frontMatter.runner.graphBaseSha,
          session: frontMatter.runner.session,
        }
      : {}),
    scope_count: frontMatter.scope.length,
    scope_sha256: createHash("sha256").update(scope, "utf8").digest("hex"),
    scope_serialization: "UTF-8 JSON.stringify(scope)",
    ...(frontMatter.contextScope === undefined
      ? {}
      : {
          context_scope: frontMatter.contextScope,
        }),
    canonical_path: canonicalPath,
  };
  const acceptanceAuthority = hasAcceptanceSection(body)
    ? `The "${ACCEPTANCE_TITLE}" section is authoritative over acceptance text elsewhere in the authored prose.\n\n`
    : "";
  return (
    `Prompt projection, not a brief file. It deliberately omits scope entries, is not a valid persisted brief, and must not replace the canonical file. ` +
    `The canonical brief remains binding; the full inventory is available on demand at ${canonicalPath}.\n\n` +
    acceptanceAuthority +
    `---\n${stringify(fields)}---\n${body}`
  );
}
