import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { isStringArray, isRecord, isString, prop } from "./validate.ts";
import { topologicalOrder } from "./topology.ts";

export const GRAPH_SHAPE = "graph@v0";

export interface GateDeclaration {
  readonly id: string;
  readonly kind: string;
  readonly run?: string;
}

export interface NodeDeclaration {
  readonly id: string;
  readonly acceptance?: string;
  readonly dependsOn: readonly string[];
  readonly gates: readonly GateDeclaration[];
}

export interface GraphDocument {
  readonly id: string;
  readonly gates: readonly GateDeclaration[];
  readonly nodes: readonly NodeDeclaration[];
}

export type GraphRefusal =
  | { readonly kind: "missing-file"; readonly path: string }
  | {
      readonly kind: "malformed-shape";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "unknown-dependency";
      readonly path: string;
      readonly node: string;
      readonly dependsOn: string;
    }
  | {
      readonly kind: "cycle";
      readonly path: string;
      readonly nodes: readonly string[];
    };

export function explainGraphRefusal(refusal: GraphRefusal): string {
  switch (refusal.kind) {
    case "missing-file":
      return `${refusal.path}: no such file; expected a ${GRAPH_SHAPE} document.`;
    case "malformed-shape":
      return `${refusal.path}: ${refusal.reason}`;
    case "unknown-dependency":
      return `${refusal.path}: node "${refusal.node}" depends on unknown node "${refusal.dependsOn}".`;
    case "cycle":
      return `${refusal.path}: nodes form a dependency cycle: ${refusal.nodes.join(" -> ")}.`;
  }
}

function isGateDeclaration(value: unknown): value is GateDeclaration {
  if (!isRecord(value)) return false;
  const run = prop(value, "run");
  return (
    isString(prop(value, "id")) &&
    isString(prop(value, "kind")) &&
    (run === undefined || isString(run))
  );
}

function isGateDeclarationArray(
  value: unknown,
): value is readonly GateDeclaration[] {
  return Array.isArray(value) && value.every(isGateDeclaration);
}

function parseShape(parsed: unknown): Result<GraphDocument, string> {
  if (!isRecord(parsed)) return err("the document is not a YAML mapping");

  const tag = prop(parsed, "interlock");
  if (tag !== GRAPH_SHAPE) {
    return err(
      `shape tag is ${isString(tag) ? `"${tag}"` : "missing"}, expected "${GRAPH_SHAPE}"`,
    );
  }

  const id = prop(parsed, "id");
  if (!isString(id)) return err('"id" is missing or not a string');

  const rawGates = prop(parsed, "gates");
  if (rawGates !== undefined && !isGateDeclarationArray(rawGates)) {
    return err(
      '"gates" must be a list of entries with a string "id" and "kind"',
    );
  }

  const rawNodes = prop(parsed, "nodes");
  if (!Array.isArray(rawNodes)) return err('"nodes" is missing or not a list');

  const nodes: NodeDeclaration[] = [];
  for (const [index, rawNode] of rawNodes.entries()) {
    if (!isRecord(rawNode)) return err(`node ${index}: not a mapping`);

    const nodeId = prop(rawNode, "id");
    if (!isString(nodeId))
      return err(`node ${index}: "id" is missing or not a string`);

    const rawAcceptance = prop(rawNode, "acceptance");
    if (rawAcceptance !== undefined && !isString(rawAcceptance)) {
      return err(`node "${nodeId}": "acceptance" must be a string`);
    }

    const rawDependsOn = prop(rawNode, "depends_on");
    if (rawDependsOn !== undefined && !isStringArray(rawDependsOn)) {
      return err(`node "${nodeId}": "depends_on" must be a list of strings`);
    }

    const rawNodeGates = prop(rawNode, "gates");
    if (rawNodeGates !== undefined && !isGateDeclarationArray(rawNodeGates)) {
      return err(
        `node "${nodeId}": "gates" must be a list of entries with a string "id" and "kind"`,
      );
    }

    nodes.push({
      id: nodeId,
      ...(rawAcceptance === undefined ? {} : { acceptance: rawAcceptance }),
      dependsOn: rawDependsOn ?? [],
      gates: rawNodeGates ?? [],
    });
  }

  return ok({ id, gates: rawGates ?? [], nodes });
}

export async function loadGraphDocument(
  path: string,
): Promise<Result<GraphDocument, GraphRefusal>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return err({ kind: "missing-file", path });
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason =
      error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed-shape", path, reason });
  }

  const shaped = parseShape(parsed);
  if (isErr(shaped))
    return err({ kind: "malformed-shape", path, reason: shaped.error });
  const document = shaped.value;

  for (const node of document.nodes) {
    for (const dependsOn of node.dependsOn) {
      if (!document.nodes.some((candidate) => candidate.id === dependsOn)) {
        return err({
          kind: "unknown-dependency",
          path,
          node: node.id,
          dependsOn,
        });
      }
    }
  }

  const ordered = topologicalOrder(document.nodes);
  if (isErr(ordered))
    return err({ kind: "cycle", path, nodes: ordered.error.nodes });

  return ok(document);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
