import { isRecord, prop } from "./validate.js";

export type Spend =
  | { readonly kind: "none" }
  | {
      readonly kind: "metered";
      readonly amountUsdMicros: number;
      readonly unmeteredCalls: number;
    }
  | { readonly kind: "local" };

export const spend = {
  none: (): Spend => ({ kind: "none" }),
  metered: (amountUsdMicros: number, unmeteredCalls: number): Spend => ({
    kind: "metered",
    amountUsdMicros,
    unmeteredCalls,
  }),
  local: (): Spend => ({ kind: "local" }),
};

export function isSpend(value: unknown): value is Spend {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "none":
    case "local":
      return true;
    case "metered":
      return (
        typeof prop(value, "amountUsdMicros") === "number" &&
        typeof prop(value, "unmeteredCalls") === "number"
      );
    default:
      return false;
  }
}
