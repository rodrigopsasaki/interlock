export type Verb =
  | { readonly kind: "approve"; readonly graph: string }
  | { readonly kind: "run"; readonly graph: string; readonly node: string }
  | { readonly kind: "judge"; readonly graph: string; readonly node: string }
  | { readonly kind: "cancel"; readonly graph: string; readonly node: string }
  | { readonly kind: "reset"; readonly graph: string; readonly node: string }
  | {
      readonly kind: "waive";
      readonly graph: string;
      readonly node: string;
      readonly gate: string;
    }
  | { readonly kind: "sweep" }
  | { readonly kind: "backfill"; readonly graph: string };

export interface Accountable {
  readonly by: string;
  readonly because: string;
}

const ACCOUNTABLE_VERBS: ReadonlySet<Verb["kind"]> = new Set([
  "approve",
  "cancel",
  "reset",
  "waive",
]);

export function verbNeedsAccountability(kind: Verb["kind"]): boolean {
  return ACCOUNTABLE_VERBS.has(kind);
}

export function verbCommand(
  verb: Verb,
  accountable?: Accountable,
): readonly string[] {
  const because =
    accountable === undefined
      ? []
      : ["--by", accountable.by, "--because", accountable.because];
  switch (verb.kind) {
    case "approve":
      return ["graph", "approve", verb.graph, ...because];
    case "run":
      return ["run", verb.graph, verb.node];
    case "judge":
      return ["judge", verb.graph, verb.node];
    case "cancel":
      return ["node", "cancel", verb.graph, verb.node, ...because];
    case "reset":
      return ["node", "reset", verb.graph, verb.node, ...because];
    case "waive":
      return ["gate", "waive", verb.graph, verb.node, verb.gate, ...because];
    case "sweep":
      return ["sweep"];
    case "backfill":
      return ["backfill", verb.graph];
  }
}
