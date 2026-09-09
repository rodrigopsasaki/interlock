import { isRecord, isString, prop } from "./validate.js";

// `because`, not `note`: this ledger already reserves that word for the choice/surprise type.
export interface Mandate {
  readonly grantedBy: string;
  readonly actionKind: string;
  readonly context: string;
  readonly notAfter: string;
  readonly because: string;
}

export interface MandateQuery {
  readonly actionKind: string;
  readonly context: string;
  readonly now: string;
}

export function mandateCovers(mandate: Mandate, query: MandateQuery): boolean {
  if (mandate.actionKind !== query.actionKind) return false;
  if (mandate.context !== "any" && mandate.context !== query.context)
    return false;
  return query.now <= mandate.notAfter;
}

export function isMandate(value: unknown): value is Mandate {
  return (
    isRecord(value) &&
    isString(prop(value, "grantedBy")) &&
    isString(prop(value, "actionKind")) &&
    isString(prop(value, "context")) &&
    isString(prop(value, "notAfter")) &&
    isString(prop(value, "because"))
  );
}
