import { isErr } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { findRepoRoot, sharedJournalDirectory } from "face";
import {
  nodeKey,
  readReplay,
  type Brief,
  type Debrief,
  type Decision,
  type Discovery,
  type Gate,
  type Narrated,
  type Note,
  type NodeView,
  type Outcome,
  type SessionView,
} from "ledger";
import { describeDebriefRead } from "../debrief/validate.ts";
import type { CommandResult } from "../main.ts";

function sessionOverrideFrom(args: readonly string[]): string | undefined {
  const flagIndex = args.indexOf("--session");
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

function hasBecauseFlag(args: readonly string[]): boolean {
  return args.includes("--because");
}

function isoOf(wallMs: number): string {
  return new Date(wallMs).toISOString();
}

function renderGate(gateId: string, current: Gate | undefined): string {
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

function renderDerivation(debrief: Debrief | undefined): string {
  if (debrief === undefined) return "  derivation: none, no debrief filed";
  const derivation = debrief.derivation;
  return derivation.kind === "agent"
    ? `  derivation: runtime ${derivation.runtime}, model ${derivation.model}`
    : `  derivation: human, ${derivation.who}`;
}

function renderOutcome(outcome: Outcome | undefined): string {
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

function renderNote(entry: Note): string {
  if (entry.kind === "choice") {
    const rejected =
      entry.rejected !== undefined && entry.rejected.length > 0
        ? `; rejected: ${entry.rejected.join(", ")}`
        : "";
    return `  [${entry.at}] chose: ${entry.chose} — because: ${entry.because}${rejected}`;
  }
  return `  [${entry.at}] expected ${entry.expected}, observed ${entry.observed}`;
}

function renderNarrated(entry: Narrated): string {
  return `  ${isoOf(entry.at)}: ${entry.line}`;
}

function renderDiscovery(discovery: Discovery): string {
  return `  ${discovery.id}: ${discovery.what}`;
}

function renderDecision(decision: Decision, printBecause: boolean): string {
  const hunks =
    decision.hunks.length > 0 ? decision.hunks.join(", ") : "(no hunks)";
  const becauseSuffix = printBecause ? `; because: ${decision.because}` : "";
  return `  ${decision.id}: ${hunks}${becauseSuffix}`;
}

async function legacyDebriefLine(
  repoRoot: string,
  graph: string,
  node: string,
  isLatestSession: boolean,
): Promise<string | undefined> {
  if (!isLatestSession) return undefined;
  const read = await readDebriefFile(debriefFilePath(repoRoot, graph, node));
  return isErr(read) ? undefined : describeDebriefRead(read.value);
}

function renderBrief(brief: Brief): string {
  const gates = brief.gates.length > 0 ? brief.gates.join(", ") : "(none)";
  return [
    "Brief",
    `  acceptance: ${brief.acceptance}`,
    `  gates: ${gates}`,
  ].join("\n");
}

function renderContext(
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

function renderDebriefBackedSection(
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

async function renderSessionView(
  repoRoot: string,
  graph: string,
  node: string,
  view: SessionView,
  nodeView: NodeView | undefined,
  isLatestSession: boolean,
  printBecause: boolean,
): Promise<string> {
  const legacyLine = await legacyDebriefLine(
    repoRoot,
    graph,
    node,
    isLatestSession && view.debrief === undefined,
  );

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

export async function runSessionShow(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock session show: expected a graph id and a node id, e.g. "interlock session show 0001-bootstrap verifier-hunks".',
    };
  }

  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const journal = sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  if (isErr(replayed)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`,
    };
  }
  const projection = replayed.value;
  const nodeView = projection.nodes.get(nodeKey({ graph, id: node }));
  const nodeSessions = [...projection.sessions.values()].filter(
    (session) => session.node.graph === graph && session.node.id === node,
  );
  const latest = nodeSessions[nodeSessions.length - 1];

  const requestedSessionId = sessionOverrideFrom(args);
  if (requestedSessionId !== undefined) {
    const requested = nodeSessions.find(
      (session) => session.session === requestedSessionId,
    );
    if (requested === undefined) {
      return {
        exitCode: 1,
        message: `${graph}/${node}: no session "${requestedSessionId}" recorded for this node.`,
      };
    }
    const message = await renderSessionView(
      repoRoot,
      graph,
      node,
      requested,
      nodeView,
      requested.session === latest?.session,
      hasBecauseFlag(args),
    );
    return { exitCode: 0, message };
  }

  if (latest === undefined) {
    return {
      exitCode: 0,
      message: `${graph}/${node}: no session recorded for this node.`,
    };
  }
  const message = await renderSessionView(
    repoRoot,
    graph,
    node,
    latest,
    nodeView,
    true,
    hasBecauseFlag(args),
  );
  return { exitCode: 0, message };
}
