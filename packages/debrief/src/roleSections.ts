import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  type Finding,
  type Findings,
  isMarkKind,
  MARK_KINDS,
  type MarkedClaim,
  type ProofEntry,
} from "ledger";
import { isRecord, isString, prop } from "./validate.ts";

export interface RoleSections {
  readonly proof?: readonly ProofEntry[];
  readonly findings?: Findings;
  readonly graphFile?: string;
  readonly marks?: readonly MarkedClaim[];
}

function parseProofEntry(raw: unknown, index: number): Result<ProofEntry, string> {
  if (!isRecord(raw)) return err(`proof ${index}: not a mapping`);
  const test = prop(raw, "test");
  if (!isString(test)) return err(`proof ${index}: "test" is missing or not a string`);
  const pins = prop(raw, "pins");
  if (!isString(pins)) return err(`proof "${test}": "pins" is missing or not a string`);
  const gate = prop(raw, "gate");
  if (gate !== undefined && !isString(gate)) return err(`proof "${test}": "gate" must be a string`);
  return ok({ test, pins, ...(gate === undefined ? {} : { gate }) });
}

function parseFinding(raw: unknown, index: number): Result<Finding, string> {
  if (!isRecord(raw)) return err(`finding ${index}: not a mapping`);
  const id = prop(raw, "id");
  if (!isString(id)) return err(`finding ${index}: "id" is missing or not a string`);
  const what = prop(raw, "what");
  if (!isString(what)) return err(`finding "${id}": "what" is missing or not a string`);
  const foundAt = prop(raw, "found_at");
  if (!isString(foundAt)) return err(`finding "${id}": "found_at" is missing or not a string`);
  return ok({ id, what, foundAt });
}

function parseList<T>(
  raw: unknown,
  field: string,
  parseItem: (item: unknown, index: number) => Result<T, string>,
): Result<readonly T[], string> {
  if (!Array.isArray(raw)) return err(`"${field}" must be a list`);
  const items: T[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = parseItem(item, index);
    if (isErr(parsed)) return parsed;
    items.push(parsed.value);
  }
  return ok(items);
}

function parseFindings(raw: unknown): Result<Findings, string> {
  if (!isRecord(raw)) return err('"findings" must be a mapping with "lens" and "items"');
  const lens = prop(raw, "lens");
  if (!isString(lens) || lens.trim() === "")
    return err('"findings" must name its "lens" as a non-empty string');
  const items = parseList(prop(raw, "items"), "findings.items", parseFinding);
  if (isErr(items)) return items;
  return ok({ lens, items: items.value });
}

function parseMarkedClaim(raw: unknown, index: number): Result<MarkedClaim, string> {
  if (!isRecord(raw)) return err(`mark ${index}: not a mapping`);
  const claim = prop(raw, "claim");
  if (!isString(claim)) return err(`mark ${index}: "claim" is missing or not a string`);
  const mark = prop(raw, "mark");
  if (!isMarkKind(mark))
    return err(`mark "${claim}": "mark" must be one of ${MARK_KINDS.join(", ")}`);
  const because = prop(raw, "because");
  if (!isString(because)) return err(`mark "${claim}": "because" is missing or not a string`);
  return ok({ claim, mark, because });
}

export function parseRoleSections(parsed: Record<string, unknown>): Result<RoleSections, string> {
  const rawProof = prop(parsed, "proof");
  const proof = rawProof === undefined ? undefined : parseList(rawProof, "proof", parseProofEntry);
  if (proof !== undefined && isErr(proof)) return proof;

  const rawFindings = prop(parsed, "findings");
  const findings = rawFindings === undefined ? undefined : parseFindings(rawFindings);
  if (findings !== undefined && isErr(findings)) return findings;

  const graphFile = prop(parsed, "graph_file");
  if (graphFile !== undefined && (!isString(graphFile) || graphFile.trim() === ""))
    return err('"graph_file" must be a non-empty path');

  const rawMarks = prop(parsed, "marks");
  const marks = rawMarks === undefined ? undefined : parseList(rawMarks, "marks", parseMarkedClaim);
  if (marks !== undefined && isErr(marks)) return marks;

  return ok({
    ...(proof === undefined ? {} : { proof: proof.value }),
    ...(findings === undefined ? {} : { findings: findings.value }),
    ...(graphFile === undefined ? {} : { graphFile }),
    ...(marks === undefined ? {} : { marks: marks.value }),
  });
}
