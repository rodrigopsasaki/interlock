import { isOk } from "@phyxiusjs/fp";
import { readDebriefDocument } from "debrief";
import { derivation, mark } from "ledger";
import { evidenceOf, toWireDebrief } from "substrate";
import { describe, expect, it } from "vitest";
import {
  debriefAuthoringGuidance,
  pathAppliesToExample,
  repositoryAppliesToExample,
  withDebriefAuthoringGuidance,
} from "../src/debriefAuthoringGuidance.ts";
import { interpreterBriefBody } from "../src/interpreterBrief.ts";

const SHA = "a".repeat(40);
const verifier = derivation.gate("verifier-hunks", "verifier@0", "test");

function decisionFromExample(example: string) {
  const read = readDebriefDocument(
    [
      "interlock: debrief@v2",
      "graph: g",
      "node: n",
      "role: worker",
      `graph_base_sha: ${SHA}`,
      `session_start_sha: ${SHA}`,
      `head_sha: ${SHA}`,
      "derivation:",
      "  kind: agent",
      "  runtime: codex",
      "  model: gpt-5.6-terra",
      "discoveries: []",
      "decisions:",
      "  - id: c1",
      "    what: Keep support distinct from usefulness.",
      "    because: The author names applicability separately.",
      "    rests_on: [notes:choice]",
      "    hunks: [notes.yaml]",
      `    ${example}`,
      "gates_run_by_agent: []",
      "open: []",
      "",
    ].join("\n"),
    "example.yaml",
  );
  if (!isOk(read) || read.value.kind !== "v2") throw new Error("expected a valid debrief example");
  const decision = read.value.debrief.decisions[0];
  if (decision === undefined) throw new Error("expected the example decision");
  return { debrief: read.value.debrief, decision };
}

describe("debrief authoring guidance", () => {
  it("shows separate reader-valid path and repository alternatives without making either required", () => {
    expect(debriefAuthoringGuidance).toContain(pathAppliesToExample);
    expect(debriefAuthoringGuidance).toContain(repositoryAppliesToExample);
    expect(debriefAuthoringGuidance).toContain("Omit `applies_to` when no target is warranted");
    expect(debriefAuthoringGuidance).toContain("never supplies support or ratifies a claim");
    expect(decisionFromExample(pathAppliesToExample).decision.appliesTo).toEqual({
      kind: "path",
      path: "packages/substrate/src/evidence.ts",
    });
    expect(decisionFromExample(repositoryAppliesToExample).decision.appliesTo).toEqual({
      kind: "repository",
    });
  });

  it("is present once in interpreter briefs while retaining received context and correction bytes", () => {
    const context = "### Decision\n\n- [hypothesis] Check this\n  derivation: human:Pat";
    const previousGraphYaml = "interlock: graph@v0\nid: old\n";
    const body = interpreterBriefBody("g", "plan/g", "Plan this.", context, {
      reason: "The prior graph needs correction.",
      previousGraphYaml,
    });
    expect(body.match(/^## Debrief authoring$/gm)).toHaveLength(1);
    expect(body).toContain(context);
    expect(body).toContain(previousGraphYaml);
  });

  it("preserves authored matching headings and quoted marker pairs in fences, then is idempotent", () => {
    const authored = [
      "# Brief",
      "",
      "## Debrief authoring",
      "",
      "This heading belongs to the author.",
      "",
      "```md",
      "## Debrief authoring",
      "This fenced heading also belongs to the author.",
      "```",
      "",
      "```md",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "````",
      "",
      "```md",
      "``` not a close",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted backtick-fence marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "```",
      "",
      "~~~md",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted tilde-fence marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "~~~~",
      "",
      "~~~md",
      "~~~ not a close",
      "<!-- interlock: debrief-authoring-guidance@v1:start -->",
      "quoted tilde-fence marker pair remains authored",
      "<!-- interlock: debrief-authoring-guidance@v1:end -->",
      "~~~",
      "",
      "## Context slice",
      "",
      "received exactly",
      "",
    ].join("\n");
    const first = withDebriefAuthoringGuidance(authored);
    const second = withDebriefAuthoringGuidance(first);
    expect(first.startsWith(authored)).toBe(true);
    expect(second).toBe(first);
    expect(second.match(/^## Debrief authoring$/gm)).toHaveLength(3);
    expect(second.match(/debrief-authoring-guidance@v1:start/g)).toHaveLength(5);
    expect(second).toContain("## Context slice\n\nreceived exactly");
  });

  it("uses rooted evidence for applicability translation, retains omitted support scope, and excludes unrooted claims", () => {
    const { debrief, decision } = decisionFromExample(pathAppliesToExample);
    expect(toWireDebrief(debrief).decisions[0]?.applies_to).toEqual(decision.appliesTo);

    const base = {
      derivation: debrief.derivation,
      discoveries: [],
      receipts: [],
      personEvents: [],
      harnessAuthorities: new Set<string>(),
    };
    const rooted = evidenceOf({
      ...base,
      decisions: [{ decision, marks: [mark.rooted(verifier, "notes.yaml")] }],
    });
    expect(rooted.items[0]?.scope).toEqual({
      kind: "path",
      path: "packages/substrate/src/evidence.ts",
    });

    const { appliesTo: _omitted, ...withoutApplicability } = decision;
    const omitted = evidenceOf({
      ...base,
      decisions: [{ decision: withoutApplicability, marks: [mark.rooted(verifier, "notes.yaml")] }],
    });
    expect(omitted.items[0]?.scope).toEqual({ kind: "path", path: "notes.yaml" });

    const unrooted = evidenceOf({
      ...base,
      decisions: [{ decision, marks: [mark.unrooted(verifier, "support is unavailable")] }],
    });
    expect(unrooted.items).toEqual([]);
  });
});
