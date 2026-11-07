import { isRecord, isString, prop } from "./validate.ts";

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
  | { readonly kind: "human"; readonly who: string }
  | {
      readonly kind: "human";
      readonly who: string;
      readonly for: string;
      readonly cite: string;
      readonly citeKey: string;
      readonly author: string;
      readonly words: string;
      readonly at: string | number;
      readonly reading: string;
      readonly action: "approve" | "clear" | "publish";
      readonly target: {
        readonly graph: string;
        readonly node?: string;
        readonly gate?: string;
      };
      readonly contentHash: string;
    };

export type DelegatedDerivation = Extract<Derivation, { readonly cite: string }>;

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
  delegated: (value: Omit<DelegatedDerivation, "kind">): DelegatedDerivation => ({
    kind: "human",
    ...value,
  }),
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
    case "human": {
      const who = prop(value, "who");
      if (!isString(who)) return false;
      const fields = [
        "for",
        "cite",
        "citeKey",
        "author",
        "words",
        "at",
        "reading",
        "action",
        "target",
        "contentHash",
      ].map((key) => prop(value, key));
      if (fields.every((field) => field === undefined)) return true;
      const target = prop(value, "target");
      return (
        isString(prop(value, "for")) &&
        isString(prop(value, "cite")) &&
        isString(prop(value, "citeKey")) &&
        isString(prop(value, "author")) &&
        isString(prop(value, "words")) &&
        (isString(prop(value, "at")) || typeof prop(value, "at") === "number") &&
        isString(prop(value, "reading")) &&
        (prop(value, "action") === "approve" ||
          prop(value, "action") === "clear" ||
          prop(value, "action") === "publish") &&
        isRecord(target) &&
        isString(prop(target, "graph")) &&
        (prop(target, "node") === undefined || isString(prop(target, "node"))) &&
        (prop(target, "gate") === undefined || isString(prop(target, "gate"))) &&
        isString(prop(value, "contentHash"))
      );
    }
    default:
      return false;
  }
}
