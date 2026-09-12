export type ItemKind =
  | "convention"
  | "discipline"
  | "decision"
  | "risk"
  | "value"
  | "tension"
  | "absence";

export type ItemStanding = "ratified" | "professed" | "observed" | "hypothesis";

export type ItemScope =
  | { readonly kind: "repository" }
  | { readonly kind: "path"; readonly path: string }
  | { readonly kind: "organisation" };

export interface Item {
  readonly kind: ItemKind;
  readonly statement: string;
  readonly because?: string;
  readonly scope?: ItemScope;
  readonly standing?: ItemStanding;
  readonly derivation: string;
}

const KIND_ORDER: readonly ItemKind[] = [
  "convention",
  "discipline",
  "decision",
  "risk",
  "value",
  "tension",
  "absence",
];

const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  convention: "Convention",
  discipline: "Discipline",
  decision: "Decision",
  risk: "Risk",
  value: "Value",
  tension: "Tension",
  absence: "Absence",
};

function renderItemScope(scope: ItemScope): string {
  switch (scope.kind) {
    case "repository":
      return "repository";
    case "path":
      return `path ${scope.path}`;
    case "organisation":
      return "organisation";
  }
}

function renderItem(item: Item): string {
  const meta = [
    item.standing,
    item.scope === undefined ? undefined : renderItemScope(item.scope),
  ].filter((value): value is string => value !== undefined);
  const prefix = meta.length === 0 ? "" : `[${meta.join(", ")}] `;
  const because = item.because === undefined ? "" : ` (because ${item.because})`;
  return `- ${prefix}${item.statement}${because}\n  derivation: ${item.derivation}`;
}

// Pure: no substrate client exists yet, so items always arrive already typed, from a fixture in
// tests and, later, from the substrate's context call.
export function renderSlice(substrateAddress: string, items: readonly Item[]): string {
  if (substrateAddress === "none") {
    return "No substrate is configured; this brief carries no context slice.";
  }

  return KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((item) => item.kind === kind),
  }))
    .filter((section) => section.items.length > 0)
    .map(
      (section) =>
        `### ${KIND_LABEL[section.kind]}\n\n${section.items.map(renderItem).join("\n\n")}`,
    )
    .join("\n\n");
}
