import { isRecord, isString, prop } from "./validate.ts";

export const SESSION_FACTS_SHAPE = "session-facts@v0";

export interface Known<T> {
  readonly state: "known";
  readonly value: T;
}

export interface Unknown {
  readonly state: "unknown";
}

export type SessionFact<T> = Known<T> | Unknown;

export interface SessionUsage {
  readonly input?: number;
  readonly output?: number;
  readonly cachedInput?: number;
  readonly reasoning?: number;
  readonly raw: Readonly<Record<string, number>>;
}

export interface SessionQuota {
  readonly window: string;
  readonly usedPercentage: number;
}

export type DeliveryBasis = "record" | "status";

interface SessionFactsBase {
  readonly lastActivity: SessionFact<string>;
  readonly usage: SessionFact<SessionUsage>;
  readonly quota: SessionFact<SessionQuota>;
}

export type SessionFacts = SessionFactsBase &
  (
    | {
        readonly promptReceived: SessionFact<"yes">;
        readonly deliveryBasis: "record";
      }
    | {
        readonly promptReceived: Unknown;
        readonly deliveryBasis: "status";
      }
  );

export const sessionFacts = {
  known: <T>(value: T): Known<T> => ({ state: "known", value }),
  unknown: (): SessionFacts => ({
    promptReceived: { state: "unknown" },
    lastActivity: { state: "unknown" },
    usage: { state: "unknown" },
    quota: { state: "unknown" },
    deliveryBasis: "status",
  }),
};

function isRfc3339(value: unknown): value is string {
  if (!isString(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function isCounterMap(value: unknown): value is Readonly<Record<string, number>> {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key.length > 0) &&
    Object.values(value).every((counter) => typeof counter === "number" && Number.isFinite(counter))
  );
}

function isSessionUsage(value: unknown): value is SessionUsage {
  if (!isRecord(value)) return false;
  if (
    !Object.keys(value).every(
      (key) =>
        key === "input" ||
        key === "output" ||
        key === "cachedInput" ||
        key === "reasoning" ||
        key === "raw",
    )
  ) {
    return false;
  }
  const raw = prop(value, "raw");
  if (!isCounterMap(raw)) return false;
  return ["input", "output", "cachedInput", "reasoning"].every((key) => {
    const counter = prop(value, key);
    return counter === undefined || (typeof counter === "number" && Number.isFinite(counter));
  });
}

function isSessionQuota(value: unknown): value is SessionQuota {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "window" || key === "usedPercentage") &&
    isString(prop(value, "window")) &&
    typeof prop(value, "usedPercentage") === "number" &&
    Number.isFinite(prop(value, "usedPercentage"))
  );
}

function isUnknown(value: unknown): value is Unknown {
  return isRecord(value) && Object.keys(value).length === 1 && prop(value, "state") === "unknown";
}

function isKnown<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
): value is Known<T> {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    prop(value, "state") === "known" &&
    guard(prop(value, "value"))
  );
}

function isSessionFact<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
): value is SessionFact<T> {
  return isUnknown(value) || isKnown(value, guard);
}

export function isSessionFacts(value: unknown): value is SessionFacts {
  if (!isRecord(value)) return false;
  if (
    !Object.keys(value).every(
      (key) =>
        key === "promptReceived" ||
        key === "lastActivity" ||
        key === "usage" ||
        key === "quota" ||
        key === "deliveryBasis",
    )
  ) {
    return false;
  }
  const promptReceived = prop(value, "promptReceived");
  const lastActivity = prop(value, "lastActivity");
  const usage = prop(value, "usage");
  const quota = prop(value, "quota");
  const deliveryBasis = prop(value, "deliveryBasis");
  return (
    isSessionFact(promptReceived, (candidate): candidate is "yes" => candidate === "yes") &&
    isSessionFact(lastActivity, isRfc3339) &&
    isSessionFact(usage, isSessionUsage) &&
    isSessionFact(quota, isSessionQuota) &&
    (deliveryBasis === "record" || (deliveryBasis === "status" && isUnknown(promptReceived)))
  );
}
