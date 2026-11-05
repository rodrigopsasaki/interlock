import type { Walk } from "ledger";
import type { RoleShape } from "./roleShape.ts";

const START = "<!-- interlock: role-walk@v0:start -->";
const END = "<!-- interlock: role-walk@v0:end -->";

function openSentence(address: string): string {
  return (
    "The walk is a starting point, never a fence: the whole substrate is open to this session " +
    `through its address ${address}, so any role may walk anywhere it wants.`
  );
}

function walkLines(walk: Walk): readonly string[] {
  if (walk.kind === "none") {
    return [
      `This walk is empty: ${walk.because}. Nothing here errors; the session runs without a substrate.`,
      "When an address is set, the whole substrate is open to the session through it, and any role may walk anywhere it wants.",
    ];
  }
  if (walk.steps.length === 0) {
    return ["This role's walk names nothing to ask first.", "", openSentence(walk.address)];
  }
  return [
    `Ask the substrate at ${walk.address} these first, by verb:`,
    "",
    ...walk.steps.map((step, index) => `${index + 1}. ${step.verb}: ${step.ask}`),
    "",
    openSentence(walk.address),
  ];
}

export function renderWalkSection(shape: RoleShape): string {
  return [START, "## Walk", "", `Role: ${shape.role}.`, "", ...walkLines(shape.walk), END].join(
    "\n",
  );
}

export function withWalkSection(body: string, shape: RoleShape): string {
  const section = renderWalkSection(shape);
  const start = body.indexOf(START);
  const end = start === -1 ? -1 : body.indexOf(END, start);
  if (start !== -1 && end !== -1) {
    return `${body.slice(0, start)}${section}${body.slice(end + END.length)}`;
  }
  const separator = body === "" || body.endsWith("\n\n") ? "" : "\n";
  return `${body}${separator}${section}\n`;
}
