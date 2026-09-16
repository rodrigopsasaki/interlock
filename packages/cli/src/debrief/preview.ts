import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import { DEBRIEF_V2, explainDebriefRefusal, type ItemScope, readDebriefDocument } from "debrief";
import { findRepoRoot } from "face";
import type { Mark } from "ledger";
import { evidenceOf } from "substrate";
import { explainVerifyRefusal, verifyDebrief } from "verifier";
import { parse as parseYaml } from "yaml";
import type { CommandResult } from "../main.ts";
import { debriefSchemaRefusal } from "./validate.ts";

const USAGE =
  'interlock debrief preview: expected --file <candidate>, e.g. "interlock debrief preview --file debrief-candidate.yaml".';

function describeMark(mark: Mark): string {
  switch (mark.kind) {
    case "rooted":
      return `rooted: ${mark.hunk}`;
    case "unrooted":
      return `unrooted: ${mark.because}`;
    case "unexplained":
      return `unexplained: ${mark.hunk}`;
    case "gap":
      return `gap: ${mark.gap.term}; nearest ${mark.gap.nearest}; ${mark.gap.difference}`;
  }
}

function describeScope(scope: ItemScope): string {
  switch (scope.kind) {
    case "repository":
      return "repository";
    case "path":
      return `path ${scope.path}`;
    case "organisation":
      return "organisation";
  }
}

function describeAppliesTo(
  appliesTo:
    | { readonly kind: "repository" }
    | { readonly kind: "path"; readonly path: string }
    | undefined,
): string {
  return appliesTo === undefined ? "omitted" : describeScope(appliesTo);
}

function previewEvidence(
  derivation: Parameters<typeof evidenceOf>[0]["derivation"],
  decisions: Parameters<typeof evidenceOf>[0]["decisions"],
  discoveries: Parameters<typeof evidenceOf>[0]["discoveries"],
) {
  return evidenceOf({
    derivation,
    decisions,
    discoveries,
    receipts: [],
    personEvents: [],
    harnessAuthorities: new Set<string>(),
  });
}

function renderTranslation(
  prefix: string,
  translation: ReturnType<typeof evidenceOf>,
): readonly string[] {
  const item = translation.items[0];
  if (item === undefined)
    return [`${prefix}excluded: no hypothesis was translated from these marks.`];
  if (item.scope === undefined) return [`${prefix}included hypothesis has no translated scope.`];
  return [
    `${prefix}included hypothesis scope: ${describeScope(item.scope)}`,
    ...translation.gaps.map(
      (gap) => `${prefix}scope gap: ${gap.term}; nearest ${gap.nearest}; ${gap.difference}`,
    ),
  ];
}

export async function runDebriefPreview(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  if (args.length !== 2 || args[0] !== "--file" || args[1] === undefined) {
    return { exitCode: 1, message: USAGE };
  }

  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const candidate = resolve(cwd, args[1]);
  let snapshot: string;
  try {
    snapshot = await readFile(candidate, "utf-8");
  } catch (error) {
    return {
      exitCode: 1,
      message: `${candidate}: ${error instanceof Error ? error.message : "could not read the candidate"}`,
    };
  }

  const read = readDebriefDocument(snapshot, candidate);
  if (isErr(read)) return { exitCode: 1, message: explainDebriefRefusal(read.error) };

  const previewPath = relative(cwd, candidate) || ".";
  const heading = [
    `candidate preview: ${previewPath}`,
    "This is not filing, judgment, delivery, proof of truth, or a session-identity attestation.",
  ];
  if (read.value.kind === "legacy") {
    return {
      exitCode: 0,
      message: [
        ...heading,
        `valid as ${read.value.version}; current marks require ${DEBRIEF_V2}.`,
      ].join("\n"),
    };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(snapshot);
  } catch {
    return { exitCode: 1, message: `${candidate}: could not validate the candidate snapshot.` };
  }
  const schemaRefusal = debriefSchemaRefusal(parsed, candidate);
  if (schemaRefusal !== undefined) return { exitCode: 1, message: schemaRefusal };

  const debrief = read.value.debrief;
  const verified = await verifyDebrief(repoRoot, debrief);
  if (isErr(verified)) return { exitCode: 1, message: explainVerifyRefusal(verified.error) };

  const lines = [
    ...heading,
    `declared source range: ${debrief.sessionStartSha}..${debrief.headSha}`,
  ];
  if (debrief.decisions.length === 0 && debrief.discoveries.length === 0) {
    lines.push("claims: none");
  }

  for (const entry of verified.value.decisionMarks) {
    lines.push(
      `decision ${entry.decision.id}:`,
      `  applies_to: ${describeAppliesTo(entry.decision.appliesTo)}`,
    );
    lines.push(...entry.marks.map((mark) => `  ${describeMark(mark)}`));
    const translation = previewEvidence(debrief.derivation, [entry], []);
    lines.push(...renderTranslation("  ", translation));
  }
  for (const entry of verified.value.discoveryMarks) {
    lines.push(
      `discovery ${entry.discovery.id}:`,
      `  found_at: ${entry.discovery.foundAt}`,
      `  applies_to: ${describeAppliesTo(entry.discovery.appliesTo)}`,
      `  ${describeMark(entry.mark)}`,
    );
    const translation = previewEvidence(debrief.derivation, [], [entry]);
    lines.push(...renderTranslation("  ", translation));
  }
  lines.push(
    "A changed candidate requires a new preview; final judgment verifies canonical bytes independently.",
  );
  return { exitCode: 0, message: lines.join("\n") };
}
