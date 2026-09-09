import { isRecord, isString, isStringArray, prop } from "./validate.js";

export interface Discovery {
  readonly id: string;
  readonly what: string;
  readonly foundAt: string;
  readonly matteredBecause: string;
}

export interface Decision {
  readonly id: string;
  readonly what: string;
  readonly restsOn: readonly string[];
  readonly hunks: readonly string[];
  readonly produces?: readonly string[];
  readonly rejected?: string;
}

export interface Debrief {
  readonly graph: string;
  readonly node: string;
  readonly role: string;
  readonly headSha: string;
  readonly discoveries: readonly Discovery[];
  readonly decisions: readonly Decision[];
  readonly open: readonly string[];
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
    isStringArray(prop(value, "restsOn")) &&
    isStringArray(prop(value, "hunks")) &&
    (produces === undefined || isStringArray(produces)) &&
    (rejected === undefined || isString(rejected))
  );
}

export function isDebrief(value: unknown): value is Debrief {
  if (!isRecord(value)) return false;
  const discoveries = prop(value, "discoveries");
  const decisions = prop(value, "decisions");
  return (
    isString(prop(value, "graph")) &&
    isString(prop(value, "node")) &&
    isString(prop(value, "role")) &&
    isString(prop(value, "headSha")) &&
    Array.isArray(discoveries) &&
    discoveries.every(isDiscovery) &&
    Array.isArray(decisions) &&
    decisions.every(isDecision) &&
    isStringArray(prop(value, "open"))
  );
}
