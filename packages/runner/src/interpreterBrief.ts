export interface InterpreterCorrection {
  readonly reason: string;
  readonly previousGraphYaml: string;
}

const IMMUTABLE_SENTENCE =
  "This brief is immutable once your session starts. If it is wrong, say so in the debrief; " +
  "do not edit it.";

function correctedFromSection(correction: InterpreterCorrection): readonly string[] {
  return [
    "## Corrected from",
    "",
    "The graph this ask produced last time was not approved. It follows verbatim; treat it as",
    "a starting point to correct, not as a shape to preserve where the reason above calls for a",
    "different one.",
    "",
    "```yaml",
    correction.previousGraphYaml.replace(/\n+$/, ""),
    "```",
    "",
  ];
}

export function interpreterBriefBody(
  graph: string,
  node: string,
  ask: string,
  correction?: InterpreterCorrection,
): string {
  const lines: string[] = [`# Brief · node \`${node}\` · graph \`${graph}\``, ""];

  if (correction === undefined) {
    lines.push(IMMUTABLE_SENTENCE, "");
  } else {
    lines.push(correction.reason, "", IMMUTABLE_SENTENCE, "");
  }

  lines.push("## Ask", "", `> ${ask}`, "", "## Context slice", "", "");

  if (correction !== undefined) {
    lines.push(...correctedFromSection(correction));
  }

  lines.push(
    "## Read first",
    "",
    "1. `docs/shapes.md`, the graph@v0 section: its fields and a worked example.",
    "2. Every file under `.interlock/graphs/`: real, cleared graphs as the corpus of what a",
    "   well-shaped one looks like -- an ask, a derivation, a read, a human `approved` gate,",
    "   nodes whose acceptance is a sentence a gate can judge, gates that pair an exit code with",
    "   an `expect_output`.",
    "",
    "## What you produce",
    "",
    `- \`.interlock/graphs/${graph}.yaml\`, a \`graph@v0\` document: \`id: ${graph}\`, the \`ask\``,
    "  field carrying the request above verbatim, a `derivation` naming this session, and a",
    "  `read` paragraph explaining how you decomposed it.",
    "- Nodes small enough that losing one costs one node's worth of redone work; every node's",
    "  `acceptance` is a sentence a gate can judge pass or fail, not a description of intent.",
    "- Every gate pairs a command's exit code with, where the acceptance calls for it, an",
    "  `expect_output` pattern; a graph-level `approved` gate of kind `human` is required and is",
    "  the only human gate unless the ask itself names another decision only a person can make.",
    "- You never lease or run a node of the graph you produce; that is a separate, later act by a",
    "  person.",
    "",
    "## Deliverable",
    "",
    `1. \`.interlock/graphs/${graph}.yaml\`, loading cleanly against the graph loader and its`,
    "   schema.",
    "2. `notes.yaml` beside this brief, committed as you go.",
    "3. `debrief.yaml` beside this brief as your final commit.",
    "",
    "When the debrief is committed, stop and wait.",
    "",
  );

  return lines.join("\n");
}
