import { isNode, type Node } from "./graph.ts";
import { isRecord, isString, prop } from "./validate.ts";

export type ProviderHeadroom =
  | {
      readonly state: "known";
      readonly fraction: number;
      readonly raw: number;
      readonly unit: string;
      readonly source: string;
      readonly rateLimited?: boolean;
    }
  | { readonly state: "unknown"; readonly reason: string; readonly rateLimited?: boolean };

export interface CandidateReading {
  readonly provider: string;
  readonly headroom: ProviderHeadroom;
}

export type ChosenBy =
  | { readonly kind: "unrecorded" }
  | { readonly kind: "explicit" }
  | {
      readonly kind: "routed";
      readonly candidates: readonly CandidateReading[];
      readonly because: string;
    }
  | {
      readonly kind: "last-resort";
      readonly because: string;
      readonly candidates: readonly CandidateReading[];
    }
  | { readonly kind: "fallback"; readonly because: string };

function isFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isProviderHeadroom(value: unknown): value is ProviderHeadroom {
  if (!isRecord(value)) return false;
  if (prop(value, "rateLimited") !== undefined && typeof prop(value, "rateLimited") !== "boolean")
    return false;
  const state = prop(value, "state");
  if (state === "known") {
    return (
      isFraction(prop(value, "fraction")) &&
      typeof prop(value, "raw") === "number" &&
      Number.isFinite(prop(value, "raw")) &&
      isString(prop(value, "unit")) &&
      isString(prop(value, "source"))
    );
  }
  if (state === "unknown") return isString(prop(value, "reason"));
  return false;
}

export function isCandidateReading(value: unknown): value is CandidateReading {
  return (
    isRecord(value) &&
    isString(prop(value, "provider")) &&
    isProviderHeadroom(prop(value, "headroom"))
  );
}

export function isChosenBy(value: unknown): value is ChosenBy {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  switch (kind) {
    case "unrecorded":
    case "explicit":
      return true;
    case "last-resort":
    case "routed": {
      const candidates = prop(value, "candidates");
      return (
        Array.isArray(candidates) &&
        candidates.every(isCandidateReading) &&
        isString(prop(value, "because"))
      );
    }
    case "fallback":
      return isString(prop(value, "because"));
    default:
      return false;
  }
}

export type SessionRuntime =
  | {
      readonly name: string;
      readonly kind: string;
      readonly model: string | undefined;
      readonly provider?: string;
      readonly chosenBy?: ChosenBy;
    }
  | "unknown";

export const sessionRuntime = {
  declared: (
    name: string,
    kind: string,
    model: string | undefined,
    attribution?: { readonly provider?: string; readonly chosenBy?: ChosenBy },
  ): SessionRuntime => ({
    name,
    kind,
    model,
    ...(attribution?.provider === undefined ? {} : { provider: attribution.provider }),
    ...(attribution?.chosenBy === undefined ? {} : { chosenBy: attribution.chosenBy }),
  }),
  unknown: (): SessionRuntime => "unknown",
};

export function isSessionRuntime(value: unknown): value is SessionRuntime {
  if (value === "unknown") return true;
  if (!isRecord(value)) return false;
  const provider = prop(value, "provider");
  const chosenBy = prop(value, "chosenBy");
  return (
    isString(prop(value, "name")) &&
    isString(prop(value, "kind")) &&
    (prop(value, "model") === undefined || isString(prop(value, "model"))) &&
    (provider === undefined || isString(provider)) &&
    (chosenBy === undefined || isChosenBy(chosenBy))
  );
}

export interface Session {
  readonly id: string;
  readonly node: Node;
  readonly runtime: SessionRuntime;
}

export function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isNode(prop(value, "node")) &&
    isSessionRuntime(prop(value, "runtime"))
  );
}

export type SessionStartedAt =
  | { readonly state: "known"; readonly epochMs: number }
  | { readonly state: "unknown"; readonly because: string };

export const UNRECORDED_START =
  "its session-started event records no start time, as a historical or backfilled session's does not";

export function isEpochMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function sessionStartedAt(epochMs: number | undefined): SessionStartedAt {
  return epochMs === undefined
    ? { state: "unknown", because: UNRECORDED_START }
    : { state: "known", epochMs };
}

export function runtimeAttribution(runtime: SessionRuntime): {
  readonly provider: string;
  readonly chosenBy: ChosenBy;
} {
  return {
    provider: runtime === "unknown" ? "unknown" : (runtime.provider ?? "unknown"),
    chosenBy:
      runtime === "unknown" ? { kind: "unrecorded" } : (runtime.chosenBy ?? { kind: "unrecorded" }),
  };
}
