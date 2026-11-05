import { isRecord, isString, prop } from "./validate.ts";

export const SUBSTRATE_VERBS = ["context", "vocabulary", "absorb"] as const;

export type SubstrateVerb = (typeof SUBSTRATE_VERBS)[number];

export interface WalkStep {
  readonly verb: SubstrateVerb;
  readonly ask: string;
}

export type Walk =
  | { readonly kind: "address"; readonly address: string; readonly steps: readonly WalkStep[] }
  | { readonly kind: "none"; readonly because: string };

export const NO_ADDRESS_WALK_BECAUSE = "the substrate address is none, so there is nothing to ask";

export function walkFor(address: string, steps: readonly WalkStep[]): Walk {
  return address === "none"
    ? { kind: "none", because: NO_ADDRESS_WALK_BECAUSE }
    : { kind: "address", address, steps };
}

export function isSubstrateVerb(value: unknown): value is SubstrateVerb {
  return SUBSTRATE_VERBS.some((verb) => verb === value);
}

export function isWalkStep(value: unknown): value is WalkStep {
  return isRecord(value) && isSubstrateVerb(prop(value, "verb")) && isString(prop(value, "ask"));
}

export function isWalk(value: unknown): value is Walk {
  if (!isRecord(value)) return false;
  switch (prop(value, "kind")) {
    case "address": {
      const steps = prop(value, "steps");
      return isString(prop(value, "address")) && Array.isArray(steps) && steps.every(isWalkStep);
    }
    case "none":
      return isString(prop(value, "because"));
    default:
      return false;
  }
}
