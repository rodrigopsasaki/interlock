import { isRecord, isString, prop } from "./validate.ts";

export const SESSION_FACTS_SHAPE = "session-facts@v0";

export type SessionFact<T> = T | "unknown";

export type SessionUsage = Readonly<Record<string, number>>;

export interface SessionQuota {
  readonly window: string;
  readonly usedPercentage: number;
}

export type DeliveryBasis = "record" | "status";

export interface SessionFacts {
  readonly promptReceived: "yes" | "unknown";
  readonly lastActivity: SessionFact<string>;
  readonly usage: SessionFact<SessionUsage>;
  readonly quota: SessionFact<SessionQuota>;
  readonly deliveryBasis: DeliveryBasis;
}

export const sessionFacts = {
  unknown: (): SessionFacts => ({
    promptReceived: "unknown",
    lastActivity: "unknown",
    usage: "unknown",
    quota: "unknown",
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

function isSessionUsage(value: unknown): value is SessionUsage {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key.length > 0) &&
    Object.values(value).every((counter) => typeof counter === "number" && Number.isFinite(counter))
  );
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
    (promptReceived === "yes" || promptReceived === "unknown") &&
    (lastActivity === "unknown" || isRfc3339(lastActivity)) &&
    (usage === "unknown" || isSessionUsage(usage)) &&
    (quota === "unknown" || isSessionQuota(quota)) &&
    (deliveryBasis === "record" || deliveryBasis === "status")
  );
}
