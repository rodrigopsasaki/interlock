import { isErr } from "@phyxiusjs/fp";
import type { Item, ItemKind, ItemStanding } from "debrief";
import { findRepoRoot, sharedJournalDirectory } from "face";
import { type Gap, nodeKey, readRawEvents, readReplay } from "ledger";
import { HARNESS_AUTHORITIES } from "runner";
import { type EvidenceSession, evidenceOf, personEventsFor } from "substrate";
import { explainVerifyRefusal, verifyDebrief } from "verifier";
import { stringify } from "yaml";
import type { CommandResult } from "./main.ts";

const USAGE =
  'interlock evidence: expected a graph id and a node id, e.g. "interlock evidence 0001-bootstrap verifier-hunks".';

const KIND_ORDER: readonly ItemKind[] = [
  "convention",
  "discipline",
  "decision",
  "risk",
  "value",
  "tension",
  "absence",
];
const STANDING_ORDER: readonly ItemStanding[] = ["ratified", "professed", "observed", "hypothesis"];

function sessionOverrideFrom(args: readonly string[]): string | undefined {
  const flagIndex = args.indexOf("--session");
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

function countKey(item: Item): string {
  return `${item.kind}/${item.standing ?? "unspecified"}`;
}

function renderHeader(items: readonly Item[], gaps: number, unrootedExcluded: number): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = countKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const known = new Set(
    KIND_ORDER.flatMap((kind) => STANDING_ORDER.map((standing) => `${kind}/${standing}`)),
  );
  const ordered = [
    ...KIND_ORDER.flatMap((kind) => STANDING_ORDER.map((standing) => `${kind}/${standing}`)),
    ...[...counts.keys()].filter((key) => !known.has(key)).sort(),
  ].filter((key) => counts.has(key));
  const breakdown = ordered.map((key) => `${key} ${counts.get(key)}`).join(", ");
  return (
    `items ${items.length}${breakdown === "" ? "" : ` (${breakdown})`}, ` +
    `gaps ${gaps}, unrooted excluded ${unrootedExcluded}`
  );
}

export async function runInterlockEvidence(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return { exitCode: 1, message: USAGE };
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

  const targetNode = { graph, id: node };
  const nodeView = projection.nodes.get(nodeKey(targetNode));
  const nodeSessions = [...projection.sessions.values()].filter(
    (session) => session.node.graph === graph && session.node.id === node,
  );
  const latest = nodeSessions[nodeSessions.length - 1];
  const requestedSessionId = sessionOverrideFrom(args);
  const sessionView =
    requestedSessionId === undefined
      ? latest
      : nodeSessions.find((session) => session.session === requestedSessionId);

  if (requestedSessionId !== undefined && sessionView === undefined) {
    return {
      exitCode: 0,
      message: `${graph}/${node}: no session "${requestedSessionId}" recorded for this node.`,
    };
  }

  if (sessionView?.debrief === undefined || nodeView?.outcome === undefined) {
    return {
      exitCode: 0,
      message: `${graph}/${node}: no judged session recorded for this node.`,
    };
  }
  const debrief = sessionView.debrief;

  const verified = await verifyDebrief(repoRoot, debrief);
  const decisions: EvidenceSession["decisions"] = isErr(verified)
    ? debrief.decisions.map((decision) => ({ decision, marks: [] }))
    : verified.value.decisionMarks;
  const discoveries: EvidenceSession["discoveries"] = isErr(verified)
    ? []
    : verified.value.discoveryMarks;
  const vocabularyGaps: readonly Gap[] = isErr(verified)
    ? []
    : verified.value.marks.filter((mark) => mark.kind === "gap").map((mark) => mark.gap);
  const unrootedExcluded = isErr(verified)
    ? 0
    : [
        ...decisions.flatMap((entry) => entry.marks),
        ...discoveries.map((entry) => entry.mark),
      ].filter((mark) => mark.kind === "unrooted").length;

  const rawEvents = await readRawEvents(journal);
  const personEvents = isErr(rawEvents) ? [] : personEventsFor(targetNode, rawEvents.value);

  const evidence = evidenceOf({
    derivation: debrief.derivation,
    decisions,
    discoveries,
    receipts: nodeView.receipts,
    personEvents,
    harnessAuthorities: HARNESS_AUTHORITIES,
  });
  const gaps: readonly Gap[] = [...vocabularyGaps, ...evidence.gaps];

  const verifyNote = isErr(verified)
    ? `\n# marks unavailable: ${explainVerifyRefusal(verified.error)}`
    : "";

  return {
    exitCode: 0,
    message: `${renderHeader(evidence.items, gaps.length, unrootedExcluded)}${verifyNote}\n${stringify(evidence.items)}`,
  };
}
