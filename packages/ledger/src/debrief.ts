import { type AppliesTo, isAppliesTo } from "./applicability.ts";
import { isMarkKind, type MarkKind } from "./mark.ts";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export interface Discovery {
  readonly id: string;
  readonly what: string;
  readonly foundAt: string;
  readonly matteredBecause: string;
  readonly appliesTo?: AppliesTo;
}

export interface Decision {
  readonly id: string;
  readonly what: string;
  readonly because: string;
  readonly restsOn: readonly string[];
  readonly hunks: readonly string[];
  readonly appliesTo?: AppliesTo;
  readonly produces?: readonly string[];
  readonly rejected?: string;
}

export type DebriefDerivation =
  | { readonly kind: "agent"; readonly runtime: string; readonly model: string }
  | { readonly kind: "human"; readonly who: string };

export interface Drafted {
  readonly by: string;
  readonly from: string;
}

export interface GateRun {
  readonly id: string;
  readonly result: "pass" | "fail";
  readonly invocation?: string;
  readonly note?: string;
}

export interface ProofEntry {
  readonly test: string;
  readonly pins: string;
  readonly gate?: string;
}

export interface Finding {
  readonly id: string;
  readonly what: string;
  readonly foundAt: string;
}

export interface Findings {
  readonly lens: string;
  readonly items: readonly Finding[];
}

export interface MarkedClaim {
  readonly claim: string;
  readonly mark: MarkKind;
  readonly because: string;
}

export interface Debrief {
  readonly graph: string;
  readonly node: string;
  readonly role: string;
  readonly graphBaseSha: string;
  readonly sessionStartSha: string;
  readonly headSha: string;
  readonly derivation: DebriefDerivation;
  readonly discoveries: readonly Discovery[];
  readonly decisions: readonly Decision[];
  readonly gatesRunByAgent: readonly GateRun[];
  readonly open: readonly string[];
  readonly drafted?: Drafted;
  readonly proof?: readonly ProofEntry[];
  readonly findings?: Findings;
  readonly graphFile?: string;
  readonly marks?: readonly MarkedClaim[];
}

export function isProofEntry(value: unknown): value is ProofEntry {
  if (!isRecord(value)) return false;
  const gate = prop(value, "gate");
  return (
    isString(prop(value, "test")) &&
    isString(prop(value, "pins")) &&
    (gate === undefined || isString(gate))
  );
}

export function isFinding(value: unknown): value is Finding {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isString(prop(value, "what")) &&
    isString(prop(value, "foundAt"))
  );
}

export function isFindings(value: unknown): value is Findings {
  if (!isRecord(value)) return false;
  const items = prop(value, "items");
  return isString(prop(value, "lens")) && Array.isArray(items) && items.every(isFinding);
}

export function isMarkedClaim(value: unknown): value is MarkedClaim {
  return (
    isRecord(value) &&
    isString(prop(value, "claim")) &&
    isMarkKind(prop(value, "mark")) &&
    isString(prop(value, "because"))
  );
}

function isOptionalListOf<T>(value: unknown, guard: (item: unknown) => item is T): boolean {
  return value === undefined || (Array.isArray(value) && value.every(guard));
}

export function isDiscovery(value: unknown): value is Discovery {
  if (!isRecord(value)) return false;
  const appliesTo = prop(value, "appliesTo");
  return (
    isString(prop(value, "id")) &&
    isString(prop(value, "what")) &&
    isString(prop(value, "foundAt")) &&
    isString(prop(value, "matteredBecause")) &&
    (appliesTo === undefined || isAppliesTo(appliesTo))
  );
}

export function isDecision(value: unknown): value is Decision {
  if (!isRecord(value)) return false;
  const produces = prop(value, "produces");
  const rejected = prop(value, "rejected");
  const appliesTo = prop(value, "appliesTo");
  return (
    isString(prop(value, "id")) &&
    isString(prop(value, "what")) &&
    isString(prop(value, "because")) &&
    isStringArray(prop(value, "restsOn")) &&
    isStringArray(prop(value, "hunks")) &&
    (appliesTo === undefined || isAppliesTo(appliesTo)) &&
    (produces === undefined || isStringArray(produces)) &&
    (rejected === undefined || isString(rejected))
  );
}

export function isDebriefDerivation(value: unknown): value is DebriefDerivation {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "agent":
      return isString(prop(value, "runtime")) && isString(prop(value, "model"));
    case "human":
      return isString(prop(value, "who"));
    default:
      return false;
  }
}

export function isDrafted(value: unknown): value is Drafted {
  return isRecord(value) && isString(prop(value, "by")) && isString(prop(value, "from"));
}

export function isGateRun(value: unknown): value is GateRun {
  if (!isRecord(value)) return false;
  const result = prop(value, "result");
  const invocation = prop(value, "invocation");
  const note = prop(value, "note");
  return (
    isString(prop(value, "id")) &&
    (result === "pass" || result === "fail") &&
    (invocation === undefined || isString(invocation)) &&
    (note === undefined || isString(note))
  );
}

export function isDebrief(value: unknown): value is Debrief {
  if (!isRecord(value)) return false;
  const discoveries = prop(value, "discoveries");
  const decisions = prop(value, "decisions");
  const gatesRunByAgent = prop(value, "gatesRunByAgent");
  const drafted = prop(value, "drafted");
  const findings = prop(value, "findings");
  const graphFile = prop(value, "graphFile");
  return (
    isString(prop(value, "graph")) &&
    isString(prop(value, "node")) &&
    isString(prop(value, "role")) &&
    isString(prop(value, "graphBaseSha")) &&
    isString(prop(value, "sessionStartSha")) &&
    isString(prop(value, "headSha")) &&
    isDebriefDerivation(prop(value, "derivation")) &&
    Array.isArray(discoveries) &&
    discoveries.every(isDiscovery) &&
    Array.isArray(decisions) &&
    decisions.every(isDecision) &&
    Array.isArray(gatesRunByAgent) &&
    gatesRunByAgent.every(isGateRun) &&
    isStringArray(prop(value, "open")) &&
    (drafted === undefined || isDrafted(drafted)) &&
    isOptionalListOf(prop(value, "proof"), isProofEntry) &&
    (findings === undefined || isFindings(findings)) &&
    (graphFile === undefined || isString(graphFile)) &&
    isOptionalListOf(prop(value, "marks"), isMarkedClaim)
  );
}
