import { BRIEF_V1, type BriefFrontMatter, type BriefGate } from "debrief";
import type { GateDeclaration } from "face";
import { stringify } from "yaml";
import type { StandingGate } from "./standingGates.ts";

// Standing table first, then the node's own; add-never-remove. A compiled expect_output is
// stored as its source string in the brief: the front matter is text the repository reads back,
// not a runtime RegExp.
export function authoritativeBriefGates(
  standing: readonly StandingGate[],
  nodeGates: readonly GateDeclaration[],
): readonly BriefGate[] {
  return [
    ...standing.map(
      (entry): BriefGate => ({
        id: entry.id,
        kind: entry.kind,
        run: entry.run,
        ...(entry.expectOutput === undefined
          ? {}
          : { expectOutput: entry.expectOutput.source }),
      }),
    ),
    ...nodeGates.map(
      (entry): BriefGate => ({
        id: entry.id,
        kind: entry.kind,
        ...(entry.run === undefined ? {} : { run: entry.run }),
        ...(entry.expectOutput === undefined
          ? {}
          : { expectOutput: entry.expectOutput.source }),
      }),
    ),
  ];
}

function gateSignature(gate: BriefGate): string {
  return JSON.stringify([
    gate.id,
    gate.kind,
    gate.run ?? null,
    gate.expectOutput ?? null,
  ]);
}

// The repository copy may be stale; the runner's view is authoritative. A difference is
// narrated, never silently overwritten without a line.
export function diffGates(
  previous: readonly BriefGate[],
  authoritative: readonly BriefGate[],
): readonly string[] {
  if (
    previous.map(gateSignature).join("|") ===
    authoritative.map(gateSignature).join("|")
  ) {
    return [];
  }
  const previousIds = new Set(previous.map((gate) => gate.id));
  const authoritativeIds = new Set(authoritative.map((gate) => gate.id));
  const added = authoritative
    .filter((gate) => !previousIds.has(gate.id))
    .map((gate) => gate.id);
  const removed = previous
    .filter((gate) => !authoritativeIds.has(gate.id))
    .map((gate) => gate.id);
  if (added.length === 0 && removed.length === 0) {
    return [
      "gates: the repository copy's gate declarations differ from the runner's view; overwritten.",
    ];
  }
  const lines: string[] = [];
  if (added.length > 0)
    lines.push(`gates: the runner added ${added.join(", ")}.`);
  if (removed.length > 0) {
    lines.push(
      `gates: the repository copy declared ${removed.join(", ")}, absent from the runner's view; overwritten.`,
    );
  }
  return lines;
}

export function diffScope(
  previous: readonly string[],
  authoritative: readonly string[],
): readonly string[] {
  const authoritativeSet = new Set(authoritative);
  const same =
    previous.length === authoritative.length &&
    previous.every((path) => authoritativeSet.has(path));
  if (same) return [];
  return [
    `scope: the repository copy declared ${previous.length} path(s); the runner's view declares ${authoritative.length}; overwritten.`,
  ];
}

function gateRecord(gate: BriefGate): Record<string, unknown> {
  return {
    id: gate.id,
    kind: gate.kind,
    ...(gate.run === undefined ? {} : { run: gate.run }),
    ...(gate.expectOutput === undefined
      ? {}
      : { expect_output: gate.expectOutput }),
  };
}

function frontMatterRecord(
  frontMatter: BriefFrontMatter,
): Record<string, unknown> {
  return {
    interlock: BRIEF_V1,
    graph: frontMatter.graph,
    node: frontMatter.node,
    role: frontMatter.role,
    gates: frontMatter.gates.map(gateRecord),
    scope: frontMatter.scope,
    substrate: {
      address: frontMatter.substrate.address,
      ...(frontMatter.substrate.handle === undefined
        ? {}
        : { handle: frontMatter.substrate.handle }),
    },
    ...(frontMatter.runner.kind === "worktree"
      ? {
          graph_base_sha: frontMatter.runner.graphBaseSha,
          session: frontMatter.runner.session,
        }
      : {}),
  };
}

export function renderBriefFile(
  frontMatter: BriefFrontMatter,
  body: string,
): string {
  return `---\n${stringify(frontMatterRecord(frontMatter))}---\n${body}`;
}
