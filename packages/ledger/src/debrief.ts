import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export interface Discovery {
  readonly id: string;
  readonly what: string;
  readonly foundAt: string;
  readonly matteredBecause: string;
}

export interface Decision {
  readonly id: string;
  readonly what: string;
  readonly because: string;
  readonly restsOn: readonly string[];
  readonly hunks: readonly string[];
  readonly produces?: readonly string[];
  readonly rejected?: string;
}

// Who ran the session that produced this debrief -- a session-level fact, distinct from
// `Derivation`, which names who produced one receipt or mark.
export type DebriefDerivation =
  | { readonly kind: "agent"; readonly runtime: string; readonly model: string }
  | { readonly kind: "human"; readonly who: string };

// Presence, not a kind: a debrief is drafted the moment this is set, authored otherwise.
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
}

export function isDiscovery(value: unknown): value is Discovery {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isString(prop(value, "what")) &&
    isString(prop(value, "foundAt")) &&
    isString(prop(value, "matteredBecause"))
  );
}

export function isDecision(value: unknown): value is Decision {
  if (!isRecord(value)) return false;
  const produces = prop(value, "produces");
  const rejected = prop(value, "rejected");
  return (
    isString(prop(value, "id")) &&
    isString(prop(value, "what")) &&
    isString(prop(value, "because")) &&
    isStringArray(prop(value, "restsOn")) &&
    isStringArray(prop(value, "hunks")) &&
    (produces === undefined || isStringArray(produces)) &&
    (rejected === undefined || isString(rejected))
  );
}

export function isDebriefDerivation(
  value: unknown,
): value is DebriefDerivation {
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
  return (
    isRecord(value) &&
    isString(prop(value, "by")) &&
    isString(prop(value, "from"))
  );
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
    (drafted === undefined || isDrafted(drafted))
  );
}
