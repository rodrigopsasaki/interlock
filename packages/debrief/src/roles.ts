import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  DEBRIEF_KINDS,
  type DebriefKind,
  isDebriefKind,
  isWalkStep,
  type NodeRole,
  parseNodeRole,
  SUBSTRATE_VERBS,
  shapeTag,
  type WalkStep,
} from "ledger";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { isRecord, isString, prop } from "./validate.ts";

export const ROLES_V0 = "roles@v0";

export function roleTablePath(repoRoot: string): string {
  return join(repoRoot, ".interlock", "roles.yaml");
}

export interface RoleDebriefKinds {
  readonly requires: readonly DebriefKind[];
  readonly forbids: readonly DebriefKind[];
}

export interface RoleEntry {
  readonly prompt: string;
  readonly debrief: RoleDebriefKinds;
  readonly walk: readonly WalkStep[];
}

export type RoleTable = Readonly<Record<NodeRole, RoleEntry>>;

export const defaultRoleTable: RoleTable = {
  scout: {
    prompt:
      "Your role is scout: you read and report, and change nothing. Your debrief returns discoveries, each with where you found it, and no diff: no decision cites a hunk.",
    debrief: { requires: ["discoveries"], forbids: ["hunks"] },
    walk: [
      {
        verb: "context",
        ask: "What does the substrate already hold about the paths this node reads?",
      },
      { verb: "vocabulary", ask: "Which domain terms does the team profess for this area?" },
    ],
  },
  planner: {
    prompt:
      "Your role is planner: you draft a graph for a person to approve. Commit it under .interlock/graphs/ and name it in your debrief's graph_file; a person approves it, never you.",
    debrief: { requires: ["graph"], forbids: [] },
    walk: [
      {
        verb: "vocabulary",
        ask: "Which domain terms does the team profess, so every node of the graph is named in them?",
      },
      { verb: "context", ask: "Which conventions and disciplines bind work in this repository?" },
    ],
  },
  implementer: {
    prompt:
      "Your role is implementer: you produce the diff. Your debrief returns decisions, each rooted in the hunks it produced.",
    debrief: { requires: ["decisions", "hunks"], forbids: [] },
    walk: [
      {
        verb: "context",
        ask: "Which conventions and beliefs govern the files in this node's scope?",
      },
      { verb: "context", ask: "What did earlier decisions on these paths rest on?" },
    ],
  },
  tester: {
    prompt:
      "Your role is tester: you produce the proof the gates run. Your debrief returns proof: each test, the gate that runs it, and what it pins.",
    debrief: { requires: ["proof"], forbids: [] },
    walk: [
      { verb: "context", ask: "What behaviour does the substrate hold these paths to promise?" },
      { verb: "context", ask: "Which existing tests already pin that behaviour?" },
    ],
  },
  reviewer: {
    prompt:
      "Your role is reviewer: you produce a judgment through a named lens. Your debrief names the lens and returns findings through it, each with where you found it, and no diff: no decision cites a hunk.",
    debrief: { requires: ["findings"], forbids: ["hunks"] },
    walk: [
      {
        verb: "context",
        ask: "What review judgment does the substrate hold for this node's lens?",
      },
      {
        verb: "context",
        ask: "Which conventions and values does the team profess for these paths?",
      },
    ],
  },
  verifier: {
    prompt:
      "Your role is verifier: you produce the check that every debrief claim is rooted. Your debrief returns marks: each claim with rooted, unrooted, unexplained or gap, and why.",
    debrief: { requires: ["marks"], forbids: [] },
    walk: [
      {
        verb: "vocabulary",
        ask: "Which terms does the team profess, so an unmatched phrase is marked a gap?",
      },
      {
        verb: "context",
        ask: "Which receipts and hunks does the substrate hold for the claims under check?",
      },
    ],
  },
};

export type RoleTableRefusal =
  | { readonly kind: "malformed-yaml"; readonly path: string; readonly reason: string }
  | { readonly kind: "invalid-shape"; readonly path: string; readonly reason: string };

export function explainRoleTableRefusal(refusal: RoleTableRefusal): string {
  return `${refusal.path}: ${refusal.reason}`;
}

function kindList(raw: unknown, field: string): Result<readonly DebriefKind[], string> {
  if (!Array.isArray(raw)) return err(`"${field}" must be a list of debrief kinds`);
  const kinds: DebriefKind[] = [];
  for (const word of raw) {
    if (!isDebriefKind(word)) {
      return err(
        `"${field}" names ${JSON.stringify(word)}, which is not one of ${DEBRIEF_KINDS.join(", ")}`,
      );
    }
    kinds.push(word);
  }
  return ok(kinds);
}

function overlayDebrief(
  base: RoleDebriefKinds,
  raw: unknown,
  role: NodeRole,
): Result<RoleDebriefKinds, string> {
  if (raw === undefined) return ok(base);
  if (!isRecord(raw)) return err(`roles.${role}.debrief must be a mapping`);
  const requires = prop(raw, "requires");
  const forbids = prop(raw, "forbids");
  const parsedRequires =
    requires === undefined
      ? ok(base.requires)
      : kindList(requires, `roles.${role}.debrief.requires`);
  if (isErr(parsedRequires)) return parsedRequires;
  const parsedForbids =
    forbids === undefined ? ok(base.forbids) : kindList(forbids, `roles.${role}.debrief.forbids`);
  if (isErr(parsedForbids)) return parsedForbids;
  return ok({ requires: parsedRequires.value, forbids: parsedForbids.value });
}

function isWalkSteps(value: unknown): value is readonly WalkStep[] {
  return Array.isArray(value) && value.every(isWalkStep);
}

function overlayEntry(base: RoleEntry, raw: unknown, role: NodeRole): Result<RoleEntry, string> {
  if (!isRecord(raw)) return err(`roles.${role} must be a mapping`);
  const prompt = prop(raw, "prompt") ?? base.prompt;
  if (!isString(prompt) || prompt.trim() === "")
    return err(`roles.${role}.prompt must be a non-empty string`);
  const walk = prop(raw, "walk") ?? base.walk;
  if (!isWalkSteps(walk))
    return err(
      `roles.${role}.walk must be a list of { verb, ask }, verb one of ${SUBSTRATE_VERBS.join(", ")}`,
    );
  const debrief = overlayDebrief(base.debrief, prop(raw, "debrief"), role);
  if (isErr(debrief)) return debrief;
  return ok({ prompt, debrief: debrief.value, walk });
}

export function roleTableOver(base: RoleTable, raw: unknown): Result<RoleTable, string> {
  if (!isRecord(raw)) return err("the document is not a YAML mapping");
  const tag = shapeTag(raw);
  if (tag !== ROLES_V0)
    return err(
      `shape tag is ${tag === undefined ? "missing" : `"${tag}"`}, expected "${ROLES_V0}"`,
    );
  const roles = prop(raw, "roles");
  if (!isRecord(roles)) return err('"roles" must be a mapping from role to entry');

  const table: Record<NodeRole, RoleEntry> = { ...base };
  for (const [word, entry] of Object.entries(roles)) {
    const role = parseNodeRole(word);
    if (isErr(role)) return role;
    const overlaid = overlayEntry(base[role.value], entry, role.value);
    if (isErr(overlaid)) return overlaid;
    table[role.value] = overlaid.value;
  }
  return ok(table);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function readRoleTable(
  repoRoot: string,
): Promise<Result<RoleTable, RoleTableRefusal>> {
  const path = roleTablePath(repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isMissingFile(error)) return ok(defaultRoleTable);
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason = error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed-yaml", path, reason });
  }
  const table = roleTableOver(defaultRoleTable, parsed);
  return isErr(table) ? err({ kind: "invalid-shape", path, reason: table.error }) : table;
}
