import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export interface Brief {
  readonly graph: string;
  readonly node: string;
  readonly role: string;
  readonly acceptance: string;
  readonly gates: readonly string[];
  readonly scope: readonly string[];
}

export function isBrief(value: unknown): value is Brief {
  return (
    isRecord(value) &&
    isString(prop(value, "graph")) &&
    isString(prop(value, "node")) &&
    isString(prop(value, "role")) &&
    isString(prop(value, "acceptance")) &&
    isStringArray(prop(value, "gates")) &&
    isStringArray(prop(value, "scope"))
  );
}
