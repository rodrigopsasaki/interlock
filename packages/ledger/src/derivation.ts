import { isRecord, isString, prop } from "./validate.js";

export type Derivation =
  | {
      readonly kind: "gate";
      readonly gate: string;
      readonly version: string;
      readonly runner: string;
    }
  | {
      readonly kind: "model";
      readonly model: string;
      readonly promptId: string;
      readonly lens: string;
    }
  | { readonly kind: "human"; readonly who: string };

export const derivation = {
  gate: (gate: string, version: string, runner: string): Derivation => ({
    kind: "gate",
    gate,
    version,
    runner,
  }),
  model: (model: string, promptId: string, lens: string): Derivation => ({
    kind: "model",
    model,
    promptId,
    lens,
  }),
  human: (who: string): Derivation => ({ kind: "human", who }),
};

export function isDerivation(value: unknown): value is Derivation {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "gate":
      return (
        isString(prop(value, "gate")) &&
        isString(prop(value, "version")) &&
        isString(prop(value, "runner"))
      );
    case "model":
      return (
        isString(prop(value, "model")) &&
        isString(prop(value, "promptId")) &&
        isString(prop(value, "lens"))
      );
    case "human":
      return isString(prop(value, "who"));
    default:
      return false;
  }
}
