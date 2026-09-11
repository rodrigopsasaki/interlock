import type {
  Brief,
  Debrief,
  Decision,
  Discovery,
  Gate,
  Narrated,
  NodeView,
  Note,
  Outcome,
  SessionView,
} from "ledger";

function isoOf(wallMs: number): string {
  return new Date(wallMs).toISOString();
}

export function renderGate(gateId: string, current: Gate | undefined): string {
  if (current === undefined) return `  ${gateId}: pending`;
  switch (current.kind) {
    case "pending":
      return `  ${gateId}: pending`;
    case "satisfied":
      return `  ${gateId}: satisfied (receipt ${current.receipt.id})`;
    case "waived":
      return `  ${gateId}: waived by ${current.authority} (receipt ${current.receipt.id})`;
    case "blocked":
      return `  ${gateId}: blocked (${current.because})`;
    case "superseded":
      return `  ${gateId}: superseded by ${current.authority}`;
  }
}

export function renderDerivation(debrief: Debrief | undefined): string {
  if (debrief === undefined) return "  derivation: none, no debrief filed";
  const derivation = debrief.derivation;
  return derivation.kind === "agent"
    ? `  derivation: runtime ${derivation.runtime}, model ${derivation.model}`
    : `  derivation: human, ${derivation.who}`;
}

export function renderOutcome(outcome: Outcome | undefined): string {
  if (outcome === undefined) return "  no outcome yet";
  switch (outcome.kind) {
    case "cleared":
      return `  cleared (${outcome.receipts.length} receipt(s))`;
    case "held":
      return `  held: ${outcome.because} (revisit ${isoOf(outcome.expiry)})`;
    case "reset":
      return `  reset by ${outcome.authority}: ${outcome.because}`;
    case "failed":
      return `  failed (${outcome.disposition}): ${outcome.because}`;
    case "cancelled":
      return `  cancelled by ${outcome.authority}: ${outcome.because}`;
    case "superseded":
      return `  superseded by ${outcome.authority}: ${outcome.because}`;
  }
}

export function renderNote(entry: Note): string {
  if (entry.kind === "choice") {
    const rejected =
      entry.rejected !== undefined && entry.rejected.length > 0
        ? `; rejected: ${entry.rejected.join(", ")}`
        : "";
    return `  [${entry.at}] chose: ${entry.chose} — because: ${entry.because}${rejected}`;
  }
  return `  [${entry.at}] expected ${entry.expected}, observed ${entry.observed}`;
}

export function renderNarrated(entry: Narrated): string {
  return `  ${isoOf(entry.at)}: ${entry.line}`;
}

export function renderDiscovery(discovery: Discovery): string {
  return `  ${discovery.id}: ${discovery.what}`;
}

export function renderDecision(
  decision: Decision,
  printBecause: boolean,
): string {
  const hunks =
    decision.hunks.length > 0 ? decision.hunks.join(", ") : "(no hunks)";
  const becauseSuffix = printBecause ? `; because: ${decision.because}` : "";
  return `  ${decision.id}: ${hunks}${becauseSuffix}`;
}

export function renderBrief(brief: Brief): string {
  const gates = brief.gates.length > 0 ? brief.gates.join(", ") : "(none)";
  return [
    "Brief",
    `  acceptance: ${brief.acceptance}`,
    `  gates: ${gates}`,
  ].join("\n");
}

export function renderContext(
  view: SessionView,
  nodeView: NodeView | undefined,
): string {
  const gateLines =
    view.brief.gates.length > 0
      ? view.brief.gates
          .map((gateId) => renderGate(gateId, nodeView?.gates.get(gateId)))
          .join("\n")
      : "  (no gates declared)";
  return [
    "Context",
    `  graph base sha: ${view.graphBaseSha ?? "unknown"}`,
    renderDerivation(view.debrief),
    "  gates:",
    gateLines,
  ].join("\n");
}

export function renderDebriefBackedSection(
  title: string,
  view: SessionView,
  legacyLine: string | undefined,
  renderItems: (debrief: Debrief) => readonly string[],
): string {
  if (view.debrief !== undefined) {
    const items = renderItems(view.debrief);
    return [title, ...(items.length > 0 ? items : ["  (none)"])].join("\n");
  }
  if (legacyLine !== undefined) return [title, `  ${legacyLine}`].join("\n");
  return [title, "  no debrief filed for this session"].join("\n");
}

export interface SessionColumnsInput {
  readonly graph: string;
  readonly node: string;
  readonly view: SessionView;
  readonly nodeView: NodeView | undefined;
  readonly legacyLine: string | undefined;
  readonly printBecause: boolean;
}

export function renderSessionColumns(input: SessionColumnsInput): string {
  const { graph, node, view, nodeView, legacyLine, printBecause } = input;
  return [
    `${graph}/${node} · session ${view.session}`,
    renderBrief(view.brief),
    renderContext(view, nodeView),
    renderDebriefBackedSection("Discoveries", view, legacyLine, (debrief) =>
      debrief.discoveries.map(renderDiscovery),
    ),
    renderDebriefBackedSection("Decisions", view, legacyLine, (debrief) =>
      debrief.decisions.map((decision) =>
        renderDecision(decision, printBecause),
      ),
    ),
    ["Outcome", renderOutcome(nodeView?.outcome)].join("\n"),
    [
      "Notes",
      ...(view.notes.length > 0 ? view.notes.map(renderNote) : ["  (none)"]),
    ].join("\n"),
    [
      "Narration",
      ...(view.narration.length > 0
        ? view.narration.map(renderNarrated)
        : ["  (no narration recorded)"]),
    ].join("\n"),
  ].join("\n\n");
}
